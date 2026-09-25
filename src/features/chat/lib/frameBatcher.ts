/** Coalesces many `schedule()` calls into one `fn()` per animation frame. */
export function createFrameBatcher(fn: () => void) {
  const raf = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((cb: () => void) => setTimeout(cb, 16) as unknown as number);
  const caf = globalThis.cancelAnimationFrame?.bind(globalThis) ?? ((id: number) => clearTimeout(id));
  let handle: number | null = null;

  return {
    schedule() {
      if (handle !== null) return;
      handle = raf(() => {
        handle = null;
        fn();
      });
    },
    /** Drops a pending frame (callers then write synchronously). */
    cancel() {
      if (handle === null) return;
      caf(handle);
      handle = null;
    },
  };
}
