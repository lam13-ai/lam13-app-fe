import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/api';
import type { Conversation } from '@/types/api';
import { moveToTop, patchConversation, removeFromList, upsertConversation, type ConversationListData } from './conversationCache';

const c = (id: string, title = id): Conversation => ({ id, title, created_at: '', updated_at: '', last_message_preview: null });

const list = (): ConversationListData => ({
  pages: [
    { items: [c('a'), c('b')], next_cursor: '2' },
    { items: [c('c')], next_cursor: null },
  ],
  pageParams: [null, '2'],
});

const ids = (data: ConversationListData | undefined) => data?.pages.flatMap((p) => p.items.map((x) => x.id));

describe('conversation cache', () => {
  it('moves a conversation to the top, de-duplicating across pages', () => {
    expect(ids(moveToTop(list(), c('c')))).toEqual(['c', 'a', 'b']);
    expect(ids(moveToTop(list(), c('new')))).toEqual(['new', 'a', 'b', 'c']);
    expect(moveToTop(undefined, c('x'))).toBeUndefined();
  });

  it('removes from any page', () => {
    expect(ids(removeFromList(list(), 'b'))).toEqual(['a', 'c']);
  });

  it('keeps list and detail caches in sync', () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.conversations.list(), list());

    upsertConversation(qc, c('new', 'New conversation'));
    expect(ids(qc.getQueryData(queryKeys.conversations.list()))).toEqual(['new', 'a', 'b', 'c']);
    expect(qc.getQueryData(queryKeys.conversations.detail('new'))).toMatchObject({ title: 'New conversation' });

    patchConversation(qc, 'new', { title: 'Auto title' });
    expect(qc.getQueryData<Conversation>(queryKeys.conversations.detail('new'))?.title).toBe('Auto title');
    expect(qc.getQueryData<ConversationListData>(queryKeys.conversations.list())?.pages[0]?.items[0]?.title).toBe('Auto title');

    patchConversation(qc, 'c', { last_message_preview: 'hi' }, { toTop: true });
    expect(ids(qc.getQueryData(queryKeys.conversations.list()))).toEqual(['c', 'new', 'a', 'b']);
  });
});
