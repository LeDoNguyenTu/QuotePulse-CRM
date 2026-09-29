import { describe, expect, it } from 'vitest';
import { neutralizeSpreadsheetFormula, neutralizeSpreadsheetRow } from './spreadsheetSafety';

describe('spreadsheet export safety', () => {
  it.each(['=HYPERLINK("https://evil.test")', '+cmd', '-cmd', '@SUM(A1:A2)', ' \t=1+1'])(
    'neutralizes formula-like text %s',
    (value) => expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`),
  );

  it('preserves ordinary text, numbers, booleans, and null', () => {
    expect(neutralizeSpreadsheetFormula('Acme Pte Ltd')).toBe('Acme Pte Ltd');
    expect(neutralizeSpreadsheetFormula(42)).toBe(42);
    expect(neutralizeSpreadsheetFormula(false)).toBe(false);
    expect(neutralizeSpreadsheetFormula(null)).toBeNull();
  });

  it('sanitizes every exported field without mutating the source row', () => {
    const row = { name: '=1+1', amount: 15 };
    expect(neutralizeSpreadsheetRow(row)).toEqual({ name: "'=1+1", amount: 15 });
    expect(row.name).toBe('=1+1');
  });
});
