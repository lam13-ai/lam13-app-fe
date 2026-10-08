import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationConnection } from '@/types/api';
import { renderApp } from './testUtils';

/**
 * The calendar's note taker (Granola's real connection), the custom MCP form scrolling into view,
 * and the Integrations rows' real status. (Contacts import: mailImport.test.tsx.)
 */

const find = { timeout: 8000 };
afterEach(() => vi.restoreAllMocks());

describe('Calendar: note taker', () => {
  const trigger = () => screen.getByRole('button', { name: /^Note taker:/ });

  it('has no Custom Note Taker and no set-up form: Granola, and the ones Lam13 has no integration for', async () => {
    renderApp('/calendar');
    await screen.findByRole('tablist', { name: 'Calendar sections' }, find);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected')); // the sample backend's Granola
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu', { name: 'Note taker' });
    expect(within(menu).getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual(['Granola']);
    expect(within(screen.getByRole('list', { name: 'Not available yet' })).getAllByRole('listitem').map((o) => o.textContent)).toEqual(['OtterNot available yet', 'FirefliesNot available yet']);
    expect(screen.queryByRole('menuitemradio', { name: /custom/i })).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByLabelText('Webhook URL')).toBeNull();
  });

  it('a disconnected Granola reads "Not connected"; choosing it starts the real sign-in and it stays not connected until that succeeds', async () => {
    const { api } = renderApp('/calendar');
    vi.spyOn(api.meetings, 'connection').mockResolvedValue({ provider: 'granola', status: 'disconnected' });
    // The real flow leaves the app for Granola and connects only on the way back.
    const connect = vi.spyOn(api.meetings, 'setConnected').mockResolvedValue({ provider: 'granola', status: 'disconnected' });
    await screen.findByRole('tablist', { name: 'Calendar sections' }, find);
    await waitFor(() => expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Not connected'));
    fireEvent.click(trigger());
    fireEvent.click(within(screen.getByRole('menu', { name: 'Note taker' })).getByRole('menuitemradio', { name: 'Connect Granola' }));
    await waitFor(() => expect(connect).toHaveBeenCalledWith(true));
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Not connected');
  });
});

describe('Integrations: custom MCP form', () => {
  it('opening the form scrolls the section into view from its start; closing does not scroll', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderApp('/integrations');
      const section = await screen.findByRole('region', { name: 'Custom MCP Server' }, find);
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.click(await within(section).findByRole('button', { name: 'Add custom server' }, find));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.instances[0]).toBe(section); // the section itself, not the page bottom
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect(document.activeElement).toBe(within(section).getByLabelText('Name')); // the form is ready to type in
      // The form's fields are unchanged.
      for (const label of ['Name', 'MCP Server URL', /API key/]) expect(within(section).getByLabelText(label)).toBeTruthy();

      fireEvent.click(within(section).getByRole('button', { name: 'Cancel' }));
      expect(within(section).getByRole('button', { name: 'Add custom server' })).toBeTruthy();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('with reduced motion the scroll is not animated', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    try {
      renderApp('/integrations');
      const section = await screen.findByRole('region', { name: 'Custom MCP Server' }, find);
      fireEvent.click(await within(section).findByRole('button', { name: 'Add custom server' }, find));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' }));
    } finally {
      Element.prototype.scrollIntoView = original;
      vi.unstubAllGlobals();
    }
  });
});

