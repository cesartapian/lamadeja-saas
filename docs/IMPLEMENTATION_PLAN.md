# Implementation plan

## Milestone 0 — Delivered scaffold
- [x] Monorepo npm workspaces
- [x] Supabase Google sign-in + server token verification
- [x] Fixed store identity and MVP allowlist
- [x] Meta raw body signature verifier
- [x] Draft relational schema and HMAC tests

## Milestone 1 — Durable WhatsApp messaging
- [x] Choose isolated PostgreSQL deployment and run reviewed migrations
- [x] RLS + authorization tests and cross-store isolation tests
- [x] Map Meta phone_number_id to a server-owned channel connection
- [x] Persist webhook events transactionally before HTTP 200
- [x] Deduplicate inbound messages by Meta message ID and webhook delivery
- [x] Add async worker and retry/dead-letter policy
- [ ] Port Meta sender and delivery status handling from whatsapp-app
- [ ] End-to-end sandbox tests with Meta test number

## Development validation and publication
- [x] Read-only inbox, message history, contact details and simulated persistent outbox
- [x] Genuine Supabase/Auth/API/workers/browser integration passed on Actions (run 40229617433), with fixture cleanup
- [x] Compiled containers, readiness, graceful termination and DB recovery tests
- [ ] Public deployment and Google sign-in from the published domain
- [ ] Activate Live Manager → SaaS link

Oracle Always Free A1 creation was attempted, but AD-1 returned out-of-capacity. The user deferred VM creation. No running Oracle VM, deployment or zero-cost billing verification is claimed. Continue code and tests independently; do not switch to paid resources.

Before the pending real Meta sender: review durable claims, ambiguous-result reconciliation, delivery receipts and explicit sandbox recipient/policy controls. [Preparatory design and executable decision contract](WHATSAPP_SANDBOX_DESIGN.md) cover retry eligibility and sandbox text admission; Migration 005 and scoped PostgreSQL claims/versioned transitions are implemented and tested on disposable PostgreSQL; 005 was applied and metadata-verified in development on 2026-10-26. Receipt ingestion/reconciliation is implemented for review with migration 006. 006 is applied in development and real signed-callback smoke passed (run 40320701757). A bounded, guarded Meta adapter is prepared separately; outbound API/worker/UI integration, activation/rate limits and real Meta E2E remain pending. The simulated outbox is not an authorized production transport.

## Milestone 2 — Commerce
- [ ] Implement secure Shopify OAuth/install and token storage
- [ ] Port product, variant, inventory, customer, order adapters from shopify-whatsapp-app
- [ ] Add webhook verification, sync, and retry tests

## Milestone 3 — Agents and operations
- [ ] Port conversation state machine and agent configuration
- [ ] Connect optional AI service explicitly, human handoff, logs and guardrails
- [ ] Port CRM/pipeline UI with real persisted state, no mock metrics
- [ ] Implement abandoned checkout consent rules and templates

## Milestone 4 — SaaS expansion
- [ ] Organization membership, granular permissions, billing, usage limits
- [ ] Channel-specific integrations beyond WhatsApp
