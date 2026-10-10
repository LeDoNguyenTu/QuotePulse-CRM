import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CrmEmailSendHistory } from '../../lib/crm/types';

export function useCrmEmailHistory(workspaceId: string, contactId: string | null) {
  return useQuery({
    queryKey: ['crm', workspaceId, 'contact-email-history', contactId],
    enabled: Boolean(contactId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('crm_contact_email_history').select('*').eq('workspace_id', workspaceId).eq('contact_id', contactId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmEmailSendHistory[];
    },
  });
}
