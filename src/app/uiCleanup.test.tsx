import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoStore } from '@/stores/demoStore';
import { renderApp } from './testUtils';

/**
 * The calendar's note takers (built-in only), the custom MCP form scrolling into view,
 * and the demo integrations' status. (Contacts import: mailImport.test.tsx.)
 */

const find = { timeout: 8000 };
beforeEach(() => useDemoStore.setState({ connected: {}, customServer: null, noteTaker: 'granola' }));
afterEach(() => vi.restoreAllMocks());

describe('Calendar: note taker', () => {
  const trigger = () => screen.getByRole('button', { name: /^Note taker:/ });

  it('has no Custom Note Taker: only the built-in ones, and no set-up form', async () => {
    renderApp('/calendar');
    await screen.findByRole('tablist', { name: 'Calendar sections' }, find);
    expect(trigger().getAttribute('aria-label')).toBe('Note taker: Granola Connected');
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu', { name: 'Note taker' });
    expect(within(menu).getAllByRole('menuitemradio').map((o) => o.textContent)).toEqual(['Granola', 'Otter', 'Fireflies']);
    expect(within(menu).queryByRole('menuitemradio', { name: /custom/i })).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByLabelText('Webhook URL')).toBeNull();
    expect(useDemoStore.getState()).not.toHaveProperty('customNoteTaker');
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
      const section = await screen.findByRole('region', { name: 'Custom MCP Server' }, find);
      expect(scrollIntoView).not.toHaveBeenCalled();

      fireEvent.click(within(section).getByRole('button', { name: 'Add custom server' }));
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
