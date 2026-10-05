import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useOptionalActiveWorkspace } from '../hooks/useWorkspaces';
import { workspaceNavigation } from '../lib/workspaceNavigation';
import { WorkspaceBrand } from './WorkspaceBrand';
import { CrmReminderCenter } from './crm/CrmReminderCenter';

const legacyFallbackNavigation = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/uploaded-files', label: 'Uploaded files' },
  { to: '/templates', label: 'Templates' },
  { to: '/trash', label: 'Recycle bin' },
  { to: '/settings', label: 'Settings' },
];

export function Layout({
  children,
  area = 'legacy',
}: {
  children: ReactNode;
  area?: 'legacy' | 'sales';
}) {
  const { user, signOut } = useAuth();
  const workspace = useOptionalActiveWorkspace();
  const navItems = workspace
    ? workspaceNavigation(workspace.kind, workspace.id)
    : legacyFallbackNavigation;
  const isSales = area === 'sales';

  return (
    <div className={`min-h-screen ${isSales ? 'workspace-canvas--sales' : ''}`}>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <WorkspaceBrand kind={isSales ? 'sales_crm' : 'legacy'} compact />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">QuotePulse</p>
                <p className="truncate text-xs text-slate-500">
                  {workspace?.name ?? 'Legacy workspace'}
                </p>
              </div>
              {workspace && (
                <Link className="btn-secondary hidden sm:inline-flex" to="/workspaces">
                  Switch workspace
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              {isSales && workspace && <CrmReminderCenter workspaceId={workspace.id} />}
              <span className="hidden max-w-52 truncate lg:inline">{user?.email}</span>
              <button className="btn-secondary" onClick={() => signOut()}>
                Sign out
              </button>
            </div>
          </div>
          {workspace && (
            <Link className="mt-3 inline-flex text-sm font-medium text-brand-700 sm:hidden" to="/workspaces">
              Switch workspace
            </Link>
          )}
          <nav aria-label={`${workspace?.name ?? 'Legacy'} navigation`} className="mt-3 flex gap-1 overflow-x-auto pb-1">
              {navItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    `shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
