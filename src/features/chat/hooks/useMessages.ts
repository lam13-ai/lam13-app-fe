import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys, useApi } from '@/api';
import type { Page } from '@/types/api';
import type { MessageView } from '@/types/chat';
import { NEW_CONVERSATION_KEY, toChronological, type MessagesData } from '../lib/messageCache';

const PAGE_SIZE = 20;

/**
 * Message history (newest-first pages, rendered oldest → newest).
 * An unsaved chat ('new') is never fetched; its cache is written by the stream controller.
 */
export function useMessages(conversationId: string | undefined) {
  const api = useApi();
  const query = useInfiniteQuery<Page<MessageView>, Error, MessagesData, QueryKey, string | null>({
    queryKey: queryKeys.messages(conversationId ?? NEW_CONVERSATION_KEY),
    queryFn: ({ pageParam }) => api.messages.list(conversationId!, { before: pageParam, limit: PAGE_SIZE }),
    enabled: Boolean(conversationId),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const messages = useMemo(() => toChronological(query.data), [query.data]);
  return { ...query, messages };
}
