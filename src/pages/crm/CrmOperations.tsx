import { useState } from 'react';
import { StorageStatusPanel } from '../../components/StorageStatusPanel';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';
import { useCrmOperations, useSaveProviderBudget } from '../../hooks/crm/useCrmOperations';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { usageLevel, type TrackedUsageCard } from '../../lib/crm/providerUsage';

function sourceLabel(source: string) { return source === 'provider_reported' ? 'Provider reported' : 'CRM tracked'; }

function UsageCard({ name, value }: { name: string; value: TrackedUsageCard }) {
  const level = usageLevel(value.used, value.limit);
  return <article className={`crm-operations-card crm-operations-card--${level}`}><div className="crm-operations-card__heading"><h3>{name}</h3><span>{sourceLabel(value.source)}</span></div><strong>{value.limit === null ? `${value.used.toLocaleString()} tracked · limit unknown` : `${value.used.toLocaleString()} of ${value.limit.toLocaleString()}`}</strong><p>{value.resetAt ? `Resets ${new Date(value.resetAt).toLocaleString()}` : 'No authoritative reset time is available.'}</p></article>;
}

function BudgetEditor({ provider, initialLimit, initialReset, saving, onSave }: { provider: 'serper' | 'nvidia'; initialLimit: number | null; initialReset: string | null; saving: boolean; onSave: (limit: number | null, resetAt: string | null) => void }) {
  const [limit, setLimit] = useState(initialLimit?.toString() ?? '');
  const [reset, setReset] = useState(initialReset?.slice(0, 10) ?? '');
  return <div className="crm-budget-editor"><label>Tracked budget<input className="input" type="number" min={1} value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="Unknown" /></label><label>Reset date<input className="input" type="date" value={reset} onChange={(event) => setReset(event.target.value)} /></label><button type="button" className="btn-secondary" disabled={saving} onClick={() => onSave(limit ? Number(limit) : null, reset ? new Date(`${reset}T00:00:00Z`).toISOString() : null)}>Save {provider} budget</button></div>;
}

export function CrmOperations() {
  const workspace = useActiveWorkspace();
  const status = useCrmOperations(workspace.id);
  const saveBudget = useSaveProviderBudget(workspace.id);
  if (status.isLoading) return <Spinner label="Loading operations..." />;
  if (status.error || !status.data) return <ErrorState error={status.error ?? new Error('Operations status unavailable.')} />;
  const data = status.data;
  return <div className="space-y-7">
    <CrmPageHeader eyebrow={workspace.name} title="Operations" description="Delivery health, provider usage, budgets, and storage capacity in one place." action={<button type="button" className="btn-secondary" disabled={status.isFetching} onClick={() => void status.refetch()}>{status.isFetching ? 'Refreshing...' : 'Refresh'}</button>} />
    <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Delivery health</h2><span>{data.delivery.failed} failed</span></div><div className="crm-operations-grid"><article className="crm-operations-card"><h3>Queue</h3><strong>{data.delivery.queued.toLocaleString()} waiting</strong><p>{data.delivery.oldestQueuedAt ? `Oldest queued ${new Date(data.delivery.oldestQueuedAt).toLocaleString()}` : 'No queued messages.'}</p></article><article className={`crm-operations-card crm-operations-card--${data.brevo.status === 'unhealthy' ? 'critical' : 'normal'}`}><div className="crm-operations-card__heading"><h3>Brevo</h3><span>Provider reported</span></div><strong>{data.brevo.status.replace('_', ' ')}</strong><p>{data.brevo.message || 'Connection status returned without an error.'}</p>{data.brevo.credits.map((credit, index) => <p key={`${credit.type ?? 'credit'}-${index}`}>{Number(credit.credits ?? 0).toLocaleString()} {credit.creditsType ?? ''} {credit.type ?? 'account'} credits</p>)}{data.brevo.rateLimit && <p>{data.brevo.rateLimit.remaining.toLocaleString()} of {data.brevo.rateLimit.limit.toLocaleString()} API requests remaining · resets in about {data.brevo.rateLimit.resetSeconds} seconds</p>}</article></div></section>
    <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Recent failures</h2><span>{data.delivery.recentFailures.length}</span></div>{data.delivery.recentFailures.length ? <div className="crm-task-list">{data.delivery.recentFailures.map((failure) => <article key={failure.id} className="crm-operations-failure"><div><strong>{failure.campaignName || 'Direct email'}</strong><p>{failure.toEmail} · {failure.status} · {new Date(failure.occurredAt).toLocaleString()}</p><small>{failure.summary}</small></div>{failure.campaignId && <a className="btn-secondary" href={`/w/${workspace.id}/sales/email-campaigns?campaign=${failure.campaignId}`}>View campaign</a>}</article>)}</div> : <p className="crm-panel-empty">No recent delivery failures.</p>}</section>
    <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Provider usage</h2><span>Honest source labels</span></div><div className="crm-operations-grid"><UsageCard name="Microsoft Outlook" value={data.microsoft} /><UsageCard name="Serper search" value={data.serper} /><UsageCard name="NVIDIA OCR" value={data.nvidia} /></div><div className="crm-operations-grid"><BudgetEditor provider="serper" initialLimit={data.serper.limit} initialReset={data.serper.resetAt} saving={saveBudget.isPending} onSave={(limit, resetAt) => void saveBudget.mutateAsync({ provider: 'serper', limit, resetAt })} /><BudgetEditor provider="nvidia" initialLimit={data.nvidia.limit} initialReset={data.nvidia.resetAt} saving={saveBudget.isPending} onSave={(limit, resetAt) => void saveBudget.mutateAsync({ provider: 'nvidia', limit, resetAt })} /></div></section>
    <StorageStatusPanel />
  </div>;
}
