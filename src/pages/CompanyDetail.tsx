import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompany,
  useCompanyAttachments,
  useCompanyDeals,
  useCompanyEmailSends,
  useCompanyKyc,
} from '../hooks/useCompany';
import { functions } from '../lib/functions';
import { formatDate } from '../lib/dates';
import { KycPanel } from '../components/KycPanel';
import { AttachmentList } from '../components/AttachmentList';
import { CompanyEditModal, ContactsEditor } from '../components/CustomerEditor';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, PriorityBadge, Spinner, StatusBadge } from '../components/ui';
import type { EmailSend } from '../lib/types';
import { HistoryBackLink } from '../components/HistoryBackLink';
import { ImportRecoveryWarning } from '../components/ImportRecoveryWarning';
import { useStorageStatus } from '../hooks/useStorageStatus';
import { importRecoveryLock } from '../lib/storageStatus';

type Tab = 'hubspot' | 'kyc' | 'emails';

export function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('hubspot');
  const [importing, setImporting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const storageStatus = useStorageStatus();
  const importLock = importRecoveryLock(storageStatus.data, {
    loading: storageStatus.isLoading,
    failed: !!storageStatus.error,
  });

  const { data: company, isLoading, error } = useCompany(id);

  async function importThis() {
    if (!id) return;
    if (importLock.locked) {
      setBanner(importLock.message);
      return;
    }
    setImporting(true);
    setBanner(null);
    try {
      const res = await functions.hubspotIngest({ company_id: id });
      const problems = [...(res.warnings ?? []), ...(res.errors ?? [])];
      setBanner(
        `Updated: ${res.counts.deals} deals, ${res.counts.contacts} contacts, ${res.counts.attachments} attachments.` +
          // Show the real reason rather than a warning count — a HubSpot auth or
          // scope failure used to be invisible here.
          (problems.length ? `\n${problems.join('\n')}` : '')
      );
      ['company-deals', 'company-contacts', 'company-attachments'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k, id] })
      );
      qc.invalidateQueries({ queryKey: ['company', id] });
    } catch (e) {
      setBanner(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  if (isLoading) return <Spinner label="Loading company…" />;
  if (error) return <ErrorState error={error} />;
  if (!company) return <EmptyState>Company not found.</EmptyState>;

  return (
    <div className="space-y-4">
      <HistoryBackLink fallback="/">← Back to previous view</HistoryBackLink>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{company.name_clean}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <PriorityBadge value={company.source_priority} />
            {company.industry && <span>· {company.industry}</span>}
            {company.website && (
              <a
                className="text-brand-600 underline"
                href={company.website}
                target="_blank"
                rel="noreferrer"
              >
                {company.website}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setEditOpen(true)}>
            Edit details
          </button>
          <button
            className="btn-secondary"
            onClick={importThis}
            disabled={importing || importLock.locked}
            title={importLock.locked ? importLock.message : undefined}
          >
            {importing ? 'Importing…' : importLock.locked ? 'HubSpot import temporarily disabled' : 'Run HubSpot import/update'}
          </button>
        </div>
      </div>

      <ImportRecoveryWarning
        lock={importLock}
        onRefresh={storageStatus.refetch}
      />

      <CompanyEditModal
        company={company}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />

      {banner && (
        <div className="whitespace-pre-line rounded-md border border-brand-200 bg-brand-50 p-3 text-sm text-brand-800">
          {banner}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {(['hubspot', 'kyc', 'emails'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t
                ? 'border-b-2 border-brand-600 text-brand-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'hubspot' ? 'HubSpot data' : t === 'kyc' ? 'KYC' : 'Email history'}
          </button>
        ))}
      </div>

      {tab === 'hubspot' && id && <HubspotTab companyId={id} />}
      {tab === 'kyc' && id && <KycTab companyId={id} />}
      {tab === 'emails' && id && <EmailsTab companyId={id} />}
    </div>
  );
}

function HubspotTab({ companyId }: { companyId: string }) {
  const deals = useCompanyDeals(companyId);
  const attachments = useCompanyAttachments(companyId);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 font-semibold">Deals</h2>
        {deals.isLoading ? (
          <Spinner />
        ) : deals.data && deals.data.length > 0 ? (
          <div className="card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Deal</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Modified</th>
                  <th className="px-3 py-2">Archived</th>
                </tr>
              </thead>
              <tbody>
                {deals.data.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {d.product ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          {d.product}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{d.deal_name_raw ?? '—'}</td>
                    <td className="px-3 py-2">{d.deal_stage ?? '—'}</td>
                    <td className="px-3 py-2">{d.amount != null ? `$${d.amount}` : '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {formatDate(d.hubspot_created_at) || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                      {formatDate(d.hubspot_modified_at) || '—'}
                    </td>
                    <td className="px-3 py-2">
                      {d.is_archived ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          archived
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>No deals imported yet.</EmptyState>
        )}
      </section>

      <ContactsEditor companyId={companyId} />

      <section>
        <h2 className="mb-2 font-semibold">Attachments</h2>
        {attachments.isLoading ? (
          <Spinner />
        ) : (
          <AttachmentList attachments={attachments.data ?? []} companyId={companyId} />
        )}
      </section>
    </div>
  );
}

function KycTab({ companyId }: { companyId: string }) {
  const { data, isLoading } = useCompanyKyc(companyId);
  if (isLoading) return <Spinner />;
  return <KycPanel companyId={companyId} kyc={data ?? null} />;
}

function EmailsTab({ companyId }: { companyId: string }) {
  const { data, isLoading } = useCompanyEmailSends(companyId);
  const [view, setView] = useState<EmailSend | null>(null);

  if (isLoading) return <Spinner />;
  if (!data || data.length === 0) return <EmptyState>No emails sent yet.</EmptyState>;

  return (
    <div className="card divide-y divide-slate-100">
      {data.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-x-4 px-3 py-2 text-sm">
          <StatusBadge value={e.status} />
          <span className="font-medium">{e.subject ?? '(no subject)'}</span>
          <span className="text-slate-500">{e.to_email}</span>
          <span className="text-slate-400">
            {e.sent_at ? new Date(e.sent_at).toLocaleString() : e.next_attempt_at ? `Next attempt ${new Date(e.next_attempt_at).toLocaleString()}` : ''}
          </span>
          <button
            className="ml-auto text-brand-600 hover:underline"
            onClick={() => setView(e)}
          >
            View email
          </button>
        </div>
      ))}

      <Modal open={!!view} onClose={() => setView(null)} title={view?.subject ?? 'Email'} wide>
        {view && (
          <div className="space-y-2 text-sm">
            <div className="text-slate-500">To: {view.to_email}</div>
            {view.error_message && <ErrorState error={view.error_message} />}
            {view.next_attempt_at && view.status !== 'sent' && (
              <div className="text-slate-500">Next attempt: {new Date(view.next_attempt_at).toLocaleString()} · attempt {view.attempt_count}</div>
            )}
            <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3">
              {view.body_rendered ?? '(no stored body)'}
            </pre>
            {view.provider_message_id && (
              <div className="text-xs text-slate-400">
                Message id: {view.provider_message_id}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
