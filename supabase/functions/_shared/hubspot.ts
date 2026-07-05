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

export class HubSpotClient {
  constructor(private token: string) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
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
      if (!res.ok) {
        throw new Error(`HubSpot ${res.status} ${path}: ${await res.text()}`);
      }
      return (await res.json()) as HsPage;
    }
    throw new Error(`HubSpot rate-limited after retries: ${path}`);
  }

  /**
   * Page through an object type. `archived=true` targets the recycle bin.
   * `associations` pulls linked object ids inline (e.g. companies, contacts).
   */
  async *paginate(
    objectType: 'deals' | 'contacts' | 'companies' | 'notes' | 'quotes',
    opts: {
      archived?: boolean;
      properties?: string[];
      associations?: string[];
      limit?: number;
    } = {}
  ): AsyncGenerator<HsObject> {
    let after: string | undefined;
    do {
      const params: Record<string, string> = {
        limit: String(opts.limit ?? 100),
        archived: String(!!opts.archived),
      };
      if (opts.properties?.length) params.properties = opts.properties.join(',');
      if (opts.associations?.length) params.associations = opts.associations.join(',');
      if (after) params.after = after;

      const page = await this.get(`/crm/v3/objects/${objectType}`, params);
      for (const obj of page.results) yield obj;
      after = page.paging?.next?.after;
    } while (after);
  }

  /** Files API: resolve a file id to its name + signed URL (best-effort). */
  async getFileMeta(fileId: string): Promise<{ name: string; url: string } | null> {
    const res = await fetch(`${BASE}/files/v3/files/${fileId}`, {
      headers: this.headers(),
    });
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
    if (!res.ok) throw new Error(`HubSpot getOne ${objectType}/${id}: ${res.status}`);
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
