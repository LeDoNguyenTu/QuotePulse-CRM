import { describe, expect, it } from 'vitest';
import {
  matchUploadedRow,
  normalizeEmail,
  normalizeName,
  validateUploadMapping,
  type UploadColumnMapping,
} from './uploadedFileMapping';

describe('uploaded file mapping', () => {
  it('rejects mapping columns that are absent from the uploaded file', () => {
    expect(validateUploadMapping({ email: 'Missing' }, ['Email Address']).error).toContain('Missing');
  });

  it('normalizes contact details consistently', () => {
    expect(normalizeEmail(' Person@Example.com ')).toBe('person@example.com');
    expect(normalizeName('  ACME—Pte. Ltd  ')).toBe('acme pte ltd');
  });

  it('prefers an exact email match before a company match', () => {
    const mapping: UploadColumnMapping = { email: 'Email', companyName: 'Company' };
    expect(matchUploadedRow(
      { Email: 'PERSON@example.com', Company: 'Acme' },
      mapping,
      { contacts: [{ id: 'contact-1', email: 'person@example.com', companyId: 'company-1' }], companies: [{ id: 'company-1', name: 'Acme' }] },
    )).toMatchObject({ status: 'matched', reason: 'email', targetType: 'contact', targetId: 'contact-1' });
  });
});
