import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui';

const COPIED_MS = 1600;

/**
 * Copies plain text to the clipboard. `copied` flips on for a moment after success; a missing or
 * blocked Clipboard API (insecure context, denied permission) reports a toast instead.
 */
export function useCopyText() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (text: string) => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      } catch {
        toast.show("Couldn't copy. Select the text to copy it manually.", { tone: 'danger' });
      }
    },
    [toast],
  );

  return { copied, copy };
}
