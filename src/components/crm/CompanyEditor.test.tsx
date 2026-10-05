import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { CompanyEditor } from './CompanyEditor';

describe('CompanyEditor customer status', () => {
  it('offers standard customer statuses while leaving the input open to custom values', () => {
    const html = renderToStaticMarkup(<CompanyEditor
      initial={null}
      busy={false}
      error={null}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(html).toContain('Customer status');
    expect(html).toContain('Current Customer');
    expect(html).toContain('Maintenance Customer');
    expect(html).toContain('list="crm-customer-statuses"');
  });

  it('offers an explicit acknowledgement without clearing review on unrelated edits', () => {
    const html = renderToStaticMarkup(<CompanyEditor
      initial={{
        id: 'company-1', workspace_id: 'workspace-1', name: 'Example', customer_status: 'Former Customer',
        customer_status_review_required: true, customer_status_review_reason: 'Conflicting worksheets',
        industry: null, website: null, domain: null, phone: null, address_line_1: null, address_line_2: null,
        city: null, state_region: null, postal_code: null, country: null, field_sources: {},
        created_by: 'user-1', updated_by: 'user-1', created_at: '2026-10-06', updated_at: '2026-10-06',
      }}
      busy={false}
      error={null}
      onCancel={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(html).toContain('Customer status reviewed');
    expect(html).toContain('clear this import review flag');
  });

  it('records an acknowledged status as a user decision', () => {
    const onSave = vi.fn();
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<CompanyEditor
        initial={{
          id: 'company-1', workspace_id: 'workspace-1', name: 'Example', customer_status: 'Former Customer',
          customer_status_review_required: true, customer_status_review_reason: 'Conflicting worksheets',
          industry: null, website: null, domain: null, phone: null, address_line_1: null, address_line_2: null,
          city: null, state_region: null, postal_code: null, country: null,
          field_sources: { name: 'workbook', customer_status: 'classifier' },
          created_by: 'user-1', updated_by: 'user-1', created_at: '2026-10-06', updated_at: '2026-10-06',
        }}
        busy={false}
        error={null}
        onCancel={vi.fn()}
        onSave={onSave}
      />);
    });
    const checkbox = renderer!.root.findAllByType('input').find((input) => input.props.type === 'checkbox');
    act(() => checkbox?.props.onChange({ target: { checked: true } }));
    act(() => renderer!.root.findByType('form').props.onSubmit({ preventDefault: vi.fn() }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      customer_status: 'Former Customer',
      customer_status_review_required: false,
      customer_status_review_reason: null,
      field_sources: { name: 'workbook', customer_status: 'user' },
    }));
  });
});
