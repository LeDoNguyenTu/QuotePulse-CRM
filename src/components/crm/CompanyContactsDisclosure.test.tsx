import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ComponentProps } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CompanyContactsDisclosure } from './CompanyContactsDisclosure';

const contacts = [
  {
    id: 'contact-1',
    name: 'Michelle Goh',
    role: 'Finance manager',
    email: 'michelle@example.com',
    phone: '+65 6123 4567',
    state: 'verified',
    hidden: false,
    href: '/contacts/contact-1',
  },
  {
    id: 'contact-2',
    name: 'Jordan Tan',
    role: null,
    email: 'jordan@example.com',
    phone: null,
    state: 'outdated',
    hidden: true,
    href: '/contacts/contact-2',
  },
];

describe('CompanyContactsDisclosure', () => {
  it('reveals every linked contact and their lifecycle state without duplicating the company row', () => {
    const onOpen = vi.fn();
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <MemoryRouter>
          <CompanyContactsDisclosure count={2} contacts={contacts} open={false} onOpenChange={onOpen} />
        </MemoryRouter>,
      );
    });

    const button = renderer.root.findByProps({ 'aria-expanded': false });
    expect(JSON.stringify(renderer.toJSON())).toContain('2 contacts');
    expect(renderer.root.findAllByType('a')).toHaveLength(0);

    act(() => button.props.onClick());
    expect(onOpen).toHaveBeenCalledWith(true);

    act(() => {
      renderer.update(
        <MemoryRouter>
          <CompanyContactsDisclosure count={2} contacts={contacts} open onOpenChange={onOpen} />
        </MemoryRouter>,
      );
    });

    const links = renderer.root.findAllByType('a');
    expect(links.map((link) => link.children.join(''))).toEqual(['Michelle Goh', 'Jordan Tan']);
    expect(renderer.root.findAllByProps({ children: 'Verified' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ children: 'Outdated' })).toHaveLength(1);
    expect(renderer.root.findAllByProps({ children: 'Hidden' })).toHaveLength(1);
  });

  it('shows loading, empty, and error feedback inside the expanded row', () => {
    const wrap = (props: Partial<ComponentProps<typeof CompanyContactsDisclosure>>) => (
      <MemoryRouter>
        <CompanyContactsDisclosure count={0} contacts={[]} open onOpenChange={vi.fn()} {...props} />
      </MemoryRouter>
    );
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(wrap({ loading: true })); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Loading contacts');

    act(() => { renderer.update(wrap({ error: new Error('Contact lookup failed') })); });
    expect(JSON.stringify(renderer.toJSON())).toContain('Contact lookup failed');

    act(() => { renderer.update(wrap({})); });
    expect(JSON.stringify(renderer.toJSON())).toContain('No contacts are linked to this company');
  });

  it('uses a neutral label when the list has not been loaded yet', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(
        <MemoryRouter>
          <CompanyContactsDisclosure contacts={[]} open={false} onOpenChange={vi.fn()} />
        </MemoryRouter>,
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('View contacts');
  });
});
