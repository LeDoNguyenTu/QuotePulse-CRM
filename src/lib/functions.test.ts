import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    functions: { invoke },
  },
}));

import { functions } from './functions';

describe('company attachment function wrapper', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { attachments: [] }, error: null });
  });

  it('loads company attachments through the authenticated archive-aware endpoint', async () => {
    await functions.companyAttachments('company-id');
    expect(invoke).toHaveBeenCalledWith('company-attachments', expect.objectContaining({
      body: { company_id: 'company-id' },
    }));
  });

  it('loads archived deal properties through the authenticated endpoint', async () => {
    invoke.mockResolvedValue({ data: { properties: { 'deal-id': { custom: 'value' } } }, error: null });
    await functions.dealArchiveProperties(['deal-id']);
    expect(invoke).toHaveBeenCalledWith('deal-archive-properties', expect.objectContaining({
      body: { deal_ids: ['deal-id'] },
    }));
  });
});
