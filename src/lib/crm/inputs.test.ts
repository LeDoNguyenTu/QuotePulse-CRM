import { describe, expect, it } from 'vitest';
import {
  normalizeCompanyInput,
  normalizeContactInput,
  normalizeDealInput,
  normalizeDomain,
  normalizeWebsiteUrl,
} from './inputs';

describe('CRM input normalization', () => {
  it('normalizes company fields and domains', () => {
    expect(normalizeDomain(' HTTPS://WWW.Example.com/about ')).toBe('example.com');
    expect(normalizeCompanyInput({
      name: '  Acme Pte Ltd  ',
      industry: '  Software ',
      website: ' ',
      domain: 'www.ACME.test/path',
      phone: '',
      address_line_1: ' 1 Main Street ',
      address_line_2: '',
      city: ' Singapore ',
      state_region: '',
      postal_code: ' 123456 ',
      country: ' SG ',
    })).toEqual({
      ok: true,
      value: {
        name: 'Acme Pte Ltd',
        industry: 'Software',
        website: null,
        domain: 'acme.test',
        phone: null,
        address_line_1: '1 Main Street',
        address_line_2: null,
        city: 'Singapore',
        state_region: null,
        postal_code: '123456',
        country: 'SG',
      },
    });
  });

  it('allows only HTTP website links and normalizes bare domains', () => {
    expect(normalizeWebsiteUrl('example.com/about')).toBe('https://example.com/about');
    expect(normalizeWebsiteUrl('example.com:8443/about')).toBe('https://example.com:8443/about');
    expect(normalizeWebsiteUrl('localhost:3000')).toBe('https://localhost:3000/');
    expect(normalizeWebsiteUrl(' HTTP://Example.com ')).toBe('http://example.com/');
    expect(normalizeWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeWebsiteUrl('data:text/html,unsafe')).toBeNull();
    expect(normalizeCompanyInput({ name: 'Acme', website: 'javascript:alert(1)' })).toEqual({
      ok: false,
      error: 'Company website must use http or https.',
    });
  });

  it('requires a company name and a usable contact identity', () => {
    expect(normalizeCompanyInput({ name: '  ' })).toEqual({
      ok: false,
      error: 'Company name is required.',
    });
    expect(normalizeContactInput({ first_name: '', last_name: '', full_name: '', email: '' })).toEqual({
      ok: false,
      error: 'Add a contact name or email address.',
    });
  });

  it('normalizes contact email and optional fields', () => {
    expect(normalizeContactInput({
      company_id: '',
      first_name: ' Ada ',
      last_name: ' Lovelace ',
      full_name: '',
      email: ' ADA@EXAMPLE.COM ',
      phone: '',
      job_title: ' Founder ',
    })).toEqual({
      ok: true,
      value: {
        company_id: null,
        first_name: 'Ada',
        last_name: 'Lovelace',
        full_name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: null,
        job_title: 'Founder',
      },
    });
  });

  it('preserves valid contact lifecycle edits without allowing invalid states', () => {
    expect(normalizeContactInput({
      full_name: ' Ada ',
      record_state: 'verified',
      is_hidden: true,
      duplicate_review_of: '',
    })).toMatchObject({
      ok: true,
      value: { record_state: 'verified', is_hidden: true, duplicate_review_of: null },
    });
    expect(normalizeContactInput({ full_name: 'Ada', record_state: 'invalid' as never })).toEqual({
      ok: false,
      error: 'Choose a valid contact state.',
    });
  });

  it('validates amount and normalizes deal currency', () => {
    expect(normalizeDealInput({ name: ' Renewal ', stage: ' Proposal ', amount: '-1' })).toEqual({
      ok: false,
      error: 'Deal amount cannot be negative.',
    });
    expect(normalizeDealInput({
      name: ' Renewal ',
      company_id: '',
      stage: ' Proposal ',
      amount: '1200.50',
      currency: 'sgd',
      status: 'open',
      owner_user_id: '',
      last_call_at: '',
      follow_up_at: '',
    })).toEqual({
      ok: true,
      value: {
        name: 'Renewal',
        company_id: null,
        stage: 'Proposal',
        amount: 1200.5,
        currency: 'SGD',
        status: 'open',
        owner_user_id: null,
        last_call_at: null,
        follow_up_at: null,
      },
    });
  });
});
