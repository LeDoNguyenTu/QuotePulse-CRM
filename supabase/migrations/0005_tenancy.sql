-- =====================================================================
-- 0005_tenancy.sql — Per-user data isolation
--
-- BEFORE: 0002_rls.sql gave every table `for all to authenticated
--   using (true) with check (true)` — a shared team workspace. Any signed-up
--   account could read AND overwrite every other account's CRM data.
--
-- AFTER: every row is owned by exactly one auth user.
--   * companies/deals/contacts/attachments/kyc_profiles/email_templates -> owner_id
--   * email_sends -> created_by (the column already existed but RLS ignored it)
--   * industries -> shared read-only lookup
--   * user_settings -> already private (unchanged)
--
-- owner_id defaults to auth.uid() so browser inserts need no code change.
-- Edge Functions run as SERVICE ROLE, where auth.uid() is NULL and RLS is
-- bypassed entirely, so they must set owner_id explicitly on every write and
-- filter .eq('owner_id', userId) on every read.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add owner_id (nullable for now so the backfill can run).
-- ---------------------------------------------------------------------
alter table companies       add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table deals           add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table contacts        add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table attachments     add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table kyc_profiles    add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table email_templates add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- ---------------------------------------------------------------------
-- 2. Backfill. All pre-existing rows predate tenancy and belong to the
--    single account that created them (the oldest auth user). If there are
--    no users yet (fresh local `db reset`) every table is empty and this is
--    a no-op.
-- ---------------------------------------------------------------------
do $$
declare seed_owner uuid;
begin
  select id into seed_owner from auth.users order by created_at asc limit 1;
  if seed_owner is null then
    raise notice '0005: no auth users — skipping backfill (tables are expected to be empty).';
    return;
  end if;

  update companies       set owner_id   = seed_owner where owner_id   is null;
  update deals           set owner_id   = seed_owner where owner_id   is null;
  update contacts        set owner_id   = seed_owner where owner_id   is null;
  update attachments     set owner_id   = seed_owner where owner_id   is null;
  update kyc_profiles    set owner_id   = seed_owner where owner_id   is null;
  update email_templates set owner_id   = seed_owner where owner_id   is null;
  -- email_sends.created_by was only stamped at SEND time, so queued rows are NULL.
  update email_sends     set created_by = seed_owner where created_by is null;
end $$;

-- ---------------------------------------------------------------------
-- 3. Enforce. `default auth.uid()` keeps browser inserts working unchanged;
--    the service role must set owner_id explicitly (auth.uid() is NULL there).
-- ---------------------------------------------------------------------
alter table companies       alter column owner_id set not null;
alter table deals           alter column owner_id set not null;
alter table contacts        alter column owner_id set not null;
alter table attachments     alter column owner_id set not null;
alter table kyc_profiles    alter column owner_id set not null;
alter table email_templates alter column owner_id set not null;

alter table companies       alter column owner_id   set default auth.uid();
alter table deals           alter column owner_id   set default auth.uid();
alter table contacts        alter column owner_id   set default auth.uid();
alter table attachments     alter column owner_id   set default auth.uid();
alter table kyc_profiles    alter column owner_id   set default auth.uid();
alter table email_templates alter column owner_id   set default auth.uid();
alter table email_sends     alter column created_by set default auth.uid();

create index if not exists companies_owner_id_idx       on companies (owner_id);
create index if not exists deals_owner_id_idx           on deals (owner_id);
create index if not exists contacts_owner_id_idx        on contacts (owner_id);
create index if not exists attachments_owner_id_idx     on attachments (owner_id);
create index if not exists kyc_profiles_owner_id_idx    on kyc_profiles (owner_id);
create index if not exists email_templates_owner_id_idx on email_templates (owner_id);

-- ---------------------------------------------------------------------
-- 4. Uniqueness must become per-owner. These constraints were GLOBAL, so
--    two accounts importing the same HubSpot portal would collide and
--    silently overwrite each other.
-- ---------------------------------------------------------------------

-- companies: one canonical company per cleaned name PER OWNER.
drop index if exists companies_name_clean_key;
create unique index if not exists companies_owner_name_clean_key
  on companies (owner_id, lower(name_clean));

-- deals.hubspot_deal_id was declared `text unique` in 0001 -> a table constraint.
--
-- Deliberately NOT a partial index. hubspot-ingest upserts deals with
-- onConflict:'owner_id,hubspot_deal_id', and ON CONFLICT cannot infer a PARTIAL
-- index (Postgres 42P10) — the same trap that silently dropped every contact.
-- A plain unique index is correct anyway: Postgres treats NULLs as distinct, so
-- manually created deals (hubspot_deal_id is null) still don't collide.
alter table deals drop constraint if exists deals_hubspot_deal_id_key;
drop index if exists deals_hubspot_deal_id_key;
create unique index if not exists deals_owner_hubspot_deal_key
  on deals (owner_id, hubspot_deal_id);

