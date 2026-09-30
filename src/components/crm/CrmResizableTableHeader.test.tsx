import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrmResizableTableHeader } from './CrmResizableTableHeader';

describe('CrmResizableTableHeader', () => {
  it('applies the resolved width and exposes an accessible resize handle', () => {
    const html = renderToStaticMarkup(
      <table><thead><tr><CrmResizableTableHeader label="Call Log" width={320} onResize={() => undefined} /></tr></thead></table>,
    );

    expect(html).toContain('style="width:320px;min-width:320px;max-width:320px"');
    expect(html).toContain('aria-label="Resize Call Log column"');
    expect(html).toContain('role="separator"');
  });
});
