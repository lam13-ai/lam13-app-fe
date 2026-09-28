import { replaceEqualDeep, type InfiniteData } from '@tanstack/react-query';
import type { Page } from '@/types/api';
import type { MessageView } from '@/types/chat';

/**
 * Message history is an infinite query of newest-first pages (api-contract.md §4.3).
 * These pure helpers apply optimistic and streamed updates to that cache shape.
 */
export type MessagesData = InfiniteData<Page<MessageView>, string | null>;

export const NEW_CONVERSATION_KEY = 'new';

/**
 * Cache / stream key of one unsaved new-chat view. Each "New chat" gets its own, so nothing (messages, an
 * in-flight stream) can leak from one new chat into the next. Without a view (`origin`) the shared key.
 */
export function newChatKey(origin?: string): string {
  return origin ? `${NEW_CONVERSATION_KEY}:${origin}` : NEW_CONVERSATION_KEY;
}

export function isNewChatKey(key: string): boolean {
  return key === NEW_CONVERSATION_KEY || key.startsWith(`${NEW_CONVERSATION_KEY}:`);
}

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

/**
 * Structural sharing for the messages cache, matched by message key rather than array position. Pages are
 * newest-first, so a new exchange shifts every index; TanStack's positional sharing then compares each
 * message with its neighbour and copies all of them — every row re-renders. Here an unchanged message
 * keeps its object (memoized rows skip it) and a changed one is shared field by field.
 */
export function shareMessages(previous: unknown, next: unknown): unknown {
  const prev = previous as MessagesData | undefined;
  const data = next as MessagesData | undefined;
  if (!prev || !data?.pages) return replaceEqualDeep(prev, data);
  const old = new Map(toChronological(prev).map((m) => [messageKey(m), m]));
  const sameItems = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  // Never positional sharing past this point: it would pair shifted messages up again and copy them.
  const pages = data.pages.map((page, i) => {
    const items = page.items.map((m) => {
      const before = old.get(messageKey(m));
      return before ? replaceEqualDeep(before, m) : m;
    });
    const was = prev.pages[i];
    return was && was.next_cursor === page.next_cursor && sameItems(was.items, items) ? was : { ...page, items };
  });
  // Nothing changed (e.g. a refetch of the same history): keep the previous data object itself.
  return sameItems(prev.pages, pages) && sameItems(prev.pageParams, data.pageParams) ? prev : { ...data, pages };
}
