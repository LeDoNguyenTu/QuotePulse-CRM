import { describe, expect, it } from 'vitest';
import {
  authenticatedLandingPath,
  legacyPath,
  salesPath,
  workspaceRoutePaths,
} from './appRoutes';

describe('workspace application routes', () => {
  it('makes the selector the authenticated landing page', () => {
    expect(authenticatedLandingPath()).toBe('/workspaces');
  });

  it('builds legacy routes beneath the active workspace', () => {
    expect(legacyPath('legacy-id')).toBe('/w/legacy-id/legacy');
    expect(legacyPath('legacy-id', 'company/company-id')).toBe(
      '/w/legacy-id/legacy/company/company-id',
    );
    expect(legacyPath('legacy-id', '/uploads/file-id')).toBe(
      '/w/legacy-id/legacy/uploads/file-id',
    );
  });

  it('builds Sales CRM module routes beneath the active workspace', () => {
    expect(salesPath('sales-id')).toBe('/w/sales-id/sales');
    expect(salesPath('sales-id', 'email-campaigns')).toBe(
      '/w/sales-id/sales/email-campaigns',
    );
  });

  it('rejects parent-directory route segments', () => {
    expect(() => legacyPath('legacy-id', '../settings')).toThrow(
      'Route suffix cannot contain parent-directory segments',
    );
    expect(() => salesPath('sales-id', 'deals/../settings')).toThrow(
      'Route suffix cannot contain parent-directory segments',
    );
  });

  it('registers the selector and both guarded workspace route families', () => {
    expect(workspaceRoutePaths).toEqual({
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
      salesRecord: '/w/:workspaceId/sales/:module/:recordId',
    });
  });
});
