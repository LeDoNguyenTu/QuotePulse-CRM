// Minimal HubSpot CRM v3 REST client used by the ingest function.
// Docs: https://developers.hubspot.com/docs/api/crm/deals
const BASE = 'https://api.hubapi.com';

export interface HsObject {
  id: string;
  properties: Record<string, string | null>;
  associations?: Record<string, { results: { id: string; type: string }[] }>;
  archived?: boolean;
  archivedAt?: string;
}

export interface HsPage {
  results: HsObject[];
  paging?: { next?: { after: string } };
}

/** Carries the HTTP status so callers can tell 401 (bad token) from 403 (missing scope). */
export class HubSpotApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string
  ) {
    super(`HubSpot ${status} ${path}: ${body.slice(0, 400)}`);
    this.name = 'HubSpotApiError';
  }
}

export type TokenKind = 'private_app' | 'personal_access_key';

/**
 * HubSpot has two credential shapes and only ONE of them is a bearer token:
 *
 *   * Private App access token — plain text, `pat-na1-…`. Used directly as
 *     `Authorization: Bearer`. Requires admin rights to create.
 *
 *   * Personal Access Key — base64 protobuf, starts `CiR…`. This is the HubSpot
 *     *CLI* credential (`hs auth`). It is a REFRESH credential, NOT a bearer
 *     token: sending it to /crm/v3/* returns 401 no matter which scopes are
 *     ticked on it. It must first be exchanged for a short-lived access token,
 *     which is what the CLI does internally.
 *
 * Pasting a personal access key into the Settings field and getting silent
 * "0 companies imported" was the original bug this function exists to fix.
 */
