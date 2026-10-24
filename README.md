# La Madeja SaaS — WhatsApp phase 2

The read-only React inbox is documented in [phase 3](docs/PHASE_3_INBOX.md): conversation/contact previews, paginated history, responsive navigation and browser tests. Apply additive migration 003 after the phase 2 migrations.

The [authentication and low-cost development guide](docs/AUTHENTICATION.md) covers PKCE Google callbacks, local Supabase, session errors and an opt-in read-only access check. Real Google sign-in still requires a configured isolated OAuth environment and an authorized test account.

An isolated Free project is now prepared in Cesartap-Free. See the [development environment record](docs/FREE_DEVELOPMENT_ENVIRONMENT.md) for verified setup, private configuration still needed, and read-only checks. The existing CRM project remains separate.

Phase 2 adds recoverable inbox processing, tenant-scoped contacts/conversations/messages, authenticated read APIs, membership enforcement and synthetic integration tests. See [phase 2 setup, migration and architecture notes](docs/PHASE_2.md) for the current instructions. Start the independent worker with `npm run worker` after applying migrations 001 and 002 in an isolated database.

Independent conversational SaaS backend piloted against La Madeja as an **external Shopify client**. The La Madeja storefront and Live Manager remain in their existing repositories and production environments. **Not production-ready**.

## What works in source
- React/Vite Google login through the **same Supabase project** as Live Manager.
- API validation of bearer tokens using Supabase `auth.getUser()` plus an MVP email allowlist.
- Server-side fixed MVP organization/store IDs; clients cannot choose another tenant.
- WhatsApp GET verification challenge and POST raw-body HMAC SHA-256 verification.
- Webhook POST validates Meta signature and stores a raw event in a **dedicated PostgreSQL durable inbox**, returning 200 only after insert or confirmed duplicate. Without `DATABASE_URL`, it returns 503. An independent worker processes incoming text; outbound messaging is disabled. Do not configure production Meta webhooks yet.
- Additive PostgreSQL migrations, row locking, bounded retries, database uniqueness and synthetic signature/HTTP/SQL tests.

## Setup
1. Install Node.js 22+ (required by the locked Supabase SDK).
2. Run `npm install` in the root.
3. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env`.
4. Use **the same authentication Supabase URL and public/anon key in the API and frontend**. For development, prefer a local Supabase instance. Existing shared authentication with Live Manager remains supported; do not change its production configuration for tests. Do not put service-role keys in frontend environment variables.
5. Add an authorized email to `ALLOWED_EMAILS` and its organization membership in the isolated SaaS database. For real OAuth testing, allow `http://localhost:5173/auth/callback` in the chosen development Supabase project's redirect URLs. See the authentication guide for Google's separate provider callback URL.
6. Run `npm run dev:api` and `npm run dev:web` in separate terminals.
7. Visit `http://localhost:5173`; authenticate and verify `/api/me` responds for an allowed user.
8. Run `npm test` and `npm run typecheck`.

## Important limitations
- The email allowlist is an additional pilot gate; database organization membership is also required. Dynamic tenant switching remains pending.
- Apply both migrations before using persistence. RLS denies direct browser access; the backend needs a dedicated trusted database role. Review role grants before deployment.
- No WhatsApp message sending, Shopify calls, CRM processing, or AI execution is enabled.
- `docs/INTEGRATION_BOUNDARIES.md` defines the no-impact integration boundaries.
- Do not point production Meta/Shopify webhooks at this API without explicit authorization and operational review.
- Source repos remain unchanged.
