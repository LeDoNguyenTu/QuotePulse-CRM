import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EmailTemplate } from '../lib/types';
import { accountQueryKey } from '../lib/accountQueryScope';
import { useAuth } from './useAuth';

export function useTemplates() {
  const { user } = useAuth();
  return useQuery<EmailTemplate[]>({
    queryKey: accountQueryKey(user?.id, ['templates']),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []) as EmailTemplate[];
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (t: Partial<EmailTemplate>) => {
      if (t.id) {
        const { data, error } = await supabase
          .from('email_templates')
          .update(t)
          .eq('id', t.id)
          .select()
          .single();
        if (error) throw error;
        return data as EmailTemplate;
      }
      const { data, error } = await supabase
        .from('email_templates')
        .insert(t)
        .select()
        .single();
      if (error) throw error;
      return data as EmailTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountQueryKey(user?.id, ['templates']) }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('email_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: accountQueryKey(user?.id, ['templates']) }),
  });
}
