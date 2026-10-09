import type { CrmContact } from '../../lib/crm/types';
import { contactStateIndicators } from '../../lib/crm/contactLifecycle';
import type { MouseEvent } from 'react';

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

function closeActionMenu(event: MouseEvent<HTMLButtonElement>) {
  const menu = event.currentTarget.closest('details');
  if (menu) menu.open = false;
}

export function ContactRowActions({ contact, pending, onChange, onEdit, onDelete }: {
  contact: CrmContact;
  pending: boolean;
  onChange: (changes: ContactLifecycleChange) => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const change = (event: MouseEvent<HTMLButtonElement>, changes: ContactLifecycleChange) => {
    onChange(changes);
    closeActionMenu(event);
  };
  const finish = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    action();
    closeActionMenu(event);
  };

  return (
    <div className="contact-row-actions">
      <button type="button" className="crm-text-action contact-row-actions__primary" onClick={onEdit}>Edit</button>
      <details className="contact-row-actions__menu">
        <summary aria-label={`More actions for ${contact.full_name || contact.email || 'contact'}`}>
          <span>More</span>
          <svg aria-hidden="true" viewBox="0 0 16 16" focusable="false">
            <circle cx="3" cy="8" r="1.25" />
            <circle cx="8" cy="8" r="1.25" />
            <circle cx="13" cy="8" r="1.25" />
          </svg>
        </summary>
        <div className="contact-row-actions__panel">
          {contact.record_state !== 'verified' && (
            <button type="button" disabled={pending} onClick={(event) => change(event, { record_state: 'verified', duplicate_review_of: null })}>Verify</button>
          )}
          {contact.record_state !== 'outdated' && (
            <button type="button" disabled={pending} onClick={(event) => change(event, { record_state: 'outdated' })}>Mark outdated</button>
          )}
          {contact.duplicate_review_of && (
            <button type="button" disabled={pending} onClick={(event) => change(event, { duplicate_review_of: null })}>Resolve review</button>
          )}
          <button type="button" disabled={pending} onClick={(event) => change(event, { is_hidden: !contact.is_hidden })}>
            {contact.is_hidden ? 'Show' : 'Hide'}
          </button>
          {onDelete && (
            <button type="button" className="contact-row-actions__danger" onClick={(event) => finish(event, onDelete)}>Delete</button>
          )}
        </div>
      </details>
    </div>
  );
}
