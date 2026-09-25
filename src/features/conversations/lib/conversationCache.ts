import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api';
import type { Conversation, Page } from '@/types/api';

export type ConversationListData = InfiniteData<Page<Conversation>, string | null>;

export function flattenConversations(data: ConversationListData | undefined): Conversation[] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export function findConversation(queryClient: QueryClient, id: string): Conversation | undefined {
  return (
    queryClient.getQueryData<Conversation>(queryKeys.conversations.detail(id)) ??
    flattenConversations(queryClient.getQueryData<ConversationListData>(queryKeys.conversations.list())).find(
      (c) => c.id === id,
    )
  );
}

/** Pure: puts `conversation` first in the list, removing any previous copy. */
export function moveToTop(data: ConversationListData | undefined, conversation: Conversation): ConversationListData | undefined {
  if (!data) return data;
  const [first, ...rest] = data.pages.map((page) => ({
    ...page,
    items: page.items.filter((c) => c.id !== conversation.id),
  }));
  if (!first) return data;
  return { ...data, pages: [{ ...first, items: [conversation, ...first.items] }, ...rest] };
}

/** Pure: shallow-merges `patch` into the conversation in place (keeps order). */
export function patchInList(
  data: ConversationListData | undefined,
  id: string,
  patch: Partial<Conversation>,
): ConversationListData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),
  };
}

export function removeFromList(data: ConversationListData | undefined, id: string): ConversationListData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((c) => c.id !== id) })) };
}

/** Writes a conversation to the detail cache and the top of the list (new or recently active). */
export function upsertConversation(queryClient: QueryClient, conversation: Conversation) {
  queryClient.setQueryData(queryKeys.conversations.detail(conversation.id), conversation);
  queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (data) => moveToTop(data, conversation));
}

/** Applies a partial update to both caches; `toTop` also reorders the list. */
export function patchConversation(
  queryClient: QueryClient,
  id: string,
  patch: Partial<Conversation>,
  { toTop = false }: { toTop?: boolean } = {},
) {
  const current = findConversation(queryClient, id);
  if (!current) return;
  const next = { ...current, ...patch };
  queryClient.setQueryData(queryKeys.conversations.detail(id), next);
  queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (data) =>
    toTop ? moveToTop(data, next) : patchInList(data, id, patch),
  );
}
