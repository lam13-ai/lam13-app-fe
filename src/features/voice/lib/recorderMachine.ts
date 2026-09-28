import type { Recording, VoiceError } from './types';

/**
 * What finishing a recording is for, chosen when it is stopped (or retried):
 * `preview` — review the audio; `review` — transcribe it into the message box for editing;
 * `send` — send it now (the voice note itself, or its transcript as a text message).
 */
export type RecordingIntent = 'preview' | 'review' | 'send';

/**
 * Voice-note state machine:
 *
 *   idle → requesting → recording → stopping(intent) ─ preview → preview → uploading → sent
 *                                                  └ review / send → uploading(intent) → sent
 *                  ↘ error        ↘ error (recording failure)          ↘ error (upload failure, recording + intent kept)
 *
 * On the transcription backend `uploading` is the transcription request: `review` = transcribing for
 * review (the text then lands in the composer — transcript ready), `send` = transcribing for send (the
 * text is then submitted as the message). A failure keeps the recording and the intent, so Retry repeats
 * the same step.
 *
 * Pure and explicit: invalid events leave the state unchanged. Side effects (media, upload) live in
 * the recorder engine and the `useVoiceRecorder` hook, which dispatch these events.
 */
export type RecorderState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'recording'; elapsedMs: number }
  | { status: 'stopping'; elapsedMs: number; intent: RecordingIntent }
  | { status: 'preview'; recording: Recording; limitReached: boolean }
  | { status: 'uploading'; recording: Recording; intent: UploadIntent }
  | { status: 'sent' }
  | { status: 'error'; error: VoiceError; recording: Recording | null; intent: UploadIntent };

/** What an upload does with the recording (everything but `preview`). */
export type UploadIntent = Exclude<RecordingIntent, 'preview'>;

export type RecorderStatus = RecorderState['status'];

export type RecorderEvent =
  | { type: 'REQUEST' }
  | { type: 'STARTED' }
  | { type: 'TICK'; elapsedMs: number }
  | { type: 'STOP'; intent?: RecordingIntent }
  | { type: 'STOPPED'; recording: Recording; limitReached?: boolean }
  | { type: 'FAIL'; error: VoiceError }
  | { type: 'UPLOAD'; intent?: UploadIntent }
  | { type: 'UPLOADED' }
  | { type: 'UPLOAD_FAILED'; error: VoiceError }
  | { type: 'RESET' };

export const initialRecorderState: RecorderState = { status: 'idle' };

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  if (event.type === 'RESET') return initialRecorderState;

  switch (state.status) {
    case 'idle':
    case 'preview':
    case 'sent':
      if (event.type === 'REQUEST') return { status: 'requesting' };
      if (event.type === 'UPLOAD' && state.status === 'preview')
        return { status: 'uploading', recording: state.recording, intent: event.intent ?? 'send' };
      return state;

    case 'requesting':
      if (event.type === 'STARTED') return { status: 'recording', elapsedMs: 0 };
      if (event.type === 'FAIL') return { status: 'error', error: event.error, recording: null, intent: 'send' };
      return state;

    case 'recording':
    case 'stopping':
      if (event.type === 'TICK' && state.status === 'recording') return { status: 'recording', elapsedMs: event.elapsedMs };
      if (event.type === 'STOP' && state.status === 'recording')
        return { status: 'stopping', elapsedMs: state.elapsedMs, intent: event.intent ?? 'preview' };
      if (event.type === 'STOPPED') {
        const intent = state.status === 'stopping' ? state.intent : 'preview';
        // Stopped to review/send: straight on to that step, no preview in between.
        return intent === 'preview'
          ? { status: 'preview', recording: event.recording, limitReached: Boolean(event.limitReached) }
          : { status: 'uploading', recording: event.recording, intent };
      }
      if (event.type === 'FAIL') return { status: 'error', error: event.error, recording: null, intent: 'send' };
      return state;

    case 'uploading':
      if (event.type === 'UPLOADED') return { status: 'sent' };
      if (event.type === 'UPLOAD_FAILED') return { status: 'error', error: event.error, recording: state.recording, intent: state.intent };
      return state;

    case 'error':
      if (event.type === 'REQUEST') return { status: 'requesting' };
      if (event.type === 'UPLOAD' && state.recording)
        return { status: 'uploading', recording: state.recording, intent: event.intent ?? state.intent };
      return state;
  }
}

/** True while the microphone may be in use. */
export function isCapturing(status: RecorderStatus): boolean {
  return status === 'requesting' || status === 'recording' || status === 'stopping';
}
