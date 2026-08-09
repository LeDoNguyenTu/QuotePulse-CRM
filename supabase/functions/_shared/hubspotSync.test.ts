import { describe, expect, it } from 'vitest';
import { canAdvanceIncrementalWatermark, pageFullyProcessed } from './hubspotSync';

describe('HubSpot sync cursor guards', () => {
  it('does not advance an incremental watermark when any object failed', () => {
    expect(canAdvanceIncrementalWatermark(0)).toBe(true);
    expect(canAdvanceIncrementalWatermark(1)).toBe(false);
  });

  it('does not advance a page cursor after a budget stop inside the page', () => {
    expect(pageFullyProcessed(100, 100)).toBe(true);
    expect(pageFullyProcessed(73, 100)).toBe(false);
  });
});
