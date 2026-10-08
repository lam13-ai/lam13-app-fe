import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessTokenGetter } from './auth';
import { isApiError } from './errors';
import { createHttpAdapter } from './http';
import type { StreamEvent } from './stream';

/**
 * Projects, their chats / archives / team / contacts, and the calendar over HTTP, against a stubbed `fetch`.
 * The response bodies are the backend's schemas (lam13-app api/schemas/projects.py, calendar.py, chat.py),
 * field for field; the assertions are the exact requests the adapter makes.
 */

const TOKEN = 'test-token-not-real';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const noContent = () => new Response(null, { status: 204 });

// ── The backend's responses ──────────────────────────────────────────────────
const PROJECT = {
  id: 'p1',
  name: 'Water strategy',
  instructions: 'Lead with the decision.',
  summary: 'Baseline agreed.',
  owner_id: 'u-owner',
  role: 'owner',
  created_at: '2026-10-01T09:00:00',
  updated_at: '2026-10-07T12:30:00',
};
const CHATS = [{ sessionId: 's1', title: 'Kick-off', projectId: 'p1', createdBy: 'u-owner', createdAt: '2026-10-06T10:00:00', updatedAt: '2026-10-07T08:00:00' }];
const FILES = [
  { id: 'f1', project_id: 'p1', folder_id: 'fo1', name: 'Baseline 2022.pdf', content_type: 'application/pdf', size_bytes: 2048, uploaded_by: 'u-owner', uploaded_by_name: 'Joseph Boutros', created_at: '2026-10-05T10:00:00', processing_status: 'ready' },
  { id: 'f2', project_id: 'p1', folder_id: null, name: 'Board deck.pptx', content_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size_bytes: 4096, uploaded_by: 'u-2', uploaded_by_name: '', created_at: '2026-10-06T10:00:00', processing_status: 'not_indexed' },
  { id: 'f3', project_id: 'p1', folder_id: null, name: 'chart.png', content_type: 'image/png', size_bytes: 512, uploaded_by: 'u-2', uploaded_by_name: 'Maya Okafor', created_at: '2026-10-06T11:00:00', processing_status: 'pending' },
];
const FOLDERS = [{ id: 'fo1', project_id: 'p1', name: 'Board papers', created_by: 'u-owner', created_at: '2026-10-05T09:00:00', updated_at: '2026-10-05T09:00:00' }];
const MEMBERS = [
  { user_id: 'u-owner', name: 'Joseph Boutros', email: 'joseph@example.com', role: 'owner', created_at: '2026-10-01T09:00:00' },
  { user_id: 'u-2', name: '', email: 'maya@example.com', role: 'member', created_at: '2026-10-02T09:00:00' },
];
const CONTACTS = [{ contact_id: 'c1', full_name: 'Omar Haddad', position: 'Programme Director', company: 'Water Authority', email: 'omar@example.com', added_by: 'u-owner', created_at: '2026-10-03T09:00:00' }];

/** Answers the six parts of a project and records every call; `extra` answers anything else first. */
function backend(extra: (call: Call) => Response | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const call = { url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    calls.push(call);
    const custom = extra(call);
    if (custom) return custom;
    if (call.method !== 'GET') return call.method === 'DELETE' ? noContent() : json({});
    if (url === '/projects/p1') return json(PROJECT);
    if (url === '/projects/p1/chats') return json(CHATS);
    if (url === '/projects/p1/files') return json(FILES);
    if (url === '/projects/p1/folders') return json(FOLDERS);
    if (url === '/projects/p1/members') return json(MEMBERS);
    if (url === '/projects/p1/contacts') return json(CONTACTS);
    return json({ detail: 'Project not found.' }, 404);
  });
  /** The calls that change something (everything but the reload that follows). */
  const writes = () => calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.url, typeof c.body === 'string' ? JSON.parse(c.body) : c.body]);
  return { calls, writes };
}

let unregister: () => void;
beforeEach(() => {
  unregister = setAccessTokenGetter(async () => TOKEN);
});
afterEach(() => {
  unregister();
  vi.unstubAllGlobals();
});

