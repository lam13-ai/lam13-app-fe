import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { renderApp } from '@/app/testUtils';

/**
 * New-contact (`kind: "create"`) suggestions and the TEMPORARY "Test suggestion" demo control, through the
 * real HTTP adapter against a stubbed /contacts backend (routers/contacts_routes.py's contract).
 */

const contact = (id: string, full_name: string, over: Record<string, unknown> = {}) => ({
  id,
  full_name,
  position: 'CFO',
  company: 'Harbor & Finch',
  description: null,
  email: null,
  phone: null,
  linkedin: null,
  current_version: 1,
  created_at: '2026-09-20T10:00:00',
  updated_at: '2026-09-27T09:30:00',
  ...over,
});
const suggestionDto = (id: string, over: Record<string, unknown>) => ({
  id,
  contact_id: null,
  kind: 'create',
  status: 'pending',
  suggested: {} as Record<string, unknown>,
  applied: {},
  reason: '',
  source: { type: 'meeting', ref_id: 'm1', title: 'Vendor Shortlist Review', occurred_at: null },
  base_version: null,
  resolved_version: null,
  created_at: '2026-09-28T09:00:00',
  resolved_at: null,
  ...over,
});

function backend({ testEndpoint }: { testEndpoint?: (body: unknown) => Response | Promise<Response> } = {}) {
  const contacts = [contact('c1', 'Daniel Brandt')];
  let suggestions = [
    suggestionDto('upd1', { kind: 'update', contact_id: 'c1', suggested: { position: 'Chief Financial Officer' }, source: { type: 'meeting', ref_id: 'm0', title: 'Board prep', occurred_at: null } }),
  ];
  const calls: { method: string; url: string; body?: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url === '/chat/sessions') return Response.json([]);
    if (url === '/contacts' && method === 'GET') return Response.json(contacts);
    // Every status: the UI shows the newest suggestion per group, only while it is pending.
    if (url === '/contacts/suggestions') return Response.json(suggestions);
    if (url === '/contacts/test-adding-suggestions' && method === 'POST') {
      if (testEndpoint) return testEndpoint(body);
      // Like the server: stamped now (later than anything seeded).
      const created = suggestionDto(`new${suggestions.length}`, {
        suggested: body.fields,
        reason: body.reason,
        source: body.source,
        created_at: `2026-09-28T12:00:${String(suggestions.length).padStart(2, '0')}`,
      });
      suggestions = [created, ...suggestions];
      return Response.json(created, { status: 201 });
    }
    const decided = /^\/contacts\/suggestions\/([^/]+)\/(approve|reject)$/.exec(url);
    if (decided && method === 'POST') {
      // Like a real server: answer after the UI has re-rendered (the optimistic removal happens first).
      await new Promise((resolve) => setTimeout(resolve, 30));
      const s = suggestions.find((x) => x.id === decided[1])!;
      s.status = decided[2] === 'approve' ? 'approved' : 'rejected';
      if (decided[2] === 'reject') return Response.json(s);
      if (s.kind === 'create') {
        const added = contact('c-new', String(s.suggested.full_name), { ...s.suggested });
        contacts.push(added);
        return Response.json({ suggestion: s, contact: added });
      }
      const target = contacts.find((c) => c.id === s.contact_id)!;
      Object.assign(target, s.suggested);
      return Response.json({ suggestion: s, contact: target });
    }
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  return {
    api: createHttpAdapter(),
    calls,
    add: (dto: ReturnType<typeof suggestionDto>) => (suggestions = [dto, ...suggestions]),
    addContact: (c: ReturnType<typeof contact>) => contacts.push(c),
  };
}

const contactFor = (id: string, name: string) => contact(id, name);
const testButton = () => screen.findByRole('button', { name: 'Test suggestion' });
const proposals = () => screen.queryByRole('list', { name: 'Suggested new contacts' });
const findProposals = () => screen.findByRole('list', { name: 'Suggested new contacts' }, { timeout: 8000 });

