-- E1 storage only. No runner, inference, transport or production activation.
-- Apply once after 001–007; a second application fails atomically (no partial DDL).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create table agent_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  key text not null check(length(btrim(key)) between 1 and 100),
  name text not null check(length(btrim(name)) between 1 and 200),
  objective text not null default '',
  instructions text not null default '',
  stage text not null default 'sin_calificar' check(length(btrim(stage)) between 1 and 100),
  enabled boolean not null default false,
  provider text not null default 'nvidia' check(provider='nvidia'),
  model text check(length(btrim(model)) between 1 and 200),
  transfer_rule jsonb not null default '{}' check(jsonb_typeof(transfer_rule)='object'),
  version integer not null default 0 check(version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id,store_id,id),
  unique(organization_id,store_id,key),
  foreign key(organization_id,store_id) references stores(organization_id,id)
);
alter table conversations
  add column business_stage text not null default 'sin_calificar' check(length(btrim(business_stage)) between 1 and 100),
  add column attention_state text not null default 'sin_asignar' check(attention_state in ('sin_asignar','ia_atendiendo','esperando_cliente','requiere_humano','humano_atendiendo','cerrado')),
  add column conversation_version integer not null default 0 check(conversation_version >= 0);
create table conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  agent_id uuid not null,
  idempotency_key uuid not null,
  conversation_version integer not null default 0 check(conversation_version >= 0),
  assigned_by uuid,
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique(organization_id,store_id,idempotency_key),
  unique(organization_id,store_id,conversation_id,id),
  foreign key(organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id),
  foreign key(organization_id,store_id,agent_id) references agent_definitions(organization_id,store_id,id),
  foreign key(organization_id,assigned_by) references organization_members(organization_id,user_id),
  check(ended_at is null or ended_at >= started_at)
);
create unique index conversation_one_active_agent on conversation_assignments(organization_id,store_id,conversation_id) where ended_at is null;
create index assignments_history on conversation_assignments(organization_id,store_id,conversation_id,started_at,id);
create table qualification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  idempotency_key uuid not null,
  agent_id uuid,
  actor_user_id uuid,
  source_message_id uuid,
  stage text not null check(length(btrim(stage)) between 1 and 100),
  attention_state text not null check(attention_state in ('sin_asignar','ia_atendiendo','esperando_cliente','requiere_humano','humano_atendiendo','cerrado')),
  intent text not null check(length(btrim(intent)) between 1 and 200),
  context jsonb not null default '{}' check(jsonb_typeof(context)='object'),
  confidence numeric not null check(confidence >= 0 and confidence <= 1),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique(organization_id,store_id,idempotency_key),
  foreign key(organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id),
  foreign key(organization_id,store_id,agent_id) references agent_definitions(organization_id,store_id,id),
  foreign key(organization_id,actor_user_id) references organization_members(organization_id,user_id),
  foreign key(organization_id,conversation_id,source_message_id) references messages(organization_id,conversation_id,id),
  check((agent_id is not null) <> (actor_user_id is not null))
);
create index qualification_history on qualification_events(organization_id,store_id,conversation_id,created_at,id);
create table stage_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  conversation_id uuid not null,
  idempotency_key uuid not null,
  agent_id uuid,
  actor_user_id uuid,
  from_stage text not null check(length(btrim(from_stage)) between 1 and 100),
  to_stage text not null check(length(btrim(to_stage)) between 1 and 100),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  conversation_version integer not null check(conversation_version >= 0),
  created_at timestamptz not null default now(),
  unique(organization_id,store_id,idempotency_key),
  foreign key(organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id),
  foreign key(organization_id,store_id,agent_id) references agent_definitions(organization_id,store_id,id),
  foreign key(organization_id,actor_user_id) references organization_members(organization_id,user_id),
  check(from_stage <> to_stage),
  check((agent_id is not null) <> (actor_user_id is not null))
);
create index stage_transition_history on stage_transitions(organization_id,store_id,conversation_id,created_at,id);
alter table messages
  add column store_id uuid,
  add column author_type text,
  add column agent_id uuid,
  add column author_user_id uuid,
  add column author_model text;
update messages m set store_id=c.store_id, author_type=case when m.direction='in' then 'customer' else 'legacy_unknown' end
from conversations c where c.organization_id=m.organization_id and c.id=m.conversation_id;
alter table messages
  alter column store_id set not null,
  alter column author_type set not null,
  add constraint messages_store_conversation foreign key(organization_id,store_id,conversation_id) references conversations(organization_id,store_id,id),
  add constraint messages_author_agent foreign key(organization_id,store_id,agent_id) references agent_definitions(organization_id,store_id,id),
  add constraint messages_author_user foreign key(organization_id,author_user_id) references organization_members(organization_id,user_id),
  add constraint messages_author_identity check(
    (author_type='customer' and direction='in' and agent_id is null and author_user_id is null and author_model is null) or
    (author_type='legacy_unknown' and direction='out' and agent_id is null and author_user_id is null and author_model is null) or
    (author_type='agent_ai' and direction='out' and agent_id is not null and author_user_id is null and length(btrim(author_model)) between 1 and 200 and author_model is not null) or
    (author_type='human' and direction='out' and agent_id is null and author_user_id is not null and author_model is null));
-- Old inbox writers omit store/author. Resolve from the owning conversation, never from caller input.
create function mvp2_message_compatibility() returns trigger language plpgsql as $$
begin
  if new.store_id is null then
    select store_id into new.store_id from conversations where organization_id=new.organization_id and id=new.conversation_id;
  end if;
  if new.author_type is null then
    new.author_type := case when new.direction='in' then 'customer' else 'legacy_unknown' end;
  end if;
  return new;
end $$;
create trigger messages_mvp2_compatibility before insert on messages for each row execute function mvp2_message_compatibility();
-- Audit definition mutations separately from customer-visible messages. No secrets belong here.
create table agent_definition_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  store_id uuid not null,
  agent_id uuid not null,
  operation text not null check(operation in ('INSERT','UPDATE')),
  previous_value jsonb,
  current_value jsonb not null,
  database_actor text not null default current_user,
  created_at timestamptz not null default now(),
  foreign key(organization_id,store_id,agent_id) references agent_definitions(organization_id,store_id,id)
);
create function mvp2_audit_agent() returns trigger language plpgsql as $$
begin
  insert into agent_definition_events(organization_id,store_id,agent_id,operation,previous_value,current_value)
  values(new.organization_id,new.store_id,new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end $$;
create trigger agent_definition_audit after insert or update on agent_definitions for each row execute function mvp2_audit_agent();
create function mvp2_immutable_event() returns trigger language plpgsql as $$
begin raise exception 'MVP2 audit events are append-only' using errcode='23514'; end $$;
create trigger qualification_immutable before update or delete on qualification_events for each row execute function mvp2_immutable_event();
create trigger transitions_immutable before update or delete on stage_transitions for each row execute function mvp2_immutable_event();
create trigger agent_events_immutable before update or delete on agent_definition_events for each row execute function mvp2_immutable_event();
-- Registry entry only: disabled until explicitly configured. Existing Nadia keeps its runtime.
insert into agent_definitions(organization_id,store_id,key,name,objective,stage)
select organization_id,id,'nadia','Nadia','Asistencia general y soporte','soporte' from stores;
alter table agent_definitions enable row level security;
alter table conversation_assignments enable row level security;
alter table qualification_events enable row level security;
alter table stage_transitions enable row level security;
alter table agent_definition_events enable row level security;
-- No browser policies; server-side authorization is required. Runs and cancellation are E2.
commit;
