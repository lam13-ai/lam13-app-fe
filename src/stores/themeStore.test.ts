import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import indexHtml from '../../index.html?raw';
import { initTheme, readPreference, resolveTheme, THEME_STORAGE_KEY, useThemeStore } from './themeStore';

/** A controllable `prefers-color-scheme: dark` media query. */
function mockSystemTheme(dark: boolean) {
  const listeners = new Set<() => void>();
  const media = {
    get matches() {
      return dark;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) =>
    (query.includes('prefers-color-scheme') ? media : { matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
  return {
    set(next: boolean) {
      dark = next;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  useThemeStore.setState({ preference: 'system', resolved: 'light' });
});
afterEach(() => vi.restoreAllMocks());

describe('theme resolution', () => {
  it('resolves System from the OS preference and Light/Dark as chosen', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('reads a stored preference, defaulting to System for missing, invalid or blocked storage', () => {
    expect(readPreference()).toBe('system');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(readPreference()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readPreference()).toBe('system');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readPreference()).toBe('system');
  });
});

describe('theme store', () => {
  it('applies and persists a choice (no account needed)', () => {
    mockSystemTheme(false);
    useThemeStore.getState().setPreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(useThemeStore.getState()).toMatchObject({ preference: 'dark', resolved: 'dark' });

    useThemeStore.getState().setPreference('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('follows OS changes only while System is selected, and stops listening on cleanup', () => {
    const system = mockSystemTheme(false);
    const stop = initTheme();
    expect(document.documentElement.dataset.theme).toBe('light');

    system.set(true);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(useThemeStore.getState().resolved).toBe('dark');

    useThemeStore.getState().setPreference('light');
    system.set(false);
    system.set(true);
    expect(document.documentElement.dataset.theme).toBe('light'); // an explicit choice wins

    stop();
    expect(system.listenerCount()).toBe(0);
  });

  it('picks up a change made in another tab', () => {
    mockSystemTheme(false);
    const stop = initTheme();
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    expect(useThemeStore.getState()).toMatchObject({ preference: 'dark', resolved: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    stop();
  });
});

describe('pre-paint script (index.html)', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';
  // Runs the page's own inline script.
  const run = () => new Function(script)();

  it('sets the resolved theme before the app loads, matching the store', () => {
    expect(script).toContain(THEME_STORAGE_KEY);
    for (const [stored, systemDark, expected] of [
      [null, false, 'light'],
      [null, true, 'dark'],
      ['system', true, 'dark'],
      ['dark', false, 'dark'],
      ['light', true, 'light'],
    ] as const) {
      vi.restoreAllMocks();
      mockSystemTheme(systemDark);
      localStorage.clear();
      if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
      run();
      expect(document.documentElement.dataset.theme).toBe(expected);
      expect(resolveTheme(readPreference(), systemDark)).toBe(expected);
    }
  });
});
