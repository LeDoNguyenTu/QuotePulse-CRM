export type EmailProvider = 'microsoft_graph' | 'brevo';

export interface ProviderEmail {
  toEmail: string;
  subject: string;
  bodyText: string;
  senderEmail?: string | null;
  unsubscribeUrl?: string | null;
}

export interface ProviderResult {
  ok: boolean;
  providerMessageId: string | null;
  retryable: boolean;
  ambiguous: boolean;
  retryAfterSeconds?: number;
  errorCode?: string;
  errorMessage?: string;
}

function retryAfter(response: Response) {
  const raw = response.headers.get('retry-after');
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3_600) : undefined;
}

function failure(response: Response, body: string): ProviderResult {
  const status = response.status;
  return {
    ok: false,
    providerMessageId: null,
    retryable: status === 429 || status >= 500,
    ambiguous: false,
    retryAfterSeconds: retryAfter(response),
    errorCode: String(status),
    errorMessage: body.slice(0, 1_000),
  };
}

function mimeMessage(input: ProviderEmail) {
  const safe = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
  const headers = [
    `To: ${safe(input.toEmail)}`,
    `Subject: ${safe(input.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  if (input.unsubscribeUrl) {
    headers.push(`List-Unsubscribe: <${safe(input.unsubscribeUrl)}>`, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  }
  return btoa(unescape(encodeURIComponent(`${headers.join('\r\n')}\r\n\r\n${input.bodyText}`)));
}

export async function sendMicrosoftGraph(accessToken: string, input: ProviderEmail): Promise<ProviderResult> {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain' },
      body: mimeMessage(input),
    });
    if (response.status === 202) {
      return { ok: true, providerMessageId: response.headers.get('request-id'), retryable: false, ambiguous: false };
    }
    return failure(response, await response.text());
  } catch {
    // The request may have reached Graph before the network failed: never retry automatically.
    return { ok: false, providerMessageId: null, retryable: false, ambiguous: true, errorMessage: 'The provider response was ambiguous; retry manually to avoid a duplicate send.' };
  }
}

export async function sendBrevo(apiKey: string, input: ProviderEmail): Promise<ProviderResult> {
  if (!input.senderEmail) {
    return { ok: false, providerMessageId: null, retryable: false, ambiguous: false, errorMessage: 'Brevo requires a verified sender email in Settings.' };
  }
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { email: input.senderEmail }, to: [{ email: input.toEmail }], subject: input.subject, textContent: input.bodyText,
      }),
    });
    const body = await response.text();
    if (!response.ok) return failure(response, body);
    const parsed = JSON.parse(body) as { messageId?: string };
    return { ok: true, providerMessageId: parsed.messageId ?? null, retryable: false, ambiguous: false };
  } catch {
    return { ok: false, providerMessageId: null, retryable: false, ambiguous: true, errorMessage: 'The provider response was ambiguous; retry manually to avoid a duplicate send.' };
  }
}