describe('Integrations: every row shows the backend\u2019s state', () => {
  const row = (name: string) => screen.getByRole('region', { name });
  const NO_BACKEND = ['Otter', 'Fireflies', 'Microsoft Teams chat', 'Slack'];
  const ACCOUNTS = [
    ['Google Meet', 'google_meet'],
    ['Zoom', 'zoom'],
    ['Webex', 'webex'],
    ['Microsoft Teams', 'teams'],
    ['SharePoint', 'sharepoint'],
    ['OneDrive', 'onedrive'],
    ['Google Drive', 'google_drive'],
  ] as const;
  const connection = (provider: string, over: Partial<IntegrationConnection> = {}) =>
    ({ provider, status: 'disconnected', configured: true, account: null, last_synced_at: null, ...over }) as IntegrationConnection;
  const open = async (list?: IntegrationConnection[]) => {
    const app = renderApp('/integrations');
    if (list) vi.spyOn(app.api.integrations, 'list').mockResolvedValue(list);
    await screen.findByRole('region', { name: 'Slack' }, find);
    return app;
  };

  it('a service without an integration says "Not available yet" and has nothing to press', async () => {
    await open();
    for (const name of NO_BACKEND) {
      expect(within(row(name)).getByText('Not available yet')).toBeTruthy();
      expect(within(row(name)).queryByRole('button')).toBeNull();
      expect(within(row(name)).queryByText('Connected')).toBeNull();
    }
    expect(row('Microsoft Teams chat').textContent).toMatch(/Chat with Lam13 inside Microsoft Teams: ask the AI assistant/);
    expect(document.body.textContent).not.toMatch(/\bdemo\b/i);
  });

  it('a server with no provider credentials: every account row says "Not set up on this server" — no Connect, no Connected', async () => {
    await open(); // the sample backend has no provider configured
    for (const [name] of ACCOUNTS) {
      expect(await within(row(name)).findByText('Not set up on this server', {}, find)).toBeTruthy();
      expect(within(row(name)).queryByRole('button')).toBeNull();
      expect(within(row(name)).queryByText('Connected')).toBeNull();
    }
  });

  it("Connect starts the provider's sign-in and the row stays disconnected; only the backend's state shows Connected, with the account", async () => {
    const { api } = await open(ACCOUNTS.map(([, provider]) => connection(provider, provider === 'onedrive' ? { status: 'connected', account: 'joseph@contoso.com' } : provider === 'zoom' ? { status: 'error' } : {})));
    const connect = vi.spyOn(api.integrations, 'connect').mockResolvedValue(); // the real one leaves the app
    const drive = row('Google Drive');
    fireEvent.click(await within(drive).findByRole('button', { name: 'Connect Google Drive' }, find));
    await waitFor(() => expect(connect).toHaveBeenCalledWith('google_drive'));
    expect(within(drive).queryByText('Connected')).toBeNull();
    expect(within(drive).getByRole('button', { name: 'Connect Google Drive' })).toBeTruthy();

    expect(within(row('OneDrive')).getByText('Connected')).toBeTruthy();
    expect(within(row('OneDrive')).getByText('joseph@contoso.com')).toBeTruthy();
    expect(within(row('OneDrive')).getByText('Connected').className).not.toMatch(/font-bold/); // restrained
    expect(within(row('Zoom')).getByText('Needs to be connected again')).toBeTruthy();
    expect(within(row('Zoom')).getByRole('button', { name: 'Reconnect Zoom' })).toBeTruthy();

    const disconnect = vi.spyOn(api.integrations, 'disconnect').mockResolvedValue(connection('onedrive'));
    fireEvent.click(within(row('OneDrive')).getByRole('button', { name: 'Disconnect OneDrive' }));
    expect(await within(row('OneDrive')).findByRole('button', { name: 'Connect OneDrive' })).toBeTruthy();
    expect(disconnect).toHaveBeenCalledWith('onedrive');
    expect(within(row('OneDrive')).queryByText('Connected')).toBeNull();
  });

  it('a sign-in the provider refuses is reported, and nothing is connected', async () => {
    const { api } = await open(ACCOUNTS.map(([, provider]) => connection(provider)));
    fireEvent.click(await within(row('Webex')).findByRole('button', { name: 'Connect Webex' }, find)); // the sample backend refuses: 503
    expect(await screen.findByText("Couldn't connect Webex. This integration is not set up on the server yet.")).toBeTruthy();
    expect(within(row('Webex')).queryByText('Connected')).toBeNull();
    expect(api.capabilities.whatsapp).toBe(true); // (the sample backend simulates WhatsApp; the real one does not — integrations.test.tsx)
  });

  it("the callback page sends the provider's code once and returns to Integrations; a refused code says so", async () => {
    const app = renderApp('/integrations/google_drive/callback?code=c1&state=s1');
    const finish = vi.spyOn(app.api.integrations, 'finishSignIn').mockResolvedValue(connection('google_drive', { status: 'connected' }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/integrations'), find);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith('google_drive', 'c1', 's1');
    expect(await screen.findByText('Google Drive connected.', {}, find)).toBeTruthy();
    expect(app.router.state.location.search).toBe('');
  });

  it('a callback the backend refuses shows the error on Integrations', async () => {
    const app = renderApp('/integrations/zoom/callback?code=c1&state=old'); // the sample backend refuses every code
    expect(await screen.findByText("Couldn't connect Zoom. Please try again.", {}, find)).toBeTruthy();
    expect(app.router.state.location.pathname).toBe('/integrations');
  });
});
