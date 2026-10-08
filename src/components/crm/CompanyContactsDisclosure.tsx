import { Link } from 'react-router-dom';

export interface CompanyContactSummary {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  state?: string | null;
  hidden?: boolean;
  primary?: boolean;
  href?: string;
}

interface Props {
  count?: number;
  contacts: CompanyContactSummary[];
  open: boolean;
  loading?: boolean;
  error?: Error | null;
  onOpenChange: (open: boolean) => void;
}

function labelForCount(count?: number) {
  if (count == null) return 'View contacts';
  return `${count} contact${count === 1 ? '' : 's'}`;
}

export function CompanyContactsDisclosure({ count, contacts, open, loading, error, onOpenChange }: Props) {
  return (
    <div className="company-contacts-disclosure">
      <button
        type="button"
        className="company-contacts-disclosure__trigger"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span>{labelForCount(count)}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="company-contacts-disclosure__panel">
          {loading ? <p>Loading contacts…</p> : error ? <p role="alert">{error.message}</p> : contacts.length === 0 ? (
            <p>No contacts are linked to this company.</p>
          ) : (
            <ul>
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <div>
                    {contact.href
                      ? <Link className="crm-record-link" to={contact.href}>{contact.name}</Link>
                      : <strong>{contact.name}</strong>}
                    <span>{contact.role || 'Role not recorded'}</span>
                  </div>
                  <div className="company-contact-channel">
                    <span>{contact.email || 'No email'}</span>
                    <span>{contact.phone || 'No phone'}</span>
                  </div>
                  <div className="contact-state-badges">
                    {contact.primary && <span className="contact-state-badge contact-state-badge--verified">Primary</span>}
                    {contact.state && <span className={`contact-state-badge contact-state-badge--${contact.state}`}>{contact.state.charAt(0).toUpperCase() + contact.state.slice(1)}</span>}
                    {contact.hidden && <span className="contact-state-badge contact-state-badge--hidden">Hidden</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
