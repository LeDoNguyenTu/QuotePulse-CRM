-- Local Supabase bootstrap fixture.
--
-- Production already had this Vault-backed job when the guarded-admission
-- migration was applied. A fresh local stack intentionally has no Vault
-- secrets, so the earlier migration skips the job while the next historical
-- migration expects to upgrade it. CI copies this fixture into migration order
-- only for the disposable local database.
create extension if not exists pg_cron;

select cron.schedule(
  'storage-pressure-r2-archive',
  '* * * * *',
  'select private.reconcile_storage_compaction();'
);
