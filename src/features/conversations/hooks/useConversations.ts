import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { Conversation, Page } from '@/types/api';
import {
  findConversation,
  flattenConversations,
  patchInList,
  removeFromList,
  type ConversationListData,
} from '../lib/conversationCache';

const PAGE_SIZE = 30;

/** GET /conversations — cursor-paginated, newest first. */
export function useConversations() {
  const api = useApi();
  const query = useInfiniteQuery<Page<Conversation>, Error, ConversationListData, QueryKey, string | null>({
    queryKey: queryKeys.conversations.list(),
    queryFn: ({ pageParam }) => api.conversations.list({ cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
  });
  return { ...query, conversations: flattenConversations(query.data) };
}

/** GET /conversations/{id}; seeded from the list cache so the header renders instantly. */
export function useConversation(id: string | undefined) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.conversations.detail(id ?? ''),
    queryFn: () => api.conversations.get(id!),
    enabled: Boolean(id),
    initialData: () => (id ? findConversation(queryClient, id) : undefined),
    initialDataUpdatedAt: () => queryClient.getQueryState(queryKeys.conversations.list())?.dataUpdatedAt,
  });
}

/** PATCH /conversations/{id} with optimistic update and rollback. */
export function useRenameConversation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => api.conversations.rename(id, title),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.conversations.all });
      const previousList = queryClient.getQueryData<ConversationListData>(queryKeys.conversations.list());
      const previousDetail = queryClient.getQueryData<Conversation>(queryKeys.conversations.detail(id));
      queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (d) => patchInList(d, id, { title }));
      if (previousDetail) queryClient.setQueryData(queryKeys.conversations.detail(id), { ...previousDetail, title });
      return { previousList, previousDetail };
    },
    onError: (_error, { id }, context) => {
      queryClient.setQueryData(queryKeys.conversations.list(), context?.previousList);
      if (context?.previousDetail) queryClient.setQueryData(queryKeys.conversations.detail(id), context.previousDetail);
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData(queryKeys.conversations.detail(conversation.id), conversation);
      queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (d) =>
        patchInList(d, conversation.id, conversation),
      );
    },
  });
}

/** DELETE /conversations/{id} with optimistic removal and rollback. */
export function useDeleteConversation() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.conversations.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.conversations.list() });
      const previousList = queryClient.getQueryData<ConversationListData>(queryKeys.conversations.list());
      queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (d) => removeFromList(d, id));
      return { previousList };
    },
    onError: (_error, _id, context) => {
      queryClient.setQueryData(queryKeys.conversations.list(), context?.previousList);
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(id) });
      queryClient.removeQueries({ queryKey: queryKeys.messages(id) });
    },
  });
}
