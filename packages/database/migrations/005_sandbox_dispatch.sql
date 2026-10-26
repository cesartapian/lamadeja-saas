-- Preparatory storage only. No API/worker/Meta transport is enabled by this migration.
begin;
alter table conversations add constraint conversations_dispatch_scope_unique unique (organization_id,store_id,id,channel_connection_id);
create table sandbox_dispatch (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  channel_id uuid not null,
  requested_by uuid not null,
  idempotency_key uuid not null,
  recipient text not null check (recipient ~ '^\+[1-9][0-9]{7,14}$'),
  body text not null check (length(btrim(body)) between 1 and 4096),
  state text not null default 'queued' check (state in ('queued','claimed','dispatching','retry_wait','accepted','unknown','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 100),
  version integer not null default 0 check (version >= 0),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  provider_message_id text check (provider_message_id ~ '^wamid\.[A-Za-z0-9_+=/-]+$' and length(provider_message_id) between 7 and 506),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,store_id,idempotency_key),
  foreign key (organization_id,store_id,conversation_id,channel_id) references conversations(organization_id,store_id,id,channel_connection_id),
  check (attempts <= max_attempts),
  check ((state in ('claimed','dispatching') and claim_token is not null and lease_until is not null)
    or (state not in ('claimed','dispatching') and claim_token is null and lease_until is null)),
  check ((state = 'accepted') = (provider_message_id is not null)),
  check (state not in ('dispatching','accepted','unknown','failed') or attempts > 0)
);
create unique index sandbox_provider_message_unique on sandbox_dispatch(organization_id,store_id,channel_id,provider_message_id) where provider_message_id is not null;
create index sandbox_dispatch_due on sandbox_dispatch(organization_id,store_id,channel_id,next_attempt_at,created_at,id) where state in ('queued','retry_wait');
create index sandbox_dispatch_expired on sandbox_dispatch(organization_id,store_id,channel_id,lease_until,id) where state in ('claimed','dispatching');
alter table sandbox_dispatch enable row level security;
-- No browser policies. Trusted repository calls still require explicit tenant/channel scope.
commit;
