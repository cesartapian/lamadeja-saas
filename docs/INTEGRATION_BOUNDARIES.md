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
5. **No worker yet**. Inbox events remain pending. Do not connect production traffic.

## Next implementation
- Add a worker with leasing, retry/backoff and dead-letter state.
- Parse each `entry[].changes[].value.messages[]`, dedupe by Meta message ID, resolve a channel connection and contact.
- Enforce organization/store consistency with DB constraints and scoped queries.
- Implement read-only inbox UI, then manual replies, then AI.
- Integrate Shopify read-only via credentials stored encrypted server-side.

## Deployment caveat
Migration 001 is intended for a new, isolated database and must not be run against existing Live Manager or Shopify infrastructure. Seed the MVP organization and store in the isolated DB before enabling the webhook endpoint. This is a development scaffold, not production-ready.
