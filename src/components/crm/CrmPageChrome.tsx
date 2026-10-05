import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Spinner } from '../ui';

export function CrmPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="crm-page-header">
      <div className="max-w-3xl">
        <p className="crm-eyebrow">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action}
    </header>
  );
}

export function CrmFilterBar({
  search,
  onSearchChange,
  placeholder,
  children,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
}) {
  return (
    <div className="crm-filter-bar">
      <label className="crm-filter-bar__search min-w-0">
        <span className="sr-only">Search</span>
        <input
          className="input"
          type="search"
          value={search}
          placeholder={placeholder}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      {children}
    </div>
  );
}

export function CrmResourceState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) return <div className="crm-state"><Spinner label="Loading records…" /></div>;
  if (error) return <ErrorState error={error} />;
  if (empty) return <EmptyState>No records match this view.</EmptyState>;
  return <>{children}</>;
}

export function CrmRowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button type="button" className="crm-text-action" onClick={onEdit}>Edit</button>
      {onDelete && (
        <button type="button" className="crm-text-action crm-text-action--danger" onClick={onDelete}>
          Delete
        </button>
      )}
    </div>
  );
}
