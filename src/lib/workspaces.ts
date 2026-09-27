export type WorkspaceKind = 'legacy' | 'sales_crm';
export type WorkspaceRole = 'owner' | 'admin' | 'member';

export interface Workspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
  role: WorkspaceRole;
}

type WorkspaceMembershipRow = {
  role?: unknown;
  workspaces?: unknown;
};

function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return value === 'legacy' || value === 'sales_crm';
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return value === 'owner' || value === 'admin' || value === 'member';
}

export function normalizeWorkspaceMemberships(rows: unknown): Workspace[] {
  if (!Array.isArray(rows)) return [];

  return rows.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const membership = candidate as WorkspaceMembershipRow;
    if (!isWorkspaceRole(membership.role)) return [];
    if (!membership.workspaces || typeof membership.workspaces !== 'object') return [];

    const workspace = membership.workspaces as Record<string, unknown>;
    if (
      typeof workspace.id !== 'string' ||
      workspace.id.length === 0 ||
      typeof workspace.name !== 'string' ||
      workspace.name.trim().length === 0 ||
      !isWorkspaceKind(workspace.kind)
    ) {
      return [];
    }

    return [{
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      role: membership.role,
    }];
  });
}

export function workspaceLandingPath(
  workspace: Pick<Workspace, 'id' | 'kind'>,
): string {
  const area = workspace.kind === 'legacy' ? 'legacy' : 'sales';
  return `/w/${encodeURIComponent(workspace.id)}/${area}`;
}
