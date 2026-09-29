import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { queryKeys } from '@/api/queryKeys';
import { abandonRtc, getRtcStatus, prepareRtc, registerRtc, type RecordedAction } from './rtc';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { audioFocus } from '@/features/voice';
import { env as defaultEnv, type Env } from '@/lib/env';
import { resolveCallingConfig } from './config';
import { callReducer, initialCallState, type CallState } from './lib/callMachine';
import { transcriptReducer, type TranscriptEntry } from './lib/transcript';
import { createVapiProvider } from './providers/vapiProvider';
import { callError, type CallError, type CallProvider, type CreateCallProvider, type Unsubscribe } from './types';

/** Give up on a call that never connects, and never wait forever for a hang-up to confirm. */
const CONNECT_TIMEOUT_MS = 30_000;
const END_TIMEOUT_MS = 5_000;

export interface CallContextValue {
  state: CallState;
  /** Live browser view; committed messages are saved by server callbacks. */
  transcript: TranscriptEntry[];
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
  const [currentCallId, setCurrentCallId] = useState('');
  const [state, dispatch] = useReducer(callReducer, initialCallState);
  const syncSessionId = state.status === 'idle' || state.status === 'error' ? sessionId : callSessionId || sessionId;
  const rtc = useQuery({
    queryKey: ['rtc', syncSessionId],
    queryFn: () => getRtcStatus(syncSessionId),
    enabled: persistent && Boolean(syncSessionId),
    refetchInterval: 4000,
    retry: 1,
  });
  useEffect(() => {
    if (!persistent || !syncSessionId || !rtc.data) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages(syncSessionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
  }, [rtc.data, persistent, syncSessionId, queryClient]); // refresh when server state changes
  const prepare = useCallback(async () => {
    const prepared = await prepareRtc(sessionId);
    setCallSessionId(prepared.session_id);
    setCurrentCallId(prepared.id);
    void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    if (!sessionId) navigate(`/c/${prepared.session_id}`);
    return prepared;
  }, [sessionId, navigate, queryClient]);
  const [transcript, dispatchTranscript] = useReducer(transcriptReducer, []);
  const providerRef = useRef<CallProvider | null>(null);
  const unsubscribeRef = useRef<Unsubscribe[]>([]);
  const levelRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configResult = useMemo(() => resolveCallingConfig(env.vapi), [env.vapi]);
  const enabled = env.features.calling;

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
      dispatchTranscript({ type: 'clear' });
      release();
    }, END_TIMEOUT_MS);
    void provider.end().catch(() => {});
  }, [release]);

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

    setCurrentCallId('');
    dispatchTranscript({ type: 'clear' });
    dispatch({ type: 'START' });
    const provider = createProvider({ ...configResult.config,
      ...(persistent ? { prepare, abandon: abandonRtc, register: registerRtc } : {}),
    });
    providerRef.current = provider;

    const fail = (error: CallError) => {
      if (providerRef.current !== provider) return;
      dispatch({ type: 'FAIL', error });
      dispatchTranscript({ type: 'clear' });
      release();
    };

    unsubscribeRef.current = [
      provider.onStateChange((providerState) => {
        if (providerRef.current !== provider) return;
        if (providerState === 'active') {
          clearTimer();
          dispatch({ type: 'CONNECTED', at: Date.now() });
        } else if (providerState === 'ended' || providerState === 'completed') {
          dispatch({ type: 'ENDED', completed: providerState === 'completed' });
          dispatchTranscript({ type: 'clear' });
          release();
        }
      }),
      provider.onTranscript((update) => {
        if (providerRef.current === provider) dispatchTranscript({ type: 'update', update });
      }),
      provider.onError(fail),
      ...(provider.onVolume ? [provider.onVolume((level) => (levelRef.current = level))] : []),
    ];

    timerRef.current = setTimeout(() => {
      if (providerRef.current !== provider || provider.isActive()) return;
      void provider.end().catch(() => {});
      fail(callError('connection-failed'));
    }, CONNECT_TIMEOUT_MS);

    // Anything that isn't a CallError is a client-side fault, not a connection problem.
    provider.start().catch((error: unknown) => fail(isCallError(error) ? error : callError('provider-error')));
  }, [configResult, createProvider, end, focusId, release, persistent, prepare]);

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
      enabled,
      persistence: !persistent ? 'Preview call: transcript is not saved.' : rtc.isError
        ? 'Could not check transcript saving.' : rtc.data?.calls.some((c) => c.id === currentCallId && c.saved_messages > 0)
          ? 'Conversation saved to chat.' : 'Waiting for transcript to save…',
      actions: syncSessionId === sessionId ? rtc.data?.actions ?? [] : [],
      summaries: syncSessionId === sessionId ? rtc.data?.calls.map((c) => c.summary).filter(Boolean) ?? [] : [],
      refreshActions: () => { void rtc.refetch(); },
      missingConfig: configResult.ok ? [] : configResult.missing,
      start,
      end,
      dismiss,
      getLevel,
    }),
    [state, transcript, enabled, configResult, start, end, dismiss, getLevel, persistent, rtc, syncSessionId, sessionId, currentCallId],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
