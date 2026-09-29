import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api';
import { renderApp } from './testUtils';

/**
 * Meetings workspace (frontend-only: the adapter serves local meetings) and meeting context in the chat
 * composer. The UI only talks to `api.meetings`.
 */

const heading = () => screen.findByRole('heading', { level: 1, name: 'Meetings' }, { timeout: 8000 });
const rows = () => screen.getAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/meetings/'));
const search = () => screen.getByRole('searchbox', { name: 'Search meetings' });
const chip = (title: string) => screen.queryByText(title, { selector: '.truncate' });

describe('Meetings workspace', () => {
  it('is in the sidebar and lists meetings grouped by day, newest first', async () => {
    const { router } = renderApp('/');
    fireEvent.click(await screen.findByRole('link', { name: 'Meetings' }, { timeout: 8000 }));
    await heading();
    expect(router.state.location.pathname).toBe('/meetings');
    await screen.findByRole('searchbox', { name: 'Search meetings' });
    expect(screen.getByRole('region', { name: 'Today' })).toBeTruthy();
    expect(rows()[0]!.textContent).toContain('Product strategy review');
    expect(rows()[0]!.textContent).toMatch(/50 min · Hannah Lee, Saqlain Haider \+2/);
    expect(screen.getByRole('link', { name: 'Meetings' }).className).toContain('bg-accent-wash'); // active nav
  });

  it('searches titles and participants, with a no-results state that clears', async () => {
    renderApp('/meetings');
    await screen.findByRole('searchbox', { name: 'Search meetings' }, { timeout: 8000 });
    fireEvent.change(search(), { target: { value: 'water' } });
    expect(rows().map((r) => r.querySelector('.font-bold')?.textContent)).toEqual(['National water security KPI workshop']);
    fireEvent.change(search(), { target: { value: 'daniel' } }); // a participant
    expect(rows().map((r) => r.querySelector('.font-bold')?.textContent)).toEqual([
      'Budget sync with Harbor & Finch',
      'Board deck: health reform narrative',
    ]);
    fireEvent.change(search(), { target: { value: 'zzz' } });
    expect(screen.getByText('No meetings match “zzz”.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(rows().length).toBeGreaterThan(5);
  });

  it('opens a meeting as a document with every section it has', async () => {
    const { router } = renderApp('/meetings');
    await screen.findByRole('searchbox', { name: 'Search meetings' }, { timeout: 8000 });
    fireEvent.click(rows().find((r) => r.textContent?.includes('National water security'))!);
    expect(await screen.findByRole('heading', { level: 1, name: 'National water security KPI workshop' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/meetings/mtg_water_kpis');
    for (const section of ['Participants (6)', 'Summary', 'Key decisions', 'Action items', 'Notes']) {
      expect(screen.getByRole('region', { name: section })).toBeTruthy();
    }
    expect(within(screen.getByRole('region', { name: 'Notes' })).getByRole('heading', { name: 'Risks' })).toBeTruthy(); // Markdown
    expect(screen.getByRole('link', { name: 'Back to Meetings' }).getAttribute('href')).toBe('/meetings');
  });

  it('hides the sections a meeting does not have', async () => {
    renderApp('/meetings/mtg_intro_call');
    expect(await screen.findByRole('heading', { level: 1, name: 'Intro call — Alvarez Strategy Group' }, { timeout: 8000 })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Participants (2)' })).toBeTruthy();
    for (const section of ['Summary', 'Key decisions', 'Action items', 'Notes']) {
      expect(screen.queryByRole('region', { name: section })).toBeNull();
    }
  });

  it('shows just the summary when that is all a meeting has', async () => {
    renderApp('/meetings/mtg_budget_sync');
    await screen.findByRole('heading', { level: 1, name: 'Budget sync with Harbor & Finch' }, { timeout: 8000 });
    expect(screen.getByRole('region', { name: 'Summary' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Action items' })).toBeNull();
  });

  it('shows an unknown meeting as unavailable', async () => {
    renderApp('/meetings/nope');
    expect(await screen.findByText("This meeting isn't available.", {}, { timeout: 8000 })).toBeTruthy();
  });

  it('has an empty state', async () => {
    const { api } = renderApp('/meetings');
    vi.spyOn(api.meetings, 'list').mockResolvedValue([]);
    expect(await screen.findByText('No meetings yet.', {}, { timeout: 8000 })).toBeTruthy();
  });

  it('shows a retryable error when meetings fail to load', async () => {
    const app = renderApp('/meetings');
    const failing = vi.spyOn(app.api.meetings, 'list').mockRejectedValue(new ApiError(400, 'bad_request', 'nope'));
    expect(await screen.findByText("Couldn't load your meetings.", {}, { timeout: 8000 })).toBeTruthy();
    failing.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('searchbox', { name: 'Search meetings' });
  });

  it('Granola connection is UI-only state: disconnect → connect prompt; connect → meetings back', async () => {
    renderApp('/meetings');
    fireEvent.click(await screen.findByRole('button', { name: /Granola connected/ }, { timeout: 8000 }));
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect Granola' })));
    expect(await screen.findByText('Bring your meetings into Lam13.')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Connect Granola' })));
    await screen.findByRole('searchbox', { name: 'Search meetings' });
  });
});

describe('meeting context in the chat composer', () => {
  it('"Ask Lam13 about this meeting" opens a new chat with the meeting as context — no message is sent', async () => {
    const { router, api } = renderApp('/meetings/mtg_water_kpis');
    const send = vi.spyOn(api.messages, 'send');
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Lam13 about this meeting' }, { timeout: 8000 }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText('National water security KPI workshop', { selector: '.truncate' })).toBeTruthy();
    expect(screen.getByLabelText('Message Lam13')).toHaveProperty('value', ''); // nothing dumped into the input
    expect(send).not.toHaveBeenCalled();

    // Removing it restores the plain composer.
    fireEvent.click(screen.getByRole('button', { name: 'Remove meeting National water security KPI workshop' }));
    expect(chip('National water security KPI workshop')).toBeNull();
  });

  it('adds a meeting from the + menu and sends it with the message (then clears it)', async () => {
    const { api } = renderApp('/c/water-security-kpis');
    const send = vi.spyOn(api.messages, 'send');
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
    fireEvent.click(screen.getByRole('button', { name: /ask lam13/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Add files or context' }));
    expect(screen.getByRole('menuitem', { name: 'Files and images' })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Meeting' }));
    const picker = await screen.findByRole('menu', { name: 'Meetings' });
    fireEvent.click(within(picker).getByRole('menuitem', { name: /Budget sync with Harbor & Finch/ }));
    expect(chip('Budget sync with Harbor & Finch')).toBeTruthy();

    const box = screen.getByLabelText('Message Lam13');
    fireEvent.change(box, { target: { value: 'What did Daniel commit to?' } });
    await act(async () => fireEvent.keyDown(box, { key: 'Enter' }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]![1]).toMatchObject({ content: 'What did Daniel commit to?', meeting_ids: ['mtg_budget_sync'] });
    expect(chip('Budget sync with Harbor & Finch')).toBeNull();
  });

  it('the picker searches meetings', async () => {
    renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' }, { timeout: 8000 });
    fireEvent.click(screen.getByRole('button', { name: /ask lam13/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Add files or context' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Meeting' }));
    const input = await screen.findByRole('searchbox', { name: 'Search meetings' });
    fireEvent.change(input, { target: { value: 'priya' } });
    const items = within(await screen.findByRole('menu', { name: 'Meetings' })).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('National water security'), expect.stringContaining('Priya / Hannah 1:1')]),
    );
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('No meetings match.')).toBeTruthy();
  });
});
