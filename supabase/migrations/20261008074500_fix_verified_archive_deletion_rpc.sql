do $migration$
declare
  v_signature regprocedure := 'public.delete_legacy_workspace_archive_batch(uuid,uuid,integer)'::regprocedure;
  v_definition text;
  v_ambiguous text := 'where archive_id = p_archive_id and table_name = v_table';
  v_qualified text := 'where workspace_archive_tables.archive_id = p_archive_id and workspace_archive_tables.table_name = v_table';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if v_definition is null or position(v_ambiguous in v_definition) = 0 then
    raise exception 'refusing archive deletion RPC patch: expected ambiguous progress predicate was not found';
  end if;

  execute replace(v_definition, v_ambiguous, v_qualified);
end;
$migration$;

revoke all on function public.delete_legacy_workspace_archive_batch(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.delete_legacy_workspace_archive_batch(uuid, uuid, integer)
  to service_role;

comment on function public.delete_legacy_workspace_archive_batch(uuid, uuid, integer) is
  'Deletes one bounded, reverse-dependency batch after archive verification while retaining referenced records; progress predicates are explicitly qualified.';
