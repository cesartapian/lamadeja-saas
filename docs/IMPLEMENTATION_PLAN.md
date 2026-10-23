# Implementation plan

## Milestone 0 — Delivered scaffold
- [x] Monorepo npm workspaces
- [x] Supabase Google sign-in + server token verification
- [x] Fixed store identity and MVP allowlist
- [x] Meta raw body signature verifier
- [x] Draft relational schema and HMAC tests

## Milestone 1 — Durable WhatsApp messaging
- [ ] Choose isolated PostgreSQL deployment and run reviewed migrations
- [ ] RLS + authorization tests and cross-store isolation tests
- [ ] Map Meta phone_number_id to a server-owned channel connection
- [ ] Persist webhook events transactionally before HTTP 200
- [ ] Deduplicate inbound messages by Meta message ID and webhook delivery
- [ ] Add async worker and retry/dead-letter policy
- [ ] Port Meta sender and delivery status handling from whatsapp-app
- [ ] End-to-end sandbox tests with Meta test number

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
