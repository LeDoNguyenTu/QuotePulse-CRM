import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TemplateEditor } from './TemplateEditor';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('../hooks/useTemplates', () => ({ uploadEmailTemplateAssets: vi.fn() }));

describe('TemplateEditor rich email controls', () => {
  it('offers HTML/table import, companion images, sanitized preview, and text fallback', () => {
    const html = renderToStaticMarkup(<TemplateEditor
      open
      initial={{
        id: 'template-1', name: 'Offer', subject: 'Hello', body: 'Plain fallback',
        body_format: 'html', body_html: '<table><tr><td>Hello</td></tr></table>', asset_manifest: [],
      }}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />);
    expect(html).toContain('HTML / table layout');
    expect(html).toContain('Import .htm or .html');
    expect(html).toContain('Companion image ZIP or images');
    expect(html).toContain('HTML email preview');
    expect(html).toContain('Plain fallback');
  });
});
