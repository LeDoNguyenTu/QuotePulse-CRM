import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle';

describe('ThemeToggle', () => {
  it('exposes the active theme and switches to the other theme', () => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<ThemeToggle />); });
    const before = renderer.root.findByType('button');
    expect(before.props['aria-label']).toBe('Switch to dark mode');
    expect(before.props['aria-pressed']).toBe(false);

    act(() => before.props.onClick());
    const after = renderer.root.findByType('button');
    expect(after.props['aria-label']).toBe('Switch to light mode');
    expect(after.props['aria-pressed']).toBe(true);
  });
});
