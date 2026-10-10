import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyBrevoError, sendBrevo, sendMicrosoftGraph } from './emailProviders';

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

  it('captures Brevo rate-limit metadata without exposing the API key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'brevo-1' }), {
      status: 201,
      headers: { 'x-sib-ratelimit-limit': '100', 'x-sib-ratelimit-remaining': '87', 'x-sib-ratelimit-reset': '42' },
    })));
    const result = await sendBrevo('secret-key', { toEmail: 'person@example.com', subject: 'Hello', bodyText: 'Body', senderEmail: 'sender@example.com' });
    expect(result.rateLimit).toEqual({ limit: 100, remaining: 87, resetSeconds: 42 });
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });

  it('classifies Brevo unknown-IP responses with actionable wording', () => {
    const failure = classifyBrevoError(401, 'Brevo detected an unrecognised IP address 2406:da18::1');
    expect(failure.errorMessage).toContain('blocked this sending server IP');
    expect(failure.errorCode).toBe('brevo_ip_restricted');
    expect(failure.retryable).toBe(false);
  });

  it('does not expose arbitrary provider response bodies to the browser', () => {
    const failure = classifyBrevoError(400, '{"message":"private provider diagnostic token=secret"}');
    expect(failure.errorMessage).toBe('Brevo rejected the request. Check the sender and message settings, then try again.');
    expect(failure.errorMessage).not.toContain('secret');
  });
});
