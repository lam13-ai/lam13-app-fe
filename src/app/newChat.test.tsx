import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter, queryKeys } from '@/api';
import { renderApp } from './testUtils';

/**
 * "New chat" isolation against the real HTTP adapter and the LAM13 backend's SSE frames. Each POST gets its
 * own stream; the fake backend echoes the client-chosen session and message ids, like routers/chat.py.
 */

const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

interface Post {
  sessionId: string;
  messageId: string;
  text: string;
  assistantId: string;
  push: (text: string) => Promise<void>;
  close: () => Promise<void>;
  fail: () => void;
}

function fakeBackend() {
  const encoder = new TextEncoder();
  const posts: Post[] = [];
  const sessions = new Map<string, { title: string | null; messages: object[] }>();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url === '/chat/stream' && init.method === 'POST') {
      const body = JSON.parse(init.body as string) as { session_id: string; message_id: string; user_message: string };
      let controller!: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
      const assistantId = `ai-${posts.length + 1}`;
      posts.push({
        sessionId: body.session_id,
        messageId: body.message_id,
        text: body.user_message,
        assistantId,
        push: (text) => act(async () => controller.enqueue(encoder.encode(text))),
        fail: () => controller.error(new TypeError('network error')),
        close: () =>
          act(async () => {
            try {
              controller.close();
            } catch {
              // already closed by the reader
            }
          }),
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url === '/chat/sessions') {
      return Response.json([...sessions].map(([sessionId, s]) => ({ sessionId, title: s.title ?? 'New conversation', createdAt: '', updatedAt: '' })));
    }
    const id = /^\/chat\/sessions\/(.+)$/.exec(url)?.[1];
    if (id && sessions.has(id)) return Response.json({ sessionId: id, ...sessions.get(id) });
    return Response.json({ detail: 'Conversation not found' }, { status: 404 });
  });

  /** The backend side of one turn: start → answer tokens → response_completed → done. */
  const answer = async (post: Post, text: string, { finish = true } = {}) => {
    sessions.set(post.sessionId, { title: null, messages: [] });
    await post.push(frame('start', { content: '', session_id: post.sessionId, message_id: post.messageId, assistantMessageId: post.assistantId }));
    await post.push(frame('response_started', { content: 'Generating response...' }));
    await post.push(frame('token', { content: text, source: 'chatbot' }));
    if (!finish) return;
    await finishTurn(post, text);
  };
  const finishTurn = async (post: Post, text: string) => {
    const title = `About ${post.text}`;
    sessions.set(post.sessionId, {
      title,
      messages: [
        { id: post.messageId, role: 'user', content: post.text, status: 'completed' },
        { id: post.assistantId, role: 'assistant', content: text, status: 'completed' },
      ],
    });
    await post.push(frame('response_completed', { content: 'Response completed.' }));
    await post.push(frame('done', { content: '', session_id: post.sessionId, assistantMessageId: post.assistantId, title }));
    await post.close();
  };
  return { api: createHttpAdapter(), posts, answer, finishTurn };
}

