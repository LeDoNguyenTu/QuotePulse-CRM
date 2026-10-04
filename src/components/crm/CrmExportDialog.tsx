import { useEffect, useMemo, useState } from 'react';
import { exportCrmRecords } from '../../lib/functions';
import {
  buildCrmExportRequest,
  type CrmExportEntity,
  type CrmExportFilters,
  type CrmExportFormat,
} from '../../lib/crm/exportSelection';
import { Modal } from '../Modal';

export interface CrmExportOption {
  id: string;
  label: string;
}

interface CrmExportDialogProps {
  workspaceId: string;
  entity: CrmExportEntity;
  options: CrmExportOption[];
  defaultColumns: string[];
  selectedIds: ReadonlySet<string>;
  filters: CrmExportFilters;
}

export function CrmExportDialog({
  workspaceId,
  entity,
  options,
  defaultColumns,
  selectedIds,
  filters,
}: CrmExportDialogProps) {
  const allowedIds = useMemo(() => new Set(options.map((option) => option.id)), [options]);
  const initialColumns = useMemo(() => {
    const visible = defaultColumns.filter((column) => allowedIds.has(column));
    return visible.length > 0 ? visible : options.slice(0, 1).map((option) => option.id);
  }, [allowedIds, defaultColumns, options]);
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [format, setFormat] = useState<CrmExportFormat>('xlsx');
  const [exportSelected, setExportSelected] = useState(selectedIds.size > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setColumns(initialColumns);
    setExportSelected(selectedIds.size > 0);
    setError(null);
  }, [initialColumns, open, selectedIds.size]);

  const toggleColumn = (id: string) => setColumns((current) => (
    current.includes(id) ? current.filter((column) => column !== id) : [...current, id]
  ));

  const download = async () => {
    if (columns.length === 0) {
      setError('Choose at least one column.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const blob = await exportCrmRecords(buildCrmExportRequest({
        workspaceId, entity, format, columns, selectedIds, filters, exportSelected,
      }));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${entity}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to export records.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Export</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Export ${entity}`}>
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">Rows</legend>
            {selectedIds.size > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name={`${entity}-export-scope`} checked={exportSelected} onChange={() => setExportSelected(true)} />
                Selected rows ({selectedIds.size})
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name={`${entity}-export-scope`} checked={!exportSelected} onChange={() => setExportSelected(false)} />
              All matching rows
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">File format</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`${entity}-export-format`} checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} /> Excel (.xlsx)</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name={`${entity}-export-format`} checked={format === 'csv'} onChange={() => setFormat('csv')} /> CSV (.csv)</label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">Columns, in export order</legend>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-md border border-slate-200 p-3 sm:grid-cols-2">
              {options.map((option) => (
                <label key={option.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={columns.includes(option.id)} onChange={() => toggleColumn(option.id)} />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={busy || columns.length === 0} onClick={download}>{busy ? 'Exportingâ€¦' : 'Download'}</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
