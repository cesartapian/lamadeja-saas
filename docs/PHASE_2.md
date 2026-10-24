# WhatsApp message processing — phase 2

## Audit of the starting point

Inspected `main` at `d4c8dbc`. The monorepo has React/Vite and Express TypeScript workspaces, a draft SQL migration and three signature/envelope tests. There was no worker, business persistence, conversation API, lockfile, lint command or CI. The frontend typecheck failed because Vite environment types were absent. The webhook correctly retained original bytes for HMAC and acknowledged only durable writes. The shallow envelope validator deliberately permits malformed nested events into the durable inbox; the worker now validates those and records failure. Supabase `getUser` verifies sessions remotely; an email allowlist previously assigned a fixed tenant without checking membership. Business tables lacked RLS. Dependency installation exposed a high severity Zod advisory; upgrading to 4.6.7 cleared it.

Read-only reference review (no source repositories changed):

- `whatsapp-app/api/webhooks.ts`: useful Meta message mapping and interactive types, but its signature calculation serializes parsed JSON. Preserve the SaaS implementation's exact raw-byte verification instead. Sending and bot processing remain excluded.
- `shopify-whatsapp-app/server/whatsapp/messageHandler.js`, `server/api/conversations.js`, `prisma/schema.prisma`: useful conversation lifecycle and message display patterns. Its SQLite/Prisma schema keys conversations by phone and its example listing is unscoped. Reimplement tenant-safe SQL rather than importing those handlers, outbound clients or dependencies.
- `WhatsAgent/backend/auth.py`: separate Python/Mongo authentication and JWT scheme, incompatible with retaining Supabase sessions. CRM and agent features remain future references; do not copy authentication, default-account seeding or cookie settings.
- `live-manager-cl/src/lib/supabase.ts`: retain its Supabase Google OAuth/session approach. No writes or configuration changes to Live Manager or its database.

## Architecture and isolation

Webhook POST verifies HMAC over raw bytes before parsing and inserts a SHA-256-keyed event. The independent worker reads only due pending/failed events below the attempt limit, using `FOR UPDATE SKIP LOCKED`. It sets processing, upserts contacts/conversations and inserts incoming text messages, then commits processed in the same transaction. Unsupported types/fields and status-only notifications are retained as processing notes, with their original payload in the inbox. Invalid nested data fails the event atomically.

A savepoint rolls back business writes on failure while preserving the attempt increment and safe error category. Retry delay doubles from `WORKER_RETRY_SECONDS`, with exponent capped at 10. Exhausted events remain failed for inspection. Processing is transaction-local: no committed processing lease can expire while a worker still owns it. Disconnect/crash rolls back the transaction and releases the row lock; another worker sees the previous pending/failed state. Statement and idle-in-transaction timeouts bound interrupted transactions. Infrastructure failures that prevent committing also roll back the attempt increment.

Database constraints deduplicate Meta message IDs per organization, contacts per organization/store/WhatsApp identity, and conversations per organization/store/channel/contact. Composite foreign keys reject cross-tenant business links. RLS is enabled without browser policies: clients must use this backend. `DATABASE_URL` requires a dedicated trusted backend role with access through RLS (table owner or an appropriately secured BYPASSRLS role), never a browser-exposed credential. Database role grants must be reviewed before production deployment.

Authentication still calls Supabase `auth.getUser` and enforces the email allowlist. It additionally requires an `organization_members` record for the authenticated Supabase user. Organization/store scope is taken from server configuration; request query/body tenant IDs have no effect. This remains a single configured tenant pilot, not dynamic tenant switching. A channel's `external_account_id` is the WhatsApp **phone_number_id**, and must belong to the configured organization/store. Unknown registrations fail closed.

## Local setup

