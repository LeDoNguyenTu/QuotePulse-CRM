import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserSettings } from '../lib/types';
import { useAuth } from './useAuth';

export function useSettings() {
  const { user } = useAuth();
  return useQuery<UserSettings | null>({
    queryKey: ['user-settings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as UserSettings | null;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data as UserSettings;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings'] }),
  });
}

/**
 * Clears the stored Microsoft mailbox link. user_settings RLS already allows a
 * user to update their own row, so no Edge Function is needed.
 *
 * This only forgets OUR copy of the refresh token — it does not revoke the app's
 * access on Microsoft's side (that needs the confidential client secret, which
 * lives server-side). Tell the user they can also revoke at
 * https://myapps.microsoft.com.
 */
export function useDisconnectMicrosoft() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_settings')
        .update({ ms_refresh_token: null, ms_account_email: null })
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings'] }),
  });
}

export type HubspotTokenKind = 'private_app' | 'personal_access_key' | 'unknown' | 'empty';

/**
 * HubSpot ships two credentials and only one of them is a bearer token.
 *   * `pat-…`  Private App access token — used directly. Needs admin rights to create.
 *   * `CiR…`   Personal access key — base64 protobuf, the HubSpot CLI credential.
 *              It is a REFRESH credential; hubspot-ingest exchanges it for an
 *              access token before calling the CRM API.
 * Anything else will fail, so flag it at save time instead of after a silent import.
 */
export function classifyHubspotToken(token: string): HubspotTokenKind {
  const t = token.trim();
  if (!t) return 'empty';
  if (t.startsWith('pat-')) return 'private_app';
  // Personal access keys are base64 and, in practice, always start with "Ci".
  if (/^Ci[A-Za-z0-9+/=_-]{20,}$/.test(t)) return 'personal_access_key';
  return 'unknown';
}
