import type { CrmEmailSendHistory } from '../../lib/crm/types';
import { classifyDeliveryFailure } from '../../lib/crm/emailDelivery';
import { formatCrmDate } from '../../lib/crm/presenters';
import { EmailContentPreview } from './EmailContentPreview';

export function ContactEmailHistory({ rows, loading = false, error = null, onRetry, retryingId }: { rows: CrmEmailSendHistory[]; loading?: boolean; error?: unknown; onRetry: (sendId: string) => void; retryingId: string | null }) {
  return <section className="crm-detail-panel">
    <div className="crm-panel-heading"><h2>Email history</h2><span>{rows.length}</span></div>
    {loading ? <p className="crm-panel-empty">Loading email history...</p> : error ? <p className="crm-panel-empty" role="alert">Unable to load email history.</p> : rows.length ? <div className="crm-email-history-list">
      {rows.map((row) => {
        const failure = classifyDeliveryFailure(row);
        return <article key={row.id} className="crm-email-history-card">
          <div className="crm-email-history-card__header"><div><strong>{row.campaign_name || 'Direct email'}</strong><span>{row.to_email}</span></div><span className={`crm-status crm-status--${row.status}`}>{row.status}</span></div>
          <div className="crm-email-history-card__meta"><span>{row.provider.replace('_', ' ')}</span><span>Attempt {Math.max(1, row.attempt_count)}</span><span>{formatCrmDate(row.sent_at || row.updated_at || row.created_at)}</span>{row.provider_message_id && <span>Provider ID: {row.provider_message_id}</span>}</div>
          {row.error_message && <p className="crm-inline-status crm-inline-status--error">{failure.summary}</p>}
          <EmailContentPreview subject={row.subject} bodyText={row.body_rendered} bodyHtml={row.body_html_rendered} />
          {failure.retryable && <button type="button" className="btn-secondary" disabled={retryingId === row.id} onClick={() => onRetry(row.id)}>{retryingId === row.id ? 'Retrying...' : 'Retry failed send'}</button>}
        </article>;
      })}
    </div> : <p className="crm-panel-empty">No campaign email has been recorded for this contact.</p>}
  </section>;
}
