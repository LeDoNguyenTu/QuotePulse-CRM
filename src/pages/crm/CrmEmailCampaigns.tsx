import { useState, type FormEvent } from 'react';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmCampaigns } from '../../hooks/crm/useCrmCampaigns';
import { validateCrmCampaignInput, type CrmCampaignInput } from '../../lib/crm/campaignInput';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';
import { useTemplates } from '../../hooks/useTemplates';
import { useCrmIndustryOptions } from '../../hooks/crm/useCrmCompanies';

const statusOrder = ['queued', 'scheduled', 'sending', 'retrying', 'sent', 'deferred', 'blocked', 'failed'];

export function CrmEmailCampaigns() {
  const workspace = useActiveWorkspace();
  const [search, setSearch] = useState(''); const [industry, setIndustry] = useState('');
  const api = useCrmCampaigns(workspace.id, { search, industry });
  const templates = useTemplates();
  const industryOptions = useCrmIndustryOptions(workspace.id);
  const [name, setName] = useState(''); const [subject, setSubject] = useState(''); const [body, setBody] = useState('');
  const [provider, setProvider] = useState<'microsoft_graph' | 'brevo'>('microsoft_graph'); const [cooldown, setCooldown] = useState(60);
  const [selected, setSelected] = useState<string[]>([]);
  const [sendAllMatching, setSendAllMatching] = useState(false);
  const [consent, setConsent] = useState(false); const [error, setError] = useState<string | null>(null); const [result, setResult] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const visible = api.contacts.data?.rows ?? []; const matchingCount = api.contacts.data?.count ?? 0;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: CrmCampaignInput = { name, subject, body, provider, cooldownSeconds: cooldown, contactIds: selected, industries: industry ? [industry] : [], search, templateId: templateId || undefined, consentConfirmed: consent, sendAllMatching, matchingCount };
    const invalid = validateCrmCampaignInput(input); if (invalid) { setError(invalid); return; }
    try { const queued = await api.queue.mutateAsync(input); setResult(`${queued.queued} queued, ${queued.blocked} blocked`); setError(null); setConsent(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };
  if (api.campaigns.isLoading || api.contacts.isLoading) return <Spinner label="Loading campaigns..." />;
  if (api.campaigns.error || api.contacts.error) return <ErrorState error={api.campaigns.error ?? api.contacts.error} />;
  return <div className="space-y-6">
    <CrmPageHeader eyebrow="Outreach" title="Email campaigns" description="Build a deterministic workspace audience and send it through the existing durable queue." />
    <form className="crm-detail-panel space-y-4" onSubmit={(event) => void submit(event)}>
      <div className="crm-panel-heading"><h2>New campaign</h2><span>{selected.length ? `${selected.length} selected` : `${matchingCount} matching`}</span></div>
      <div className="crm-activity-fields"><label>Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label><label>Template<select className="input" value={templateId} onChange={(e) => { const id = e.target.value; setTemplateId(id); const template = templates.data?.find((item) => item.id === id); if (template) { setSubject(template.subject); setBody(template.body); } }}><option value="">Custom message</option>{templates.data?.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Provider<select className="input" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}><option value="microsoft_graph">Microsoft Outlook</option><option value="brevo">Brevo</option></select></label><label>Cooldown seconds<input className="input" type="number" min={30} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} /></label></div>
      <label>Subject<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label><label>Message<textarea className="input min-h-36" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Supports {{company_name}}, {{contact_name}}, and {{industry}}" /></label>
      <div className="crm-activity-fields"><label>Audience search<input className="input" value={search} onChange={(e) => { setSearch(e.target.value); setSelected([]); setSendAllMatching(false); }} /></label><label>Industry<select className="input" value={industry} onChange={(e) => { setIndustry(e.target.value); setSelected([]); setSendAllMatching(false); }}><option value="">All industries</option>{industryOptions.data?.map((value) => <option key={value}>{value}</option>)}</select></label></div>
      <label className="crm-activity-check"><input type="checkbox" checked={sendAllMatching} onChange={(e) => { setSendAllMatching(e.target.checked); if (e.target.checked) setSelected([]); }} /> Send to all {matchingCount} matching contacts (maximum 5,000)</label>
      <div className="max-h-64 overflow-auto border border-slate-200">{visible.map((contact) => <label key={contact.contact_id} className="flex gap-3 border-b border-slate-100 p-3 text-sm"><input type="checkbox" disabled={sendAllMatching} checked={selected.includes(contact.contact_id)} onChange={(e) => setSelected((current) => e.target.checked ? [...current, contact.contact_id] : current.filter((id) => id !== contact.contact_id))} /><span><strong>{contact.contact_name || contact.email_normalized}</strong><br />{contact.email_normalized} · {contact.company_name ?? 'No company'}</span></label>)}</div>
      <label className="crm-activity-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Recipients are customers, opted in, or otherwise expect this message.</label>
      {error && <p className="text-sm text-red-700">{error}</p>}{result && <p className="text-sm text-emerald-700">{result}</p>}
      <button className="btn-primary" disabled={api.queue.isPending}>{api.queue.isPending ? 'Queueing...' : 'Queue campaign'}</button>
    </form>
    <section className="crm-detail-panel"><div className="crm-panel-heading"><h2>Campaign reporting</h2><span>{api.campaigns.data?.length ?? 0}</span></div>{api.campaigns.data?.length ? <div className="crm-task-list">{api.campaigns.data.map((campaign) => { const counts = Object.fromEntries(statusOrder.map((status) => [status, campaign[`${status}_count` as keyof typeof campaign] as number])); return <article key={campaign.id}><div><strong>{campaign.name}</strong><p>{campaign.status} · {campaign.provider.replace('_', ' ')}</p></div><span>{statusOrder.filter((status) => counts[status]).map((status) => `${status}: ${counts[status]}`).join(' · ') || 'No recipients'}</span></article>; })}</div> : <p className="crm-panel-empty">No campaigns yet.</p>}</section>
  </div>;
}
