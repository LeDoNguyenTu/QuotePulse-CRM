import type { CrmContact } from '../../lib/crm/types';
import { contactStateIndicators } from '../../lib/crm/contactLifecycle';

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
