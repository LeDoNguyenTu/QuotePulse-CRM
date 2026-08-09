import { describe, expect, it } from 'vitest';
import { isPrivateNetworkAddress } from './publicNetwork';

describe('public network validation', () => {
  it('blocks private, loopback, link-local, carrier-grade NAT, and non-routable IPs', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.169.254',
      '172.16.0.1', '192.0.2.1', '192.168.1.1', '198.51.100.1', '203.0.113.1',
      '::', '::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'fc00::1', 'fd00::1', 'fe80::1',
    ]) {
      expect(isPrivateNetworkAddress(address), address).toBe(true);
    }
    expect(isPrivateNetworkAddress('8.8.8.8')).toBe(false);
    expect(isPrivateNetworkAddress('2606:4700:4700::1111')).toBe(false);
  });
});
