import type { CallError, ProviderState, TranscriptUpdate, Unsubscribe } from '../types';

/** Tiny typed listener registry shared by providers. */
export function createProviderEvents() {
  const state = new Set<(s: ProviderState) => void>();
  const transcript = new Set<(u: TranscriptUpdate) => void>();
  const error = new Set<(e: CallError) => void>();
  const volume = new Set<(level: number) => void>();

  const add =
    <T>(set: Set<(value: T) => void>) =>
    (listener: (value: T) => void): Unsubscribe => {
      set.add(listener);
      return () => set.delete(listener);
    };

  return {
    onStateChange: add(state),
    onTranscript: add(transcript),
    onError: add(error),
    onVolume: add(volume),
    emitState: (s: ProviderState) => state.forEach((l) => l(s)),
    emitTranscript: (u: TranscriptUpdate) => transcript.forEach((l) => l(u)),
    emitError: (e: CallError) => error.forEach((l) => l(e)),
    emitVolume: (level: number) => volume.forEach((l) => l(level)),
    clear: () => [state, transcript, error, volume].forEach((set) => set.clear()),
  };
}
