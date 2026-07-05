// MIRROR of src/lib/dealName.ts — keep both in sync. Deno/edge copy so the
// ingest function cleans names identically to the UI preview.

const NOISE_WORDS = [
  'renewal', 'renew', 'quote', 'invoice', 'proposal', 'opportunity', 'deal',
  'new business', 'upsell', 'cross-sell', 'contract', 'subscription', 'support',
  'maintenance', 'agreement', 'order', 'po',
];

const MONTHS = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';

export function cleanDealName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = String(raw);

  s = s.replace(/[[({][^\])}]*[\])}]/g, ' ');
  s = s.replace(/\b(?:quote|q|ref|reference|inv|invoice|po|order)[\s#:.-]*\d+\b/gi, ' ');
  s = s.replace(/#\s*\d+/g, ' ');
  s = s.replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ');
  s = s.replace(/\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, ' ');
  s = s.replace(new RegExp(`\\b\\d{0,2}\\s*${MONTHS}\\.?\\s*'?\\d{2,4}\\b`, 'gi'), ' ');
  s = s.replace(new RegExp(`\\b${MONTHS}\\b`, 'gi'), ' ');
  s = s.replace(/\b(?:19|20)\d{2}\b/g, ' ');

  const noise = new RegExp(`\\b(?:${NOISE_WORDS.join('|')})\\b`, 'gi');
  s = s.replace(noise, ' ');

  s = s.replace(/[|/–—:]+/g, ' ');
  s = s.replace(/\s-\s.*$/, ' ');
  s = s.replace(/[\s.,;_-]+$/g, '');
  s = s.replace(/^[\s.,;_-]+/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();

  return titleCase(s);
}

const KEEP_UPPER = new Set([
  'LLC', 'LLP', 'LTD', 'PTY', 'INC', 'PLC', 'GMBH', 'AG', 'NV', 'BV', 'SA',
  'IT', 'AI', 'HR', 'UK', 'USA', 'US', 'AU',
]);

function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^a-z0-9]/gi, '');
      if (bare && KEEP_UPPER.has(bare.toUpperCase())) return bare.toUpperCase();
      if (word.length <= 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ')
    .trim();
}
