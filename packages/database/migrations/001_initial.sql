-- Run only in a dedicated SaaS PostgreSQL database; do not run blindly against Live Manager.
create extension if not exists pgcrypto;
create table organizations (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table stores (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), name text not null, provider text not null default 'shopify', external_store_id text, created_at timestamptz not null default now());
create table organization_members (organization_id uuid not null references organizations(id), user_id uuid not null, role text not null check (role in ('owner','admin','agent')), primary key (organization_id,user_id));
create table channel_connections (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), store_id uuid not null references stores(id), provider text not null, external_account_id text not null, unique(provider,external_account_id));
create table contacts (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), display_name text, created_at timestamptz not null default now());
create table conversations (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), store_id uuid not null references stores(id), channel_connection_id uuid not null references channel_connections(id), contact_id uuid not null references contacts(id), status text not null default 'open', created_at timestamptz not null default now());
create table messages (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), conversation_id uuid not null references conversations(id), external_message_id text, direction text not null check (direction in ('in','out')), body text, created_at timestamptz not null default now());
create unique index messages_external_unique on messages(organization_id,external_message_id) where external_message_id is not null;
create table webhook_inbox (id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations(id), store_id uuid not null references stores(id), provider text not null check (provider in ('whatsapp')), external_event_id text not null, payload jsonb not null, processed_at timestamptz, received_at timestamptz not null default now(), attempt_count integer not null default 0, last_error text, unique(organization_id,provider,external_event_id));
create index webhook_inbox_pending on webhook_inbox(received_at) where processed_at is null;
alter table webhook_inbox enable row level security;
-- RLS MUST be enabled with tenant policies before exposing other tables via a client-accessible API.
-- Initial backend connects only to webhook_inbox via trusted server-side database credentials.
