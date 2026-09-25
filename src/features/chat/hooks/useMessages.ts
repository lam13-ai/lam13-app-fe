import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys, useApi } from '@/api';
import { useStreamStore } from '@/stores/streamStore';
import type { Page } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { NEW_CONVERSATION_KEY, toChronological, type MessagesData } from '../lib/messageCache';

const PAGE_SIZE = 20;
/** How often to re-read a conversation while the server is still producing something. */
const POLL_MS = 5_000;

/** Server-side work still running: an answer generating after a reload, or a report / deck being built. */
function hasPendingWork(data: MessagesData | undefined): boolean {
  return toChronological(data).some(
    (m) => m.status === 'streaming' || m.artifacts?.some((a) => a.status === 'queued' || a.status === 'processing'),
  );
}

/**
 * Message history (newest-first pages, rendered oldest → newest).
 * An unsaved chat ('new') is never fetched; its cache is written by the stream controller.
 */
export function useMessages(conversationId: string | undefined) {
  const api = useApi();
  // Subscribed (not read once) so polling re-evaluates when this client's stream ends.
  const streaming = useStreamStore((s) => Boolean(conversationId && s.active[conversationId]));
  const query = useInfiniteQuery<Page<MessageView>, Error, MessagesData, QueryKey, string | null>({
    queryKey: queryKeys.messages(conversationId ?? NEW_CONVERSATION_KEY),
    queryFn: ({ pageParam }) => api.messages.list(conversationId!, { before: pageParam, limit: PAGE_SIZE }),
    enabled: Boolean(conversationId),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    // Never while this client streams: a refetch would overwrite the live draft.
    refetchInterval: (query) => (!streaming && hasPendingWork(query.state.data) ? POLL_MS : false),
  });
  const messages = useMemo(() => toChronological(query.data), [query.data]);
  return { ...query, messages };
}
