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
            associationCounts: [1, 0],
            lineage: [{
              source_row_number: 14,
              source_import: { database_id: 'CRM-ABC123DEF456', original_filename: 'accounts.xlsx', sheet_name: 'Customers', created_at: '2026-09-28T00:00:00Z' },
            }],
            lineageCount: 1,
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
    expect(html).toContain('Activity history is not loaded in this record view yet.');
  });

  it('does not render imported unsafe website protocols as links', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <CrmDetailContent kind="company" workspaceId="workspace-1" data={{
          record: {
            id: 'company-1', workspace_id: 'workspace-1', name: 'Unsafe Co', industry: null,
            website: 'javascript:alert(1)', domain: null, phone: null, address_line_1: null,
            address_line_2: null, city: null, state_region: null, postal_code: null, country: null,
            created_by: 'user-1', updated_by: 'user-1', created_at: '2026-09-01T00:00:00Z',
            updated_at: '2026-09-28T00:00:00Z',
          },
          associations: [[], []], associationCounts: [0, 0], lineage: [], lineageCount: 0,
        }} />
      </StaticRouter>,
    );

    expect(html).toContain('javascript:alert(1)');
    expect(html).not.toContain('href="javascript:');
  });

  it('reports exact association totals when the rendered result is truncated', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <CrmDetailContent kind="company" workspaceId="workspace-1" data={{
          record: {
            id: 'company-1', workspace_id: 'workspace-1', name: 'Large Co', industry: null,
            website: null, domain: null, phone: null, address_line_1: null, address_line_2: null,
            city: null, state_region: null, postal_code: null, country: null, created_by: 'user-1',
            updated_by: 'user-1', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-28T00:00:00Z',
          },
          associations: [[], []], associationCounts: [125, 0], lineage: [], lineageCount: 140,
        }} />
      </StaticRouter>,
    );

    expect(html).toContain('<span>125</span>');
    expect(html).toContain('Source lineage');
    expect(html).toContain('<span>140</span>');
  });

  it('renders an explicit missing-record state', () => {
    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <CrmDetailContent
          kind="deal"
          workspaceId="workspace-1"
          data={{ record: null, associations: [[]], associationCounts: [0], lineage: [], lineageCount: 0 }}
        />
      </StaticRouter>,
    );
    expect(html).toContain('Record unavailable');
  });
});
