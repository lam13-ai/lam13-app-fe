/** Voice-note settings. */
export const VOICE_CONFIG = {
  /** Recording stops automatically at this length (api-contract.md §4.4). */
  maxDurationMs: 5 * 60_000,
  /** Show the remaining time (instead of elapsed / max) in the last N ms. */
  warnRemainingMs: 30_000,
  /**
   * Direct send: the recording bar offers "Send" alongside "Stop & preview".
   * Delete is always available before anything is transmitted.
   */
  directSend: true,
  /** Number of bars in stored/preview waveforms. */
  peakCount: 48,
} as const;
