import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { CompanyDashboardRow, EmailProvider, EmailSend } from '../lib/types';
import { DEFAULT_COOLDOWN_SECONDS, MIN_COOLDOWN_SECONDS } from '../lib/emailQueue';

export interface QueueEmailInput {
  companies: CompanyDashboardRow[];
  templateId: string;
  subject: string;
  body: string;
  cooldownSeconds: number;
  provider: EmailProvider;
  recipientConsentConfirmed: boolean;
}

export function useEmailQueue() {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const enqueue = useCallback(async (input: QueueEmailInput) => {
    setRunning(true); setError(null);
    try {
      if (!input.recipientConsentConfirmed) throw new Error('Confirm that recipients are customers, opted in, or otherwise expect this message.');
      const messages = input.companies.filter((company) => company.primary_contact_email).map((company) => ({
        company_id: company.id, template_id: input.templateId, to_email: company.primary_contact_email,
        subject: input.subject, body: input.body,
        cooldown_seconds: Math.max(MIN_COOLDOWN_SECONDS, Math.floor(input.cooldownSeconds || DEFAULT_COOLDOWN_SECONDS)), provider: input.provider,
      }));
      if (!messages.length) throw new Error('None of the selected companies have a primary contact email.');
      const unsubscribeBaseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe`;
      const { data, error: rpcError } = await (supabase as any).rpc('queue_bulk_email', {
        messages, consent_confirmed: true, unsubscribe_base_url: unsubscribeBaseUrl,
      });
      if (rpcError) throw rpcError;
      return (data ?? []) as Array<{ email_send_id: string; status: string; scheduled_at: string }>;
    } catch (cause) { setError(cause); throw cause; } finally { setRunning(false); }
  }, []);
  return { enqueue, running, error, MIN_COOLDOWN: MIN_COOLDOWN_SECONDS };
}

export async function countSentLast24h(): Promise<number> {
  const { count, error } = await supabase.from('email_sends').select('id', { count: 'exact', head: true })
    .eq('status', 'sent').gte('sent_at', new Date(Date.now() - 86_400_000).toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function recentQueueStatus(): Promise<EmailSend[]> {
  const { data, error } = await supabase.from('email_sends').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data ?? []) as EmailSend[];
}
