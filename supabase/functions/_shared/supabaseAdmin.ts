// Service-role Supabase client (bypasses RLS) + auth helper.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

export function getAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Resolve the calling user from the request's bearer token. Even though the
 * platform verifies the JWT (verify_jwt=true), we still need the user id to read
 * that user's private settings (HubSpot token, MS refresh token).
 */
export async function getUserId(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Missing Authorization bearer token');

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('Invalid or expired session');
  return data.user.id;
}

export interface UserSettingsRow {
  user_id: string;
  hubspot_token: string | null;
  ms_refresh_token: string | null;
  ms_account_email: string | null;
  nvidia_key: string | null;
  daily_send_limit: number;
  email_provider: 'microsoft_graph' | 'brevo';
  brevo_sender_email: string | null;
}

export async function getUserSettings(
  admin: SupabaseClient,
  userId: string
): Promise<UserSettingsRow | null> {
  const { data, error } = await admin
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserSettingsRow | null;
}
