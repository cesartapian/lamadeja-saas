-- Nadia is simulation-only. Runtime opt-in and NVIDIA configuration are separate.
begin;
alter table messages add constraint messages_nadia_source_scope unique(organization_id,conversation_id,id);
create table nadia_settings (
  organization_id uuid not null,
  store_id uuid not null,
  last_started_at timestamptz,
  primary key(organization_id,store_id),
  foreign key(organization_id,store_id) references stores(organization_id,id)
);
create table nadia_conversations (
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  enabled boolean not null default true,
  version integer not null default 0 check(version >= 0),
  primary key(organization_id,store_id,conversation_id),
  foreign key(organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id)
);
create table nadia_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  source_message_id uuid not null unique,
  state text not null default 'pending' check(state in ('pending','generating','completed','failed','cancelled')),
  attempt_count integer not null default 0 check(attempt_count between 0 and 2),
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  lease_until timestamptz,
  conversation_version integer,
  response text check(length(response) between 1 and 4096),
  model text check(length(model) between 1 and 200),
  error_category text check(error_category in ('configuration','timeout','rate_limit','provider','invalid_response','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,store_id,conversation_id,id),
  foreign key(organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id),
  foreign key(organization_id,conversation_id,source_message_id) references messages(organization_id,conversation_id,id),
  check((state='generating' and claim_token is not null and lease_until is not null)
     or (state<>'generating' and claim_token is null and lease_until is null)),
  check((state='completed') = (response is not null and model is not null))
);
create unique index nadia_one_inference_per_store on nadia_runs(organization_id,store_id) where state='generating';
create index nadia_due on nadia_runs(organization_id,store_id,next_attempt_at,created_at,id) where state in ('pending','generating');
create index nadia_conversation_history on nadia_runs(organization_id,store_id,conversation_id,created_at,id);
alter table message_outbox
  add column origin text not null default 'manual' check(origin in ('manual','nadia')),
  add column nadia_run_id uuid unique,
  alter column requested_by drop not null,
  drop constraint message_outbox_status_check,
  drop constraint message_outbox_last_error_check,
  add constraint message_outbox_status_check check(status in ('pending','processing','retrying','failed','simulated','cancelled')),
  add constraint message_outbox_last_error_check check(last_error in ('simulation_failed','nadia_paused')),
  add constraint message_outbox_origin_actor check((origin='manual' and requested_by is not null and nadia_run_id is null)
    or (origin='nadia' and requested_by is null and nadia_run_id is not null)),
  add constraint message_outbox_nadia_scope foreign key(organization_id,store_id,conversation_id,nadia_run_id) references nadia_runs(organization_id,store_id,conversation_id,id);
alter table nadia_settings enable row level security;
alter table nadia_conversations enable row level security;
alter table nadia_runs enable row level security;
-- No browser policies. Authentication/role checks stay in the backend.
commit;
