export type AppTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'quotepulse-theme';

export function resolveTheme(saved: string | null, prefersDark: boolean): AppTheme {
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(theme: AppTheme): AppTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

export function applyTheme(
  theme: AppTheme,
  root: Pick<HTMLElement, 'dataset' | 'style'> = document.documentElement,
) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function readInitialTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light';
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(THEME_STORAGE_KEY); } catch { /* storage can be blocked */ }
  return resolveTheme(saved, window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
}

export function initializeTheme() {
  const theme = readInitialTheme();
  if (typeof document !== 'undefined') applyTheme(theme);
  return theme;
}

export function saveTheme(theme: AppTheme) {
  if (typeof document !== 'undefined') applyTheme(theme);
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* storage can be blocked */ }
  }
}
