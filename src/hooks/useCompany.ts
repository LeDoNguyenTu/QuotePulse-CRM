import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type {
  Attachment,
  Company,
  Contact,
  Deal,
  EmailSend,
  KycProfile,
} from '../lib/types';

export function useCompany(companyId: string | undefined) {
  return useQuery<Company | null>({
    queryKey: ['company', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as Company | null;
    },
  });
}

export function useCompanyDeals(companyId: string | undefined) {
  return useQuery<Deal[]>({
    queryKey: ['company-deals', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('company_id', companyId!)
        .order('archived_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Deal[];
    },
  });
}

export function useCompanyContacts(companyId: string | undefined) {
  return useQuery<Contact[]>({
    queryKey: ['company-contacts', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('company_id', companyId!)
        .order('is_primary_contact', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contact[];
    },
  });
}

export function useCompanyAttachments(companyId: string | undefined) {
  return useQuery<Attachment[]>({
    queryKey: ['company-attachments', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // attachments -> deals -> company. Two-step to keep it simple/typed.
      const { data: deals, error: dErr } = await supabase
        .from('deals')
        .select('id')
        .eq('company_id', companyId!);
      if (dErr) throw dErr;
      const dealIds = (deals ?? []).map((d) => d.id);
      if (dealIds.length === 0) return [];
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .in('deal_id', dealIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });
}

export function useCompanyKyc(companyId: string | undefined) {
  return useQuery<KycProfile | null>({
    queryKey: ['company-kyc', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kyc_profiles')
        .select('*')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return data as KycProfile | null;
    },
  });
}

export function useCompanyEmailSends(companyId: string | undefined) {
  return useQuery<EmailSend[]>({
    queryKey: ['company-emails', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_sends')
        .select('*')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmailSend[];
    },
  });
}
