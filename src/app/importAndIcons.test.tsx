import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { useThemeStore } from '@/stores/themeStore';
import { renderApp } from './testUtils';

/**
 * Archives: each format shows its own recognisable mark. Contacts: importing from Gmail / Outlook is on the
 * page itself — as the empty state when there are no contacts, and below the list when there are some —
 * and never replaces the error state of a failed request.
 */

const find = { timeout: 8000 };
// The theme tokens as text (CSS is not processed in tests). Loaded by a non-literal specifier: the app has no Node types.
const nodeFs = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (path: string, encoding: 'utf8') => string };
const tokens = readFileSync('src/styles/tokens.css', 'utf8');
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Archives: file-type icons', () => {
  const iconOf = (fileName: string) =>
    within(screen.getByRole('list', { name: 'Files' }))
      .getByRole('heading', { level: 3, name: fileName })
      .closest('article')!
      .querySelector('[data-file-icon]') as HTMLElement;

  async function openArchives() {
    renderApp('/projects/water-security');
    fireEvent.click(await screen.findByRole('tab', { name: /Archives/ }, find));
  }

  it('PPTX, DOCX, PDF and images each use their own mark, in their own colour', async () => {
    await openArchives();
    const expected = [
      ['Desalination Capacity Review.pptx', 'powerpoint', /file-ppt/],
      ['KPI Framework Draft.docx', 'word', /file-word/],
      ['Baseline Assessment 2022.pdf', 'pdf', /text-file-pdf/],
      ['Tariff Reform Options Paper.pdf', 'pdf', /text-file-pdf/],
      ['Supply-demand gap chart.png', 'image', /text-fg-muted/],
      ['Workshop whiteboard – levers.jpg', 'image', /text-fg-muted/],
    ] as const;
    for (const [file, type, colour] of expected) {
      const icon = iconOf(file);
      expect(icon.dataset.fileIcon).toBe(type);
      expect(icon.className).toMatch(colour);
      expect(icon.querySelector('svg')).toBeTruthy();
      expect(icon.className).toContain('size-8'); // the same small tile for every type
      expect(icon.className).not.toMatch(/bg-fg( |$)|bg-black/); // no solid black container
    }
    // Three different drawings for the three document formats — not one generic document icon.
    const drawings = ['Desalination Capacity Review.pptx', 'KPI Framework Draft.docx', 'Baseline Assessment 2022.pdf'].map((f) => iconOf(f).querySelector('path')!.getAttribute('d'));
    expect(new Set(drawings).size).toBe(3);
    for (const d of drawings) expect(d!.length).toBeGreaterThan(100);
    // Every file of a format gets that format's mark.
    const all = [...screen.getByRole('list', { name: 'Files' }).querySelectorAll<HTMLElement>('[data-file-icon]')].map((el) => el.dataset.fileIcon);
    expect(all.filter((t) => t === 'powerpoint')).toHaveLength(3);
    expect(all.filter((t) => t === 'pdf')).toHaveLength(2);
    expect(all.filter((t) => t === 'word')).toHaveLength(1);
    expect(all.filter((t) => t === 'image')).toHaveLength(3);
  });

  it.each(['light', 'dark'] as const)('the marks render in the %s theme', async (theme) => {
    useThemeStore.getState().setPreference(theme);
    try {
      await openArchives();
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(iconOf('Desalination Capacity Review.pptx').querySelector('svg')).toBeTruthy();
      expect(iconOf('KPI Framework Draft.docx').querySelector('svg')).toBeTruthy();
      expect(iconOf('Baseline Assessment 2022.pdf').querySelector('svg')).toBeTruthy();
      expect(iconOf('Supply-demand gap chart.png').querySelector('svg')).toBeTruthy();
    } finally {
      useThemeStore.getState().setPreference('system');
    }
  });

  it.each(['light', 'dark'] as const)('the PDF mark is Acrobat red in the %s theme — not the blue accent — and only softly tinted', async (theme) => {
    useThemeStore.getState().setPreference(theme);
    try {
      await openArchives();
      for (const file of ['Baseline Assessment 2022.pdf', 'Tariff Reform Options Paper.pdf']) {
        const icon = iconOf(file);
        expect(icon.className).toContain('text-file-pdf');
        expect(icon.className).toContain('bg-file-pdf/12'); // a light tint of the same red, not a solid block
        expect(icon.className).not.toMatch(/accent|file-word|file-ppt/);
      }
      expect(iconOf('KPI Framework Draft.docx').className).toContain('text-file-word');
      expect(iconOf('Desalination Capacity Review.pptx').className).toContain('text-file-ppt');
      // The token behind the class is a red in both themes: the first value is the light one, the second the dark.
      const values = [...tokens.matchAll(/--color-file-pdf:\s*#([0-9a-f]{6})/gi)].map((m) => m[1]!);
      expect(values).toHaveLength(2);
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(values[theme === 'light' ? 0 : 1]!.slice(i, i + 2), 16)) as [number, number, number];
      expect(r).toBeGreaterThan(g + 80);
      expect(r).toBeGreaterThan(b + 80);
    } finally {
      useThemeStore.getState().setPreference('system');
    }
  });

  it('an uploaded file gets the mark of its extension, and a type the Archives do not take is refused with the reason', async () => {
    await openArchives();
    fireEvent.change(screen.getByLabelText('Choose files to add'), { target: { files: [new File(['x'], 'Notes.docx'), new File(['y'], 'Readme.txt')] } });
    await screen.findByRole('heading', { level: 3, name: 'Notes.docx' }, find);
    expect(iconOf('Notes.docx').dataset.fileIcon).toBe('word');
    expect(await screen.findByText('Readme.txt: Supported files: PDF, DOCX, PPTX, PNG, JPG, GIF, WEBP.', {}, find)).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 3, name: 'Readme.txt' })).toBeNull();
  });
});

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

