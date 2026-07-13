// -----------------------------------------------------------------------------
// Deal-name parsing: pull the CUSTOMER out of a HubSpot deal name.
//
// Deal names in this portal follow a house convention — the product/brand being
// sold comes FIRST, the customer we are selling to comes SECOND:
//
//     ADOBE (REN)  -  THE PR PEOPLE PTE LTD (AB005226)
//     ADSK (REN)   -  P&T CONSULTANTS PTE LTD
//     StarHub      -  LATITUDE BROKERS PTE. LTD  -  BB 500Mbps + 10 Landlines
//     18009        -  LAND TRANSPORT AUTHORITY (LTA000ECI19303002/1)
//
// The previous cleaner kept the text BEFORE the dash, so every customer collapsed
// into the vendor they were buying from: 374 different customers all became one
// company called "Adsk", and KYC dutifully researched Adobe instead of the client.
//
// MIRROR of src/lib/dealName.ts — Deno/edge copy, so the ingest function cleans
// names identically to the UI preview. If you change one, change the other.
// -----------------------------------------------------------------------------

/** Only a dash/pipe with whitespace on BOTH sides splits segments, so hyphenated
 *  names survive intact: "PENTA-OCEAN", "OPTO-ELECTRONIC", "PO-SSOE2-9413". */
const SEGMENT_SEP = /\s+[-–—|]\s+/;

/** A segment carrying one of these is a legal entity, i.e. the customer. */
const LEGAL_SUFFIX_RE =
  /\b(?:pte|pty|sdn|bhd|berhad|ltd|limited|llc|llp|inc|incorporated|corp|corporation|gmbh|plc|pvt|nv|bv)\b/i;

const NOISE_WORDS = [
  'renewal',
  'renew',
  'quote',
  'invoice',
  'proposal',
  'opportunity',
  'deal',
  'new business',
  'upsell',
  'cross-sell',
  'contract',
  'subscription',
  'support',
  'maintenance',
  'agreement',
  'order',
  'po',
];

const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

export interface DealNameParts {
  /** The brand/product the customer is buying. Not a company we sell to. */
  product: string;
  /** The customer segment exactly as written, including any account code. */
  company_raw: string;
  /** Canonical customer name — used for dedupe, display and KYC search. */
  company_clean: string;
}

export function parseDealName(raw: string | null | undefined): DealNameParts {
  const segments = String(raw ?? '')
    .split(SEGMENT_SEP)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return { product: '', company_raw: '', company_clean: '' };
  if (segments.length === 1) {
    return {
      product: '',
      company_raw: segments[0],
      company_clean: cleanCompanyName(segments[0]),
    };
  }

  // Segments that are pure bookkeeping ("March renewal", "Quote #1234") are not
  // candidates for being the customer.
  const candidates = segments
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => !isNoiseOnly(text));
  const pool = candidates.length > 0 ? candidates : [{ text: segments[0], index: 0 }];

  // A legal suffix (PTE LTD, LLC, GMBH…) is the strongest signal of the customer.
  // If several segments carry one, the customer is the later one — the vendor is
  // named first by convention.
  const legal = pool.filter(({ text }) => LEGAL_SUFFIX_RE.test(text));

  const chosen =
    legal.length > 0
      ? legal[legal.length - 1]
      : // No legal suffix anywhere: fall back to the convention itself, i.e. the
        // segment right after the product. Guard the case where that segment was
        // dropped as noise, which means the name had no product prefix at all.
        (pool.find((p) => p.index === 1) ??
        pool.find((p) => p.index > 0) ??
        pool[0]);

  return {
    product: chosen.index === 0 ? '' : cleanCompanyName(segments[0]),
    company_raw: chosen.text,
    company_clean: cleanCompanyName(chosen.text),
  };
}

/** The canonical company name for a deal. Kept for existing callers. */
export function cleanDealName(raw: string | null | undefined): string {
  return parseDealName(raw).company_clean;
}

/**
 * Tidy a name that is ALREADY known to be a company (a HubSpot company record, or
 * the customer segment picked above). Deliberately light: it strips bracketed
 * account codes and normalises case, but does NOT strip words like "support" or
 * month names, which are safe to remove from a deal title yet destructive in a
 * company name ("May Design Pte Ltd", "Support Services Ltd").
 */
export function cleanCompanyName(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' '); // (AB005226), (REN), (Reseller)
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^[\s.,;:_-]+/, '').replace(/[\s,;:_-]+$/, '');
  return titleCase(s);
}

/** True when a segment is entirely bookkeeping noise once scrubbed. */
function isNoiseOnly(segment: string): boolean {
  let s = segment;
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' ');
  s = s.replace(/\b(?:quote|q|ref|reference|inv|invoice|po|order)[\s#:.-]*\d+\b/gi, ' ');
  s = s.replace(/#\s*\d+/g, ' ');
  s = s.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ');
  s = s.replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ');
  s = s.replace(new RegExp(`\\b\\d{0,2}\\s*${MONTHS}\\.?\\s*'?\\d{2,4}\\b`, 'gi'), ' ');
  s = s.replace(new RegExp(`\\b${MONTHS}\\b`, 'gi'), ' ');
  s = s.replace(/\b(?:19|20)\d{2}\b/g, ' ');
  s = s.replace(new RegExp(`\\b(?:${NOISE_WORDS.join('|')})\\b`, 'gi'), ' ');
  s = s.replace(/[^a-z0-9&]/gi, '');
  return s.trim().length === 0;
}

/** Acronyms and legal suffixes that must not be title-cased. */
const KEEP_UPPER = new Set([
  'PTE',
  'PTY',
  'SDN',
  'BHD',
  'LLC',
  'LLP',
  'LTD',
  'INC',
  'PLC',
  'GMBH',
  'AG',
  'NV',
  'BV',
  'SA',
  'IT',
  'AI',
  'HR',
  'UK',
  'USA',
  'US',
  'AU',
]);

/** Short ALL-CAPS words that are ordinary English, not acronyms. */
const COMMON_WORDS = new Set(['THE', 'AND', 'OF', 'FOR', 'A', 'AN', 'TO', 'IN', 'ON', 'AT', 'BY']);

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const bare = word.replace(/[^a-z0-9&]/gi, '');
      if (!bare) return word;

      const upper = bare.toUpperCase();
      if (KEEP_UPPER.has(upper)) return word.toUpperCase();
      if (COMMON_WORDS.has(upper)) {
        return i === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : upper.toLowerCase();
      }
      if (isAcronym(word, bare)) return word.toUpperCase();

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}

/**
 * Source names are typed in ALL CAPS, so caps alone proves nothing — the trick is
 * telling an acronym (PR, P&T, M&E, ST.) from an ordinary short word that merely
 * happens to be shouted (FENG, LAND, HOME, PICO). Vowels and punctuation are the
 * tell: acronyms are unpronounceable or carry an ampersand/period.
 */
function isAcronym(word: string, bare: string): boolean {
  if (word !== word.toUpperCase()) return false; // author chose mixed case; respect it
  if (bare.length <= 2) return true; // PR, DE, LT
  if (bare.length <= 4 && /[&.]/.test(word)) return true; // P&T, M&E, ST.
  if (bare.length <= 5 && !/[AEIOU]/i.test(bare)) return true; // PSB, HDB
  return false;
}
