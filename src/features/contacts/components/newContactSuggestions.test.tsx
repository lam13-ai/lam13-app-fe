import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/app/testUtils';
import { backend, contact, findProposals, proposals, suggestionDto } from './contactsTestBackend';

/**
 * New-contact (`kind: "create"`) and update suggestions on My Contacts, through the real HTTP adapter
 * against a stubbed /contacts backend.
 */

afterEach(() => vi.unstubAllGlobals());

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

  it('a merged chat suggestion shows its sources, its reason and the profile change line by line', async () => {
    const server = backend();
    server.addContact(contact('c2', 'Hannah Lee', { description: 'Likes\n- One-pagers\n- Benchmarks' }));
    server.add(suggestionDto('upd2', {
      kind: 'update', contact_id: 'c2', reason: 'New: dislikes long decks.', created_at: '2026-09-28T11:00:00',
      suggested: { description: 'Likes\n- One-pagers\nDislikes\n- Long decks' },
      source: { type: 'chat', ref_id: 's1', title: null, occurred_at: null },
      merged_sources: [{ type: 'meeting', ref_id: 'm1', title: 'Steering committee', occurred_at: null }],
    }));
    renderApp('/contacts', { api: server.api });
    const grid = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    fireEvent.click(await within(grid).findByRole('button', { name: 'Hannah Lee' }));
    const sheet = await screen.findByRole('dialog', { name: 'Hannah Lee' });
    expect(within(sheet).getByText(/^From chat/)).toBeTruthy();
    expect(within(sheet).getByText('Also includes: Steering committee')).toBeTruthy();
    expect(within(sheet).getByText('New: dislikes long decks.')).toBeTruthy();
    const change = within(sheet).getByRole('group', { name: 'Description: changed lines' });
    expect(within(change).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Likes', '- One-pagers', '+Added: Dislikes', '+Added: - Long decks', '−Removed: - Benchmarks',
    ]);
  });
});

describe('only the newest suggestion per group is shown', () => {
  const person = (id: string, full_name: string, created_at: string) =>
    suggestionDto(id, { suggested: { full_name, position: 'Advisor', company: 'Acme' }, created_at });
  const daniel = (id: string, position: string, created_at: string) =>
    suggestionDto(id, { kind: 'update', contact_id: 'c1', suggested: { position }, created_at });

  it('several new people → every pending one shows, newest first; a merged (superseded) revision never shows', async () => {
    const server = backend();
    // Listed oldest-first on purpose: the server order is not what decides.
    server.add(person('omar', 'Omar Siddiqui', '2026-09-28T10:00:00'));
    server.add(person('usman', 'Usman Tariq', '2026-09-28T10:10:00'));
    server.add(person('ali', 'Ali Raza', '2026-09-28T10:05:00'));
    server.add({ ...person('ali-old', 'Ali R.', '2026-09-28T09:00:00'), status: 'superseded' });
    renderApp('/contacts', { api: server.api });
    const list = await findProposals();
    expect(within(list).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Usman Tariq', 'Ali Raza', 'Omar Siddiqui']);
    expect(screen.queryByText('Ali R.')).toBeNull();

    fireEvent.click(within(list).getByRole('button', { name: 'Reject suggested contact Usman Tariq' }));
    expect(await screen.findByText('Suggestion rejected.')).toBeTruthy();
    expect(server.calls).toContainEqual(expect.objectContaining({ method: 'POST', url: '/contacts/suggestions/usman/reject' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Usman Tariq' })).toBeNull());
    expect(within(await findProposals()).getAllByRole('heading').map((h) => h.textContent)).toEqual(['Ali Raza', 'Omar Siddiqui']);
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
    const extra = { ...contact('c2', 'Hannah Lee') };
    server.addContact(extra);
    renderApp('/contacts', { api: server.api });
    const grid = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    await waitFor(() => expect(within(grid).getAllByText('1 suggested update')).toHaveLength(2));
  });
});
