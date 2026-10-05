import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { renderApp } from './testUtils';

/**
 * My Contacts against the real HTTP adapter: what GET /contacts answered decides the page — an empty
 * list is the empty state, only a failed request is the error state.
 */

const contact = (id: string, full_name: string) => ({
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
});

/** `contacts` / `suggestions`: the response for that route (anything else is 404, like the real backend). */
function backend(routes: { contacts: () => Response; suggestions?: () => Response }) {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/contacts') return routes.contacts();
    if (url.startsWith('/contacts/suggestions')) return (routes.suggestions ?? (() => Response.json([])))();
    if (url === '/chat/sessions') return Response.json([]);
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  renderApp('/contacts', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
}

const page = () => screen.findByRole('region', { name: 'My Contacts' }, { timeout: 8000 });
afterEach(() => vi.unstubAllGlobals());

describe('My Contacts: empty vs error', () => {
  it('a successful empty list shows the empty state, not an error', async () => {
    backend({ contacts: () => Response.json([]) });
    const view = within(await page());
    expect(await view.findByText('No contacts yet.')).toBeTruthy();
    expect(view.getByText('Add people you work with and keep approved notes about them in one place.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Add contact' })).toBeTruthy();
    expect(view.queryByText("Couldn't load your contacts.")).toBeNull();
  });

  it('an empty list still shows the empty state when suggestions fail to load', async () => {
    backend({ contacts: () => Response.json([]), suggestions: () => Response.json({ detail: 'boom' }, { status: 500 }) });
    const view = within(await page());
    expect(await view.findByText('No contacts yet.', {}, { timeout: 8000 })).toBeTruthy();
    expect(view.queryByText("Couldn't load your contacts.")).toBeNull();
  });

  it('a failed request shows the error state with Try again', async () => {
    backend({ contacts: () => Response.json({ detail: 'Bad request' }, { status: 400 }) });
    const view = within(await page());
    expect(await view.findByText("Couldn't load your contacts.")).toBeTruthy();
    expect(view.getByText('Check your connection and try again.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(view.queryByText('No contacts yet.')).toBeNull();
  });

  it('a non-empty list shows the contacts', async () => {
    backend({ contacts: () => Response.json([contact('c1', 'Daniel Brandt'), contact('c2', 'Maya Okafor')]) });
    const list = await screen.findByRole('list', { name: 'Contacts' }, { timeout: 8000 });
    expect(within(list).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Daniel Brandt', 'Maya Okafor']),
    );
    expect(screen.queryByText('No contacts yet.')).toBeNull();
    expect(screen.queryByText("Couldn't load your contacts.")).toBeNull();
  });
});
