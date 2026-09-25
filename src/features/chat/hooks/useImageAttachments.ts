import { useCallback, useEffect, useRef, useState } from 'react';
import { toErrorInfo, useApi } from '@/api';
import { createId } from '@/lib/id';
import type { AttachmentRef } from '@/types/api';
import { validateImageFiles, type RejectedFile } from '../lib/attachments';

export interface AttachmentDraft {
  id: string;
  file: File;
  /** Local object URL for the thumbnail; revoked on removal, clear and unmount. */
  previewUrl: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  ref?: AttachmentRef;
  error?: string;
}

/**
 * Images picked for the next message: validate → preview → remove → upload → send.
 * Uploads go through `api.attachments` only when `upload()` is called (i.e. on send); already
 * uploaded drafts are not re-uploaded on a retry. File contents are never logged.
 *
 * Backend-dependent: the composer keeps its "not available yet" action until the attachments
 * endpoint exists (api-contract.md §4.7); this hook is the integration point for that UI.
 */
export function useImageAttachments() {
  const api = useApi();
  const [drafts, setDrafts] = useState<AttachmentDraft[]>([]);
  // Source of truth for callbacks (always current, even mid-upload); `drafts` mirrors it for rendering.
  const current = useRef<AttachmentDraft[]>([]);
  const commit = useCallback((next: AttachmentDraft[]) => {
    current.current = next;
    setDrafts(next);
  }, []);
  const update = useCallback(
    (id: string, patch: Partial<AttachmentDraft>) => commit(current.current.map((d) => (d.id === id ? { ...d, ...patch } : d))),
    [commit],
  );

  // Release every preview when the composer goes away.
  useEffect(() => () => current.current.forEach((d) => URL.revokeObjectURL(d.previewUrl)), []);

  /** Adds valid images; returns the rejected ones (with reasons) for the caller to report. */
  const add = useCallback(
    (files: readonly File[]): RejectedFile[] => {
      const { accepted, rejected } = validateImageFiles(files, current.current.length);
      const added = accepted.map((file) => ({ id: createId(), file, previewUrl: URL.createObjectURL(file), status: 'pending' as const }));
      if (added.length) commit([...current.current, ...added]);
      return rejected;
    },
    [commit],
  );

  const remove = useCallback(
    (id: string) => {
      const draft = current.current.find((d) => d.id === id);
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      commit(current.current.filter((d) => d.id !== id));
    },
    [commit],
  );

  const clear = useCallback(() => {
    current.current.forEach((d) => URL.revokeObjectURL(d.previewUrl));
    commit([]);
  }, [commit]);

  /**
   * Uploads drafts that are not uploaded yet, one at a time. Resolves with every ref when all
   * succeed; otherwise marks the failed draft and rejects (the rest stay for a retry).
   */
  const upload = useCallback(
    async (conversationId: string | null, signal?: AbortSignal): Promise<AttachmentRef[]> => {
      const refs: AttachmentRef[] = [];
      for (const { id } of current.current) {
        const draft = current.current.find((d) => d.id === id);
        if (!draft) continue; // removed meanwhile
        if (draft.ref) {
          refs.push(draft.ref);
          continue;
        }
        update(id, { status: 'uploading', error: undefined });
        try {
          const ref = await api.attachments.upload({ file: draft.file, filename: draft.file.name, conversation_id: conversationId }, { signal });
          update(id, { status: 'uploaded', ref });
          refs.push(ref);
        } catch (error) {
          update(id, { status: 'error', error: toErrorInfo(error).message });
          throw error;
        }
      }
      return refs;
    },
    [api, update],
  );

  return { drafts, add, remove, clear, upload };
}
