import { Link } from 'react-router-dom';
import { workspaceLandingPath, type Workspace } from '../lib/workspaces';
import { ErrorState, Spinner } from '../components/ui';
import { WorkspaceBrand } from '../components/WorkspaceBrand';

export interface WorkspaceSelectorViewProps {
  workspaces: Workspace[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
}

const WORKSPACE_DETAILS = {
  legacy: {
    category: 'Archive and outreach',
    description: 'Historical HubSpot workflows, uploaded files, templates, and archive status.',
    action: 'Open legacy workspace',
  },
  sales_crm: {
    category: 'Sales operations',
    description: 'Excel-driven sales workspace for companies, contacts, deals, tasks, and campaigns.',
    action: 'Open Sales CRM',
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
      <div className="workspace-selector__inner mx-auto max-w-6xl">
        <header className="workspace-selector__masthead">
          <p className="workspace-selector__wordmark"><span aria-hidden="true" />QuotePulse</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Choose your workspace
          </h1>
          <p className="workspace-selector__intro">
            Choose the workspace for the job at hand. Your account and sign-in stay the same.
          </p>
        </header>

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
          <div className="workspace-choice-grid">
            {ordered.map((workspace) => {
              const details = WORKSPACE_DETAILS[workspace.kind];
              return (
                <Link
                  key={workspace.id}
                  to={workspaceLandingPath(workspace)}
                  className={`workspace-choice workspace-choice--${workspace.kind} group`}
                  aria-label={`${workspace.name} workspace`}
                >
                  <span className="workspace-choice__brand">
                    <WorkspaceBrand kind={workspace.kind} />
                  </span>
                  <span className="workspace-choice__content">
                    <span className="workspace-choice__category">{details.category}</span>
                    <span className="workspace-choice__title">
                      {workspace.name}
                    </span>
                    <span className="workspace-choice__description">
                      {details.description}
                    </span>
                    <span className="workspace-choice__action">
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
