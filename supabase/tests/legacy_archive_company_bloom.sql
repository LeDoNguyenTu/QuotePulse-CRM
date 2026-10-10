begin;

do $test$
declare
  target_id uuid;
  valid_bloom text := 'v1:' || repeat('A', 1366) || '==.' || repeat('B', 43);
begin
  select id
    into target_id
    from public.workspace_archive_objects
   where table_name in ('contacts', 'deals')
     and status = 'verified'
   order by id
   limit 1;

  if target_id is null then
    raise exception 'A verified relationship archive object is required for the Bloom constraint test';
  end if;

  update public.workspace_archive_objects
     set company_bloom = valid_bloom
   where id = target_id;

  if not found then
    raise exception 'The structurally valid company Bloom value was not accepted';
  end if;

  begin
    update public.workspace_archive_objects
       set company_bloom = 'v1:' || repeat('A', 1365) || '!' || '==.' || repeat('B', 43)
     where id = target_id;
    raise exception 'A Bloom value with an invalid base64 character was accepted';
  exception
    when check_violation then null;
  end;

  begin
    update public.workspace_archive_objects
       set company_bloom = left(valid_bloom, 1414)
     where id = target_id;
    raise exception 'A truncated Bloom value was accepted';
  exception
    when check_violation then null;
  end;
end
$test$;

rollback;
