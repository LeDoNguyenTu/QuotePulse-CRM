import { useState } from 'react';

interface Props {
  recordLabel: string;
  pending: boolean;
  onCancel: () => void;
  onRestore: () => Promise<{ status: 'restored' | 'already_restored' | 'conflict' }>;
}

export function ArchivedEditWarning({ recordLabel, pending, onCancel, onRestore }: Props) {
  const [result, setResult] = useState<string | null>(null);
  const restore = async () => {
    try {
      const value = await onRestore();
      setResult(value.status === 'conflict' ? 'This archive copy conflicts with a live record. Nothing was overwritten.' : value.status === 'already_restored' ? 'This record is already available in the live database.' : 'Record restored. Open the Live tab to edit it.');
    } catch (error) { setResult(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="crm-archive-warning" role="dialog" aria-modal="true" aria-labelledby="archive-edit-title">
    <div><h3 id="archive-edit-title">Restore before editing</h3><p><strong>{recordLabel}</strong> is read-only in R2. Restore this record and any required parent company to the live database before editing. The archive remains unchanged.</p>{result && <p role="status">{result}</p>}<div><button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button><button className="btn-primary" type="button" disabled={pending} onClick={() => void restore()}>{pending ? 'Restoring…' : 'Restore record'}</button></div></div>
  </div>;
}
