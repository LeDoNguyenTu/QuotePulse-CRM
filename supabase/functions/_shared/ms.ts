// Microsoft Graph / Azure AD helpers for delegated Mail.Send.
// Auth-code flow: user consents -> we exchange code for access + refresh tokens
// (confidential client, uses AZURE_CLIENT_SECRET) -> store refresh token ->
// mint fresh access tokens on demand to call /me/sendMail.

const SCOPES = 'openid profile offline_access https://graph.microsoft.com/Mail.Send';

function tenant(): string {
  return Deno.env.get('AZURE_TENANT_ID') || 'common';
}
function clientId(): string {
  return Deno.env.get('AZURE_CLIENT_ID')!;
}
function clientSecret(): string {
  return Deno.env.get('AZURE_CLIENT_SECRET')!;
}

// ---------------------------------------------------------------------------
// OAuth `state` signing. The state carries the signed-in user id through the
// Microsoft round-trip so the callback can attribute the tokens even when the
// browser session isn't present on the callback origin (Vercel multi-domain).
// It is HMAC-SHA256 signed with a server-only secret + short expiry so a client
// cannot forge a state for another user (never trust a raw id from the URL).
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stateEnc = new TextEncoder();

async function stateKey(): Promise<CryptoKey> {
  // Service-role key is server-only and always injected into Edge Functions.
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return crypto.subtle.importKey(
    'raw',
    stateEnc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Produce a signed, expiring state string binding this OAuth flow to userId. */
export async function signState(userId: string): Promise<string> {
  const payload = `${userId}.${Date.now() + STATE_TTL_MS}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', await stateKey(), stateEnc.encode(payload))
  );
  return `${payload}.${b64urlEncode(sig)}`;
}

/** Return the userId iff the state's signature verifies and it hasn't expired. */
export async function verifyState(state: string | undefined): Promise<string | null> {
  if (!state) return null;
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, sigB64] = parts;
  const sig = b64urlDecode(sigB64);
  if (!sig) return null;
  const ok = await crypto.subtle.verify(
    'HMAC',
    await stateKey(),
    sig,
    stateEnc.encode(`${userId}.${expStr}`)
  );
  if (!ok) return null; // forged / tampered signature
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null; // expired
  return UUID_RE.test(userId) ? userId : null;
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const url = new URL(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`
  );
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    }
  );
  if (!res.ok) throw new Error(`MS token error ${res.status}: ${await res.text()}`);
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  return tokenRequest({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: SCOPES,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPES,
  });
}

/** Decode the email/upn out of an id_token (no signature check needed here). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    return payload.preferred_username || payload.email || payload.upn || null;
  } catch {
    return null;
  }
}

export interface SendMailInput {
  subject: string;
  bodyText: string;
  toEmail: string;
  fromEmail?: string | null; // ignored for /me; used only if sending as another mailbox
}

/**
 * Send one message via Microsoft Graph. Returns the client request id header,
 * which we store as a provider reference (sendMail itself returns 202 no body).
 */
export async function sendMail(
  accessToken: string,
  input: SendMailInput
): Promise<{ requestId: string | null }> {
  const payload = {
    message: {
      subject: input.subject,
      body: { contentType: 'Text', content: input.bodyText },
      toRecipients: [{ emailAddress: { address: input.toEmail } }],
    },
    saveToSentItems: true,
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (res.status !== 202) {
    throw new Error(`Graph sendMail ${res.status}: ${await res.text()}`);
  }
  return { requestId: res.headers.get('request-id') };
}
