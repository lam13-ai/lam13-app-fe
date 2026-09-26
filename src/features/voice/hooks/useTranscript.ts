import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbortError } from '@/api';
import type { Recording } from '../lib/types';

/** Transcribes a finished recording for review before sending. Must honour `signal`. */
export type TranscribeRecording = (recording: Recording, signal: AbortSignal) => Promise<string>;

/** `ready` with empty `text`: no speech detected. */
export type TranscriptState = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'error' };

const LOADING: TranscriptState = { status: 'loading' };

/**
 * The detected transcript of the recording under review. Starts when a recording is available,
 * is aborted when it changes (re-record), is discarded, or the composer unmounts. `state` is null when
 * there is nothing to transcribe or the backend can't transcribe.
 */
export function useTranscript(recording: Recording | null, transcribe: TranscribeRecording | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ recording: Recording; attempt: number; state: TranscriptState } | null>(null);
  // The caller may pass a new function every render; only the recording and retries restart the request.
  const transcribeRef = useRef(transcribe);
  useEffect(() => {
    transcribeRef.current = transcribe;
  });
  const enabled = Boolean(transcribe);

  useEffect(() => {
    const run = transcribeRef.current;
    if (!recording || !enabled || !run) return;
    const controller = new AbortController();
    run(recording, controller.signal).then(
      (text) => setResult({ recording, attempt, state: { status: 'ready', text: text.trim() } }),
      (error: unknown) => {
        if (!isAbortError(error)) setResult({ recording, attempt, state: { status: 'error' } });
      },
    );
    return () => controller.abort();
  }, [recording, enabled, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!recording || !enabled) return { state: null, retry };
  const current = result && result.recording === recording && result.attempt === attempt ? result.state : LOADING;
  return { state: current, retry };
}
