-- READ ONLY. Run in the Supabase SQL Editor of lamadeja-saas-dev only.
-- Confirm project ref ropciikoozdbvsmiulhh in the dashboard URL before running.
-- This reports schema metadata only: no customer data, emails or credentials.
begin read only;
set local statement_timeout = '10s';
set local lock_timeout = '3s';

select expected.table_name,
       to_regclass('public.' || expected.table_name) is not null as table_exists,
       coalesce(c.relrowsecurity, false) as rls_enabled
from (values ('organizations'), ('stores'), ('organization_members'),
             ('channel_connections'), ('contacts'), ('conversations'),
             ('messages'), ('webhook_inbox'), ('message_outbox'), ('sandbox_dispatch'), ('sandbox_receipts')) as expected(table_name)
left join pg_catalog.pg_class c on c.oid = to_regclass('public.' || expected.table_name)
order by expected.table_name;

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='sent_at') as message_processing_columns_present,
  to_regclass('public.conversations_inbox_order') is not null as inbox_index_003_present,
  to_regclass('public.message_outbox') is not null as outbox_table_004_present,
  to_regclass('public.outbox_due') is not null as outbox_due_index_present,
  to_regclass('public.outbox_conversation') is not null as outbox_conversation_index_present,
  to_regclass('public.sandbox_dispatch') is not null as sandbox_table_005_present,
  to_regclass('public.sandbox_dispatch_due') is not null as sandbox_due_index_present,
  to_regclass('public.sandbox_dispatch_expired') is not null as sandbox_expired_index_present,
  to_regclass('public.sandbox_provider_message_unique') is not null as sandbox_provider_index_present,
  to_regclass('public.sandbox_receipts') is not null as receipt_table_006_present,
  to_regclass('public.sandbox_receipt_lookup') is not null as receipt_lookup_index_present;

select conname, pg_get_constraintdef(oid) as definition
from pg_catalog.pg_constraint
where conrelid = to_regclass('public.message_outbox')
   or conrelid = to_regclass('public.sandbox_dispatch')
   or conrelid = to_regclass('public.sandbox_receipts')
   or (conrelid = to_regclass('public.conversations') and conname in ('conversations_store_scope_unique','conversations_dispatch_scope_unique'))
order by conname;
commit;
