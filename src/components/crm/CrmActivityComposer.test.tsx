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
});
