import { describe, expect, it } from 'vitest';
import { formatErrorSummary, normalizeError } from './error';

describe('normalizeError', () => {
  it('uses structured PostgREST fields without leaking secrets', () => {
    expect(
      normalizeError({
        message: 'column company_dashboard.last_deal_at does not exist',
        code: '42703',
        details: 'schema cache is stale',
        hint: 'apply migration 0007',
        status: 400,
        authorization: 'Bearer secret-token',
      })
    ).toMatchObject({
      message: 'column company_dashboard.last_deal_at does not exist',
      code: '42703',
      details: 'schema cache is stale',
      hint: 'apply migration 0007',
      status: 400,
    });
  });

  it('handles native errors, strings, nulls, and unknown objects without object coercion', () => {
    expect(normalizeError(new Error('network failed')).message).toBe('network failed');
    expect(normalizeError('timeout').message).toBe('timeout');
    expect(normalizeError(null).message).not.toBe('[object Object]');
    expect(normalizeError({ unexpected: true }).message).not.toBe('[object Object]');
  });

  it('keeps structured database diagnostics when an error must be stored as text', () => {
    expect(formatErrorSummary({
      message: 'statement was cancelled',
      code: '57014',
      details: 'statement timeout',
      hint: 'retry with a smaller batch',
    })).toBe('statement was cancelled (code 57014) Details: statement timeout Hint: retry with a smaller batch');
  });
});
