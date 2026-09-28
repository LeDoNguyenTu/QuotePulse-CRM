export type SalesModuleResolution =
  | 'dashboard'
  | 'companies'
  | 'contacts'
  | 'deals'
  | 'imports'
  | 'placeholder'
  | 'missing';

const PLACEHOLDER_MODULES = new Set([
  'tasks',
  'email-campaigns',
  'pst-extractor',
  'settings',
]);

export function resolveSalesModule(module: string | undefined): SalesModuleResolution {
  if (!module) return 'dashboard';
  if (module === 'companies' || module === 'contacts' || module === 'deals') return module;
  if (module === 'imports') return 'imports';
  return PLACEHOLDER_MODULES.has(module) ? 'placeholder' : 'missing';
}
