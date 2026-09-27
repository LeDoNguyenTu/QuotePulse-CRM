import { useWorkspaces } from '../hooks/useWorkspaces';
import { WorkspaceSelectorView } from './WorkspaceSelectorView';

export function WorkspaceSelector() {
  const { workspaces, isLoading, error, refetch } = useWorkspaces();
  return (
    <WorkspaceSelectorView
      workspaces={workspaces}
      isLoading={isLoading}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}
