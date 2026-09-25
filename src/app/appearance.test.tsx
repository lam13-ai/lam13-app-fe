import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, useThemeStore } from '@/stores/themeStore';
import { renderApp } from './testUtils';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  useThemeStore.setState({ preference: 'system', resolved: 'light' });
});
afterEach(() => localStorage.clear());

// jsdom renders the mobile layout: the sidebar is the (closed) drawer dialog.
const sidebar = () => screen.getByRole('dialog', { name: 'Sidebar', hidden: true });

describe('appearance menu', () => {
  it('lists Light / Dark / System as a radio group, marks the current choice, applies and persists a new one', async () => {
    renderApp('/');
    const trigger = await within(await screen.findByRole('dialog', { name: 'Sidebar', hidden: true }, { timeout: 8000 })).findByRole('button', {
      name: 'Appearance: System',
      hidden: true,
    });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    await act(async () => fireEvent.click(trigger));
    const menu = within(sidebar()).getByRole('menu', { name: 'Appearance', hidden: true });
    const items = within(menu).getAllByRole('menuitemradio', { hidden: true });
    expect(items.map((i) => [i.textContent, i.getAttribute('aria-checked')])).toEqual([
      ['Light', 'false'],
      ['Dark', 'false'],
      ['System', 'true'],
    ]);

    await act(async () => fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Dark', hidden: true })));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    const updated = within(sidebar()).getByRole('button', { name: 'Appearance: Dark', hidden: true });
    expect(document.activeElement).toBe(updated); // focus returns to the trigger
    expect(updated.getAttribute('aria-expanded')).toBe('false');
  });

  it('is keyboard operable and closes with Escape without changing the theme', async () => {
    renderApp('/');
    const trigger = await within(await screen.findByRole('dialog', { name: 'Sidebar', hidden: true }, { timeout: 8000 })).findByRole('button', {
      name: 'Appearance: System',
      hidden: true,
    });
    trigger.focus();
    await act(async () => fireEvent.click(trigger));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('keeps compact history rows on desktop and 44px rows for touch', async () => {
    renderApp('/');
    const link = await within(await screen.findByRole('navigation', { name: 'Conversations', hidden: true }, { timeout: 8000 })).findByRole('link', {
      name: 'Water security KPIs',
      hidden: true,
    });
    expect(link.className).toContain('h-11'); // touch / narrow screens
    expect(link.className).toContain('md:h-9'); // desktop: 36px rows
  });
});
