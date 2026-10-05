import type { WorkspaceKind } from '../lib/workspaces';

const BRAND_DETAILS = {
  legacy: {
    label: 'Archive database',
  },
  sales_crm: {
    label: 'Sales database',
  },
} satisfies Record<WorkspaceKind, { label: string }>;

export function WorkspaceBrand({ kind, compact = false }: { kind: WorkspaceKind; compact?: boolean }) {
  const brand = BRAND_DETAILS[kind];
  return (
    <span className={`workspace-brand workspace-brand--${kind} ${compact ? 'workspace-brand--compact' : ''}`} role="img" aria-label={brand.label}>
      <svg className={`workspace-brand__icon ${compact ? 'workspace-brand__icon--compact' : ''}`} viewBox="0 0 48 48" aria-hidden="true">
        <ellipse cx="24" cy="10" rx="15" ry="6" />
        <path d="M9 10v12c0 3.3 6.7 6 15 6s15-2.7 15-6V10" />
        <path d="M9 22v12c0 3.3 6.7 6 15 6s15-2.7 15-6V22" />
      </svg>
    </span>
  );
}
