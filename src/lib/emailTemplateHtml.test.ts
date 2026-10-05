import { describe, expect, it } from 'vitest';
import { htmlToPlainText, prepareImportedEmailHtml } from './emailTemplateHtml';

describe('HTML email import', () => {
  it('preserves table layout, rewrites companion images, and removes active content', () => {
    const input = `<!doctype html><html><body onload="steal()">
      <script>alert(1)</script><table><tr><td>Hello {{contact_name}}</td></tr></table>
      <img src="Campaign_files/image001.png" onerror="steal()">
      <a href="javascript:steal()">bad</a><a href="https://example.com">good</a>
    </body></html>`;
    const result = prepareImportedEmailHtml(input, {
      'image001.png': 'https://assets.example/image001.png',
    });

    expect(result.html).toContain('<table>');
    expect(result.html).toContain('https://assets.example/image001.png');
    expect(result.html).toContain('{{contact_name}}');
    expect(result.html).not.toMatch(/script|onerror|onload|javascript:/i);
    expect(result.imageReferences).toEqual(['Campaign_files/image001.png']);
  });

  it('removes unresolved relative, cid, and embedded data images', () => {
    const result = prepareImportedEmailHtml('<img src="cid:logo"><img src="missing.png"><img src="data:image/png;base64,AAAA">', {});
    expect(result.html).not.toContain('<img');
    expect(result.unresolvedImages).toEqual(['cid:logo', 'missing.png', 'data:image/png;base64,AAAA']);
  });

  it('creates a readable plain-text fallback from table HTML', () => {
    expect(htmlToPlainText('<table><tr><td>Hello</td><td>World</td></tr></table><p>Next&nbsp;line</p>'))
      .toBe('Hello World\nNext line');
  });
});
