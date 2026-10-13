import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { LegacyWorkspaceRestoreControl } from './LegacyWorkspaceRestoreControl';

describe('LegacyWorkspaceRestoreControl', () => {
  it('starts the complete resumable restore with one button press', () => {
    const onRestore = vi.fn();
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        <LegacyWorkspaceRestoreControl
          restoreStatus="not_started"
          pending={false}
          onRestore={onRestore}
          onStop={vi.fn()}
        />,
      );
    });

    const button = renderer!.root.findByProps({ children: 'Restore all data to normal CRM' });
    act(() => button.props.onClick());
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it('shows progress and a safe stop action during restoration', () => {
    const onStop = vi.fn();
    let renderer: ReactTestRenderer;

    act(() => {
      renderer = create(
        <LegacyWorkspaceRestoreControl
          restoreStatus="restoring"
          pending
          onRestore={vi.fn()}
          onStop={onStop}
        />,
      );
    });

    expect(renderer!.root.findByProps({ children: 'Restoring all Legacy data…' }).props.disabled).toBe(true);
    const stop = renderer!.root.findByProps({ children: 'Pause safely' });
    act(() => stop.props.onClick());
    expect(onStop).toHaveBeenCalledOnce();
  });
});
