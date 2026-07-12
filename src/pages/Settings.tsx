import { useEffect, useState } from 'react';
import {
  classifyHubspotToken,
  useDisconnectMicrosoft,
  useSaveSettings,
  useSettings,
} from '../hooks/useSettings';
import { functions } from '../lib/functions';
import { ErrorState, Spinner } from '../components/ui';

export function Settings() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const disconnectMs = useDisconnectMicrosoft();

  const [hubspotToken, setHubspotToken] = useState('');
  const [nvidiaKey, setNvidiaKey] = useState('');
  const [dailyLimit, setDailyLimit] = useState(500);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) {
      setHubspotToken(data.hubspot_token ?? '');
      setNvidiaKey(data.nvidia_key ?? '');
      setDailyLimit(data.daily_send_limit ?? 500);
    }
  }, [data]);

  const tokenKind = classifyHubspotToken(hubspotToken);

  async function handleSave() {
    setError(null);
    setSaved(false);
    try {
      await save.mutateAsync({
        hubspot_token: hubspotToken || null,
        nvidia_key: nvidiaKey || null,
        daily_send_limit: dailyLimit,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function connectMicrosoft() {
    setError(null);
    try {
      const { url } = await functions.msAuthStart();
      window.location.href = url; // redirect to Microsoft consent
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDisconnectMicrosoft() {
    setError(null);
    if (
      !window.confirm(
        'Disconnect this Microsoft mailbox? Bulk sending will be disabled until you connect one again.'
      )
    ) {
      return;
    }
    try {
      await disconnectMs.mutateAsync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">HubSpot</h2>
        <p className="text-sm text-slate-500">
          Paste either a <b>Private App access token</b> (<code>pat-na1-…</code>) or your{' '}
          <b>personal access key</b>. It's stored privately in your user settings and read only
          by the ingestion Edge Function.
        </p>
        <input
          className="input"
          type="password"
          placeholder="pat-na1-xxxxxxxx…  or  CiRuYTEt…"
          value={hubspotToken}
          onChange={(e) => setHubspotToken(e.target.value)}
        />
        <HubspotTokenHint kind={tokenKind} />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Microsoft 365 mailbox</h2>
        <p className="text-sm text-slate-500">
          Connect the Outlook mailbox used to send outreach. We request the delegated{' '}
          <code>Mail.Send</code> permission and store only a refresh token.
        </p>
        {data?.ms_refresh_token ? (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
                Connected
              </span>
              <span className="font-medium text-slate-700">
                {data.ms_account_email ?? 'mailbox linked'}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  className="btn-secondary"
                  onClick={connectMicrosoft}
                  disabled={disconnectMs.isPending}
                >
                  Switch account
                </button>
                <button
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  onClick={handleDisconnectMicrosoft}
                  disabled={disconnectMs.isPending}
                >
                  {disconnectMs.isPending ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              “Switch account” shows the Microsoft account picker so you can link a different
              mailbox. “Disconnect” removes the stored token from this app — to also revoke the
              app's access on Microsoft's side, visit{' '}
              <a
                className="text-brand-600 underline"
                href="https://myapps.microsoft.com"
                target="_blank"
                rel="noreferrer"
              >
                myapps.microsoft.com
              </a>
              .
            </p>
          </>
        ) : (
          <button className="btn-primary" onClick={connectMicrosoft}>
            Connect Microsoft account
          </button>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Sending limits</h2>
        <div>
          <label className="label">Daily send limit (app-level guard rail)</label>
          <input
            className="input max-w-[200px]"
            type="number"
            min={1}
            max={10000}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
          />
          <p className="mt-1 text-xs text-slate-500">
            Exchange Online allows ~10,000 recipients/24h. Keep this well under (default 500)
            to avoid throttling and spam flags.
          </p>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">NVIDIA OCR (optional override)</h2>
        <p className="text-sm text-slate-500">
          Leave blank to use the server-configured key. Set here only to use your own NVIDIA
          Build API key for quote OCR.
        </p>
        <input
          className="input"
          type="password"
          placeholder="nvapi-xxxxxxxx…"
          value={nvidiaKey}
          onChange={(e) => setNvidiaKey(e.target.value)}
        />
      </section>

      {error && <ErrorState error={error} />}
      {saved && <p className="text-sm text-emerald-700">Saved.</p>}

      <button className="btn-primary" onClick={handleSave} disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}

function HubspotTokenHint({ kind }: { kind: ReturnType<typeof classifyHubspotToken> }) {
  if (kind === 'empty') return null;

  if (kind === 'private_app') {
    return (
      <p className="text-xs text-emerald-700">
        Private App access token detected — used directly against the HubSpot CRM API.
      </p>
    );
  }

  if (kind === 'personal_access_key') {
    return (
      <p className="text-xs text-emerald-700">
        Personal access key detected — it will be exchanged automatically for an access token on
        each import. (A personal access key is not itself a bearer token, which is why pasting
        one used to fail silently.)
      </p>
    );
  }

  return (
    <p className="text-xs text-amber-700">
      This doesn't look like a HubSpot credential. Expected a Private App access token starting{' '}
      <code>pat-</code>, or a personal access key (a long base64 string starting{' '}
      <code>Ci</code>). Saving it will fail at import time.
    </p>
  );
}
