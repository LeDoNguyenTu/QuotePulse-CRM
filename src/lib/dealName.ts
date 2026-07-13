// -----------------------------------------------------------------------------
// Deal-name parsing: pull the CUSTOMER and the PRODUCT out of a HubSpot deal name.
//
// The house convention is "<PRODUCT> - <CUSTOMER>", but only 93% of the names in
// the portal actually follow it. The rest arrive like this:
//
//     ADOBE (REN) - THE PR PEOPLE PTE LTD (AB005226)     <- 4,972 of them
//     TRAINING-  Kyodo-Allied Industries (MKTGLEAD)      <- dash, no space
//     LT--ATLOG PTE LTD                                  <- double dash
//     STARHUB-<tab>Qool Labs Pte Ltd-MB LINE             <- tab, and a trailing SKU
//     ADOBE (REN) (JUN'26) ST ENGINEERING ... AB014893   <- no dash at all
//     V-RAY (REN) (FEB'25) NTUC FAIRPRICE CO-OPERATIVE LTD VRAY0596
//     MS -TECHNIQUES AIR-CONDITIONING & ENGINEERING PTE LTD
//
// Note the last two: a hyphen inside the PRODUCT (V-RAY) and a hyphen inside the
// CUSTOMER (AIR-CONDITIONING, CO-OPERATIVE, Kyodo-Allied). So "split on a dash"
// cannot work on its own — the split has to be ANCHORED on a known product name.
//
// Products are therefore learned from the 93% that are punctuated properly
// (learnProducts) and then used to cut the ones that are not. Matching ignores
// spaces and punctuation, so "V-RAY" ≡ "VRAY" and "SKETCH UP" ≡ "SKETCHUP".
//
// Getting this wrong is not cosmetic: companies dedupe on lower(name_clean), so
// treating the product as the company merged 374 unrelated customers into one row
// called "Adsk" and pointed KYC at Adobe instead of the client.
//
// This exact file is mirrored at supabase/functions/_shared/dealName.ts so the
// ingest function and the UI preview produce identical results. If you change
// one, change the other.
// -----------------------------------------------------------------------------

/** A dash/pipe with whitespace on BOTH sides. Unambiguous; 93% of names use it. */
const STRICT_SEP = /\s+[-–—|]+\s+/;

/** The FIRST run of dashes, however it is spaced. Only used as a last resort, and
 *  only at the first occurrence — a later one is usually inside the customer's own
 *  name ("AIR-CONDITIONING", "Kyodo-Allied"). */
const FIRST_DASH = /^([^-–—|]*?)\s*[-–—|]+\s*(.+)$/;

/** A segment carrying one of these is a legal entity, i.e. the customer. */
const LEGAL_SUFFIX_RE =
  /\b(?:pte|pty|sdn|bhd|berhad|ltd|limited|llc|llp|inc|incorporated|corp|corporation|gmbh|plc|pvt|nv|bv)\b/i;

/** Government grant schemes prefixed to a product: "PSG TRENDMICRO", "PSG DROPBOX". */
const GRANT_PREFIX_RE = /^(?:psg|edg|sfec)\s+/i;

/** Trailing account/PO codes left outside brackets: "… PTE LTD AB014893", "… VRAY0596". */
const TRAILING_CODE_RE = /\s+[A-Z]{2,6}[-_]?\d{3,}\s*$/;

/** Filler after a product: "TENDER FOR MOUNT FABER LEISURE GROUP". */
const LEADING_FILLER_RE = /^(?:for|the\s+supply\s+of|supply\s+of|of)\s+/i;

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

/**
 * Vendors/services seen in this portal, so a FIRST-EVER import can already cut the
 * unpunctuated names before anything has been learned. learnProducts() grows this
 * from the user's own data.
 */
export const SEED_PRODUCTS = [
  'ADOBE',
  'ADSK',
  'AUTODESK',
  'AUTOCAD',
  'ACAD',
  'ACAD LT',
  'REVIT',
  'SKETCHUP',
  'VRAY',
  'BLUEBEAM',
  'BIBOX',
  'PROKON',
  'PRIMAVERA',
  'MICROSOFT',
  'MS',
  'DELL',
  'HP',
  'LENOVO',
  'APPLE',
  'ACER',
  'ASUS',
  'SAMSUNG',
  'LOGITECH',
  'EPSON',
  'BROTHER',
  'SYNOLOGY',
  'CISCO',
  'VEEAM',
  'DROPBOX',
  'KOFAX',
  'TRENDMICRO',
  'TREND MICRO',
  'FORTIGATE',
  'FORTINET',
  'STARHUB',
  'SINGTEL',
  'APC',
  'AEC',
  'MFG',
  'LT',
  // NOT a bare 'BIM': it would match "BIM SERVICE- Look Architects" one word short
  // and leave "SERVICE-" glued to the customer. Let the first-dash rule handle it.
  'BIM SERVICES',
  'IT SERVICES',
  'IT MAINTENANCE',
  'HARDWARE',
  'TRAINING',
  'TENDER',
  'SSOE2',
];

