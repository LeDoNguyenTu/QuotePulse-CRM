import { useNavigate } from 'react-router-dom';
import { formatDate } from '../lib/dates';
import {
  hubspotObjectCellValue,
  type HubspotObjectColumn,
} from '../lib/hubspotObjectTable';
import type { HubspotObjectRow } from '../hooks/useHubspotObjects';

const DATE_COLUMNS = new Set([
  'hubspot_created_at',
  'hubspot_modified_at',
  'created_at',
  'updated_at',
  'createdate',
  'hs_lastmodifieddate',
]);

function displayValue(value: unknown, columnId: string): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (DATE_COLUMNS.has(columnId) && typeof value === 'string') return formatDate(value);
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function HubspotObjectTable({
  rows,
  columns,
  emptyLabel,
}: {
  rows: HubspotObjectRow[];
  columns: HubspotObjectColumn[];
  emptyLabel: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => <th key={column.id} className="whitespace-nowrap px-3 py-2">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const companyId = row.company_id;
            return (
              <tr
                key={row.id}
                className={`border-b border-slate-100 ${companyId ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                onClick={() => companyId && navigate(`/company/${companyId}`)}
              >
                {columns.map((column) => {
                  const rendered = displayValue(hubspotObjectCellValue(row, column.id), column.id);
                  return (
                    <td key={column.id} className="max-w-72 truncate whitespace-nowrap px-3 py-2 text-slate-700" title={rendered === '—' ? '' : rendered}>
                      {rendered}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-sm text-slate-500">{emptyLabel}</div>}
    </div>
  );
}
