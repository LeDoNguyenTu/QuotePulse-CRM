import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CampaignMessageEditor } from '../../components/crm/CampaignMessageEditor';
import { CampaignRecipientPicker } from '../../components/crm/CampaignRecipientPicker';
import { CampaignRecipientLedger } from '../../components/crm/CampaignRecipientLedger';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';
import { useCampaignRecipients, useCrmCampaigns, useRetryFailedEmail } from '../../hooks/crm/useCrmCampaigns';
import { useCrmIndustryOptions } from '../../hooks/crm/useCrmCompanies';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useSettings } from '../../hooks/useSettings';
import { useTemplates } from '../../hooks/useTemplates';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { validateCrmCampaignInput, type CrmCampaignInput } from '../../lib/crm/campaignInput';
import { addRecipients, clearRecipients, removeRecipient, type CampaignRecipient } from '../../lib/crm/campaignRecipients';
import { findUnresolvedCampaignTokens, renderCampaignPreview, type CampaignContent } from '../../lib/emailCampaignPreview';
import { campaignOutcomeLabel } from '../../lib/crm/emailDelivery';

const statusOrder = ['queued', 'scheduled', 'sending', 'retrying', 'sent', 'deferred', 'blocked', 'failed'];

export function CrmEmailCampaigns() {
  const workspace = useActiveWorkspace();
  const [search, setSearch] = useState('');
  const audienceSearch = useDebouncedValue(search);
  const [industry, setIndustry] = useState('');
  const api = useCrmCampaigns(workspace.id, { search: audienceSearch, industry });
  const templates = useTemplates();
  const industryOptions = useCrmIndustryOptions(workspace.id);
  const settings = useSettings();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<CampaignContent>({ subject: '', bodyText: '', bodyHtml: null });
  const [draftDirty, setDraftDirty] = useState(false);
  const [provider, setProvider] = useState<'microsoft_graph' | 'brevo'>(settings.data?.email_provider ?? 'microsoft_graph');
  const [cooldown, setCooldown] = useState(60);
  const [selected, setSelected] = useState<CampaignRecipient[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [previewRecipientId, setPreviewRecipientId] = useState('');
  const [queuedBaseline, setQueuedBaseline] = useState<string | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const campaignRecipients = useCampaignRecipients(workspace.id, expandedCampaignId);
  const retryFailedEmail = useRetryFailedEmail(workspace.id);
  const visible = api.contacts.data?.rows ?? [];
  const matchingCount = api.contacts.data?.count ?? 0;
  const queueCount = selected.length;
  const queueLabel = queueCount ? `Queue ${queueCount.toLocaleString()} recipient${queueCount === 1 ? '' : 's'}` : 'Select recipients to continue';
  const previewRecipient = selected.find((recipient) => recipient.contact_id === previewRecipientId) ?? selected[0] ?? visible[0] ?? { contact_name: null, company_name: null, industry: null };
  const reviewed = renderCampaignPreview(draft, previewRecipient);
  const defaultProvider = settings.data?.email_provider ?? 'microsoft_graph';
  const campaignSnapshot = useMemo(() => JSON.stringify({
    name,
    draft,
    provider,
    cooldown,
    selected: selected.map((recipient) => recipient.contact_id).sort(),
    consent,
    templateId,
  }), [consent, cooldown, draft, name, provider, selected, templateId]);
  const blankCampaignSnapshot = useMemo(() => JSON.stringify({
    name: '',
    draft: { subject: '', bodyText: '', bodyHtml: null },
    provider: defaultProvider,
    cooldown: 60,
    selected: [],
    consent: false,
    templateId: '',
  }), [defaultProvider]);
  const campaignDirty = campaignSnapshot !== (queuedBaseline ?? blankCampaignSnapshot);

  useUnsavedChanges({ dirty: campaignDirty, message: 'Discard this unsaved campaign draft and leave the page?' });

  useEffect(() => {
    if (settings.data?.email_provider) setProvider(settings.data.email_provider);
  }, [settings.data?.email_provider]);

  const setSelection = (update: (current: CampaignRecipient[]) => CampaignRecipient[]) => {
    try { const next = update(selected); setSelected(next); setError(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: CrmCampaignInput = {
      name, subject: draft.subject, bodyText: draft.bodyText, bodyHtml: draft.bodyHtml,
      unresolvedTokens: findUnresolvedCampaignTokens(draft, selected),
      provider, cooldownSeconds: cooldown, contactIds: selected.map((recipient) => recipient.contact_id),
      industries: industry ? [industry] : [], search: audienceSearch, templateId: templateId || undefined,
      consentConfirmed: consent, sendAllMatching: false, matchingCount,
    };
    const invalid = validateCrmCampaignInput(input);
    if (invalid) { setError(invalid); return; }
    try {
      const queued = await api.queue.mutateAsync(input);
      setResult(`${queued.queued} queued, ${queued.blocked} blocked`);
      setError(null); setConsent(false); setSelected([]);
      setDraftDirty(false);
      setQueuedBaseline(JSON.stringify({
        name,
        draft,
        provider,
        cooldown,
        selected: [],
        consent: false,
        templateId,
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
  };

  if (api.campaigns.isLoading || api.contacts.isLoading) return <Spinner label="Loading campaigns..." />;
  if (api.campaigns.error || api.contacts.error) return <ErrorState error={api.campaigns.error ?? api.contacts.error} />;

  return <div className="space-y-7">
    <CrmPageHeader eyebrow="Outreach" title="Email campaigns" description="Compose the message, define the exact audience, and hand delivery to the durable queue." />
    <form className="crm-campaign-shell" onSubmit={(event) => void submit(event)}>
      <div className="crm-campaign-titlebar"><div><p className="crm-section-kicker">Campaign builder</p><h2>New campaign</h2></div><span className="crm-count-pill">{matchingCount.toLocaleString()} matching</span></div>
      <div className="crm-campaign-layout">
        <div className="crm-campaign-main">
          <section className="crm-form-section" aria-labelledby="campaign-message-heading">
            <div className="crm-section-heading"><div><h3 id="campaign-message-heading">Message content</h3><p>Start from a template, edit it here, and preview the recipient-specific result.</p></div></div>
            <label className="crm-field"><span>Campaign name</span><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="September renewal outreach" /></label>
            {!!selected.length && <label className="crm-field"><span>Preview as recipient</span><select className="input" value={previewRecipientId || selected[0].contact_id} onChange={(event) => setPreviewRecipientId(event.target.value)}>{selected.map((recipient) => <option key={recipient.contact_id} value={recipient.contact_id}>{recipient.contact_name || recipient.email_normalized} · {recipient.email_normalized}</option>)}</select></label>}
            <CampaignMessageEditor templates={templates.data ?? []} templateId={templateId} draft={draft} dirty={draftDirty}
              recipient={previewRecipient}
              onTemplateChange={(id, nextDraft) => { setTemplateId(id); setDraft(nextDraft); setDraftDirty(false); }}
              onChange={(nextDraft) => { setDraft(nextDraft); setDraftDirty(true); }} />
          </section>
          <section className="crm-form-section" aria-labelledby="campaign-recipients-heading">
            <div className="crm-section-heading"><div><h3 id="campaign-recipients-heading">Recipients</h3><p>Build one persistent selection across searches and industries.</p></div></div>
            <CampaignRecipientPicker matching={visible} selected={selected} matchingCount={matchingCount} isFetching={api.contacts.isFetching}
              isChoosingAll={api.resolveMatchingRecipientIds.isPending || search !== audienceSearch}
              onAdd={(recipient) => setSelection((current) => addRecipients(current, [recipient]))}
              onRemove={(id) => setSelection((current) => removeRecipient(current, id))}
              onClear={() => setSelection((current) => clearRecipients(current))}
              onChooseAll={async () => {
                try { if (search !== audienceSearch) throw new Error('Wait for the audience search to finish updating.'); const matches = await api.resolveMatchingRecipientIds.mutateAsync(); setSelection((current) => addRecipients(current, matches)); }
                catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
              }} />
          </section>
        </div>
        <aside className="crm-campaign-sidebar" aria-labelledby="campaign-audience-heading">
          <div className="crm-section-heading crm-section-heading--compact"><div><h3 id="campaign-audience-heading">Audience &amp; delivery</h3><p>Filters change matching contacts without clearing selected recipients.</p></div></div>
          <label className="crm-field"><span>Audience search</span><input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, company, or email" /></label>
          <label className="crm-field"><span>Industry</span><select className="input" value={industry} onChange={(event) => setIndustry(event.target.value)}><option value="">All industries</option>{industryOptions.data?.map((value) => <option key={value}>{value}</option>)}</select></label>
          <div className="crm-sidebar-rule" />
          <label className="crm-field"><span>Provider</span><select className="input" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}><option value="microsoft_graph">Microsoft Outlook</option><option value="brevo">Brevo</option></select></label>
          <label className="crm-field"><span>Cooldown between messages</span><div className="crm-input-suffix"><input className="input" type="number" min={30} value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} /><span>seconds</span></div></label>
          <label className="crm-choice-row crm-consent-row"><input className="crm-checkbox" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><strong>Recipients expect this message</strong><small>They are customers, opted in, or have another legitimate expectation.</small></span></label>
          <div className="crm-campaign-review"><strong>Review campaign</strong><span>{queueCount.toLocaleString()} recipients · previewing {previewRecipient.contact_name || 'unselected recipient'}</span><span>{provider === 'brevo' ? 'Brevo' : 'Microsoft Outlook'} · {cooldown}s cooldown · consent {consent ? 'confirmed' : 'not confirmed'}</span><span>Subject: {reviewed.subject || 'No subject yet'}</span><details><summary>Reviewed message</summary>{reviewed.bodyHtml ? <iframe title="Final campaign HTML review" sandbox="" srcDoc={reviewed.bodyHtml} /> : null}<pre>{reviewed.bodyText}</pre><small>A unique unsubscribe link is appended for each queued recipient.</small></details></div>
          <div aria-live="polite" aria-atomic="true">{error && <p role="alert" className="crm-inline-status crm-inline-status--error">{error}</p>}{result && <p className="crm-inline-status crm-inline-status--success">{result}</p>}</div>
          <button className="btn-primary crm-primary-action" disabled={api.queue.isPending || queueCount === 0}>{api.queue.isPending ? 'Queueing campaign…' : queueLabel}</button>
          <p className="crm-action-note">Messages enter the durable queue; they are not sent from this screen immediately.</p>
        </aside>
      </div>
    </form>
    <section className="crm-detail-panel crm-reporting-panel">
      <div className="crm-panel-heading"><h2>Campaign reporting</h2><span>{api.campaigns.data?.length ?? 0}</span></div>
      {api.campaigns.data?.length ? <div className="crm-task-list">{api.campaigns.data.map((campaign) => {
        const counts = Object.fromEntries(statusOrder.map((status) => [status, campaign[`${status}_count` as keyof typeof campaign] as number]));
        const expanded = expandedCampaignId === campaign.id;
        return <article key={campaign.id} className="crm-campaign-report">
          <button type="button" className="crm-campaign-report__summary" aria-expanded={expanded} aria-label={`View ${campaign.name} delivery details`} onClick={() => setExpandedCampaignId(expanded ? null : campaign.id)}>
            <div><strong>{campaign.name}</strong><p>{campaignOutcomeLabel(campaign)} · {campaign.provider.replace('_', ' ')}</p></div>
            <span>{statusOrder.filter((status) => counts[status]).map((status) => `${status}: ${counts[status]}`).join(' · ') || 'No recipients'}</span>
          </button>
          {expanded && <CampaignRecipientLedger rows={campaignRecipients.data ?? []} loading={campaignRecipients.isLoading} error={campaignRecipients.error} retryingId={retryFailedEmail.isPending ? retryFailedEmail.variables ?? null : null} onRetry={(sendId) => void retryFailedEmail.mutateAsync(sendId)} />}
        </article>;
      })}</div> : <p className="crm-panel-empty">Campaign results will appear here after the first message is queued.</p>}
    </section>
  </div>;
}
