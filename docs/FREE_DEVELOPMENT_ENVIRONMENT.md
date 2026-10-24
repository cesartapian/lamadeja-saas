# Cesartap-Free development environment

The selected organization is **Cesartap-Free** (`ecxrdywsyvhpvcttprmt`). Supabase quoted a new development project at **USD 0 per month** before creation. No paid plan, branch, add-on or production service was enabled.

| Setting | Development value |
| --- | --- |
| Project | `lamadeja-saas-dev` |
| Project reference | `ropciikoozdbvsmiulhh` |
| Region | São Paulo (`sa-east-1`) |
| API/Auth URL | `https://ropciikoozdbvsmiulhh.supabase.co` |
| Organization ID inside the SaaS | `d901beb8-5598-4669-915c-958bc443ebab` |
| Store ID inside the SaaS | `b557cf33-5e44-408c-ba5e-448256ba1367` |
| Synthetic WhatsApp phone ID | `development-phone` |

[Open the development project](https://supabase.com/dashboard/project/ropciikoozdbvsmiulhh). These identifiers are configuration, not credentials. Public keys and generated local webhook test secrets are kept in private ignored `.env` files, not in this document or Git. `CRM-Database` was not modified.

## Prepared and verified

- A dedicated healthy Free project was created after the user selected this organization. Public schema was empty before installation.
- Existing migrations 001–003 were applied as one atomic cloud migration named `initialize_saas_development`. The cloud history groups those three existing SQL files; **do not rerun migration 001 over this populated schema**.
- Eight business tables have RLS enabled. No direct browser policies were added: data access continues through the authenticated backend. The organization, synthetic store and synthetic channel are seeded, with no real customers or messages.
- The enabled publishable key was selected for both frontend and backend Supabase Auth clients. The setting name retains `ANON_KEY` for application compatibility; its value is a modern publishable key. Local API and web environment files are ignored by Git.
- Public Auth settings show Google disabled. Anonymous authentication is disabled and remains disabled. No user account, provider credential or OAuth configuration was created or changed.

## Private configuration still needed

1. In the development project's **Connect** panel, obtain the PostgreSQL connection URI. Set its password locally if required through the dashboard, then save the URI as `DATABASE_URL` in `apps/api/.env`. Prefer the session pooler connection for a persistent Node process if the workstation cannot reach direct IPv6. Do not paste its password into chat, commit it or use a service-role client key as a database password. See [connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
2. Two development account addresses selected by the user are now configured in the private local `ALLOWED_EMAILS` value. Addresses are intentionally omitted from the public repository. Google accounts still need to sign in and receive organization membership after their verified Auth users exist.
3. A separate Google Cloud project, `lamadeja-saas-dev-20261024` (display name `La Madeja SaaS Dev`), was created with explicit user authorization. Its OAuth application configuration was created in testing mode after the user accepted Google's user-data policy. No billing account was linked through these actions. The OAuth client creation, test-user save, provider secret entry and real login are separate pending steps; a prepared form is not proof of completion. Configure this development project using the [authentication guide](AUTHENTICATION.md). Never seed a fake Auth user or weaken email/membership checks to bypass setup.

On Windows, `scripts/set-dev-database.ps1` securely prompts for the development database password and writes an encoded session-pooler URI with `sslmode=verify-full`. It refuses an environment file for another Supabase project, refuses to overwrite an existing connection unless `-Replace` is explicitly provided, and does not print credentials. The pooler endpoint was read from this project's Connect panel; no paid IPv4 add-on is needed. Run it from any folder using its absolute path, or from the repository root:

```powershell
.\scripts\set-dev-database.ps1
```

The password must first be set by the user in the development project's dashboard. Never pass a real plaintext password on the command line or in chat. The optional SecureString parameter and alternate file argument exist for isolated automated fixture checks; the normal operator path is the hidden prompt. The helper was checked using synthetic special characters, verified-TLS output, a wrong-project fixture and an existing-connection fixture. These checks do not replace testing the actual saved connection.

The API can answer health checks and reject unauthenticated/invalid sessions without `DATABASE_URL`. Successful authenticated reads and worker persistence require the private database connection. The worker intentionally refuses to start without it. New webhook deliveries are not acknowledged as durable when database persistence is unconfigured.

## Local commands

Use the existing `npm run dev:api` and `npm run dev:web` in separate terminals. Open `http://localhost:5173` so its origin matches `WEB_ORIGIN`. Start `npm run worker` only after `DATABASE_URL` points to this development project.

For the read-only connectivity/negative-access verification, set `DEV_SUPABASE_PROJECT_REF=ropciikoozdbvsmiulhh` in the terminal environment and run:

```text
node scripts/check-dev-environment.mjs
```

The script checks the expected cloud ref, public Auth connectivity, anonymous Data API isolation, local health, and missing/invalid bearer rejection. It prints readiness flags for Google/database configuration; passing connectivity checks does **not** mean full Google login or a valid-session inbox has been tested. It performs only GET requests, requires a local API, follows no redirects, and prints no key, token, email or response body. After login is available, use `scripts/check-auth.mjs` to validate the actual development session and tenant scope.

## Advisor results and boundaries

Security advisor findings are informational: eight `RLS Enabled No Policy` notices are expected for the backend-only access design. No permissive policy was added to suppress them. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Performance advisor reports nine unindexed foreign-key constraints and four unused indexes in the new, empty workload. These are recorded for a measured optimization increment, not treated as a reason to enlarge compute or remove required worker/inbox indexes. [Foreign-key guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [unused-index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

No storefront, Live Manager service, production database, real Meta webhook, outbound message or deployment was touched. Free resources remain subject to Supabase quotas and inactivity pausing; no uptime guarantee or future paid upgrade is implied.
