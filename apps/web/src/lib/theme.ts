export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pmTheme';

const THEMES: Theme[] = ['light', 'dark', 'system'];

const DARK_QUERY = '(prefers-color-scheme: dark)';

type Listener = (theme: Theme) => void;
const listeners = new Set<Listener>();

export function getStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(value as Theme) ? (value as Theme) : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', resolveTheme(theme) === 'dark');
}

export function setTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode etc — still apply for the session
  }
  applyTheme(theme);
  listeners.forEach((cb) => cb(theme));
}

export function cycleTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

/** Subscribe to theme changes triggered via setTheme. Returns an unsubscribe fn. */
export function onThemeChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Keep the document class in sync with the OS preference while in "system"
 * mode. Call once at app startup; returns a cleanup fn.
 */
export function initSystemThemeListener(): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(DARK_QUERY);
  const handle = () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  };
  mql.addEventListener('change', handle);
  return () => mql.removeEventListener('change', handle);
}
