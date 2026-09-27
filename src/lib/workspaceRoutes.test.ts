import { describe, expect, it } from 'vitest';
import { resolveWorkspaceRoute } from './workspaceRoutes';
import type { Workspace } from './workspaces';

const workspaces: Workspace[] = [
  { id: 'legacy-id', name: 'QuotePulse Legacy', kind: 'legacy', role: 'owner' },
  { id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' },
];

describe('workspace route authorization', () => {
  it('allows a member into the matching workspace area', () => {
    expect(resolveWorkspaceRoute(workspaces, 'legacy-id', 'legacy')).toEqual({
      status: 'allowed',
      workspace: workspaces[0],
    });
    expect(resolveWorkspaceRoute(workspaces, 'sales-id', 'sales')).toEqual({
      status: 'allowed',
      workspace: workspaces[1],
    });
  });

  it('does not reveal whether an unknown workspace exists', () => {
    expect(resolveWorkspaceRoute(workspaces, 'other-user-id', 'sales')).toEqual({
      status: 'inaccessible',
    });
    expect(resolveWorkspaceRoute(workspaces, undefined, 'sales')).toEqual({
      status: 'inaccessible',
    });
  });

  it('rejects workspace and route-area mismatches', () => {
    expect(resolveWorkspaceRoute(workspaces, 'legacy-id', 'sales')).toEqual({
      status: 'inaccessible',
    });
    expect(resolveWorkspaceRoute(workspaces, 'sales-id', 'legacy')).toEqual({
      status: 'inaccessible',
    });
  });
});
