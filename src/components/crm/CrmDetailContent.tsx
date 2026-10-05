import { createContext, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CrmActivity, CrmCompany, CrmContact, CrmDeal, CrmTask } from '../../lib/crm/types';
import type { CrmDetailData, CrmDetailKind, CrmSourceLineage } from '../../lib/crm/detailQueries';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import { displayText, formatCrmDate, formatCrmMoney } from '../../lib/crm/presenters';
import { normalizeWebsiteUrl } from '../../lib/crm/inputs';
import { fieldSourceLabel } from '../../lib/crm/companyEnrichment';
import { CrmActivityEditor } from './CrmActivityComposer';
import type { CrmActivityEditInput } from '../../lib/crm/activityInput';

type DealContactRow = { role: string | null; contact: CrmContact | null };
type ContactDealRow = { role: string | null; deal: CrmDeal | null };
const ActivityEditContext = createContext<{
  pending: boolean;
  onEdit?: (activityId: string, input: CrmActivityEditInput) => Promise<unknown>;
}>({ pending: false });

function Fact({ label, value, href }: { label: string; value: string; href?: string | null }) {
  return <div className="crm-detail-fact"><dt>{label}</dt><dd>{href ? <a href={href} target="_blank" rel="noreferrer">{value}</a> : value}</dd></div>;
}

function RecordLink({ workspaceId, kind, id, children }: { workspaceId: string; kind: 'company' | 'contact' | 'deal'; id: string; children: string }) {
  return <Link className="crm-record-link" to={crmRecordPath(workspaceId, kind, id)}>{children}</Link>;
}

function LineageRail({ lineage, total }: { lineage: CrmSourceLineage[]; total: number }) {
  return <aside className="crm-lineage-rail" aria-label="Source lineage">
    <div className="crm-panel-heading"><h2>Source lineage</h2><span>{total}</span></div>
    {lineage.length === 0 ? <p className="crm-panel-empty">No workbook source is linked to this record.</p> : <ol className="crm-lineage-list">
      {lineage.map((item, index) => <li key={`${item.source_import?.database_id ?? 'source'}-${item.source_row_number}-${index}`}>
        <strong>{item.source_import?.database_id ?? 'Unknown source'}</strong>
        <span>{item.source_import?.original_filename ?? 'Filename unavailable'}</span>
        <small>{displayText(item.source_import?.sheet_name, 'Worksheet not recorded')} · Row {item.source_row_number}</small>
      </li>)}
    </ol>}
    <TruncationNotice shown={lineage.length} total={total} />
  </aside>;
}

function ActivityTimeline({ activities, total }: { activities: CrmActivity[]; total: number }) {
  const edit = useContext(ActivityEditContext);
  const [editingId, setEditingId] = useState<string | null>(null);
  return <section className="crm-detail-panel crm-activity-preview">
    <div className="crm-panel-heading"><h2>Activity timeline</h2><span>{total}</span></div>
    {activities.length ? <ol className="crm-activity-list">{activities.map((activity) => <li className="crm-activity-card" key={activity.id}>
      <div className="crm-activity-card__header"><strong>{activity.kind === 'call' ? 'Call' : activity.kind === 'note' ? 'Note' : 'Task update'}</strong><time dateTime={activity.occurred_at}>{formatCrmDate(activity.occurred_at)}</time></div>
      {editingId === activity.id && edit.onEdit
        ? <CrmActivityEditor activity={activity} pending={edit.pending} onCancel={() => setEditingId(null)} onSave={async (input) => { await edit.onEdit?.(activity.id, input); setEditingId(null); }} />
        : <p className="crm-activity-card__body">{activity.body}</p>}
      <div className="crm-activity-card__meta">
        <span>Created by {activity.created_by}</span>
        <span>Updated by {activity.updated_by} · {formatCrmDate(activity.updated_at)}</span>
        {activity.call_outcome && <span>Outcome: {activity.call_outcome}</span>}
        {activity.source_column && <span>{activity.source_import?.original_filename ?? 'Workbook'} · Row {activity.source_row_number ?? '—'} · {activity.source_column}</span>}
        {activity.task && <span>Task: {activity.task.title} · {activity.task.status.replace('_', ' ')} · due {formatCrmDate(activity.task.due_at)}</span>}
        {edit.onEdit && activity.kind !== 'task_event' && editingId !== activity.id && <button type="button" className="crm-text-action" onClick={() => setEditingId(activity.id)}>Edit</button>}
      </div>
    </li>)}</ol> : <p className="crm-panel-empty">No notes or calls have been recorded yet.</p>}
    <TruncationNotice shown={activities.length} total={total} />
  </section>;
}

