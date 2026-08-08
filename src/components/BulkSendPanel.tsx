import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CompanyDashboardRow } from '../lib/types';
import { useTemplates } from '../hooks/useTemplates';
import { useSettings } from '../hooks/useSettings';
import { useEmailQueue, countSentLast24h } from '../hooks/useEmailQueue';
import { renderTemplate } from '../lib/render';
import { emailProviderConfigurationError } from '../lib/emailProviderConfig';
import { Modal } from './Modal';
import { ErrorState, Spinner } from './ui';

function hiddenLegacyProgress(): { sent: number; failed: number; blocked: number; remaining: number } | null {
  return null;
}

interface BulkSendPanelProps {
  open: boolean;
  onClose: () => void;
  companies: CompanyDashboardRow[]; // pre-filtered selection
}

export function BulkSendPanel({ open, onClose, companies }: BulkSendPanelProps) {
  const { data: templates } = useTemplates();
  const { data: settings } = useSettings();
  const { enqueue, running, error, MIN_COOLDOWN } = useEmailQueue();

  const [templateId, setTemplateId] = useState('');
  const [industry, setIndustry] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [sentLast24h, setSentLast24h] = useState<number | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const progress = hiddenLegacyProgress();

  useEffect(() => {
    if (open) countSentLast24h().then(setSentLast24h).catch(() => setSentLast24h(null));
  }, [open]);

  // Templates matching the chosen industry, plus generic (industry = null).
  const availableTemplates = useMemo(() => {
    if (!templates) return [];
    return templates.filter((t) => !industry || t.industry === industry || !t.industry);
  }, [templates, industry]);

  const selectedTemplate = templates?.find((t) => t.id === templateId) ?? null;

  // Recipients that have a usable email + match the industry filter.
  const recipients = useMemo(
    () =>
      companies.filter(
        (c) => c.primary_contact_email && (!industry || c.industry === industry)
      ),
    [companies, industry]
  );

  const dailyLimit = settings?.daily_send_limit ?? 50;
  const providerConfigurationError = emailProviderConfigurationError(
    settings?.email_provider ?? 'microsoft_graph',
    settings ?? {}
  );
  const remainingToday = Math.max(0, dailyLimit - (sentLast24h ?? 0));
  const willExceed = recipients.length > remainingToday;

  const previewCompany = recipients[0];
  const preview = selectedTemplate
    ? {
        subject: renderTemplate(selectedTemplate.subject, {
          company_name: previewCompany?.name_clean,
          contact_name: previewCompany?.primary_contact_name,
          industry: previewCompany?.industry,
        }),
        body: renderTemplate(selectedTemplate.body, {
          company_name: previewCompany?.name_clean,
          contact_name: previewCompany?.primary_contact_name,
          industry: previewCompany?.industry,
        }),
      }
    : null;

  async function handleSend() {
    setLocalError(null);
    if (!selectedTemplate) {
      setLocalError('Choose a template first.');
      return;
    }
    if (providerConfigurationError) {
      setLocalError(providerConfigurationError);
      return;
    }
    try {
      const queuedRows = await enqueue({
        companies: recipients,
        templateId: selectedTemplate.id,
        subject: selectedTemplate.subject,
        body: selectedTemplate.body,
        cooldownSeconds: cooldown,
        provider: settings?.email_provider ?? 'microsoft_graph',
        recipientConsentConfirmed: consentConfirmed,
      });
      setQueued(queuedRows.length);
      countSentLast24h().then(setSentLast24h).catch(() => {});
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk send email" wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Industry filter</label>
            <input
              className="input"
              placeholder="(optional) e.g. Technology"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Template</label>
            <select
              className="input"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Select a template…</option>
              {availableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.industry ? ` (${t.industry})` : ' (generic)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Cooldown between emails (seconds)</label>
            <input
              className="input"
              type="number"
              min={MIN_COOLDOWN}
              value={cooldown}
              onChange={(e) => setCooldown(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Minimum {MIN_COOLDOWN}s is enforced server-side (Exchange limit ≈ 30/min).
            </p>
          </div>
          <div>
            <label className="label">Daily send budget</label>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {sentLast24h == null ? (
                <Spinner label="Checking…" />
              ) : (
                <>
                  <span className="font-medium">{sentLast24h}</span> sent in last 24h ·{' '}
                  <span className="font-medium">{remainingToday}</span> of {dailyLimit}{' '}
                  remaining
                </>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex flex-wrap gap-4">
            <span>
              Selected companies: <b>{companies.length}</b>
            </span>
            <span>
              Deliverable recipients (with email): <b>{recipients.length}</b>
            </span>
          </div>
          {willExceed && (
            <p className="mt-2 text-orange-700">
              ⚠ This batch ({recipients.length}) exceeds today's remaining budget (
              {remainingToday}). Emails beyond the limit will be marked{' '}
              <code>blocked</code>.
            </p>
          )}
        </div>

        {preview && (
          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">
              Preview (first recipient)
            </div>
            <div className="text-sm font-medium">{preview.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {preview.body}
            </pre>
          </div>
        )}

        <label className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
          <span>I confirm these recipients are customers, opted-in contacts, or otherwise legitimately expect this message.</span>
        </label>
        {(dailyLimit > 100 || cooldown < 60) && (
          <p className="rounded-md border border-orange-200 bg-orange-50 p-2 text-sm text-orange-900">
            These settings are unusually aggressive. SPF, DKIM, DMARC, and sender reputation matter more than cooldowns.
          </p>
        )}
        {queued != null && !running && (
          <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
            {queued} message{queued === 1 ? '' : 's'} queued. Scheduled processing continues after this dialog closes.
          </p>
        )}

        {(localError != null || error != null) && <ErrorState error={localError ?? error} />}

        {progress && (
          <div className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-2 flex justify-between">
              <span>
                Sent {progress.sent} · Failed {progress.failed} · Blocked{' '}
                {progress.blocked}
              </span>
              <span className="text-slate-500">{progress.remaining} remaining</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
              <div
                className="h-2 bg-brand-600 transition-all"
                style={{
                  width: `${
                    queued
                      ? Math.min(100, ((queued - progress.remaining) / queued) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {providerConfigurationError && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
            {settings?.email_provider === 'brevo' ? <>{providerConfigurationError}</> : (
              <>
            No Microsoft mailbox connected — connect one in{' '}
            <Link className="underline" to="/settings">
              Settings
            </Link>{' '}
            to send.
              </>
            )}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={running}>
            Close
          </button>
          <button
            className="btn-primary"
            onClick={handleSend}
            disabled={
              running ||
              !templateId ||
              recipients.length === 0 ||
              !!providerConfigurationError ||
              !consentConfirmed
            }
          >
            {running ? 'Sending…' : `Queue & send ${recipients.length}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