describe('HTTP adapter — projects', () => {
  it('lists the projects the backend returns, with the caller’s role and no invented counts', async () => {
    const { calls } = backend((c) => (c.url === '/projects' ? json([PROJECT, { ...PROJECT, id: 'p2', name: 'Shared', role: 'member', summary: '' }]) : undefined));
    const list = await createHttpAdapter().projects.list();
    expect(list).toEqual([
      { id: 'p1', name: 'Water strategy', description: 'Baseline agreed.', updated_at: '2026-10-07T12:30:00Z', role: 'owner' },
      { id: 'p2', name: 'Shared', description: '', updated_at: '2026-10-07T12:30:00Z', role: 'member' },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/projects', method: 'GET' });
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('loads a project with its chats, files, folders, members and contacts', async () => {
    const { calls } = backend();
    const project = await createHttpAdapter().projects.get('p1');
    expect(calls.map((c) => c.url).sort()).toEqual(['/projects/p1', '/projects/p1/chats', '/projects/p1/contacts', '/projects/p1/files', '/projects/p1/folders', '/projects/p1/members']);
    expect(calls.every((c) => c.method === 'GET' && c.headers.Authorization === `Bearer ${TOKEN}`)).toBe(true);

    expect(project).toMatchObject({ id: 'p1', name: 'Water strategy', description: 'Baseline agreed.', instructions: 'Lead with the decision.', role: 'owner', chat_count: 1, file_count: 3 });
    // The project's own chat list is authoritative (`server`): these chats are not in the personal list.
    expect(project.chats).toEqual([{ id: 's1', title: 'Kick-off', preview: '', updated_at: '2026-10-07T08:00:00Z', server: true }]);
    expect(project.files).toEqual([
      { id: 'f1', name: 'Baseline 2022.pdf', kind: 'document', extension: 'PDF', size_bytes: 2048, uploaded_at: '2026-10-05T10:00:00Z', uploaded_by: 'Joseph Boutros', folder_id: 'fo1', status: 'ready' },
      { id: 'f2', name: 'Board deck.pptx', kind: 'presentation', extension: 'PPTX', size_bytes: 4096, uploaded_at: '2026-10-06T10:00:00Z', uploaded_by: 'A team member', folder_id: null, status: 'stored' },
      { id: 'f3', name: 'chart.png', kind: 'image', extension: 'PNG', size_bytes: 512, uploaded_at: '2026-10-06T11:00:00Z', uploaded_by: 'Maya Okafor', folder_id: null, status: 'processing' },
    ]);
    expect(project.folders).toEqual([{ id: 'fo1', name: 'Board papers' }]);
    expect(project.members).toEqual([
      { id: 'u-owner', name: 'Joseph Boutros', email: 'joseph@example.com', role: 'owner' },
      { id: 'u-2', name: 'maya@example.com', email: 'maya@example.com', role: 'member' }, // no name on the account: the email
    ]);
    expect(project.contacts).toEqual([{ id: 'c1', name: 'Omar Haddad', detail: 'Programme Director, Water Authority', email: 'omar@example.com' }]);
  });

  it('a project the caller is not in is the backend’s 404, with its message', async () => {
    backend();
    const error = await createHttpAdapter().projects.get('nope').catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(404);
    expect((error as Error).message).toBe('Project not found.');
  });

  it('creates, renames, saves instructions and deletes with the backend’s routes and bodies', async () => {
    const { writes } = backend((c) => (c.url === '/projects' && c.method === 'POST' ? json({ ...PROJECT, id: 'p9', name: 'New one', summary: '' }, 201) : undefined));
    const api = createHttpAdapter().projects;
    expect(await api.create({ name: 'New one' })).toMatchObject({ id: 'p9', name: 'New one', role: 'owner' });
    await api.rename('p1', 'Renamed');
    await api.saveInstructions('p1', 'Answer in three bullets.');
    await api.remove('p1');
    expect(writes()).toEqual([
      ['POST', '/projects', { name: 'New one' }],
      ['PATCH', '/projects/p1', { name: 'Renamed' }],
      ['PATCH', '/projects/p1', { instructions: 'Answer in three bullets.' }],
      ['DELETE', '/projects/p1', undefined],
    ]);
  });

  it('every change answers with the project reloaded from the backend', async () => {
    const { calls } = backend();
    const project = await createHttpAdapter().projects.rename('p1', 'Renamed');
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: '/projects/p1' });
    expect(calls.slice(1).every((c) => c.method === 'GET')).toBe(true);
    expect(calls).toHaveLength(7);
    expect(project.files).toHaveLength(3); // the backend's state, not a local guess
  });

  it('members and contacts: add by email, remove by id, link and unlink a contact', async () => {
    const { writes } = backend();
    const api = createHttpAdapter().projects;
    await api.addMember('p1', { email: 'new@example.com', role: 'member' });
    await api.removeMember('p1', 'u-2');
    await api.linkContact('p1', 'c7');
    await api.unlinkContact('p1', 'c1');
    expect(writes()).toEqual([
      ['POST', '/projects/p1/members', { email: 'new@example.com' }], // the role is the backend's to set
      ['DELETE', '/projects/p1/members/u-2', undefined],
      ['POST', '/projects/p1/contacts', { contact_id: 'c7' }],
      ['DELETE', '/projects/p1/contacts/c1', undefined],
    ]);
  });

  it('a refusal keeps the backend’s status and message (no such account, already there, not allowed)', async () => {
    const refusals = [
      ['/projects/p1/members', 404, 'No Lam13 account uses this email address.'],
      ['/projects/p1/contacts', 409, 'This contact is already linked to the project.'],
      ['/projects/p1/files/f1', 403, 'Only the person who uploaded this file or the project owner can delete it.'],
    ] as const;
    backend((c) => {
      const refusal = c.method !== 'GET' && refusals.find(([url]) => url === c.url);
      return refusal ? json({ detail: refusal[2] }, refusal[1]) : undefined;
    });
    const api = createHttpAdapter().projects;
    const attempts = [api.addMember('p1', { email: 'x@example.com', role: 'member' }), api.linkContact('p1', 'c1'), api.deleteFile('p1', 'f1')];
    for (const [index, attempt] of attempts.entries()) {
      const error = await attempt.catch((e: unknown) => e);
      expect(isApiError(error) && error.status).toBe(refusals[index]![1]);
      expect((error as Error).message).toBe(refusals[index]![2]);
    }
  });

  it('project chats: rename and delete through the project', async () => {
    const { writes } = backend();
    const api = createHttpAdapter().projects;
    await api.renameChat('p1', 's1', 'Renamed chat');
    await api.deleteChat('p1', 's1');
    expect(writes()).toEqual([
      ['PATCH', '/projects/p1/chats/s1', { title: 'Renamed chat' }],
      ['DELETE', '/projects/p1/chats/s1', undefined],
    ]);
    // Opening a chat under a project only reloads it: the backend already knows the chat's project.
    const { calls } = backend();
    await api.linkChat('p1', { id: 's1', title: 'Kick-off' });
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('archives: folders, upload (multipart), move, delete and a signed download link', async () => {
    const { calls, writes } = backend((c) => (c.url === '/projects/p1/files/f1/download' ? json({ url: 'https://signed.example/file?X-Amz-Signature=abc', expires_in: 300 }) : undefined));
    const api = createHttpAdapter().projects;
    await api.createFolder('p1', 'Annexes');
    await api.renameFolder('p1', 'fo1', 'Board');
    await api.deleteFolder('p1', 'fo1');
    await api.moveFile('p1', 'f2', 'fo1');
    await api.moveFile('p1', 'f2', null);
    await api.deleteFile('p1', 'f3');
    const file = new File(['%PDF-1.7'], 'Tariff options.pdf', { type: 'application/pdf' });
    await api.uploadFile('p1', file, 'fo1');
    await api.uploadFile('p1', file);
    expect(await api.fileDownloadUrl('p1', 'f1')).toBe('https://signed.example/file?X-Amz-Signature=abc');

    const done = writes();
    expect(done.slice(0, 6)).toEqual([
      ['POST', '/projects/p1/folders', { name: 'Annexes' }],
      ['PATCH', '/projects/p1/folders/fo1', { name: 'Board' }],
      ['DELETE', '/projects/p1/folders/fo1', undefined],
      ['PATCH', '/projects/p1/files/f2', { folder_id: 'fo1' }],
      ['PATCH', '/projects/p1/files/f2', { folder_id: null }],
      ['DELETE', '/projects/p1/files/f3', undefined],
    ]);
    const uploads = calls.filter((c) => c.method === 'POST' && c.url === '/projects/p1/files');
    expect(uploads).toHaveLength(2);
    const [inFolder, loose] = uploads.map((c) => c.body as FormData);
    expect([...inFolder!.keys()]).toEqual(['file', 'folder_id']);
    expect((inFolder!.get('file') as File).name).toBe('Tariff options.pdf');
    expect(inFolder!.get('folder_id')).toBe('fo1');
    expect([...loose!.keys()]).toEqual(['file']);
    expect(uploads[0]!.headers['Content-Type']).toBeUndefined(); // the browser sets the multipart boundary
    expect(uploads[0]!.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    // Personal chat uploads are a different route and were not touched.
    expect(calls.some((c) => c.url === '/chat/upload')).toBe(false);
  });
});

describe('HTTP adapter — project chat on the existing chat routes', () => {
  const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  function streamBackend() {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body });
      if (url !== '/chat/stream') return json({ detail: 'Conversation not found' }, 404);
      const encoder = new TextEncoder();
      const chunks = [frame('start', { content: '', session_id: 'client-1', message_id: 'client-1', assistantMessageId: 'a-1' }), frame('token', { content: 'Hi', source: 'chatbot' }), frame('done', { content: '', session_id: 'client-1', assistantMessageId: 'a-1', title: 'T' })];
      return new Response(new ReadableStream<Uint8Array>({ start: (c) => (chunks.forEach((x) => c.enqueue(encoder.encode(x))), c.close()) }), { headers: { 'Content-Type': 'text/event-stream' } });
    });
    return calls;
  }
  const collect = async (stream: AsyncIterable<StreamEvent>) => {
    const events: StreamEvent[] = [];
    for await (const event of stream) events.push(event);
    return events;
  };

  it('a new chat in a project sends project_id, and the created conversation carries it', async () => {
    const calls = streamBackend();
    const events = await collect(await createHttpAdapter().messages.send(null, { client_message_id: 'client-1', kind: 'text', content: 'Hello', project_id: 'p1' }));
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ session_id: 'client-1', message_id: 'client-1', user_message: 'Hello', project_id: 'p1' });
    const created = events.find((e) => e.event === 'conversation.created');
    expect(created?.event === 'conversation.created' && created.data).toMatchObject({ id: 'client-1', project_id: 'p1' });
  });

  it('a personal chat sends exactly what it always did: no project_id anywhere', async () => {
    const calls = streamBackend();
    const events = await collect(await createHttpAdapter().messages.send(null, { client_message_id: 'client-1', kind: 'text', content: 'Hello' }));
    expect(JSON.parse(calls[0]!.body as string)).toEqual({ session_id: 'client-1', message_id: 'client-1', user_message: 'Hello' });
    const created = events.find((e) => e.event === 'conversation.created');
    expect(created?.event === 'conversation.created' && 'project_id' in created.data).toBe(false);
  });

  it('opening a project chat reads the backend’s projectId', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url === '/chat/sessions/s1' ? json({ sessionId: 's1', title: 'Kick-off', projectId: 'p1', messages: [] }) : json({ sessionId: 's2', title: 'Mine', projectId: null, messages: [] }),
    );
    const api = createHttpAdapter().conversations;
    expect(await api.get('s1')).toMatchObject({ id: 's1', title: 'Kick-off', project_id: 'p1' });
    expect('project_id' in (await api.get('s2'))).toBe(false);
  });
});

