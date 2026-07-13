// Edge Function: parse-quote
// Downloads a quote attachment, runs NVIDIA Build OCR, and extracts structured
// fields (company, address, contact, email, phone, quote #) tailored to the
// standardized MYOB quote layout. Writes attachments.parsed_summary and can
// upsert discovered contacts/companies.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId, getUserSettings } from '../_shared/supabaseAdmin.ts';
import { HubSpotClient, HubSpotApiError } from '../_shared/hubspot.ts';

// Default to NVIDIA's OpenAI-compatible integrate endpoint. Override with env if
// you use a dedicated OCR NIM with a different schema.
const DEFAULT_OCR_URL =
  Deno.env.get('NVIDIA_OCR_URL') ?? 'https://integrate.api.nvidia.com/v1/chat/completions';
const DEFAULT_OCR_MODEL = Deno.env.get('NVIDIA_OCR_MODEL') ?? 'nvidia/nemotron-ocr-v1';

interface ParsedSummary {
  company_name?: string;
  address?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  quote_number?: string;
  raw_text?: string;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;

  const errors: string[] = [];
  try {
    const userId = await getUserId(req);
    const admin = getAdminClient();
    const settings = await getUserSettings(admin, userId);

    const body = (await req.json()) as { attachment_id?: string; file_url?: string };
    if (!body.attachment_id && !body.file_url) {
      return errorResponse('attachment_id or file_url is required', 400);
    }

    let attachment: AttachmentRow | null = null;
    if (body.attachment_id) {
      // Service role bypasses RLS — scope by owner explicitly.
      const { data, error } = await admin
        .from('attachments')
        .select('id, file_url, file_name, hubspot_attachment_id, deal_id')
        .eq('id', body.attachment_id)
        .eq('owner_id', userId)
        .maybeSingle();
      if (error || !data) return errorResponse('Attachment not found', 404);
      attachment = data as AttachmentRow;
    }

    // 1) Download file bytes.
    const source = await resolveDownload(attachment, body.file_url ?? null, settings?.hubspot_token ?? null);
    const fileRes = await fetch(source.url, { signal: AbortSignal.timeout(20000) });
    if (!fileRes.ok) {
      throw new Error(
        `Downloading the file failed (${fileRes.status}). ` +
          (source.from === 'hubspot'
            ? 'The HubSpot link is short-lived — try again.'
            : 'The stored file URL may have expired.')
      );
    }
    const contentType = fileRes.headers.get('content-type') ?? 'application/pdf';
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    const b64 = base64Encode(bytes);

    // Imports done without the Files scope stored a placeholder name; now that we
    // could reach HubSpot, correct it.
    if (attachment && source.name && source.name !== attachment.file_name) {
      await admin
        .from('attachments')
        .update({ file_name: source.name })
        .eq('id', attachment.id)
        .eq('owner_id', userId);
    }

    // 2) OCR via NVIDIA.
    const apiKey = settings?.nvidia_key || Deno.env.get('NVIDIA_API_KEY');
    if (!apiKey) return errorResponse('No NVIDIA API key configured', 400);
    const text = await runOcr(b64, contentType, apiKey, errors);

    // 3) Parse MYOB fields.
    const summary = parseMyobQuote(text);

    // 4) Persist.
    if (attachment) {
      await admin
        .from('attachments')
        .update({ parsed: true, parsed_summary: summary, source_type: 'quote' })
        .eq('id', attachment.id)
        .eq('owner_id', userId);

      // Optionally enrich the linked company's contact from the quote.
      if ((summary.email || summary.phone) && attachment.deal_id) {
        const { data: deal } = await admin
          .from('deals')
          .select('company_id')
          .eq('id', attachment.deal_id)
          .eq('owner_id', userId)
          .maybeSingle();
        if (deal?.company_id) {
          // Dedupe-then-insert. The contacts unique index is FUNCTIONAL —
          // (company_id, lower(email)) where email is not null — which
          // onConflict cannot target: Postgres raises 42P10 and the write is
          // lost. See CLAUDE.md "Gotchas".
          let exists = false;
          if (summary.email) {
            const { data: dup } = await admin
              .from('contacts')
              .select('id')
              .eq('company_id', deal.company_id)
              .ilike('email', summary.email)
              .maybeSingle();
            exists = !!dup;
          }
          if (!exists) {
            const { error: cErr } = await admin.from('contacts').insert({
              owner_id: userId,
              company_id: deal.company_id,
              full_name: summary.contact_name ?? null,
              email: summary.email ?? null,
              phone: summary.phone ?? null,
              source: 'quote_pdf',
            });
            if (cErr && cErr.code !== '23505') {
              errors.push(`save contact: ${cErr.message}`);
            }
          }
        }
      }
    }

    return json({
      ok: true,
      attachment_id: attachment?.id ?? null,
      parsed_summary: summary,
      errors,
    });
  } catch (e) {
    // A ParseError is an explained, actionable failure (missing scope, no file in
    // HubSpot) — give it its own status and message instead of a bare 500.
    if (e instanceof ParseError) return errorResponse(e.message, e.status);
    return json(
      { ok: false, errors: [...errors, e instanceof Error ? e.message : String(e)] },
      500
    );
  }
});

// ---------------------------------------------------------------------------

interface AttachmentRow {
  id: string;
  file_url: string | null;
  file_name: string | null;
  hubspot_attachment_id: string | null;
  deal_id: string | null;
}

class ParseError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Work out where the document's bytes actually live.
 *
 * Files attached to HubSpot notes and quotes are PRIVATE, so the Files API never
 * returns a fetchable `url` for them — which is why every imported attachment has
 * file_url = null and why this function used to dead-end at "Attachment has no
 * file_url to download". The bytes are reachable only through a signed URL that
 * expires within minutes, so it must be minted here, per parse, rather than
 * stored at import time.
 */
