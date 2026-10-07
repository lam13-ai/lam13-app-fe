import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpAdapter } from '@/api';
import { useDemoStore } from '@/stores/demoStore';
import { useThemeStore } from '@/stores/themeStore';
import { renderApp } from './testUtils';

/**
 * Archives: each format shows its own recognisable mark. Contacts: importing from Gmail / Outlook is on the
 * page itself — as the empty state when there are no contacts, and below the list when there are some —
 * and never replaces the error state of a failed request.
 */

const find = { timeout: 8000 };
beforeEach(() => useDemoStore.setState({ mail: { gmail: null, outlook: null } }));
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
      ['Baseline Assessment 2022.pdf', 'pdf', /text-accent/],
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

  it('a file added locally gets the mark of its extension', async () => {
    await openArchives();
    fireEvent.change(screen.getByLabelText('Choose files to add'), { target: { files: [new File(['x'], 'Notes.docx'), new File(['y'], 'Readme.txt')] } });
    expect(iconOf('Notes.docx').dataset.fileIcon).toBe('word');
    expect(iconOf('Readme.txt').dataset.fileIcon).toBe('file');
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

/** The real adapter over a fake backend answering GET /contacts with `respond`. Records every request. */
function backend(respond: () => Response) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (url === '/contacts') return respond();
    if (url.startsWith('/contacts/suggestions') || url === '/chat/sessions') return Response.json([]);
    return Response.json({ detail: 'Not Found' }, { status: 404 });
  });
  renderApp('/contacts', { api: createHttpAdapter(), auth: { accessToken: 'test-token-not-real' } });
  return calls;
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
    ['Gmail', 'Gmail address', 'you@gmail.com', 'user@gmail.com'],
    ['Outlook', 'Outlook email', 'you@outlook.com', 'user@outlook.com'],
  ])('%s on the page opens its connection flow; a valid address connects — with no request to anyone', async (name, field, placeholder, email) => {
    const calls = backend(() => Response.json([]));
    await ready();
    fireEvent.click(await page().findByRole('button', { name: `Import from ${name}` }, find));
    const form = screen.getByRole('form', { name: `Connect ${name}` });
    expect(within(form).getByText(`Connect your ${name} account to import contacts into Lam13.`)).toBeTruthy();
    const input = within(form).getByLabelText(field) as HTMLInputElement;
    expect(input.placeholder).toBe(placeholder);
    const connect = within(form).getByRole('button', { name: `Connect ${name}` }) as HTMLButtonElement;
    expect(connect.disabled).toBe(true);
    expect(within(form).getByRole('button', { name: 'Cancel' })).toBeTruthy();

    const before = [...calls];
    fireEvent.change(input, { target: { value: email } });
    fireEvent.click(connect);
    const row = screen.getByRole('listitem', { name: `${name} connection` });
    expect(within(row).getByText('Connected')).toBeTruthy();
    expect(within(row).getByText(email)).toBeTruthy();
    expect(within(row).getByRole('button', { name: `Import contacts from ${name}` })).toBeTruthy();
    // On the page the option now reads as connected, and the other provider can still be connected.
    expect(page().queryByRole('button', { name: `Import from ${name}` })).toBeNull();
    expect(page().getByRole('button', { name: `Import from ${name === 'Gmail' ? 'Outlook' : 'Gmail'}` })).toBeTruthy();
    expect(calls).toEqual(before);
    expect(external(calls)).toEqual([]);
    expect(screen.getByText("You don't have any contacts yet")).toBeTruthy(); // still the real, empty list
  });

  it('the import section below the list opens the same flow', async () => {
    backend(() => Response.json([contact('c1', 'Daniel Brandt')]));
    await ready();
    const section = await page().findByRole('region', { name: 'Import more contacts' }, find);
    fireEvent.click(within(section).getByRole('button', { name: 'Import from Outlook' }));
    const form = screen.getByRole('form', { name: 'Connect Outlook' });
    fireEvent.change(within(form).getByLabelText('Outlook email'), { target: { value: 'user@outlook.com' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Connect Outlook' }));
    expect(within(screen.getByRole('listitem', { name: 'Outlook connection' })).getByText('user@outlook.com')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Contacts' })).getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });
});
