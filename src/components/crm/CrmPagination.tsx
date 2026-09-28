interface CrmPaginationProps {
  page: number;
  pageSize: number;
  count: number;
  onPageChange: (page: number) => void;
}

export function CrmPagination({ page, pageSize, count, onPageChange }: CrmPaginationProps) {
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);
  const hasPrevious = page > 1;
  const hasNext = last < count;

  return (
    <nav className="crm-pagination" aria-label="Record pages">
      <p className="text-sm text-slate-600">
        <span className="font-medium tabular-nums text-slate-900">{first}–{last}</span> of{' '}
        <span className="tabular-nums">{count}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          aria-label="Previous page"
          disabled={!hasPrevious}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn-secondary"
          aria-label="Next page"
          disabled={!hasNext}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
