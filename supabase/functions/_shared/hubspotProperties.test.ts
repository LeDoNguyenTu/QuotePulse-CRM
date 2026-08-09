import { describe, expect, it } from 'vitest';
import {
  chunkPropertyNames,
  filterPropertyBackfillCandidates,
  mergeHubspotProperties,
  propertyBackfillStream,
  propertyCataloguesComplete,
  propertyCoverageStream,
  propertyNamesWithValues,
  syncCompletedRecently,
} from './hubspotProperties';

describe('HubSpot property helpers', () => {
  it('splits a property list without dropping or duplicating names', () => {
    const properties = ['dealname', 'amount', 'custom_alpha', 'custom_beta'];
    expect(chunkPropertyNames(properties, 18)).toEqual([
      ['dealname', 'amount'],
      ['custom_alpha'],
      ['custom_beta'],
    ]);
  });

  it('merges property responses while retaining existing values', () => {
    expect(mergeHubspotProperties({ dealname: 'Renewal' }, { amount: '1200' })).toEqual({
      dealname: 'Renewal',
      amount: '1200',
    });
  });

  it('reports only property names with a meaningful imported value', () => {
    expect(propertyNamesWithValues([
      { id: '1', properties: { amount: '1200', blank: ' ', missing: null } },
      { id: '2', properties: { amount: '', custom_region: 'Singapore', missing: 'null' } },
    ])).toEqual(['amount', 'custom_region']);
  });

  it('uses a new resumable stream whenever the readable schema changes', () => {
    expect(propertyBackfillStream('deals', 'v1234')).toBe('deals:properties:v1234');
    expect(propertyBackfillStream('deals', 'v5678')).not.toBe(propertyBackfillStream('deals', 'v1234'));
  });

  it('uses an independent one-time stream to discover values already stored locally', () => {
    expect(propertyCoverageStream('companies')).toBe('companies:coverage:v1');
    expect(propertyCoverageStream('contacts')).toBe('contacts:coverage:v1');
  });

  it('does not authorize a sync when any property catalogue failed to load', () => {
    expect(propertyCataloguesComplete({ deals: true, companies: true, contacts: true })).toBe(true);
    expect(propertyCataloguesComplete({ deals: true, companies: false, contacts: true })).toBe(false);
  });

  it('carries archive completion across adjacent resumable invocations only', () => {
    const now = Date.parse('2026-08-09T12:00:00.000Z');
    expect(syncCompletedRecently('2026-08-09T11:59:30.000Z', now, 120_000)).toBe(true);
    expect(syncCompletedRecently('2026-08-09T11:55:00.000Z', now, 120_000)).toBe(false);
    expect(syncCompletedRecently(null, now, 120_000)).toBe(false);
  });

  it('backfills only held deals whose snapshot schema is missing or stale', () => {
    const deals = [
      { id: 'current', properties: {} },
      { id: 'missing', properties: {} },
      { id: 'stale', properties: {} },
      { id: 'not-imported', properties: {} },
    ];
    const heldVersions = new Map<string, string | null>([
      ['current', 'v2'],
      ['missing', null],
      ['stale', 'v1'],
    ]);

    expect(filterPropertyBackfillCandidates(deals, heldVersions, 'v2').map((deal) => deal.id))
      .toEqual(['missing', 'stale']);
  });

  it('repairs every held snapshot during a schema stream first pass', () => {
    const deals = [
      { id: 'current', properties: {} },
      { id: 'stale', properties: {} },
      { id: 'not-imported', properties: {} },
    ];
    const heldVersions = new Map<string, string | null>([
      ['current', 'v2'],
      ['stale', 'v1'],
    ]);

    expect(filterPropertyBackfillCandidates(deals, heldVersions, 'v2', true).map((deal) => deal.id))
      .toEqual(['current', 'stale']);
  });
});
