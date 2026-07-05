import { useState } from 'react';
import type { EmailTemplate } from '../lib/types';
import { renderTemplate } from '../lib/render';
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
  const [name, setName] = useState(initial?.name ?? '');
  const [industry, setIndustry] = useState(initial?.industry ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [fromEmail, setFromEmail] = useState(initial?.from_email ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        id: initial?.id,
        name,
        industry: industry || null,
        subject,
        body,
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
        </div>

        <div className="space-y-2">
          <div className="label">Live preview (sample data)</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-medium">
              {renderTemplate(subject, SAMPLE) || '(no subject)'}
            </div>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {renderTemplate(body, SAMPLE) || '(empty body)'}
            </pre>
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
          disabled={saving || !name || !subject}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  );
}