function RelatedTasks({ workspaceId, tasks, total }: { workspaceId: string; tasks: CrmTask[]; total: number }) {
  return <section className="crm-detail-panel">
    <div className="crm-panel-heading"><h2>Related tasks</h2><span>{total}</span></div>
    {tasks.length ? <div className="crm-association-list">{tasks.map((task) => {
      const relation = task.deal
        ? <RecordLink workspaceId={workspaceId} kind="deal" id={task.deal.id}>{task.deal.name}</RecordLink>
        : task.contact
          ? <RecordLink workspaceId={workspaceId} kind="contact" id={task.contact.id}>{displayText(task.contact.full_name, 'Unnamed contact')}</RecordLink>
          : task.company
            ? <RecordLink workspaceId={workspaceId} kind="company" id={task.company.id}>{task.company.name}</RecordLink>
            : null;
      return <article key={task.id}><div><strong>{task.title}</strong><p>{relation ?? displayText(task.description)}</p></div><span>{task.status.replace('_', ' ')} · {formatCrmDate(task.due_at)}</span></article>;
    })}</div> : <p className="crm-panel-empty">No tasks are linked to this record.</p>}
    <TruncationNotice shown={tasks.length} total={total} />
  </section>;
}

function TruncationNotice({ shown, total }: { shown: number; total: number }) {
  return total > shown ? <p className="crm-panel-note">Showing the first {shown} of {total} records.</p> : null;
}

function CompanyDetail({ workspaceId, data }: { workspaceId: string; data: CrmDetailData<CrmCompany> }) {
  const company = data.record!;
  const contacts = (data.associations[0] ?? []) as CrmContact[];
  const deals = (data.associations[1] ?? []) as CrmDeal[];
  const address = [company.address_line_1, company.address_line_2, company.city, company.state_region, company.postal_code, company.country].filter(Boolean).join(', ');
  return <>
    <header className="crm-detail-hero"><div><p className="crm-detail-kicker">Company account</p><h1>{company.name}</h1><p>{displayText(company.industry, 'Industry not classified')}</p></div><div className="crm-detail-stamp"><span>Updated</span><strong>{formatCrmDate(company.updated_at)}</strong></div></header>
    <div className="crm-detail-grid"><main className="space-y-5">
      <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Account profile</h2><span>Core record</span></div><dl className="crm-detail-facts">
        <Fact label={`Industry · ${fieldSourceLabel(company.field_sources?.industry)}`} value={displayText(company.industry)} /><Fact label={`Domain · ${fieldSourceLabel(company.field_sources?.domain)}`} value={displayText(company.domain)} />
        <Fact label="Website" value={displayText(company.website)} href={normalizeWebsiteUrl(company.website)} /><Fact label="Phone" value={displayText(company.phone)} />
        <Fact label="Address" value={displayText(address)} /><Fact label="Created" value={formatCrmDate(company.created_at)} />
      </dl></section>
      <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Staff contacts</h2><span>{data.associationCounts[0] ?? contacts.length}</span></div>{contacts.length ? <div className="crm-association-list">{contacts.map((contact) => <div key={contact.id}><div><RecordLink workspaceId={workspaceId} kind="contact" id={contact.id}>{displayText(contact.full_name ?? [contact.first_name, contact.last_name].filter(Boolean).join(' '), 'Unnamed contact')}</RecordLink><p>{displayText(contact.job_title)}</p></div><span>{displayText(contact.email)}</span></div>)}</div> : <p className="crm-panel-empty">No staff contacts are linked to this company.</p>}<TruncationNotice shown={contacts.length} total={data.associationCounts[0] ?? contacts.length} /></section>
      <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Associated deals</h2><span>{data.associationCounts[1] ?? deals.length}</span></div>{deals.length ? <div className="crm-association-list">{deals.map((deal) => <div key={deal.id}><div><RecordLink workspaceId={workspaceId} kind="deal" id={deal.id}>{deal.name}</RecordLink><p>{deal.stage}</p></div><strong>{formatCrmMoney(deal.amount, deal.currency)}</strong></div>)}</div> : <p className="crm-panel-empty">No deals are linked to this company.</p>}<TruncationNotice shown={deals.length} total={data.associationCounts[1] ?? deals.length} /></section>
      <RelatedTasks workspaceId={workspaceId} tasks={data.tasks ?? []} total={data.taskCount ?? 0} />
      <ActivityTimeline activities={data.activities} total={data.activityCount} />
    </main><LineageRail lineage={data.lineage} total={data.lineageCount} /></div>
  </>;
}

