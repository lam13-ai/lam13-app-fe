import { create } from 'zustand';

/**
 * Appearance: the user's preference (Light / Dark / System) is kept in localStorage — no account
 * needed — and the resolved theme is set as `data-theme` on <html>, where the CSS tokens switch.
 * index.html runs the same resolution inline before first paint, so the page never flashes the
 * wrong theme. Keep THEME_STORAGE_KEY and the logic below in sync with that script.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'lam13:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Browser UI colour (address bar on mobile) per theme — the app background. */
const THEME_COLORS: Record<ResolvedTheme, string> = { light: '#ffffff', dark: '#0f0f11' };

export function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  } catch {
    return 'system'; // storage unavailable (private mode, blocked)
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(DARK_QUERY).matches);
}

export function resolveTheme(preference: ThemePreference, systemDark = systemPrefersDark()): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[resolved]);
  if (root.dataset.theme === resolved) return;
  // Swap instantly: without this every hover/colour transition in the app would fade to the new theme.
  root.classList.add('theme-switching');
  root.dataset.theme = resolved;
  void root.offsetWidth; // apply the new colours while transitions are off
  requestAnimationFrame(() => root.classList.remove('theme-switching'));
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()((set) => ({
  preference: readPreference(),
  resolved: resolveTheme(readPreference()),
  setPreference: (preference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Not persisted, but still applied for this session.
    }
    const resolved = resolveTheme(preference);
    applyTheme(resolved);
    set({ preference, resolved });
  },
}));

/**
 * Applies the stored theme, then follows OS changes while "System" is selected and preference
 * changes made in other tabs. Call once at startup; returns a cleanup.
 */
export function initTheme(): () => void {
  const sync = () => {
    const resolved = resolveTheme(useThemeStore.getState().preference);
    applyTheme(resolved);
    useThemeStore.setState({ resolved });
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    useThemeStore.setState({ preference: readPreference() });
    sync();
  };

  sync();
  const media = window.matchMedia?.(DARK_QUERY);
  media?.addEventListener?.('change', sync);
  window.addEventListener('storage', onStorage);
  return () => {
    media?.removeEventListener?.('change', sync);
    window.removeEventListener('storage', onStorage);
  };
}
