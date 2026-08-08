import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JobSourceProvider, KycContact, KycEnrichedData, KycProfile } from '../lib/types';
import { functions } from '../lib/functions';
import {
  useCompanyJobOpportunities,
  useCompanyJobSources,
  useCreateJobSource,
  useDeleteJobSource,
  useSaveContact,
  useUpdateKyc,
} from '../hooks/useCompany';
import { portalAccessNotice, validSourceIdentifier } from '../lib/jobIntelligence';
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
          <Field label="Website" source={sourceFor(data, 'website')}>
            <Link href={kyc.primary_website} />
          </Field>
          <Field label="LinkedIn" source={sourceFor(data, 'linkedin')}>
            <Link href={kyc.linkedin_company_url} />
          </Field>
          <Field label="Facebook" source={sourceFor(data, 'facebook')}>
            <Link href={data?.facebook} />
          </Field>
          <Field label="Phone" source={sourceFor(data, 'phone')}>
            {data?.phone ?? '—'}
          </Field>
          <Field label="Address" source={sourceFor(data, 'address')}>
            {data?.address ?? '—'}
          </Field>
          <Field label="Industry" source={sourceFor(data, 'industry')}>
            {data?.industry ?? '—'}
          </Field>
          <div className="sm:col-span-2">
            <Field label="About" source={sourceFor(data, 'about')}>
              {data?.about ?? '—'}
            </Field>
          </div>
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
                    {c.source_url ? (
                      <a
                        href={c.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-400 hover:underline"
                        title={c.source_url}
                      >
                        source
                      </a>
                    ) : null}
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

      <JobIntelligencePanel companyId={companyId} />

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

function JobIntelligencePanel({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const sources = useCompanyJobSources(companyId);
  const opportunities = useCompanyJobOpportunities(companyId);
  const createSource = useCreateJobSource(companyId);
  const deleteSource = useDeleteJobSource();
  const [provider, setProvider] = useState<JobSourceProvider>('greenhouse');
  const [identifier, setIdentifier] = useState('');
  const [label, setLabel] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function addSource() {
    const cleaned = identifier.trim();
    if (!validSourceIdentifier(cleaned)) {
      setError('Use the board token or site name from the official career URL (letters, numbers, hyphens, and underscores only).');
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await createSource.mutateAsync({ provider, identifier: cleaned, label });
      setIdentifier('');
      setLabel('');
      setNotice('Source saved. Select Refresh jobs to load its current vacancies.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshJobs() {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await functions.discoverJobs(companyId);
      if (result.errors.length) {
        setError(result.errors.join(' '));
      } else {
        setNotice(`Checked ${result.sources_checked} source${result.sources_checked === 1 ? '' : 's'} and found ${result.discovered} open job${result.discovered === 1 ? '' : 's'}.`);
      }
      qc.invalidateQueries({ queryKey: ['account'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function removeSource(sourceId: string) {
    setError(null);
    try {
      await deleteSource.mutateAsync(sourceId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const sourceNames = new Map((sources.data ?? []).map((source) => [source.id, source.label || `${source.provider}: ${source.identifier}`]));

  return (
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Job Intelligence</h3>
          <p className="text-sm text-slate-500">Find currently open roles from this company’s official MNC career board.</p>
        </div>
        <button className="btn-secondary" onClick={refreshJobs} disabled={running || (sources.data?.length ?? 0) === 0}>
          {running ? 'Refreshing jobs…' : 'Refresh jobs'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <select className="input" value={provider} onChange={(event) => setProvider(event.target.value as JobSourceProvider)}>
          <option value="greenhouse">Greenhouse</option>
          <option value="lever">Lever</option>
        </select>
        <input className="input" placeholder={provider === 'greenhouse' ? 'Greenhouse board token' : 'Lever site name'} value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
        <input className="input" placeholder="Label (optional)" value={label} onChange={(event) => setLabel(event.target.value)} />
        <button className="btn-primary" onClick={addSource} disabled={createSource.isPending || !identifier.trim()}>
          {createSource.isPending ? 'Saving…' : 'Add source'}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        This is not a password or API key. Copy the last part of the public career URL: use <code>acme</code> from{' '}
        <code>https://boards.greenhouse.io/acme</code> for Greenhouse, or from <code>https://jobs.lever.co/acme</code>{' '}
        for Lever. Only public, official ATS feeds are connected.
      </p>

      {(sources.data?.length ?? 0) > 0 && (
        <ul className="space-y-1 text-sm">
          {sources.data?.map((source) => (
            <li key={source.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 px-2 py-1.5">
              <span className="font-medium">{source.label || source.identifier}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{source.provider}</span>
              {source.last_checked_at && <span className="text-xs text-slate-400">Checked {new Date(source.last_checked_at).toLocaleString()}</span>}
              <button className="ml-auto text-xs text-red-600 hover:underline" onClick={() => removeSource(source.id)} disabled={deleteSource.isPending}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      {error && <ErrorState error={error} />}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p>{portalAccessNotice('linkedin')}</p>
        <p className="mt-1">{portalAccessNotice('mycareersfuture')}</p>
      </div>

      <div>
        <div className="label">Open roles</div>
        {opportunities.isLoading ? (
          <p className="text-sm text-slate-400">Loading jobs…</p>
        ) : opportunities.data?.length ? (
          <ul className="space-y-2">
            {opportunities.data.map((job) => (
              <li key={job.id} className="rounded border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{job.title}</p>
                    <p className="text-slate-500">{[job.location, job.department, job.workplace_type].filter(Boolean).join(' · ') || 'Location not listed'}</p>
                  </div>
                  <a className="btn-secondary shrink-0" href={job.apply_url} target="_blank" rel="noreferrer">Apply on official site</a>
                </div>
                <p className="mt-1 text-xs text-slate-400">Source: {sourceNames.get(job.job_source_config_id) ?? 'Official career board'} · Last seen {new Date(job.last_seen_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">Add an official Greenhouse or Lever source, then refresh to see open roles.</p>
        )}
      </div>
    </section>
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
  const [facebook, setFacebook] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState('');
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
    setFacebook(d.facebook ?? '');
    setPhone(d.phone ?? '');
    setIndustry(d.industry ?? '');
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
      facebook: facebook.trim() || undefined,
      phone: phone.trim() || undefined,
      industry: industry.trim() || undefined,
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
          <div>
            <label className="label">Facebook</label>
            <input
              className="input"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Industry</label>
            <input
              className="input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
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

/** The URL a value was taken from, e.g. "google:maps" or the page that was scraped. */
function sourceFor(data: KycEnrichedData | null | undefined, field: string): string | undefined {
  return data?.sources?.find((s) => s.field === field)?.url;
}

function Field({
  label,
  source,
  children,
}: {
  label: string;
  source?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <div className="label">{label}</div>
        {source && <SourceTag url={source} />}
      </div>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

/** Shows where a field came from so a wrong value can be traced (and corrected). */
function SourceTag({ url }: { url: string }) {
  const label = url.startsWith('google:')
    ? url.replace('google:', 'Google ')
    : url === 'crm'
      ? 'CRM'
      : (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, '');
          } catch {
            return url;
          }
        })();

  const isLink = /^https?:\/\//.test(url);
  const cls = 'text-[10px] uppercase tracking-wide text-slate-400';
  return isLink ? (
    <a href={url} target="_blank" rel="noreferrer" className={`${cls} hover:underline`} title={url}>
      {label}
    </a>
  ) : (
    <span className={cls}>{label}</span>
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
