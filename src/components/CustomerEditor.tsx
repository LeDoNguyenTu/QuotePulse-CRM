import { useEffect, useState } from 'react';
import {
  useCompanyContacts,
  useDeleteContact,
  useSaveContact,
  useUpdateCompany,
} from '../hooks/useCompany';
import { useIndustries } from '../hooks/useIndustries';
import type { Company, Contact, SourcePriority } from '../lib/types';
import { Modal } from './Modal';
import { EmptyState, ErrorState, Spinner } from './ui';

// ---------------------------------------------------------------------------
// Company details editor
// ---------------------------------------------------------------------------

export function CompanyEditModal({
  company,
  open,
  onClose,
}: {
  company: Company;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateCompany(company.id);
  const { data: industries } = useIndustries();

  const [nameClean, setNameClean] = useState(company.name_clean);
  const [industry, setIndustry] = useState(company.industry ?? '');
  const [website, setWebsite] = useState(company.website ?? '');
  const [priority, setPriority] = useState<SourcePriority>(company.source_priority);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNameClean(company.name_clean);
      setIndustry(company.industry ?? '');
      setWebsite(company.website ?? '');
      setPriority(company.source_priority);
      setError(null);
    }
  }, [open, company]);

  async function save() {
    setError(null);
    if (!nameClean.trim()) {
      setError('Company name is required.');
      return;
    }
    try {
      await update.mutateAsync({
        name_clean: nameClean.trim(),
        industry: industry.trim() || null,
        website: website.trim() || null,
        source_priority: priority,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit company details">
      <div className="space-y-3">
        <div>
          <label className="label">Company name</label>
          <input
            className="input"
            value={nameClean}
            onChange={(e) => setNameClean(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Industry</label>
          <input
            className="input"
            list="industry-options"
            placeholder="e.g. Engineering"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
          <datalist id="industry-options">
            {industries?.map((i) => (
              <option key={i.id} value={i.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label">Website</label>
          <input
            className="input"
            placeholder="https://…"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Source priority</label>
          <select
            className="input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as SourcePriority)}
          >
            <option value="current">current</option>
            <option value="recycled">recycled</option>
            <option value="deleted">deleted</option>
          </select>
        </div>
        {error && <ErrorState error={error} />}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Contact add/edit modal
// ---------------------------------------------------------------------------

function ContactEditModal({
  companyId,
  contact,
  open,
  onClose,
}: {
  companyId: string;
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
}) {
  const save = useSaveContact(companyId);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFullName(contact?.full_name ?? '');
      setEmail(contact?.email ?? '');
      setPhone(contact?.phone ?? '');
      setRole(contact?.role_title ?? '');
      setPrimary(contact?.is_primary_contact ?? false);
      setError(null);
    }
  }, [open, contact]);

  async function submit() {
    setError(null);
    if (!email.trim() && !phone.trim()) {
      setError('Add at least an email or a phone number.');
      return;
    }
    try {
      await save.mutateAsync({
        id: contact?.id,
        full_name: fullName,
        email,
        phone,
        role_title: role,
        is_primary_contact: primary,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={contact ? 'Edit contact' : 'Add contact'}>
      <div className="space-y-3">
        <div>
          <label className="label">Full name</label>
          <input
            className="input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            An email is required for this contact to receive outreach.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Role / title</label>
            <input
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={primary}
            onChange={(e) => setPrimary(e.target.checked)}
          />
          Primary contact (used as the default recipient for bulk sends)
        </label>
        {error && <ErrorState error={error} />}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save contact'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Editable contacts section (list + add / edit / delete)
// ---------------------------------------------------------------------------

export function ContactsEditor({ companyId }: { companyId: string }) {
  const { data: contacts, isLoading } = useCompanyContacts(companyId);
  const del = useDeleteContact(companyId);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  function remove(c: Contact) {
    if (window.confirm(`Delete contact ${c.full_name || c.email || ''}?`)) {
      del.mutate(c.id);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Contacts</h2>
        <button className="btn-secondary" onClick={() => setAdding(true)}>
          + Add contact
        </button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : contacts && contacts.length > 0 ? (
        <div className="card divide-y divide-slate-100">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm"
            >
              <span className="font-medium">{c.full_name ?? '—'}</span>
              {c.is_primary_contact && (
                <span className="rounded bg-brand-100 px-2 py-0.5 text-xs text-brand-700">
                  primary
                </span>
              )}
              <span className={c.email ? 'text-slate-600' : 'italic text-slate-300'}>
                {c.email ?? 'no email'}
              </span>
              <span className="text-slate-500">{c.phone ?? ''}</span>
              <span className="text-slate-400">{c.role_title ?? ''}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {c.source}
              </span>
              <div className="ml-auto flex gap-3">
                <button
                  className="text-brand-600 hover:underline"
                  onClick={() => setEditing(c)}
                >
                  Edit
                </button>
                <button
                  className="text-red-600 hover:underline disabled:opacity-50"
                  disabled={del.isPending}
                  onClick={() => remove(c)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState>No contacts yet. Add one with an email to enable outreach.</EmptyState>
      )}

      {del.error && (
        <div className="mt-2">
          <ErrorState error={del.error} />
        </div>
      )}

      <ContactEditModal
        companyId={companyId}
        contact={null}
        open={adding}
        onClose={() => setAdding(false)}
      />
      <ContactEditModal
        companyId={companyId}
        contact={editing}
        open={!!editing}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
