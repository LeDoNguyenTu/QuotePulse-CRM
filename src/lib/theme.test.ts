import { describe, expect, it } from 'vitest';
import { applyTheme, nextTheme, resolveTheme } from './theme';

describe('workspace theme', () => {
  it('uses a valid saved choice before the system preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('falls back to the system preference for an absent or invalid saved value', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('unknown', false)).toBe('light');
  });

  it('toggles between the two supported themes', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });

  it('applies the theme to the root element for CSS and native controls', () => {
    const root = { dataset: {}, style: {} } as Pick<HTMLElement, 'dataset' | 'style'>;
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });
});
