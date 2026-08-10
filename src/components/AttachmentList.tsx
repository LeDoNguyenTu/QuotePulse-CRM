import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Attachment } from '../lib/types';
import { functions } from '../lib/functions';
import { EmptyState, ErrorState } from './ui';
import { useSettings } from '../hooks/useSettings';
import { hubspotFilePreviewUrl } from '../lib/hubspotLinks';

export function AttachmentList({
  attachments,
  companyId,
}: {
  attachments: Attachment[];
  companyId: string;
}) {
  const settings = useSettings();
  if (attachments.length === 0) {
    return <EmptyState>No attachments imported yet.</EmptyState>;
  }
  return (
    <div className="space-y-2">
      {attachments.map((a) => (
        <AttachmentRow key={a.id} attachment={a} companyId={companyId} portalId={settings.data?.hubspot_portal_id} uiDomain={settings.data?.hubspot_ui_domain} />
      ))}
    </div>
  );
}

function AttachmentRow({
  attachment,
  companyId,
  portalId,
  uiDomain,
}: {
  attachment: Attachment;
  companyId: string;
  portalId?: string | null;
  uiDomain?: string | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    setBusy(true);
    setError(null);
    try {
      await functions.parseQuote(attachment.id);
      qc.invalidateQueries({ queryKey: ['company-attachments', companyId] });
      qc.invalidateQueries({ queryKey: ['company-contacts', companyId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = attachment.parsed_summary;
  const preview = attachment.source_type !== 'quote' ? hubspotFilePreviewUrl(portalId, uiDomain, attachment.hubspot_attachment_id) : null;

  return (
    <div className="rounded-md border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800">
            {attachment.file_name ?? 'attachment'}
            {attachment.source_type === 'quote' && (
              <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-xs text-brand-700">
                quote
              </span>
            )}
          </div>
          {attachment.file_url ? (
            <a
              href={attachment.file_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-600 underline break-all"
            >
              {attachment.file_url}
            </a>
          ) : preview ? (
            <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-brand-600 underline">Open in HubSpot</a>
          ) : attachment.hubspot_attachment_id ? (
            // Private HubSpot files have no durable URL — the download link is
            // minted on demand when we parse them.
            <p className="text-xs text-slate-400">Stored in HubSpot · fetched on demand</p>
          ) : null}
        </div>
        <button className="btn-secondary shrink-0" onClick={parse} disabled={busy}>
          {busy ? 'Parsing…' : attachment.parsed ? 'Re-parse (OCR)' : 'Parse quote (OCR)'}
        </button>
      </div>

      {error && (
        <div className="mt-2">
          <ErrorState error={error} />
        </div>
      )}

      {attachment.parsed && s && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <Row k="Company" v={s.company_name} />
          <Row k="Contact" v={s.contact_name} />
          <Row k="Email" v={s.email} />
          <Row k="Phone" v={s.phone} />
          <Row k="Address" v={s.address} />
          <Row k="Quote #" v={s.quote_number} />
        </dl>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <>
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-slate-700">{v || '—'}</dd>
    </>
  );
}
