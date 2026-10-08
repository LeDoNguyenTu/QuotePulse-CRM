import { useEffect, useState, type FormEvent } from 'react';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmCampaigns } from '../../hooks/crm/useCrmCampaigns';
import { validateCrmCampaignInput, type CrmCampaignInput } from '../../lib/crm/campaignInput';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';
import { useTemplates } from '../../hooks/useTemplates';
import { useCrmIndustryOptions } from '../../hooks/crm/useCrmCompanies';
import { useSettings } from '../../hooks/useSettings';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

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
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [provider, setProvider] = useState<'microsoft_graph' | 'brevo'>(settings.data?.email_provider ?? 'microsoft_graph');
  const [cooldown, setCooldown] = useState(60);
  const [selected, setSelected] = useState<string[]>([]);
  const [sendAllMatching, setSendAllMatching] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const visible = api.contacts.data?.rows ?? [];
  const matchingCount = api.contacts.data?.count ?? 0;
  const queueCount = sendAllMatching ? matchingCount : selected.length;
  const queueLabel = queueCount
    ? `Queue ${queueCount.toLocaleString()} recipient${queueCount === 1 ? '' : 's'}`
    : 'Select recipients to continue';

  useEffect(() => {
    if (settings.data?.email_provider) setProvider(settings.data.email_provider);
  }, [settings.data?.email_provider]);

  const resetAudience = () => {
    setSelected([]);
    setSendAllMatching(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const input: CrmCampaignInput = {
      name,
      subject,
      bodyText: body,
      bodyHtml,
      provider,
      cooldownSeconds: cooldown,
      contactIds: selected,
      industries: industry ? [industry] : [],
      search: audienceSearch,
      templateId: templateId || undefined,
      consentConfirmed: consent,
      sendAllMatching,
      matchingCount,
    };
    const invalid = validateCrmCampaignInput(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      const queued = await api.queue.mutateAsync(input);
      setResult(`${queued.queued} queued, ${queued.blocked} blocked`);
      setError(null);
      setConsent(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  if (api.campaigns.isLoading || api.contacts.isLoading) return <Spinner label="Loading campaigns..." />;
  if (api.campaigns.error || api.contacts.error) return <ErrorState error={api.campaigns.error ?? api.contacts.error} />;

  return (
    <div className="space-y-7">
      <CrmPageHeader
        eyebrow="Outreach"
        title="Email campaigns"
        description="Compose the message, define the exact audience, and hand delivery to the durable queue."
      />

      <form className="crm-campaign-shell" onSubmit={(event) => void submit(event)}>
        <div className="crm-campaign-titlebar">
          <div>
            <p className="crm-section-kicker">Campaign builder</p>
            <h2>New campaign</h2>
          </div>
          <span className="crm-count-pill">{matchingCount.toLocaleString()} matching</span>
        </div>

        <div className="crm-campaign-layout">
          <div className="crm-campaign-main">
            <section className="crm-form-section" aria-labelledby="campaign-message-heading">
              <div className="crm-section-heading">
                <span>01</span>
                <div>
                  <h3 id="campaign-message-heading">Message content</h3>
                  <p>Start from a template or write a one-off message.</p>
                </div>
              </div>

              <div className="crm-field-grid">
                <label className="crm-field">
                  <span>Campaign name</span>
                  <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="September renewal outreach" />
                </label>
                <label className="crm-field">
                  <span>Template</span>
                  <select
                    className="input"
                    value={templateId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setTemplateId(id);
                      const template = templates.data?.find((item) => item.id === id);
                      if (template) {
                        setSubject(template.subject);
                        setBody(template.body);
                        setBodyHtml(template.body_format === 'html' ? template.body_html : null);
                      } else {
                        setBodyHtml(null);
                      }
                    }}
                  >
                    <option value="">Custom message</option>
                    {templates.data?.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </label>
              </div>

              <label className="crm-field">
                <span>Subject</span>
                <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="A concise subject your customer will recognize" />
              </label>
              <label className="crm-field">
                <span>Message</span>
                <textarea
                  className="input crm-message-editor"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write the message here. Use {{company_name}}, {{contact_name}}, or {{industry}} to personalize it."
                />
                <small>Personalization fields are filled when each queued message is prepared.</small>
              </label>
              {bodyHtml && <div className="crm-field"><span>HTML preview</span><iframe title="Campaign HTML preview" sandbox="" className="h-96 w-full rounded-md border border-slate-200 bg-white" srcDoc={bodyHtml} /></div>}
            </section>

            <section className="crm-form-section" aria-labelledby="campaign-recipients-heading">
              <div className="crm-section-heading">
                <span>02</span>
                <div>
                  <h3 id="campaign-recipients-heading">Matching contacts</h3>
                  <p>Review the people included by the audience filters.</p>
                </div>
              </div>
              <div className="crm-recipient-list">
                {api.contacts.isFetching && <p className="crm-panel-note" role="status">Updating audience…</p>}
                {visible.length ? visible.map((contact) => (
                  <label key={contact.contact_id} className="crm-recipient-row">
                    <input
                      className="crm-checkbox"
                      type="checkbox"
                      disabled={sendAllMatching}
                      checked={selected.includes(contact.contact_id)}
                      onChange={(event) => setSelected((current) => event.target.checked
                        ? [...current, contact.contact_id]
                        : current.filter((id) => id !== contact.contact_id))}
                    />
                    <span>
                      <strong>{contact.contact_name || contact.email_normalized}</strong>
                      <small>{contact.email_normalized} · {contact.company_name ?? 'No company'}</small>
                    </span>
                  </label>
                )) : <p className="crm-panel-empty">No contacts match this audience yet.</p>}
              </div>
            </section>
          </div>

          <aside className="crm-campaign-sidebar" aria-labelledby="campaign-audience-heading">
            <div className="crm-section-heading crm-section-heading--compact">
              <span>03</span>
              <div>
                <h3 id="campaign-audience-heading">Audience &amp; delivery</h3>
                <p>Control who receives the campaign and how quickly it is sent.</p>
              </div>
            </div>

            <label className="crm-field">
              <span>Audience search</span>
              <input className="input" value={search} onChange={(event) => { setSearch(event.target.value); resetAudience(); }} placeholder="Name, company, or email" />
            </label>
            <label className="crm-field">
              <span>Industry</span>
              <select className="input" value={industry} onChange={(event) => { setIndustry(event.target.value); resetAudience(); }}>
                <option value="">All industries</option>
                {industryOptions.data?.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label className="crm-choice-row">
              <input className="crm-checkbox" type="checkbox" checked={sendAllMatching} onChange={(event) => { setSendAllMatching(event.target.checked); if (event.target.checked) setSelected([]); }} />
              <span><strong>Use all matching contacts</strong><small>Up to 5,000 recipients</small></span>
            </label>

            <div className="crm-sidebar-rule" />

            <label className="crm-field">
              <span>Provider</span>
              <select className="input" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
                <option value="microsoft_graph">Microsoft Outlook</option>
                <option value="brevo">Brevo</option>
              </select>
            </label>
            <label className="crm-field">
              <span>Cooldown between messages</span>
              <div className="crm-input-suffix"><input className="input" type="number" min={30} value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} /><span>seconds</span></div>
            </label>

            <label className="crm-choice-row crm-consent-row">
              <input className="crm-checkbox" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span><strong>Recipients expect this message</strong><small>They are customers, opted in, or have another legitimate expectation.</small></span>
            </label>

            <div aria-live="polite" aria-atomic="true">
              {error && <p role="alert" className="crm-inline-status crm-inline-status--error">{error}</p>}
              {result && <p className="crm-inline-status crm-inline-status--success">{result}</p>}
            </div>
            <button className="btn-primary crm-primary-action" disabled={api.queue.isPending || queueCount === 0}>
              {api.queue.isPending ? 'Queueing campaign…' : queueLabel}
            </button>
            <p className="crm-action-note">Messages enter the durable queue; they are not sent from this screen immediately.</p>
          </aside>
        </div>
      </form>

      <section className="crm-detail-panel crm-reporting-panel">
        <div className="crm-panel-heading"><h2>Campaign reporting</h2><span>{api.campaigns.data?.length ?? 0}</span></div>
        {api.campaigns.data?.length ? (
          <div className="crm-task-list">{api.campaigns.data.map((campaign) => {
            const counts = Object.fromEntries(statusOrder.map((status) => [status, campaign[`${status}_count` as keyof typeof campaign] as number]));
            return <article key={campaign.id}><div><strong>{campaign.name}</strong><p>{campaign.status} · {campaign.provider.replace('_', ' ')}</p></div><span>{statusOrder.filter((status) => counts[status]).map((status) => `${status}: ${counts[status]}`).join(' · ') || 'No recipients'}</span></article>;
          })}</div>
        ) : <p className="crm-panel-empty">Campaign results will appear here after the first message is queued.</p>}
      </section>
    </div>
  );
}
