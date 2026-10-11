import { describe, expect, it } from 'vitest';
import { brevoQueueBlockReason, usageLevel } from './providerUsage';

describe('provider usage presentation', () => {
  it('uses the agreed warning thresholds and keeps unknown values unknown', () => {
    expect(usageLevel(null, 100)).toBe('unknown');
    expect(usageLevel(79, 100)).toBe('normal');
    expect(usageLevel(80, 100)).toBe('warning');
    expect(usageLevel(95, 100)).toBe('critical');
    expect(usageLevel(100, 100)).toBe('exhausted');
  });

  it('blocks Brevo queueing only for a fresh definitive unhealthy check', () => {
    expect(brevoQueueBlockReason({ status: 'unhealthy', checkedAt: new Date().toISOString(), message: 'Brevo blocked this sending server IP.' })).toContain('Brevo blocked');
    expect(brevoQueueBlockReason({ status: 'unknown', checkedAt: new Date().toISOString() })).toBeNull();
    expect(brevoQueueBlockReason({ status: 'unhealthy', checkedAt: '2020-01-01T00:00:00Z', message: 'old' })).toBeNull();
  });
});
