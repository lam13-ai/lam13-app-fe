import type Vapi from '@vapi-ai/web';
import { callError, type CallingConfig, type CallProvider, type CallRole } from '../types';
import { createProviderEvents } from './emitter';

/**
 * Vapi Web SDK behind the provider-neutral CallProvider interface. This file is the only place that
 * knows Vapi's event names and payloads. Uses the PUBLIC key only; the SDK is loaded on first call.
 */

/** SDK `error` events that don't end the call (e.g. noise-cancellation setup). */
const NON_FATAL_ERROR_TYPES = new Set(['audio-processing-setup-error', 'local-audio-level-observer-error']);

interface VapiTranscriptMessage {
  type: 'transcript';
  role: CallRole;
  transcriptType?: 'partial' | 'final';
  transcript: string;
}

function isTranscript(message: unknown): message is VapiTranscriptMessage {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Partial<VapiTranscriptMessage>;
  return m.type === 'transcript' && typeof m.transcript === 'string' && (m.role === 'user' || m.role === 'assistant');
}

type VapiConstructor = new (publicKey: string) => Vapi;

/**
 * The SDK ships as CommonJS. Depending on the bundler's interop, `import()` yields the class as
 * `mod.default` (production build) or wraps it again as `mod.default.default` (Vite dev optimizer).
 */
export function resolveVapiClass(mod: unknown): VapiConstructor | null {
  const outer = (mod as { default?: unknown } | null)?.default;
  const candidate = (outer as { default?: unknown } | null)?.default ?? outer;
  return typeof candidate === 'function' ? (candidate as VapiConstructor) : null;
}

/** Dev-only diagnostics. Logs the error kind and message with the call config scrubbed — never env or credentials. */
function logDev(stage: string, error: unknown, config: CallingConfig) {
  if (!import.meta.env.DEV) return;
  const name = error instanceof Error ? error.name : typeof error;
  let message = error instanceof Error ? error.message : typeof error === 'object' && error !== null ? String((error as { type?: unknown }).type ?? '') : '';
  for (const secret of [config.publicKey, config.assistantId]) if (secret) message = message.split(secret).join('[redacted]');
  console.warn(`[calling] ${stage}: ${name}${message ? ` — ${message}` : ''}`);
}

/** Vapi `status-update` → `ended` carries why the call ended (e.g. `assistant-ended-call`). */
function endedReasonOf(message: unknown): string | undefined {
  const m = message as { type?: unknown; status?: unknown; endedReason?: unknown } | null;
  return m?.type === 'status-update' && m.status === 'ended' && typeof m.endedReason === 'string' ? m.endedReason : undefined;
}

/** Vapi ended reasons that mean something broke (`pipeline-error-…`, `call.in-progress.error-…`, `…-failed`). */
const isFailureReason = (reason: string) => /error|fail|fault/i.test(reason);

/**
 * Daily's fatal "ejected / Meeting has ended" error: the server closed the room. Vapi does this whenever
 * a call ends on its side, including an assistant's normal goodbye.
 */
function isMeetingEnded(error: unknown): boolean {
  const e = error as { type?: unknown; error?: { error?: { type?: unknown }; errorMsg?: unknown; message?: unknown } } | null;
  if (e?.type !== 'daily-error') return false;
  const detail = e.error;
  // The fatal-error type decides: `ejected` is the server closing the room. Others share the "Meeting
  // has ended" text but are failures (e.g. `no-room` after a network drop), so text only counts when
  // no type is given.
  const type = detail?.error?.type;
  if (type !== undefined) return type === 'ejected';
  return [detail?.errorMsg, detail?.message].some((text) => typeof text === 'string' && /meeting has ended/i.test(text));
}

function microphoneErrorCode(error: unknown) {
  const name = typeof error === 'object' && error !== null ? (error as { name?: string }).name : undefined;
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'permission-denied' : 'unsupported';
}

