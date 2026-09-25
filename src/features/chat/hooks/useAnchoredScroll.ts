import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

interface Options {
  /** The scrolling log element. Must be positioned (it is the messages' offsetParent). */
  logRef: RefObject<HTMLElement | null>;
  /** Wrapper around the messages. */
  contentRef: RefObject<HTMLElement | null>;
  /** Key of the message to pin to the top — the latest user message. */
  anchorId: string | undefined;
}

/**
 * Top-anchored turn composition (reference §5 / §10): when the latest user message changes it is
 * scrolled to the top of the log (instantly on first render, smoothly afterwards). The room below it
 * comes from CSS — the latest turn has `min-height: 100cqh` — so it never lags behind layout and the
 * view never chases the bottom while an answer streams.
 */
export function useAnchoredScroll({ logRef, contentRef, anchorId }: Options): void {
  const hasScrolled = useRef(false);

  const getAnchor = useCallback(
    () => (anchorId ? contentRef.current?.querySelector<HTMLElement>(`[data-message-id="${anchorId}"]`) : null),
    [anchorId, contentRef],
  );

  useLayoutEffect(() => {
    const log = logRef.current;
    const anchor = getAnchor();
    if (!log || !anchor) return;

    const frame = requestAnimationFrame(() => {
      // Layout offsets (not getBoundingClientRect) so enter animations' transforms don't skew the maths.
      const top = anchor.offsetTop - parseFloat(getComputedStyle(log).paddingTop);
      const smooth = hasScrolled.current && !window.matchMedia(REDUCED_MOTION_QUERY).matches;
      log.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
      hasScrolled.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [logRef, getAnchor]);
}
