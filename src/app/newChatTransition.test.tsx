import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from './testUtils';

const PROMPT = 'Ask me to design, stress-test, or package a strategy.';

async function clickNewChat() {
  fireEvent.click(await screen.findByRole('button', { name: 'Open sidebar' }));
  const drawer = screen.getByRole('dialog', { name: 'Sidebar' });
  fireEvent.click(within(drawer).getByRole('button', { name: 'New chat' }));
}

/** The empty state root carries the transition phase. */
const emptyState = () => screen.getByText(PROMPT).closest('[data-transition]') as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('New Chat transition', () => {
  it('enters the empty state with one agent animation that resolves into the resting state', async () => {
    const { router } = renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' });

    await clickNewChat();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await screen.findByText(PROMPT);

    expect(emptyState().dataset.transition).toBe('entering');
    expect(screen.queryByRole('log', { name: 'Conversation' })).toBeNull();
    // The existing agent ring is reused — exactly one instance, during and after the transition.
    expect(screen.getAllByRole('img', { name: 'Agent listening' })).toHaveLength(1);

    fireEvent.animationEnd(screen.getByText(PROMPT).parentElement!);
    expect(emptyState().dataset.transition).toBe('idle');
    expect(screen.getAllByRole('img', { name: 'Agent listening' })).toHaveLength(1);
  });

  it('does not play the entrance on a normal load of /', async () => {
    renderApp('/');
    await screen.findByText(PROMPT);
    expect(emptyState().dataset.transition).toBe('idle');
  });

  it('keeps navigation working after the transition', async () => {
    const { router } = renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' });
    await clickNewChat();
    await screen.findByText(PROMPT);

    fireEvent.click(await screen.findByRole('button', { name: 'Open sidebar' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Sidebar' })).getByRole('link', { name: 'Digital services roadmap' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/c/digital-services-roadmap'));
    expect(await screen.findByRole('log', { name: 'Conversation' })).toBeTruthy();
  });

  it('works with reduced motion', async () => {
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ ...original(query), matches: query.includes('prefers-reduced-motion') }) as MediaQueryList,
    );
    const { router } = renderApp('/c/water-security-kpis');
    await screen.findByRole('log', { name: 'Conversation' });
    await clickNewChat();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await screen.findByText(PROMPT);
    fireEvent.animationEnd(screen.getByText(PROMPT).parentElement!);
    expect(emptyState().dataset.transition).toBe('idle');
  });
});
