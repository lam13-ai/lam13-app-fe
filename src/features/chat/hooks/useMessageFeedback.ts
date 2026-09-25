import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { queryKeys, toErrorInfo, useApi } from '@/api';
import { useToast } from '@/components/ui';
import type { FeedbackRating } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { isLocalId, patchMessage, type MessagesData } from '../lib/messageCache';

/**
 * Thumbs up / down on assistant answers (api-contract.md §4.8). Optimistic: the rating shows at once,
 * the server's reply confirms it, and a failure rolls back with a toast. One request per message at
 * a time — repeated taps while one is pending are ignored.
 *
 * Backend-dependent: not rendered until the real feedback endpoint exists.
 */
export function useMessageFeedback(conversationId: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  const toast = useToast();
  const inFlight = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());

  const rate = useCallback(
    async (message: MessageView, rating: FeedbackRating | null) => {
      if (!conversationId || isLocalId(message.id) || inFlight.current.has(message.id)) return;
      const key = queryKeys.messages(conversationId);
      const write = (feedback: FeedbackRating | null) =>
        queryClient.setQueryData<MessagesData>(key, (data) => patchMessage(data, message.id, { feedback }));
      const previous = message.feedback ?? null;

      inFlight.current.add(message.id);
      setPending(new Set(inFlight.current));
      write(rating);
      try {
        const saved = await api.messages.setFeedback(conversationId, message.id, rating);
        write(saved.rating);
      } catch (error) {
        write(previous);
        toast.show(`Couldn't save your feedback. ${toErrorInfo(error).message}`, { tone: 'danger' });
      } finally {
        inFlight.current.delete(message.id);
        setPending(new Set(inFlight.current));
      }
    },
    [api, conversationId, queryClient, toast],
  );

  const isPending = useCallback((messageId: string) => pending.has(messageId), [pending]);
  return { rate, isPending };
}
