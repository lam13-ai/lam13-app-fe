import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoStore } from '@/stores/demoStore';
import { renderApp } from './testUtils';

/**
 * The calendar's custom note taker (a URL before "Connected"), the custom MCP form scrolling into view,
 * and the demo integrations' status. (Contacts import: mailImport.test.tsx.)
 */

const find = { timeout: 8000 };
beforeEach(() => useDemoStore.setState({ connected: {}, customServer: null, noteTaker: 'granola', customNoteTaker: null }));
afterEach(() => vi.restoreAllMocks());

describe('Calendar: Custom Note Taker', () => {
  const trigger = () => screen.getByRole('button', { name: /^Note taker:/ });
  const openForm = async () => {
    renderApp('/calendar');
    await screen.findByRole('tablist', { name: 'Calendar sections' }, find);
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected'); // initial state: not the custom one
    fireEvent.click(trigger());
    const option = within(screen.getByRole('menu', { name: 'Note taker' })).getByRole('menuitemradio', { name: 'Custom Note Taker' });
    expect(option.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(option);
    return screen.getByRole('form', { name: 'Custom Note Taker' });
  };
  const url = (form: HTMLElement) => within(form).getByLabelText('Webhook URL') as HTMLInputElement;
  const connect = (form: HTMLElement) => within(form).getByRole('button', { name: 'Connect' }) as HTMLButtonElement;

  it('choosing it opens the set-up and does not connect', async () => {
    const form = await openForm();
    expect(within(form).getByText('Connect your own note taker using a webhook or callback URL.')).toBeTruthy();
    expect(url(form).placeholder).toBe('https://example.com/webhook');
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected');
    expect(useDemoStore.getState()).toMatchObject({ noteTaker: 'granola', customNoteTaker: null });
  });

  it('an empty URL cannot connect', async () => {
    const form = await openForm();
    expect(connect(form).disabled).toBe(true);
    fireEvent.change(url(form), { target: { value: '   ' } });
    expect(connect(form).disabled).toBe(true);
    fireEvent.submit(form); // Enter in the field
    expect(useDemoStore.getState().customNoteTaker).toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected');
  });

  it.each(['not a url', 'example.com/webhook', 'http://example.com/webhook', 'ftp://example.com/x'])('an invalid URL (%s) shows an error and does not connect', async (value) => {
    const form = await openForm();
    fireEvent.change(url(form), { target: { value } });
    fireEvent.click(connect(form));
    expect(within(form).getByRole('alert').textContent).toBe('Enter a valid https:// URL.');
    expect(url(form).getAttribute('aria-invalid')).toBe('true');
    expect(useDemoStore.getState().customNoteTaker).toBeNull();
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected');
  });

  it('a valid URL + Connect shows Custom Note Taker as connected, without any request', async () => {
    const form = await openForm();
    const fetchSpy = vi.spyOn(globalThis, 'fetch'); // from here on: connecting must not call anything
    fireEvent.change(url(form), { target: { value: ' https://notes.example.com/webhook ' } });
    fireEvent.click(connect(form));
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Custom Note Taker Connected');
    expect(useDemoStore.getState()).toMatchObject({ noteTaker: 'custom', customNoteTaker: { url: 'https://notes.example.com/webhook' } });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(trigger().getAttribute('aria-expanded')).toBe('false'); // the set-up closed
  });

  it('Cancel leaves it disconnected, even with a valid URL typed', async () => {
    const form = await openForm();
    fireEvent.change(url(form), { target: { value: 'https://notes.example.com/webhook' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected');
    expect(useDemoStore.getState()).toMatchObject({ noteTaker: 'granola', customNoteTaker: null });
  });

  it('reopening it after connecting shows the URL, and Disconnect returns to a built-in note taker', async () => {
    const form = await openForm();
    fireEvent.change(url(form), { target: { value: 'https://notes.example.com/webhook' } });
    fireEvent.click(connect(form));

    fireEvent.click(trigger());
    const option = within(screen.getByRole('menu', { name: 'Note taker' })).getByRole('menuitemradio', { name: 'Custom Note Taker' });
    expect(option.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(option);
    const again = screen.getByRole('form', { name: 'Custom Note Taker' });
    expect(url(again).value).toBe('https://notes.example.com/webhook');
    fireEvent.click(within(again).getByRole('button', { name: 'Disconnect' }));
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected');
    expect(useDemoStore.getState().customNoteTaker).toBeNull();
  });

  it('the built-in note takers still switch with one click', async () => {
    renderApp('/calendar');
    await screen.findByRole('tablist', { name: 'Calendar sections' }, find);
    fireEvent.click(trigger());
    fireEvent.click(within(screen.getByRole('menu', { name: 'Note taker' })).getByRole('menuitemradio', { name: 'Otter' }));
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Otter Connected');
  });
});

describe('Integrations: custom MCP form', () => {
  it('opening the form scrolls the section into view from its start; closing does not scroll', async () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderApp('/integrations');
      const section = await screen.findByRole('region', { name: 'Custom MCP Server / Custom Note Taker' }, find);
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.click(within(section).getByRole('button', { name: 'Add custom server' }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.instances[0]).toBe(section); // the section itself, not the page bottom
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect(document.activeElement).toBe(within(section).getByLabelText('Name')); // the form is ready to type in
      // The form's fields are unchanged.
      for (const label of ['Name', 'Endpoint or webhook URL', /API key/]) expect(within(section).getByLabelText(label)).toBeTruthy();

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
      const section = await screen.findByRole('region', { name: 'Custom MCP Server / Custom Note Taker' }, find);
      fireEvent.click(within(section).getByRole('button', { name: 'Add custom server' }));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' }));
    } finally {
      Element.prototype.scrollIntoView = original;
      vi.unstubAllGlobals();
    }
  });
});

describe('Integrations: connected status of the demo integrations', () => {
  const DEMO = ['Otter', 'Fireflies', 'Microsoft Teams', 'Slack'];
  const row = (name: string) => screen.getByRole('region', { name });
  const open = async () => {
    renderApp('/integrations');
    await screen.findByRole('region', { name: 'Slack' }, find);
  };

  it('a disconnected row shows Connect and no status; Connect shows ● Connected, DEMO and Disconnect; Disconnect returns it', async () => {
    await open();
    for (const name of DEMO) {
      expect(within(row(name)).queryByText('Connected')).toBeNull();
      expect(within(row(name)).queryByText('Demo')).toBeNull();
      fireEvent.click(within(row(name)).getByRole('button', { name: `Connect ${name}` }));
      expect(within(row(name)).getByText('Connected')).toBeTruthy();
      expect(within(row(name)).getByText('Demo')).toBeTruthy();
      expect(within(row(name)).queryByRole('button', { name: `Connect ${name}` })).toBeNull();
      // Restrained: the status is not bold.
      expect(within(row(name)).getByText('Connected').className).not.toMatch(/font-bold/);
    }
    // All four are connected at once, each from the same state.
    expect(Object.entries(useDemoStore.getState().connected).filter(([, on]) => on).map(([id]) => id).sort()).toEqual(['fireflies', 'otter', 'slack', 'teams']);

    fireEvent.click(within(row('Slack')).getByRole('button', { name: 'Disconnect Slack' }));
    expect(within(row('Slack')).queryByText('Connected')).toBeNull();
    expect(within(row('Slack')).getByRole('button', { name: 'Connect Slack' })).toBeTruthy();
    expect(within(row('Otter')).getByText('Connected')).toBeTruthy(); // the others are untouched
  });

  it('the rows read the shared demo state: one already connected there shows as connected when the page opens', async () => {
    useDemoStore.setState({ connected: { slack: true } });
    await open();
    expect(within(row('Slack')).getByText('Connected')).toBeTruthy();
    expect(within(row('Slack')).getByRole('button', { name: 'Disconnect Slack' })).toBeTruthy();
    expect(within(row('Microsoft Teams')).queryByText('Connected')).toBeNull();
    expect(within(row('Microsoft Teams')).getByRole('button', { name: 'Connect Microsoft Teams' })).toBeTruthy();
  });
});
