import type { WorkspaceKind } from './workspaces';

export interface WorkspaceNavigationItem {
  to: string;
  label: string;
  end?: boolean;
}

export function workspaceNavigation(
  kind: WorkspaceKind,
  workspaceId: string,
): WorkspaceNavigationItem[] {
  const id = encodeURIComponent(workspaceId);
  if (kind === 'legacy') {
    const base = `/w/${id}/legacy`;
    return [
      { to: base, label: 'Dashboard', end: true },
      { to: `${base}/uploads`, label: 'Uploaded files' },
      { to: `${base}/templates`, label: 'Templates' },
      { to: `${base}/trash`, label: 'Recycle bin' },
      { to: `${base}/settings`, label: 'Settings' },
    ];
  }

  const base = `/w/${id}/sales`;
  return [
    { to: base, label: 'Dashboard', end: true },
    { to: `${base}/companies`, label: 'Companies' },
    { to: `${base}/contacts`, label: 'Contacts' },
    { to: `${base}/deals`, label: 'Deals' },
    { to: `${base}/tasks`, label: 'Tasks' },
    { to: `${base}/templates`, label: 'Templates' },
    { to: `${base}/email-campaigns`, label: 'Email Campaigns' },
    { to: `${base}/imports`, label: 'Imports' },
    { to: `${base}/pst-extractor`, label: 'PST Extractor' },
    { to: `${base}/recycle-bin`, label: 'Recycle bin' },
    { to: `${base}/operations`, label: 'Operations' },
    { to: `${base}/settings`, label: 'Settings' },
  ];
}
