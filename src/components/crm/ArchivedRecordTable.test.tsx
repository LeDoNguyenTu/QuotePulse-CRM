import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { ArchivedRecordTable } from './ArchivedRecordTable';

describe('ArchivedRecordTable', () => {
  it('shows archive provenance, tolerates missing fields, pages, and routes edit through a warning', () => {
    const onNext = vi.fn();
    const onEdit = vi.fn();
    let renderer: ReturnType<typeof create>;
    const onPrevious = vi.fn();
    act(() => { renderer = create(<ArchivedRecordTable table="companies" rows={[{ id: '1', name_clean: 'Northstar', source_priority: 'current', _archive_cursor: 'signed' }]} columnOptions={[{ id: 'name_clean', label: 'Company' }, { id: 'source_priority', label: 'Source' }]} visibleColumns={['name_clean', 'source_priority']} archivedAt="2026-10-01T00:00:00Z" progress={{ objects_read: 2, total_objects: 20, total_rows: 400 }} page={2} hasPrevious hasNext loading={false} onPrevious={onPrevious} onNext={onNext} onEdit={onEdit} />); });
    const text = JSON.stringify(renderer!.toJSON());
    expect(text).toContain('Read-only R2 archive');
    expect(text).toContain('Northstar');
    expect(text).toContain('Current');
    expect(renderer!.root.findByType('footer').findByType('span').children.join('')).toContain('page 3');
    expect(renderer!.root.findByType('footer').findByType('span').children.join('')).toContain('2 of 20 archive objects searched');
    const buttons = renderer!.root.findAllByType('button');
    act(() => buttons.find((button) => button.props.children === 'Restore to edit')!.props.onClick());
    act(() => buttons.find((button) => button.props.children === 'Prev')!.props.onClick());
    act(() => buttons.find((button) => button.props.children === 'Next')!.props.onClick());
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expect(onPrevious).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('disables restore while a new archive page is loading', () => {
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<ArchivedRecordTable table="contacts" rows={[{ id: '1', full_name: 'Ada', _archive_cursor: 'signed' }]} columnOptions={[{ id: 'full_name', label: 'Full name' }, { id: 'email', label: 'Email' }]} visibleColumns={['full_name', 'email']} archivedAt={null} progress={{ objects_read: 1, total_objects: 2, total_rows: 3 }} page={0} hasPrevious={false} hasNext loading onPrevious={vi.fn()} onNext={vi.fn()} onEdit={vi.fn()} />); });
    expect(renderer!.root.findAllByType('button').find((button) => button.props.children === 'Restore to edit')!.props.disabled).toBe(true);
  });
});
