# Integration boundaries — MVP La Madeja

## Non-negotiable boundaries
- **La Madeja storefront** remains in its existing repository and Shopify production environment. No storefront source code is migrated.
- **Live Manager** remains in its existing repository and production environment. We reuse only its Supabase Auth identity provider (same Supabase URL / public key), not its operational tables or service-role credentials.
- **WhatsApp** inbound is isolated in this new backend. No production Meta webhook cutover until staging and a rollback plan are approved.
- **Shopify** is a future external connector via official API; initially read-only, with separate credentials and no production mutations.

## Current vertical slice
1. Meta sends signed POST to `/webhooks/whatsapp`.
2. API validates exact raw request bytes and WhatsApp event envelope.
3. API inserts a single event into a dedicated PostgreSQL `webhook_inbox`, using raw-body SHA-256 for delivery deduplication.
4. API acknowledges only after durable storage; returns 503 if DB is unavailable.
5. The independent inbox worker processes tenant-scoped incoming text with bounded retries. A separate, explicitly enabled outbox worker simulates replies only. Do not connect production traffic.

## Next implementation
- Validate real development Supabase database access and Google login; both remain pending.
- Review the simulated outbox in [phase 4](PHASE_4_OUTBOX.md) before connecting a real transport.
- Add controlled manual WhatsApp sandbox replies only after explicit authorization, provider idempotency/reconciliation design and recipient/policy checks.
- Consider AI and a read-only Shopify connector in separately scoped increments.

## Deployment caveat
Migration 001 is intended for a new, isolated database and must not be run against existing Live Manager or Shopify infrastructure. Seed the MVP organization and store in the isolated DB before enabling the webhook endpoint. This is a development scaffold, not production-ready.