export function createVapiProvider(config: CallingConfig): CallProvider {
  const events = createProviderEvents();
  let vapi: Vapi | null = null;
  let active = false;
  let starting = false;
  let startFailed = false;
  let finished = false;
  let hangingUp = false;
  /** Latest reason Vapi reported for the call ending, if any. */
  let endedReason: string | undefined;

  /** Terminal: report the end once and drop the SDK instance. */
  const finish = (state: 'ended' | 'completed' = 'ended') => {
    if (finished) return;
    finished = true;
    active = false;
    vapi?.removeAllListeners();
    vapi = null;
    events.emitState(state);
  };

  /**
   * The call ended on Vapi's side. It's a normal completion (assistant goodbye, end-call tool/phrase…)
   * unless Vapi reported a failure reason; connection-phase endings stay failures.
   */
  const remoteEnd = () => {
    if (active && endedReason && isFailureReason(endedReason)) {
      events.emitError(callError('call-failed'));
      finish();
      return;
    }
    finish(active ? 'completed' : 'ended');
  };

  const stopInstance = async (instance: Vapi) => {
    try {
      await instance.stop(); // destroys the Daily call object → releases the microphone
    } catch {
      // already stopped
    }
  };

  return {
    async start() {
      const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
      if (!media?.getUserMedia || globalThis.isSecureContext === false) throw callError('unsupported');
      events.emitState('connecting');

      // Preflight: ask for the microphone explicitly so a denial is reported clearly. Released at once —
      // the SDK opens its own track.
      try {
        const probe = await media.getUserMedia({ audio: true });
        probe.getTracks().forEach((track) => track.stop());
      } catch (error) {
        throw callError(microphoneErrorCode(error));
      }
      if (finished) return; // hung up while the permission prompt was open

      // SDK load/initialisation failures are client runtime faults, reported as such — not as a
      // connection problem.
      let instance: Vapi;
      try {
        const VapiClass = resolveVapiClass(await import('@vapi-ai/web'));
        if (!VapiClass) throw new TypeError('Vapi SDK export is not a constructor');
        if (finished) return;
        instance = new VapiClass(config.publicKey);
      } catch (error) {
        logDev('SDK initialisation failed', error, config);
        throw callError('provider-error');
      }
      vapi = instance;
      instance.on('call-start', () => {
        active = true;
        events.emitState('active');
      });
      instance.on('call-end', () => (hangingUp ? finish() : remoteEnd()));
      instance.on('message', (message: unknown) => {
        endedReason = endedReasonOf(message) ?? endedReason;
        if (!isTranscript(message)) return;
        events.emitTranscript({ role: message.role, text: message.transcript, final: message.transcriptType !== 'partial' });
      });
      instance.on('volume-level', (level: number) => events.emitVolume(Math.max(0, Math.min(1, level))));
      instance.on('error', (error: unknown) => {
        const type = typeof error === 'object' && error !== null ? (error as { type?: string }).type : undefined;
        if (type && NON_FATAL_ERROR_TYPES.has(type)) return;
        if (hangingUp) return; // our own hang-up tearing the call down
        // Vapi closing the room (Daily ejection), or any error after Vapi reported the end, is the call
        // ending on Vapi's side: classified by the ended reason, not reported as a transport error.
        if (active && (isMeetingEnded(error) || endedReason)) {
          void stopInstance(instance).then(remoteEnd);
          return;
        }
        logDev(active ? 'call error' : 'connect error', error, config);
        if (starting) {
          startFailed = true; // reported by start() below
          return;
        }
        // Raw provider details stay internal; the UI gets a display-safe error.
        events.emitError(callError(active ? 'call-failed' : 'connection-failed'));
        hangingUp = true; // the teardown below is ours, not a normal completion
        void stopInstance(instance).then(() => finish());
      });

      starting = true;
      let call: unknown;
      try {
        call = await instance.start(config.assistantId);
      } catch (error) {
        logDev('start rejected', error, config);
        call = null;
      } finally {
        starting = false;
      }

      if (finished) {
        await stopInstance(instance);
        return;
      }
      if (!call || startFailed) {
        instance.removeAllListeners();
        vapi = null;
        await stopInstance(instance);
        throw callError('connection-failed');
      }
    },

    async end() {
      hangingUp = true;
      const instance = vapi;
      if (instance) await stopInstance(instance);
      finish();
    },

    isActive: () => active,
    onStateChange: events.onStateChange,
    onTranscript: events.onTranscript,
    onError: events.onError,
    onVolume: events.onVolume,

    dispose() {
      events.clear();
      const instance = vapi;
      finished = true;
      active = false;
      vapi = null;
      if (instance) {
        instance.removeAllListeners();
        void stopInstance(instance);
      }
    },
  };
}
