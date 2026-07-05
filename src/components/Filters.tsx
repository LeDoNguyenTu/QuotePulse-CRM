import { useIndustries } from '../hooks/useIndustries';
import type { CompanyFilters } from '../hooks/useCompanies';

interface FiltersProps {
  filters: CompanyFilters;
  onChange: (next: Partial<CompanyFilters>) => void;
}

export function Filters({ filters, onChange }: FiltersProps) {
  const { data: industries } = useIndustries();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        className="input max-w-[200px]"
        value={filters.industry ?? ''}
        onChange={(e) => onChange({ industry: e.target.value || undefined, page: 0 })}
      >
        <option value="">All industries</option>
        {industries?.map((i) => (
          <option key={i.id} value={i.name}>
            {i.name}
          </option>
        ))}
      </select>

      <select
        className="input max-w-[180px]"
        value={filters.source_priority ?? ''}
        onChange={(e) =>
          onChange({ source_priority: e.target.value || undefined, page: 0 })
        }
      >
        <option value="">All sources</option>
        <option value="recycled">Recycled</option>
        <option value="deleted">Deleted</option>
        <option value="current">Current</option>
      </select>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={!!filters.has_quote}
          onChange={(e) => onChange({ has_quote: e.target.checked || undefined, page: 0 })}
        />
        Has quote PDF
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={!!filters.has_kyc}
          onChange={(e) => onChange({ has_kyc: e.target.checked || undefined, page: 0 })}
        />
        Has KYC
      </label>
    </div>
  );
}
