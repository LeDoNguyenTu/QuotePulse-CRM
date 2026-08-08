import { describe, expect, it } from 'vitest';
import {
  portalAccessNotice,
  isSupportedJobSource,
  jobFingerprint,
  validSourceIdentifier,
} from './jobIntelligence';

describe('Job Intelligence helpers', () => {
  it('allows only supported public ATS connectors with safe identifiers', () => {
    expect(isSupportedJobSource('greenhouse')).toBe(true);
    expect(isSupportedJobSource('lever')).toBe(true);
    expect(isSupportedJobSource('linkedin')).toBe(false);
    expect(validSourceIdentifier('acme-careers')).toBe(true);
    expect(validSourceIdentifier('../private-board')).toBe(false);
  });

  it('generates a stable fingerprint for a discovered vacancy', () => {
    expect(jobFingerprint('greenhouse', 'acme-careers', '381')).toBe(
      'greenhouse:acme-careers:381'
    );
  });

  it('marks LinkedIn and MyCareersFuture as manual or authorisation-required', () => {
    expect(portalAccessNotice('linkedin')).toMatch(/manual/i);
    expect(portalAccessNotice('mycareersfuture')).toMatch(/authorisation/i);
  });
});
