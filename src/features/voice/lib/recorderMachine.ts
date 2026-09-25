import type { Recording, VoiceError } from './types';

/**
 * Voice-note state machine:
 *
 *   idle → requesting → recording ⇄ paused → stopping → preview → uploading → sent
 *                  ↘ error        ↘ error (recording failure)          ↘ error (upload failure, recording kept)
 *
 * Pure and explicit: invalid events leave the state unchanged. Side effects (media, upload) live in
 * the recorder engine and the `useVoiceRecorder` hook, which dispatch these events.
 */
export type RecorderState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'recording'; elapsedMs: number }
  | { status: 'paused'; elapsedMs: number }
  | { status: 'stopping'; elapsedMs: number }
  | { status: 'preview'; recording: Recording; limitReached: boolean }
  | { status: 'uploading'; recording: Recording }
  | { status: 'sent' }
  | { status: 'error'; error: VoiceError; recording: Recording | null };

export type RecorderStatus = RecorderState['status'];

export type RecorderEvent =
  | { type: 'REQUEST' }
  | { type: 'STARTED' }
  | { type: 'TICK'; elapsedMs: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'STOPPED'; recording: Recording; limitReached?: boolean }
  | { type: 'FAIL'; error: VoiceError }
  | { type: 'UPLOAD' }
  | { type: 'UPLOADED' }
  | { type: 'UPLOAD_FAILED'; error: VoiceError }
  | { type: 'RESET' };

export const initialRecorderState: RecorderState = { status: 'idle' };

const elapsedOf = (state: RecorderState) => ('elapsedMs' in state ? state.elapsedMs : 0);

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  if (event.type === 'RESET') return initialRecorderState;

  switch (state.status) {
    case 'idle':
    case 'preview':
    case 'sent':
      if (event.type === 'REQUEST') return { status: 'requesting' };
      if (event.type === 'UPLOAD' && state.status === 'preview') return { status: 'uploading', recording: state.recording };
      return state;

    case 'requesting':
      if (event.type === 'STARTED') return { status: 'recording', elapsedMs: 0 };
      if (event.type === 'FAIL') return { status: 'error', error: event.error, recording: null };
      return state;

    case 'recording':
    case 'paused':
    case 'stopping':
      if (event.type === 'TICK' && state.status === 'recording') return { status: 'recording', elapsedMs: event.elapsedMs };
      if (event.type === 'PAUSE' && state.status === 'recording') return { status: 'paused', elapsedMs: elapsedOf(state) };
      if (event.type === 'RESUME' && state.status === 'paused') return { status: 'recording', elapsedMs: elapsedOf(state) };
      if (event.type === 'STOP' && state.status !== 'stopping') return { status: 'stopping', elapsedMs: elapsedOf(state) };
      if (event.type === 'STOPPED') return { status: 'preview', recording: event.recording, limitReached: Boolean(event.limitReached) };
      if (event.type === 'FAIL') return { status: 'error', error: event.error, recording: null };
      return state;

    case 'uploading':
      if (event.type === 'UPLOADED') return { status: 'sent' };
      if (event.type === 'UPLOAD_FAILED') return { status: 'error', error: event.error, recording: state.recording };
      return state;

    case 'error':
      if (event.type === 'REQUEST') return { status: 'requesting' };
      if (event.type === 'UPLOAD' && state.recording) return { status: 'uploading', recording: state.recording };
      return state;
  }
}

/** True while the microphone may be in use. */
export function isCapturing(status: RecorderStatus): boolean {
  return status === 'requesting' || status === 'recording' || status === 'paused' || status === 'stopping';
}
