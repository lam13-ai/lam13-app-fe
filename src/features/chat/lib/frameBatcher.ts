/** Fallback when no frame comes: background tabs pause requestAnimationFrame (timers still run, throttled). */
const BACKGROUND_FLUSH_MS = 100;

/**
 * Coalesces many `schedule()` calls into one `fn()` per animation frame. A timer backs up the frame so
 * writes still land while the tab is hidden; whichever fires first runs `fn()` and cancels the other.
 */
export function createFrameBatcher(fn: () => void) {
  const raf = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((cb: () => void) => setTimeout(cb, 16) as unknown as number);
  const caf = globalThis.cancelAnimationFrame?.bind(globalThis) ?? ((id: number) => clearTimeout(id));
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = () => {
    if (frame !== null) caf(frame);
    if (timer !== null) clearTimeout(timer);
    frame = timer = null;
  };
  const run = () => {
    cancel();
    fn();
  };

  return {
    schedule() {
      if (frame !== null || timer !== null) return;
      frame = raf(run);
      timer = setTimeout(run, BACKGROUND_FLUSH_MS);
    },
    /** Drops a pending flush (callers then write synchronously). */
    cancel,
  };
}
