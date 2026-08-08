export type SupportedJobSource = 'greenhouse' | 'lever';

const SOURCE_IDENTIFIER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export function isSupportedJobSource(value: string): value is SupportedJobSource {
  return value === 'greenhouse' || value === 'lever';
}

export function validSourceIdentifier(value: string): boolean {
  return SOURCE_IDENTIFIER_RE.test(value.trim());
}

export function jobFingerprint(
  provider: SupportedJobSource,
  identifier: string,
  externalId: string
): string {
  return `${provider}:${identifier.trim().toLowerCase()}:${externalId}`;
}

export function portalAccessNotice(portal: 'linkedin' | 'mycareersfuture'): string {
  return portal === 'linkedin'
    ? 'Manual LinkedIn verification required. This CRM does not scrape or automate LinkedIn.'
    : 'MyCareersFuture requires formal authorisation before it can be connected.';
}
