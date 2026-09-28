import type { WorkspaceRole } from '../workspaces';

export function canDeleteCrmRecords(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}
