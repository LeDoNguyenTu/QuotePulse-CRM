import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { remainingArchiveBudget } from './archiveBudget.ts';

describe('global archive attempt budget', () => {
  it('gives attachment work only the budget left after deal attempts', () => {
    expect(remainingArchiveBudget(100, 40)).toBe(60);
    expect(remainingArchiveBudget(50, 50)).toBe(0);
    expect(remainingArchiveBudget(25, 30)).toBe(0);
  });

  it('bounds both attachment candidate and row fetches by the same remainder', () => {
    const source = readFileSync(new URL('../archive-hubspot-data/index.ts', import.meta.url), 'utf8');
    expect(source).toContain('const attachmentBudget = remainingArchiveBudget(limit, dealsAttempted)');
    expect(source.match(/p_limit: attachmentBudget/g)).toHaveLength(2);
    expect(source).toContain('attachmentsAttempted = (attachments ?? []).length');
    expect(source).toContain('const attempted = dealsAttempted + attachmentsAttempted');
    expect(source).toContain('const MAX_BATCH = 200');
  });
});
