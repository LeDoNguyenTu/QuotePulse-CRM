import type { WorkspaceKind } from '../lib/workspaces';

const BRAND_DETAILS = {
  legacy: {
    src: '/brands/innocom-technologies.png',
    alt: 'Innocom Technologies Pte Ltd',
  },
  sales_crm: {
    src: '/brands/r-systems.png',
    alt: 'R Systems Singapore Pte Ltd',
  },
} satisfies Record<WorkspaceKind, { src: string; alt: string }>;

export function WorkspaceBrand({ kind, compact = false }: { kind: WorkspaceKind; compact?: boolean }) {
  const brand = BRAND_DETAILS[kind];
  return (
    <span className={`workspace-brand workspace-brand--${kind} ${compact ? 'workspace-brand--compact' : ''}`}>
      <img
        className={`workspace-brand__image ${compact ? 'workspace-brand__image--compact' : ''}`}
        src={brand.src}
        alt={brand.alt}
      />
    </span>
  );
}