export async function resolveAccessToken(
  rawToken: string
): Promise<{ accessToken: string; kind: TokenKind }> {
  const token = rawToken.trim();
  if (!token) throw new Error('HubSpot token is empty.');

  if (token.startsWith('pat-')) {
    return { accessToken: token, kind: 'private_app' };
  }

  const res = await fetch(`${BASE}/localdevauth/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encodedOAuthRefreshToken: token }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await res.text();

  if (!res.ok) {
    throw new Error(
      `HubSpot rejected this credential (${res.status}). It does not look like a valid ` +
        `Private App access token (which starts with "pat-") and it could not be exchanged ` +
        `as a personal access key. Regenerate the key in HubSpot, or paste a Private App ` +
        `token if your admin can provide one. HubSpot said: ${raw.slice(0, 300)}`
    );
  }

  let body: { accessToken?: string; oauthAccessToken?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(
      `HubSpot token exchange returned non-JSON (${res.status}): ${raw.slice(0, 200)}`
    );
  }

  // Field name differs across HubSpot CLI lib versions.
  const accessToken = body.accessToken ?? body.oauthAccessToken;
  if (!accessToken) {
    throw new Error(
      `HubSpot token exchange succeeded but returned no access token: ${raw.slice(0, 200)}`
    );
  }
  return { accessToken, kind: 'personal_access_key' };
}

export class HubSpotClient {
  private constructor(
    private accessToken: string,
    readonly tokenKind: TokenKind
  ) {}

  /** Resolves whichever credential the user pasted into a usable bearer token. */
  static async connect(rawToken: string): Promise<HubSpotClient> {
    const { accessToken, kind } = await resolveAccessToken(rawToken);
    return new HubSpotClient(accessToken, kind);
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /** GET with simple 429 backoff (HubSpot returns Retry-After). */
  private async get(path: string, params: Record<string, string> = {}): Promise<HsPage> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(url.toString(), { headers: this.headers() });
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After') ?? '2');
        await sleep(Math.min(retry, 10) * 1000);
        continue;
      }
      if (!res.ok) throw new HubSpotApiError(res.status, path, await res.text());
      return (await res.json()) as HsPage;
    }
    throw new Error(`HubSpot rate-limited after retries: ${path}`);
  }

  /**
   * Cheap 1-row request used to find out whether the token's scopes allow a given
   * association set. HubSpot rejects the WHOLE request with 403 if any requested
   * association type is out of scope, so this has to be probed rather than
   * discovered per-deal.
   */
  async probeAssociations(
    objectType: 'deals' | 'companies',
    associations: string[],
    archived = false
  ): Promise<void> {
    await this.get(`/crm/v3/objects/${objectType}`, {
      limit: '1',
      archived: String(archived),
      ...(associations.length ? { associations: associations.join(',') } : {}),
    });
  }

  /** One page of an object type. Returns the results plus the next cursor. */
  async page(
    objectType: 'deals' | 'contacts' | 'companies' | 'notes' | 'quotes',
    opts: {
      archived?: boolean;
      properties?: string[];
      associations?: string[];
      limit?: number;
      after?: string;
    } = {}
  ): Promise<{ results: HsObject[]; after?: string }> {
    const params: Record<string, string> = {
      limit: String(opts.limit ?? 100),
      archived: String(!!opts.archived),
    };
    if (opts.properties?.length) params.properties = opts.properties.join(',');
    if (opts.associations?.length) params.associations = opts.associations.join(',');
    if (opts.after) params.after = opts.after;

    const res = await this.get(`/crm/v3/objects/${objectType}`, params);
    return { results: res.results, after: res.paging?.next?.after };
  }

  /**
   * Search API — the only way to fetch "changed since X". Note it does NOT return
   * associations and does NOT cover archived records, so callers hydrate each hit
   * with getOne() and keep archived streams on the paging path.
   */
  async searchModifiedSince(
    objectType: 'deals' | 'companies',
    sinceIso: string,
    properties: string[],
    after?: string
  ): Promise<{ results: HsObject[]; after?: string }> {
    const res = await fetch(`${BASE}/crm/v3/objects/${objectType}/search`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'hs_lastmodifieddate',
                operator: 'GT',
                value: String(new Date(sinceIso).getTime()), // HubSpot wants epoch ms
              },
            ],
          },
        ],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
        properties,
        limit: 100,
        ...(after ? { after } : {}),
      }),
    });
    if (!res.ok) {
      throw new HubSpotApiError(res.status, `/crm/v3/objects/${objectType}/search`, await res.text());
    }
    const page = (await res.json()) as HsPage;
    return { results: page.results, after: page.paging?.next?.after };
  }

  /** Files API: resolve a file id to its name + signed URL. Throws on 403 so the
   *  caller can report "missing files scope" once instead of per attachment. */
  async getFileMeta(fileId: string): Promise<{ name: string; url: string } | null> {
    const res = await fetch(`${BASE}/files/v3/files/${fileId}`, { headers: this.headers() });
    if (res.status === 403) {
      throw new HubSpotApiError(403, `/files/v3/files/${fileId}`, await res.text());
    }
    if (!res.ok) return null;
    const f = (await res.json()) as { name?: string; url?: string };
    return { name: f.name ?? `file-${fileId}`, url: f.url ?? '' };
  }

  /** Fetch a single object by id (used to resolve associated companies/notes). */
  async getOne(
    objectType: string,
    id: string,
    properties: string[] = [],
    associations: string[] = []
  ): Promise<HsObject> {
    const params: Record<string, string> = { archived: 'false' };
    if (properties.length) params.properties = properties.join(',');
    if (associations.length) params.associations = associations.join(',');
    const url = new URL(`${BASE}/crm/v3/objects/${objectType}/${id}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { headers: this.headers() });
    if (!res.ok) {
      throw new HubSpotApiError(res.status, `/crm/v3/objects/${objectType}/${id}`, await res.text());
    }
    return (await res.json()) as HsObject;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- lightweight contact-info extraction from free-text notes ---------------
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d)/g;

export interface ExtractedContact {
  full_name?: string;
  email?: string;
  phone?: string;
  role_title?: string;
}

/** Parse a note body for emails/phones and a probable name/role near them. */
export function extractContactsFromText(text: string): ExtractedContact[] {
  if (!text) return [];
  const plain = text.replace(/<[^>]+>/g, ' '); // strip HTML from HubSpot notes
  const emails = [...new Set(plain.match(EMAIL_RE) ?? [])];
  const phones = [...new Set((plain.match(PHONE_RE) ?? []).map((p) => p.trim()))].filter(
    (p) => p.replace(/\D/g, '').length >= 8
  );

  if (emails.length === 0 && phones.length === 0) return [];

  // Heuristic: pair the first email with a name-looking token & a role keyword.
  const nameMatch = plain.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
  const roleMatch = plain.match(
    /\b(owner|director|manager|head of [a-z ]+|cto|ceo|cfo|it manager|procurement)\b/i
  );

  return [
    {
      full_name: nameMatch ? `${nameMatch[1]} ${nameMatch[2]}` : undefined,
      email: emails[0],
      phone: phones[0],
      role_title: roleMatch ? roleMatch[0] : undefined,
    },
  ];
}
