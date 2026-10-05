import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CrmExportDialog } from './CrmExportDialog';

vi.mock('../../lib/functions', () => ({ exportCrmRecords: vi.fn() }));

describe('CRM export dialog', () => {
  it('offers selected rows, all matching rows, formats, and configurable columns', () => {
    const renderer = create(<CrmExportDialog
      workspaceId="workspace-1"
      entity="contacts"
      options={[
        { id: 'full_name', label: 'Contact' },
        { id: 'job_title', label: 'Role' },
        { id: 'phone', label: 'Phone' },
      ]}
      defaultColumns={['full_name', 'phone']}
      selectedIds={new Set(['contact-1', 'contact-2'])}
      filters={{ search: 'director' }}
    />);

    const open = renderer.root.findAllByType('button').find((button) => button.props.children === 'Export');
    act(() => open?.props.onClick());

    const labels = renderer.root.findAllByType('label').map((label) => label.children.join(' ')).join(' ');
    expect(labels).toContain('Selected rows');
    expect(labels).toContain('2');
    expect(labels).toContain('All matching rows');
    expect(labels).toContain('Excel (.xlsx)');
    expect(labels).toContain('CSV (.csv)');
    expect(labels).toContain('Contact');
    expect(labels).toContain('Role');
    expect(labels).toContain('Phone');

    const checkboxes = renderer.root.findAllByProps({ type: 'checkbox' });
    expect(checkboxes.map((checkbox) => checkbox.props.checked)).toEqual([true, false, true]);
  });
});
