import { useCallback, useEffect, useId, useMemo, useReducer, useRef } from 'react';
import { isAbortError, toErrorInfo } from '@/api';
import { VOICE_CONFIG } from '../config';
import { audioFocus } from '../lib/audioFocus';
import { browserMediaDeps, createAudioRecorder, type AudioRecorder, type RecorderOptions } from '../lib/recorder';
import { initialRecorderState, recorderReducer, type RecorderState } from '../lib/recorderMachine';
import { VoiceRecorderError, type Recording, type VoiceError } from '../lib/types';

/** Uploads/sends a finished recording. Must honour `signal` (the user can cancel while sending). */
export type SendRecording = (recording: Recording, signal: AbortSignal) => Promise<void>;

export interface UseVoiceRecorderOptions {
  maxDurationMs?: number;
  /** Engine factory (tests inject fakes; defaults to the MediaRecorder engine). */
  createRecorder?: (options: RecorderOptions) => AudioRecorder;
}

export interface VoiceRecorderApi {
  state: RecorderState;
  maxDurationMs: number;
  canPause: boolean;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  /** Stop → preview. */
  stop: () => Promise<Recording | undefined>;
  /** Stop and send immediately (direct send). */
  stopAndSend: (send: SendRecording) => Promise<void>;
  /** Send the previewed recording (or retry a failed upload). */
  send: (send: SendRecording) => Promise<void>;
  /** Delete: cancels recording/upload, releases the microphone, back to idle. */
  discard: () => void;
  /** Live input level 0..1 for the waveform (read without re-rendering). */
  getLevel: () => number;
}

function toVoiceError(error: unknown): VoiceError {
  if (error instanceof VoiceRecorderError) return { code: error.code, message: error.message };
  return { code: 'recording-failed', message: 'Recording stopped unexpectedly.' };
}

/**
 * Voice-note recording for the composer. Drives the pure state machine from the media engine,
 * owns audio focus while capturing, and guarantees the microphone is released on stop, delete,
 * failure and unmount. Audio never leaves the device until `send` / `stopAndSend` is called.
 */
export function useVoiceRecorder(options: UseVoiceRecorderOptions = {}): VoiceRecorderApi {
  const maxDurationMs = options.maxDurationMs ?? VOICE_CONFIG.maxDurationMs;
  const createRecorder = options.createRecorder ?? createAudioRecorder;
  const focusId = useId();

  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState);
  const stateRef = useRef(state);
  const engineRef = useRef<AudioRecorder | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const lastSecond = useRef(-1);
  const canPause = useMemo(() => typeof browserMediaDeps().MediaRecorder?.prototype?.pause === 'function', []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const releaseEngine = useCallback(() => {
    engineRef.current?.cancel();
    engineRef.current = null;
    audioFocus.release(focusId);
  }, [focusId]);

  const discard = useCallback(() => {
    releaseEngine();
    uploadRef.current?.abort();
    uploadRef.current = null;
    dispatch({ type: 'RESET' });
  }, [releaseEngine]);

  const stop = useCallback(
    async (limitReached = false): Promise<Recording | undefined> => {
      const engine = engineRef.current;
      if (!engine) return undefined;
      dispatch({ type: 'STOP' });
      try {
        const recording = await engine.stop();
        if (engineRef.current !== engine) return undefined;
        engineRef.current = null;
        audioFocus.release(focusId);
        dispatch({ type: 'STOPPED', recording, limitReached });
        return recording;
      } catch (error) {
        if (engineRef.current !== engine) return undefined;
        engineRef.current = null;
        audioFocus.release(focusId);
        if (!isAbortError(error)) dispatch({ type: 'FAIL', error: toVoiceError(error) });
        return undefined;
      }
    },
    [focusId],
  );

  const start = useCallback(async () => {
    // One recording at a time, and never over an upload in flight.
    if (engineRef.current || uploadRef.current) return;
    const status = stateRef.current.status;
    if (status !== 'idle' && status !== 'preview' && status !== 'error' && status !== 'sent') return;

    if (!audioFocus.request({ id: focusId, kind: 'recording', interrupt: discard })) {
      dispatch({ type: 'REQUEST' });
      const message =
        audioFocus.active === 'call'
          ? 'End the call to record a voice message.'
          : 'The microphone is in use by another activity.';
      dispatch({ type: 'FAIL', error: { code: 'recorder-failed', message } });
      return;
    }

    lastSecond.current = -1;
    const engine = createRecorder({
      maxDurationMs,
      peakCount: VOICE_CONFIG.peakCount,
      onTick: (elapsedMs) => {
        const second = Math.floor(elapsedMs / 1000);
        if (second === lastSecond.current) return;
        lastSecond.current = second;
        dispatch({ type: 'TICK', elapsedMs });
      },
      onLimitReached: () => void stop(true),
      onFailure: (error) => {
        if (engineRef.current !== engine) return;
        engineRef.current = null;
        audioFocus.release(focusId);
        dispatch({ type: 'FAIL', error: toVoiceError(error) });
      },
    });
    engineRef.current = engine;
    dispatch({ type: 'REQUEST' });

    try {
      await engine.start();
      if (engineRef.current === engine) dispatch({ type: 'STARTED' });
    } catch (error) {
      if (engineRef.current !== engine) return;
      engineRef.current = null;
      audioFocus.release(focusId);
      if (!isAbortError(error)) dispatch({ type: 'FAIL', error: toVoiceError(error) });
    }
  }, [createRecorder, maxDurationMs, focusId, discard, stop]);

  const pause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine?.canPause) return;
    engine.pause();
    dispatch({ type: 'PAUSE' });
  }, []);

  const resume = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.resume();
    dispatch({ type: 'RESUME' });
  }, []);

  const upload = useCallback(async (sendRecording: SendRecording, recording: Recording) => {
    if (uploadRef.current) return; // no duplicate sends
    const controller = new AbortController();
    uploadRef.current = controller;
    dispatch({ type: 'UPLOAD' });
    try {
      await sendRecording(recording, controller.signal);
      if (uploadRef.current !== controller) return;
      dispatch({ type: 'UPLOADED' });
      dispatch({ type: 'RESET' });
    } catch (error) {
      if (uploadRef.current !== controller || isAbortError(error)) return;
      dispatch({ type: 'UPLOAD_FAILED', error: { code: 'upload-failed', message: toErrorInfo(error).message } });
    } finally {
      if (uploadRef.current === controller) uploadRef.current = null;
    }
  }, []);

  const send = useCallback(
    async (sendRecording: SendRecording) => {
      const current = stateRef.current;
      const recording =
        current.status === 'preview' ? current.recording : current.status === 'error' ? current.recording : null;
      if (recording) await upload(sendRecording, recording);
    },
    [upload],
  );

  const stopAndSend = useCallback(
    async (sendRecording: SendRecording) => {
      const recording = await stop();
      if (recording) await upload(sendRecording, recording);
    },
    [stop, upload],
  );

  const getLevel = useCallback(() => engineRef.current?.getLevel() ?? 0, []);

  // Leaving the conversation (unmount) always releases the microphone and cancels uploads.
  useEffect(
    () => () => {
      engineRef.current?.cancel();
      engineRef.current = null;
      uploadRef.current?.abort();
      audioFocus.release(focusId);
    },
    [focusId],
  );

  return {
    state,
    maxDurationMs,
    canPause,
    start,
    pause,
    resume,
    stop: () => stop(false),
    stopAndSend,
    send,
    discard,
    getLevel,
  };
}
