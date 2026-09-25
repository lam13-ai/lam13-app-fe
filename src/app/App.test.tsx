import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './testUtils';

describe('workspace', () => {
  it('renders the new-chat empty state with header status and the conversation list', async () => {
    renderApp('/');
    expect(await screen.findByText('Ask me to design, stress-test, or package a strategy.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Lam13 Strategy Agent' })).toBeTruthy();
    expect(screen.getByText('Online').closest('[role="status"]')).not.toBeNull();

    const nav = await screen.findByRole('navigation', { name: 'Conversations' });
    expect(within(nav).getByRole('link', { name: 'Stress-test 5-year growth plan' })).toBeTruthy();
  });

  it('loads a conversation with Markdown answers, including a table', async () => {
    renderApp('/c/growth-plan-stress-test');
    expect(await screen.findByRole('status', { name: 'Loading messages' })).toBeTruthy();

    const log = await screen.findByRole('log', { name: 'Conversation' });
    expect(within(log).getByText('Stress-test our 5-year economic growth plan.')).toBeTruthy();
    expect(within(log).getByRole('heading', { name: 'Stress-Testing a 5-Year Growth Plan' })).toBeTruthy();
    expect(within(log).getByRole('columnheader', { name: 'Fault line' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1, name: 'Stress-test 5-year growth plan' })).toBeTruthy();
  });

  it('lists history as one continuous, newest-first list with the active conversation marked', async () => {
    renderApp('/c/digital-services-roadmap');
    const nav = await screen.findByRole('navigation', { name: 'Conversations', hidden: true });
    for (const label of ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older']) {
      expect(within(nav).queryByText(label)).toBeNull();
    }
    const links = within(nav).getAllByRole('link', { hidden: true });
    expect(links.map((l) => l.textContent)).toEqual([
      'National AI strategy outline',
      'Stress-test 5-year growth plan',
      'Digital services roadmap',
      'Board deck: health reform',
      'Water security KPIs',
    ]);
    expect(links[2]?.getAttribute('aria-current')).toBe('page');
    expect(links[0]?.getAttribute('aria-current')).toBeNull();
  });

  it('shows not-found for unknown conversations', async () => {
    renderApp('/c/does-not-exist');
    expect(await screen.findByRole('heading', { name: 'Not found.' })).toBeTruthy();
  });
});
