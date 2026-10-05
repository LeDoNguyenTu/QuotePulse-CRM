import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('CRM source row reader', () => {
  it('requires authentication, membership, and a scoped verified pointer', () => {
    expect(source).toContain('getUserId(req)');
    expect(source).toContain('workspace_members');
    expect(source).toContain('assertWorkbookRowIndexPointer');
    expect(source).toContain('verifyArchivePayload');
    expect(source).toContain('latest_revision_id');
    expect(source).toContain('source-row-index.v2');
  });

  it('bounds row and header requests before reading source cells', () => {
    expect(source).toContain('MAX_REQUESTED_ROWS');
    expect(source).toContain('MAX_REQUESTED_HEADERS');
    expect(source).toContain('source-row-index.v1');
  });
});
