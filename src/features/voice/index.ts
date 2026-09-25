export { VOICE_CONFIG } from './config';
export { useVoiceRecorder, type SendRecording, type VoiceRecorderApi } from './hooks/useVoiceRecorder';
export { VoiceComposer } from './components/VoiceComposer';
export { VoicePlayer, type VoicePlayerProps } from './components/VoicePlayer';
export { audioFocus, type AudioActivity } from './lib/audioFocus';
export type { Recording, VoiceError, VoiceErrorCode } from './lib/types';
export type { RecorderState, RecorderStatus } from './lib/recorderMachine';
