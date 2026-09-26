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

/** Sidebar length of a title derived from a message (the row itself still truncates with an ellipsis). */
const DERIVED_TITLE_MAX = 40;

/**
 * A readable provisional title from the user's first message: whitespace collapsed, cut at a word
 * boundary near DERIVED_TITLE_MAX with an ellipsis.
 */
export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= DERIVED_TITLE_MAX) return clean;
  const cut = clean.slice(0, DERIVED_TITLE_MAX + 1);
  const space = cut.lastIndexOf(' ');
  const head = space >= DERIVED_TITLE_MAX * 0.6 ? cut.slice(0, space) : clean.slice(0, DERIVED_TITLE_MAX);
  return `${head.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * Swaps the conversation `fromId` (an optimistic row) for `conversation` in place — same position, one
 * row — and drops any other copy of it. Absent `fromId`: added at the top.
 */
export function replaceConversation(queryClient: QueryClient, fromId: string, conversation: Conversation) {
  queryClient.setQueryData(queryKeys.conversations.detail(conversation.id), conversation);
  queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(fromId), exact: true });
  queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (data) => {
    if (!data || !flattenConversations(data).some((c) => c.id === fromId)) return moveToTop(data, conversation);
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items
          .filter((c) => c.id !== conversation.id)
          .map((c) => (c.id === fromId ? conversation : c)),
      })),
    };
  });
}

/** Drops a conversation from both caches (e.g. an optimistic row whose send never reached the server). */
export function dropConversation(queryClient: QueryClient, id: string) {
  queryClient.removeQueries({ queryKey: queryKeys.conversations.detail(id), exact: true });
  queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), (data) => removeFromList(data, id));
}
