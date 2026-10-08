import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedRecordTable } from './ArchivedRecordTable';

describe('ArchivedRecordTable', () => {
  it('shows archive provenance, tolerates missing fields, pages, and routes edit through a warning', () => {
    const onNext = vi.fn();
    const onEdit = vi.fn();
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ArchivedRecordTable table="companies" rows={[{ id: '1', name_clean: 'Northstar', _archive_cursor: 'signed' }]} archivedAt="2026-10-01T00:00:00Z" progress={{ objects_read: 2, total_objects: 20, total_rows: 400 }} hasNext onNext={onNext} onEdit={onEdit} />); });
    const text = JSON.stringify(renderer!.toJSON());
    expect(text).toContain('Read-only R2 archive');
    expect(text).toContain('Northstar');
    expect(renderer!.root.findByType('footer').findByType('span').children.join('')).toBe('2 of 20 objects searched');
    const buttons = renderer!.root.findAllByType('button');
    act(() => buttons.find((button) => button.props.children === 'Edit')!.props.onClick());
    act(() => buttons.find((button) => button.props.children === 'Continue')!.props.onClick());
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
