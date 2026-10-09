import type { CrmContact } from '../../lib/crm/types';
import { contactStateIndicators } from '../../lib/crm/contactLifecycle';
import { useEffect, useRef, useState } from 'react';

export type ContactLifecycleChange = Partial<Pick<
  CrmContact,
  'record_state' | 'is_hidden' | 'duplicate_review_of'
>>;

export function ContactStateBadges({ contact }: { contact: CrmContact }) {
  return (
    <span className="contact-state-badges">
      {contactStateIndicators(contact).map((label) => (
        <span key={label} className={`contact-state-badge contact-state-badge--${label.toLowerCase().replace(/\s+/g, '-')}`}>
          {label}
        </span>
      ))}
    </span>
  );
}

export function ContactLifecycleActions({ contact, pending, onChange }: {
  contact: CrmContact;
  pending: boolean;
  onChange: (changes: ContactLifecycleChange) => void;
}) {
  return (
    <div className="contact-lifecycle-actions">
      {contact.record_state !== 'verified' && (
        <button type="button" disabled={pending} onClick={() => onChange({ record_state: 'verified', duplicate_review_of: null })}>
          Verify
        </button>
      )}
      {contact.record_state !== 'outdated' && (
        <button type="button" disabled={pending} onClick={() => onChange({ record_state: 'outdated' })}>
          Mark outdated
        </button>
      )}
      {contact.duplicate_review_of && (
        <button type="button" disabled={pending} onClick={() => onChange({ duplicate_review_of: null })}>
          Resolve review
        </button>
      )}
      <button type="button" disabled={pending} onClick={() => onChange({ is_hidden: !contact.is_hidden })}>
        {contact.is_hidden ? 'Show' : 'Hide'}
      </button>
    </div>
  );
}

export function ContactRowActions({ contact, pending, onChange, onEdit, onDelete }: {
  contact: CrmContact;
  pending: boolean;
  onChange: (changes: ContactLifecycleChange) => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const change = (changes: ContactLifecycleChange) => {
    onChange(changes);
    setOpen(false);
  };
  const finish = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="contact-row-actions">
      <button type="button" className="crm-text-action contact-row-actions__primary" onClick={onEdit}>Edit</button>
      <details ref={menuRef} className="contact-row-actions__menu" open={open}>
        <summary aria-label={`More actions for ${contact.full_name || contact.email || 'contact'}`} onClick={(event) => { event.preventDefault(); setOpen((current) => !current); }}>
          <span>More</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <circle cx="3" cy="8" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="13" cy="8" r="1.25" />
          </svg>
        </summary>
        <div className="contact-row-actions__panel">
          {contact.record_state !== 'verified' && (
            <button type="button" disabled={pending} onClick={() => change({ record_state: 'verified', duplicate_review_of: null })}>Verify</button>
          )}
          {contact.record_state !== 'outdated' && (
            <button type="button" disabled={pending} onClick={() => change({ record_state: 'outdated' })}>Mark outdated</button>
          )}
          {contact.duplicate_review_of && (
            <button type="button" disabled={pending} onClick={() => change({ duplicate_review_of: null })}>Resolve review</button>
          )}
          <button type="button" disabled={pending} onClick={() => change({ is_hidden: !contact.is_hidden })}>
            {contact.is_hidden ? 'Show' : 'Hide'}
          </button>
          {onDelete && (
            <button type="button" className="contact-row-actions__danger" onClick={() => finish(onDelete)}>Delete</button>
          )}
        </div>
      </details>
    </div>
  );
}
