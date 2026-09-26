import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/api';
import { createHttpAdapter } from '@/api/http';
import { initialStreamState, useStreamStore } from '@/stores/streamStore';
import type { Conversation, Page } from '@/types/api';
import { createChatActions } from './chatStream';
import { newChatKey, toChronological, type MessagesData } from './messageCache';

/**
 * The real FastAPI `/chat/stream` vocabulary, pushed frame by frame through the real HTTP adapter (fetch
 * stubbed), SSE parser, translation, reducer and batched cache writes. `server` is what the backend's
 * `GET /chat/sessions/{id}` returns.
 */
type ConversationListData = InfiniteData<Page<Conversation>, string | null>;

function harness() {
  const encoder = new TextEncoder();
  const posts: { body: Record<string, unknown>; signal: AbortSignal }[] = [];
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const server: { messages: { id: string; role: string; content: string; status: string }[] } = { messages: [] };

  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    if (init.method === 'POST' && url === '/chat/stream') {
      posts.push({ body: JSON.parse(init.body as string), signal: init.signal! });
      const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }
    const session = /^\/chat\/sessions\/(.+)$/.exec(url)?.[1];
    if (session) return Response.json({ sessionId: session, title: null, messages: server.messages });
    return new Response('{}', { status: 404 });
  });

  const queryClient = new QueryClient();
  // The sidebar's list is loaded (empty) before the first send.
  queryClient.setQueryData<ConversationListData>(queryKeys.conversations.list(), { pages: [{ items: [], next_cursor: null }], pageParams: [null] });
  const actions = createChatActions({ api: createHttpAdapter(), queryClient });
  const push = (event: string, data: object) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  const messages = (key: string) => toChronological(queryClient.getQueryData<MessagesData>(queryKeys.messages(key)));
  return {
    posts,
    server,
    actions,
    queryClient,
    push,
    raw: (frame: string) => controller.enqueue(encoder.encode(frame)),
    fail: () => controller.error(new TypeError('network error')),
    messages,
    assistant: (key = 's1') => messages(key).find((m) => m.role === 'assistant'),
    phase: (key = 's1') => useStreamStore.getState().active[key]?.phase,
    sidebar: () => queryClient.getQueryData<ConversationListData>(queryKeys.conversations.list())?.pages.flatMap((p) => p.items) ?? [],
  };
}

const start = (session = 's1') => ({ content: '', session_id: session, message_id: 'c1', assistantMessageId: 'a1' });
const token = (content: string) => ['token', { content, source: 'chatbot' }] as const;
const thinking = (content: string) => ['thinking', { content, source: 'chatbot', mode: 'token' }] as const;
const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  useStreamStore.setState(initialStreamState);
  vi.unstubAllGlobals();
  setVisibility('visible');
});

