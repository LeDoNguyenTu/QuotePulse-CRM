import { describe, expect, it } from 'vitest';
import { appendHtmlUnsubscribe } from './emailContent';

describe('appendHtmlUnsubscribe', () => {
  it('adds the footer once across automatic retry snapshots', () => {
    const first = appendHtmlUnsubscribe('<p>Hello</p>', 'https://example.test/unsubscribe?token=abc');
    const retry = appendHtmlUnsubscribe(first, 'https://example.test/unsubscribe?token=abc');
    expect(retry).toBe(first);
    expect(retry.match(/data-quotepulse-unsubscribe/g)).toHaveLength(1);
  });
});
