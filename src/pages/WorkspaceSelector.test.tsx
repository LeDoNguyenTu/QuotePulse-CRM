import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '../lib/workspaces';
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
    expect(html).not.toContain('legacy-id</');
    expect(html).not.toContain('sales-id</');
  });
});
