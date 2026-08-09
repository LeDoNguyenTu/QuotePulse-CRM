function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
}

export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length);
    if (parseIpv4(mappedIpv4)) return isPrivateNetworkAddress(mappedIpv4);
    // IPv4-mapped IPv6 may use hexadecimal groups (for example ::ffff:7f00:1).
    // DNS should not need to return mapped addresses, so reject the whole range.
    return true;
  }
  const ipv4 = parseIpv4(normalized);

  if (ipv4) {
    const [a, b] = ipv4;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51)
      || (a === 203 && b === 0)
      || a >= 224;
  }

  if (!normalized.includes(':')) return true;

  return normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
    || normalized.startsWith('ff')
    || normalized.startsWith('2001:db8:')
    || normalized.startsWith('::ffff:0:');
}