async function send(text: string) {
  fireEvent.click(await screen.findByRole('button', { name: /ask lam13/i }, { timeout: 8000 }));
  const textarea = screen.getByLabelText('Message Lam13');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

const header = () => document.querySelector('header')!;
const statusBoxes = () => document.querySelectorAll('[data-activity]').length;
const sidebarRows = () =>
  within(screen.getByRole('navigation', { name: /conversations|history/i }))
    .queryAllByRole('link')
    .map((a) => a.getAttribute('href'));
const newChat = () => fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
/** Every sidebar row, links and the not-yet-created optimistic row alike. */
const sidebar = () => {
  const nav = screen.queryByRole('navigation', { name: 'Conversations' });
  if (!nav) return []; // "No conversations yet."
  return within(nav)
    .queryAllByRole('listitem')
    .map((li) => {
      const link = li.querySelector('a');
      return {
        title: (link ?? li.querySelector('[aria-current]'))?.getAttribute('title') ?? '',
        href: link?.getAttribute('href') ?? null,
        current: Boolean(li.querySelector('[aria-current="page"]')),
      };
    });
};
const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

/** A fresh, empty new chat: suggestions shown, no messages, no activity, composer free. */
async function expectEmptyNewChat(router: { state: { location: { pathname: string } } }) {
  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  expect(await screen.findByText(/Ask me to design, stress-test, or package a strategy/)).toBeTruthy();
  expect(screen.queryByRole('log', { name: 'Conversation' })).toBeNull();
  expect(statusBoxes()).toBe(0);
  expect(within(header()).getByText('Online')).toBeTruthy();
}

afterEach(() => vi.unstubAllGlobals());

describe('New chat isolation', () => {
  it('a completed Chat A never replays in a new chat; Chat B uses only its own ids', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });

    await send('Question A');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const a = backend.posts[0]!;
    await backend.answer(a, 'Answer A');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${a.sessionId}`));
    await screen.findByText('Answer A');
    await waitFor(() => expect(within(header()).getByText('Online')).toBeTruthy());

    newChat();
    await expectEmptyNewChat(router);
    expect(screen.queryByText('Question A')).toBeNull();

    await send('Question B');
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    const b = backend.posts[1]!;
    expect(b.sessionId).not.toBe(a.sessionId);
    expect(b.messageId).not.toBe(a.messageId);
    expect(b.text).toBe('Question B');
    await backend.answer(b, 'Answer B');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${b.sessionId}`));
    await screen.findByText('Answer B');

    // Chat B holds exactly its own exchange.
    const logB = screen.getByRole('log', { name: 'Conversation' });
    expect(within(logB).queryByText('Question A')).toBeNull();
    expect(within(logB).queryByText('Answer A')).toBeNull();
    expect(within(logB).getAllByRole('article')).toHaveLength(1);
    expect(backend.posts).toHaveLength(2);
    // Each conversation exactly once.
    expect(sidebarRows().sort()).toEqual([`/c/${a.sessionId}`, `/c/${b.sessionId}`].sort());
  });

  it('Chat A still streaming: New chat opens empty, A keeps going in the background and shows its answer when revisited', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });

    await send('Question A');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const a = backend.posts[0]!;
    await backend.answer(a, 'Answer A', { finish: false }); // tokens arriving, not complete
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${a.sessionId}`));

    newChat();
    await expectEmptyNewChat(router);
    // Composer is free in the new chat (A's stream belongs to A).
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();

    // A finishes while B is open: nothing of it appears here.
    await backend.finishTurn(a, 'Answer A');
    expect(screen.queryByText('Answer A')).toBeNull();
    expect(screen.queryByText('Question A')).toBeNull();
    expect(statusBoxes()).toBe(0);

    // Back to A: its whole answer, once.
    fireEvent.click(screen.getByRole('link', { name: /About Question A/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${a.sessionId}`));
    expect(await screen.findByText('Answer A')).toBeTruthy();
    expect(within(screen.getByRole('log', { name: 'Conversation' })).getAllByRole('article')).toHaveLength(1);
    expect(sidebarRows()).toEqual([`/c/${a.sessionId}`]);
  });

  it('New chat before Chat A has even started (no session yet): the new chat is empty and free; A lands in its own conversation', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });

    await send('Question A');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const a = backend.posts[0]!;

    newChat();
    await expectEmptyNewChat(router);
    expect(screen.queryByRole('button', { name: 'Stop generating' })).toBeNull();

    // A's session starts and completes while B is open: B stays empty and on `/`.
    await backend.answer(a, 'Answer A');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByText('Question A')).toBeNull();
    expect(statusBoxes()).toBe(0);
    await waitFor(() => expect(sidebarRows()).toEqual([`/c/${a.sessionId}`]));

    // B's own send uses only B's ids.
    await send('Question B');
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    expect(backend.posts[1]!.sessionId).not.toBe(a.sessionId);
  });
});

