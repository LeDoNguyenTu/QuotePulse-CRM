import { useEffect, useState } from 'react';
import type { EmailTemplate } from '../lib/types';
import { renderTemplate } from '../lib/render';
import { prepareImportedEmailHtml } from '../lib/emailTemplateHtml';
import { parseOutlookMsg } from '../lib/outlookMsg';
import { uploadEmailTemplateAssets } from '../hooks/useTemplates';
import { useAuth } from '../hooks/useAuth';
import { Modal } from './Modal';

interface TemplateEditorProps {
  open: boolean;
  initial: Partial<EmailTemplate> | null;
  onClose: () => void;
  onSave: (t: Partial<EmailTemplate>) => Promise<void>;
}

const SAMPLE = {
  company_name: 'Acme Industries',
  contact_name: 'Jordan Lee',
  industry: 'Manufacturing',
};

export function TemplateEditor({ open, initial, onClose, onSave }: TemplateEditorProps) {
  const { user } = useAuth();
  const [name, setName] = useState(initial?.name ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [bodyFormat, setBodyFormat] = useState<'plain' | 'html'>(initial?.body_format ?? 'plain');
  const [rawHtml, setRawHtml] = useState(initial?.body_html ?? '');
  const [bodyHtml, setBodyHtml] = useState(initial?.body_html ?? '');
  const [assets, setAssets] = useState(initial?.asset_manifest ?? []);
  const [fromEmail, setFromEmail] = useState(initial?.from_email ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ''); setIndustry(initial?.industry ?? ''); setSubject(initial?.subject ?? '');
    setBody(initial?.body ?? ''); setBodyFormat(initial?.body_format ?? 'plain');
    setRawHtml(initial?.body_html ?? ''); setBodyHtml(initial?.body_html ?? '');
    setAssets(initial?.asset_manifest ?? []); setFromEmail(initial?.from_email ?? ''); setImportMessage(null);
  }, [initial, open]);

  const assetUrls = (nextAssets = assets) => Object.fromEntries(nextAssets.map((asset) => [asset.original_name, asset.public_url]));
  const applyHtml = (html: string, nextAssets = assets) => {
    const prepared = prepareImportedEmailHtml(html, assetUrls(nextAssets));
    setRawHtml(html); setBodyHtml(prepared.html);
    if (!body.trim()) setBody(prepared.text);
    setImportMessage(`${prepared.imageReferences.length - prepared.unresolvedImages.length} image${prepared.imageReferences.length - prepared.unresolvedImages.length === 1 ? '' : 's'} linked${prepared.unresolvedImages.length ? `; ${prepared.unresolvedImages.length} still need matching image files` : ''}.`);
  };

  const importHtml = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      if (/\.msg$/i.test(file.name)) {
        const imported = await parseOutlookMsg(file);
        const uploaded = imported.images.length && user
          ? await uploadEmailTemplateAssets(user.id, imported.images)
          : [];
        const nextAssets = [...assets, ...uploaded];
        setAssets(nextAssets);
        if (!subject.trim() && imported.subject) setSubject(imported.subject);
        if (!body.trim() && imported.text) setBody(imported.text);
        setBodyFormat('html');
        applyHtml(imported.html, nextAssets);
        return;
      }
      if (!/\.html?$/i.test(file.name)) {
        setImportMessage('Choose an Outlook .msg, .htm, or .html file.');
        return;
      }
      const html = await file.text();
      setBodyFormat('html');
      applyHtml(html);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Unable to import the email template.');
    } finally {
      setUploading(false);
    }
  };

  const importAssets = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      const uploaded = await uploadEmailTemplateAssets(user.id, [...files]);
      const nextAssets = [...assets, ...uploaded];
      setAssets(nextAssets);
      if (rawHtml) applyHtml(rawHtml, nextAssets);
      else setImportMessage(`${uploaded.length} image${uploaded.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'Unable to upload email images.');
    } finally {
      setUploading(false);
    }
  };

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name,
        industry: industry || null,
        subject,
        body,
        body_format: bodyFormat,
        body_html: bodyFormat === 'html' ? bodyHtml : null,
        asset_manifest: bodyFormat === 'html' ? assets : [],
        from_email: fromEmail || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? 'Edit template' : 'New template'}
      wide
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Industry (blank = generic)</label>
            <input
              className="input"
              value={industry ?? ''}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <label className="label">From email (optional)</label>
            <input
              className="input"
              value={fromEmail ?? ''}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="defaults to your connected mailbox"
            />
          </div>
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Body</label>
            <textarea
              className="input min-h-[180px] font-mono text-xs"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Placeholders: <code>{'{{company_name}}'}</code>,{' '}
              <code>{'{{contact_name}}'}</code>, <code>{'{{industry}}'}</code>
            </p>
          </div>
          <fieldset className="space-y-2 rounded-md border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">Message format</legend>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={bodyFormat === 'plain'} onChange={() => setBodyFormat('plain')} /> Plain text</label>
              <label className="flex items-center gap-2"><input type="radio" checked={bodyFormat === 'html'} onChange={() => setBodyFormat('html')} /> HTML / table layout</label>
            </div>
            {bodyFormat === 'html' && <div className="space-y-2">
              <label className="block text-sm font-medium">Import .msg, .htm, or .html<input className="mt-1 block w-full text-sm" type="file" accept=".msg,.htm,.html,application/vnd.ms-outlook,text/html" disabled={uploading} onChange={(event) => void importHtml(event.target.files?.[0])} /></label>
              <label className="block text-sm font-medium">Companion image ZIP or images<input className="mt-1 block w-full text-sm" type="file" multiple accept=".zip,image/png,image/jpeg,image/gif,image/webp" disabled={uploading} onChange={(event) => void importAssets(event.target.files)} /></label>
              <label className="block text-sm font-medium">Imported HTML source (sanitized for preview and sending)<textarea className="input mt-1 min-h-[140px] font-mono text-xs" value={rawHtml} onChange={(event) => applyHtml(event.target.value)} /></label>
              {importMessage && <p className="text-xs text-slate-600" role="status">{importMessage}</p>}
            </div>}
          </fieldset>
        </div>

        <div className="space-y-2">
          <div className="label">Live preview (sample data)</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-medium">
              {renderTemplate(subject, SAMPLE) || '(no subject)'}
            </div>
            {bodyFormat === 'html' && bodyHtml
              ? <iframe title="HTML email preview" sandbox="" className="mt-2 h-96 w-full bg-white" srcDoc={renderTemplate(bodyHtml, SAMPLE)} />
              : <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{renderTemplate(body, SAMPLE) || '(empty body)'}</pre>}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || uploading || !name || !subject || (bodyFormat === 'html' && !bodyHtml)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
