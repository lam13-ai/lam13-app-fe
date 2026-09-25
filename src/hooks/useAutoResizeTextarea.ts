import { useLayoutEffect, type RefObject } from 'react';

/** Grows a textarea with its content up to the CSS max-height (then it scrolls). */
export function useAutoResizeTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}
