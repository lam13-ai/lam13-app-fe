import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { useDemoStore } from '@/stores/demoStore';
import { renderApp } from './testUtils';

/**
 * My Contacts → Import contacts: the Gmail and Outlook demo connection flow. Frontend only — a typed
 * address, a local connected state, a simulated import that lists sample contacts. No request is made
 * and the real Contacts API is never involved.
 */

const find = { timeout: 8000 };
const reset = () => useDemoStore.setState({ mail: { gmail: null, outlook: null } });
beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const PROVIDERS = [
  { name: 'Gmail', key: 'gmail', field: 'Gmail address', placeholder: 'you@gmail.com', email: 'user@gmail.com', sample: 'Lena Fischer', vendor: /google|gmail/i },
  { name: 'Outlook', key: 'outlook', field: 'Outlook email', placeholder: 'you@outlook.com', email: 'user@outlook.com', sample: 'Noah Bergström', vendor: /microsoft|outlook|live\.com|office/i },
] as const;

async function openContacts() {
  const app = renderApp('/contacts');
  await screen.findByRole('list', { name: 'Contacts' }, find);
  return app;
}
const menu = () => screen.getByRole('menu', { name: 'Import contacts from' });
const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Import contacts' }));
  return menu();
};
const openForm = (name: string) => {
  fireEvent.click(within(openMenu()).getByRole('menuitem', { name }));
  return screen.getByRole('form', { name: `Connect ${name}` });
};
const connectButton = (form: HTMLElement, name: string) => within(form).getByRole('button', { name: `Connect ${name}` }) as HTMLButtonElement;
const row = (name: string) => screen.getByRole('listitem', { name: `${name} connection` });
const contactNames = () => within(screen.getByRole('list', { name: 'Contacts' })).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);

