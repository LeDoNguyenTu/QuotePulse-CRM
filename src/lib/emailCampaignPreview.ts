export interface CampaignContent {
  subject: string;
  bodyHtml: string | null;
  bodyText: string;
}

export interface CampaignPreviewRecipient {
  contact_name: string | null;
  company_name: string | null;
  industry: string | null;
}

const TOKEN = /\{\{\s*(\w+)\s*\}\}/g;

function render(value: string, recipient: CampaignPreviewRecipient, unresolved: Set<string>) {
  return value.replace(TOKEN, (_match, key: string) => {
    const replacement = recipient[key as keyof CampaignPreviewRecipient];
    if (typeof replacement === 'string' && replacement.length) return replacement;
    unresolved.add(key);
    return `{{${key}}}`;
  });
}

export function renderCampaignPreview(content: CampaignContent, recipient: CampaignPreviewRecipient) {
  const unresolved = new Set<string>();
  return {
    subject: render(content.subject, recipient, unresolved),
    bodyHtml: content.bodyHtml === null ? null : render(content.bodyHtml, recipient, unresolved),
    bodyText: render(content.bodyText, recipient, unresolved),
    unresolvedTokens: [...unresolved].sort(),
  };
}

export function findUnresolvedCampaignTokens(content: CampaignContent, recipients: CampaignPreviewRecipient[]) {
  const unresolved = new Set<string>();
  for (const recipient of recipients) {
    for (const token of renderCampaignPreview(content, recipient).unresolvedTokens) unresolved.add(token);
  }
  return [...unresolved].sort();
}
