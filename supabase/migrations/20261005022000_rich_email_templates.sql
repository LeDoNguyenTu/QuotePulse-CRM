alter table public.email_sends
  add column if not exists body_html_rendered text;

create or replace function private.snapshot_email_template_html()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.body_html_rendered is null and new.template_id is not null then
    select template.body_html
    into new.body_html_rendered
    from public.email_templates template
    where template.id = new.template_id
      and template.owner_id = new.created_by
      and template.body_format = 'html';
  end if;
  return new;
end;
$$;

revoke all on function private.snapshot_email_template_html() from public, anon, authenticated;
drop trigger if exists email_sends_snapshot_template_html on public.email_sends;
create trigger email_sends_snapshot_template_html
before insert on public.email_sends
for each row execute function private.snapshot_email_template_html();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'email-assets',
  'email-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/gif', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists email_assets_owner_insert on storage.objects;
create policy email_assets_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'email-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists email_assets_owner_update on storage.objects;
create policy email_assets_owner_update on storage.objects
for update to authenticated
using (bucket_id = 'email-assets' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'email-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists email_assets_owner_delete on storage.objects;
create policy email_assets_owner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'email-assets' and (storage.foldername(name))[1] = auth.uid()::text);