-- attachments stays PARTIAL: hubspot-ingest dedupes it with select-then-insert
-- rather than onConflict, so a partial index is safe here.
drop index if exists attachments_hubspot_id_key;
create unique index if not exists attachments_owner_hubspot_key
  on attachments (owner_id, hubspot_attachment_id) where hubspot_attachment_id is not null;

-- contacts (company_id, lower(email)) and kyc_profiles.company_id stay as-is:
-- the parent company is already owned, so they are transitively per-owner.
-- NOTE: both remain FUNCTIONAL/PARTIAL indexes -> `onConflict` cannot target
-- them (Postgres 42P10). Use dedupe-then-insert. See CLAUDE.md "Gotchas".

-- ---------------------------------------------------------------------
-- 5. RLS: replace the wide-open shared-workspace policies.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','deals','contacts','attachments','kyc_profiles','email_templates'
  ]
  loop
    execute format('drop policy if exists "%s_auth_all" on %I;', t, t);
    execute format('drop policy if exists "%s_owner_all" on %I;', t, t);
    execute format($f$
      create policy "%1$s_owner_all" on %1$I
        for all
        to authenticated
        using (owner_id = auth.uid())
        with check (owner_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- email_sends is owned via created_by.
drop policy if exists "email_sends_auth_all" on email_sends;
drop policy if exists "email_sends_owner_all" on email_sends;
create policy "email_sends_owner_all" on email_sends
  for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- industries is a shared, read-only lookup list. No owner; nobody may write it.
drop policy if exists "industries_auth_all" on industries;
drop policy if exists "industries_read" on industries;
create policy "industries_read" on industries
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- 6. HubSpot sync state, per owner per stream.
--
--    hubspot-ingest used to read `GET /crm/v3/objects/deals` (which is ordered
--    by hs_object_id ASCENDING, i.e. oldest first) and stop after 200 deals. So
--    once a portal held more than 200 deals it re-imported the SAME oldest 200
--    forever and could never reach a newly created deal. That is exactly the
--    reported "cannot feed new CRM data".
--
--    Fix: a resumable sweep.
--      phase='backfill'    -> page through everything, persisting `cursor` after
--                             each page so the next invocation resumes rather
--                             than restarting. Runs are bounded by wall-time.
--      phase='incremental' -> once the backfill completes, use the Search API
--                             filtered on hs_lastmodifieddate > last_synced_at
--                             to pull only what changed.
-- ---------------------------------------------------------------------
create table if not exists sync_state (
  owner_id       uuid not null references auth.users(id) on delete cascade,
  object_type    text not null,               -- 'deals:current' | 'deals:recycled' | 'companies:deleted'
  phase          text not null default 'backfill',  -- 'backfill' | 'incremental'
  page_cursor    text,                        -- HubSpot paging cursor, for resuming a backfill
  last_synced_at timestamptz,                 -- incremental watermark
  updated_at     timestamptz not null default now(),
  primary key (owner_id, object_type)
);

alter table sync_state enable row level security;
drop policy if exists "sync_state_owner_all" on sync_state;
create policy "sync_state_owner_all" on sync_state
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop trigger if exists trg_sync_state_updated_at on sync_state;
create trigger trg_sync_state_updated_at before update on sync_state
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 7. company_dashboard: expose owner_id.
--    The view is security_invoker = true, so the new RLS on `companies`
--    already scopes it for browser reads. export-xlsx, however, reads it
--    with the SERVICE ROLE (which bypasses RLS) and needs the column to
--    filter on explicitly.
-- ---------------------------------------------------------------------
create or replace view company_dashboard as
select
  c.id,
  c.owner_id,
  c.name_clean,
  c.name_raw,
  c.industry,
  c.website,
  c.source_priority,
  c.created_at,
  c.updated_at,
  pc.full_name  as primary_contact_name,
  pc.email      as primary_contact_email,
  pc.phone      as primary_contact_phone,
  exists (
    select 1 from attachments a
    join deals d on d.id = a.deal_id
    where d.company_id = c.id and a.source_type = 'quote'
  ) as has_quote,
  exists (select 1 from kyc_profiles k where k.company_id = c.id) as has_kyc,
  (
    select es.status from email_sends es
    where es.company_id = c.id
    order by es.created_at desc limit 1
  ) as last_email_status,
  (
    select es.sent_at from email_sends es
    where es.company_id = c.id and es.sent_at is not null
    order by es.sent_at desc limit 1
  ) as last_email_sent_at
from companies c
left join lateral (
  select full_name, email, phone
  from contacts
  where company_id = c.id
  order by is_primary_contact desc, (email is not null) desc, created_at asc
  limit 1
) pc on true
where c.deleted_at is null;

alter view company_dashboard set (security_invoker = true);
revoke all on company_dashboard from anon;
grant select on company_dashboard to authenticated;