export interface DealNameParts {
  /** The brand/product the customer is buying. Not a company we sell to. */
  product: string;
  /** The customer segment exactly as written, including any account code. */
  company_raw: string;
  /** Canonical customer name — used for dedupe, display and KYC search. */
  company_clean: string;
}

/** Dictionary key: case, spaces and punctuation all ignored. "V-RAY" -> "VRAY". */
export function productKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

/**
 * Learn the vendor list from the deal names that ARE punctuated properly, so the
 * ones that are not can be cut at the right place.
 *
 * A candidate is rejected if it carries a legal suffix (that is a customer in a
 * reversed name, not a product) or if it appears only once (a one-off typo should
 * not become a rule).
 */
export function learnProducts(rawNames: Iterable<string>): Set<string> {
  const tally = new Map<string, number>();

  for (const raw of rawNames) {
    const segments = String(raw ?? '')
      .split(STRICT_SEP)
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length < 2) continue;

    const head = cleanCompanyName(segments[0]).replace(GRANT_PREFIX_RE, '');
    const key = productKey(head);
    if (!key || key.length > 24) continue;
    if (LEGAL_SUFFIX_RE.test(head)) continue;
    if (head.split(/\s+/).length > 3) continue;

    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  const learned = new Set(SEED_PRODUCTS.map(productKey));
  for (const [key, n] of tally) if (n >= 2) learned.add(key);
  return learned;
}

export function parseDealName(
  raw: string | null | undefined,
  known?: ReadonlySet<string>
): DealNameParts {
  const source = String(raw ?? '')
    .replace(/\s+/g, ' ') // tabs and doubled spaces are common in this data
    .trim();
  if (!source) return { product: '', company_raw: '', company_clean: '' };

  // 1. The unambiguous form: "PRODUCT - CUSTOMER".
  const strict = source.split(STRICT_SEP).map((s) => s.trim()).filter(Boolean);
  if (strict.length >= 2) return choose(strict);

  // 2. No clean separator. Anchor on a product we recognise and take what follows.
  //    This is the only thing that can cut "ADOBE (REN) (JUN'26) ST ENGINEERING…"
  //    (no dash at all) or "V-RAY (REN) … NTUC FAIRPRICE CO-OPERATIVE LTD".
  const anchored = known && known.size > 0 ? cutAtKnownProduct(source, known) : null;
  if (anchored) return anchored;

  // 3. Still nothing. Cut at the FIRST dash — never a later one, which is usually
  //    inside the customer's own name.
  const m = source.match(FIRST_DASH);
  if (m && m[1].trim() && m[2].trim()) return choose([m[1].trim(), m[2].trim()]);

  // 4. A bare company name: "PEOPLE'S ASSOCIATION".
  return { product: '', company_raw: source, company_clean: cleanCompanyName(source) };
}

/** The canonical company name for a deal. Kept for existing callers. */
export function cleanDealName(
  raw: string | null | undefined,
  known?: ReadonlySet<string>
): string {
  return parseDealName(raw, known).company_clean;
}

/** Decide which of two/three segments is the customer. */
function choose(segments: string[]): DealNameParts {
  // Segments that are pure bookkeeping ("March renewal", "Quote #1234", "MB LINE")
  // are not candidates.
  const candidates = segments
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => !isNoiseOnly(text));
  const pool = candidates.length > 0 ? candidates : [{ text: segments[0], index: 0 }];

  // A legal suffix (PTE LTD, LLC, GMBH…) is the strongest signal of the customer.
  // Where several segments carry one, the customer is the later — the vendor is
  // named first by convention.
  const legal = pool.filter(({ text }) => LEGAL_SUFFIX_RE.test(text));

  const chosen =
    legal.length > 0
      ? legal[legal.length - 1]
      : // No legal suffix anywhere: fall back to the convention itself, i.e. the
        // segment right after the product. Guard the case where that segment was
        // dropped as noise, which means there was no product prefix at all.
        (pool.find((p) => p.index === 1) ?? pool.find((p) => p.index > 0) ?? pool[0]);

  const tail = trimTrailingSku(chosen.text);
  return {
    product: chosen.index === 0 ? '' : cleanProduct(segments[0]),
    company_raw: tail,
    company_clean: cleanCompanyName(tail),
  };
}

/**
 * Find a known product at the START of the name and return everything after it.
 *
 * Matching is done on the punctuation-free key, so "TREND MICRO", "SKETCH UP" and
 * "V-RAY" all resolve. Up to three leading words are tried, longest first.
 *
 * Caveat, accepted deliberately: a customer whose name literally begins with a
 * vendor word ("APPLE CONSULTING PTE LTD") would be cut too. That has not appeared
 * in this portal, and the alternative — leaving 35+ names unparsed — is worse.
 */
