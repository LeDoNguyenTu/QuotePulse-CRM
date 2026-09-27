import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceMemberships, workspaceLandingPath } from './workspaces';

describe('workspace domain', () => {
  it('builds the landing route for each workspace kind', () => {
    expect(workspaceLandingPath({ id: 'legacy-id', kind: 'legacy' })).toBe(
      '/w/legacy-id/legacy',
    );
    expect(workspaceLandingPath({ id: 'sales-id', kind: 'sales_crm' })).toBe(
      '/w/sales-id/sales',
    );
  });

  it('normalizes the membership projection returned by Supabase', () => {
    expect(
      normalizeWorkspaceMemberships([
        {
          role: 'owner',
          workspaces: {
            id: 'a',
            name: 'Sales CRM',
            kind: 'sales_crm',
          },
        },
      ]),
    ).toEqual([
      { id: 'a', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' },
    ]);
  });

  it('drops missing and malformed joined workspaces', () => {
    expect(
      normalizeWorkspaceMemberships([
        { role: 'owner', workspaces: null },
        {
          role: 'owner',
          workspaces: { id: '', name: 'Bad', kind: 'legacy' },
        },
        {
          role: 'superuser',
          workspaces: { id: 'b', name: 'Bad role', kind: 'legacy' },
        },
        {
          role: 'member',
          workspaces: { id: 'c', name: 'Valid', kind: 'legacy' },
        },
      ]),
    ).toEqual([{ id: 'c', name: 'Valid', kind: 'legacy', role: 'member' }]);
  });
});
