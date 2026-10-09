import { useEffect, useMemo, useState } from 'react';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { Spinner } from '../../components/ui';
import { useAuth } from '../../hooks/useAuth';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useDisconnectMicrosoft, useSaveSettings, useSettings } from '../../hooks/useSettings';
import { functions } from '../../lib/functions';
import { preparePasswordChange } from '../../lib/accountPassword';
import {
  DEFAULT_SESSION_TIMEOUT_MINUTES,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
  normalizeSessionTimeoutMinutes,
  parseSessionTimeoutDraft,
} from '../../lib/sessionTimeout';

export function validateSalesSettingsDraft(dailyLimit: number, sessionMinutes: number | ''): string | null {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10_000) {
    return 'Daily send limit must be a whole number between 1 and 10,000.';
  }
  return normalizeSessionTimeoutMinutes(sessionMinutes) === sessionMinutes
    ? null
    : `Automatic sign-out must be disabled or set from ${MIN_SESSION_TIMEOUT_MINUTES} to ${MAX_SESSION_TIMEOUT_MINUTES} minutes.`;
}

export function confirmMicrosoftDisconnect(
  confirmAction: (message: string) => boolean = (message) => window.confirm(message),
): boolean {
  return confirmAction("Disconnect this Microsoft mailbox? This removes QuotePulse's saved token and stops Outlook delivery, but it does not revoke Microsoft-side access.");
}

