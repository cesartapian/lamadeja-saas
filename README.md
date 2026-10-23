# La Madeja SaaS — MVP foundation

Independent conversational SaaS backend piloted against La Madeja as an **external Shopify client**. The La Madeja storefront and Live Manager remain in their existing repositories and production environments. **Not production-ready**.

## What works in source
- React/Vite Google login through the **same Supabase project** as Live Manager.
- API validation of bearer tokens using Supabase `auth.getUser()` plus an MVP email allowlist.
- Server-side fixed MVP organization/store IDs; clients cannot choose another tenant.
- WhatsApp GET verification challenge and POST raw-body HMAC SHA-256 verification.
- Webhook POST validates Meta signature and stores a raw event in a **dedicated PostgreSQL durable inbox**, returning 200 only after insert or confirmed duplicate. Without `DATABASE_URL`, it returns 503. No background worker or outbound messaging is enabled. Do not configure production Meta webhooks yet.
- Draft PostgreSQL schema, isolated durable inbox schema, and signature/payload tests.

## Setup
1. Install Node.js 20+.
2. Run `npm install` in the root.
3. Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env`.
4. Use **the same Supabase URL and public/anon key** as Live Manager in both files. Do not put service-role keys in frontend environment variables.
5. Add an authorized email to `ALLOWED_EMAILS`. Configure Google OAuth allowed redirect URL `http://localhost:5173` in Supabase.
6. Run `npm run dev:api` and `npm run dev:web` in separate terminals.
7. Visit `http://localhost:5173`; authenticate and verify `/api/me` responds for an allowed user.
8. Run `npm test` and `npm run typecheck`.

## Important limitations
- The email allowlist is an MVP-only authorization gate, not a substitute for tenant permissions.
- SQL is a **draft**; tenant isolation and RLS need completion and testing before data persistence or SaaS onboarding.
- No WhatsApp message sending, Shopify calls, CRM processing, or AI execution is enabled.
- `docs/INTEGRATION_BOUNDARIES.md` defines the no-impact integration boundaries.
- Do not point production Meta/Shopify webhooks at this API until inbox persistence and retries are implemented.
- Source repos remain unchanged.
