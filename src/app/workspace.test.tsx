import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDemoStore } from '@/stores/demoStore';
import { renderApp } from './testUtils';

/** Navigation, Projects (instructions / archives), Calendar (three tabs) and the demo integrations — sample data and local state. */

const find = { timeout: 8000 };
beforeEach(() => useDemoStore.setState({ connected: {}, customServer: null, noteTaker: 'granola' }));

describe('Sidebar navigation', () => {
  it('has Projects, My Contacts, Calendar and Integrations — and no separate Meetings entry', async () => {
    renderApp('/');
    await screen.findByRole('link', { name: 'Projects' }, find);
    const nav = ['Projects', 'My Contacts', 'Calendar', 'Integrations'];
    for (const name of nav) expect(screen.getByRole('link', { name })).toBeTruthy();
    const order = screen.getAllByRole('link').map((a) => a.textContent).filter((text) => nav.includes(text ?? ''));
    expect(order).toEqual(nav);
    expect(screen.queryByRole('link', { name: 'Meetings' })).toBeNull();
  });
});

describe('Projects', () => {
  it('opens a project on its chats, and keeps Instructions, Archives and Team and Contacts beside them', async () => {
    renderApp('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Projects' }, find));
    const list = await screen.findByRole('list', { name: 'Projects' }, find);
    fireEvent.click(within(list).getByRole('link', { name: /National Water Security Strategy/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'National Water Security Strategy' }, find)).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Chats', 'Instructions', 'Archives', 'Team and Contacts']);
    expect(screen.getByRole('tab', { name: /Chats/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Instructions' }));
    expect(screen.getByText('Instructions tell Lam how to work within this project. They apply whenever you chat in this project.')).toBeTruthy();
    expect(screen.getByText(/Use the attached strategy documents as the primary source/)).toBeTruthy(); // the example
  });

  it('instructions are editable: unsaved until saved, saved text survives switching tabs, and Discard restores it', async () => {
    renderApp('/projects/water-security');
    const box = () => screen.getByRole('textbox', { name: 'Project instructions' }) as HTMLTextAreaElement;
    fireEvent.click(await screen.findByRole('tab', { name: 'Instructions' }, find));
    const save = () => screen.getByRole('button', { name: 'Save instructions' }) as HTMLButtonElement;
    expect(box().value).toMatch(/^Write for ministry leadership/);
    expect(within(screen.getByRole('tabpanel')).getByRole('status').textContent).toBe('Saved');
    expect(save().disabled).toBe(true);

    fireEvent.change(box(), { target: { value: 'Answer in three bullet points.' } });
    expect(within(screen.getByRole('tabpanel')).getByRole('status').textContent).toBe('Unsaved changes');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(box().value).toMatch(/^Write for ministry leadership/);

    fireEvent.change(box(), { target: { value: 'Answer in three bullet points.' } });
    fireEvent.click(save());
    await waitFor(() => expect(within(screen.getByRole('tabpanel')).getByRole('status').textContent).toBe('Saved'));
    expect(save().disabled).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: /Archives/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Instructions' }));
    expect(box().value).toBe('Answer in three bullet points.');
  });

  it('has no Context tab or Context section, on the project page', async () => {
    renderApp('/projects/water-security');
    await screen.findByRole('tablist', { name: 'Project sections' }, find);
    expect(screen.queryByRole('tab', { name: /Context/ })).toBeNull();
    for (const tab of screen.getAllByRole('tab')) {
      fireEvent.click(tab);
      expect(screen.getByRole('tabpanel').textContent).not.toMatch(/\bContext\b/);
    }
  });

  it('Archives is a file library filtered by type and by name, and uploads picked files, saying which ones Lam can read', async () => {
    renderApp('/projects/water-security');
    fireEvent.click(await screen.findByRole('tab', { name: /Archives/ }, find));
    const files = () => within(screen.getByRole('list', { name: 'Files' })).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(files()).toHaveLength(9);
    expect(screen.getAllByText('Readable by Lam').length).toBe(8);
    expect(screen.getByText('Processing…')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Presentations/ }));
    expect(files()).toHaveLength(3);
    expect(files().every((name) => name?.endsWith('.pptx'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^All files/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search files' }), { target: { value: 'tariff' } });
    expect(files()).toEqual(['Tariff Reform Options Paper.pdf']);
    fireEvent.click(screen.getByRole('button', { name: /^All files/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search files' }), { target: { value: '' } });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireEvent.change(screen.getByLabelText('Choose files to add'), { target: { files: [new File(['x'], 'Q3 review.pptx'), new File(['y'], 'photo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(files()).toHaveLength(11));
    expect(files()).toEqual(expect.arrayContaining(['Q3 review.pptx', 'photo.png']));
    const card = (name: string) => screen.getByRole('heading', { level: 3, name }).closest('article')!;
    expect(within(card('Q3 review.pptx')).getByText('Stored')).toBeTruthy(); // kept for the team; not claimed as read
    expect(within(card('photo.png')).getByText('Readable by Lam')).toBeTruthy();
    expect(screen.getAllByText('Readable by Lam').length).toBe(9);
    expect(screen.getByText(/Lam reads PDFs and images; Word and PowerPoint files are stored for the team/)).toBeTruthy();
    expect(within(card('photo.png')).getByRole('button', { name: 'Actions for photo.png' })).toBeTruthy(); // download, move, delete
    expect(fetchSpy).not.toHaveBeenCalled(); // the sample (mock) service
    fetchSpy.mockRestore();
  });

  it('a project without files shows the empty archive; an unknown project is a not-found state', async () => {
    renderApp('/projects/digital-services');
    fireEvent.click(await screen.findByRole('tab', { name: /Archives/ }, find));
    expect(screen.getByText('No files yet.')).toBeTruthy();
  });

  it('an unknown project is a not-found state', async () => {
    renderApp('/projects/nope');
    expect(await screen.findByText('This project does not exist.', {}, find)).toBeTruthy();
  });
});

describe('Calendar', () => {
  const openCalendar = async () => {
    const app = renderApp('/calendar');
    await screen.findByRole('tablist', { name: 'Calendar sections' }, find);
    return app;
  };

  it('has exactly three tabs, and switching them stays on /calendar', async () => {
    const { router } = await openCalendar();
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/\d+$/, ''))).toEqual(['Calendar', 'Upcoming Meetings', 'Tasks & Actions']);
    expect(screen.getByRole('tab', { name: 'Calendar' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Agenda' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Upcoming Meetings' }));
    expect(screen.getByRole('list', { name: 'Upcoming meetings' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/calendar');
    fireEvent.click(screen.getByRole('tab', { name: /Tasks & Actions/ }));
    expect(screen.getByRole('list', { name: 'Open tasks' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/calendar');
  });

  it('Calendar tab: today’s agenda, a selectable day, month and week views', async () => {
    await openCalendar();
    const agenda = screen.getByRole('region', { name: 'Agenda' });
    expect(within(agenda).getByText('Today')).toBeTruthy();
    expect(within(within(agenda).getByRole('list', { name: 'Meetings' })).getByText('KPI working session')).toBeTruthy();

    const now = new Date();
    const monthLabel = now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    expect(screen.getByRole('heading', { level: 2, name: monthLabel })).toBeTruthy();
    const dayButtons = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed') && /day,/.test(b.getAttribute('aria-label') ?? ''));
    expect(dayButtons()).toHaveLength(42);

    fireEvent.click(screen.getByRole('button', { name: 'week' }));
    expect(dayButtons()).toHaveLength(7);
    expect(dayButtons().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1); // today stays selected
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(dayButtons().filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(0);
    fireEvent.click(dayButtons()[0]!);
    expect(within(agenda).queryByText('Today')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(within(agenda).getByText('Today')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'month' }));
    expect(screen.getByRole('heading', { level: 2, name: monthLabel })).toBeTruthy();
  });

  const upcoming = () => screen.getByRole('list', { name: 'Upcoming meetings' });
  const locationOf = (title: string) => within(upcoming()).getByText(title).closest('li')!.querySelector('[data-location]') as HTMLElement;
  const LOCATIONS = [
    ['KPI working session', 'meet', 'Google Meet'],
    ['Steering committee prep', 'teams', 'Microsoft Teams'],
    ['Governance model workshop', 'zoom', 'Zoom'],
    ['Board deck dry run', 'in-person', 'In person'],
  ] as const;

  it('Upcoming Meetings lists date, time, title, participants and where the meeting happens — not the note taker', async () => {
    await openCalendar();
    fireEvent.click(screen.getByRole('tab', { name: 'Upcoming Meetings' }));
    const rows = within(upcoming()).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThanOrEqual(7);
    expect(rows[0]!.textContent).toContain('KPI working session');
    expect(rows[0]!.textContent).toContain('Maya Okafor, Daniel Brandt');
    expect(rows[0]!.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(screen.queryByText('Baseline data walkthrough')).toBeNull(); // yesterday's meeting is not upcoming

    for (const [title, id, name] of LOCATIONS) {
      const location = locationOf(title);
      expect(location.dataset.location).toBe(id);
      expect(within(location).getByText(name)).toBeTruthy();
      expect(location.title).toBe(name);
      // Google Meet, Teams and Zoom show their own logo; in person shows a pin instead.
      expect(Boolean(location.querySelector('img'))).toBe(id !== 'in-person');
      expect(Boolean(location.querySelector('svg'))).toBe(id === 'in-person');
    }
    const logos = LOCATIONS.slice(0, 3).map(([title]) => locationOf(title).querySelector('img')!.getAttribute('src'));
    expect(new Set(logos).size).toBe(3);
    for (const row of rows) expect(row.querySelector('[data-location]')).toBeTruthy(); // every meeting has a location
    expect(upcoming().textContent).not.toMatch(/Granola|Otter|Fireflies/);
  });

  it('the note taker is separate from the location: changing it leaves every meeting where it was', async () => {
    await openCalendar();
    fireEvent.click(screen.getByRole('tab', { name: 'Upcoming Meetings' }));
    const snapshot = () => within(upcoming()).getAllByRole('listitem').map((r) => `${(r.querySelector('[data-location]') as HTMLElement).dataset.location}|${r.querySelector('img')?.getAttribute('src') ?? ''}`);
    const before = snapshot();
    for (const [from, to] of [['Granola', 'Otter'], ['Otter', 'Fireflies']] as const) {
      fireEvent.click(screen.getByRole('button', { name: `Note taker: ${from} Connected` }));
      fireEvent.click(within(screen.getByRole('menu', { name: 'Note taker' })).getByRole('menuitemradio', { name: to }));
      expect(screen.getByRole('button', { name: `Note taker: ${to} Connected` })).toBeTruthy();
      expect(snapshot()).toEqual(before);
    }
  });

  it('the day agenda shows the location too', async () => {
    await openCalendar();
    const meetings = within(screen.getByRole('region', { name: 'Agenda' })).getByRole('list', { name: 'Meetings' });
    const first = within(meetings).getByText('KPI working session').closest('li')!.querySelector('[data-location]') as HTMLElement;
    expect(first.dataset.location).toBe('meet');
    expect(within(first).getByText('Google Meet')).toBeTruthy();
  });

  it('Tasks & Actions shows each action with its meeting and due date, and ticking one completes it', async () => {
    await openCalendar();
    fireEvent.click(screen.getByRole('tab', { name: /Tasks & Actions/ }));
    const open = () => screen.getByRole('list', { name: 'Open tasks' });
    const row = within(open()).getByText('Send the revised KPI list to the steering committee').closest('li')!;
    expect(row.textContent).toContain('From KPI working session');
    expect(row.textContent).toMatch(/Due .+\d{1,2}:\d{2}/);
    const before = within(open()).getAllByRole('checkbox').length;

    fireEvent.click(within(row).getByRole('checkbox'));
    await waitFor(() => expect(within(open()).getAllByRole('checkbox')).toHaveLength(before - 1));
    const done = within(screen.getByRole('list', { name: 'Completed tasks' })).getByRole('checkbox', { name: /Send the revised KPI list/ }) as HTMLInputElement;
    expect(done.checked).toBe(true);
  });

  it('the note-taker selector offers Granola, Otter and Fireflies only, and shows the selected one as connected', async () => {
    await openCalendar();
    fireEvent.click(screen.getByRole('button', { name: 'Note taker: Granola Connected' }));
    const options = within(screen.getByRole('menu', { name: 'Note taker' })).getAllByRole('menuitemradio');
    expect(options.map((o) => o.textContent)).toEqual(['Granola', 'Otter', 'Fireflies']);
    expect(document.body.textContent).not.toMatch(/Custom Note Taker|Custom MCP/i);
    fireEvent.click(options[1]!);
    expect(screen.getByRole('button', { name: 'Note taker: Otter Connected' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Note taker: Otter Connected' }));
    fireEvent.click(within(screen.getByRole('menu', { name: 'Note taker' })).getByRole('menuitemradio', { name: 'Fireflies' }));
    expect(screen.getByRole('button', { name: 'Note taker: Fireflies Connected' })).toBeTruthy();
  });
});

describe('Integrations', () => {
  const open = async () => {
    renderApp('/integrations');
    await screen.findByRole('region', { name: 'Slack' }, find);
  };

  it('groups the services, shows each logo, and has no "coming soon" or disabled placeholder', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 2, name: 'Meeting note takers' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Communication' })).toBeTruthy();
    for (const name of ['Granola', 'Otter', 'Fireflies', 'WhatsApp', 'Microsoft Teams', 'Slack']) {
      const row = screen.getByRole('region', { name });
      expect(row.querySelector('img')).toBeTruthy();
      // Granola is the real integration (connected in the sample backend); every other service starts at Connect.
      if (name === 'Granola') continue;
      const connect = await within(row).findByRole('button', { name: `Connect ${name}` }, find);
      expect((connect as HTMLButtonElement).disabled).toBe(false);
    }
    expect(screen.queryByText(/coming soon|^soon$/i)).toBeNull();
  });

  it('Connect gives a local demo "Connected" state with Disconnect — no request is made', async () => {
    await open();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    for (const name of ['Otter', 'Fireflies', 'Microsoft Teams', 'Slack']) {
      const row = screen.getByRole('region', { name });
      fireEvent.click(within(row).getByRole('button', { name: `Connect ${name}` }));
      expect(within(row).getByText('Connected')).toBeTruthy();
      expect(within(row).getByText('Demo')).toBeTruthy(); // never read as a real account link
      fireEvent.click(within(row).getByRole('button', { name: `Disconnect ${name}` }));
      expect(within(row).getByRole('button', { name: `Connect ${name}` })).toBeTruthy();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('a custom MCP server validates locally, connects as a demo without any request, and never keeps or shows the API key', async () => {
    await open();
    const section = screen.getByRole('region', { name: 'Custom MCP Server' });
    expect(within(section).getByText('Bring your own tool: connect Lam13 to your MCP server and use it alongside the built-in integrations.')).toBeTruthy();
    const log = vi.spyOn(console, 'log');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireEvent.click(within(section).getByRole('button', { name: 'Add custom server' }));
    expect((within(section).getByLabelText('Name') as HTMLInputElement).placeholder).toBe('e.g. Team tools server');
    expect((within(section).getByLabelText('MCP Server URL') as HTMLInputElement).placeholder).toBe('https://example.com/mcp');
    expect(within(section).getByText(/nothing you enter here is stored or sent anywhere/)).toBeTruthy();
    expect(within(section).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Integrations' }).textContent).not.toMatch(/custom note taker|webhook/i);
    const save = () => within(section).getByRole('button', { name: 'Save and connect' });

    fireEvent.click(save());
    expect(within(section).getByText('Enter a name.')).toBeTruthy();
    expect(within(section).getByText('Enter the MCP server URL.')).toBeTruthy();
    fireEvent.change(within(section).getByLabelText('Name'), { target: { value: 'Team notes' } });
    fireEvent.change(within(section).getByLabelText('MCP Server URL'), { target: { value: 'http://example.com/mcp' } });
    fireEvent.click(save());
    expect(within(section).getByText('Enter a valid https:// URL.')).toBeTruthy();

    fireEvent.change(within(section).getByLabelText('MCP Server URL'), { target: { value: 'https://example.com/mcp' } });
    fireEvent.change(within(section).getByLabelText(/API key/), { target: { value: 'sk-test-not-real' } });
    fireEvent.click(save());
    expect(within(section).getByText('Connected')).toBeTruthy();
    expect(within(section).getByText('Team notes')).toBeTruthy();
    expect(within(section).getByText(/https:\/\/example\.com\/mcp · API key provided/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('sk-test-not-real');
    expect(JSON.stringify(useDemoStore.getState())).not.toContain('sk-test-not-real');
    expect(log).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled(); // connecting contacted nothing
    log.mockRestore();
    fetchSpy.mockRestore();

    // Editing starts with an empty key field, and Disconnect removes the server.
    fireEvent.click(within(section).getByRole('button', { name: 'Edit' }));
    expect((within(section).getByLabelText(/API key/) as HTMLInputElement).value).toBe('');
    fireEvent.click(within(section).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Disconnect Team notes' }));
    expect(within(section).getByRole('button', { name: 'Add custom server' })).toBeTruthy();
  });
});
