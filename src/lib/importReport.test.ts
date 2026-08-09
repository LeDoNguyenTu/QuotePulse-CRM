import { describe, expect, test } from 'vitest';
import { importCompletionPercent, shouldShowImportReport } from './importReport';

describe('shouldShowImportReport', () => {
  test('hides an in-progress slice report so it is not labelled paused', () => {
    expect(shouldShowImportReport('running', true)).toBe(false);
    expect(shouldShowImportReport('paused', true)).toBe(true);
    expect(shouldShowImportReport('complete', true)).toBe(true);
  });

  test('reports 100 percent only after HubSpot confirms the sync is complete', () => {
    expect(importCompletionPercent(false)).toBeNull();
    expect(importCompletionPercent(true)).toBe(100);
  });
});
