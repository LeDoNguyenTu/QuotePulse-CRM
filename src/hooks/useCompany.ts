import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { accountQueryKey } from '../lib/accountQueryScope';
import { useAuth } from './useAuth';
import { functions } from '../lib/functions';
import type {
  Attachment,
  Company,
  Contact,
  Deal,
  EmailSend,
  JobOpportunity,
  JobSourceConfig,
  JobSourceProvider,
  KycEnrichedData,
  KycProfile,
} from '../lib/types';

export function useCompany(companyId: string | undefined) {
  const { user } = useAuth();
  return useQuery<Company | null>({
    queryKey: accountQueryKey(user?.id, ['company', companyId]),
    enabled: !!companyId && !!user,
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
  const { user } = useAuth();
  return useQuery<Deal[]>({
    queryKey: accountQueryKey(user?.id, ['company-deals', companyId]),
    enabled: !!companyId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('company_id', companyId!)
        // Newest deals first: HubSpot's modified date, falling back to when we
        // imported the row for deals that predate the column.
        .order('hubspot_modified_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Deal[];
    },
  });
}

export function useCompanyContacts(companyId: string | undefined) {
  const { user } = useAuth();
  return useQuery<Contact[]>({
    queryKey: accountQueryKey(user?.id, ['company-contacts', companyId]),
    enabled: !!companyId && !!user,
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
  const { user } = useAuth();
  return useQuery<Attachment[]>({
    queryKey: accountQueryKey(user?.id, ['company-attachments', companyId]),
    enabled: !!companyId && !!user,
    queryFn: () => functions.companyAttachments(companyId!),
  });
}

export function useCompanyKyc(companyId: string | undefined) {
  const { user } = useAuth();
  return useQuery<KycProfile | null>({
    queryKey: accountQueryKey(user?.id, ['company-kyc', companyId]),
    enabled: !!companyId && !!user,
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

export function useCompanyJobSources(companyId: string | undefined) {
  const { user } = useAuth();
  return useQuery<JobSourceConfig[]>({
    queryKey: accountQueryKey(user?.id, ['company-job-sources', companyId]),
    enabled: !!companyId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_source_configs')
        .select('*')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as JobSourceConfig[];
    },
  });
}

export function useCompanyJobOpportunities(companyId: string | undefined) {
  const { user } = useAuth();
  return useQuery<JobOpportunity[]>({
    queryKey: accountQueryKey(user?.id, ['company-job-opportunities', companyId]),
    enabled: !!companyId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_opportunities')
        .select('*')
        .eq('company_id', companyId!)
        .eq('is_open', true)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .order('last_seen_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobOpportunity[];
    },
  });
}

export interface JobSourceInput {
  provider: JobSourceProvider;
  identifier: string;
  label?: string;
  source_url?: string;
  market?: string;
}

export function useCreateJobSource(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: JobSourceInput) => {
      const { error } = await supabase.from('job_source_configs').insert({
        company_id: companyId!,
        provider: input.provider,
        identifier: input.identifier.trim(),
        label: input.label?.trim() || null,
        source_url: input.source_url?.trim() || null,
        market: input.market?.trim() || 'Singapore',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account'] }),
  });
}

export function useDeleteJobSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceId: string) => {
      const { error } = await supabase.from('job_source_configs').delete().eq('id', sourceId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['account'] }),
  });
}

export function useCompanyEmailSends(companyId: string | undefined) {
  const { user } = useAuth();
  return useQuery<EmailSend[]>({
    queryKey: accountQueryKey(user?.id, ['company-emails', companyId]),
    enabled: !!companyId && !!user,
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

// ---------------------------------------------------------------------------
// Mutations — edit customer details (company fields + contacts). RLS grants the
// authenticated workspace full access to companies/contacts, so these run
// directly from the browser (no Edge Function needed).
// ---------------------------------------------------------------------------

export interface CompanyEdit {
  name_clean?: string;
  industry?: string | null;
  website?: string | null;
  source_priority?: Company['source_priority'];
}

export function useUpdateCompany(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CompanyEdit) => {
      const { data, error } = await supabase
        .from('companies')
        .update(input)
        .eq('id', companyId!)
        .select()
        .single();
      if (error) throw error;
      return data as Company;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company', companyId] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export interface ContactInput {
  id?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role_title?: string | null;
  is_primary_contact?: boolean;
}

export function useSaveContact(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      // Marking a contact primary must be exclusive per company — clear the flag
      // on the others first so the dashboard resolves this one as the primary.
      if (input.is_primary_contact) {
        const { error: clearErr } = await supabase
          .from('contacts')
          .update({ is_primary_contact: false })
          .eq('company_id', companyId!);
        if (clearErr) throw clearErr;
      }
      const row = {
        company_id: companyId!,
        full_name: input.full_name?.trim() || null,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        role_title: input.role_title?.trim() || null,
        is_primary_contact: input.is_primary_contact ?? false,
      };
      if (input.id) {
        const { error } = await supabase.from('contacts').update(row).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('contacts')
          .insert({ ...row, source: 'manual' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useDeleteContact(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', contactId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-contacts', companyId] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

// Manual corrections to an enriched KYC profile (website, LinkedIn, address,
// about, links, discovered contacts). RLS lets the workspace update kyc_profiles.
export interface KycEdit {
  primary_website?: string | null;
  linkedin_company_url?: string | null;
  other_links?: string[];
  enriched_data?: KycEnrichedData;
}

export function useUpdateKyc(companyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: KycEdit) => {
      const { error } = await supabase
        .from('kyc_profiles')
        .update(input)
        .eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-kyc', companyId] });
      qc.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