1. Run `npm ci` with Node 22+ (required by the locked Supabase SDK and validated in CI).
2. Copy the two `.env.example` files as in the README. Use synthetic secrets and an isolated database while testing. Keep all real `.env` files untracked.
3. Create a dedicated empty PostgreSQL database. Apply `packages/database/migrations/001_initial.sql`, then `002_message_processing.sql` in order using a database migration tool or `psql -v ON_ERROR_STOP=1 -f <file>`. Never target a production database. Migration 002 is transactional and additive; it intentionally fails on inconsistent existing relationships/duplicate conversations rather than silently deleting or merging records. Back up and reconcile such data first. Legacy contacts retain nullable store/external IDs; newly processed contacts always have both.
4. Insert the organization/store IDs configured in the API environment, add your Supabase user UUID to `organization_members`, and register a WhatsApp channel. Use the synthetic fixture below for an isolated manual setup; substitute only the membership UUID with your own authenticated user ID.

```sql
insert into organizations(id,name) values ('00000000-0000-0000-0000-000000000001','Synthetic pilot');
insert into stores(id,organization_id,name) values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Synthetic store');
-- Supply your actual Supabase user UUID to this statement:
-- insert into organization_members values ('00000000-0000-0000-0000-000000000001','<SUPABASE_USER_UUID>','owner');
insert into channel_connections(organization_id,store_id,provider,external_account_id)
values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','whatsapp','synthetic-phone');
```

5. Start `npm run dev:api`, `npm run worker`, and optionally `npm run dev:web` in separate terminals. Both API and worker load `apps/api/.env` through their workspace working directory.
6. Run `npm test` for a fully synthetic signed-webhook-to-authenticated-query demonstration. It uses PGlite's PostgreSQL engine in memory, replaces only unavailable pgcrypto extension installation, mocks the external Supabase identity lookup and performs real SQL and local HTTP requests. Production authentication has no mock mode. No Meta, Shopify or Supabase production calls occur in tests.
7. For connection-level locking/recovery tests, point `TEST_DATABASE_URL` **only at a disposable PostgreSQL test database** and run `npm test`. The test creates and drops a random schema, uses separate connections and explicitly destroys an uncommitted connection. CI provisions its own PostgreSQL 16 service for this test. Do not set this variable to a production database.

## HTTP API

All routes below require `Authorization: Bearer <Supabase access token>`, allowlisted email and database membership. Lists return at most 100 rows and accept a nonnegative `offset` (maximum 100000).

- `GET /api/conversations?offset=0`: current tenant/store conversations, latest update first.
- `GET /api/conversations/:id/messages?offset=0`: messages in received order; `sent_at` preserves the provider timestamp. Foreign or absent conversations return 404.
- `GET /api/contacts/:id`: scoped contact detail; foreign or absent contacts return 404.

`GET /webhooks/whatsapp` retains Meta challenge verification. POST requires `application/json` and a valid `x-hub-signature-256`. HTTP 200 means durable acceptance, not completed processing. Invalid signature returns 401, malformed JSON/envelope 400 and persistence failure 503. Unexpected backend errors return a generic 500 without SQL/payload disclosure.

## Operations and limits

Defaults: `WORKER_MAX_ATTEMPTS=5`, `WORKER_RETRY_SECONDS=30`, `WORKER_TIMEOUT_MS=15000`, `WORKER_POLL_MS=1000`. Inspect `status`, `attempt_count`, `last_error`, `processing_notes`, `next_attempt_at`, `processed_at` and `updated_at` in `webhook_inbox`. `last_error` is a sanitized category; raw database errors are not logged. After correcting a failed event's cause, a trusted operator may reset its status to pending, attempts to zero and next attempt to now in the isolated database. No public retry/admin endpoint is provided.

`npm run typecheck` validates both workspaces. `npm run lint` uses TypeScript unused-symbol/parameter checks; this is a deliberately lightweight compiler lint, not ESLint. `npm test` runs unit and integration tests. `npm audit --audit-level=high` checks dependencies. The lockfile makes installations reproducible.

PGlite tests do not prove multi-session concurrency or real Supabase OAuth availability; PostgreSQL CI covers the former. No UI inbox, outbound messages, media download, delivery status persistence, AI, Shopify integration, retention policies, metrics UI, dynamic tenant onboarding or deployment is included. Next increment: a read-only conversation inbox in React with authenticated pagination and visible message types/errors, followed by controlled outbound text with an outbox and explicit sandbox authorization.
