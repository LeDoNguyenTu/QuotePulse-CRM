import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendBrevo, sendMicrosoftGraph } from './emailProviders';

afterEach(() => vi.unstubAllGlobals());

describe('email provider HTML delivery', () => {
  it('sends HTML through Microsoft Graph with a plain-text fallback retained by the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202, headers: { 'request-id': 'graph-1' } }));
    vi.stubGlobal('fetch', fetchMock);
    await sendMicrosoftGraph('token', {
      toEmail: 'person@example.com', subject: 'Hello', bodyText: 'Plain fallback', bodyHtml: '<table><tr><td>Hello</td></tr></table>',
    });
    const [, request] = fetchMock.mock.calls[0];
    const mime = Buffer.from(request.body, 'base64').toString('utf8');
    expect(request.headers['Content-Type']).toBe('text/plain');
    expect(mime).toContain('Content-Type: multipart/alternative');
    expect(mime).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(mime).toContain('Plain fallback');
    expect(mime).toContain('Content-Type: text/html; charset=UTF-8');
    expect(mime).toContain('<table><tr><td>Hello</td></tr></table>');
  });

  it('sends both htmlContent and textContent through Brevo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'brevo-1' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendBrevo('key', {
      toEmail: 'person@example.com', subject: 'Hello', bodyText: 'Plain fallback', bodyHtml: '<strong>Hello</strong>', senderEmail: 'sender@example.com',
    });
    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload.textContent).toBe('Plain fallback');
    expect(payload.htmlContent).toBe('<strong>Hello</strong>');
  });
});
