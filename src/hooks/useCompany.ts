import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
