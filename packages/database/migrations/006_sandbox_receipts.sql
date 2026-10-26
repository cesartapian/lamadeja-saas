-- Signed delivery callbacks only; does not enable sending.
begin;
alter table sandbox_dispatch
  add column delivery_status text check (delivery_status in ('sent','delivered','read','failed')),
  add column delivery_status_at timestamptz,
  add column delivery_error_code integer check (delivery_error_code >= 0),
  add constraint sandbox_delivery_pair check ((delivery_status is null) = (delivery_status_at is null)),
  add constraint sandbox_delivery_accepted check (delivery_status is null or state='accepted'),
  add constraint sandbox_delivery_error check (delivery_error_code is null or delivery_status='failed');
create table sandbox_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  channel_id uuid not null,
  event_key text not null check (event_key ~ '^[a-f0-9]{64}$'),
  provider_message_id text not null check (provider_message_id ~ '^wamid\.[A-Za-z0-9_+=/-]+$' and length(provider_message_id) between 7 and 506),
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null check (status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  error_code integer check (error_code >= 0),
  received_at timestamptz not null default now(),
  unique(organization_id,store_id,channel_id,event_key),
  foreign key (organization_id,store_id,channel_id) references channel_connections(organization_id,store_id,id),
  check (error_code is null or status='failed')
);
create index sandbox_receipt_lookup on sandbox_receipts(organization_id,store_id,channel_id,provider_message_id,recipient,occurred_at desc,id);
alter table sandbox_receipts enable row level security;
-- No browser policies. Unmatched receipts are retained for later reconciliation.
commit;
