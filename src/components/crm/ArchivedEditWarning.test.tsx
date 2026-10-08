import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedEditWarning } from './ArchivedEditWarning';

describe('ArchivedEditWarning', () => {
  it('warns that editing requires restore and exposes cancel/restore outcomes', async () => {
    const onCancel = vi.fn();
    const onRestore = vi.fn().mockResolvedValue({ status: 'conflict' });
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ArchivedEditWarning recordLabel="Northstar" pending={false} onCancel={onCancel} onRestore={onRestore} />); });
    expect(JSON.stringify(renderer!.toJSON())).toContain('read-only');
    const buttons = renderer!.root.findAllByType('button');
    act(() => buttons.find((button) => button.props.children === 'Cancel')!.props.onClick());
    await act(async () => { await buttons.find((button) => button.props.children === 'Restore record')!.props.onClick(); });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(JSON.stringify(renderer!.toJSON())).toContain('conflicts with a live record');
  });
});
