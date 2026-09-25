import type { CallError, CallingConfig, CallProvider, CreateCallProvider, TranscriptUpdate } from '../types';
import { createProviderEvents } from './emitter';

/**
 * MOCK call provider for automated tests — no network, no microphone, no Vapi account.
 * Each call is controllable from the test (connect, speak, fail, drop).
 */
export interface MockCall {
  provider: CallProvider;
  config: CallingConfig;
  startCalls: number;
  endCalls: number;
  disposed: boolean;
  /** The provider reports the call as connected. */
  connect(): void;
  transcript(update: TranscriptUpdate): void;
  /** A mid-call provider error (the provider then ends the call). */
  fail(error: CallError): void;
  /** The remote side ends the call without a hang-up. */
  drop(): void;
  /** The remote side finishes the call normally (e.g. the assistant says goodbye). */
  hangUp(): void;
  volume(level: number): void;
}

export interface MockCallOptions {
  /** start() rejects with this error. */
  startError?: CallError;
  /** Connect automatically when started (default false: the test calls connect()). */
  autoConnect?: boolean;
}

export function createMockCallFactory(options: MockCallOptions = {}) {
  const calls: MockCall[] = [];

  const create: CreateCallProvider = (config) => {
    const events = createProviderEvents();
    let active = false;
    let ended = false;
    const finish = (state: 'ended' | 'completed' = 'ended') => {
      if (ended) return;
      ended = true;
      active = false;
      events.emitState(state);
    };

    const call: MockCall = {
      config,
      startCalls: 0,
      endCalls: 0,
      disposed: false,
      provider: {
        async start() {
          call.startCalls += 1;
          events.emitState('connecting');
          if (options.startError) throw options.startError;
          if (options.autoConnect) call.connect();
        },
        async end() {
          call.endCalls += 1;
          finish();
        },
        isActive: () => active,
        onStateChange: events.onStateChange,
        onTranscript: events.onTranscript,
        onError: events.onError,
        onVolume: events.onVolume,
        dispose() {
          call.disposed = true;
          events.clear();
        },
      },
      connect() {
        active = true;
        events.emitState('active');
      },
      transcript: (update) => events.emitTranscript(update),
      fail(error) {
        events.emitError(error);
        finish();
      },
      drop: () => finish(),
      hangUp: () => finish('completed'),
      volume: (level) => events.emitVolume(level),
    };
    calls.push(call);
    return call.provider;
  };

  return { create, calls, get last() { return calls.at(-1); } };
}
