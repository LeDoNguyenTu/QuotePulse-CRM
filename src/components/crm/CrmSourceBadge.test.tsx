import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CrmSourceBadge, sourceFilterFromSummary } from './CrmSourceBadge';

const source = {
  id: 'source-1', database_id: 'CRM-ABC123DEF456', filename: 'accounts.xlsx',
  source_type: 'workbook' as const, headers: ['Region'], row_index_available: true,
};

describe('CRM source badge', () => {
  it('shows the traceable filename and collapsed source count', () => {
    const html = renderToStaticMarkup(<CrmSourceBadge source={source} count={3} onSelect={vi.fn()} />);
    expect(html).toContain('accounts.xlsx');
    expect(html).toContain('+2');
    expect(html).toContain('Filter by source');
  });

  it('preserves source identity and row-index metadata for filtering', () => {
    expect(sourceFilterFromSummary(source)).toEqual({
      id: 'source-1', databaseId: 'CRM-ABC123DEF456', filename: 'accounts.xlsx',
      type: 'workbook', headers: ['Region'], rowIndexAvailable: true,
    });
  });
});
