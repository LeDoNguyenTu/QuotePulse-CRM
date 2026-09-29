/** Prevent spreadsheet applications from interpreting exported user text as a formula. */
export function neutralizeSpreadsheetFormula(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  let offset = 0;
  while (offset < value.length && value.charCodeAt(offset) <= 0x20) offset += 1;
  return '=+-@'.includes(value[offset] ?? '') ? `'${value}` : value;
}

export function neutralizeSpreadsheetRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, neutralizeSpreadsheetFormula(value)]),
  );
}