describe.each(PROVIDERS)('Import contacts: $name (demo)', ({ name, key, field, placeholder, email, sample, vendor }) => {
  it('is in the Import contacts menu, and both providers start disconnected', async () => {
    await openContacts();
    expect(screen.queryByRole('region', { name: 'Connected accounts' })).toBeNull();
    const options = within(openMenu()).getAllByRole('menuitem');
    expect(options.map((o) => o.textContent)).toEqual(['Gmail', 'Outlook']);
    expect(within(menu()).getByRole('menuitem', { name }).querySelector('img')).toBeTruthy();
  });

  it('opens its connection form with the right title, description, field and actions', async () => {
    await openContacts();
    const form = openForm(name);
    expect(within(form).getByRole('heading', { name: `Connect ${name}` })).toBeTruthy();
    expect(within(form).getByText(`Connect your ${name} account to import contacts into Lam13.`)).toBeTruthy();
    expect((within(form).getByLabelText(field) as HTMLInputElement).placeholder).toBe(placeholder);
    expect(within(form).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(connectButton(form, name)).toBeTruthy();
  });

  it('an empty address cannot connect, and Cancel leaves it disconnected', async () => {
    await openContacts();
    const form = openForm(name);
    expect(connectButton(form, name).disabled).toBe(true);
    fireEvent.submit(form);
    expect(useDemoStore.getState().mail[key]).toBeNull();
    fireEvent.change(within(form).getByLabelText(field), { target: { value: email } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(useDemoStore.getState().mail[key]).toBeNull();
    expect(screen.queryByRole('region', { name: 'Connected accounts' })).toBeNull();
  });

  it.each(['user', 'user@', 'user@domain', 'user @gmail.com'])('an invalid address (%s) shows an error and does not connect', async (value) => {
    await openContacts();
    const form = openForm(name);
    fireEvent.change(within(form).getByLabelText(field), { target: { value } });
    fireEvent.click(connectButton(form, name));
    expect(within(form).getByRole('alert').textContent).toBe('Enter a valid email address.');
    expect(useDemoStore.getState().mail[key]).toBeNull();
  });

  it('a valid address connects: the row shows Connected and the supplied email; the other provider stays disconnected', async () => {
    await openContacts();
    const form = openForm(name);
    fireEvent.change(within(form).getByLabelText(field), { target: { value: ` ${email} ` } });
    fireEvent.click(connectButton(form, name));

    expect(within(row(name)).getByText('Connected')).toBeTruthy();
    expect(within(row(name)).getByText(email)).toBeTruthy();
    expect(within(row(name)).getByText('Demo')).toBeTruthy();
    expect(within(row(name)).getByRole('button', { name: `Import contacts from ${name}` })).toBeTruthy();
    expect(within(row(name)).getByRole('button', { name: `Disconnect ${name}` })).toBeTruthy();
    const other = name === 'Gmail' ? 'Outlook' : 'Gmail';
    expect(screen.queryByRole('listitem', { name: `${other} connection` })).toBeNull();
    expect(useDemoStore.getState().mail).toMatchObject({ [key]: { email, imported: false }, [other.toLowerCase()]: null });
    // The menu now marks it as connected.
    expect(within(openMenu()).getByRole('menuitem', { name: new RegExp(`${name}.*Connected`) })).toBeTruthy();
  });

  it('Import contacts shows a loading state, then success and clearly labelled demo contacts — with no request and no change to My Contacts', async () => {
    const { api } = await openContacts();
    const before = contactNames();
    const form = openForm(name);
    fireEvent.change(within(form).getByLabelText(field), { target: { value: email } });
    fireEvent.click(connectButton(form, name));

    const create = vi.spyOn(api.profiles, 'create');
    const list = vi.spyOn(api.profiles, 'list');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireEvent.click(within(row(name)).getByRole('button', { name: `Import contacts from ${name}` }));

    // Loading.
    const busy = within(row(name)).getByRole('button', { name: `Importing contacts from ${name}` }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.textContent).toContain('Importing…');
    expect(screen.queryByText('Contacts imported successfully.')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Imported demo contacts' })).toBeNull();

    // Success.
    expect((await within(row(name)).findByRole('status', {}, { timeout: 4000 })).textContent).toBe('Contacts imported successfully.');
    const imported = screen.getByRole('list', { name: 'Imported demo contacts' });
    expect(within(imported).getAllByRole('listitem')).toHaveLength(3);
    expect(within(imported).getByText(sample)).toBeTruthy();
    for (const item of within(imported).getAllByRole('listitem')) {
      expect(within(item).getByText('Demo')).toBeTruthy();
      expect(item.textContent).toMatch(/@example\.com/); // example addresses only
    }
    expect(screen.getByText(new RegExp(`They were not read from your ${name} account and are not saved to My Contacts`))).toBeTruthy();

    // Nothing left the page, and the user's own contacts are exactly as before.
    expect(fetchSpy.mock.calls.filter((c) => vendor.test(String(c[0])))).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(contactNames()).toEqual(before);
  });

  it('Disconnect returns it to the disconnected state and removes its demo contacts', async () => {
    useDemoStore.setState({ mail: { gmail: null, outlook: null, [key]: { email, imported: true } } });
    await openContacts();
    expect(screen.getByRole('list', { name: 'Imported demo contacts' })).toBeTruthy();
    fireEvent.click(within(row(name)).getByRole('button', { name: `Disconnect ${name}` }));
    expect(screen.queryByRole('listitem', { name: `${name} connection` })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Imported demo contacts' })).toBeNull();
    expect(useDemoStore.getState().mail[key]).toBeNull();
    // It can be connected again from the menu.
    expect(openForm(name)).toBeTruthy();
  });
});

describe('Import contacts: both providers, and the real Contacts page', () => {
  it('Gmail and Outlook connect independently and can both be connected', async () => {
    await openContacts();
    for (const { name, field, email } of PROVIDERS) {
      const form = openForm(name);
      fireEvent.change(within(form).getByLabelText(field), { target: { value: email } });
      fireEvent.click(connectButton(form, name));
    }
    expect(within(row('Gmail')).getByText('user@gmail.com')).toBeTruthy();
    expect(within(row('Outlook')).getByText('user@outlook.com')).toBeTruthy();
    fireEvent.click(within(row('Gmail')).getByRole('button', { name: 'Disconnect Gmail' }));
    expect(screen.queryByRole('listitem', { name: 'Gmail connection' })).toBeNull();
    expect(within(row('Outlook')).getByText('Connected')).toBeTruthy();
  });

  it('with the real adapter: the page still makes only its usual contacts requests, and the demo flow adds none', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      if (url === '/contacts') return Response.json([]);
      if (url.startsWith('/contacts/suggestions') || url === '/chat/sessions') return Response.json([]);
      return Response.json({ detail: 'Not Found' }, { status: 404 });
    });
    renderApp('/contacts', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
    // The real empty state is unchanged.
    expect(await screen.findByText("You don't have any contacts yet", {}, find)).toBeTruthy();
    expect(calls).toContain('GET /contacts');
    const before = [...calls];

    const form = openForm('Gmail');
    fireEvent.change(within(form).getByLabelText('Gmail address'), { target: { value: 'user@gmail.com' } });
    fireEvent.click(connectButton(form, 'Gmail'));
    fireEvent.click(within(row('Gmail')).getByRole('button', { name: 'Import contacts from Gmail' }));
    await within(row('Gmail')).findByRole('status', {}, { timeout: 4000 });

    expect(calls).toEqual(before); // not one extra request
    expect(calls.some((c) => /^(POST|PATCH|DELETE) \/contacts/.test(c))).toBe(false);
    expect(screen.getByText("You don't have any contacts yet")).toBeTruthy(); // demo contacts are not the user's contacts
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
