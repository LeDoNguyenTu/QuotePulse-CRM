import { describe, expect, it } from 'vitest';
import { nullableHubspotTimestamp } from './hubspotTimestamps.ts';

describe('nullableHubspotTimestamp', () => {
  it.each([undefined, null, '', '   ', 'not-a-date'])('normalizes %j to null', (value) => {
    expect(nullableHubspotTimestamp(value)).toBeNull();
  });

  it('keeps a valid HubSpot ISO timestamp', () => {
    expect(nullableHubspotTimestamp('2026-08-09T10:11:12.345Z')).toBe(
      '2026-08-09T10:11:12.345Z'
    );
  });

  it('normalizes numeric HubSpot timestamps to ISO strings', () => {
    expect(nullableHubspotTimestamp('1786269600000')).toBe('2026-08-09T10:00:00.000Z');
  });
});

