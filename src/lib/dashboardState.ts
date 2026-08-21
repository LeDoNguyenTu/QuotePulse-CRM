import type { CompanyFilters } from '../hooks/useCompanies';
import type { ConfigurableTable } from './tablePreferences';

export interface ObjectListState {
  search: string;
  page: number;
}

export interface DashboardState {
  view: ConfigurableTable;
  companies: CompanyFilters;
  deals: ObjectListState;
  contacts: ObjectListState;
}

const PAGE_SIZE = 25;
const VIEWS = new Set<ConfigurableTable>(['companies', 'deals', 'contacts']);

export function clampPage(currentPage: number, count: number | undefined, pageSize: number): number {
  if (count == null) return Math.max(0, currentPage);
  const pageCount = Math.max(1, Math.ceil(Math.max(0, count) / Math.max(1, pageSize)));
  return Math.min(Math.max(0, currentPage), pageCount - 1);
}

function page(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed - 1 : 0;
}

function text(params: URLSearchParams, key: string): string | undefined {
  return params.get(key)?.trim() || undefined;
}

export function readDashboardState(search: string | URLSearchParams): DashboardState {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const requestedView = params.get('view') as ConfigurableTable | null;
  const companies: CompanyFilters = { page: page(params.get('cpage')), pageSize: PAGE_SIZE };
  const searchText = text(params, 'cq');
  const industry = text(params, 'industry');
  const sourcePriority = text(params, 'source');
  const activityFrom = text(params, 'from');
  const activityTo = text(params, 'to');
  if (searchText) companies.search = searchText;
  if (industry) companies.industry = industry;
  if (sourcePriority) companies.source_priority = sourcePriority;
  if (params.get('quote') === '1') companies.has_quote = true;
  if (params.get('kyc') === '1') companies.has_kyc = true;
  if (activityFrom) companies.activity_from = activityFrom;
  if (activityTo) companies.activity_to = activityTo;

  return {
    view: requestedView && VIEWS.has(requestedView) ? requestedView : 'companies',
    companies,
    deals: { search: text(params, 'dq') ?? '', page: page(params.get('dpage')) },
    contacts: { search: text(params, 'ctq') ?? '', page: page(params.get('ctpage')) },
  };
}

function setText(params: URLSearchParams, key: string, value: unknown) {
  if (typeof value === 'string' && value.trim()) params.set(key, value.trim());
}

function setPage(params: URLSearchParams, key: string, value: number | undefined) {
  if (value && value > 0) params.set(key, String(Math.floor(value) + 1));
}

export function writeDashboardState(state: DashboardState): string {
  const params = new URLSearchParams();
  if (state.view !== 'companies') params.set('view', state.view);
  setText(params, 'cq', state.companies.search);
  setText(params, 'industry', state.companies.industry);
  setText(params, 'source', state.companies.source_priority);
  if (state.companies.has_quote) params.set('quote', '1');
  if (state.companies.has_kyc) params.set('kyc', '1');
  setText(params, 'from', state.companies.activity_from);
  setText(params, 'to', state.companies.activity_to);
  setPage(params, 'cpage', state.companies.page);
  setText(params, 'dq', state.deals.search);
  setPage(params, 'dpage', state.deals.page);
  setText(params, 'ctq', state.contacts.search);
  setPage(params, 'ctpage', state.contacts.page);
  return params.toString();
}
