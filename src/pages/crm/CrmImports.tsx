import { useMemo, useState } from 'react';
import { CrmFilePicker } from '../../components/crm/CrmFilePicker';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';
import { useCrmImports } from '../../hooks/crm/useCrmImports';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import {
  buildCrmHeaderMatches, CRM_IMPORT_ROLES, normalizeCrmImportRows,
  suggestCrmImportMapping, unconfirmedSemanticHeaders, validateCrmImportMapping,
  type CrmHeaderMatch, type CrmImportMapping,
} from '../../lib/crm/importPreview';
import { parseUploadedWorkbook, type ParsedWorkbook } from '../../lib/uploadedFileWorkbook';

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function fileBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function CrmImports() {
  const workspace = useActiveWorkspace();
  const api = useCrmImports(workspace.id);
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<CrmImportMapping>({});
  const [headerMatches, setHeaderMatches] = useState<CrmHeaderMatch[]>([]);
  const [confirmedHeaders, setConfirmedHeaders] = useState<Set<string>>(new Set());
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.commit.mutateAsync>> | null>(null);
  const sheet = workbook?.sheets[sheetIndex] ?? null;
  const preview = useMemo(() => sheet
    ? normalizeCrmImportRows(sheet.rows, mapping, api.indexes.data ?? { companies: [], contacts: [] })
    : [], [api.indexes.data, mapping, sheet]);
  const mappingError = sheet ? validateCrmImportMapping(mapping, sheet.headers).error : null;
  const validRows = preview.filter((row) => row.valid);
  const duplicateRows = preview.filter((row) => row.duplicateOfRow);
  const pendingConfirmations = unconfirmedSemanticHeaders(headerMatches, confirmedHeaders)
    .filter((header) => Object.values(mapping).includes(header));

  function resetSheetMapping(headers: string[]) {
    setMapping(suggestCrmImportMapping(headers));
    setHeaderMatches(buildCrmHeaderMatches(headers));
    setConfirmedHeaders(new Set());
  }

  async function choose(input: File | null) {
    if (!input) return;
    try {
      const parsed = await parseUploadedWorkbook(input);
      setFile(input); setWorkbook(parsed); setSheetIndex(0);
      resetSheetMapping(parsed.sheets[0]?.headers ?? []);
      setResult(null); setLocalError(null);
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
  }

  function mapHeader(header: string, roleValue: string) {
    setMapping((current) => {
      const next = { ...current };
      for (const [role, mappedHeader] of Object.entries(next)) {
        if (mappedHeader === header || role === roleValue) delete next[role as keyof CrmImportMapping];
      }
      if (roleValue) next[roleValue as keyof CrmImportMapping] = header;
      return next;
    });
    setConfirmedHeaders((current) => new Set(current).add(header));
  }

  async function commit() {
    if (!file || !sheet || mappingError || pendingConfirmations.length || !validRows.length) return;
    try {
      setResult(await api.commit.mutateAsync({ filename: file.name, mimeType: file.type || 'application/octet-stream',
        sheetName: sheet.name, checksum: await sha256(file), sourceRowCount: preview.length,
        rows: validRows, headers: sheet.headers, mapping, templateBase64: await fileBase64(file) }));
      setLocalError(null);
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
  }

  async function exportWorkbook(sourceImport: any) {
    try {
      const exported = await api.exportImport.mutateAsync(sourceImport);
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setLocalError(null);
    } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
  }

  return <div className="space-y-6">
    <CrmPageHeader eyebrow="Source reconciliation" title="Imports" description="Work with the workbook's own columns, confirm uncertain matches, and retain source lineage." />
    <section className="crm-ledger-intro space-y-4">
      <CrmFilePicker accept=".xlsx,.xlsm,.csv" actionLabel="Select workbook" description="Excel or CSV · .xlsx, .xlsm, or .csv" fileName={file?.name} title="Workbook source" onSelect={(selected) => void choose(selected)} />
      {sheet && <>
        {workbook!.sheets.length > 1 && <label className="block max-w-sm"><span className="label">Worksheet</span><select className="input" value={sheetIndex} onChange={(event) => { const index = Number(event.target.value); setSheetIndex(index); resetSheetMapping(workbook!.sheets[index]?.headers ?? []); }}>{workbook!.sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>}
        <div className="crm-import-source-line"><b>{file?.name}</b><span>{sheet.name}</span><span>{sheet.rows.length.toLocaleString()} rows</span></div>
        <section className="crm-mapping-summary" aria-labelledby="mapping-summary-title">
          <div><p className="crm-eyebrow">Workbook columns</p><h2 id="mapping-summary-title">Review how each Excel column connects</h2><p>Only columns found in this worksheet are shown. Source-only columns stay in the workbook and return unchanged on export.</p></div>
          <div className="crm-source-mapping-list">{headerMatches.map((match) => {
            const selectedRole = (Object.entries(mapping).find(([, header]) => header === match.header)?.[0] ?? '') as keyof CrmImportMapping | '';
            const needsConfirmation = pendingConfirmations.includes(match.header);
            return <div className="crm-source-mapping-row" key={match.header}>
              <div><b>{match.header}</b><small>{selectedRole ? (needsConfirmation ? 'Suggested match — confirm before import' : 'Connected') : 'Kept in workbook only'}</small></div>
              <select className="input" aria-label={`CRM field for ${match.header}`} value={selectedRole} onChange={(event) => mapHeader(match.header, event.target.value)}>
                <option value="">Keep in workbook only</option>
                {(['Company', 'Contact', 'Deal', 'Activity'] as const).map((group) => <optgroup key={group} label={group}>{CRM_IMPORT_ROLES.filter((role) => role.group === group).map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}</optgroup>)}
              </select>
              {needsConfirmation ? <button className="btn-secondary" type="button" onClick={() => setConfirmedHeaders((current) => new Set(current).add(match.header))}>Confirm match</button> : <span className="crm-match-status">{selectedRole ? 'Matched' : 'Source only'}</span>}
            </div>;
          })}</div>
        </section>
        <div className="crm-import-counts"><span><b>{validRows.length}</b> ready</span><span className="is-error"><b>{preview.length - validRows.length}</b> need attention</span><span><b>{duplicateRows.length}</b> exact {duplicateRows.length === 1 ? 'duplicate' : 'duplicates'}</span></div>
        {mappingError && <p className="text-sm text-red-700">{mappingError}</p>}
        {pendingConfirmations.length > 0 && <p className="crm-match-warning">Confirm {pendingConfirmations.length} suggested {pendingConfirmations.length === 1 ? 'match' : 'matches'} before importing.</p>}
        {preview.length > 0 && <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Row</th>{sheet.headers.map((header) => <th key={header}>{header}</th>)}<th>Review</th></tr></thead><tbody>{preview.slice(0, 25).map((row, index) => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{sheet.headers.map((header) => <td key={header}>{String(sheet.rows[index]?.[header] ?? '') || '—'}</td>)}<td>{row.issues.join(' ') || row.warnings.join(' ') || (row.duplicateOfRow ? `Same record as row ${row.duplicateOfRow}; lineage retained` : 'Ready')}</td></tr>)}</tbody></table></div>}
        <button className="btn-primary" disabled={Boolean(mappingError) || pendingConfirmations.length > 0 || !validRows.length || api.commit.isPending} onClick={() => void commit()}>{api.commit.isPending ? 'Importing…' : `Import ${validRows.length} ready rows`}</button>
      </>}
    </section>
    {(localError || api.indexes.error) && <ErrorState error={localError ?? api.indexes.error} />}
    {result && <section className="border-l-4 border-emerald-600 bg-emerald-50 p-5"><p className="font-semibold">Import {result.database_id} complete</p><p className="mt-1 text-sm">{result.created_companies} companies, {result.created_contacts} contacts, {result.created_deals} deals, and {result.created_activities} activities created.</p></section>}
    <section><h2 className="mb-3 text-lg font-semibold">Import history</h2>{api.history.isLoading ? <Spinner /> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Database ID</th><th>Source</th><th>Sheet</th><th>Rows</th><th>Imported</th><th>Workbook</th></tr></thead><tbody>{(api.history.data ?? []).map((item: any) => { const exportable = item.source_metadata?.format === 'source-preserving-crm-import-v2'; return <tr key={item.id}><td className="font-semibold">{item.database_id}</td><td>{item.original_filename}</td><td>{item.sheet_name ?? '—'}</td><td>{item.row_count}</td><td>{new Date(item.created_at).toLocaleDateString('en-SG')}</td><td><button className="btn-secondary" disabled={!exportable || api.exportImport.isPending} title={exportable ? 'Export with current CRM values in the original workbook layout' : 'This older import has no preserved workbook template'} onClick={() => void exportWorkbook(item)}>{api.exportImport.isPending ? 'Preparing…' : 'Export workbook'}</button></td></tr>; })}</tbody></table></div>}</section>
  </div>;
}
