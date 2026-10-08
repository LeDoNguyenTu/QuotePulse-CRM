import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '../lib/workspaces';
import { WorkspaceBrand } from '../components/WorkspaceBrand';
import { WorkspaceSelectorView } from './WorkspaceSelectorView';

const workspaces: Workspace[] = [
  { id: 'sales-id', name: 'Sales CRM', kind: 'sales_crm', role: 'owner' },
  { id: 'legacy-id', name: 'QuotePulse Legacy', kind: 'legacy', role: 'owner' },
];

function renderSelector(props: Partial<Parameters<typeof WorkspaceSelectorView>[0]> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/workspaces']}>
      <WorkspaceSelectorView
        workspaces={workspaces}
        isLoading={false}
        error={null}
        onRetry={() => undefined}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('workspace selector', () => {
  it('shows Legacy before Sales CRM with exact workspace landing links', () => {
    const html = renderSelector();

    expect(html.indexOf('QuotePulse Legacy')).toBeLessThan(html.indexOf('Sales CRM'));
    expect(html).toContain('href="/w/legacy-id/legacy"');
    expect(html).toContain('href="/w/sales-id/sales"');
    expect(html).toContain('Historical HubSpot workflows');
    expect(html).toContain('Excel-driven sales workspace');
    expect(html).toContain('aria-label="Archive database"');
    expect(html).toContain('aria-label="Sales database"');
    expect(html).not.toContain('/brands/');
    expect(html).not.toContain('Innocom Technologies');
    expect(html).not.toContain('R Systems Singapore');
  });

  it('gives a user with no memberships a recovery action', () => {
    const html = renderSelector({ workspaces: [] });

    expect(html).toContain('No workspaces are available');
    expect(html).toContain('Retry');
  });

  it('uses one main heading and accessible workspace links', () => {
    const html = renderSelector();

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('<main');
    expect(html).toContain('Choose the workspace for the job at hand');
    expect(html).toContain('QuotePulse Legacy workspace');
    expect(html).toContain('Sales CRM workspace');
    expect(html.match(/workspace-choice__brand/g)).toHaveLength(2);
    expect(html.match(/workspace-choice__content/g)).toHaveLength(2);
    expect(html.match(/workspace-brand__icon/g)).toHaveLength(2);
    expect(html).not.toContain('legacy-id</');
    expect(html).not.toContain('sales-id</');
  });

  it('marks the compact database icon for contained header sizing', () => {
    const salesHtml = renderToStaticMarkup(<WorkspaceBrand kind="sales_crm" compact />);
    const legacyHtml = renderToStaticMarkup(<WorkspaceBrand kind="legacy" compact />);

    expect(salesHtml).toContain('workspace-brand__icon--compact');
    expect(salesHtml).toContain('workspace-brand__network');
    expect(legacyHtml).toContain('workspace-brand__archive');
    expect(salesHtml).not.toEqual(legacyHtml);
    expect(salesHtml).not.toContain('<ellipse');
    expect(salesHtml).not.toContain('<img');
  });
});
