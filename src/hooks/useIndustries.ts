import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Industry } from '../lib/types';
import { accountQueryKey } from '../lib/accountQueryScope';
import { useAuth } from './useAuth';

/**
 * The full lookup list. Use it where the user PICKS an industry to assign
 * (the company edit form, template targeting) — every option must be offerable
 * even if no company carries it yet.
 */
export function useIndustries() {
  const { user } = useAuth();
  return useQuery<Industry[]>({
    queryKey: accountQueryKey(user?.id, ['industries']),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('industries').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Industry[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface IndustryFacet {
  industry: string;
  company_count: number;
}

/**
 * The industries actually PRESENT in the user's companies, with counts.
 *
 * The filter dropdown used to be built from the lookup table, so it offered ten
 * industries while not a single company had one set — every choice filtered the
 * list down to nothing. A filter should only ever offer values that can match.
 */
export function useIndustryFacets() {
  const { user } = useAuth();
  return useQuery<IndustryFacet[]>({
    queryKey: accountQueryKey(user?.id, ['industry-facets']),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_industries')
        .select('industry, company_count')
        .order('industry');
      if (error) throw error;
      return (data ?? []) as IndustryFacet[];
    },
    staleTime: 60 * 1000,
  });
}
