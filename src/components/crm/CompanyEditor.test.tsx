import { renderToStaticMarkup } from 'react-dom/server';
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
});
