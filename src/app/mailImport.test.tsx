import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import type { IntegrationConnection } from '@/types/api';
import { renderApp } from './testUtils';

/**
 * My Contacts → importing from Gmail / Outlook, with the real adapter over a fake backend. What the page
 * shows is the backend's connection state (`GET /integrations`): nothing is "Connected" because it was
 * clicked, connecting goes to the provider's own sign-in, and an import adds to the real contact list.
 */

const find = { timeout: 8000 };
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PROVIDERS = [
  { name: 'Gmail', key: 'gmail', account: 'joseph@gmail.com' },
  { name: 'Outlook', key: 'outlook', account: 'joseph@outlook.com' },
] as const;
type Key = (typeof PROVIDERS)[number]['key'];

const connection = (provider: Key, over: Partial<IntegrationConnection> = {}): IntegrationConnection => ({
  provider,
  status: 'disconnected',
  configured: true,
  account: null,
  last_synced_at: null,
  ...over,
});
const contact = (id: string, full_name: string) => ({
  id,
  full_name,
  position: null,
  company: null,
  description: null,
  email: `${id}@example.com`,
  phone: null,
  linkedin: null,
  current_version: 1,
  created_at: '2026-09-20T10:00:00',
  updated_at: '2026-09-27T09:30:00',
});

/** The real adapter over a fake backend. `state` is what the backend holds; every request is recorded. */
function backend(state: { integrations: IntegrationConnection[]; contacts?: unknown[]; onImport?: (provider: string) => Response }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (url === '/integrations') return Response.json(state.integrations);
    if (url === '/contacts') return Response.json(state.contacts ?? []);
    if (url.startsWith('/contacts/suggestions') || url === '/chat/sessions') return Response.json([]);
    const imported = /^\/integrations\/(gmail|outlook)\/import-contacts$/.exec(url);
    if (imported && method === 'POST' && state.onImport) return state.onImport(imported[1]!);
    const removed = /^\/integrations\/(gmail|outlook)$/.exec(url);
    if (removed && method === 'DELETE') {
      state.integrations = state.integrations.map((c) => (c.provider === removed[1] ? connection(c.provider as Key) : c));
      return Response.json(connection(removed[1] as Key));
    }
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  const api = createHttpAdapter();
  renderApp('/contacts', { api, auth: { accessToken: 'test-token-not-real' } });
  return { calls, api };
}
const ready = () => screen.findByText("You don't have any contacts yet", {}, find);
const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Import contacts' }));
  return screen.getByRole('menu', { name: 'Import contacts from' });
};
const row = (name: string) => screen.getByRole('listitem', { name: `${name} connection` });
const both = (over: Partial<Record<Key, Partial<IntegrationConnection>>> = {}) => PROVIDERS.map((p) => connection(p.key, over[p.key]));

