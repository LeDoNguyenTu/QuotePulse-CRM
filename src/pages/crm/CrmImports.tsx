import { useMemo, useState } from 'react';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import { useCrmImports } from '../../hooks/crm/useCrmImports';
import { parseUploadedWorkbook, type ParsedWorkbook } from '../../lib/uploadedFileWorkbook';
import { CRM_IMPORT_ROLES, normalizeCrmImportRows, suggestCrmImportMapping, validateCrmImportMapping, type CrmImportMapping } from '../../lib/crm/importPreview';
import { CrmPageHeader } from '../../components/crm/CrmPageChrome';
import { ErrorState, Spinner } from '../../components/ui';

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function CrmImports() {
  const workspace = useActiveWorkspace();
  const api = useCrmImports(workspace.id);
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<CrmImportMapping>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.commit.mutateAsync>> | null>(null);
  const sheet = workbook?.sheets[sheetIndex] ?? null;
  const preview = useMemo(() => sheet ? normalizeCrmImportRows(sheet.rows, mapping, api.indexes.data ?? { companies: [], contacts: [] }) : [], [api.indexes.data, mapping, sheet]);
  const mappingError = sheet ? validateCrmImportMapping(mapping, sheet.headers).error : null;
  const validRows = preview.filter((row) => row.valid);

  const choose = async (input: File | null) => {
    if (!input) return;
    try { const parsed = await parseUploadedWorkbook(input); setFile(input); setWorkbook(parsed); setSheetIndex(0); setMapping(suggestCrmImportMapping(parsed.sheets[0]?.headers ?? [])); setResult(null); setLocalError(null); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
  };
  const commit = async () => {
    if (!file || !sheet || mappingError || !validRows.length) return;
    try { setResult(await api.commit.mutateAsync({ filename: file.name, sheetName: sheet.name, checksum: await sha256(file), sourceRowCount: preview.length, rows: validRows })); setLocalError(null); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
  };
  return <div className="space-y-6">
    <CrmPageHeader eyebrow="Source reconciliation" title="Imports" description="Map a workbook into CRM records, review issues, and retain a stable Database ID without storing the raw workbook." />
    <section className="crm-ledger-intro space-y-4">
      <input aria-label="Choose workbook" type="file" accept=".xlsx,.xlsm,.csv" onChange={(event) => void choose(event.target.files?.[0] ?? null)} />
      {sheet && <>
        {workbook!.sheets.length > 1 && <label className="block max-w-sm"><span className="label">Worksheet</span><select className="input" value={sheetIndex} onChange={(event) => { const index = Number(event.target.value); setSheetIndex(index); setMapping(suggestCrmImportMapping(workbook!.sheets[index]?.headers ?? [])); }}>{workbook!.sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>}
        <p className="text-sm text-slate-600"><b>{file?.name}</b> · {sheet.name} · {sheet.rows.length.toLocaleString()} rows</p>
        <div className="grid gap-4 lg:grid-cols-4">{(['Company', 'Contact', 'Deal', 'Activity'] as const).map((group) => <fieldset key={group} className="border border-slate-200 p-4"><legend className="px-1 font-semibold">{group}</legend><div className="space-y-3">{CRM_IMPORT_ROLES.filter((role) => role.group === group).map((role) => <label key={role.key} className="block text-sm">{role.label}<select className="input mt-1" value={mapping[role.key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [role.key]: event.target.value || null }))}><option value="">Not mapped</option>{sheet.headers.map((header) => <option key={header}>{header}</option>)}</select></label>)}</div></fieldset>)}</div>
        <div className="flex flex-wrap gap-4 text-sm"><span>{validRows.length} valid</span><span className="text-red-700">{preview.length - validRows.length} invalid</span><span>{preview.filter((row) => row.duplicateOfRow).length} duplicates</span></div>
        {mappingError && <p className="text-sm text-red-700">{mappingError}</p>}
        {preview.length > 0 && <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Row</th><th>Company</th><th>Contact</th><th>Deal</th><th>Review</th></tr></thead><tbody>{preview.slice(0, 25).map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.company.name || '—'}</td><td>{row.contact?.full_name ?? row.contact?.email ?? '—'}</td><td>{row.deal?.name ?? '—'}</td><td>{row.issues.join(' ') || (row.duplicateOfRow ? `Duplicate of row ${row.duplicateOfRow}` : 'Ready')}</td></tr>)}</tbody></table></div>}
        <button className="btn-primary" disabled={Boolean(mappingError) || !validRows.length || api.commit.isPending} onClick={() => void commit()}>{api.commit.isPending ? 'Importing…' : `Import ${validRows.length} valid rows`}</button>
      </>}
    </section>
    {(localError || api.indexes.error) && <ErrorState error={localError ?? api.indexes.error} />}
    {result && <section className="border-l-4 border-emerald-600 bg-emerald-50 p-5"><p className="font-semibold">Import {result.database_id} complete</p><p className="mt-1 text-sm">{result.created_companies} companies, {result.created_contacts} contacts, {result.created_deals} deals, and {result.created_activities} activities created.</p></section>}
    <section><h2 className="mb-3 text-lg font-semibold">Import history</h2>{api.history.isLoading ? <Spinner /> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Database ID</th><th>Source</th><th>Sheet</th><th>Rows</th><th>Imported</th></tr></thead><tbody>{(api.history.data ?? []).map((item: any) => <tr key={item.id}><td className="font-semibold">{item.database_id}</td><td>{item.original_filename}</td><td>{item.sheet_name ?? '—'}</td><td>{item.row_count}</td><td>{new Date(item.created_at).toLocaleDateString('en-SG')}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
