import { Link } from 'react-router-dom';
import { workspaceLandingPath, type Workspace } from '../lib/workspaces';
import { ErrorState, Spinner } from '../components/ui';

export interface WorkspaceSelectorViewProps {
  workspaces: Workspace[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

const WORKSPACE_DETAILS = {
  legacy: {
    description: 'Historical HubSpot workflows, uploaded files, templates, and archive status.',
    action: 'Open legacy workspace',
    marker: 'QP',
  },
  sales_crm: {
    description: 'Excel-driven sales workspace for companies, contacts, deals, tasks, and campaigns.',
    action: 'Open Sales CRM',
    marker: 'SC',
  },
} as const;

export function WorkspaceSelectorView({
  workspaces,
  isLoading,
  error,
  onRetry,
}: WorkspaceSelectorViewProps) {
  const ordered = [...workspaces].sort((left, right) => {
    if (left.kind === right.kind) return left.name.localeCompare(right.name);
    return left.kind === 'legacy' ? -1 : 1;
  });

  return (
    <main className="workspace-selector min-h-screen px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-sm font-semibold text-brand-700">QuotePulse</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Choose your workspace
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Your login stays the same. Select the workspace that matches the work you are doing now.
          </p>
        </div>

        {isLoading && (
          <div className="rounded-xl border border-slate-200 bg-white p-8">
            <Spinner label="Loading workspaces…" />
          </div>
        )}

        {!isLoading && error && (
          <div className="max-w-xl space-y-3">
            <ErrorState error="The workspace list could not be loaded." />
            <button className="btn-secondary" onClick={onRetry}>Retry</button>
          </div>
        )}

        {!isLoading && !error && ordered.length === 0 && (
          <section className="max-w-xl rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">No workspaces are available</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Workspace setup may still be in progress. Retry the lookup or contact your administrator.
            </p>
            <button className="btn-primary mt-5" onClick={onRetry}>Retry</button>
          </section>
        )}

        {!isLoading && !error && ordered.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {ordered.map((workspace) => {
              const details = WORKSPACE_DETAILS[workspace.kind];
              return (
                <Link
                  key={workspace.id}
                  to={workspaceLandingPath(workspace)}
                  className={`workspace-choice workspace-choice--${workspace.kind} group`}
                >
                  <span className="workspace-choice__marker" aria-hidden="true">
                    {details.marker}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-semibold text-slate-950">
                      {workspace.name}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-slate-600">
                      {details.description}
                    </span>
                    <span className="mt-6 inline-flex text-sm font-semibold text-brand-700">
                      {details.action}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
