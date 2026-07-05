import { useEffect, useState } from 'react';
import { useSaveSettings, useSettings } from '../hooks/useSettings';
import { functions } from '../lib/functions';
import { ErrorState, Spinner } from '../components/ui';

export function Settings() {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();

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

  if (isLoading) return <Spinner />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">HubSpot</h2>
        <p className="text-sm text-slate-500">
          Paste your HubSpot <b>Private App</b> access token. It's stored privately in your
          user settings and only read by the ingestion Edge Function.
        </p>
        <input
          className="input"
          type="password"
          placeholder="pat-na1-xxxxxxxx…"
          value={hubspotToken}
          onChange={(e) => setHubspotToken(e.target.value)}
        />
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-semibold">Microsoft 365 mailbox</h2>
        <p className="text-sm text-slate-500">
          Connect the Outlook mailbox used to send outreach. We request the delegated{' '}
          <code>Mail.Send</code> permission and store only a refresh token.
        </p>
        {data?.ms_refresh_token ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">
              Connected
            </span>
            <span className="text-slate-600">{data.ms_account_email ?? 'mailbox linked'}</span>
            <button className="btn-secondary ml-auto" onClick={connectMicrosoft}>
              Reconnect
            </button>
          </div>
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
