import { describe, expect, it } from 'vitest';
import type { FieldsData } from '@kenjiuno/msgreader';
import { extractEncapsulatedHtml, MAX_OUTLOOK_MSG_BYTES, materializeOutlookMessage, parseOutlookMsg } from './outlookMsg';

describe('Outlook .msg import', () => {
  it('keeps table HTML, subject and inline images while resolving cid references', () => {
    const fields = {
      subject: 'Microsoft 365 offer',
      body: 'Readable fallback',
      bodyHtml: '<table><tr><td>Offer</td></tr></table><img src="cid:banner-1">',
      attachments: [{ fileName: 'banner.png', pidContentId: 'banner-1' }],
    } as FieldsData;

    const result = materializeOutlookMessage(fields, () => ({
      fileName: 'banner.png', content: new Uint8Array([137, 80, 78, 71]),
    }));

    expect(result.subject).toBe('Microsoft 365 offer');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('src="banner.png"');
    expect(result.text).toBe('Readable fallback');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({ name: 'banner.png', type: 'image/png' });
  });

  it('turns a plain-text-only message into safe HTML', () => {
    const result = materializeOutlookMessage({ body: '<Hello>\nNext' } as FieldsData, () => {
      throw new Error('not called');
    });
    expect(result.html).toBe('<div>&lt;Hello&gt;<br>Next</div>');
  });

  it('extracts Outlook encapsulated HTML parts from decompressed RTF', () => {
    const uncompressed = new TextEncoder().encode(
      '{\\rtf1{\\*\\htmltag0 <html>}{\\*\\htmltag64 <table><tr><td>Offer</td></tr></table>}{\\*\\htmltag0 </html>}}',
    );
    const header = new Uint8Array(16);
    const view = new DataView(header.buffer);
    view.setUint32(0, uncompressed.byteLength + 12, true);
    view.setUint32(4, uncompressed.byteLength, true);
    view.setUint32(8, 0x414c454d, true);
    const compressedRtf = new Uint8Array(header.byteLength + uncompressed.byteLength);
    compressedRtf.set(header);
    compressedRtf.set(uncompressed, header.byteLength);

    expect(extractEncapsulatedHtml(compressedRtf)).toContain('<table>');
  });

  it('rejects empty and oversized files before parsing', async () => {
    await expect(parseOutlookMsg(new File([], 'empty.msg'))).rejects.toThrow('25 MB or smaller');
    const oversized = { name: 'huge.msg', size: MAX_OUTLOOK_MSG_BYTES + 1 } as File;
    await expect(parseOutlookMsg(oversized)).rejects.toThrow('25 MB or smaller');
  });
});
