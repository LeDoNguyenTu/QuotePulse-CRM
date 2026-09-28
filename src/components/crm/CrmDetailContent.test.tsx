import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { CrmDetailContent } from './CrmDetailContent';

describe('Sales CRM detail content', () => {
  it('renders company associations, audit dates, and source lineage as navigable CRM records', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <CrmDetailContent
          kind="company"
          workspaceId="workspace-1"
          data={{
            record: {
              id: 'company-1', workspace_id: 'workspace-1', name: 'Northwind Labs',
              industry: 'Engineering', website: 'https://northwind.example', domain: 'northwind.example',
              phone: '+65 6123 4567', address_line_1: '1 Harbour Road', address_line_2: null,
              city: 'Singapore', state_region: null, postal_code: '018989', country: 'Singapore',
              created_by: 'user-1', updated_by: 'user-1',
              created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-28T00:00:00Z',
            },
            associations: [[{
              id: 'contact-1', workspace_id: 'workspace-1', company_id: 'company-1',
              first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace',
              email: 'ada@northwind.example', phone: null, job_title: 'Director',
              created_by: 'user-1', updated_by: 'user-1',
              created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-28T00:00:00Z',
            }], []],
            lineage: [{
              source_row_number: 14,
              source_import: { database_id: 'CRM-ABC123DEF456', original_filename: 'accounts.xlsx', sheet_name: 'Customers', created_at: '2026-09-28T00:00:00Z' },
            }],
          }}
        />
      </StaticRouter>,
    );

    expect(html).toContain('Northwind Labs');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('/w/workspace-1/sales/contacts/contact-1');
    expect(html).toContain('CRM-ABC123DEF456');
    expect(html).toContain('accounts.xlsx');
    expect(html).toContain('Row 14');
  });

  it('renders an explicit missing-record state', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <CrmDetailContent
          kind="deal"
          workspaceId="workspace-1"
          data={{ record: null, associations: [[]], lineage: [] }}
        />
      </StaticRouter>,
    );
    expect(html).toContain('Record unavailable');
  });
});
