import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useOptionalActiveWorkspace } from '../hooks/useWorkspaces';
import { workspaceNavigation } from '../lib/workspaceNavigation';
import { WorkspaceBrand } from './WorkspaceBrand';
import { CrmReminderCenter } from './crm/CrmReminderCenter';
import { ThemeToggle } from './ThemeToggle';
import type { WorkspaceNavigationItem } from '../lib/workspaceNavigation';

const legacyFallbackNavigation = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/uploaded-files', label: 'Uploaded files' },
  { to: '/templates', label: 'Templates' },
  { to: '/trash', label: 'Recycle bin' },
  { to: '/settings', label: 'Settings' },
];

const SALES_NAV_GROUPS = [
  { label: 'Outreach', items: ['Templates', 'Email Campaigns'] },
  { label: 'Tools', items: ['Imports', 'PST Extractor', 'Recycle bin', 'Settings'] },
] as const;

function isNavigationItemActive(item: WorkspaceNavigationItem, pathname: string) {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavigationGroup({ label, items, pathname }: { label: string; items: WorkspaceNavigationItem[]; pathname: string }) {
  const active = items.some((item) => isNavigationItemActive(item, pathname));
  return (
    <details aria-label={`${label} navigation`} data-active={active ? 'true' : undefined} className="workspace-nav-group">
      <summary>{label}<span aria-hidden="true">⌄</span></summary>
      <div className="workspace-nav-group__menu">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={(event) => {
            const group = event.currentTarget.closest('details');
            if (group) group.open = false;
          }}>{item.label}</NavLink>
        ))}
      </div>
    </details>
  );
}

export function Layout({
  children,
  area = 'legacy',
}: {
  children: ReactNode;
  area?: 'legacy' | 'sales';
}) {
  const { user, signOut } = useAuth();
  const workspace = useOptionalActiveWorkspace();
  const location = useLocation();
  const navItems = workspace
    ? workspaceNavigation(workspace.kind, workspace.id)
    : legacyFallbackNavigation;
  const isSales = area === 'sales';
  const groupedLabels = new Set<string>(SALES_NAV_GROUPS.flatMap((group) => group.items));
  const directNavItems = isSales ? navItems.filter((item) => !groupedLabels.has(item.label)) : navItems;

  return (
    <div className={`min-h-screen ${isSales ? 'workspace-canvas--sales' : ''}`}>
      <header className="app-header border-b border-slate-200 bg-white">
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
              <ThemeToggle />
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
          <nav aria-label={`${workspace?.name ?? 'Legacy'} navigation`} className="workspace-nav">
              {directNavItems.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className="workspace-nav__link"
                >
                  {n.label}
                </NavLink>
              ))}
              {isSales && SALES_NAV_GROUPS.map((group) => (
                <NavigationGroup
                  key={group.label}
                  label={group.label}
                  items={navItems.filter((item) => (group.items as readonly string[]).includes(item.label))}
                  pathname={location.pathname}
                />
              ))}
            </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
