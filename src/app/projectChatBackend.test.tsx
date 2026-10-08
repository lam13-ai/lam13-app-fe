import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { renderApp } from './testUtils';

/**
 * A chat started inside a project, end to end over the real (HTTP) adapter against a fake backend: the
 * message is sent on the existing `POST /chat/stream` with the project's id, the chat moves to the
 * project's own URL and list, and it never appears in the personal sidebar.
 */

const find = { timeout: 8000 };
const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const PROJECT = { id: 'p1', name: 'Water strategy', instructions: '', summary: '', owner_id: 'u1', role: 'owner', created_at: '2026-10-01T09:00:00', updated_at: '2026-10-07T12:00:00' };

function fakeBackend() {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const projectChats: object[] = [];
  const personal: object[] = [{ sessionId: 'mine-1', title: 'A personal chat', createdAt: '2026-10-01T09:00:00', updatedAt: '2026-10-01T09:00:00' }];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    if (url === '/chat/stream' && init.method === 'POST') {
      const body = JSON.parse(init.body as string) as Record<string, string>;
      posts.push({ url, body });
      // What the backend does with project_id: the chat is the project's, and stays out of /chat/sessions.
      (body.project_id ? projectChats : personal).unshift(
        body.project_id
          ? { sessionId: body.session_id, title: 'KPI shortlist', projectId: body.project_id, createdBy: 'u1', createdAt: '2026-10-07T12:00:00', updatedAt: '2026-10-07T12:00:00' }
          : { sessionId: body.session_id, title: 'Personal follow-up', createdAt: '2026-10-07T12:00:00', updatedAt: '2026-10-07T12:00:00' },
      );
      const encoder = new TextEncoder();
      const chunks = [
        frame('start', { content: '', session_id: body.session_id, message_id: body.message_id, assistantMessageId: 'a-1' }),
        frame('token', { content: 'Here is the shortlist.', source: 'chatbot' }),
        frame('response_completed', { content: 'Response completed.' }),
        frame('done', { content: '', session_id: body.session_id, assistantMessageId: 'a-1', title: 'KPI shortlist' }),
      ];
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => (chunks.forEach((x) => c.enqueue(encoder.encode(x))), c.close()) }), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    const parts: Record<string, unknown> = {
      '/chat/sessions': personal,
      '/projects': [PROJECT],
      '/projects/p1': PROJECT,
      '/projects/p1/chats': projectChats,
      '/projects/p1/files': [],
      '/projects/p1/folders': [],
      '/projects/p1/members': [{ user_id: 'u1', name: 'Joseph Boutros', email: 'joseph@example.com', role: 'owner', created_at: '2026-10-01T09:00:00' }],
      '/projects/p1/contacts': [],
    };
    if (url in parts) return Response.json(parts[url]);
    const session = /^\/chat\/sessions\/(.+)$/.exec(url)?.[1];
    const chat = session && ([...projectChats, ...personal] as { sessionId: string; title: string; projectId?: string }[]).find((c) => c.sessionId === session);
    if (chat) {
      return Response.json({ sessionId: chat.sessionId, title: chat.title, projectId: chat.projectId ?? null, messages: [
        { id: 'u-1', role: 'user', content: 'Shortlist the KPIs', status: 'completed' },
        { id: 'a-1', role: 'assistant', content: 'Here is the shortlist.', status: 'completed' },
      ] });
    }
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  return { posts };
}

const sidebarLinks = () => within(screen.getByRole('navigation', { name: 'Conversations' })).getAllByRole('link').map((a) => a.getAttribute('href'));

async function send(text: string) {
  const box = () => screen.getByLabelText('Message Lam13') as HTMLTextAreaElement;
  await waitFor(() => expect(box().disabled).toBe(false), find);
  fireEvent.change(box(), { target: { value: text } });
  await waitFor(() => expect(box().value).toBe(text));
  fireEvent.keyDown(box(), { key: 'Enter' });
}

afterEach(() => vi.unstubAllGlobals());

describe('a chat started in a project (real adapter)', () => {
  it('is sent with the project’s id, lands under the project, and stays out of the personal sidebar', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/projects/p1/new', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
    await screen.findByRole('button', { name: 'Project: Water strategy' }, find);
    await waitFor(() => expect(sidebarLinks()).toContain('/c/mine-1'));

    await send('Shortlist the KPIs');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const { body } = backend.posts[0]!;
    expect(body.project_id).toBe('p1');
    expect(body.user_message).toBe('Shortlist the KPIs');
    expect(Object.keys(body).sort()).toEqual(['message_id', 'project_id', 'session_id', 'user_message']);

    // It moves to the project's URL for it (not /c/…), and the answer streamed through the usual pipeline.
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/p1/c/${body.session_id}`), find);
    expect(await within(screen.getByRole('log', { name: 'Conversation' })).findByText('Here is the shortlist.', {}, find)).toBeTruthy();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    // Never in the personal sidebar: not as an optimistic row, not after the stream, not after a refetch.
    expect(sidebarLinks().filter((href) => href?.includes(String(body.session_id)))).toEqual([]);
    expect(within(screen.getByRole('navigation', { name: 'Conversations' })).queryByText(/Shortlist the KPIs|KPI shortlist/)).toBeNull();
    expect(sidebarLinks()).toContain('/c/mine-1');

    // The project's own list has it.
    await act(() => router.navigate('/projects/p1'));
    const list = await screen.findByRole('list', { name: 'Project chats' }, find);
    await waitFor(() => expect(within(list).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([`/projects/p1/c/${body.session_id}`]));
    expect(within(list).getByText('KPI shortlist')).toBeTruthy();
  });

  it('a personal chat is sent exactly as before: no project id, and it shows in the sidebar', async () => {
    const backend = fakeBackend();
    const { router } = renderApp('/', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
    await waitFor(() => expect(sidebarLinks()).toContain('/c/mine-1'), find);
    await send('A personal question');
    await waitFor(() => expect(backend.posts).toHaveLength(1));
    const { body } = backend.posts[0]!;
    expect(Object.keys(body).sort()).toEqual(['message_id', 'session_id', 'user_message']);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${body.session_id}`), find);
    await waitFor(() => expect(sidebarLinks()).toContain(`/c/${body.session_id}`));
  });
});
