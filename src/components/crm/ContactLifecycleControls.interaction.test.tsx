// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrmContact } from '../../lib/crm/types';
import { ContactRowActions } from './ContactLifecycleControls';

const contact = {
  id: 'contact-1', workspace_id: 'workspace-1', company_id: null,
  first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace',
  email: null, phone: '123', job_title: 'Founder', record_state: 'unverified',
  is_hidden: false, duplicate_review_of: null, created_by: 'user-1', updated_by: 'user-1',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z',
} satisfies CrmContact;

describe('ContactRowActions interactions', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<ContactRowActions contact={contact} pending={false} onChange={vi.fn()} onEdit={vi.fn()} />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('dismisses More on outside click and Escape', () => {
    const summary = container.querySelector('summary') as HTMLElement;
    const details = container.querySelector('details') as HTMLDetailsElement;

    act(() => summary.click());
    expect(details.open).toBe(true);
    act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    expect(details.open).toBe(false);

    act(() => summary.click());
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(details.open).toBe(false);
  });
});
