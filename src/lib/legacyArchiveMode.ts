import type { WorkspaceArchive } from '../hooks/useWorkspaceArchive';

export type LegacyDataMode = 'live' | 'archived';

export function resolveLegacyDataMode(input: {
  current: LegacyDataMode;
  userSelected: boolean;
  liveCount: number;
  liveCountResolved: boolean;
  archiveStatus?: WorkspaceArchive['status'];
}): LegacyDataMode {
  if (input.userSelected || !input.archiveStatus) return input.current;
  if (input.archiveStatus === 'deleted') return 'archived';
  if (input.liveCountResolved && input.liveCount === 0) return 'archived';
  return input.current;
}
