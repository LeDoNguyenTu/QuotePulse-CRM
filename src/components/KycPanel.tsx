import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { KycProfile } from '../lib/types';
import { functions } from '../lib/functions';
import { ErrorState } from './ui';

interface KycPanelProps {
  companyId: string;
  kyc: KycProfile | null;
}

type Status = 'idle' | 'pending' | 'completed' | 'failed';

export function KycPanel({ companyId, kyc }: KycPanelProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>(kyc ? 'completed' : 'idle');
  const [error, setError] = useState<string | null>(null);

  async function runEnrich() {
    setStatus('pending');
    setError(null);
    try {
      await functions.enrichKyc(companyId);
      setStatus('completed');
      qc.invalidateQueries({ queryKey: ['company-kyc', companyId] });
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const data = kyc?.enriched_data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={runEnrich} disabled={status === 'pending'}>
          {status === 'pending' ? 'Enriching…' : kyc ? 'Re-run KYC' : 'Enrich KYC'}
        </button>
        <StatusPill status={status} />
        {kyc?.last_enriched_at && (
          <span className="text-xs text-slate-400">
            Last enriched {new Date(kyc.last_enriched_at).toLocaleString()}
          </span>
        )}
      </div>

      {error && <ErrorState error={error} />}

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
                  <li key={i} className="rounded border border-slate-100 px-2 py-1">
                    <span className="font-medium">{c.name ?? 'Unknown'}</span>
                    {c.role ? ` — ${c.role}` : ''}
                    {c.email ? ` · ${c.email}` : ''}
                    {c.phone ? ` · ${c.phone}` : ''}
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
    </div>
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
