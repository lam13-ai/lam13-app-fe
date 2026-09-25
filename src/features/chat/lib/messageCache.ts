import type { InfiniteData } from '@tanstack/react-query';
import type { Page } from '@/types/api';
import type { MessageView } from '@/types/chat';

/**
 * Message history is an infinite query of newest-first pages (api-contract.md §4.3).
 * These pure helpers apply optimistic and streamed updates to that cache shape.
 */
export type MessagesData = InfiniteData<Page<MessageView>, string | null>;

export const NEW_CONVERSATION_KEY = 'new';

/** Stable identity across optimistic → server reconciliation. */
export function messageKey(message: MessageView): string {
  return message.local_key ?? message.client_message_id ?? message.id;
}

export function isLocalId(id: string): boolean {
  return id.startsWith('local:');
}

export function emptyMessagesData(): MessagesData {
  return { pages: [{ items: [], next_cursor: null }], pageParams: [null] };
}

export function toChronological(data: MessagesData | undefined): MessageView[] {
  if (!data) return [];
  return data.pages.flatMap((page) => page.items).reverse();
}

/** Adds messages (given oldest → newest) to the newest end. */
export function appendMessages(data: MessagesData | undefined, messages: MessageView[]): MessagesData {
  const base = data ?? emptyMessagesData();
  const [first, ...rest] = base.pages;
  const newestFirst = [...messages].reverse();
  return {
    ...base,
    pages: [{ items: [...newestFirst, ...(first?.items ?? [])], next_cursor: first?.next_cursor ?? null }, ...rest],
  };
}

/** Replaces the message matching `key` (or the same server id). No-op when absent. */
export function upsertMessage(data: MessagesData | undefined, key: string, next: MessageView): MessagesData | undefined {
  if (!data) return data;
  let found = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((m) => {
      if (found || (messageKey(m) !== key && m.id !== next.id)) return m;
      found = true;
      return next;
    }),
  }));
  return found ? { ...data, pages } : data;
}

export function removeMessages(data: MessagesData | undefined, keys: string[]): MessagesData | undefined {
  if (!data) return data;
  const drop = new Set(keys);
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.filter((m) => !drop.has(messageKey(m))) })),
  };
}

/** Re-labels every message's conversation id (lazy creation moves 'new' → real id). */
export function withConversationId(data: MessagesData, conversationId: string): MessagesData {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((m) => ({ ...m, conversation_id: conversationId })),
    })),
  };
}

/** Merges `patch` into the message with server id `id`. No-op when absent. */
export function patchMessage(data: MessagesData | undefined, id: string, patch: Partial<MessageView>): MessagesData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  };
}
