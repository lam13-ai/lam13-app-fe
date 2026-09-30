import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { queryKeys } from '@/api/queryKeys';
import { abandonRtc, getRtcStatus, prepareRtc, registerRtc, type RecordedAction, type RtcStatus } from './rtc';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { audioFocus } from '@/features/voice';
import { env as defaultEnv, type Env } from '@/lib/env';
import { resolveCallingConfig } from './config';
import { callReducer, initialCallState, isInCall, type CallState } from './lib/callMachine';
import { transcriptReducer, type TranscriptEntry } from './lib/transcript';
import { createVapiProvider } from './providers/vapiProvider';
import { callError, type CallError, type CallProvider, type CreateCallProvider, type Unsubscribe } from './types';

/** Give up on a call that never connects, and never wait forever for a hang-up to confirm. */
const CONNECT_TIMEOUT_MS = 60_000;
const END_TIMEOUT_MS = 5_000;
/** After a saved call ends, how long to wait for the server to finalize it before reloading the chat anyway. */
const SAVE_TIMEOUT_MS = 15_000;
const RTC_POLL_MS = 4_000;

/** Server-side voice work still in flight: a call not yet saved, or a handoff queued/running. */
export function rtcBusy(data: RtcStatus | undefined): boolean {
  return Boolean(data && (
    data.calls.some((c) => c.status === 'prepared' || c.status === 'active' || (c.status === 'ended' && !c.finalized)) ||
    data.actions.some((a) => a.status === 'queued' || a.status === 'running')));
}

export interface CallContextValue {
  state: CallState;
  /**
   * Live browser view of the current call — the only place its turns show while it runs. Server callbacks
   * save them to the conversation; the chat reloads once the call is over (see `saving`).
   */
  transcript: TranscriptEntry[];
  /** The call ended and its conversation is being saved: the panel stays until the chat shows it. */
  saving: boolean;
  enabled: boolean;
  persistence: string;
  actions: RecordedAction[];
  summaries: string[];
  refreshActions: () => void;
  /** Missing public configuration variable NAMES (empty when configured). */
  missingConfig: string[];
  start: () => void;
  end: () => void;
  /** Leave the error state. */
  dismiss: () => void;
  /** Assistant output level 0..1 for the level meter (read without re-rendering). */
  getLevel: () => number;
}

const CallContext = createContext<CallContextValue | null>(null);

/** Optional app-level overrides (tests inject a mock provider and config). */
export interface CallingDeps {
  createProvider?: CreateCallProvider;
  env?: Pick<Env, 'vapi' | 'features'>;
}
const CallingDepsContext = createContext<CallingDeps>({});

export function CallingDepsProvider({ value, children }: { value: CallingDeps; children: ReactNode }) {
  return <CallingDepsContext.Provider value={value}>{children}</CallingDepsContext.Provider>;
}

export function useCall(): CallContextValue {
  const value = useContext(CallContext);
  if (!value) throw new Error('useCall must be used inside <CallingProvider>');
  return value;
}

function isCallError(value: unknown): value is CallError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

export interface CallingProviderProps {
  children: ReactNode;
  /** Provider factory (tests inject a mock; defaults to Vapi). */
  createProvider?: CreateCallProvider;
  env?: Pick<Env, 'vapi' | 'features'>;
}

/**
 * App-level voice-call session. Owns the call state machine, the live transcript and the provider
 * instance, and coordinates the microphone with voice notes through the shared audio focus:
 * a call cannot start while a voice note is recording, and recording is refused during a call.
 */
