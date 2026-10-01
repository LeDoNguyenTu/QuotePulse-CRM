import { useState } from 'react';
import { CrmFilePicker } from '../../components/crm/CrmFilePicker';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState } from '../../components/ui';
import { usePstExtractor } from '../../hooks/crm/usePstExtractor';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';

export function CrmPstExtractor() {
  const workspace = useActiveWorkspace();
  const [search, setSearch] = useState('');
  const settledSearch = useDebouncedValue(search);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const api = usePstExtractor(workspace.id, settledSearch);
  const preview = api.state.preview;

  return <div className="space-y-6">
    <CrmPageHeader eyebrow="Local mailbox intelligence" title="PST extractor" description="Parse Outlook PST files locally. The PST and attachments stay on your device; sanitized message text is archived in R2 for traceable search." />
    <section className="crm-upload-panel space-y-4">
      <div className="crm-upload-heading"><div><h2>Extract local file</h2><p>Choose an Outlook archive to process securely in this browser.</p></div><span>Up to 400 MiB</span></div>
      <CrmFilePicker accept=".pst,application/vnd.ms-outlook" actionLabel="Select PST file" description="Stays on this device · PST up to 400 MiB" fileName={selectedFileName} title="Outlook archive" onSelect={(file) => { setSelectedFileName(file.name); api.extract(file); }} />
      {api.state.status === 'parsing' && <p className="text-sm text-slate-600">Parsing locally... {api.state.messageCount} messages found across {api.state.folders} folders.</p>}
      {api.state.status === 'error' && <p className="text-sm text-red-700">{api.state.error}</p>}
      {api.state.status === 'complete' && <><p className="text-sm text-emerald-700">Found {api.state.messageCount} messages in {api.state.folders} folders with {api.state.errors} recoverable errors.</p><button className="btn-primary" disabled={api.save.isPending} onClick={() => api.save.mutate()}>{api.save.isPending ? 'Saving metadata...' : 'Save searchable metadata'}</button></>}
      {api.save.error && <ErrorState error={api.save.error} />}
      {api.save.isSuccess && <p className="text-sm text-emerald-700">Verified mailbox archive saved and {api.save.data.contactsCreated} new contacts created. The PST itself was not uploaded.</p>}
      {preview.length > 0 && <div className="crm-task-list">{preview.map((message) => <article key={message.source_key}><div><strong>{message.subject || '(No subject)'}</strong><p>{message.sender_email || 'Unknown sender'} · {message.folder_path}</p></div><time>{message.message_at ? new Date(message.message_at).toLocaleString('en-SG') : 'Unknown date'}</time></article>)}</div>}
    </section>
    <section className="crm-detail-panel crm-mailbox-panel">
      <div className="crm-panel-heading"><h2>Saved mailbox metadata</h2><span>Message metadata and import lineage</span></div>
      <div className="crm-panel-body">
        <p className="text-xs text-slate-500">Search covers filename, folder, subject, addresses, and a bounded text preview. Full sanitized message text is kept in checksum-verified R2 chunks; attachments and the PST file are never stored.</p>
        <input className="input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search filename, folder, subject, or message text" />
        {api.saved.isFetching && <p className="crm-panel-note" role="status">Updating saved messages…</p>}
        {api.saved.error ? <ErrorState error={api.saved.error} /> : <div className="crm-task-list">{api.saved.data?.map((message) => <article key={message.id}><div><strong>{message.subject || '(No subject)'}</strong><p>{message.mailbox_import?.file_name ?? 'Unknown PST'} · {message.folder_path}</p><p>{message.sender_display_name || message.sender_email || 'Unknown sender'} · {message.recipient_emails.join(', ')}</p>{message.body_preview && <small>{message.body_preview}</small>}</div><time>{message.message_at ? new Date(message.message_at).toLocaleString('en-SG') : 'Unknown date'}</time></article>)}</div>}
      </div>
    </section>
  </div>;
}
