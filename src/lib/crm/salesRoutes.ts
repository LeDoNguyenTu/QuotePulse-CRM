export type SalesModuleResolution =
  | 'dashboard'
  | 'companies'
  | 'contacts'
  | 'deals'
  | 'company-detail'
  | 'contact-detail'
  | 'deal-detail'
  | 'imports'
  | 'placeholder'
  | 'missing';

const PLACEHOLDER_MODULES = new Set([
  'tasks',
  'email-campaigns',
  'pst-extractor',
  'settings',
]);

export function resolveSalesModule(
  module: string | undefined,
  recordId?: string,
): SalesModuleResolution {
  if (!module) return 'dashboard';
  if (recordId) {
    if (module === 'companies') return 'company-detail';
    if (module === 'contacts') return 'contact-detail';
    if (module === 'deals') return 'deal-detail';
    return 'missing';
  }
  if (module === 'companies' || module === 'contacts' || module === 'deals') return module;
  if (module === 'imports') return 'imports';
  return PLACEHOLDER_MODULES.has(module) ? 'placeholder' : 'missing';
}

export function crmRecordPath(
  workspaceId: string,
  kind: CrmRecordKind,
  recordId: string,
): string {
  const module = kind === 'company' ? 'companies' : kind === 'contact' ? 'contacts' : 'deals';
  return `${salesPath(workspaceId, module)}/${encodeURIComponent(recordId)}`;
}
import { salesPath } from '../appRoutes';

export type CrmRecordKind = 'company' | 'contact' | 'deal';
