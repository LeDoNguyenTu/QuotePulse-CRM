import { useQuery } from '@tanstack/react-query';
import { accountQueryKey } from '../lib/accountQueryScope';
import { supabase } from '../lib/supabase';
import type { HubspotPropertyCatalogEntry } from '../lib/types';
import { useAuth } from './useAuth';

export function useHubspotPropertyCatalog(objectType: HubspotPropertyCatalogEntry['object_type']) {
  const { user } = useAuth();
  return useQuery<HubspotPropertyCatalogEntry[]>({
    queryKey: accountQueryKey(user?.id, ['hubspot-property-catalog', objectType]),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('hubspot_property_catalog')
        .select('*').eq('object_type', objectType).order('display_order').order('property_name');
      if (error) throw error;
      return (data ?? []) as HubspotPropertyCatalogEntry[];
    },
  });
}
