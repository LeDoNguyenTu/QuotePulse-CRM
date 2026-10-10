import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { CrmCampaignRecipientReport, CrmEmailCampaign } from '../../lib/crm/types';
import type { CrmCampaignInput } from '../../lib/crm/campaignInput';
import { collectRecipientPages, type CampaignRecipient } from '../../lib/crm/campaignRecipients';

export interface CrmCampaignAudienceRow { contact_id: string; company_id: string | null; contact_name: string | null; email_normalized: string; company_name: string | null; industry: string | null }

function escapeLike(value: string) { return value.replace(/[\\%_]/g, '\\$&'); }

function audienceQuery(workspaceId: string, filters: { search: string; industry: string }) {
  let query = (supabase as any).from('crm_campaign_audience').select('*', { count: 'exact' }).eq('workspace_id', workspaceId);
  if (filters.industry) query = query.eq('industry', filters.industry);
  if (filters.search.trim()) { const value = `*${escapeLike(filters.search.trim())}*`; query = query.or(`contact_name.ilike.${value},email_normalized.ilike.${value},company_name.ilike.${value}`); }
  return query.order('email_normalized').order('contact_id');
}

export function useCrmCampaigns(workspaceId: string, filters: { search: string; industry: string }) {
  const queryClient = useQueryClient();
  const campaigns = useQuery({
    queryKey: ['crm', workspaceId, 'campaigns'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('crm_email_campaign_reporting')
        .select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CrmEmailCampaign[];
    },
  });
  const contacts = useQuery({
    queryKey: ['crm', workspaceId, 'campaign-audience', filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, count, error } = await audienceQuery(workspaceId, filters).limit(250);
      if (error) throw error;
      return { rows: (data ?? []) as CrmCampaignAudienceRow[], count: count ?? 0 };
    },
  });
  const resolveMatchingRecipientIds = useMutation({
    mutationFn: () => collectRecipientPages(async (from, to) => {
      const { data, error } = await audienceQuery(workspaceId, filters).range(from, to);
      if (error) throw error;
      return (data ?? []) as CampaignRecipient[];
    }),
  });
  const queue = useMutation({
    mutationFn: async (input: CrmCampaignInput) => {
      const { data, error } = await (supabase as any).rpc('crm_queue_email_campaign', {
        p_workspace_id: workspaceId, p_name: input.name.trim(), p_subject: input.subject.trim(),
        p_body_html: input.bodyHtml, p_body_text: input.bodyText,
        p_provider: input.provider, p_cooldown_seconds: input.cooldownSeconds,
        p_contact_ids: input.sendAllMatching ? null : input.contactIds,
        p_industries: input.industries.length ? input.industries : null, p_search: input.search.trim() || null,
        p_template_id: input.templateId ?? null, p_consent_confirmed: input.consentConfirmed,
        p_unsubscribe_base_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/unsubscribe`,
      });
      if (error) throw error;
      return data as { campaign_id: string; queued: number; blocked: number };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'campaigns'] }),
  });
  return { campaigns, contacts, resolveMatchingRecipientIds, queue };
}

export function useCampaignRecipients(workspaceId: string, campaignId: string | null) {
  return useQuery({
    queryKey: ['crm', workspaceId, 'campaign-recipients', campaignId],
    enabled: Boolean(campaignId),
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('crm_campaign_recipient_reporting').select('*')
        .eq('workspace_id', workspaceId).eq('campaign_id', campaignId)
        .order('email_normalized').order('send_created_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as CrmCampaignRecipientReport[];
    },
  });
}

export function useRetryFailedEmail(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (emailSendId: string) => {
      const { data, error } = await (supabase as any).rpc('crm_retry_failed_email_send', { p_workspace_id: workspaceId, p_email_send_id: emailSendId });
      if (error) throw error;
      return data as { email_send_id: string; status: 'queued' };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'campaigns'] });
      void queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'campaign-recipients'] });
      void queryClient.invalidateQueries({ queryKey: ['crm', workspaceId, 'contact-email-history'] });
    },
  });
}
