import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createHttpAdapter, createMockAdapter, INSTANT_TIMING, type ApiAdapter } from '@/api';
import { PROJECT_CHAT_SEEDS } from '@/api/mock/projectChatFixtures';
import { createMockProjects } from '@/api/mock/workspace';
import { renderApp } from './testUtils';

/**
 * The project chat workspace: a project's conversations, opening one in the ordinary chat view under
 * `/projects/:projectId/c/:conversationId`, starting a new one, and the Project details panel. The sample
 * projects' conversations are demo data with their own message histories (no backend).
 */

const find = { timeout: 8000 };
const chats = () => screen.findByRole('list', { name: 'Project chats' }, find);
const titles = (list: HTMLElement) => within(list).getAllByRole('link').map((a) => a.querySelector('.font-bold')?.textContent);
const log = () => screen.getByRole('log', { name: 'Conversation' });
/** The page (not the sidebar, which has its own New chat). */
const page = (title: string) => within(screen.getByRole('region', { name: title }));
const seedsOf = (projectId: string) => PROJECT_CHAT_SEEDS.filter((s) => s.projectId === projectId);

async function sendMessage(text: string) {
  const collapsed = screen.queryByRole('button', { name: /ask lam13/i });
  if (collapsed) fireEvent.click(collapsed);
  const textarea = screen.getByLabelText('Message Lam13');
  fireEvent.change(textarea, { target: { value: text } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

/** A mock adapter whose `projects` part is replaced (e.g. to fail, or to have a project with no chats). */
const adapterWith = (projects: Partial<ApiAdapter['projects']>): ApiAdapter => {
  const api = createMockAdapter({ timing: INSTANT_TIMING });
  return { ...api, projects: { ...api.projects, ...projects } };
};
/** Every project starts with no conversations. */
const withoutChats = (): ApiAdapter => ({ ...createMockAdapter({ timing: INSTANT_TIMING }), projects: createMockProjects() });

afterEach(() => vi.unstubAllGlobals());

describe('Demo project conversations', () => {
  it('every sample project has conversations, each with a believable two-sided history', () => {
    for (const projectId of ['water-security', 'ai-strategy', 'digital-services']) expect(seedsOf(projectId).length).toBeGreaterThanOrEqual(2);
    expect(new Set(PROJECT_CHAT_SEEDS.map((s) => s.id)).size).toBe(PROJECT_CHAT_SEEDS.length); // unique ids
    for (const seed of PROJECT_CHAT_SEEDS) {
      expect(seed.turns.length).toBeGreaterThanOrEqual(2);
      for (const turn of seed.turns) {
        expect(turn.user.length).toBeGreaterThan(20);
        expect(turn.assistant.length).toBeGreaterThan(80);
      }
    }
  });

  it.each(PROJECT_CHAT_SEEDS.map((s) => [s.projectId, s.id, s] as const))('%s / %s opens with its seeded history (direct link)', async (projectId, id, seed) => {
    renderApp(`/projects/${projectId}/c/${id}`);
    await screen.findByRole('log', { name: 'Conversation' }, find);
    expect(screen.getByRole('heading', { level: 1, name: seed.title })).toBeTruthy();
    expect(screen.queryByText("Couldn't load this conversation.")).toBeNull();
    expect(within(log()).getAllByRole('article')).toHaveLength(seed.turns.length); // one answer per turn
    for (const turn of seed.turns) expect(within(log()).getByText(turn.user)).toBeTruthy();
    // The history is this conversation's own: nothing from another seed.
    const other = PROJECT_CHAT_SEEDS.find((s) => s.id !== id)!;
    expect(within(log()).queryByText(other.turns[0]!.user)).toBeNull();
  });

  it('with the real (HTTP) adapter and no reachable backend, a demo conversation still opens — and reopens after a reload', async () => {
    // Every backend request fails, as when the API is down.
    const fetchSpy = vi.fn(async (url: string): Promise<Response> => {
      throw new TypeError(`Failed to fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const open = async () => {
      const view = renderApp('/projects/water-security/c/ws-c1', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
      await screen.findByRole('log', { name: 'Conversation' }, find);
      expect(await screen.findByRole('heading', { level: 1, name: 'Water security baseline' }, find)).toBeTruthy();
      expect(within(log()).getByText(/Which year should we use as the baseline/)).toBeTruthy();
      expect(within(log()).getByText(/Recommendation: use 2022/)).toBeTruthy();
      expect(screen.queryByText("Couldn't load this conversation.")).toBeNull();
      return view;
    };
    await open();
    // No request for the demo conversation itself ever went to the backend.
    expect(fetchSpy.mock.calls.map((c) => String(c[0])).filter((url) => url.includes('ws-c1'))).toEqual([]);
    document.body.innerHTML = '';
    await open(); // a fresh adapter, as after a browser refresh
  });

  it('with the HTTP adapter the project lists the chats the backend returns for it, which are not in the personal history', async () => {
    const project = { id: 'p1', name: 'Water strategy', instructions: '', summary: '', owner_id: 'u1', role: 'owner', created_at: '2026-10-01T09:00:00', updated_at: '2026-10-07T12:00:00' };
    const parts: Record<string, unknown> = {
      '/projects/p1': project,
      '/projects/p1/chats': [
        { sessionId: 's-old', title: 'Baseline questions', projectId: 'p1', createdBy: 'u1', createdAt: '2026-10-05T10:00:00', updatedAt: '2026-10-05T11:00:00' },
        { sessionId: 's-new', title: 'KPI shortlist', projectId: 'p1', createdBy: 'u2', createdAt: '2026-10-06T10:00:00', updatedAt: '2026-10-07T08:00:00' },
      ],
      '/projects/p1/files': [],
      '/projects/p1/folders': [],
      '/projects/p1/members': [{ user_id: 'u1', name: 'Joseph Boutros', email: 'joseph@example.com', role: 'owner', created_at: '2026-10-01T09:00:00' }],
      '/projects/p1/contacts': [],
      '/chat/sessions': [], // the personal history has none of them
    };
    vi.stubGlobal('fetch', async (url: string) => (url in parts ? Response.json(parts[url]) : Response.json({ detail: 'Not Found' }, { status: 404 })));
    renderApp('/projects/p1', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
    expect(await screen.findByRole('heading', { level: 1, name: 'Water strategy' }, find)).toBeTruthy();
    const list = await chats();
    expect(titles(list)).toEqual(['KPI shortlist', 'Baseline questions']); // most recently active first
    expect(within(list).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/projects/p1/c/s-new', '/projects/p1/c/s-old']);
    // Rename and delete are offered on each of the project's chats.
    expect(within(list).getByRole('button', { name: 'Actions for KPI shortlist' })).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it('an unknown conversation id is a not-found page', async () => {
    renderApp('/projects/water-security/c/does-not-exist');
    expect(await screen.findByText('Not found.', {}, find)).toBeTruthy();
  });
});

describe('Project workspace', () => {
  it('shows the project title, New chat, and its conversations with title and time', async () => {
    renderApp('/projects/water-security');
    expect(await screen.findByRole('heading', { level: 1, name: 'National Water Security Strategy' }, find)).toBeTruthy();
    expect(page('National Water Security Strategy').getByRole('button', { name: 'New chat' })).toBeTruthy();
    const list = await chats();
    expect(titles(list)).toEqual(seedsOf('water-security').map((s) => s.title)); // newest first, as seeded
    for (const link of within(list).getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\/projects\/water-security\/c\/ws-c\d$/);
      expect(link.textContent).toMatch(/ago|just now|\d{1,2} \w{3}|\w{3} \d{1,2}/); // last updated
    }
  });

  it('each project lists only its own conversations (switching projects)', async () => {
    const { router } = renderApp('/projects/water-security');
    const water = titles(await chats());
    await router.navigate('/projects/ai-strategy');
    await screen.findByRole('heading', { level: 1, name: 'National AI Strategy' }, find);
    const ai = titles(await chats());
    expect(ai).toEqual(seedsOf('ai-strategy').map((s) => s.title));
    expect(water.some((t) => ai.includes(t))).toBe(false);
  });

  it('clicking a listed conversation opens it with its history; the sidebar history does not list demo chats', async () => {
    const { router } = renderApp('/projects/digital-services');
    const list = await chats();
    fireEvent.click(within(list).getByRole('link', { name: /Targets for the licensing service/ }));
    await screen.findByRole('log', { name: 'Conversation' }, find);
    expect(router.state.location.pathname).toBe('/projects/digital-services/c/ds-c2');
    expect(within(log()).getByText(/Set first-year targets for the online business licensing service/)).toBeTruthy();
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/c/ds-c2')).toBe(false);
  });

  it('a project without chats shows the empty state, which starts a new project chat', async () => {
    const { router } = renderApp('/projects/digital-services', { api: withoutChats() });
    expect(await screen.findByText('No chats in this project yet.', {}, find)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start a chat' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/digital-services/new'));
  });

  it('loading and error states: a skeleton while the project loads, a retry when it fails', async () => {
    let fail = true;
    const real = createMockProjects();
    renderApp('/projects/water-security', {
      api: adapterWith({
        get: async (id) => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          if (fail) throw new ApiError(500, 'server_error', 'boom');
          return real.get(id);
        },
      }),
    });
    expect(await screen.findByRole('status', { name: 'Loading project' }, find)).toBeTruthy();
    expect(await screen.findByText("Couldn't load this project.", {}, find)).toBeTruthy();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'National Water Security Strategy' }, find)).toBeTruthy();
  });
});

describe('Project chat', () => {
  it('opening a conversation shows the ordinary chat with the project in the header', async () => {
    renderApp('/projects/water-security/c/ws-c2');
    await screen.findByRole('log', { name: 'Conversation' }, find);
    expect(screen.getByRole('heading', { level: 1, name: 'Drafting KPIs for the 2030 targets' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Project: National Water Security Strategy' }, find)).toBeTruthy();
    // The same chat interface: composer, model selector, attachments.
    { const pill = screen.queryByRole('button', { name: /ask lam13/i }); if (pill) fireEvent.click(pill); }
    expect(screen.getByRole('button', { name: 'Model: Lam' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add files or context|Add attachment/ })).toBeTruthy();
  });

  it('the project menu lists the project’s chats with the open one marked, and switches to another with its own messages', async () => {
    const { router } = renderApp('/projects/water-security/c/ws-c1');
    await screen.findByRole('log', { name: 'Conversation' }, find);
    fireEvent.click(await screen.findByRole('button', { name: 'Project: National Water Security Strategy' }, find));
    const list = await chats();
    const current = within(list).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.getAttribute('href'))).toEqual(['/projects/water-security/c/ws-c1']);

    fireEvent.click(within(list).getByRole('link', { name: /Board deck narrative/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/water-security/c/ws-c4'));
    expect(await screen.findByText(/Outline the narrative for the board deck/, {}, find)).toBeTruthy();
    expect(within(log()).queryByText(/Which year should we use as the baseline/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Project: National Water Security Strategy' })).toBeTruthy();
  });

  it('New chat creates a conversation in the project: it gets a project URL and appears in the project’s list', async () => {
    const { router } = renderApp('/projects/digital-services', { api: withoutChats() });
    await screen.findByText('No chats in this project yet.', {}, find);
    fireEvent.click(page('Digital Services KPI Framework').getByRole('button', { name: 'New chat' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New chat' }, find)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Project: Digital Services KPI Framework' }, find)).toBeTruthy();

    await sendMessage('Draft KPIs for digital identity');
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/projects\/digital-services\/c\/.+/), find);
    expect(within(log()).getByText('Draft KPIs for digital identity')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Online')).toBeTruthy(), { timeout: 12_000 });
    const id = router.state.location.pathname.split('/').pop()!;

    // Back in the workspace the new conversation is listed (and marked as the one just open); other projects are unchanged.
    fireEvent.click(screen.getByRole('button', { name: 'Project: Digital Services KPI Framework' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    const links = within(await chats()).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([`/projects/digital-services/c/${id}`]);
    expect(links[0]!.getAttribute('aria-current')).toBe('page');
    await router.navigate('/projects/ai-strategy');
    await screen.findByRole('heading', { level: 1, name: 'National AI Strategy' }, find);
    expect(await screen.findByText('No chats in this project yet.', {}, find)).toBeTruthy();
    // It is still an ordinary conversation: the global history has it too.
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === `/c/${id}`)).toBe(true);
  });

  it('Project details opens Instructions and Archives beside the chat, and closing returns to the same chat state', async () => {
    renderApp('/projects/water-security/c/ws-c1');
    await screen.findByRole('log', { name: 'Conversation' }, find);
    { const pill = screen.queryByRole('button', { name: /ask lam13/i }); if (pill) fireEvent.click(pill); }
    fireEvent.change(screen.getByLabelText('Message Lam13'), { target: { value: 'half-written question' } });
    const history = log().textContent;

    fireEvent.click(await screen.findByRole('button', { name: 'Project details' }, find));
    const panel = await screen.findByRole('dialog', { name: 'Project details' });
    expect(panel.closest('[inert]')).toBeNull(); // open
    expect(within(panel).getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Instructions', 'Archives']);
    expect((within(panel).getByRole('textbox', { name: 'Project instructions' }) as HTMLTextAreaElement).value).toMatch(/^Write for ministry leadership/);

    expect(within(panel).queryByRole('tab', { name: /Context/ })).toBeNull();
    fireEvent.click(within(panel).getByRole('tab', { name: /Archives/ }));
    expect(within(within(panel).getByRole('list', { name: 'Files' })).getAllByRole('heading', { level: 3 })).toHaveLength(9);

    fireEvent.click(within(panel).getByRole('button', { name: 'Close project details' }));
    await waitFor(() => expect(panel.closest('[inert]')).not.toBeNull()); // closed: off-screen and inert
    expect((screen.getByLabelText('Message Lam13') as HTMLTextAreaElement).value).toBe('half-written question');
    expect(log().textContent).toBe(history);
  });

  it('instructions saved from the chat’s Project details are the project’s instructions', async () => {
    const { router } = renderApp('/projects/water-security/c/ws-c1');
    await screen.findByRole('log', { name: 'Conversation' }, find);
    fireEvent.click(await screen.findByRole('button', { name: 'Project details' }, find));
    const panel = await screen.findByRole('dialog', { name: 'Project details' });
    fireEvent.change(within(panel).getByRole('textbox', { name: 'Project instructions' }), { target: { value: 'Answer in three bullet points.' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save instructions' }));
    await waitFor(() => expect(within(panel).getByRole('status').textContent).toBe('Saved'));

    await router.navigate('/projects/water-security');
    fireEvent.click(await screen.findByRole('tab', { name: 'Instructions' }, find));
    expect((screen.getByRole('textbox', { name: 'Project instructions' }) as HTMLTextAreaElement).value).toBe('Answer in three bullet points.');
  });
});

describe('Project chat: links and other routes', () => {
  it('a direct link to an ordinary conversation under a project opens it there and adds it to the project', async () => {
    const { router } = renderApp('/projects/ai-strategy/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' }, find);
    expect(await screen.findByRole('button', { name: 'Project: National AI Strategy' }, find)).toBeTruthy();
    await router.navigate('/projects/ai-strategy');
    await waitFor(async () => expect(titles(await chats())).toHaveLength(seedsOf('ai-strategy').length + 1), find);
  });

  it('links made in the browser survive a reload when the adapter keeps them in storage', async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } as Storage;
    const first = createMockProjects({ storage });
    await first.linkChat('digital-services', { id: 'c-1', title: 'First chat' });
    await first.linkChat('digital-services', { id: 'c-1', title: 'First chat' }); // idempotent

    const afterReload = createMockProjects({ storage });
    expect((await afterReload.get('digital-services')).chats.map((c) => c.id)).toEqual(['c-1']);
    expect((await afterReload.list()).find((p) => p.id === 'digital-services')!.chat_count).toBe(1);
    expect([...store.values()].join('')).not.toMatch(/token|secret|password/i); // ids and titles only
  });

  it('an unknown project is a not-found page; global chats still open at /c/:id without project controls', async () => {
    const { router } = renderApp('/projects/nope/new');
    expect(await screen.findByText('Project not found.', {}, find)).toBeTruthy();
    await router.navigate('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' }, find);
    expect(screen.queryByRole('button', { name: /^Project:/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Project details' })).toBeNull();
  });
});
