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
        {kind === 'sales_crm' ? (
          <g className="workspace-brand__network">
            <rect x="7" y="7" width="34" height="34" rx="10" />
            <circle cx="17" cy="20" r="4" />
            <circle cx="31" cy="16" r="3" />
            <circle cx="31" cy="31" r="3" />
            <path d="m20.8 18.9 7.2-2M20 23l8.2 6.3M13 31h9" />
          </g>
        ) : (
          <g className="workspace-brand__archive">
            <path d="M8 15h32v23H8z" />
            <path d="M12 10h24l4 5H8l4-5Z" />
            <path d="M18 23h12M18 29h9" />
            <path d="M14 38v3h20v-3" />
          </g>
        )}
      </svg>
    </span>
  );
}
