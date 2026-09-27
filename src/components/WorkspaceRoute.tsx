import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspaces, ActiveWorkspaceProvider } from '../hooks/useWorkspaces';
import { resolveWorkspaceRoute, type WorkspaceArea } from '../lib/workspaceRoutes';
import { ErrorState, Spinner } from './ui';

export function WorkspaceRoute({
  area,
  children,
}: {
  area: WorkspaceArea;
  children: ReactNode;
}) {
  const { workspaceId } = useParams();
  const { workspaces, isLoading, error, refetch } = useWorkspaces();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading workspace…" />
      </div>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <div className="w-full space-y-3">
          <ErrorState error="The workspace list could not be loaded." />
          <button className="btn-secondary" onClick={() => void refetch()}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  const resolution = resolveWorkspaceRoute(workspaces, workspaceId, area);
  if (resolution.status === 'inaccessible') {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <div className="w-full space-y-3 rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900">Workspace unavailable</h1>
          <p className="text-sm text-slate-600">
            This workspace is unavailable or you do not have access to it.
          </p>
          <Link className="btn-primary inline-flex" to="/workspaces">
            Choose a workspace
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ActiveWorkspaceProvider workspace={resolution.workspace}>
      {children}
    </ActiveWorkspaceProvider>
  );
}