async function resolveDownload(
  attachment: AttachmentRow | null,
  explicitUrl: string | null,
  hubspotToken: string | null
): Promise<{ url: string; name?: string; from: 'hubspot' | 'stored' }> {
  if (explicitUrl) return { url: explicitUrl, from: 'stored' };

  const hsId = attachment?.hubspot_attachment_id ?? null;
  if (hsId) {
    if (!hubspotToken) {
      throw new ParseError(
        400,
        'This file is stored in HubSpot, but no HubSpot key is saved in Settings, ' +
          'so it cannot be downloaded. Add the key and try again.'
      );
    }

    const hs = await HubSpotClient.connect(hubspotToken);
    let name: string | undefined;
    try {
      const meta = await hs.getFileMeta(hsId);
      if (meta) name = meta.name;
      const signed = await hs.getFileDownloadUrl(hsId);
      if (signed) return { url: signed, name, from: 'hubspot' };
    } catch (e) {
      if (e instanceof HubSpotApiError && e.status === 403) {
        throw new ParseError(
          403,
          'Your HubSpot key is not allowed to read Files, so the quote PDF cannot be ' +
            'downloaded. Regenerate the personal access key in HubSpot with the "files" ' +
            'scope ticked, paste it into Settings, then run the HubSpot import again.'
        );
      }
      throw e;
    }

    // Not a file id: quote attachments store the QUOTE object id, whose PDF hangs
    // off a property instead of the Files API.
    try {
      const pdf = await hs.getQuotePdfUrl(hsId);
      if (pdf) return { url: pdf, name, from: 'hubspot' };
    } catch (e) {
      if (!(e instanceof HubSpotApiError && (e.status === 403 || e.status === 404))) throw e;
    }

    throw new ParseError(
      404,
      `HubSpot has no downloadable file behind attachment ${hsId} — it may have been ` +
        'deleted there, or it is a quote whose PDF has not been generated yet.'
    );
  }

  if (attachment?.file_url) return { url: attachment.file_url, from: 'stored' };

  throw new ParseError(
    400,
    'This attachment has no file to download: it has neither a stored URL nor a ' +
      'HubSpot file id.'
  );
}

/**
 * Sends the document to NVIDIA as an OpenAI-compatible multimodal message and
 * returns the recognized text. NOTE: many OCR NIMs expect image input; if you
 * feed a multi-page PDF you may need to rasterize pages first (TODO hook).
 */
async function runOcr(
  b64: string,
  contentType: string,
  apiKey: string,
  errors: string[]
): Promise<string> {
  const dataUri = `data:${contentType};base64,${b64}`;
  const payload = {
    model: DEFAULT_OCR_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Perform OCR. Return ALL text from this document exactly, preserving line breaks.',
          },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      },
    ],
    max_tokens: 4096,
    temperature: 0.0,
  };

  const res = await fetch(DEFAULT_OCR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`NVIDIA OCR ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    // Some dedicated OCR NIMs return { data: [{ text: ... }] } instead.
    data?: { text?: string }[];
    text?: string;
  };
  const text =
    data.choices?.[0]?.message?.content ??
    data.data?.map((d) => d.text).join('\n') ??
    data.text ??
    '';
  if (!text) errors.push('OCR returned empty text (check model/endpoint schema).');
  return text;
}

/**
 * MYOB quotes follow a fairly standard layout. These regexes target the common
 * labelled fields; adjust for your exact template if needed.
 */
export function parseMyobQuote(text: string): ParsedSummary {
  const clean = text.replace(/\r/g, '');
  const lines = clean
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const email = clean.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  const phone = clean
    .match(/(?:phone|tel|mobile|ph)[:\s]*(\+?\d[\d\s().-]{6,}\d)/i)?.[1]
    ?.trim();

  const quote_number = clean.match(
    /\bquote\s*(?:no\.?|number|#|ref)?\s*[:#]?\s*([A-Za-z0-9-]{2,})/i
  )?.[1];

  // Customer/company: MYOB prints the bill-to block under "To" / "Customer".
  let company_name: string | undefined;
  const toIdx = lines.findIndex((l) => /^(to|customer|bill to|client)\b/i.test(l));
  if (toIdx >= 0) {
    // The line after the label (or the remainder of the label line) is the name.
    const inline = lines[toIdx].replace(/^(to|customer|bill to|client)\b[:\s]*/i, '').trim();
    company_name = inline || lines[toIdx + 1];
  }
  if (!company_name) {
    // Fallback: first non-boilerplate line that isn't the vendor header.
    company_name = lines.find(
      (l) => l.length > 2 && !/quote|invoice|tax|abn|myob|date|page/i.test(l)
    );
  }

  // Contact person: a "Attention"/"Contact" label, else a two-word name near email.
  const contact_name =
    clean.match(/(?:attention|contact|attn)[:\s]*([A-Z][a-z]+\s+[A-Z][a-z]+)/i)?.[1] ??
    clean.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/)?.[1];

  // Address: a line containing a street suffix.
  const address = lines.find((l) =>
    /\d.*\b(street|st|road|rd|ave|avenue|lane|ln|drive|dr|blvd|way|court|ct)\b/i.test(l)
  );

  return {
    company_name: company_name?.trim(),
    address: address?.trim(),
    contact_name: contact_name?.trim(),
    email,
    phone,
    quote_number: quote_number?.trim(),
    raw_text: clean.slice(0, 5000),
  };
}

// Chunked base64 to avoid call-stack limits on large files.
function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
