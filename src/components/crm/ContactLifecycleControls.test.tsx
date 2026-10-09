import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import type { CrmContact } from '../../lib/crm/types';
import { ContactLifecycleActions, ContactRowActions, ContactStateBadges } from './ContactLifecycleControls';

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

  it('keeps Edit primary and groups lifecycle and destructive actions in More', () => {
    const html = renderToStaticMarkup(
      <ContactRowActions
        contact={contact}
        pending={false}
        onChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(html).toMatch(/contact-row-actions__primary[^>]*>Edit</);
    expect(html).toContain('<summary');
    expect(html).toContain('More');
    expect(html).toContain('Verify');
    expect(html).toContain('Resolve review');
    expect(html).toContain('Hide');
    expect(html).toMatch(/contact-row-actions__danger[^>]*>Delete</);

    const activeHtml = renderToStaticMarkup(
      <ContactRowActions
        contact={{ ...contact, record_state: 'unverified' }}
        pending={false}
        onChange={vi.fn()}
        onEdit={vi.fn()}
      />,
    );
    expect(activeHtml).toContain('Mark outdated');
  });

  it('closes More after a lifecycle action is chosen', () => {
    const onChange = vi.fn();
    const details = { open: true };
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ContactRowActions
          contact={contact}
          pending={false}
          onChange={onChange}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
    });
    const verify = renderer!.root.findAllByType('button').find((button) => button.children.join('') === 'Verify');

    act(() => verify!.props.onClick({ currentTarget: { closest: () => details } }));

    expect(onChange).toHaveBeenCalledWith({ record_state: 'verified', duplicate_review_of: null });
    expect(details.open).toBe(false);
  });
});
