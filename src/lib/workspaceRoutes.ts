import type { Workspace } from './workspaces';

export type WorkspaceArea = 'legacy' | 'sales';

export type WorkspaceRouteResolution =
  | { status: 'allowed'; workspace: Workspace }
  | { status: 'inaccessible' };

export function resolveWorkspaceRoute(
  workspaces: Workspace[],
  workspaceId: string | undefined,
  area: WorkspaceArea,
): WorkspaceRouteResolution {
  if (!workspaceId) return { status: 'inaccessible' };

  const workspace = workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) return { status: 'inaccessible' };

  const expectedKind = area === 'legacy' ? 'legacy' : 'sales_crm';
  if (workspace.kind !== expectedKind) return { status: 'inaccessible' };

  return { status: 'allowed', workspace };
}
