import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '@/app/testUtils';
import { backend, findProposals, proposals, suggestionDto } from './contactsTestBackend';

/**
 * TEMPORARY: the "Test suggestion" and "Test update revisions" demo buttons (TestSuggestionControls).
 * Delete this file when those buttons are commented out.
 */

afterEach(() => vi.unstubAllGlobals());

const testButton = () => screen.findByRole('button', { name: 'Test suggestion' });

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
    // Newest first: the card on top is the one just added.
    const shownName = async () => within(await findProposals()).getAllByRole('heading')[0]!.textContent;
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
    await waitFor(async () => expect(within(await findProposals()).getAllByRole('heading')[0]!.textContent).toBe('Leila Haddad'));
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

describe('Test update revisions (temporary demo control)', () => {
  const revisionButton = () => screen.findByRole('button', { name: 'Test update revisions' });
  const shownRevision = async () => {
    const sheet = await screen.findByRole('dialog', { name: 'Daniel Brandt' });
    const group = within(sheet).getByRole('group', { name: 'Position: current and suggested' });
    return within(group).getByText('Suggested').nextSibling?.textContent;
  };

  it('each click adds the next numbered revision for Daniel; his drawer only ever shows the newest; the contact is never edited', async () => {
    const server = backend();
    renderApp('/contacts', { api: server.api });
    const grid = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    // The seeded "CFO → Chief Financial Officer" update is pending for Daniel.
    for (const n of [1, 2, 3]) {
      fireEvent.click(await revisionButton());
      expect(await screen.findByText(`Revision ${n} suggested for Daniel Brandt.`)).toBeTruthy();
    }
    const posts = server.calls.filter((c) => c.url === '/contacts/test-adding-suggestions').map((c) => c.body);
    expect(posts).toEqual([1, 2, 3].map((n) => expect.objectContaining({ contact_id: 'c1', fields: { position: `Demo position — revision ${n}` } })));

    await waitFor(() => expect(within(grid).getByText('1 suggested update')).toBeTruthy());
    fireEvent.click(within(grid).getByRole('button', { name: 'Daniel Brandt' }));
    const sheet = await screen.findByRole('dialog', { name: 'Daniel Brandt' });
    expect(within(sheet).getByRole('heading', { name: 'Review 1 suggested update' })).toBeTruthy();
    expect(await shownRevision()).toBe('Demo position — revision 3');
    expect(within(sheet).getAllByRole('group', { name: /current and suggested/ })).toHaveLength(1);
    expect(within(sheet).queryByText(/revision [12]\b/)).toBeNull();
    // Only suggestions were created: no contact write, and Daniel's position is still CFO.
    expect(server.calls.some((c) => c.method === 'PATCH' || (c.method === 'POST' && c.url.endsWith('/approve')))).toBe(false);
    expect(within(within(grid).getByRole('button', { name: 'Daniel Brandt' }).closest('article')!).getByText('CFO')).toBeTruthy();
  });

  it('continues from the server data after a reload (revision 2 exists → next is 3), and approving it surfaces no older revision', async () => {
    const server = backend();
    server.add(
      suggestionDto('existing-rev2', {
        kind: 'update',
        contact_id: 'c1',
        suggested: { position: 'Demo position — revision 2' },
        reason: 'Demo revision 2: testing that only the newest update suggestion is shown.',
        created_at: '2026-09-28T11:00:00',
      }),
    );
    renderApp('/contacts', { api: server.api });
    await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    await waitFor(() => expect(screen.getByText('1 suggested update')).toBeTruthy());
    fireEvent.click(await revisionButton());
    expect(await screen.findByText('Revision 3 suggested for Daniel Brandt.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Daniel Brandt' }));
    await waitFor(async () => expect(await shownRevision()).toBe('Demo position — revision 3'));
    const sheet = screen.getByRole('dialog', { name: 'Daniel Brandt' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Approve update to Position' }));
    expect(await screen.findByText('Profile updated.')).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(within(sheet).queryByText(/suggested update/)).toBeNull(); // revision 2 does not come back
  });

  it('without a (single) Daniel Brandt contact, shows the standard error and creates nothing', async () => {
    const server = backend();
    server.renameContact('c1', 'Dan B.');
    renderApp('/contacts', { api: server.api });
    await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    fireEvent.click(await revisionButton());
    expect(await screen.findByText("Couldn't create a test revision. Add exactly one contact named Daniel Brandt first.")).toBeTruthy();
    expect(server.calls.some((c) => c.url === '/contacts/test-adding-suggestions')).toBe(false);
  });
});
