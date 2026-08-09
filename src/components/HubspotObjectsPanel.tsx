import { useEffect, useMemo, useState } from 'react';
import { useHubspotPropertyCatalog } from '../hooks/useHubspotPropertyCatalog';
import { useHubspotObjects } from '../hooks/useHubspotObjects';
import { useSaveSettings, useSettings } from '../hooks/useSettings';
import { mergeHubspotColumnOptions, type HubspotObjectTableType } from '../lib/hubspotObjectTable';
import { DEFAULT_VISIBLE_COLUMNS, resolveVisibleColumns, saveVisibleColumns } from '../lib/tablePreferences';
import { ColumnSelector } from './ColumnSelector';
import { HubspotObjectTable } from './HubspotObjectTable';
import { SearchBar } from './SearchBar';
import { ErrorState, Spinner } from './ui';

const PAGE_SIZE = 25;

export function HubspotObjectsPanel({ objectType }: { objectType: HubspotObjectTableType }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const settings = useSettings();
  const saveSettings = useSaveSettings();
  const catalog = useHubspotPropertyCatalog(objectType);
  const query = useHubspotObjects(objectType, { search, page, pageSize: PAGE_SIZE });
  const visible = resolveVisibleColumns(objectType, settings.data?.table_column_preferences);
  const options = useMemo(
    () => mergeHubspotColumnOptions(objectType, catalog.data ?? []),
    [catalog.data, objectType]
  );
  const columns = options.filter((column) => visible.includes(column.id));
  const count = query.data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  useEffect(() => {
    if (page >= pageCount) setPage(pageCount - 1);
  }, [page, pageCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar value={search} onChange={(value) => {
          setSearch(value);
          setPage(0);
        }} />
        <ColumnSelector
          options={options}
          visible={visible}
          onChange={(next) => saveSettings.mutate({
            table_column_preferences: saveVisibleColumns(
              settings.data?.table_column_preferences,
              objectType,
              next
            ),
          })}
          onRestore={() => saveSettings.mutate({
            table_column_preferences: saveVisibleColumns(
              settings.data?.table_column_preferences,
              objectType,
              null
            ),
          })}
        />
        <span className="text-xs text-slate-500">
          All discovered fields are listed; fields with no imported value are grouped as null.
        </span>
      </div>

      {catalog.error && <ErrorState error={catalog.error} />}
      {query.error && <ErrorState error={query.error} />}
      {query.isLoading ? (
        <Spinner label={`Loading ${objectType}…`} />
      ) : (
        <div className="relative">
          <HubspotObjectTable
            rows={query.data?.rows ?? []}
            columns={columns}
            emptyLabel={`No ${objectType} found.`}
          />
          {query.isFetching && (
            <div className="absolute inset-0 grid place-items-center bg-white/65" aria-live="polite">
              <Spinner label={`Loading page ${page + 1}…`} />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{count.toLocaleString()} {objectType} · page {page + 1} of {pageCount}</span>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => value - 1)}>Prev</button>
          <button className="btn-secondary" disabled={page + 1 >= pageCount || query.isFetching} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      </div>

      {columns.length === 0 && (
        <p className="text-sm text-amber-700">No columns selected. Use Columns or restore {DEFAULT_VISIBLE_COLUMNS[objectType].length} defaults.</p>
      )}
    </div>
  );
}
