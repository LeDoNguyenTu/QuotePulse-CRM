import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CompanyStatusCell } from './CompanyStatusCell';

describe('CompanyStatusCell', () => {
  it('shows the imported status and a review badge with its reason', () => {
    const html = renderToStaticMarkup(<CompanyStatusCell
      status="Maintenance Customer"
      source="classifier"
      reviewRequired
      reviewReason="Name appears in both Active and Inactive customer worksheets."
    />);

    expect(html).toContain('Maintenance Customer');
    expect(html).toContain('Inferred');
    expect(html).toContain('Review required');
    expect(html).toContain('Name appears in both Active and Inactive customer worksheets.');
  });
});
