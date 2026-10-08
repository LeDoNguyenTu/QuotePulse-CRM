alter table public.crm_email_campaigns
  add column if not exists body_html text,
  add column if not exists body_text text;

update public.crm_email_campaigns
set body_text = body
where body_text is null;

alter table public.crm_email_campaigns
  alter column body_text set default '',
  alter column body_text set not null;

create or replace function public.crm_queue_email_campaign(
  p_workspace_id uuid, p_name text, p_subject text,
  p_body_html text, p_body_text text,
  p_provider text, p_cooldown_seconds integer, p_contact_ids uuid[],
  p_industries text[], p_search text, p_template_id uuid,
  p_consent_confirmed boolean, p_unsubscribe_base_url text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_campaign uuid; v_position integer := 0;
  v_row record; v_send uuid; v_token text; v_scheduled timestamptz;
  v_queued integer := 0; v_blocked integer := 0;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = auth.uid()) then raise exception 'workspace membership required' using errcode = '42501'; end if;
  if p_consent_confirmed is distinct from true then raise exception 'recipient consent confirmation is required' using errcode = '22023'; end if;
  if coalesce(p_unsubscribe_base_url, '') !~ '^https?://' then raise exception 'valid unsubscribe URL required' using errcode = '22023'; end if;
  if p_provider not in ('microsoft_graph', 'brevo') then raise exception 'unsupported email provider' using errcode = '22023'; end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_subject), '') is null or nullif(btrim(p_body_text), '') is null then raise exception 'campaign name, subject, and plain-text fallback are required' using errcode = '22023'; end if;
  if coalesce(cardinality(p_contact_ids), 0) = 0 then raise exception 'select at least one campaign recipient' using errcode = '22023'; end if;
  if cardinality(p_contact_ids) > 5000 then raise exception 'campaign audience exceeds the 5,000 recipient safety limit' using errcode = '54000'; end if;
  if p_template_id is not null and not exists (select 1 from public.email_templates t where t.id = p_template_id and t.owner_id = v_user) then raise exception 'template not found' using errcode = '22023'; end if;

  insert into public.crm_email_campaigns(workspace_id,name,template_id,subject,body,body_html,body_text,provider,cooldown_seconds,audience_filter,consent_confirmed_at,consent_confirmed_by,status,created_by,updated_by)
  values (p_workspace_id,btrim(p_name),p_template_id,btrim(p_subject),p_body_text,p_body_html,p_body_text,p_provider,greatest(30,p_cooldown_seconds),jsonb_build_object('contact_ids',to_jsonb(p_contact_ids)),now(),v_user,'queued',v_user,v_user)
  returning id into v_campaign;

  for v_row in
    select distinct on (lower(btrim(ct.email))) ct.id contact_id, ct.company_id, lower(btrim(ct.email)) email,
      coalesce(nullif(btrim(ct.full_name),''), nullif(btrim(concat_ws(' ',ct.first_name,ct.last_name)),'')) contact_name,
      co.name company_name, co.industry
    from public.crm_contacts ct left join public.crm_companies co on co.workspace_id = ct.workspace_id and co.id = ct.company_id
    where ct.workspace_id = p_workspace_id and ct.id = any(p_contact_ids) and nullif(btrim(ct.email),'') is not null
    order by lower(btrim(ct.email)), ct.id
  loop
    if v_position + v_blocked >= 5000 then raise exception 'campaign audience exceeds the 5,000 recipient safety limit' using errcode = '54000'; end if;
    if exists (select 1 from public.email_suppressions s where s.owner_id = v_user and s.email_normalized = v_row.email) then
      insert into public.crm_campaign_recipients(workspace_id,campaign_id,contact_id,company_id,email_normalized,contact_name,company_name,industry,status,blocked_reason,created_by)
      values(p_workspace_id,v_campaign,v_row.contact_id,v_row.company_id,v_row.email,v_row.contact_name,v_row.company_name,v_row.industry,'blocked','Recipient is suppressed.',v_user);
      v_blocked := v_blocked + 1; continue;
    end if;
    v_scheduled := now() + make_interval(secs => v_position * greatest(30,p_cooldown_seconds)); v_position := v_position + 1;
    v_token := encode(extensions.gen_random_bytes(32),'hex');
    insert into public.email_sends(workspace_id,campaign_id,crm_contact_id,crm_company_id,to_email,template_id,subject,body_rendered,body_html_rendered,status,provider,cooldown_seconds,scheduled_at,next_attempt_at,created_by,recipient_snapshot)
    values(p_workspace_id,v_campaign,v_row.contact_id,v_row.company_id,v_row.email,p_template_id,p_subject,
      concat(p_body_text,E'\n\nTo stop receiving these messages, unsubscribe: ',p_unsubscribe_base_url,'?token=',v_token),p_body_html,
      case when v_scheduled > now() then 'scheduled' else 'queued' end,p_provider,greatest(30,p_cooldown_seconds),v_scheduled,v_scheduled,v_user,
      jsonb_build_object('company_name',v_row.company_name,'contact_name',v_row.contact_name,'industry',v_row.industry)) returning id into v_send;
    insert into public.email_unsubscribe_tokens(email_send_id,owner_id,email_normalized,token_hash,expires_at)
    values(v_send,v_user,v_row.email,encode(extensions.digest(v_token,'sha256'),'hex'),now()+interval '365 days');
    insert into public.crm_campaign_recipients(workspace_id,campaign_id,contact_id,company_id,email_normalized,contact_name,company_name,industry,status,email_send_id,created_by)
    values(p_workspace_id,v_campaign,v_row.contact_id,v_row.company_id,v_row.email,v_row.contact_name,v_row.company_name,v_row.industry,case when v_scheduled > now() then 'scheduled' else 'queued' end,v_send,v_user);
    v_queued := v_queued + 1;
  end loop;
  if v_queued = 0 and v_blocked = 0 then raise exception 'campaign audience is empty' using errcode = '22023'; end if;
  if v_queued = 0 then update public.crm_email_campaigns set status = 'completed', updated_by = v_user where id = v_campaign and workspace_id = p_workspace_id; end if;
  return jsonb_build_object('campaign_id',v_campaign,'queued',v_queued,'blocked',v_blocked);
end $$;

revoke all on function public.crm_queue_email_campaign(uuid,text,text,text,text,text,integer,uuid[],text[],text,uuid,boolean,text) from public, anon;
grant execute on function public.crm_queue_email_campaign(uuid,text,text,text,text,text,integer,uuid[],text[],text,uuid,boolean,text) to authenticated;
