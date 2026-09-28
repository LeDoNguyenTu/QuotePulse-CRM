import { Link } from 'react-router-dom';
import type { CrmCompany, CrmContact, CrmDeal } from '../../lib/crm/types';
import type { CrmDetailData, CrmDetailKind, CrmSourceLineage } from '../../lib/crm/detailQueries';
import { crmRecordPath } from '../../lib/crm/salesRoutes';
import { displayText, formatCrmDate, formatCrmMoney } from '../../lib/crm/presenters';
import { normalizeWebsiteUrl } from '../../lib/crm/inputs';

type DealContactRow = { role: string | null; contact: CrmContact | null };
type ContactDealRow = { role: string | null; deal: CrmDeal | null };

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

function ActivityPreview() {
  return <section className="crm-detail-panel crm-activity-preview">
    <div className="crm-panel-heading"><h2>Activity and email history</h2><span>Not loaded</span></div>
    <p className="crm-panel-empty">Activity history is not loaded in this record view yet.</p>
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
        <Fact label="Industry" value={displayText(company.industry)} /><Fact label="Domain" value={displayText(company.domain)} />
        <Fact label="Website" value={displayText(company.website)} href={normalizeWebsiteUrl(company.website)} /><Fact label="Phone" value={displayText(company.phone)} />
        <Fact label="Address" value={displayText(address)} /><Fact label="Created" value={formatCrmDate(company.created_at)} />
      </dl></section>
      <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Staff contacts</h2><span>{data.associationCounts[0] ?? contacts.length}</span></div>{contacts.length ? <div className="crm-association-list">{contacts.map((contact) => <div key={contact.id}><div><RecordLink workspaceId={workspaceId} kind="contact" id={contact.id}>{displayText(contact.full_name ?? [contact.first_name, contact.last_name].filter(Boolean).join(' '), 'Unnamed contact')}</RecordLink><p>{displayText(contact.job_title)}</p></div><span>{displayText(contact.email)}</span></div>)}</div> : <p className="crm-panel-empty">No staff contacts are linked to this company.</p>}<TruncationNotice shown={contacts.length} total={data.associationCounts[0] ?? contacts.length} /></section>
      <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Associated deals</h2><span>{data.associationCounts[1] ?? deals.length}</span></div>{deals.length ? <div className="crm-association-list">{deals.map((deal) => <div key={deal.id}><div><RecordLink workspaceId={workspaceId} kind="deal" id={deal.id}>{deal.name}</RecordLink><p>{deal.stage}</p></div><strong>{formatCrmMoney(deal.amount, deal.currency)}</strong></div>)}</div> : <p className="crm-panel-empty">No deals are linked to this company.</p>}<TruncationNotice shown={deals.length} total={data.associationCounts[1] ?? deals.length} /></section>
      <ActivityPreview />
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
    </dl></section><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Associated deals</h2><span>{data.associationCounts[0] ?? deals.length}</span></div>{deals.length ? <div className="crm-association-list">{deals.map(({ deal, role }, index) => deal && <div key={deal.id ?? index}><div><RecordLink workspaceId={workspaceId} kind="deal" id={deal.id}>{deal.name}</RecordLink><p>{displayText(role, deal.stage)}</p></div><strong>{formatCrmMoney(deal.amount, deal.currency)}</strong></div>)}</div> : <p className="crm-panel-empty">No deals are linked to this contact.</p>}<TruncationNotice shown={deals.length} total={data.associationCounts[0] ?? deals.length} /></section><ActivityPreview /></main><LineageRail lineage={data.lineage} total={data.lineageCount} /></div>
  </>;
}

function DealDetail({ workspaceId, data }: { workspaceId: string; data: CrmDetailData<CrmDeal> }) {
  const deal = data.record!;
  const contacts = (data.associations[0] ?? []) as DealContactRow[];
  return <>
    <header className="crm-detail-hero crm-detail-hero--deal"><div><p className="crm-detail-kicker">Deal record</p><h1>{deal.name}</h1><p>{deal.company ? <RecordLink workspaceId={workspaceId} kind="company" id={deal.company.id}>{deal.company.name}</RecordLink> : 'No company linked'}</p></div><div className="crm-detail-value"><span>{deal.stage}</span><strong>{formatCrmMoney(deal.amount, deal.currency)}</strong><em className={`crm-status crm-status--${deal.status}`}>{deal.status.replace('_', ' ')}</em></div></header>
    <div className="crm-detail-grid"><main className="space-y-5"><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Pipeline position</h2><span>Core record</span></div><dl className="crm-detail-facts">
      <Fact label="Stage" value={deal.stage} /><Fact label="Status" value={deal.status.replace('_', ' ')} /><Fact label="Last call" value={formatCrmDate(deal.last_call_at)} /><Fact label="Follow up" value={formatCrmDate(deal.follow_up_at)} /><Fact label="Created" value={formatCrmDate(deal.created_at)} /><Fact label="Updated" value={formatCrmDate(deal.updated_at)} />
    </dl></section><section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Buying contacts</h2><span>{data.associationCounts[0] ?? contacts.length}</span></div>{contacts.length ? <div className="crm-association-list">{contacts.map(({ contact, role }, index) => contact && <div key={contact.id ?? index}><div><RecordLink workspaceId={workspaceId} kind="contact" id={contact.id}>{displayText(contact.full_name ?? contact.email, 'Unnamed contact')}</RecordLink><p>{displayText(role ?? contact.job_title)}</p></div><span>{displayText(contact.email)}</span></div>)}</div> : <p className="crm-panel-empty">No contacts are linked to this deal.</p>}<TruncationNotice shown={contacts.length} total={data.associationCounts[0] ?? contacts.length} /></section><ActivityPreview /></main><LineageRail lineage={data.lineage} total={data.lineageCount} /></div>
  </>;
}

export function CrmDetailContent({ kind, workspaceId, data }: { kind: CrmDetailKind; workspaceId: string; data: CrmDetailData }) {
  if (!data.record) return <section className="crm-state"><h1 className="text-xl font-semibold">Record unavailable</h1><p className="mt-2 text-sm text-slate-600">It may have been removed or belongs to another workspace.</p></section>;
  if (kind === 'company') return <CompanyDetail workspaceId={workspaceId} data={data as CrmDetailData<CrmCompany>} />;
  if (kind === 'contact') return <ContactDetail workspaceId={workspaceId} data={data as CrmDetailData<CrmContact>} />;
  return <DealDetail workspaceId={workspaceId} data={data as CrmDetailData<CrmDeal>} />;
}
