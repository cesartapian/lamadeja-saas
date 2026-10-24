-- Apply only to the dedicated SaaS development database, after migrations 001–003.
begin;
alter table conversations add constraint conversations_store_scope_unique unique (organization_id,store_id,id);
create table message_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  requested_by uuid not null,
  idempotency_key uuid not null,
  body text not null check (length(btrim(body)) between 1 and 4096),
  provider text not null default 'simulated' check (provider = 'simulated'),
  status text not null default 'pending' check (status in ('pending','processing','retrying','failed','simulated')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 100),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error in ('simulation_failed')),
  simulation_receipt text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,store_id,idempotency_key),
  foreign key (organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id),
  check (attempt_count <= max_attempts),
  check ((status = 'simulated') = (completed_at is not null and simulation_receipt is not null))
);
create index outbox_due on message_outbox(next_attempt_at,created_at,id) where status in ('pending','retrying');
create index outbox_conversation on message_outbox(organization_id,store_id,conversation_id,created_at desc,id desc);
alter table message_outbox enable row level security;
-- No browser policies: use the authenticated API and dedicated trusted backend role.
commit;
