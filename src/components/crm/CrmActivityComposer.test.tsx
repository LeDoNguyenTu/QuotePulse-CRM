import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrmActivityComposer } from './CrmActivityComposer';

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
});
