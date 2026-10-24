# Authentication validation and low-cost development

## What changed

Google sign-in now uses Supabase's PKCE flow with a callback at `/auth/callback` on the frontend's own origin. Supabase generates the verifier/challenge and exchanges the one-use authorization code. The app captures and cleans callback parameters before rendering, performs the exchange once even under React StrictMode, and preserves normal stored Supabase sessions. It never honors a user-supplied `next` URL. Callback errors show safe Spanish recovery messages without echoing provider diagnostics. The page has a no-referrer policy.

The app reuses Supabase's existing storage key. Already stored sessions remain compatible. Previously issued implicit-flow links containing tokens in the URL are deliberately rejected and cleaned; restart sign-in to get a PKCE flow. Start and finish login in the same browser/origin, because its verifier is required. On a static host, rewrite `/auth/callback` to the application's index, just like the root route. No hosting configuration is changed here.

Backend identity verification still calls `supabase.auth.getUser(token)`; client claims never authorize API access. Invalid credentials produce 401, missing allowlist/membership access produces 403, and upstream throttling/network/server failures produce 503 instead of claiming the session expired. Organization/store scope comes from the backend configuration and membership query.

## Develop without another paid project

The default recommendation for this phase is local development plus synthetic CI, with **no additional hosted Supabase project**. The official CLI runs PostgreSQL/Auth locally through a container runtime. Docker is installed on this workstation, but its daemon was not running during this increment; the full local Supabase stack has not been started or validated here. Nothing has been provisioned in Supabase Cloud.

If you need a shared external test URL, consider an available Free project in a Free organization. Supabase bills plans per organization; Free and Pro projects cannot coexist in the same organization. Current Free project limits and pausing rules may make it unsuitable for continuous production availability. Do not move, downgrade or consolidate production resources based only on this guide; inspect actual invoices, usage and operational requirements first.

The SaaS data model is multitenant: an organization/store does not require a separate Supabase project. Dynamic tenant onboarding is still future work. Keep the new SaaS database separate from the existing storefront/Live Manager operation. Shared Supabase Auth can remain an option without moving business tables into the production database. Avoid paid staging branches, extra compute projects or add-ons until there is a measured need.

References checked 2026-10-23: [local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [pricing](https://supabase.com/pricing), [organization billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [cost controls](https://supabase.com/docs/guides/platform/cost-control). A spend cap is not a blanket maximum invoice; compute and some other charges are outside its scope.

## Local configuration and real Google test

1. Start your local container runtime. In a separate local development directory, use the official Supabase CLI's `supabase init` and `supabase start`. Do not link it to a hosted project or run remote database commands. CLI installation and first image downloads are separate prerequisites, not added runtime dependencies of this app.
2. Copy the existing API/web `.env.example` files to private `.env` files. Configure both with the local Supabase URL and public anon/publishable key, and point `DATABASE_URL` to the isolated local PostgreSQL database. Keep API `WEB_ORIGIN` equal to the exact browser origin (`localhost` and `127.0.0.1` are different).
3. Apply SaaS migrations 001–003 only to that isolated database. Add the configured organization/store, the authorized test user's UUID to `organization_members`, and the email to `ALLOWED_EMAILS`. No migration is added by this increment.
4. Real Google login additionally needs a Google OAuth client configured for the **development** Supabase Auth service. Google's authorized provider redirect is the development Supabase service's `/auth/v1/callback`, while the app redirect allowlist contains `http://localhost:5173/auth/callback`. These are different URLs. Use only development OAuth credentials; keep its client secret server-side in local Auth configuration, never in `VITE_*` variables. See the [official Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google) for the current setup.
5. Run the API and web using the existing scripts. Open `http://localhost:5173`, choose Google, complete the provider interaction, confirm the URL returns to `/` without code/token parameters, refresh and check the inbox remains accessible, then sign out and verify it disappears. Membership is checked on every API request even if Google sign-in succeeds.

No Google client/project, production redirect, paid instance or user account was created or changed here. This manual real-provider test remains pending until a development environment and authorized interactive account are available.

## Optional read-only API check

`scripts/check-auth.mjs` can confirm a real development session against `/api/me` and a one-row conversation read. It verifies anonymous access is denied and checks the expected organization/store. It performs no writes and never prints tokens, user identities or response bodies.

Create a private `.env.auth-check` (ignored by Git) with `AUTH_CHECK_API_URL`, `AUTH_CHECK_ACCESS_TOKEN`, `AUTH_CHECK_ORGANIZATION_ID` and `AUTH_CHECK_STORE_ID`. Use a short-lived access token from your own development session; do not paste it into chat or command history. Run:

```text
node --env-file=.env.auth-check scripts/check-auth.mjs
```

Local API endpoints are allowed by default. A remote isolated test API requires HTTPS and the explicit `AUTH_CHECK_ALLOW_REMOTE=true` environment setting. Never point this check at an environment without authorization. Delete the private token file when finished.

## What automated tests prove

Browser tests use the actual SDK: initiate PKCE, verify S256 against the generated verifier, return a synthetic provider code, exchange once, forward the token to the API and reload the stored session. They also cover cancelled/expired/missing-verifier callbacks, old token fragments, revoked refresh tokens and invalid URL configuration. External HTTP responses are intercepted, not live Google/Supabase responses.

API tests exercise the real SDK against a local HTTP identity-provider fixture and confirm identity, allowlist/membership decisions, fixed tenant scope and 401/403/503 distinctions. Existing SQL, webhook and inbox tests remain. This does not prove a real Google OAuth configuration, production availability or a particular Supabase bill.
