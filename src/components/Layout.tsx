import { useEffect, useRef, useState, type ReactNode } from 'react';
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

function NavigationGroup({ label, items, pathname, open, onToggle, onClose }: {
  label: string;
  items: WorkspaceNavigationItem[];
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const active = items.some((item) => isNavigationItemActive(item, pathname));
  return (
    <div aria-label={`${label} navigation`} data-active={active ? 'true' : undefined} data-open={open ? 'true' : undefined} className="workspace-nav-group">
      <button type="button" className="workspace-nav-group__trigger" aria-expanded={open} onClick={onToggle}>
        <span>{label}</span>
        <span className="workspace-nav-group__orb" aria-hidden="true">
          <svg viewBox="0 0 16 16" focusable="false">
            <path className="workspace-nav-group__chevron" d="M5 6.5 8 9.5l3-3" />
            <path className="workspace-nav-group__minus" d="M5 8h6" />
          </svg>
        </span>
      </button>
      <div className="workspace-nav-group__menu" hidden={!open}>
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose}>{item.label}</NavLink>
        ))}
      </div>
    </div>
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
  const [openNavigationGroup, setOpenNavigationGroup] = useState<string | null>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const navItems = workspace
    ? workspaceNavigation(workspace.kind, workspace.id)
    : legacyFallbackNavigation;
  const isSales = area === 'sales';
  const groupedLabels = new Set<string>(SALES_NAV_GROUPS.flatMap((group) => group.items));
  const directNavItems = isSales ? navItems.filter((item) => !groupedLabels.has(item.label)) : navItems;

  useEffect(() => {
    setOpenNavigationGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openNavigationGroup) return;
    const closeOutside = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) setOpenNavigationGroup(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenNavigationGroup(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openNavigationGroup]);

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
          <nav ref={navigationRef} aria-label={`${workspace?.name ?? 'Legacy'} navigation`} className="workspace-nav">
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
                  open={openNavigationGroup === group.label}
                  onToggle={() => setOpenNavigationGroup((current) => current === group.label ? null : group.label)}
                  onClose={() => setOpenNavigationGroup(null)}
                />
              ))}
            </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
