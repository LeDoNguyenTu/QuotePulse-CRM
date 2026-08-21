import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { accountQueryKey } from '../lib/accountQueryScope';
import { supabase } from '../lib/supabase';
import type { Contact, Deal } from '../lib/types';
import type { HubspotObjectTableType } from '../lib/hubspotObjectTable';
import { useAuth } from './useAuth';
import { functions } from '../lib/functions';
import { restoreArchivedDealProperties } from '../lib/hubspotObjectsArchive';

export type HubspotObjectRow = Deal | Contact;

export interface HubspotObjectFilters {
  search?: string;
  page: number;
  pageSize: number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function useHubspotObjects(
  objectType: HubspotObjectTableType,
  filters: HubspotObjectFilters
) {
  const { user } = useAuth();
  return useQuery<{ rows: HubspotObjectRow[]; count: number }>({
    queryKey: accountQueryKey(user?.id, ['hubspot-objects', objectType, filters]),
    enabled: !!user,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = filters.page * filters.pageSize;
      let query = (supabase as any)
        .from(objectType)
        .select('*', { count: 'exact' })
        .eq('owner_id', user!.id);

      const search = filters.search?.trim();
      if (search) {
        query = query.ilike(objectType === 'deals' ? 'deal_name_raw' : 'full_name', `%${escapeLike(search)}%`);
      }

      if (objectType === 'deals') {
        query = query
          .order('hubspot_modified_at', { ascending: false, nullsFirst: false })
          .order('hubspot_created_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true });
      } else {
        query = query.order('updated_at', { ascending: false }).order('id', { ascending: true });
      }

      const { data, count, error } = await query.range(from, from + filters.pageSize - 1);
      if (error) throw error;
      const rows = (data ?? []) as HubspotObjectRow[];
      if (objectType === 'deals' && rows.length > 0) {
        await restoreArchivedDealProperties(rows as Deal[], functions.dealArchiveProperties);
      }
      return { rows, count: count ?? 0 };
    },
  });
}
