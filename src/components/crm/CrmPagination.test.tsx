import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrmPagination } from './CrmPagination';

describe('CrmPagination', () => {
  it('reports the visible range and disables unavailable directions', () => {
    const html = renderToStaticMarkup(
      <CrmPagination page={1} pageSize={25} count={28} onPageChange={() => undefined} />,
    );

    expect(html).toContain('>1–25</span> of <span class="tabular-nums">28</span>');
    expect(html).toContain('aria-label="Previous page" disabled=""');
    expect(html).not.toContain('aria-label="Next page" disabled=""');
  });
});
