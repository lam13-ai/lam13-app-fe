import { describe, expect, it } from 'vitest';
import type { MessageView } from '@/types/chat';
import {
  appendMessages,
  emptyMessagesData,
  messageKey,
  removeMessages,
  shareMessages,
  toChronological,
  upsertMessage,
  withConversationId,
  type MessagesData,
} from './messageCache';

const m = (id: string, over: Partial<MessageView> = {}): MessageView => ({
  id,
  conversation_id: 'c1',
  client_message_id: null,
  role: 'assistant',
  kind: 'text',
  content: id,
  audio: null,
  call: null,
  status: 'complete',
  created_at: '',
  ...over,
});

// Two newest-first pages: [m4, m3] then [m2, m1].
const twoPages: MessagesData = {
  pages: [
    { items: [m('m4'), m('m3')], next_cursor: 'm3' },
    { items: [m('m2'), m('m1')], next_cursor: null },
  ],
  pageParams: [null, 'm3'],
};

const ids = (data: MessagesData | undefined) => toChronological(data).map((x) => x.id);

describe('messageCache', () => {
  it('renders pages oldest → newest', () => {
    expect(ids(twoPages)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(ids(undefined)).toEqual([]);
  });

  it('appends optimistic messages at the newest end, creating the cache when absent', () => {
    expect(ids(appendMessages(twoPages, [m('u'), m('a')]))).toEqual(['m1', 'm2', 'm3', 'm4', 'u', 'a']);
    expect(ids(appendMessages(undefined, [m('u')]))).toEqual(['u']);
  });

  it('upserts by stable key or by server id, across pages', () => {
    const optimistic = appendMessages(twoPages, [m('local:a:1', { local_key: 'local:a:1', content: '' })]);
    const reconciled = upsertMessage(optimistic, 'local:a:1', m('srv', { local_key: 'local:a:1', content: 'Hi' }));
    expect(ids(reconciled)).toEqual(['m1', 'm2', 'm3', 'm4', 'srv']);

    // A refetch replaced the local copy with the server copy (no local_key): still matched by id.
    const refetched = appendMessages(twoPages, [m('srv')]);
    const updated = upsertMessage(refetched, 'local:a:1', m('srv', { local_key: 'local:a:1', content: 'Hello' }));
    expect(toChronological(updated).at(-1)?.content).toBe('Hello');

    expect(upsertMessage(twoPages, 'missing', m('zz'))).toBe(twoPages);
    expect(ids(upsertMessage(twoPages, 'm1', m('m1', { content: 'edited' })))).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('keys user messages by client_message_id so optimistic and server copies match', () => {
    expect(messageKey(m('local:c1', { client_message_id: 'c1' }))).toBe('c1');
    expect(messageKey(m('m9', { client_message_id: 'c1' }))).toBe('c1');
  });

  it('removes by key and relabels conversation ids', () => {
    expect(ids(removeMessages(twoPages, ['m2', 'm4']))).toEqual(['m1', 'm3']);
    const moved = withConversationId(appendMessages(emptyMessagesData(), [m('u')]), 'c9');
    expect(toChronological(moved)[0]?.conversation_id).toBe('c9');
  });
});

describe('shareMessages (structural sharing by message, not position)', () => {
  it('a new exchange at the newest end keeps every existing message object', () => {
    const next = appendMessages(twoPages, [m('u5', { role: 'user' }), m('a5')]);
    const shared = shareMessages(twoPages, next) as MessagesData;
    const before = toChronological(twoPages);
    const after = toChronological(shared);
    expect(after.map((x) => x.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'u5', 'a5']);
    before.forEach((message, i) => expect(after[i]).toBe(message));
  });

  it('a refetch returning equal messages (new objects) keeps the previous data object', () => {
    const refetched: MessagesData = JSON.parse(JSON.stringify(twoPages));
    expect(shareMessages(twoPages, refetched)).toBe(twoPages);
  });

  it('a changed message gets a new object; its unchanged neighbours keep theirs', () => {
    const next = upsertMessage(twoPages, 'm3', m('m3', { content: 'edited' }))!;
    const after = toChronological(shareMessages(twoPages, next) as MessagesData);
    const before = toChronological(twoPages);
    expect(after[2]).not.toBe(before[2]);
    expect(after[2]?.content).toBe('edited');
    [0, 1, 3].forEach((i) => expect(after[i]).toBe(before[i]));
  });
});
