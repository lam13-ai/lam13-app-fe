import { useCallback, useSyncExternalStore } from 'react';

interface Entry {
  url: string;
  refs: number;
}

/** Ref-counted `blob:` URLs: created on first subscriber, revoked when the last one leaves. */
const entries = new WeakMap<Blob, Entry>();

/**
 * A temporary `blob:` URL for local playback. Revoked as soon as no component uses the blob
 * (delete, send, unmount), so recordings never outlive their preview.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!blob) return () => {};
      let entry = entries.get(blob);
      if (!entry) {
        entry = { url: URL.createObjectURL(blob), refs: 0 };
        entries.set(blob, entry);
      }
      entry.refs += 1;
      onChange();
      return () => {
        const current = entries.get(blob);
        if (!current) return;
        current.refs -= 1;
        if (current.refs <= 0) {
          URL.revokeObjectURL(current.url);
          entries.delete(blob);
        }
      };
    },
    [blob],
  );

  const getSnapshot = useCallback(() => (blob ? (entries.get(blob)?.url ?? null) : null), [blob]);
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