describe('New chat: optimistic sidebar row', () => {
  it('appears at once titled from the message and stays one row through a delayed start, tokens, completion and the backend title', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });
    await screen.findByText('No conversations yet.');

    await send('  Explain   artificial intelligence and its impact on fintech  ');
    // A/B: at once, before the backend has sent anything: one current row with a clean title.
    const optimistic = { title: 'Explain artificial intelligence and its…', href: null, current: true };
    await waitFor(() => expect(sidebar()).toEqual([optimistic]));
    expect(router.state.location.pathname).toBe('/');

    // A realistic delay before `start`: still exactly that one row.
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    await pause(300);
    expect(sidebar()).toEqual([optimistic]);

    // C/D: `start` turns the row into the real conversation in place (same title, now a link, current).
    const post = backend.posts[0]!;
    await backend.answer(post, 'AI changes fintech.', { finish: false });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${post.sessionId}`));
    expect(sidebar()).toEqual([{ title: 'Explain artificial intelligence and its…', href: `/c/${post.sessionId}`, current: true }]);

    // Delayed tokens while the answer is buffered: the sidebar doesn't change.
    await pause(200);
    await post.push(frame('token', { content: ' More.', source: 'chatbot' }));
    await pause(200);
    expect(statusBoxes()).toBe(1);
    expect(sidebar()).toHaveLength(1);

    // E/I: completion with the backend's own title: the same single row, retitled.
    await backend.finishTurn(post, 'AI changes fintech. More.');
    await waitFor(() =>
      expect(sidebar()).toEqual([{ title: `About ${post.text.trim()}`, href: `/c/${post.sessionId}`, current: true }]),
    );
  });

  it('H: a sidebar refetch, before or after the server has the conversation, never duplicates it', async () => {
    const mount = vi.spyOn(QueryClient.prototype, 'mount');
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    const queryClient = mount.mock.contexts[0] as QueryClient;
    await screen.findByText('No conversations yet.');

    await send('Question A');
    await waitFor(() => expect(sidebar()).toHaveLength(1));
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const post = backend.posts[0]!;
    // Refetch before `start`: the server doesn't list it yet; the row comes back, once, at `start`.
    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.conversations.list() }));
    await backend.answer(post, 'Answer A');
    await waitFor(() => expect(sidebar()).toEqual([{ title: 'About Question A', href: `/c/${post.sessionId}`, current: true }]));
    // Refetch after the server has it.
    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.conversations.list() }));
    expect(sidebar()).toEqual([{ title: 'About Question A', href: `/c/${post.sessionId}`, current: true }]);
    mount.mockRestore();
  });

  it('F: New chat before `start` keeps A as one row, B gets its own, and A lands on its real id', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });
    await screen.findByText('No conversations yet.');

    await send('Question A');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const a = backend.posts[0]!;
    newChat();
    await expectEmptyNewChat(router);
    expect(sidebar().map((r) => r.title)).toEqual(['Question A']);

    await backend.answer(a, 'Answer A');
    await waitFor(() => expect(sidebar()).toEqual([expect.objectContaining({ title: 'About Question A', href: `/c/${a.sessionId}` })]));

    await send('Question B');
    await waitFor(() => expect(sidebar().map((r) => r.title)).toEqual(['Question B', 'About Question A']));
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    const b = backend.posts[1]!;
    await backend.answer(b, 'Answer B');
    await waitFor(() => expect(sidebar().map((r) => r.href)).toEqual([`/c/${b.sessionId}`, `/c/${a.sessionId}`]));
  });

  it('G: Chat A streaming in the background does not touch Chat B’s optimistic row', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: backend.api });
    await screen.findByText('No conversations yet.');

    await send('Question A');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const a = backend.posts[0]!;
    await backend.answer(a, 'Answer A', { finish: false });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${a.sessionId}`));

    newChat();
    await expectEmptyNewChat(router);
    await send('Question B');
    await waitFor(() =>
      expect(sidebar()).toEqual([
        { title: 'Question B', href: null, current: true },
        { title: 'Question A', href: `/c/${a.sessionId}`, current: false },
      ]),
    );

    // A finishes (retitled, and moved up as the most recently active) in the background: B's row is
    // untouched and A is still one row.
    await backend.finishTurn(a, 'Answer A');
    await waitFor(() =>
      expect(sidebar()).toEqual([
        { title: 'About Question A', href: `/c/${a.sessionId}`, current: false },
        { title: 'Question B', href: null, current: true },
      ]),
    );
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    const b = backend.posts[1]!;
    await backend.answer(b, 'Answer B');
    await waitFor(() => expect(sidebar().map((r) => r.href).sort()).toEqual([`/c/${a.sessionId}`, `/c/${b.sessionId}`].sort()));
    expect(sidebar().filter((r) => r.current)).toEqual([expect.objectContaining({ href: `/c/${b.sessionId}` })]);
  });

  it('a send that fails before the conversation exists leaves no dead row, and Retry brings back exactly one', async () => {
    const backend = fakeBackend();
    renderApp('/', { api: backend.api });
    await screen.findByText('No conversations yet.');

    await send('Question A');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    await act(async () => backend.posts[0]!.fail());
    await screen.findByText('No conversations yet.');
    expect(sidebar()).toEqual([]);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(sidebar().map((r) => r.title)).toEqual(['Question A']));
    await waitFor(() => expect(backend.posts).toHaveLength(2));
    expect(backend.posts[1]!.sessionId).toBe(backend.posts[0]!.sessionId);
    await backend.answer(backend.posts[1]!, 'Answer A');
    await waitFor(() => expect(sidebar()).toEqual([expect.objectContaining({ title: 'About Question A' })]));
  });
});