export function CallingProvider({ children, ...props }: CallingProviderProps) {
  const deps = useContext(CallingDepsContext);
  const createProvider = props.createProvider ?? deps.createProvider ?? createVapiProvider;
  const env = props.env ?? deps.env ?? defaultEnv;
  const focusId = useId();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionId = /^\/c\/([^/]+)$/.exec(location.pathname)?.[1] ?? '';
  const persistent = createProvider === createVapiProvider && defaultEnv.apiMode === 'http';
  const [callSessionId, setCallSessionId] = useState('');
  // The server's record of the current call (set by `prepare`; read from provider callbacks, hence a ref).
  const callRef = useRef<{ id: string; sessionId: string } | null>(null);
  // An ended, saved call whose conversation the chat hasn't reloaded yet.
  const [saving, setSaving] = useState<{ id: string; sessionId: string } | null>(null);
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const [transcript, dispatchTranscript] = useReducer(transcriptReducer, []);
  const inCall = isInCall(state);
  const syncSessionId = saving?.sessionId ?? (inCall ? callSessionId || sessionId : sessionId);
  const rtc = useQuery({
    queryKey: ['rtc', syncSessionId],
    queryFn: () => getRtcStatus(syncSessionId),
    enabled: persistent && Boolean(syncSessionId),
    // Only while there is voice work; an idle thread is fetched once (and on focus).
    refetchInterval: (query) => (inCall || saving || rtcBusy(query.state.data) ? RTC_POLL_MS : false),
    retry: 1,
  });
  useEffect(() => {
    if (!persistent || !syncSessionId || !rtc.data) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    // A running (or just-ended) call's turns show only in the call panel: the chat behind it stays as it
    // was, and reloads once the call is saved (finishSaving) — never two live copies.
    if (inCall || saving) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages(syncSessionId) });
  }, [rtc.data, persistent, syncSessionId, queryClient, inCall, saving]); // refresh when server state changes

  /** Shows the saved conversation in the chat (one reload of the server's copy), then closes the panel. */
  const finishingRef = useRef<object | null>(null);
  const finishSaving = useCallback(
    (call: { id: string; sessionId: string }) => {
      if (finishingRef.current === call) return; // finalized and timed out: finish once
      finishingRef.current = call;
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(call.sessionId) }).finally(() => {
        setSaving((current) => (current === call ? null : current));
        dispatchTranscript({ type: 'clear' });
      });
    },
    [queryClient],
  );
  // Finish when the server has finalized this call (its last turns included), or after a timeout.
  useEffect(() => {
    if (saving && rtc.data?.calls.some((c) => c.id === saving.id && c.finalized)) finishSaving(saving);
  }, [saving, rtc.data, finishSaving]);
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => finishSaving(saving), SAVE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [saving, finishSaving]);

  const prepare = useCallback(async () => {
    const prepared = await prepareRtc(sessionId);
    setCallSessionId(prepared.session_id);
    callRef.current = { id: prepared.id, sessionId: prepared.session_id };
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    if (!sessionId) navigate(`/c/${prepared.session_id}`);
    return prepared;
  }, [sessionId, navigate, queryClient]);
  const providerRef = useRef<CallProvider | null>(null);
  const unsubscribeRef = useRef<Unsubscribe[]>([]);
  const levelRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configResult = useMemo(() => resolveCallingConfig(env.vapi), [env.vapi]);
  const enabled = env.features.calling;

  /**
   * The call is over. A saved call keeps its transcript in the panel while the conversation is saved;
   * otherwise (preview calls, calls that never reached the server) it is dropped at once.
   */
  const settle = useCallback(() => {
    const call = callRef.current;
    callRef.current = null;
    if (persistent && call) setSaving(call);
    else dispatchTranscript({ type: 'clear' });
  }, [persistent]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  /** Drops the provider, its listeners and audio focus. Safe to call repeatedly. */
  const release = useCallback(() => {
    clearTimer();
    unsubscribeRef.current.forEach((off) => off());
    unsubscribeRef.current = [];
    providerRef.current?.dispose();
    providerRef.current = null;
    levelRef.current = 0;
    audioFocus.release(focusId);
  }, [focusId]);

  const end = useCallback(() => {
    const provider = providerRef.current;
    if (!provider) return;
    dispatch({ type: 'END_REQUESTED' });
    clearTimer();
    timerRef.current = setTimeout(() => {
      // The provider never confirmed: treat the call as ended anyway.
      dispatch({ type: 'ENDED' });
      settle();
      release();
    }, END_TIMEOUT_MS);
    void provider.end().catch(() => {});
  }, [release, settle]);

  const start = useCallback(() => {
    if (providerRef.current) return; // one call at a time

    if (!configResult.ok) {
      dispatch({ type: 'START' });
      dispatch({ type: 'FAIL', error: callError('not-configured') });
      return;
    }
    // Voice notes and calls never share the microphone.
    if (audioFocus.active === 'recording' || !audioFocus.request({ id: focusId, kind: 'call', interrupt: end })) {
      dispatch({ type: 'START' });
      dispatch({ type: 'FAIL', error: callError('busy') });
      return;
    }

    callRef.current = null;
    setSaving(null);
    dispatchTranscript({ type: 'clear' });
    dispatch({ type: 'START' });
    const provider = createProvider({ ...configResult.config,
      ...(persistent ? { prepare, abandon: abandonRtc, register: registerRtc } : {}),
    });
    providerRef.current = provider;

    const fail = (error: CallError) => {
      if (providerRef.current !== provider) return;
      dispatch({ type: 'FAIL', error });
      settle();
      release();
    };

    const armStartTimeout = () => {
      clearTimer();
      timerRef.current = setTimeout(() => {
        if (providerRef.current !== provider || provider.isActive()) return;
        const stage = provider.getStartStage?.() ?? 'provider';
        console.warn(`[calling] connection timed out at ${stage} stage`);
        fail(callError(stage === 'microphone' ? 'permission-timeout'
          : stage === 'sdk' ? 'provider-error'
            : stage === 'preparation' ? 'preparation-failed' : 'connection-failed'));
      }, CONNECT_TIMEOUT_MS);
    };

    unsubscribeRef.current = [
      ...(provider.onMicrophoneReady ? [provider.onMicrophoneReady(() => {
        if (providerRef.current === provider) armStartTimeout();
      })] : []),
      provider.onStateChange((providerState) => {
        if (providerRef.current !== provider) return;
        if (providerState === 'active') {
          clearTimer();
          dispatch({ type: 'CONNECTED', at: Date.now() });
        } else if (providerState === 'ended' || providerState === 'completed') {
          dispatch({ type: 'ENDED', completed: providerState === 'completed' });
          settle();
          release();
        }
      }),
      provider.onTranscript((update) => {
        if (providerRef.current === provider) dispatchTranscript({ type: 'update', update });
      }),
      provider.onError(fail),
      ...(provider.onVolume ? [provider.onVolume((level) => (levelRef.current = level))] : []),
    ];

    // Give the browser prompt its own full timeout, then restart the clock after permission is granted.
    armStartTimeout();

    // Anything that isn't a CallError is a client-side fault, not a connection problem.
    provider.start().catch((error: unknown) => fail(isCallError(error) ? error : callError('provider-error')));
  }, [configResult, createProvider, end, focusId, release, persistent, prepare, settle]);

  const dismiss = useCallback(() => dispatch({ type: 'RESET' }), []);
  const getLevel = useCallback(() => levelRef.current, []);

  // Leaving the app (unmount) ends any call and releases the microphone.
  useEffect(
    () => () => {
      const provider = providerRef.current;
      if (provider) void provider.end().catch(() => {});
      release();
    },
    [release],
  );

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      transcript,
      saving: Boolean(saving),
      enabled,
      persistence: !persistent
        ? 'Preview call: transcript is not saved.'
        : rtc.isError
          ? 'Could not check transcript saving.'
          : 'Saved to this chat when the call ends.',
      actions: syncSessionId === sessionId ? rtc.data?.actions ?? [] : [],
      summaries: syncSessionId === sessionId ? rtc.data?.calls.map((c) => c.summary).filter(Boolean) ?? [] : [],
      refreshActions: () => { void rtc.refetch(); },
      missingConfig: configResult.ok ? [] : configResult.missing,
      start,
      end,
      dismiss,
      getLevel,
    }),
    [state, transcript, saving, enabled, configResult, start, end, dismiss, getLevel, persistent, rtc, syncSessionId, sessionId],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