/** Gmail and Outlook as the backend reports them: configured on the server, not connected. */
const MAIL = ['gmail', 'outlook'].map((provider) => ({ provider, status: 'disconnected', configured: true, account: null, last_synced_at: null }));

/** The real adapter over a fake backend answering GET /contacts with `respond`. Records every request. */
function backend(respond: () => Response) {
  const calls: string[] = [];
  const api = createHttpAdapter();
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (url === '/contacts') return respond();
    if (url === '/integrations') return Response.json(MAIL);
    if (url.startsWith('/contacts/suggestions') || url === '/chat/sessions') return Response.json([]);
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  renderApp('/contacts', { api, auth: { accessToken: 'test-token-not-real' } });
  return Object.assign(calls, { api });
}
const page = () => within(screen.getByRole('region', { name: 'My Contacts' }));
/** The page has rendered (the app starts asynchronously). */
const ready = () => screen.findByRole('region', { name: 'My Contacts' }, find);
const external = (calls: string[]) => calls.filter((c) => /google|gmail|microsoft|outlook|live\.com|office/i.test(c));

describe('Contacts: importing is on the page', () => {
  it('zero contacts → the empty state offers Gmail and Outlook without opening a menu (and Add contact)', async () => {
    backend(() => Response.json([]));
    expect(await screen.findByRole('heading', { level: 2, name: "You don't have any contacts yet" }, find)).toBeTruthy();
    expect(page().getByText('Import your contacts from Gmail or Outlook to get started.')).toBeTruthy();
    for (const name of ['Gmail', 'Outlook']) {
      const option = page().getByRole('button', { name: `Import from ${name}` });
      expect(option.querySelector('img')).toBeTruthy();
    }
    expect(page().getByRole('button', { name: 'Add contact' })).toBeTruthy();
    expect(page().queryByText("Couldn't load your contacts.")).toBeNull();
    expect(page().queryByRole('heading', { name: 'Import more contacts' })).toBeNull(); // the empty state is the import section
  });

  it.each([
    ['one contact', [contact('c1', 'Daniel Brandt')]],
    ['several contacts', [contact('c1', 'Daniel Brandt'), contact('c2', 'Maya Okafor'), contact('c3', 'Priya Raman'), contact('c4', 'Hannah Lee'), contact('c5', 'Tomás Alvarez')]],
  ])('%s → the contacts show normally and "Import more contacts" sits below the whole list', async (_label, contacts) => {
    backend(() => Response.json(contacts));
    const list = await screen.findByRole('list', { name: 'Contacts' }, find);
    expect(within(list).getAllByRole('heading', { level: 2 })).toHaveLength(contacts.length);

    const section = page().getByRole('region', { name: 'Import more contacts' });
    expect(within(section).getByText('Bring contacts from Gmail or Outlook.')).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Import from Gmail' })).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Import from Outlook' })).toBeTruthy();
    // After the list in the document, i.e. below every contact.
    expect(list.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.contains(section)).toBe(false);
    expect(page().queryByText("You don't have any contacts yet")).toBeNull();
  });

  it('a failed request → the existing error state, not the empty state and not the import section', async () => {
    backend(() => Response.json({ detail: 'boom' }, { status: 500 }));
    await ready();
    expect(await page().findByText("Couldn't load your contacts.", {}, find)).toBeTruthy();
    expect(page().getByText('Check your connection and try again.')).toBeTruthy();
    expect(page().getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(page().queryByText("You don't have any contacts yet")).toBeNull();
    expect(page().queryByRole('button', { name: /^Import from/ })).toBeNull();
    expect(page().getByRole('button', { name: 'Import contacts' })).toBeTruthy(); // the header shortcut is still there
  });

  it.each([
    ['Gmail', 'gmail'],
    ['Outlook', 'outlook'],
  ] as const)("%s on the page starts the provider's own sign-in — it is not connected by being clicked", async (name, key) => {
    const calls = backend(() => Response.json([]));
    const connect = vi.spyOn(calls.api.integrations, 'connect').mockResolvedValue(); // the real one leaves the app
    await ready();
    const option = (await page().findByRole('button', { name: `Import from ${name}` }, find)) as HTMLButtonElement;
    await waitFor(() => expect(option.disabled).toBe(false));
    fireEvent.click(option);
    await waitFor(() => expect(connect).toHaveBeenCalledWith(key));
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('listitem', { name: `${name} connection` })).toBeNull();
    expect(page().queryByText('Connected')).toBeNull();
    expect(page().getByRole('button', { name: `Import from ${name === 'Gmail' ? 'Outlook' : 'Gmail'}` })).toBeTruthy();
    expect(external(calls)).toEqual([]); // the page itself talks only to the Lam13 backend
    expect(screen.getByText("You don't have any contacts yet")).toBeTruthy(); // still the real, empty list
  });

  it('the import section below the list starts the same sign-in', async () => {
    const calls = backend(() => Response.json([contact('c1', 'Daniel Brandt')]));
    const connect = vi.spyOn(calls.api.integrations, 'connect').mockResolvedValue();
    await ready();
    const section = await page().findByRole('region', { name: 'Import more contacts' }, find);
    const option = within(section).getByRole('button', { name: 'Import from Outlook' }) as HTMLButtonElement;
    await waitFor(() => expect(option.disabled).toBe(false));
    fireEvent.click(option);
    await waitFor(() => expect(connect).toHaveBeenCalledWith('outlook'));
    expect(screen.queryByRole('listitem', { name: 'Outlook connection' })).toBeNull();
    expect(within(screen.getByRole('list', { name: 'Contacts' })).getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });
});
