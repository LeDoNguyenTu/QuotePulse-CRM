function workspaceBase(workspaceId: string, area: 'legacy' | 'sales'): string {
  return `/w/${encodeURIComponent(workspaceId)}/${area}`;
}

function appendSuffix(base: string, suffix?: string): string {
  if (!suffix) return base;

  const segments = suffix.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.includes('..')) {
    throw new Error('Route suffix cannot contain parent-directory segments');
  }

  return segments.length > 0
    ? `${base}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`
    : base;
}

export const workspaceRoutePaths = {
  selector: '/workspaces',
  legacyHome: '/w/:workspaceId/legacy',
  legacyCompany: '/w/:workspaceId/legacy/company/:id',
  legacyTemplates: '/w/:workspaceId/legacy/templates',
  legacyTrash: '/w/:workspaceId/legacy/trash',
  legacySettings: '/w/:workspaceId/legacy/settings',
  legacyUploads: '/w/:workspaceId/legacy/uploads',
  legacyUploadDetail: '/w/:workspaceId/legacy/uploads/:id',
  salesHome: '/w/:workspaceId/sales',
  salesModule: '/w/:workspaceId/sales/:module',
} as const;

export function authenticatedLandingPath(): string {
  return workspaceRoutePaths.selector;
}

export function legacyPath(workspaceId: string, suffix?: string): string {
  return appendSuffix(workspaceBase(workspaceId, 'legacy'), suffix);
}

export function salesPath(workspaceId: string, suffix?: string): string {
  return appendSuffix(workspaceBase(workspaceId, 'sales'), suffix);
}
