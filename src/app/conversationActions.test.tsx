import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api';
import { renderApp } from './testUtils';

/** jsdom reports a narrow viewport, so these run through the mobile drawer (no hover needed). */
async function openDrawer() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open sidebar' }));
  const drawer = screen.getByRole('dialog', { name: 'Sidebar' });
  await within(drawer).findByRole('navigation', { name: 'Conversations' });
  return drawer;
}

/** Opens a row's action menu and returns its panel. */
function openActions(drawer: HTMLElement, title: string) {
  const trigger = within(drawer).getByRole('button', { name: `Actions for ${title}` });
  fireEvent.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  return document.getElementById(trigger.getAttribute('aria-controls')!)!;
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const titles = (drawer: HTMLElement) =>
  within(within(drawer).getByRole('navigation', { name: 'Conversations' }))
    .getAllByRole('link')
    .map((l) => l.textContent);

describe('conversation actions', () => {
  it('opens a Rename/Delete menu from a 44px-target button without navigating', async () => {
    const { router } = renderApp('/');
    const drawer = await openDrawer();
    const trigger = within(drawer).getByRole('button', { name: 'Actions for Water security KPIs' });
    expect(trigger.className).toContain('hit-area'); // ≥ 44px touch target

    const panel = openActions(drawer, 'Water security KPIs');
    const menu = within(panel).getByRole('menu', { name: 'Actions for Water security KPIs' });
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Rename', 'Delete']);
    expect(router.state.location.pathname).toBe('/');
  });

  it('renames inline: prefilled, trimmed, saved on Enter, reflected in list and header', async () => {
    const { api } = renderApp('/c/water-security-kpis');
    const drawer = await openDrawer();
    fireEvent.click(within(openActions(drawer, 'Water security KPIs')).getByRole('menuitem', { name: 'Rename' }));

    const input = within(drawer).getByRole('textbox', { name: 'Conversation title' }) as HTMLInputElement;
    expect(input.value).toBe('Water security KPIs');
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.change(input, { target: { value: '  Water KPIs 2030  ' } });
    await act(async () => fireEvent.keyDown(input, { key: 'Enter' }));

    await waitFor(() => expect(within(drawer).queryByRole('textbox', { name: 'Conversation title' })).toBeNull());
    expect(titles(drawer)).toContain('Water KPIs 2030');
    expect(screen.getByRole('heading', { level: 1, name: 'Water KPIs 2030' })).toBeTruthy();
    expect((await api.conversations.get('water-security-kpis')).title).toBe('Water KPIs 2030');
  });

  it('rejects an empty title and Escape cancels without saving', async () => {
    const { api } = renderApp('/');
    const drawer = await openDrawer();
    fireEvent.click(within(openActions(drawer, 'Board deck: health reform')).getByRole('menuitem', { name: 'Rename' }));
    const input = within(drawer).getByRole('textbox', { name: 'Conversation title' });

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(within(drawer).getByRole('alert').textContent).toBe("Title can't be empty.");
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(within(drawer).queryByRole('textbox', { name: 'Conversation title' })).toBeNull();
    expect(titles(drawer)).toContain('Board deck: health reform');
    expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeTruthy(); // Escape did not close the drawer
    expect((await api.conversations.get('health-reform-board-deck')).title).toBe('Board deck: health reform');
  });

  it('rename failure rolls back the optimistic title and keeps the editor open', async () => {
    const { api } = renderApp('/c/water-security-kpis');
    const pending = deferred<never>();
    api.conversations.rename = () => pending.promise;

    const drawer = await openDrawer();
    fireEvent.click(within(openActions(drawer, 'Water security KPIs')).getByRole('menuitem', { name: 'Rename' }));
    const input = within(drawer).getByRole('textbox', { name: 'Conversation title' });
    fireEvent.change(input, { target: { value: 'Optimistic title' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Optimistic: header already shows the new title while saving.
    expect(await screen.findByRole('heading', { level: 1, name: 'Optimistic title' })).toBeTruthy();
    expect(within(drawer).getByRole('img', { name: 'Saving title' })).toBeTruthy();

    await act(async () => pending.reject(new ApiError(500, 'internal_error', 'Server error.')));
    expect(await screen.findByRole('heading', { level: 1, name: 'Water security KPIs' })).toBeTruthy();
    expect(within(drawer).getByRole('alert').textContent).toBe('Server error.');
    expect(within(drawer).getByRole('textbox', { name: 'Conversation title' })).toBeTruthy();
    expect(await screen.findByText(/Couldn't rename the conversation/)).toBeTruthy();
  });

  it('delete asks for confirmation; Cancel keeps the conversation', async () => {
    renderApp('/');
    const drawer = await openDrawer();
    const panel = openActions(drawer, 'Digital services roadmap');
    fireEvent.click(within(panel).getByRole('menuitem', { name: 'Delete' }));

    const confirm = within(panel).getByRole('alertdialog', { name: 'Delete this conversation?' });
    expect(within(confirm).getByText('Digital services roadmap')).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Cancel' })));
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(titles(drawer)).toContain('Digital services roadmap');
  });

  it('confirmed delete removes the conversation', async () => {
    const { api } = renderApp('/');
    const drawer = await openDrawer();
    const panel = openActions(drawer, 'Digital services roadmap');
    fireEvent.click(within(panel).getByRole('menuitem', { name: 'Delete' }));
    await act(async () => fireEvent.click(within(panel).getByRole('button', { name: 'Delete' })));

    await waitFor(() => expect(titles(drawer)).not.toContain('Digital services roadmap'));
    await expect(api.conversations.get('digital-services-roadmap')).rejects.toMatchObject({ status: 404 });
  });

  it('delete failure restores the conversation and explains why', async () => {
    const { api } = renderApp('/');
    const pending = deferred<never>();
    api.conversations.remove = () => pending.promise;
    const drawer = await openDrawer();
    const panel = openActions(drawer, 'Digital services roadmap');
    fireEvent.click(within(panel).getByRole('menuitem', { name: 'Delete' }));
    await act(async () => fireEvent.click(within(panel).getByRole('button', { name: 'Delete' })));

    await waitFor(() => expect(titles(drawer)).not.toContain('Digital services roadmap')); // optimistic
    await act(async () => pending.reject(new ApiError(503, 'unavailable', 'Try again later.')));
    await waitFor(() => expect(titles(drawer)).toContain('Digital services roadmap'));
    expect(await screen.findByText(/Couldn't delete “Digital services roadmap”. Try again later./)).toBeTruthy();
  });

  it('deleting the open conversation navigates to a new chat', async () => {
    const { router } = renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' });
    const drawer = await openDrawer();
    const panel = openActions(drawer, 'Water security KPIs');
    fireEvent.click(within(panel).getByRole('menuitem', { name: 'Delete' }));
    await act(async () => fireEvent.click(within(panel).getByRole('button', { name: 'Delete' })));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText('Ask me to design, stress-test, or package a strategy.')).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Water security KPIs' })).toBeNull();
    await waitFor(() => expect(titles(screen.getByRole('dialog', { name: 'Sidebar', hidden: true }))).not.toContain('Water security KPIs'));
  });
});
