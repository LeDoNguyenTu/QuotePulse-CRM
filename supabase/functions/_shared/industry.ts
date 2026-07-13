// -----------------------------------------------------------------------------
// Industry classification from a company name.
//
// The industry filter used to be fed from the `industries` lookup table, so it
// offered ten industries while not one company had an industry set — every choice
// filtered to zero rows.
//
// Enriching 1,200 companies through the KYC search API would cost 1,200 lookups.
// It is not needed: Singapore trading names say what the company does out loud
// ("SUNLEY M&E ENGINEERING", "ROCKTREE LOGISTICS", "PAYA LEBAR METHODIST CHURCH",
// "ST. ANTHONY'S PRIMARY SCHOOL"). So the importer classifies from the name for
// free, and KYC overwrites it with a researched value when the user runs it.
//
// Order matters: the first rule that matches wins, so specific sectors come before
// generic ones ("CSTECH CONSULTANTS & ENGINEERING" is Engineering, not Professional
// Services). Anything unrecognised stays NULL — an empty cell is honest, a guessed
// one is not.
// -----------------------------------------------------------------------------

/** Must stay in step with the `industries` lookup table (migrations 0001 + 0006). */
const RULES: { industry: string; keywords: RegExp }[] = [
  {
    industry: 'Government',
    keywords:
      /\b(authority|statutory board|ministry|govern|municipal|town council|police|army|navy|defence|defense|customs|immigration|hdb|lta|ura|jtc|cpf)\b/i,
  },
  {
    industry: 'Education',
    keywords:
      /\b(school|primary|secondary|junior college|polytechnic|university|academy|institute|education|educational|learning|tuition|kindergarten|childcare|preschool|kumon)\b/i,
  },
  {
    industry: 'Non-profit',
    keywords:
      /\b(association|society|church|temple|mosque|methodist|catholic|charity|foundation|welfare|volunteer|ngo)\b/i,
  },
  {
    industry: 'Healthcare',
    keywords:
      /\b(clinic|medical|health|hospital|dental|dentist|surgery|pharma|pharmacy|nursing|physio|diagnostic|biomed|mechanobiology)\b/i,
  },
  { industry: 'Legal', keywords: /\b(law|legal|advocates|solicitors|llc law|chambers|notary)\b/i },
  {
    industry: 'Finance',
    keywords:
      /\b(bank|banking|capital|financial|finance|insurance|insurer|invest|securities|broker|brokers|brokerage|fund|asset management|credit|leasing)\b/i,
  },
  {
    industry: 'Energy & Marine',
    keywords:
      /\b(marine|maritime|offshore|shipyard|subsea|oilfield|petro|petroleum|\boil\b|\bgas\b|energy|solar|power systems|drilling)\b/i,
  },
  {
    industry: 'Logistics',
    keywords:
      /\b(logistic|logistics|shipping|freight|forwarding|transport|courier|cargo|warehouse|warehousing|supply chain|haulage)\b/i,
  },
  {
    industry: 'Construction',
    keywords:
      /\b(construction|builder|builders|building|contractor|contracts|piling|scaffold|renovation|civil|infrastructure|interior fit|reclamation)\b/i,
  },
  {
    industry: 'Engineering',
    keywords:
      /\b(engineering|engineers|m&e|mechanical|electrical|hydraulic|pneumatic|precision|machining|air-?conditioning|aircon|automation|instrumentation|technolog(?:y|ies) centre)\b/i,
  },
  {
    industry: 'Manufacturing',
    keywords:
      /\b(manufactur|remanufactur|industries|industrial|factory|fabrication|plastic|polymer|rubber|steel|metal|foundry|chemical|semiconductor|assembly|production)\b/i,
  },
  {
    industry: 'Media & Creative',
    keywords:
      /\b(media|advertis|marketing|creative|design|studio|studios|print|printing|photo|photography|publish|film|animation|architect|architects|\bpr\b|communications)\b/i,
  },
  {
    industry: 'Real Estate',
    keywords: /\b(propert|properties|realty|real estate|estate management|land development|reit)\b/i,
  },
  {
    industry: 'Hospitality',
    keywords:
      /\b(hotel|hotels|resort|hospitality|leisure|tourism|travel|club|lounge|spa|entertainment)\b/i,
  },
  {
    industry: 'Food & Beverage',
    keywords:
      /\b(food|foods|beverage|restaurant|catering|caterer|bakery|confectionery|coffee|cafe|kitchen|dairy|seafood|f&b)\b/i,
  },
  {
    industry: 'Retail',
    keywords:
      /\b(retail|shop|shoppers|store|stores|mart|supermarket|boutique|trading|traders|merchandis|wholesale|distribut)\b/i,
  },
  {
    industry: 'Technology',
    keywords:
      /\b(technolog|software|digital|systems|solutions|computer|cyber|\bdata\b|infocomm|info-?communications|telecom|network|networks|labs|\bit\b|robotics|semiconductors|electronics)\b/i,
  },
  {
    industry: 'Professional Services',
    keywords:
      /\b(consult|consultant|consultants|consulting|advisory|accounting|accountants|audit|surveyor|surveyors|recruit|staffing|management services|associates|partners|agency|services)\b/i,
  },
];

/**
 * Best-effort industry for a company name, or null when nothing matches.
 * Also used to normalise HubSpot's own industry enum ("COMPUTER_SOFTWARE").
 */
export function classifyIndustry(name: string | null | undefined): string | null {
  const text = String(name ?? '').replace(/[_]+/g, ' ');
  if (!text.trim()) return null;
  for (const rule of RULES) {
    if (rule.keywords.test(text)) return rule.industry;
  }
  return null;
}

/**
 * HubSpot's industry, mapped onto our vocabulary where it fits. When it does not,
 * HubSpot's own label is kept rather than discarded — the filter list is built from
 * whatever is actually in the data, so an unmapped value still works.
 */
export function normalizeHubspotIndustry(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const mapped = classifyIndustry(raw);
  if (mapped) return mapped;

  return raw
    .replace(/[_]+/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
