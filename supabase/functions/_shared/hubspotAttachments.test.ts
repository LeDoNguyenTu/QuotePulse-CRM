import { describe, expect, test } from 'vitest';
import { isMissingAttachmentMetadata } from './hubspotAttachments';

describe('isMissingAttachmentMetadata', () => {
  test('identifies placeholder attachment names for a later Files-scope retry', () => {
    expect(isMissingAttachmentMetadata('file-123456')).toBe(true);
    expect(isMissingAttachmentMetadata('proposal.pdf')).toBe(false);
    expect(isMissingAttachmentMetadata('quote-123.pdf')).toBe(false);
  });
});
