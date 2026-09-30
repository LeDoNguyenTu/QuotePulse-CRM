import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import type { PstMessageMetadata, PstWorkerEvent } from '../../lib/pst/types';

export function usePstExtractor(workspaceId: string, search: string) {
  const workerRef = useRef<Worker | null>(null); const messagesRef = useRef<PstMessageMetadata[]>([]); const queryClient = useQueryClient();
  const [state, setState] = useState<{ file: File | null; fingerprint: string; preview: PstMessageMetadata[]; messageCount: number; folders: number; errors: number; status: 'idle'|'parsing'|'complete'|'error'; error?: string }>({ file:null,fingerprint:'',preview:[],messageCount:0,folders:0,errors:0,status:'idle' });
  useEffect(() => () => workerRef.current?.terminate(), []);
  const extract = (file: File) => {
    workerRef.current?.terminate(); const worker = new Worker(new URL('../../workers/pst.worker.ts', import.meta.url), { type: 'module' }); workerRef.current = worker;
    messagesRef.current=[]; setState({ file,fingerprint:'',preview:[],messageCount:0,folders:0,errors:0,status:'parsing' });
    worker.onmessage = (event: MessageEvent<PstWorkerEvent>) => {
      const message=event.data;
      if(message.type==='batch') messagesRef.current.push(...message.messages);
      setState((current) => {
      if(message.type==='started') return {...current,fingerprint:message.fingerprint};
      if(message.type==='batch') return {...current,preview:current.preview.length<50?[...current.preview,...message.messages].slice(0,50):current.preview,messageCount:messagesRef.current.length};
      if(message.type==='progress') return {...current,folders:message.folders,errors:message.errors,messageCount:message.messages};
      if(message.type==='complete') return {...current,fingerprint:message.fingerprint,folders:message.folders,errors:message.errors,status:'complete'};
      if(message.type==='error') return {...current,status:'error',error:message.error};
      return current;
      });
    };
    worker.onerror = (event) => setState((current) => ({...current,status:'error',error:event.message || 'PST worker failed.'})); worker.postMessage({file});
  };
  const save = useMutation({ mutationFn: async () => {
    if(!state.file || state.status!=='complete') throw new Error('Extract a PST before saving metadata.');
    const messages=messagesRef.current; const {data:importId,error:beginError}=await (supabase as any).rpc('crm_begin_mailbox_import',{p_workspace_id:workspaceId,p_file_name:state.file.name,p_file_size_bytes:state.file.size,p_file_fingerprint:state.fingerprint,p_parser_name:'hiraokahypertools-pst-extractor-0.5.0-alpha.2'}); if(beginError) throw beginError;
    try {
      for(let offset=0;offset<messages.length;offset+=500){const {error}=await (supabase as any).rpc('crm_ingest_mailbox_metadata',{p_workspace_id:workspaceId,p_import_id:importId,p_messages:messages.slice(offset,offset+500)});if(error) throw error;}
      const {error:finishError}=await (supabase as any).rpc('crm_finish_mailbox_import',{p_workspace_id:workspaceId,p_import_id:importId,p_message_count:messages.length,p_error_count:state.errors});if(finishError) throw finishError; return importId as string;
    } catch (error) {
      await (supabase as any).rpc('crm_abort_mailbox_import',{p_workspace_id:workspaceId,p_import_id:importId}); throw error;
    }
  },onSuccess:()=>queryClient.invalidateQueries({queryKey:['crm',workspaceId,'mail-metadata']}) });
  const saved = useQuery({queryKey:['crm',workspaceId,'mail-metadata',search],placeholderData:keepPreviousData,queryFn:async()=>{let query=(supabase as any).from('crm_mail_messages').select('id,subject,sender_email,recipient_emails,message_at,folder_path,has_attachments').eq('workspace_id',workspaceId);if(search.trim())query=query.ilike('subject',`%${search.trim().replace(/[\\%_]/g,'\\$&')}%`);const {data,error}=await query.order('message_at',{ascending:false,nullsFirst:false}).limit(100);if(error)throw error;return (data??[]) as Array<PstMessageMetadata & {id:string}>;}});
  return {state,extract,save,saved};
}
