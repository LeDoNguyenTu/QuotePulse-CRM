// Typed wrappers around Supabase Edge Function invocations. Each returns the
// function's JSON body (or throws with a useful message). The user's auth token
// is attached automatically by supabase-js.
import { supabase } from './supabase';

async function invoke<T>(name: string, body?: unknown): Promise<T> {
  // On a cold page load (notably the OAuth redirect landing on /ms-auth-callback)
  // supabase-js may not have propagated the restored session to the functions
  // client yet, so it would send only the anon key and the Edge Function's
  // getUserId() would reject with "Invalid or expired session". Await session
  // recovery and attach the user's access token explicitly.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body ?? {},
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; surface any JSON message.
    let detail = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === 'function') {
      try {
        detail = await ctx.text();
      } catch {
        /* ignore */
      }
    }
    throw new Error(`${name} failed: ${detail}`);
  }
  return data as T;
}

export interface IngestResult {
  ok: boolean;
  counts: {
    companies: number;
    deals: number;
    contacts: number;
    attachments: number;
  };
  errors: string[];
}

export interface EnrichResult {
  ok: boolean;
  company_id: string;
  enriched_data: unknown;
  errors: string[];
}

export interface ParseResult {
  ok: boolean;
  attachment_id: string;
  parsed_summary: unknown;
  errors: string[];
}

export interface QueueProgress {
  ok: boolean;
  processed: number;
  sent: number;
  failed: number;
  blocked: number;
  remaining: number;
  sent_last_24h: number;
  daily_limit: number;
  done: boolean;
  errors: string[];
}

export interface MsAuthStartResult {
  url: string;
}

export const functions = {
  hubspotIngest: (opts?: { company_id?: string }) =>
    invoke<IngestResult>('hubspot-ingest', opts ?? {}),

  enrichKyc: (company_id: string) => invoke<EnrichResult>('enrich-kyc', { company_id }),

  parseQuote: (attachment_id: string) =>
    invoke<ParseResult>('parse-quote', { attachment_id }),

  msAuthStart: () =>
    invoke<MsAuthStartResult>('ms-auth-start', {
      redirect_uri: import.meta.env.VITE_MS_REDIRECT_URI,
    }),

  msAuthCallback: (code: string, redirect_uri: string, state?: string) =>
    invoke<{ ok: boolean; email: string | null }>('ms-auth-callback', {
      code,
      redirect_uri,
      state,
    }),

  processEmailQueue: () => invoke<QueueProgress>('process-email-queue', {}),
};

// Excel export needs the raw bytes, not JSON, so it uses a direct fetch to the
// function endpoint with the user's access token.
export async function exportXlsx(filters: {
  search?: string;
  industry?: string;
  source_priority?: string;
  has_quote?: boolean;
  has_kyc?: boolean;
}): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-xlsx`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(filters),
  });
  if (!res.ok) {
    throw new Error(`export-xlsx failed: ${await res.text()}`);
  }
  return res.blob();
}