function ContactDetail({ workspaceId, data }: { workspaceId: string; data: CrmDetailData<CrmContact> }) {
  const contact = data.record!;
  const deals = (data.associations[0] ?? []) as ContactDealRow[];
  const name = displayText(contact.full_name ?? [contact.first_name, contact.last_name].filter(Boolean).join(' '), 'Unnamed contact');
  return <>
    <header className="crm-detail-hero"><div><p className="crm-detail-kicker">Contact record</p><h1>{name}</h1><p>{displayText(contact.job_title, 'Role not recorded')}</p></div><div className="crm-detail-stamp"><span>Updated</span><strong>{formatCrmDate(contact.updated_at)}</strong></div></header>
    <div className="crm-detail-grid"><main className="space-y-5"><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Contact profile</h2><span>Core record</span></div><dl className="crm-detail-facts">
      <Fact label="Email" value={displayText(contact.email)} href={contact.email ? `mailto:${contact.email}` : null} /><Fact label="Phone" value={displayText(contact.phone)} />
      <Fact label="Job title" value={displayText(contact.job_title)} /><Fact label="Created" value={formatCrmDate(contact.created_at)} />
      <div className="crm-detail-fact"><dt>Company</dt><dd>{contact.company ? <RecordLink workspaceId={workspaceId} kind="company" id={contact.company.id}>{contact.company.name}</RecordLink> : '—'}</dd></div>
    </dl></section><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Associated deals</h2><span>{data.associationCounts[0] ?? deals.length}</span></div>{deals.length ? <div className="crm-association-list">{deals.map(({ deal, role }, index) => deal && <div key={deal.id ?? index}><div><RecordLink workspaceId={workspaceId} kind="deal" id={deal.id}>{deal.name}</RecordLink><p>{displayText(role, deal.stage)}</p></div><strong>{formatCrmMoney(deal.amount, deal.currency)}</strong></div>)}</div> : <p className="crm-panel-empty">No deals are linked to this contact.</p>}<TruncationNotice shown={deals.length} total={data.associationCounts[0] ?? deals.length} /></section><RelatedTasks workspaceId={workspaceId} tasks={data.tasks ?? []} total={data.taskCount ?? 0} /><ActivityTimeline activities={data.activities} total={data.activityCount} /></main><LineageRail lineage={data.lineage} total={data.lineageCount} /></div>
  </>;
}

function DealDetail({ workspaceId, data }: { workspaceId: string; data: CrmDetailData<CrmDeal> }) {
  const deal = data.record!;
  const contacts = (data.associations[0] ?? []) as DealContactRow[];
  return <>
    <header className="crm-detail-hero crm-detail-hero--deal"><div><p className="crm-detail-kicker">Deal record</p><h1>{deal.name}</h1><p>{deal.company ? <RecordLink workspaceId={workspaceId} kind="company" id={deal.company.id}>{deal.company.name}</RecordLink> : 'No company linked'}</p></div><div className="crm-detail-value"><span>{deal.stage}</span><strong>{formatCrmMoney(deal.amount, deal.currency)}</strong><em className={`crm-status crm-status--${deal.status}`}>{deal.status.replace('_', ' ')}</em></div></header>
    <div className="crm-detail-grid"><main className="space-y-5"><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Pipeline position</h2><span>Core record</span></div><dl className="crm-detail-facts">
      <Fact label="Stage" value={deal.stage} /><Fact label="Status" value={deal.status.replace('_', ' ')} /><Fact label="Last call" value={formatCrmDate(deal.last_call_at)} /><Fact label="Follow up" value={formatCrmDate(deal.follow_up_at)} /><Fact label="Created" value={formatCrmDate(deal.created_at)} /><Fact label="Updated" value={formatCrmDate(deal.updated_at)} />
    </dl></section><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Buying contacts</h2><span>{data.associationCounts[0] ?? contacts.length}</span></div>{contacts.length ? <div className="crm-association-list">{contacts.map(({ contact, role }, index) => contact && <div key={contact.id ?? index}><div><RecordLink workspaceId={workspaceId} kind="contact" id={contact.id}>{displayText(contact.full_name ?? contact.email, 'Unnamed contact')}</RecordLink><p>{displayText(role ?? contact.job_title)}</p></div><span>{displayText(contact.email)}</span></div>)}</div> : <p className="crm-panel-empty">No contacts are linked to this deal.</p>}<TruncationNotice shown={contacts.length} total={data.associationCounts[0] ?? contacts.length} /></section><RelatedTasks workspaceId={workspaceId} tasks={data.tasks ?? []} total={data.taskCount ?? 0} /><ActivityTimeline activities={data.activities} total={data.activityCount} /></main><LineageRail lineage={data.lineage} total={data.lineageCount} /></div>
  </>;
}

export function CrmDetailContent({ kind, workspaceId, data, activityPending = false, onEditActivity }: { kind: CrmDetailKind; workspaceId: string; data: CrmDetailData; activityPending?: boolean; onEditActivity?: (activityId: string, input: CrmActivityEditInput) => Promise<unknown> }) {
  const content = !data.record
    ? <section className="crm-state"><h1 className="text-xl font-semibold">Record unavailable</h1><p className="mt-2 text-sm text-slate-600">It may have been removed or belongs to another workspace.</p></section>
    : kind === 'company'
      ? <CompanyDetail workspaceId={workspaceId} data={data as CrmDetailData<CrmCompany>} />
      : kind === 'contact'
        ? <ContactDetail workspaceId={workspaceId} data={data as CrmDetailData<CrmContact>} />
        : <DealDetail workspaceId={workspaceId} data={data as CrmDetailData<CrmDeal>} />;
  return <ActivityEditContext.Provider value={{ pending: activityPending, onEdit: onEditActivity }}>{content}</ActivityEditContext.Provider>;
}
