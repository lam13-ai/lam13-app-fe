import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const JUMP_THRESHOLD = 120;
const LOAD_OLDER_THRESHOLD = 160;

interface Options {
  logRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  /** Key of the oldest rendered message — changes when an older page is prepended. */
  firstKey: string | undefined;
  canLoadOlder: boolean;
  onLoadOlder: () => void;
}

/**
 * Scroll behaviour around the anchored log:
 * - "Jump to latest" when the end of the conversation is below the viewport (never auto-chases).
 * - Loads older history near the top and keeps the viewport steady when it is prepended.
 */
export function useLogScroll({ logRef, contentRef, firstKey, canLoadOlder, onLoadOlder }: Options) {
  const [showJump, setShowJump] = useState(false);
  const prependSnapshot = useRef<{ height: number } | null>(null);
  /** A "Jump to latest" smooth scroll is in flight (until the end is reached). */
  const jumping = useRef(false);

  const latestTop = useCallback(() => {
    const log = logRef.current;
    const content = contentRef.current;
    if (!log || !content) return 0;
    const paddingBottom = parseFloat(getComputedStyle(log).paddingBottom);
    return Math.max(0, content.offsetTop + content.offsetHeight + paddingBottom - log.clientHeight);
  }, [logRef, contentRef]);

  const update = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    const away = latestTop() - log.scrollTop > JUMP_THRESHOLD;
    if (!away) jumping.current = false;
    setShowJump(away);
  }, [logRef, latestTop]);

  const onScroll = useCallback(() => {
    const log = logRef.current;
    if (!log) return;
    update();
    if (canLoadOlder && log.scrollTop < LOAD_OLDER_THRESHOLD && !prependSnapshot.current) {
      prependSnapshot.current = { height: log.scrollHeight };
      onLoadOlder();
    }
  }, [logRef, update, canLoadOlder, onLoadOlder]);

  // Streaming growth / resizes can reveal or hide the jump button without a scroll event.
  useLayoutEffect(() => {
    const log = logRef.current;
    const content = contentRef.current;
    if (!log || !content) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(log);
    observer.observe(content);
    // The user taking over the scroll ends a jump in progress.
    const cancelJump = () => (jumping.current = false);
    log.addEventListener('wheel', cancelJump, { passive: true });
    log.addEventListener('touchstart', cancelJump, { passive: true });
    return () => {
      observer.disconnect();
      log.removeEventListener('wheel', cancelJump);
      log.removeEventListener('touchstart', cancelJump);
    };
  }, [logRef, contentRef, update]);

  const scrollToLatest = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    logRef.current?.scrollTo({ top: latestTop(), behavior: reduced ? 'auto' : 'smooth' });
  }, [logRef, latestTop]);

  // Older page prepended: keep the same content under the viewport (offset from where the view is
  // now, not where the load started). Setting scrollTop cancels a smooth scroll, so resume a jump.
  useLayoutEffect(() => {
    const log = logRef.current;
    const snapshot = prependSnapshot.current;
    if (!log || !snapshot) return;
    log.scrollTop += log.scrollHeight - snapshot.height;
    prependSnapshot.current = null;
    if (jumping.current) scrollToLatest();
  }, [logRef, firstKey, scrollToLatest]);

  // A failed or finished load must allow another attempt.
  const resetLoadOlder = useCallback(() => {
    prependSnapshot.current = null;
  }, []);

  const jumpToLatest = useCallback(() => {
    jumping.current = true;
    scrollToLatest();
  }, [scrollToLatest]);

  return { showJump, onScroll, jumpToLatest, resetLoadOlder };
}
