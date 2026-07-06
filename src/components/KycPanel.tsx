import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KycContact, KycEnrichedData, KycProfile } from '../lib/types';
import { functions } from '../lib/functions';
import { useSaveContact, useUpdateKyc } from '../hooks/useCompany';
import { Modal } from './Modal';
import { ErrorState } from './ui';

interface KycPanelProps {
  companyId: string;
  kyc: KycProfile | null;
}

type Status = 'idle' | 'pending' | 'completed' | 'failed';

export function KycPanel({ companyId, kyc }: KycPanelProps) {
  const qc = useQueryClient();
  const saveContact = useSaveContact(companyId);
  const [status, setStatus] = useState<Status>(kyc ? 'completed' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  async function runEnrich() {
    setStatus('pending');
    setError(null);
    setNote(null);
    try {
      await functions.enrichKyc(companyId);
      setStatus('completed');
      // Enrichment now also writes discovered contacts — refresh both.
      qc.invalidateQueries({ queryKey: ['company-kyc', companyId] });
      qc.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function addToContacts(c: KycContact) {
    setError(null);
    setNote(null);
    try {
      await saveContact.mutateAsync({
        full_name: c.name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? null,
        role_title: c.role ?? null,
      });
      setNote(`Added ${c.email ?? c.phone ?? 'contact'} to the company's contacts.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const data = kyc?.enriched_data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={runEnrich} disabled={status === 'pending'}>
          {status === 'pending' ? 'Enriching…' : kyc ? 'Re-run KYC' : 'Enrich KYC'}
        </button>
        {kyc && (
          <button className="btn-secondary" onClick={() => setEditOpen(true)}>
            Edit KYC
          </button>
        )}
        <StatusPill status={status} />
        {kyc?.last_enriched_at && (
          <span className="text-xs text-slate-400">
            Last enriched {new Date(kyc.last_enriched_at).toLocaleString()}
          </span>
        )}
      </div>

      {error && <ErrorState error={error} />}
      {note && <p className="text-sm text-emerald-700">{note}</p>}

      {!kyc && status !== 'pending' && (
        <p className="text-sm text-slate-500">
          No KYC profile yet. Run enrichment to find the website, LinkedIn page, and public
          contacts.
        </p>
      )}

      {kyc && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Website">
            <Link href={kyc.primary_website} />
          </Field>
          <Field label="LinkedIn">
            <Link href={kyc.linkedin_company_url} />
          </Field>
          <Field label="Address">{data?.address ?? '—'}</Field>
          <Field label="About">{data?.about ?? '—'}</Field>
          <div className="sm:col-span-2">
            <div className="label">Public contacts</div>
            {data?.contacts && data.contacts.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {data.contacts.map((c, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-2 py-1"
                  >
                    <span className="font-medium">{c.name ?? 'Unknown'}</span>
                    {c.role ? <span className="text-slate-500">— {c.role}</span> : null}
                    {c.email ? <span className="text-slate-500">· {c.email}</span> : null}
                    {c.phone ? <span className="text-slate-500">· {c.phone}</span> : null}
                    {(c.email || c.phone) && (
                      <button
                        className="ml-auto text-xs text-brand-600 hover:underline disabled:opacity-50"
                        disabled={saveContact.isPending}
                        onClick={() => addToContacts(c)}
                      >
                        Add to contacts
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">None found.</p>
            )}
          </div>
          {kyc.other_links && kyc.other_links.length > 0 && (
            <div className="sm:col-span-2">
              <div className="label">Other links</div>
              <ul className="list-inside list-disc text-sm">
                {kyc.other_links.map((l, i) => (
                  <li key={i}>
                    <Link href={l} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {kyc && (
        <KycEditModal
          companyId={companyId}
          kyc={kyc}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manual KYC editor — correct wrong data the enrichment produced.
// ---------------------------------------------------------------------------

function KycEditModal({
  companyId,
  kyc,
  open,
  onClose,
}: {
  companyId: string;
  kyc: KycProfile;
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdateKyc(companyId);

  const [website, setWebsite] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [address, setAddress] = useState('');
  const [about, setAbout] = useState('');
  const [otherLinks, setOtherLinks] = useState('');
  const [contacts, setContacts] = useState<KycContact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = kyc.enriched_data ?? {};
    setWebsite(kyc.primary_website ?? d.website ?? '');
    setLinkedin(kyc.linkedin_company_url ?? d.linkedin ?? '');
    setAddress(d.address ?? '');
    setAbout(d.about ?? '');
    setOtherLinks((kyc.other_links ?? d.other_links ?? []).join('\n'));
    setContacts((d.contacts ?? []).map((c) => ({ ...c })));
    setError(null);
  }, [open, kyc]);

  function setContact(i: number, patch: Partial<KycContact>) {
    setContacts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  async function save() {
    setError(null);
    const links = otherLinks
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const cleaned = contacts
      .map((c) => ({
        name: c.name?.trim() || undefined,
        role: c.role?.trim() || undefined,
        email: c.email?.trim() || undefined,
        phone: c.phone?.trim() || undefined,
      }))
      .filter((c) => c.name || c.email || c.phone);
    const enriched_data: KycEnrichedData = {
      ...(kyc.enriched_data ?? {}),
      website: website.trim() || undefined,
      linkedin: linkedin.trim() || undefined,
      address: address.trim() || undefined,
      about: about.trim() || undefined,
      other_links: links,
      contacts: cleaned,
    };
    try {
      await update.mutateAsync({
        primary_website: website.trim() || null,
        linkedin_company_url: linkedin.trim() || null,
        other_links: links,
        enriched_data,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit KYC" wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Website</label>
            <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <div>
            <label className="label">LinkedIn</label>
            <input
              className="input"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Address</label>
          <textarea
            className="input min-h-[60px]"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div>
          <label className="label">About</label>
          <textarea
            className="input min-h-[80px]"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Other links (one per line)</label>
          <textarea
            className="input min-h-[60px]"
            value={otherLinks}
            onChange={(e) => setOtherLinks(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0">Public contacts</label>
            <button
              className="text-sm text-brand-600 hover:underline"
              onClick={() => setContacts((cs) => [...cs, {}])}
            >
              + Add row
            </button>
          </div>
          <div className="space-y-2">
            {contacts.length === 0 && (
              <p className="text-xs text-slate-400">No contacts. Add one above.</p>
            )}
            {contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-9">
                <input
                  className="input sm:col-span-2"
                  placeholder="Name"
                  value={c.name ?? ''}
                  onChange={(e) => setContact(i, { name: e.target.value })}
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="Role"
                  value={c.role ?? ''}
                  onChange={(e) => setContact(i, { role: e.target.value })}
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="Email"
                  value={c.email ?? ''}
                  onChange={(e) => setContact(i, { email: e.target.value })}
                />
                <input
                  className="input sm:col-span-2"
                  placeholder="Phone"
                  value={c.phone ?? ''}
                  onChange={(e) => setContact(i, { phone: e.target.value })}
                />
                <button
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => setContacts((cs) => cs.filter((_, idx) => idx !== i))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Editing here updates the KYC record. Use “Add to contacts” on the KYC tab to make a
            contact emailable.
          </p>
        </div>

        {error && <ErrorState error={error} />}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save KYC'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    idle: 'bg-slate-100 text-slate-500',
    pending: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
  };
  const label: Record<Status, string> = {
    idle: 'Not run',
    pending: 'Pending',
    completed: 'Completed',
    failed: 'Failed',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {label[status]}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function Link({ href }: { href: string | null | undefined }) {
  if (!href) return <span className="text-slate-400">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-brand-600 underline hover:text-brand-700 break-all"
    >
      {href}
    </a>
  );
}
