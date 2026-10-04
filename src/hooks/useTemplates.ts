import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { EmailTemplate } from '../lib/types';
import { accountQueryKey } from '../lib/accountQueryScope';
import { useAuth } from './useAuth';
import { unzipSync } from 'fflate';
import type { EmailTemplateAsset } from '../lib/types';

const EMAIL_ASSET_BUCKET = 'email-assets';
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

export async function uploadEmailTemplateAssets(userId: string, files: File[]): Promise<EmailTemplateAsset[]> {
  const candidates: Array<{ name: string; bytes: Uint8Array; contentType: string }> = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (/\.zip$/i.test(file.name)) {
      for (const [name, content] of Object.entries(unzipSync(bytes))) {
        const extension = name.split('.').pop()?.toLowerCase() ?? '';
        if (!name.endsWith('/') && IMAGE_TYPES[extension]) candidates.push({ name, bytes: content, contentType: IMAGE_TYPES[extension] });
      }
    } else {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!IMAGE_TYPES[extension]) throw new Error(`${file.name} is not a supported email image.`);
      candidates.push({ name: file.name, bytes, contentType: IMAGE_TYPES[extension] });
    }
  }
  if (candidates.length === 0) throw new Error('No PNG, JPG, GIF, or WebP images were found.');
  if (candidates.some((candidate) => candidate.bytes.byteLength > 5 * 1024 * 1024)) throw new Error('Each email image must be 5 MB or smaller.');
  if (candidates.reduce((sum, candidate) => sum + candidate.bytes.byteLength, 0) > 20 * 1024 * 1024) throw new Error('Email images must be 20 MB or smaller in total.');

  const uploaded: string[] = [];
  try {
    const manifest: EmailTemplateAsset[] = [];
    for (const candidate of candidates) {
      const originalName = candidate.name.replace(/\\/g, '/').split('/').pop() ?? 'image';
      const safeName = originalName.replace(/[^a-z0-9._-]+/gi, '-').slice(-120);
      const path = `${userId}/${crypto.randomUUID()}/${safeName}`;
      const digestBytes = new Uint8Array(candidate.bytes.byteLength);
      digestBytes.set(candidate.bytes);
      const digest = await crypto.subtle.digest('SHA-256', digestBytes.buffer);
      const sha256 = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
      const { error } = await supabase.storage.from(EMAIL_ASSET_BUCKET).upload(path, candidate.bytes, {
        contentType: candidate.contentType, upsert: false, cacheControl: '31536000',
      });
      if (error) throw error;
      uploaded.push(path);
      const { data } = supabase.storage.from(EMAIL_ASSET_BUCKET).getPublicUrl(path);
      manifest.push({
        original_name: originalName, storage_path: path, public_url: data.publicUrl,
        content_type: candidate.contentType, size_bytes: candidate.bytes.byteLength, sha256,
      });
    }
    return manifest;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from(EMAIL_ASSET_BUCKET).remove(uploaded);
    throw error;
  }
}

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
