import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Industry } from '../lib/types';

export function useIndustries() {
  return useQuery<Industry[]>({
    queryKey: ['industries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('industries')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Industry[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
