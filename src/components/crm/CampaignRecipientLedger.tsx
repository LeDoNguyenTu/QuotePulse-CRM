import type { CrmCampaignRecipientReport } from '../../lib/crm/types';
import { classifyDeliveryFailure } from '../../lib/crm/emailDelivery';
import { formatCrmDate } from '../../lib/crm/presenters';
import { EmailContentPreview } from './EmailContentPreview';

export function CampaignRecipientLedger({ rows, loading, error, onRetry, retryingId }: { rows: CrmCampaignRecipientReport[]; loading: boolean; error: unknown; onRetry: (sendId: string) => void; retryingId: string | null }) {
  if (loading) return <p className="crm-panel-empty">Loading recipient delivery history...</p>;
  if (error) return <p className="crm-panel-empty" role="alert">Unable to load recipient delivery history.</p>;
  return rows.length ? <div className="crm-campaign-ledger">
    {rows.map((row) => {
      const failure = classifyDeliveryFailure(row);
      return <article key={`${row.id}-${row.attempt_id ?? 'blocked'}`} className="crm-campaign-ledger__row">
        <div><strong>{row.contact_name || row.email_normalized}</strong><p>{row.company_name || 'No company'} · {row.email_normalized}</p></div>
        <div className="crm-campaign-ledger__delivery"><span className={`crm-status crm-status--${row.status}`}>{row.status}</span><small>{row.provider?.replace('_', ' ') || 'No provider'} · attempt {Math.max(1, row.attempt_count ?? 0)} · {formatCrmDate(row.sent_at || row.send_updated_at || row.send_created_at)}</small>{row.provider_message_id && <small>Provider ID: {row.provider_message_id}</small>}</div>
        {row.error_message && <p className="crm-inline-status crm-inline-status--error">{failure.summary}</p>}
        {row.attempt_id && <EmailContentPreview subject={row.subject} bodyText={row.body_rendered} bodyHtml={row.body_html_rendered} />}
        {row.is_current_attempt && row.attempt_id && failure.retryable && <button type="button" className="btn-secondary" disabled={retryingId === row.attempt_id} onClick={() => onRetry(row.attempt_id!)}>{retryingId === row.attempt_id ? 'Retrying...' : 'Retry failed send'}</button>}
      </article>;
    })}
  </div> : <p className="crm-panel-empty">No recipient records were found for this campaign.</p>;
}
