import { useIndustryFacets } from '../hooks/useIndustries';
import type { CompanyFilters } from '../hooks/useCompanies';

interface FiltersProps {
  filters: CompanyFilters;
  onChange: (next: Partial<CompanyFilters>) => void;
}

export function Filters({ filters, onChange }: FiltersProps) {
  // Only the industries that actually occur in the user's companies — offering a
  // value that cannot match anything is worse than offering nothing.
  const { data: facets } = useIndustryFacets();

  return (
    <div className="contents">
      <select
        className="input max-w-[240px]"
        value={filters.industry ?? ''}
        onChange={(e) => onChange({ industry: e.target.value || undefined, page: 0 })}
      >
        <option value="">All industries</option>
        {facets?.map((f) => (
          <option key={f.industry} value={f.industry}>
            {f.industry} ({f.company_count})
          </option>
        ))}
        {facets?.length === 0 && (
          <option value="" disabled>
            No industries set yet — run the import
          </option>
        )}
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

      <div className="order-2 flex basis-full flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          HubSpot activity from
          <input
            className="input w-auto"
            type="date"
            value={filters.activity_from ?? ''}
            onChange={(e) => onChange({ activity_from: e.target.value || undefined, page: 0 })}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          to
          <input
            className="input w-auto"
            type="date"
            value={filters.activity_to ?? ''}
            onChange={(e) => onChange({ activity_to: e.target.value || undefined, page: 0 })}
          />
        </label>

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
    </div>
  );
}
