import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubSpotClient } from './hubspot';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HubSpot incremental search', () => {
  it('requests the newest modified deals first', async () => {
    let requestBody: unknown;
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const client = await HubSpotClient.connect('pat-test-token');
    await client.searchModifiedSince('deals', '2026-08-26T00:00:00.000Z', ['dealname']);

    expect(requestBody).toMatchObject({
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: 100,
    });
  });

  it('can fetch an archived deal for the recycled retry queue', async () => {
    let requestedUrl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ id: '123', properties: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const client = await HubSpotClient.connect('pat-test-token');
    await client.getOne('deals', '123', [], [], true);

    expect(new URL(requestedUrl).searchParams.get('archived')).toBe('true');
  });
});