afterEach(() => vi.unstubAllGlobals());

describe('Test suggestion (temporary demo control)', () => {
  it('renders beside Add contact (HTTP backend only), is disabled while posting, then shows the new suggestion', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const server = backend();
    const original = server.api.profileSuggestions.addTest!.bind(server.api.profileSuggestions);
    server.api.profileSuggestions.addTest = async (body) => {
      await held;
      return original(body);
    };
    renderApp('/contacts', { api: server.api });
    await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });

    const button = await testButton();
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeTruthy();
    fireEvent.click(button);
    const busy = await screen.findByRole('button', { name: 'Creating…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy); // no duplicate while in flight

    await act(async () => release());
    expect(await screen.findByText('Test suggestion created.')).toBeTruthy();
    const posts = server.calls.filter((c) => c.url === '/contacts/test-adding-suggestions');
    expect(posts).toHaveLength(1);
    // The backend's CreateSuggestionRequest: no contact_id (new contact), fields with full_name, reason, source.
    expect(posts[0]!.body).toMatchObject({
      contact_id: null,
      fields: { full_name: expect.any(String), position: expect.any(String), company: expect.any(String) },
      reason: expect.any(String),
      source: { type: 'meeting', title: expect.any(String) },
    });
    // The pending list was re-read and the proposal is shown.
    const list = await waitFor(() => {
      const l = proposals();
      if (!l) throw new Error('no proposals yet');
      return l;
    });
    expect(within(list).getByRole('heading', { name: (posts[0]!.body as { fields: { full_name: string } }).fields.full_name })).toBeTruthy();
    expect((await testButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends the demo person after the one on screen — taken from the fetched suggestions, so it survives a reload', async () => {
    // A fresh render = a page reload: nothing in memory, only what the server returns (Leila pending).
    const server = backend();
    server.add(suggestionDto('leila', { suggested: { full_name: 'Leila Haddad', position: 'Director', company: 'Civic Futures Office' }, created_at: '2026-09-28T10:00:00' }));
    renderApp('/contacts', { api: server.api });
    const shownName = async () => within(await findProposals()).getByRole('heading').textContent;
    await waitFor(async () => expect(await shownName()).toBe('Leila Haddad'));

    const posted = () => server.calls.filter((c) => c.url === '/contacts/test-adding-suggestions').map((c) => (c.body as { fields: { full_name: string } }).fields.full_name);
    fireEvent.click(await testButton());
    await waitFor(async () => expect(await shownName()).toBe('Tomás Reyes'));
    fireEvent.click(await testButton());
    await waitFor(async () => expect(await shownName()).toBe('Omar Siddiqui'));
    fireEvent.click(await testButton());
    await waitFor(async () => expect(await shownName()).toBe('Leila Haddad'));
    expect(posted()).toEqual(['Tomás Reyes', 'Omar Siddiqui', 'Leila Haddad']);
  });

  it('with no new-contact suggestion on screen, starts with Omar; approval is not needed for the next one', async () => {
    const server = backend();
    renderApp('/contacts', { api: server.api });
    await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    fireEvent.click(await testButton());
    const first = within(await findProposals());
    expect(first.getByRole('heading').textContent).toBe('Omar Siddiqui');
    // No approve / reject in between: the next click still makes (and shows) a new one.
    fireEvent.click(await testButton());
    await waitFor(async () => expect(within(await findProposals()).getByRole('heading').textContent).toBe('Leila Haddad'));
  });

  it('a failed request shows the standard error toast and re-enables the button', async () => {
    const server = backend({ testEndpoint: () => Response.json({ detail: 'A new-contact suggestion needs full_name.' }, { status: 422 }) });
    renderApp('/contacts', { api: server.api });
    fireEvent.click(await testButton());
    expect(await screen.findByText("Couldn't create a test suggestion. A new-contact suggestion needs full_name.")).toBeTruthy();
    expect(((await testButton()) as HTMLButtonElement).disabled).toBe(false);
    expect(proposals()).toBeNull();
  });

  it('is not offered on the in-memory (mock) backend', async () => {
    renderApp('/contacts');
    await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Test suggestion' })).toBeNull();
  });
});

describe('new-contact suggestions', () => {
  const omar = suggestionDto('new1', {
    suggested: { full_name: 'Omar Siddiqui', position: 'Head of Procurement', company: 'Northgate Health Trust', email: 'omar@northgate.example' },
    reason: 'New stakeholder introduced during the vendor shortlist review.',
  });

  it('render with only the fields they carry, the reason and the meeting', async () => {
    const server = backend();
    server.add(structuredClone(omar));
    renderApp('/contacts', { api: server.api });
    const card = within(await findProposals()).getByRole('article');
    expect(within(card).getByRole('heading', { name: 'Omar Siddiqui' })).toBeTruthy();
    expect(card.textContent).toContain('Head of Procurement');
    expect(card.textContent).toContain('Northgate Health Trust');
    expect(within(card).getByRole('link', { name: 'omar@northgate.example' }).getAttribute('href')).toBe('mailto:omar@northgate.example');
    expect(within(card).queryByText('Phone')).toBeNull();
    expect(within(card).queryByText('LinkedIn')).toBeNull();
    expect(card.textContent).toContain('New stakeholder introduced during the vendor shortlist review.');
    expect(card.textContent).toContain('Vendor Shortlist Review');
    // A proposal, not a contact: not in the grid.
    expect(within(screen.getByRole('list', { name: 'Contacts' })).queryByText('Omar Siddiqui')).toBeNull();
  });

  it('Add to contacts approves it; the new contact joins the grid and the proposal goes', async () => {
    const server = backend();
    server.add(structuredClone(omar));
    renderApp('/contacts', { api: server.api });
    const card = within(await findProposals()).getByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Add Omar Siddiqui to contacts' }));
    expect(await screen.findByText('Omar Siddiqui added to contacts.')).toBeTruthy();
    expect(server.calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/contacts/suggestions/new1/approve' }));
    await waitFor(() => expect(proposals()).toBeNull());
    expect(within(screen.getByRole('list', { name: 'Contacts' })).getByRole('button', { name: 'Omar Siddiqui' })).toBeTruthy();
  });

  it('Reject rejects it; nothing is added', async () => {
    const server = backend();
    server.add(structuredClone(omar));
    renderApp('/contacts', { api: server.api });
    const card = within(await findProposals()).getByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Reject suggested contact Omar Siddiqui' }));
    expect(await screen.findByText('Suggestion rejected.')).toBeTruthy();
    expect(server.calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/contacts/suggestions/new1/reject' }));
    await waitFor(() => expect(proposals()).toBeNull());
    expect(within(screen.getByRole('list', { name: 'Contacts' })).queryByText('Omar Siddiqui')).toBeNull();
  });

  it('update suggestions are unchanged: the badge counts only them, and the drawer shows Current vs Suggested', async () => {
    const server = backend();
    server.add(structuredClone(omar));
    renderApp('/contacts', { api: server.api });
    await waitFor(() => expect(proposals()).not.toBeNull());
    const grid = screen.getByRole('list', { name: 'Contacts' });
    expect(within(grid).getByText('1 suggested update')).toBeTruthy();
    fireEvent.click(within(grid).getByRole('button', { name: 'Daniel Brandt' }));
    const sheet = await screen.findByRole('dialog', { name: 'Daniel Brandt' });
    const position = within(sheet).getByRole('group', { name: 'Position: current and suggested' });
    expect(within(position).getByText('Suggested').nextSibling?.textContent).toBe('Chief Financial Officer');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Approve update to Position' }));
    expect(await screen.findByText('Profile updated.')).toBeTruthy();
    expect(server.calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/contacts/suggestions/upd1/approve' }));
  });
});

describe('only the newest suggestion per group is shown', () => {
  const person = (id: string, full_name: string, created_at: string) =>
    suggestionDto(id, { suggested: { full_name, position: 'Advisor', company: 'Acme' }, created_at });
  const daniel = (id: string, position: string, created_at: string) =>
    suggestionDto(id, { kind: 'update', contact_id: 'c1', suggested: { position }, created_at });

  it('several pending new-contact suggestions → only the newest (by created_at, not list order); deciding it surfaces no older one', async () => {
    const server = backend();
    // Listed oldest-first on purpose: the server order is not what decides.
    server.add(person('omar', 'Omar Siddiqui', '2026-09-28T10:00:00'));
    server.add(person('usman', 'Usman Tariq', '2026-09-28T10:10:00'));
    server.add(person('ali', 'Ali Raza', '2026-09-28T10:05:00'));
    renderApp('/contacts', { api: server.api });
    const list = await findProposals();
    expect(within(list).getAllByRole('article')).toHaveLength(1);
    expect(within(list).getByRole('heading', { name: 'Usman Tariq' })).toBeTruthy();
    expect(screen.queryByText('Omar Siddiqui')).toBeNull();
    expect(screen.queryByText('Ali Raza')).toBeNull();

    fireEvent.click(within(list).getByRole('button', { name: 'Reject suggested contact Usman Tariq' }));
    expect(await screen.findByText('Suggestion rejected.')).toBeTruthy();
    expect(server.calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/contacts/suggestions/usman/reject' }));
    await waitFor(() => expect(proposals()).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.queryByText('Ali Raza')).toBeNull(); // the older ones stay hidden
    expect(screen.queryByText('Omar Siddiqui')).toBeNull();
  });

  it('several pending updates for one contact → one badge and only the newest revision; approving it surfaces no older one', async () => {
    const server = backend();
    server.add(daniel('rev1', 'CFO', '2026-09-28T09:00:00'));
    server.add(daniel('rev3', 'Managing Director', '2026-09-28T11:00:00'));
    server.add(daniel('rev2', 'CEO', '2026-09-28T10:00:00'));
    renderApp('/contacts', { api: server.api });
    const grid = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    await waitFor(() => expect(within(grid).getByText('1 suggested update')).toBeTruthy());

    fireEvent.click(within(grid).getByRole('button', { name: 'Daniel Brandt' }));
    const sheet = await screen.findByRole('dialog', { name: 'Daniel Brandt' });
    expect(within(sheet).getByRole('heading', { name: 'Review 1 suggested update' })).toBeTruthy();
    const position = within(sheet).getByRole('group', { name: 'Position: current and suggested' });
    expect(within(position).getByText('Suggested').nextSibling?.textContent).toBe('Managing Director');
    expect(within(sheet).queryByText('CEO')).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: 'Approve update to Position' }));
    expect(await screen.findByText('Profile updated.')).toBeTruthy();
    expect(server.calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/contacts/suggestions/rev3/approve' }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(sheet).queryByText(/suggested update/)).toBeNull();
    expect(within(grid).queryByText(/suggested update/)).toBeNull();
    expect(within(sheet).queryByText('CEO')).toBeNull();
  });

  it('pending updates for different contacts → each contact keeps its newest', async () => {
    const server = backend();
    server.add(daniel('d-new', 'Managing Director', '2026-09-28T11:00:00'));
    server.add(suggestionDto('h1', { kind: 'update', contact_id: 'c2', suggested: { company: 'Lam13 Labs' }, created_at: '2026-09-28T08:00:00' }));
    const extra = { ...contactFor('c2', 'Hannah Lee') };
    server.addContact(extra);
    renderApp('/contacts', { api: server.api });
    const grid = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    await waitFor(() => expect(within(grid).getAllByText('1 suggested update')).toHaveLength(2));
  });
});