export function CrmSalesSettings() {
  const workspace = useActiveWorkspace();
  const { user, changeLoginEmail, changePassword, applySessionTimeoutMinutes } = useAuth();
  const settings = useSettings();
  const save = useSaveSettings();
  const disconnectMicrosoft = useDisconnectMicrosoft();
  const data = settings.data;
  const [provider, setProvider] = useState<'microsoft_graph' | 'brevo'>(data?.email_provider ?? 'microsoft_graph');
  const [dailyLimit, setDailyLimit] = useState(data?.daily_send_limit ?? 50);
  const [sessionMinutes, setSessionMinutes] = useState<number | ''>(normalizeSessionTimeoutMinutes(data?.session_timeout_minutes));
  const [senderEmail, setSenderEmail] = useState(data?.brevo_sender_email ?? '');
  const [senderName, setSenderName] = useState(data?.brevo_sender_name ?? '');
  const [brevoKey, setBrevoKey] = useState('');
  const [clearBrevoKey, setClearBrevoKey] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [savedDeliveryDraft, setSavedDeliveryDraft] = useState<string | null>(null);
  const passwordPreparation = preparePasswordChange(currentPassword, newPassword, confirmPassword);
  const deliveryDraft = useMemo(() => ({
    provider,
    dailyLimit,
    sessionMinutes,
    senderEmail,
    senderName,
    brevoKey,
    clearBrevoKey,
  }), [brevoKey, clearBrevoKey, dailyLimit, provider, senderEmail, senderName, sessionMinutes]);
  const deliveryDirty = savedDeliveryDraft !== null && JSON.stringify(deliveryDraft) !== savedDeliveryDraft;
  const accountDirty = Boolean(newEmail || currentPassword || newPassword || confirmPassword);
  const validationError = validateSalesSettingsDraft(dailyLimit, sessionMinutes);
  const feedbackError = error ?? validationError;

  useUnsavedChanges({ dirty: deliveryDirty || accountDirty });

  useEffect(() => {
    if (!data) return;
    setProvider(data.email_provider ?? 'microsoft_graph');
    setDailyLimit(data.daily_send_limit ?? 50);
    setSessionMinutes(normalizeSessionTimeoutMinutes(data.session_timeout_minutes));
    setSenderEmail(data.brevo_sender_email ?? '');
    setSenderName(data.brevo_sender_name ?? '');
    setSavedDeliveryDraft(JSON.stringify({
      provider: data.email_provider ?? 'microsoft_graph',
      dailyLimit: data.daily_send_limit ?? 50,
      sessionMinutes: normalizeSessionTimeoutMinutes(data.session_timeout_minutes),
      senderEmail: data.brevo_sender_email ?? '',
      senderName: data.brevo_sender_name ?? '',
      brevoKey: '',
      clearBrevoKey: false,
    }));
  }, [data]);

  const run = async (name: string, action: () => Promise<unknown>, success: string) => {
    setBusyAction(name);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyAction(null);
    }
  };

  const saveDelivery = async () => {
    if (validationError) {
      setError(validationError);
      return;
    }
    const normalizedTimeout = normalizeSessionTimeoutMinutes(sessionMinutes);
    await run('save', async () => {
      await save.mutateAsync({
        email_provider: provider,
        daily_send_limit: dailyLimit,
        session_timeout_minutes: normalizedTimeout,
        brevo_sender_email: senderEmail || null,
        brevo_sender_name: senderName || null,
        ...(brevoKey.trim() ? { brevo_api_key: brevoKey.trim() } : clearBrevoKey ? { brevo_api_key: null } : {}),
      });
      setBrevoKey('');
      setClearBrevoKey(false);
      setSavedDeliveryDraft(JSON.stringify({ ...deliveryDraft, brevoKey: '', clearBrevoKey: false }));
      applySessionTimeoutMinutes(normalizedTimeout);
    }, 'Settings saved.');
  };

  const connectMicrosoft = async () => {
    setBusyAction('microsoft');
    setError(null);
    try {
      const { url } = await functions.msAuthStart();
      window.location.href = url;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusyAction(null);
    }
  };

  if (settings.isLoading) return <Spinner label="Loading settings…" />;

  return (
    <div className="space-y-7">
      <CrmPageHeader
        eyebrow={workspace.name}
        title="Settings"
        description="Manage campaign delivery, account security, and how this workspace handles customer data."
      />

      <div className="crm-settings-layout">
        <aside className="crm-settings-nav" aria-label="Settings sections">
          <p>Settings sections</p>
          <a href="#delivery">Delivery defaults</a>
          <a href="#security">Account &amp; security</a>
          <a href="#privacy">Data &amp; privacy</a>
          <div className="crm-settings-workspace">
            <span>Active workspace</span>
            <strong>{workspace.name}</strong>
            <small>{workspace.role} access</small>
          </div>
        </aside>

        <div className="crm-settings-content">
          <section id="delivery" className="crm-settings-section">
            <div className="crm-settings-section-header">
              <div><h2>Delivery defaults</h2></div>
              <p>Choose the sending account and guard rails applied to new campaigns.</p>
            </div>

            <div className="crm-settings-block">
              <div><h3 id="sales-email-provider-label">Email provider</h3><p>The provider selected here becomes the default delivery route.</p></div>
              <div className="crm-settings-control">
                <select aria-labelledby="sales-email-provider-label" className="input" value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)}>
                  <option value="microsoft_graph">Microsoft Outlook</option>
                  <option value="brevo">Brevo transactional email</option>
                </select>
              </div>
            </div>

            <div className="crm-settings-block">
              <div><h3>Microsoft 365 mailbox</h3><p>Outlook sends through the connected mailbox using delegated Mail.Send access.</p></div>
              <div className="crm-settings-control">
                {data?.ms_refresh_token ? (
                  <div className="crm-connection-card">
                    <span className="crm-connection-dot" />
                    <div><strong>{data.ms_account_email ?? 'Microsoft mailbox connected'}</strong><small>Ready for campaign delivery</small></div>
                    <button type="button" className="btn-secondary" onClick={() => void connectMicrosoft()} disabled={busyAction === 'microsoft'}>Switch</button>
                    <button type="button" className="btn-quiet-danger" onClick={() => { if (confirmMicrosoftDisconnect()) void run('disconnect', () => disconnectMicrosoft.mutateAsync(), 'Microsoft mailbox disconnected.'); }} disabled={busyAction === 'disconnect'}>Disconnect</button>
                  </div>
                ) : <button type="button" className="btn-primary" onClick={() => void connectMicrosoft()} disabled={busyAction === 'microsoft'}>Connect Microsoft account</button>}
              </div>
            </div>

            {provider === 'brevo' && (
              <div className="crm-settings-block">
                <div><h3>Brevo sender</h3><p>Use a verified sender identity from your own Brevo account.</p></div>
                <div className="crm-settings-control space-y-3">
                  <input aria-label="Brevo API key" className="input" type="password" autoComplete="off" value={brevoKey} onChange={(event) => { setBrevoKey(event.target.value); if (event.target.value) setClearBrevoKey(false); }} placeholder={data?.brevo_api_key ? 'API key saved — enter a value to replace it' : 'Brevo API key'} />
                  <input aria-label="Verified Brevo sender email" className="input" type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value)} placeholder="Verified sender email" />
                  <input aria-label="Sender display name" className="input" value={senderName} onChange={(event) => setSenderName(event.target.value)} placeholder="Sender display name" />
                  {data?.brevo_api_key ? <label className="crm-check-row"><input type="checkbox" checked={clearBrevoKey} onChange={(event) => { setClearBrevoKey(event.target.checked); if (event.target.checked) setBrevoKey(''); }} /> Remove the saved Brevo API key</label> : null}
                </div>
              </div>
            )}

            <div className="crm-settings-block">
              <div><h3>Daily send limit</h3><p>A hard application guard rail across campaigns for this account.</p></div>
              <div className="crm-settings-control crm-number-control"><input aria-label="Daily send limit" className="input" type="number" min={1} max={10000} value={dailyLimit} onChange={(event) => setDailyLimit(Number(event.target.value))} /><span>messages / day</span></div>
            </div>
          </section>

          <section id="security" className="crm-settings-section">
            <div className="crm-settings-section-header">
              <div><h2>Account &amp; security</h2></div>
              <p>Keep sign-in details current and control idle-session protection.</p>
            </div>

            <div className="crm-settings-block">
              <div><h3>Login email</h3><p>Currently signed in as <strong>{user?.email ?? 'Unknown'}</strong>.</p></div>
              <div className="crm-settings-control crm-inline-control"><input aria-label="New login email" className="input" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="New login email" /><button type="button" className="btn-secondary" disabled={!newEmail.trim() || busyAction === 'email'} onClick={() => void run('email', async () => { await changeLoginEmail(newEmail); setNewEmail(''); }, 'Confirmation email sent.')}>Change email</button></div>
            </div>

            <div className="crm-settings-block">
              <div><h3>Password</h3><p>Confirm the current password before choosing a replacement.</p></div>
              <div className="crm-settings-control space-y-3">
                <input aria-label="Current password" className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" />
                <div className="crm-inline-control"><input aria-label="New password" className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password" /><input aria-label="Confirm password" className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" /></div>
                <p className="text-xs text-slate-500">New password and confirmation must match and contain at least 8 characters.</p>
                {confirmPassword && 'error' in passwordPreparation && <p className="text-sm text-red-700" role="alert">{passwordPreparation.error}</p>}
                <button type="button" className="btn-primary self-start" disabled={'error' in passwordPreparation || busyAction === 'password'} onClick={() => void run('password', async () => { await changePassword(currentPassword, newPassword, confirmPassword); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }, 'Password changed. Your new password will be required the next time you sign in.')}>Change password</button>
              </div>
            </div>

            <div className="crm-settings-block">
              <div><h3>Automatic sign-out</h3><p>Protect unattended sessions without interrupting active work.</p></div>
              <div className="crm-settings-control">
                <label className="crm-choice-row"><input className="crm-checkbox" type="checkbox" checked={sessionMinutes === 0} onChange={(event) => setSessionMinutes(event.target.checked ? 0 : DEFAULT_SESSION_TIMEOUT_MINUTES)} /><span><strong>Keep this browser signed in</strong><small>Disable the inactivity timer.</small></span></label>
                {sessionMinutes !== 0 && <div className="crm-number-control mt-3"><input aria-label="Automatic sign-out minutes" className="input" type="number" min={MIN_SESSION_TIMEOUT_MINUTES} max={MAX_SESSION_TIMEOUT_MINUTES} value={sessionMinutes} onChange={(event) => setSessionMinutes(parseSessionTimeoutDraft(event.target.value))} /><span>minutes inactive</span></div>}
              </div>
            </div>
          </section>

          <section id="privacy" className="crm-settings-section">
            <div className="crm-settings-section-header">
              <div><h2>Data &amp; privacy</h2></div>
              <p>Understand what leaves the browser and what remains isolated to this workspace.</p>
            </div>
            <div className="crm-privacy-grid">
              <article><strong>Excel imports</strong><p>Validated CRM rows are stored in Supabase. The original workbook is archived in R2 only to preserve its layout for export.</p></article>
              <article><strong>PST extraction</strong><p>Raw PST files, message bodies, and attachment bytes stay in the browser.</p></article>
              <article><strong>Workspace boundary</strong><p>Companies, contacts, deals, campaigns, and metadata remain isolated to this workspace.</p></article>
            </div>
          </section>

          <div className={`crm-settings-feedback${feedbackError ? ' crm-settings-feedback--error' : ''}`} aria-live="polite" aria-atomic="true">
            {feedbackError ? <p role="alert">{feedbackError}</p> : message ? <p>{message}</p> : null}
          </div>
          <div className="crm-settings-savebar"><button type="button" className="btn-primary crm-primary-action" onClick={() => void saveDelivery()} disabled={busyAction === 'save' || !deliveryDirty || !!validationError}>{busyAction === 'save' ? 'Saving…' : 'Save changes'}</button></div>
        </div>
      </div>
    </div>
  );
}