describe('real backend SSE → visible assistant message', () => {
  it('thinking → preparing → generating → answering: reasoning, then the answer stream in live; post-processing steps show until the stream closes', async () => {
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');

    expect(h.phase()).toBe('sending'); // "Thinking…"
    await waitFor(() => expect(h.posts).toHaveLength(1));
    h.push('start', start());
    await waitFor(() => expect(h.phase()).toBe('preparing'));
    h.push('response_started', { content: 'Generating response...' });
    await waitFor(() => expect(h.phase()).toBe('generating'));
    h.push(...thinking('Plan the'));
    h.push(...thinking(' answer'));
    // The reasoning streams into the message (live, still open); the answer has no text yet.
    await waitFor(() => expect(h.assistant()?.reasoning?.text).toBe('Plan the answer'));
    expect(h.assistant()?.reasoning?.endedAt).toBeUndefined();
    expect(h.phase()).toBe('generating'); // reasoning never moves it back to Thinking
    expect(h.assistant()).toMatchObject({ id: 'a1', content: '', status: 'streaming' });

    // Tokens are written as they arrive; the first one ends the thinking.
    const shown = new Set<string>();
    const unsubscribe = h.queryClient.getQueryCache().subscribe(() => shown.add(h.assistant()?.content ?? ''));
    h.push(...token('Great q'));
    await waitFor(() => expect(h.phase()).toBe('answering'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Great q'));
    expect(h.assistant()?.reasoning?.endedAt).toEqual(expect.any(Number));
    h.push(...token('uestion, Aash'));
    h.push(...token('ir! Here is:\n\n**'));
    h.push(...token('Bold** and\n\n- a list'));
    h.push('mystery_event', { content: 'ignored' });
    h.raw('event: token\ndata: {not json\n\n'); // malformed: skipped
    const answer = 'Great question, Aashir! Here is:\n\n**Bold** and\n\n- a list';
    await waitFor(() => expect(h.assistant()?.content).toBe(answer));
    expect(h.assistant()?.status).toBe('streaming');

    h.push('response_completed', { content: 'Response completed.' });
    await waitFor(() => expect(h.assistant()?.status).toBe('complete'));
    // After the answer, the backend keeps working: its latest step shows on the message.
    h.push('postprocess_started', { content: 'Running post-processing...' });
    h.push('progress', { content: 'Building framework pillars', source: 'eshmun' });
    await waitFor(() => expect(h.assistant()?.progress).toBe('Building framework pillars'));
    h.push('postprocess_completed', { content: 'Post-processing complete.' });
    h.push('done', { content: '', session_id: 's1', assistantMessageId: 'a1', title: 'Explaining X' });
    await sent;
    unsubscribe();

    // Streamed in pieces (partial text was shown), every token in order, and the finished message keeps
    // its reasoning (closed) while the progress line is gone.
    expect([...shown].some((c) => c !== '' && c !== answer)).toBe(true);
    expect(h.assistant()).toMatchObject({ content: answer, status: 'complete', progress: null });
    expect(h.assistant()?.reasoning).toMatchObject({ text: 'Plan the answer', endedAt: expect.any(Number) });
    expect(h.messages('s1').map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('new chat: one send = one session, one conversation row, one user + one assistant message, stable id', async () => {
    const h = harness();
    const sent = h.actions.send(undefined, 'Explain X', { origin: 'view-1' });
    await waitFor(() => expect(h.posts).toHaveLength(1));
    // The client names the session: the same id the backend echoes in `start`.
    const sessionId = h.posts[0]!.body.session_id as string;
    expect(sessionId).toBe(h.posts[0]!.body.message_id);

    h.push('start', start(sessionId));
    await waitFor(() => expect(useStreamStore.getState().created).toEqual({ id: sessionId, origin: 'view-1' }));
    h.push(...token('Hello'));
    h.push('response_completed', {});
    h.push('done', { session_id: sessionId, assistantMessageId: 'a1', title: 'Greeting' });
    await sent;

    expect(h.posts).toHaveLength(1);
    expect(h.sidebar()).toEqual([expect.objectContaining({ id: sessionId, title: 'Greeting' })]);
    expect(h.messages(sessionId).map((m) => [m.role, m.conversation_id, m.content])).toEqual([
      ['user', sessionId, 'Explain X'],
      ['assistant', sessionId, 'Hello'],
    ]);
  });

  it('new chat: Retry after the stream dropped before `start` resends to the SAME session (no second conversation)', async () => {
    const h = harness();
    const sent = h.actions.send(undefined, 'Explain X', { origin: 'view-1' });
    await waitFor(() => expect(h.posts).toHaveLength(1));
    h.fail(); // the backend may already be generating; the client never learned the session
    await sent;
    const user = h.messages(newChatKey('view-1')).find((m) => m.role === 'user')!;
    expect(user.status).toBe('error');

    const retried = h.actions.retry(newChatKey('view-1'), user, h.messages(newChatKey('view-1')), { origin: 'view-1' });
    await waitFor(() => expect(h.posts).toHaveLength(2));
    expect(h.posts[1]!.body.session_id).toBe(h.posts[0]!.body.session_id);
    const sessionId = h.posts[1]!.body.session_id as string;
    h.push('start', start(sessionId));
    h.push(...token('Hello'));
    h.push('response_completed', {});
    h.push('done', { session_id: sessionId, assistantMessageId: 'a1' });
    await retried;
    expect(h.sidebar().map((c) => c.id)).toEqual([sessionId]);
    expect(h.messages(sessionId).map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('a hidden tab (no animation frames) neither aborts nor stops the answer streaming in (timer fallback)', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1); // background tab: frames never come
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');
    await waitFor(() => expect(h.posts).toHaveLength(1));
    h.push('start', start());
    h.push(...token('Before '));
    await waitFor(() => expect(h.phase()).toBe('answering'));

    setVisibility('hidden');
    h.push(...token('while '));
    h.push(...token('hidden'));
    await tick(150); // past the batcher's background flush
    expect(h.posts[0]!.signal.aborted).toBe(false);
    expect(h.assistant()).toMatchObject({ content: 'Before while hidden', status: 'streaming' });

    setVisibility('visible');
    h.push(...token('.'));
    h.push('response_completed', {});
    h.push('done', { session_id: 's1', assistantMessageId: 'a1' });
    await sent;
    expect(h.posts[0]!.signal.aborted).toBe(false);
    expect(h.messages('s1').map((m) => [m.role, m.status])).toEqual([
      ['user', 'complete'],
      ['assistant', 'complete'],
    ]);
    expect(h.assistant()?.content).toBe('Before while hidden.');
  });

  it('only an explicit Stop cancels, and it keeps the partial answer', async () => {
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');
    await waitFor(() => expect(h.posts).toHaveLength(1));
    h.push('start', start());
    h.push(...token('Partial '));
    h.push(...token('answer'));
    await waitFor(() => expect(h.phase()).toBe('answering'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Partial answer')); // streamed in
    setVisibility('hidden');
    setVisibility('visible');
    expect(h.posts[0]!.signal.aborted).toBe(false);

    h.actions.stop('s1');
    await sent;
    expect(h.posts[0]!.signal.aborted).toBe(true);
    expect(h.assistant()).toMatchObject({ content: 'Partial answer', status: 'cancelled' });
  });

  it('a dropped connection keeps the partial answer with the error, then catches up with the server copy — never with less', async () => {
    const h = harness();
    const sent = h.actions.send('s1', 'Explain X');
    await waitFor(() => expect(h.posts).toHaveLength(1));
    h.push('start', start());
    h.push(...token('Partial answer'));
    await waitFor(() => expect(h.phase()).toBe('answering'));
    await waitFor(() => expect(h.assistant()?.content).toBe('Partial answer')); // streamed in

    // The backend saves in chunks: its copy is still shorter than what was shown.
    h.server.messages = [
      { id: 'c1', role: 'user', content: 'Explain X', status: 'completed' },
      { id: 'a1', role: 'assistant', content: 'Partial', status: 'generating' },
    ];
    h.fail();
    await sent;
    expect(h.assistant()).toMatchObject({ content: 'Partial answer', status: 'error' });
    expect(Object.values(useStreamStore.getState().failures)).toEqual([expect.objectContaining({ retryable: true })]);
    await tick(50);
    expect(h.assistant()).toMatchObject({ content: 'Partial answer', status: 'error' }); // not replaced by less

    // The server kept generating and finished: its answer replaces the partial one, in place.
    h.server.messages[1] = { id: 'a1', role: 'assistant', content: 'Partial answer, completed.', status: 'completed' };
    await waitFor(() => expect(h.assistant()).toMatchObject({ content: 'Partial answer, completed.', status: 'complete' }), { timeout: 5000 });
    expect(h.messages('s1').map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(useStreamStore.getState().failures).toEqual({});
  });
});
