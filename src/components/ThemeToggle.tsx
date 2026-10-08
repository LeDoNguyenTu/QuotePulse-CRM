import { useState } from 'react';
import { nextTheme, readInitialTheme, saveTheme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState(readInitialTheme);
  const dark = theme === 'dark';
  const toggle = () => {
    const next = nextTheme(theme);
    saveTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      aria-pressed={dark}
      title={`Use ${dark ? 'light' : 'dark'} mode`}
      onClick={toggle}
    >
      <span className="theme-toggle__track" aria-hidden="true">
        <span className="theme-toggle__thumb">{dark ? '☾' : '☀'}</span>
      </span>
      <span className="theme-toggle__label">{dark ? 'Dark' : 'Light'}</span>
    </button>
  );
}
