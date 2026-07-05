import { useNavigate } from 'react-router-dom';
import type { CompanyDashboardRow } from '../lib/types';
import { Flag, PriorityBadge, StatusBadge } from './ui';

interface CompaniesTableProps {
  rows: CompanyDashboardRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], value: boolean) => void;
}

export function CompaniesTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
}: CompaniesTableProps) {
  const navigate = useNavigate();
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

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
            <th className="px-3 py-2">Company</th>
            <th className="px-3 py-2">Industry</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Primary contact</th>
            <th className="px-3 py-2">Flags</th>
            <th className="px-3 py-2">Last email</th>
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
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{r.name_clean}</div>
                {r.name_raw && r.name_raw !== r.name_clean && (
                  <div className="text-xs text-slate-400">{r.name_raw}</div>
                )}
              </td>
              <td className="px-3 py-2 text-slate-600">{r.industry ?? '—'}</td>
              <td className="px-3 py-2">
                <PriorityBadge value={r.source_priority} />
              </td>
              <td className="px-3 py-2">
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
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  <Flag on={r.has_quote} label="Quote" />
                  <Flag on={r.has_kyc} label="KYC" />
                </div>
              </td>
              <td className="px-3 py-2">
                <StatusBadge value={r.last_email_status} />
                {r.last_email_sent_at && (
                  <div className="text-xs text-slate-400">
                    {new Date(r.last_email_sent_at).toLocaleDateString()}
                  </div>
                )}
              </td>
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
