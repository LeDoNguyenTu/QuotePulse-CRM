import { describe, expect, test } from 'vitest';
import { shouldShowImportReport } from './importReport';

describe('shouldShowImportReport', () => {
  test('hides an in-progress slice report so it is not labelled paused', () => {
    expect(shouldShowImportReport('running', true)).toBe(false);
    expect(shouldShowImportReport('paused', true)).toBe(true);
    expect(shouldShowImportReport('complete', true)).toBe(true);
  });
});
