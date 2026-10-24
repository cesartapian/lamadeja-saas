# Phase 4 — persistent simulated outbox

This increment adds a persistent reply queue, an independent simulation worker and a Spanish composer with queue status. It does **not** implement a real WhatsApp transport. Successful jobs are labeled `simulated`, never `sent`; simulations do not insert outbound records in the real message history, call Meta, update customer conversations or change the latest inbound preview.

## Run in an isolated development database

Apply additive migration `004_simulated_outbox.sql` after 001–003 using the trusted backend database role. Never rerun migration 001 on the existing populated development project. The migration enables RLS without browser policies and enforces the organization/store/conversation relationship with a composite foreign key.

Set `OUTBOX_MODE=simulated` in the private API environment, then restart `npm run dev:api`. The default is `disabled`; the API exposes an authenticated capability endpoint and rejects submissions when disabled. No flag selects a real transport. Start `npm run worker:outbox` separately with the same dedicated database and explicit simulation opt-in. The existing inbound worker remains `npm run worker`.

Open a conversation in the authenticated inbox. The **Simular envío** composer stores a message only after the durable insert succeeds. Refresh or the short polling cycle shows pending, retrying, terminal failure or simulated completion. Each accepted item is scoped by authenticated organization/store; clients cannot supply their tenant or requester. The UI and API limit text to 4096 characters and reject empty replies. Old simulated items can be paginated separately from real messages.

## API and retry contract

- `GET /api/outbox/capabilities`: returns `disabled` or `simulated` after authentication and membership validation.
- `GET /api/conversations/:id/outbox?offset=0`: returns up to 25 newest queue items plus `hasMore`/`nextOffset`; unknown or foreign conversations return 404.
- `POST /api/conversations/:id/outbox`: `{ "body": "Synthetic reply", "idempotencyKey": "<new UUID>" }`. New inserts return 202; exact retries return 200 with the existing item. Reusing a key for a different body/conversation returns 409. The key is unique within organization/store. A client should retain it after an ambiguous network failure; changing the draft starts a new request.

The worker holds a row lock throughout one bounded simulation transaction and uses `FOR UPDATE SKIP LOCKED`. A crash rolls back its claim and increment; independent workers can process other rows. The attempt cap is stored on each queued item from `WORKER_MAX_ATTEMPTS`. Retry delay uses `WORKER_RETRY_SECONDS` with bounded exponential backoff; exhausted jobs become `failed` and are not retried automatically. The provider deadline is half `WORKER_TIMEOUT_MS`, leaving room to record the result before the transaction timeout. Only a sanitized failure category is persisted. The built-in provider is deterministic and has no external side effects.

This transaction design is valid for simulation only. Before adding a real network transport, design durable claims, provider-side idempotency, ambiguous-result reconciliation and delivery receipts; an external send cannot be rolled back with PostgreSQL. Also require explicit sandbox authorization, recipient controls, WhatsApp conversation-window/template policy, rate limits, and operational review. Do not connect production credentials or webhooks in this increment.

## Validation and remaining work

`npm test` covers real SQL/HTTP queue creation, input validation, membership, tenant isolation, idempotent retries, failure recovery, exhaustion, timeouts and the absence of real outbound messages. The optional PostgreSQL suite additionally covers concurrent workers and recovery after a disconnected transaction. Browser tests cover the composer, pending/completed/failed statuses and idempotency after an uncertain response. Tests use synthetic identity/provider data.

Current cloud validation: all 15 backend/TLS tests passed, including the PostgreSQL 16 concurrency/recovery suite; 46 browser cases passed across desktop/mobile (44 application cases plus 2 dashboard cases). Typecheck, compiler lint and web build passed. The actual `npm run worker:outbox` command consumed a queued simulation in the disposable PostgreSQL instance without writing a real outgoing message.

Real Supabase database connectivity and Google login remain separate pending integration checks. Migration 004 has not been applied to the cloud development project by this coding task. Creating a PR, reviewing it, merging it and applying the migration are separate actions.

See [the phase dashboard](progress.html) for the current development and integration status.
