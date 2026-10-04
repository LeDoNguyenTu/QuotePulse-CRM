import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CrmContact } from '../../lib/crm/types';
import { ContactLifecycleActions, ContactStateBadges } from './ContactLifecycleControls';

const contact = {
  id: 'contact-1', workspace_id: 'workspace-1', company_id: null,
  first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace',
  email: null, phone: '123', job_title: 'Founder', record_state: 'outdated',
  is_hidden: false, duplicate_review_of: 'contact-2', created_by: 'user-1', updated_by: 'user-1',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
} satisfies CrmContact;

describe('contact lifecycle controls', () => {
  it('shows state, duplicate review, and visibility in a single status group', () => {
    const html = renderToStaticMarkup(<ContactStateBadges contact={contact} />);
    expect(html).toContain('Outdated');
    expect(html).toContain('Review required');
    expect(html).not.toContain('Hidden');
  });

  it('offers explicit review, verification, and hide actions without auto-hiding', () => {
    const html = renderToStaticMarkup(<ContactLifecycleActions contact={contact} pending={false} onChange={vi.fn()} />);
    expect(html).toContain('Verify');
    expect(html).toContain('Resolve review');
    expect(html).toContain('Hide');
    expect(html).not.toContain('Show');
  });
});