function cutAtKnownProduct(source: string, known: ReadonlySet<string>): DealNameParts | null {
  const withoutGrant = source.replace(GRANT_PREFIX_RE, '');
  const words = withoutGrant.split(' ');

  for (let n = Math.min(3, words.length); n >= 1; n--) {
    const head = words.slice(0, n).join(' ');
    let rest = words.slice(n).join(' ');

    // Candidate keys for this head. The last one covers "ADOBE-CHRISTOPHER JAYAM",
    // where the product is glued to the customer by a dash.
    const heads: { text: string; rest: string }[] = [{ text: head, rest }];
    const dash = head.search(/[-–—/]/);
    if (dash > 0) {
      heads.push({
        text: head.slice(0, dash),
        rest: (head.slice(dash + 1) + ' ' + rest).trim(),
      });
    }

    for (const candidate of heads) {
      const key = productKey(candidate.text);
      if (!key || !known.has(key)) continue;

      rest = stripExtraProducts(
        candidate.rest.replace(/^[\s\-–—/|:,]+/, ''), // "-SM STUDIO", "/HP-ROBIN…"
        known
      )
        .replace(LEADING_FILLER_RE, '') // "TENDER FOR MOUNT FABER…"
        .trim();

      const company = cleanCompanyName(trimTrailingSku(rest));
      if (!company) continue; // the name was ONLY a product — leave it alone

      return {
        product: cleanProduct(candidate.text),
        company_raw: trimTrailingSku(rest),
        company_clean: company,
      };
    }
  }
  return null;
}

/**
 * Deals sometimes list two vendors: "LENOVO/HP-ROBIN VILLAGE INTERNATIONAL PTE LTD".
 * After the first is cut, keep eating further products — but only while each is
 * followed by a joining character, never on a bare space. Without that guard this
 * would happily eat a customer whose first word happens to be a vendor.
 */
function stripExtraProducts(rest: string, known: ReadonlySet<string>): string {
  for (let guard = 0; guard < 3; guard++) {
    const m = rest.match(/^([A-Za-z0-9.&]+)\s*([-–—/+,&])\s*/);
    if (!m) return rest;
    if (!known.has(productKey(m[1]))) return rest;
    rest = rest.slice(m[0].length);
  }
  return rest;
}

/**
 * Drop a trailing SKU/line-item glued to the customer with a dash — StarHub deals
 * do this: "Qool Labs Pte Ltd-MB LINE", "Passionair M&E Pte Ltd-MB*1".
 *
 * Only when the head is clearly the company (it carries a legal suffix) and the
 * tail is clearly not. That guard is what stops "TECHNIQUES AIR-CONDITIONING &
 * ENGINEERING PTE LTD" and "NTUC FAIRPRICE CO-OPERATIVE LTD" from being truncated.
 */
function trimTrailingSku(segment: string): string {
  const at = segment.lastIndexOf('-');
  if (at <= 0 || at === segment.length - 1) return segment;

  const head = segment.slice(0, at).trim();
  const tail = segment.slice(at + 1).trim();
  if (!head || !tail) return segment;
  if (!LEGAL_SUFFIX_RE.test(head)) return segment;
  if (LEGAL_SUFFIX_RE.test(tail)) return segment;
  if (tail.split(/\s+/).length > 3) return segment;

  return head;
}

/**
 * Tidy a name that is ALREADY known to be a company. Deliberately light: it strips
 * bracketed codes and normalises case, but does NOT strip words like "support" or
 * month names, which are safe to remove from a deal title yet destructive in a
 * company name ("May Design Pte Ltd", "Support Services Ltd").
 */
export function cleanCompanyName(raw: string | null | undefined): string {
  let s = String(raw ?? '');
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' '); // (AB005226), (REN), (MKTGLEAD), (JUN'26)
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(TRAILING_CODE_RE, ''); // "… PTE LTD AB014893"
  s = s.replace(/^[\s.,;:_/-]+/, '').replace(/[\s,;:_/-]+$/, '');
  return titleCase(s);
}

/**
 * Products keep their shouted casing — ADOBE, V-RAY, TREND MICRO. They are brand
 * tags, not prose, and title-casing them produced junk like "V-ray" and "Aec".
 */
function cleanProduct(raw: string): string {
  let s = String(raw).replace(GRANT_PREFIX_RE, '');
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' ');
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^[\s.,;:_/-]+/, '').replace(/[\s.,;:_/-]+$/, '');
  return s.toUpperCase();
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
        return i === 0
          ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          : upper.toLowerCase();
      }
      if (isAcronym(word, bare)) return word.toUpperCase();

      // Capitalise across hyphens too: "Penta-Ocean", "Air-Conditioning".
      return word
        .split('-')
        .map((part) =>
          part ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
        )
        .join('-');
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
