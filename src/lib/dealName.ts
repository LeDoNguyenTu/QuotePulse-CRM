// -----------------------------------------------------------------------------
// Deal-name cleaning pipeline.
// Turns a messy HubSpot `dealname` into a canonical company name.
//
// This exact file is mirrored at supabase/functions/_shared/dealName.ts so the
// ingest function and the UI preview produce identical results. If you change
// one, change the other.
// -----------------------------------------------------------------------------

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

const MONTHS =
  '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

/** Each step is applied in order; keep them small and testable. */
export function cleanDealName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw);

  // 1. Remove bracketed / parenthetical / braced segments: "Acme (Renewal)" -> "Acme"
  s = s.replace(/[[({][^\])}]*[\])}]/g, ' ');

  // 2. Remove quote / reference numbers: "Quote #1234", "Q-1234", "Ref: 88".
  s = s.replace(/\b(?:quote|q|ref|reference|inv|invoice|po|order)[\s#:.-]*\d+\b/gi, ' ');
  s = s.replace(/#\s*\d+/g, ' ');

  // 3. Remove trailing/standalone dates in common formats.
  //    2024-01-31, 31/01/2024, 01.31.24, "Jan 2024", "31 Jan 2024".
  s = s.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ');
  s = s.replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ');
  s = s.replace(new RegExp(`\\b\\d{0,2}\\s*${MONTHS}\\.?\\s*'?\\d{2,4}\\b`, 'gi'), ' ');
  s = s.replace(new RegExp(`\\b${MONTHS}\\b`, 'gi'), ' ');
  s = s.replace(/\b(?:19|20)\d{2}\b/g, ' '); // bare year

  // 4. Remove noise descriptor words anywhere as whole words.
  const noise = new RegExp(`\\b(?:${NOISE_WORDS.join('|')})\\b`, 'gi');
  s = s.replace(noise, ' ');

  // 5. Drop everything after a strong separator if it left a trailing fragment.
  //    "Acme Pty Ltd - March renewal" already stripped -> tidy leftover dashes.
  s = s.replace(/[|/–—:]+/g, ' ');
  s = s.replace(/\s-\s.*$/, ' '); // "Acme - leftover" -> "Acme"

  // 6. Collapse whitespace and stray punctuation at the ends.
  s = s.replace(/[\s.,;_-]+$/g, '');
  s = s.replace(/^[\s.,;_-]+/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();

  // 7. Title-case, but keep common company suffixes uppercased.
  s = titleCase(s);

  return s;
}

const KEEP_UPPER = new Set([
  'LLC',
  'LLP',
  'LTD',
  'PTY',
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

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^a-z0-9]/gi, '');
      if (bare && KEEP_UPPER.has(bare.toUpperCase())) return bare.toUpperCase();
      if (word.length <= 1) return word.toUpperCase();
      // Preserve intentional internal capitals like "McDonald" only loosely;
      // default to Titlecase for the common messy-CRM case.
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}