describe('HTTP adapter — calendar', () => {
  const EVENTS = [
    { id: 'e1', kind: 'event', source: 'google_calendar', title: 'Steering committee', description: '', start_at: '2026-10-09T09:30:00Z', end_at: '2026-10-09T10:15:00Z', location: null, meeting_url: 'https://teams.microsoft.com/l/meetup-join/abc', platform: 'microsoft_teams', project_id: 'p1', meeting_id: null },
    { id: 'e2', kind: 'event', source: 'google_calendar', title: 'Board dry run', start_at: '2026-10-10T13:00:00Z', end_at: '2026-10-10T14:00:00Z', location: 'Boardroom 2, HQ', meeting_url: null, platform: null, project_id: null, meeting_id: null },
    { id: 'e3', kind: 'event', source: 'google_calendar', title: 'Vendor call', start_at: '2026-10-11T08:00:00Z', end_at: '2026-10-11T08:30:00Z', location: null, meeting_url: 'https://whereby.com/room', platform: 'unknown', project_id: null, meeting_id: null },
    { id: 'e4', kind: 'event', source: 'google_calendar', title: 'Hold', start_at: '2026-10-12T08:00:00Z', end_at: '2026-10-12T08:30:00Z', location: null, meeting_url: null, platform: null, project_id: null, meeting_id: null },
    { id: 'm_abc', kind: 'meeting', source: 'granola', title: 'KPI working session', start_at: '2026-10-06T10:00:00Z', end_at: null, location: null, meeting_url: null, platform: null, project_id: null, meeting_id: 'abc' },
  ];
  const calendarBackend = (extra: (call: Call) => Response | undefined = () => undefined) =>
    backend((c) => extra(c) ?? (c.url === '/projects' ? json([PROJECT]) : c.url.startsWith('/calendar/events?') || c.url === '/calendar/events/upcoming' ? json(EVENTS) : undefined));

  it('events: the backend’s fields, the platform from its own value, a place only when it gives one', async () => {
    const { calls } = calendarBackend();
    const events = await createHttpAdapter().calendar.events();
    expect(calls.map((c) => c.url).sort()).toEqual(['/calendar/events?limit=500', '/projects']);
    expect(events.map((e) => [e.title, e.location, e.location_text, e.meeting_url, e.ends_at, e.project, e.meeting_id])).toEqual([
      ['Steering committee', 'teams', null, 'https://teams.microsoft.com/l/meetup-join/abc', '2026-10-09T10:15:00Z', 'Water strategy', null],
      ['Board dry run', 'in-person', 'Boardroom 2, HQ', null, '2026-10-10T14:00:00Z', null, null],
      ['Vendor call', 'online', null, 'https://whereby.com/room', '2026-10-11T08:30:00Z', null, null],
      ['Hold', null, null, null, '2026-10-12T08:30:00Z', null, null], // nothing known: nothing shown
      ['KPI working session', null, null, null, null, null, 'abc'], // a recorded meeting: no end, no place
    ]);
    expect(events.every((e) => e.participants.length === 0)).toBe(true);
  });

  it('upcoming and a single event use their own routes; the calendar still loads if the project names do not', async () => {
    const { calls } = calendarBackend((c) => (c.url === '/projects' ? json({ detail: 'boom' }, 500) : c.url === '/calendar/events/e2' ? json(EVENTS[1]) : undefined));
    const api = createHttpAdapter().calendar;
    const upcoming = await api.upcoming();
    expect(upcoming).toHaveLength(5);
    expect(upcoming[0]!.project).toBeNull(); // the name is a nicety, not a requirement
    expect(await api.event('e2')).toMatchObject({ id: 'e2', title: 'Board dry run', location: 'in-person', location_text: 'Boardroom 2, HQ' });
    expect(calls.map((c) => c.url)).toEqual(expect.arrayContaining(['/calendar/events/upcoming', '/calendar/events/e2']));
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('tasks are the meetings’ action items, and ticking one goes to the meeting’s own route', async () => {
    const { calls } = backend((c) => {
      if (c.url === '/calendar/tasks') {
        return json([
          { id: 'abc:0', title: 'Send the KPI list', assignee: 'Maya', completed: false, meeting_id: 'abc', index: 0, meeting_title: 'KPI working session', meeting_started_at: '2026-10-06T10:00:00Z' },
          { id: 'abc:1', title: 'Collect loss figures', assignee: null, completed: true, meeting_id: 'abc', index: 1, meeting_title: 'KPI working session', meeting_started_at: '2026-10-06T10:00:00Z' },
        ]);
      }
      if (c.url === '/meetings/abc/action-items/1') {
        return json({ id: 'abc', title: 'KPI working session', started_at: '2026-10-06T10:00:00Z', action_items: [{ id: '0', text: 'Send the KPI list', completed: false }, { id: '1', text: 'Collect loss figures', completed: false }] });
      }
      return undefined;
    });
    const api = createHttpAdapter().calendar;
    expect(await api.tasks()).toEqual([
      { id: 'abc:0', title: 'Send the KPI list', due_at: null, completed: false, meeting: 'KPI working session', meeting_at: '2026-10-06T10:00:00Z', project: null },
      { id: 'abc:1', title: 'Collect loss figures', due_at: null, completed: true, meeting: 'KPI working session', meeting_at: '2026-10-06T10:00:00Z', project: null },
    ]);
    const task = await api.setTaskCompleted('abc:1', false);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect([patch.url, JSON.parse(patch.body as string)]).toEqual(['/meetings/abc/action-items/1', { completed: false }]);
    expect(task).toEqual({ id: 'abc:1', title: 'Collect loss figures', due_at: null, completed: false, meeting: 'KPI working session', meeting_at: '2026-10-06T10:00:00Z', project: null });
  });
});
