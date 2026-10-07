grant insert on table public.crm_source_revision_artifacts to authenticated;

create policy crm_source_revision_artifacts_insert_member
on public.crm_source_revision_artifacts for insert to authenticated
with check (
  created_by = (select auth.uid())
  and finalization_status = 'pending'
  and row_index_r2_key is null
  and row_index_r2_sha256 is null
  and finalized_at is null
  and exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = crm_source_revision_artifacts.workspace_id
      and member.user_id = (select auth.uid())
  )
);
