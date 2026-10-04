import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ColumnSelector } from './ColumnSelector';

describe('ColumnSelector', () => {
  it('uses a responsive overlay and safe non-submit controls', () => {
    const onChange = vi.fn();
    const onRestore = vi.fn();
    const renderer = create(
      <ColumnSelector
        options={[
          { id: 'name', label: 'Name', group: 'main' },
          { id: 'email', label: 'Email', group: 'additional' },
        ]}
        visible={['name']}
        onChange={onChange}
        onRestore={onRestore}
      />,
    );

    const details = renderer.root.findByType('details');
    const panel = renderer.root.find((node) => node.props.className === 'column-selector__panel');
    const restore = renderer.root.findByType('button');
    expect(details.props.className).toContain('column-selector');
    expect(panel).toBeTruthy();
    expect(restore.props.type).toBe('button');

    const checkboxes = renderer.root.findAllByType('input').filter((input) => input.props.type === 'checkbox');
    act(() => checkboxes[1].props.onChange());
    expect(onChange).toHaveBeenCalledWith(['name', 'email']);
  });
});
