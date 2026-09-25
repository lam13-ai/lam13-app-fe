/** RMS level (0..1) of 8-bit time-domain samples centred on 128, boosted for speech. */
export function rmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const v = (sample - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 3);
}

/**
 * Reduces a level history to `count` bars (max per bucket), normalised so the loudest bar is 1,
 * with a small floor so silence still reads as a waveform.
 */
export function toPeaks(levels: number[], count: number): number[] {
  if (count <= 0) return [];
  if (levels.length === 0) return Array.from({ length: count }, () => 0.12);
  const buckets = Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * levels.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * levels.length) / count));
    return Math.max(...levels.slice(start, end));
  });
  const max = Math.max(...buckets, 0.0001);
  return buckets.map((v) => Math.max(0.12, Math.min(1, v / max)));
}

/** Deterministic, speech-like bar pattern for clips without stored peaks. */
export function placeholderPeaks(seed: number, count = 48): number[] {
  let x = Math.floor(seed) % 2147483647 || 1;
  return Array.from({ length: count }, () => {
    x = (x * 16807) % 2147483647;
    return 0.2 + ((x % 1000) / 1000) * 0.7;
  });
}
