/** A finished local recording. Stays in memory until the user sends or deletes it. */
export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Normalised 0..1 levels sampled while recording, for the waveform. */
  peaks: number[];
}

export type VoiceErrorCode =
  | 'unsupported'
  | 'insecure-context'
  | 'permission-denied'
  | 'no-device'
  | 'recorder-failed'
  | 'recording-failed'
  | 'empty-recording'
  | 'upload-failed';

export interface VoiceError {
  code: VoiceErrorCode;
  /** Display-safe message. */
  message: string;
}

export const VOICE_ERROR_MESSAGES: Record<Exclude<VoiceErrorCode, 'upload-failed'>, string> = {
  unsupported: "Voice recording isn't supported in this browser.",
  'insecure-context': 'Voice recording needs a secure (https) connection.',
  'permission-denied': 'Microphone access was blocked. Allow it in your browser settings to record.',
  'no-device': 'No microphone was found.',
  'recorder-failed': "The microphone couldn't be started. Close other apps using it and try again.",
  'recording-failed': 'Recording stopped unexpectedly.',
  'empty-recording': 'No audio was captured. Please try again.',
};

export class VoiceRecorderError extends Error {
  readonly code: Exclude<VoiceErrorCode, 'upload-failed'>;
  constructor(code: Exclude<VoiceErrorCode, 'upload-failed'>) {
    super(VOICE_ERROR_MESSAGES[code]);
    this.name = 'VoiceRecorderError';
    this.code = code;
  }
}
