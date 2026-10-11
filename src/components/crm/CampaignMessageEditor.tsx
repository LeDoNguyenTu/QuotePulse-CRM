import { useState } from 'react';
import type { EmailTemplate } from '../../lib/types';
import { renderCampaignPreview, type CampaignContent, type CampaignPreviewRecipient } from '../../lib/emailCampaignPreview';
import { synchronizePlainTextToHtml } from '../../lib/emailPersonalization';
import { PersonalizationFieldGuide } from '../PersonalizationFieldGuide';

type TemplateChoice = Pick<EmailTemplate, 'id' | 'name' | 'subject' | 'body' | 'body_html' | 'body_format'>;

interface Props {
  templates: readonly TemplateChoice[];
  templateId: string;
  draft: CampaignContent;
  dirty: boolean;
  recipient: CampaignPreviewRecipient;
  onTemplateChange: (templateId: string, draft: CampaignContent) => void;
  onChange: (draft: CampaignContent) => void;
  confirmReplace?: (message: string) => boolean;
}

export function CampaignMessageEditor({ templates, templateId, draft, dirty, recipient, onTemplateChange, onChange, confirmReplace }: Props) {
  const [textSyncFailed, setTextSyncFailed] = useState(false);
  const preview = renderCampaignPreview(draft, recipient);
  const chooseTemplate = (id: string) => {
    const approve = confirmReplace ?? ((message: string) => globalThis.confirm(message));
    if (dirty && !approve('Replace your unsaved campaign edits with this template?')) return;
    const template = templates.find((item) => item.id === id);
    setTextSyncFailed(false);
    onTemplateChange(id, template ? {
      subject: template.subject,
      bodyText: template.body,
      bodyHtml: template.body_format === 'html' ? template.body_html : null,
    } : { subject: '', bodyText: '', bodyHtml: null });
  };
  const updateBackupText = (bodyText: string) => {
    if (!draft.bodyHtml) {
      setTextSyncFailed(false);
      onChange({ ...draft, bodyText });
      return;
    }
    const result = synchronizePlainTextToHtml(draft.bodyText, bodyText, draft.bodyHtml);
    setTextSyncFailed(!result.synchronized);
    onChange({ ...draft, bodyText, bodyHtml: result.synchronized ? result.html : draft.bodyHtml });
  };
  return <div className="crm-message-workspace">
    <div className="crm-message-fields">
      <label className="crm-field"><span>Template</span><select className="input" value={templateId} onChange={(event) => chooseTemplate(event.target.value)}><option value="">Custom message</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <PersonalizationFieldGuide bodyText={draft.bodyText} bodyHtml={draft.bodyHtml} synchronizationFailed={textSyncFailed} />
      <label className="crm-field"><span>Subject</span><input className="input" value={draft.subject} onChange={(event) => onChange({ ...draft, subject: event.target.value })} /></label>
      <label className="crm-field"><span>Backup text</span><textarea className="input crm-message-editor" value={draft.bodyText} onChange={(event) => updateBackupText(event.target.value)} /><small>Edit this readable version; matching wording in the formatted email updates automatically.</small></label>
      <details className="crm-field"><summary>Advanced HTML source</summary><label><span>Formatted email code</span><textarea className="input crm-message-editor" value={draft.bodyHtml ?? ''} onChange={(event) => { setTextSyncFailed(false); onChange({ ...draft, bodyHtml: event.target.value || null }); }} placeholder="Optional formatted HTML email" /></label></details>
    </div>
    <aside className="crm-message-preview">
      <span className="crm-section-kicker">Recipient preview</span>
      <h4>{preview.subject || '(no subject)'}</h4>
      {preview.bodyHtml ? <iframe title="Campaign HTML preview" sandbox="" srcDoc={preview.bodyHtml} /> : <pre>{preview.bodyText || '(empty message)'}</pre>}
      {preview.bodyHtml && <details><summary>Plain-text fallback</summary><pre>{preview.bodyText}</pre></details>}
      {preview.unresolvedTokens.length > 0 && <p role="alert" className="crm-inline-status crm-inline-status--error">Unresolved personalization: {preview.unresolvedTokens.join(', ')}</p>}
    </aside>
  </div>;
}
