export interface PersonalizationField {
  key: 'contact_name' | 'company_name' | 'industry';
  label: string;
  token: string;
  example: string;
}

export const PERSONALIZATION_FIELDS: readonly PersonalizationField[] = [
  { key: 'contact_name', label: 'Recipient name', token: '{{contact_name}}', example: 'Jordan Lee' },
  { key: 'company_name', label: 'Company name', token: '{{company_name}}', example: 'Acme Industries' },
  { key: 'industry', label: 'Industry', token: '{{industry}}', example: 'Manufacturing' },
];

const TOKEN = /\{\{\s*(\w+)\s*\}\}/g;

function personalizationKeys(value: string | null | undefined) {
  const keys = new Set<string>();
  for (const match of value?.matchAll(TOKEN) ?? []) {
    keys.add(match[1] === 'customer' ? 'contact_name' : match[1]);
  }
  return keys;
}

export function findMissingHtmlPersonalization(bodyText: string, bodyHtml: string | null) {
  if (!bodyHtml) return [];
  const textKeys = personalizationKeys(bodyText);
  const htmlKeys = personalizationKeys(bodyHtml);
  return PERSONALIZATION_FIELDS.filter((field) => textKeys.has(field.key) && !htmlKeys.has(field.key));
}
