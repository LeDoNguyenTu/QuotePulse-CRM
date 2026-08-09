import { describe, expect, test } from 'vitest';
import { formatHubspotError } from './hubspotErrors';

describe('formatHubspotError', () => {
  test('preserves a structured HubSpot error instead of rendering object Object', () => {
    expect(formatHubspotError({ status: 'error', message: 'Property is invalid' })).toBe(
      '{"status":"error","message":"Property is invalid"}'
    );
  });
});