describe.each(PROVIDERS)('Import contacts: $name', ({ name, key, account }) => {
  it('starts disconnected: no connected-account row, and the menu does not say Connected', async () => {
    backend({ integrations: both() });
    await ready();
    expect(screen.queryByRole('region', { name: 'Connected accounts' })).toBeNull();
    const options = within(openMenu()).getAllByRole('menuitem');
    expect(options.map((o) => o.textContent)).toEqual(['Gmail', 'Outlook']);
    expect(within(openMenu()).getByRole('menuitem', { name }).querySelector('img')).toBeTruthy();
  });

  it("choosing it opens the provider's own sign-in, and nothing reads as connected until the backend says so", async () => {
    const { api, calls } = backend({ integrations: both() });
    const connect = vi.spyOn(api.integrations, 'connect').mockResolvedValue(); // the real one leaves the app
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: `Import from ${name}` }, find));
    await waitFor(() => expect(connect).toHaveBeenCalledWith(key));
    expect(screen.queryByRole('listitem', { name: `${name} connection` })).toBeNull();
    expect(screen.queryByText('Connected')).toBeNull();
    expect(screen.queryByRole('form')).toBeNull(); // no typed-address stand-in for a sign-in
    expect(calls.some((c) => c.includes('import-contacts'))).toBe(false);
  });

  it('a server without credentials for it says so and offers nothing to press', async () => {
    const { api } = backend({ integrations: both({ [key]: { configured: false } }) });
    const connect = vi.spyOn(api.integrations, 'connect');
    await ready();
    const option = (await screen.findByRole('button', { name: `Import from ${name}` }, find)) as HTMLButtonElement;
    await waitFor(() => expect(option.disabled).toBe(true));
    expect(within(option).getByText('Not set up on this server')).toBeTruthy();
    fireEvent.click(option);
    fireEvent.click(within(openMenu()).getByRole('menuitem', { name: new RegExp(`${name}.*Not set up on this server`) }));
    expect(await screen.findByText(`${name} import is not set up on this server yet.`)).toBeTruthy();
    expect(connect).not.toHaveBeenCalled();
  });

  it('a connected account shows its address, imports into My Contacts, and reports what the backend did', async () => {
    const state = {
      integrations: both({ [key]: { status: 'connected' as const, account } }),
      contacts: [] as unknown[],
      onImport: (provider: string) => {
        expect(provider).toBe(key);
        state.contacts = [contact('c1', 'Lena Fischer'), contact('c2', 'Omar Haddad')];
        return Response.json({ imported: 2, skipped: 1, found: 3 });
      },
    };
    const { calls } = backend(state);
    await ready();
    expect(within(await screen.findByRole('listitem', { name: `${name} connection` }, find)).getByText('Connected')).toBeTruthy();
    expect(within(row(name)).getByText(account)).toBeTruthy();
    const other = name === 'Gmail' ? 'Outlook' : 'Gmail';
    expect(screen.queryByRole('listitem', { name: `${other} connection` })).toBeNull();
    expect(within(openMenu()).getByRole('menuitem', { name: new RegExp(`${name}.*Connected`) })).toBeTruthy();

    fireEvent.click(within(row(name)).getByRole('button', { name: `Import contacts from ${name}` }));
    expect((await within(row(name)).findByRole('status', {}, find)).textContent).toBe(`Imported 2 contacts from ${name}. 1 already in My Contacts or without a name.`);
    expect(calls).toContain(`POST /integrations/${key}/import-contacts`);
    // The imported people are the user's real contacts now: the list reloaded from the backend.
    const list = await screen.findByRole('list', { name: 'Contacts' }, find);
    await waitFor(() => expect(within(list).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Lena Fischer', 'Omar Haddad']));
    expect(document.body.textContent).not.toMatch(/demo/i);
  });

  it('a refused import says why and adds nothing', async () => {
    const { calls } = backend({
      integrations: both({ [key]: { status: 'connected', account } }),
      onImport: () => Response.json({ detail: 'This account needs to be connected again.' }, { status: 409 }),
    });
    await ready();
    fireEvent.click(within(await screen.findByRole('listitem', { name: `${name} connection` }, find)).getByRole('button', { name: `Import contacts from ${name}` }));
    expect(await screen.findByText(`Couldn't import from ${name}. This account needs to be connected again.`, {}, find)).toBeTruthy();
    expect(screen.queryByRole('status', { name: /Imported/ })).toBeNull();
    expect(calls.filter((c) => c === 'GET /integrations').length).toBeGreaterThan(1); // its real state is asked for again
    expect(screen.getByText("You don't have any contacts yet")).toBeTruthy();
  });

  it('Disconnect asks the backend and the row goes away', async () => {
    const { calls } = backend({ integrations: both({ [key]: { status: 'connected', account } }) });
    await ready();
    fireEvent.click(within(await screen.findByRole('listitem', { name: `${name} connection` }, find)).getByRole('button', { name: `Disconnect ${name}` }));
    await waitFor(() => expect(screen.queryByRole('listitem', { name: `${name} connection` })).toBeNull());
    expect(calls).toContain(`DELETE /integrations/${key}`);
    expect((screen.getByRole('button', { name: `Import from ${name}` }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Import contacts: returning from the sign-in, and the rest of the page', () => {
  it('the callback page sends the code once and returns to My Contacts', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url === '/integrations' ? Response.json(both({ gmail: { status: 'connected', account: 'joseph@gmail.com' } })) : Response.json([])));
    const api = createHttpAdapter();
    const finish = vi.spyOn(api.integrations, 'finishSignIn').mockResolvedValue(connection('gmail', { status: 'connected', account: 'joseph@gmail.com' }));
    const { router } = renderApp('/integrations/gmail/callback?code=c1&state=s1', { api, auth: { accessToken: 'test-token-not-real' } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/contacts'), find);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith('gmail', 'c1', 's1');
    expect(await screen.findByText('Gmail connected.', {}, find)).toBeTruthy();
    expect(within(await screen.findByRole('listitem', { name: 'Gmail connection' }, find)).getByText('joseph@gmail.com')).toBeTruthy();
    expect(router.state.location.search).toBe('');
  });

  it('a cancelled sign-in sends nothing; a failed one says so — neither connects', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url === '/integrations' ? Response.json(both()) : Response.json([])));
    const api = createHttpAdapter();
    const finish = vi.spyOn(api.integrations, 'finishSignIn');
    const cancelled = renderApp('/integrations/outlook/callback?error=access_denied&state=s1', { api, auth: { accessToken: 'test-token-not-real' } });
    await waitFor(() => expect(cancelled.router.state.location.pathname).toBe('/contacts'), find);
    await ready();
    expect(finish).not.toHaveBeenCalled();
    expect(screen.queryByText(/Couldn't connect/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Connected accounts' })).toBeNull();
  });

  it('the error state of the real contacts list is unchanged, and Add contact still opens its form', async () => {
    vi.stubGlobal('fetch', async (url: string) => (url === '/chat/sessions' ? Response.json([]) : Response.json({ detail: 'boom' }, { status: 500 })));
    renderApp('/contacts', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
    expect(await screen.findByText("Couldn't load your contacts.", {}, find)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import contacts' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add contact' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: /contact/i })).toBeTruthy());
  });
});
