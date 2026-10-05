import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CrmActivityComposer, CrmActivityEditor } from './CrmActivityComposer';

describe('CRM activity composer', () => {
  it('renders note and call controls without exposing deal-only state by default', () => {
    const html = renderToStaticMarkup(<CrmActivityComposer targetKind="company" pending={false} onSave={async () => undefined} />);
    expect(html).toContain('Add activity');
    expect(html).toContain('<option value="note" selected="">Note</option>');
    expect(html).toContain('<option value="call">Call</option>');
    expect(html).not.toContain('Update the deal');
  });

  it('offers an explicit workbook destination without assigning one by default', () => {
    const html = renderToStaticMarkup(<CrmActivityComposer
      targetKind="company"
      pending={false}
      onSave={async () => undefined}
      destinations={[{
        sourceImportId: 'source-1', sourceRowNumber: 4, sourceColumn: 'Remarks',
        label: 'accounts.xlsx · Row 4 · Remarks',
      }]}
    />);
    expect(html).toContain('Workbook destination');
    expect(html).toContain('Do not write this activity to a workbook');
    expect(html).toContain('accounts.xlsx · Row 4 · Remarks');
  });

  it('renders editable call outcome controls and an explicit cancel action', () => {
    const html = renderToStaticMarkup(<CrmActivityEditor
      activity={{
        id: 'activity-1', workspace_id: 'workspace-1', company_id: null, contact_id: null,
        deal_id: 'deal-1', kind: 'call', body: 'Called buyer', occurred_at: '2026-10-01T08:00:00Z',
        call_outcome: 'Interested', created_by: 'user-1', updated_by: 'user-1',
        created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z',
      }}
      pending={false}
      onCancel={() => undefined}
      onSave={async () => undefined}
    />);
    expect(html).toContain('Edit call');
    expect(html).toContain('Call outcome');
    expect(html).toContain('Update linked deal');
    expect(html).toContain('Cancel');
  });

  it('cancels editing without saving a mutation', () => {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    const renderer = create(<CrmActivityEditor
      activity={{
        id: 'activity-1', workspace_id: 'workspace-1', company_id: 'company-1', contact_id: null,
        deal_id: null, kind: 'note', body: 'Original', occurred_at: '2026-10-01T08:00:00Z',
        call_outcome: null, created_by: 'user-1', updated_by: 'user-1',
        created_at: '2026-10-01T08:00:00Z', updated_at: '2026-10-01T08:00:00Z',
      }}
      pending={false}
      onCancel={onCancel}
      onSave={onSave}
    />);
    const cancel = renderer.root.findAllByType('button').find((button) => button.props.type === 'button');
    act(() => cancel?.props.onClick());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
