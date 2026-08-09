import { useNavigate } from 'react-router-dom';
import type { CompanyDashboardRow } from '../lib/types';
import { formatDate, formatRelative } from '../lib/dates';
import { Flag, PriorityBadge, StatusBadge } from './ui';

/** Relative label ("3d ago") with the absolute date on hover; em dash when empty. */
function RelativeDate({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <span title={formatDate(value)}>{formatRelative(value)}</span>;
}

interface CompaniesTableProps {
  rows: CompanyDashboardRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], value: boolean) => void;
  visibleColumns?: string[];
  extraColumns?: Array<{ id: string; label: string }>;
}

export function CompaniesTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  visibleColumns = [
    'name_clean', 'products', 'industry', 'hubspot_created_at',
    'hubspot_last_modified_at', 'source_priority', 'primary_contact', 'flags', 'last_email',
  ],
  extraColumns = [],
}: CompaniesTableProps) {
  const navigate = useNavigate();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const shown = new Set(visibleColumns);

  return (
    <div className="card overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => onToggleAll(rows.map((r) => r.id), e.target.checked)}
              />
            </th>
            {shown.has('name_clean') && <th className="px-3 py-2">Company</th>}
            {shown.has('products') && <th className="px-3 py-2">Products</th>}
            {shown.has('industry') && <th className="px-3 py-2">Industry</th>}
            {shown.has('hubspot_created_at') && <th className="px-3 py-2">HubSpot created</th>}
            {shown.has('hubspot_last_modified_at') && <th className="px-3 py-2">HubSpot last modified</th>}
            {shown.has('source_priority') && <th className="px-3 py-2">Source</th>}
            {shown.has('primary_contact') && <th className="px-3 py-2">Primary contact</th>}
            {shown.has('flags') && <th className="px-3 py-2">Flags</th>}
            {shown.has('last_email') && <th className="px-3 py-2">Last email</th>}
            {extraColumns.map((column) => <th key={column.id} className="px-3 py-2">{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
              onClick={() => navigate(`/company/${r.id}`)}
            >
              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => onToggle(r.id)}
                />
              </td>
              {shown.has('name_clean') && <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{r.name_clean}</div>
                {r.name_raw && r.name_raw !== r.name_clean && (
                  <div className="text-xs text-slate-400">{r.name_raw}</div>
                )}
              </td>}
              {shown.has('products') && <td className="px-3 py-2">
                <ProductTags value={r.products} />
              </td>}
              {shown.has('industry') && <td className="px-3 py-2 text-slate-600">{r.industry ?? '—'}</td>}
              {shown.has('hubspot_created_at') && <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                <RelativeDate value={r.last_hubspot_created_at} />
              </td>}
              {shown.has('hubspot_last_modified_at') && <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                <RelativeDate value={r.last_hubspot_modified_at} />
                {r.deal_count ? (
                  <div className="text-xs text-slate-400">
                    {r.deal_count} deal{r.deal_count === 1 ? '' : 's'}
                  </div>
                ) : null}
              </td>}
              {shown.has('source_priority') && <td className="px-3 py-2">
                <PriorityBadge value={r.source_priority} />
              </td>}
              {shown.has('primary_contact') && <td className="px-3 py-2">
                {r.primary_contact_name || r.primary_contact_email ? (
                  <div>
                    <div className="text-slate-700">{r.primary_contact_name ?? '—'}</div>
                    <div className="text-xs text-slate-400">
                      {r.primary_contact_email ?? ''}
                      {r.primary_contact_phone ? ` · ${r.primary_contact_phone}` : ''}
                    </div>
                  </div>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>}
              {shown.has('flags') && <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  <Flag on={r.has_quote} label="Quote" />
                  <Flag on={r.has_kyc} label="KYC" />
                </div>
              </td>}
              {shown.has('last_email') && <td className="px-3 py-2">
                <StatusBadge value={r.last_email_status} />
                {r.last_email_sent_at && (
                  <div className="text-xs text-slate-400">
                    {new Date(r.last_email_sent_at).toLocaleDateString()}
                  </div>
                )}
              </td>}
              {extraColumns.map((column) => (
                <td key={column.id} className="max-w-56 truncate px-3 py-2" title={r.hubspot_properties[column.id] ?? ''}>
                  {r.hubspot_properties[column.id] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-8 text-center text-sm text-slate-500">No companies found.</div>
      )}
    </div>
  );
}

/**
 * The brands this company buys, taken from the front of its deal names. A single
 * customer often appears under several (ADOBE, ADSK, TRAINING), so cap what is
 * shown and count the rest.
 */
function ProductTags({ value }: { value: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;

  const products = value.split(', ').filter(Boolean);
  const shown = products.slice(0, 3);
  const extra = products.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1" title={products.join(', ')}>
      {shown.map((p) => (
        <span
          key={p}
          className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600"
        >
          {p}
        </span>
      ))}
      {extra > 0 && <span className="text-xs text-slate-400">+{extra}</span>}
    </div>
  );
}
