# Remote staging runtime and real-service integration

This increment packages the API, inbox worker, simulated outbox worker and frontend for a remote runner or Docker host. It prepares deployment; it does not provision a paid service, publish a domain, enable a real WhatsApp transport or claim that the real-service workflow has passed.

## Runtime artifacts

- `deploy/Dockerfile.api`: Node 22 multi-stage build, compiled TypeScript, production dependencies, unprivileged Node process. One image runs API, inbox or simulated outbox using different commands.
- `deploy/Dockerfile.web`: static Vite build served by unprivileged Nginx. The build rejects privileged frontend keys and insecure remote URLs. Only public settings are build arguments.
- `compose.staging.yml`: API and inbox worker; optional `simulation` and `web` profiles. API/web ports bind to loopback by default. An external TLS ingress or a hosting platform is still required for public access.
- Root `vercel.json`: repository-root Vercel build/output settings and `/auth/callback` SPA rewrite. Vercel serves the frontend only, not these persistent workers.

No `.env`, private key or CA file is copied into an image. Production secrets are injected at runtime; the trusted public database CA is mounted read-only. The containers use read-only root filesystems and temporary `/tmp` storage. The frontend disables request access logs because callback URLs may contain a one-use authorization code. Do not enable verbose HTTP/SDK logs or publish environment dumps.

## Start on a compatible Docker host

Requirements: Docker Engine with BuildKit and Compose **2.30+**, network access to the chosen Supabase session pooler, and the official current CA for that endpoint. Persistent hosting and any associated cost must be selected/authorized separately; no server was purchased by this task.

1. Apply the reviewed migrations once to the isolated development database. Migrations 004 and 005 were already applied and verified in development; do not rerun 001–005.
2. Copy `deploy/staging.env.example` to a private file **outside the checkout** and complete its values. It is raw `KEY=value` format: no shell quotes/interpolation. Use the same verified public Auth key for the frontend/API, correct allowed email and tenant IDs, and a percent-encoded PostgreSQL URI with `sslmode=verify-full`. Do not embed a workstation-only `sslrootcert` path; the shared CA mount supplies trust.
3. Set `STAGING_ENV_FILE` to that private file and `STAGING_CA_FILE` to the trusted public CA PEM. Export `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` as public build settings. For the browser, the API URL must be reachable from the browser; Docker service names are not public URLs. Production origins must be HTTPS.
4. Build and start from the repository root:

```sh
docker compose -f compose.staging.yml --profile web build api web
docker compose -f compose.staging.yml --profile web up -d --no-build --wait
```

For simulation, explicitly set `OUTBOX_MODE=simulated` in the private runtime file, then include `--profile simulation` in the commands. The profile alone enables the outbox worker, but the API requires its own opt-in. The default file is `disabled`; no mode enables real WhatsApp.

The image commands are `node dist/index.js`, `node dist/worker.js` and `node dist/outboxWorker.js`, working in `/app/apps/api`. Plain compiled Node receives SIGTERM directly; there is no watch process in the runtime. Compose supplies `WORKER_HEALTH_PORT=4001` only to worker containers. Do not set that variable globally for the API. Each worker is scoped to its configured organization/store; allocate another worker pair if another scope is needed.

Optional build CA support for a trusted corporate/package proxy is a BuildKit secret named `build_ca`, not an image layer or a TLS bypass. The automated build helper passes the existing `NODE_EXTRA_CA_CERTS` file as that secret if available. Never use `strict-ssl=false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, or `rejectUnauthorized:false` to make a build/connection pass.

## Readiness and shutdown

- API `/health`: process liveness. `/ready`: a bounded database query; returns 503 if unconfigured, disconnected or stopping. A live PID is insufficient.
- Workers `/health` and `/ready`: optional internal server. Readiness requires a recent successful database processing/idle cycle; a failed cycle or stale heartbeat returns 503. Port is not published by Compose.
- SIGINT/SIGTERM stop accepting API traffic or new work, interrupt idle polling, finish the active bounded transaction, and close health servers/pools. Compose gives processes two minutes to stop.
- Idle pool disconnect errors are handled and logged by safe code only, without dumping the credential-bearing client object. API/workers can recover readiness when PostgreSQL returns.

## Two different validation suites

### Disposable container runtime (automatic CI)

```sh
npm run test:containers
```

The runner builds both images, starts a disposable PostgreSQL 16 fixture, applies migrations there only, and verifies readiness, anonymous access rejection, signed inbox processing, scoped outbox simulation, callback SPA delivery and graceful termination. It then stops PostgreSQL, verifies unhealthy readiness without losing liveness, restarts PostgreSQL and verifies recovery. Another tenant's queue remains untouched. Everything is removed in cleanup.

Set `STAGING_CONTAINER_CA_FILE` to a trusted public CA PEM bundle for the runtime mount, or use the existing `NODE_EXTRA_CA_CERTS` path. The CI job uses the runner's public CA bundle. This test uses synthetic identities/data and does **not** claim remote Supabase Auth/Google validation.

### Real development services (explicit workflow)

Workflow **Real development integration** (`.github/workflows/staging-real.yml`) runs manually and on relevant changes merged to main, never with secrets on untrusted pull-request code. Its target is pinned to `ropciikoozdbvsmiulhh`. Missing configuration is a failed job, not a skipped success. The workflow uses the `staging` environment, with serialized executions and a 25-minute limit.

Configure the following environment or repository Actions secrets once:

| Name | Value |
| --- | --- |
| `STAGING_DATABASE_URL` | Working development session-pooler URI, `sslmode=verify-full`, no machine-local CA path |
| `STAGING_ANON_KEY` | Public publishable/anon key for that development Auth project; never service role |
| `STAGING_TEST_EMAIL` | Dedicated, authorized test account in development Supabase Auth |
| `STAGING_TEST_PASSWORD` | That account's **Supabase test password**, not a personal Google password |
| `STAGING_DATABASE_CA_PEM` | Official public CA certificate contents for the database endpoint; never a private key |

The dedicated account must already exist and support ordinary password sign-in. The runner does not insert Auth users, impersonate a personal Google account, forge JWTs or use admin credentials for application requests. The test account is a one-time prerequisite; its password belongs in secure settings, not chat. Interactive Google consent/2FA remains a separate integration check; password Auth testing is not presented as a new Google login test.

The current GitHub integration/token could read Actions but returned 403 for secret administration. If that remains so, enter the five secrets once in GitHub's settings instead of weakening permissions or embedding credentials in code. A working Cloud token or `.env` on the PC does not automatically create repository secrets.

The smoke test obtains a real session from Supabase, verifies database TLS, creates a random temporary organization/store with membership for that verified user, starts the actual containers and checks:

1. Anonymous/invalid sessions denied, real identity authorized, server tenant scope enforced.
2. Signed synthetic event durably accepted/deduplicated, processed by the compiled inbox worker and read as conversation/message/contact.
3. Migration 005 presence and the compiled sandbox repository on the owned tenant: idempotency, durable dispatch start, stale-version rejection, unknown blocking retries and synthetic acceptance. No Meta call or delivery claim.
4. Authenticated outbox insert, exact retry, conflicting-key rejection and completed simulation with no real outgoing message.
5. Playwright opens the compiled frontend using that genuine session and exercises the UI against real Auth/API/database/workers. No route interception, fake identity lookup or response mocks.

Workers are scoped to the temporary tenant so they cannot consume other development tenants' queues. No migrations or global Auth settings are changed by the smoke test. Cleanup stops its namespaced containers, deletes only its owned temporary tenant/data, signs out its own test session and deletes private temporary runtime files. It never deletes the test account or existing user data.

Only a sanitized `.staging-results/summary.json` is uploaded: status, phase/check names, generated run marker and cleanup outcome. No token, password, email, connection URI, response body, trace/HAR or session snapshot is uploaded. Failed cleanup makes the check fail. A forcibly killed runner can still require operator reconciliation using the generated run marker; it is not an exactly-once cleanup guarantee.

To run this same test on an authorized remote runner outside Actions, supply the corresponding `STAGING_*` variables, set `STAGING_RUN_REAL=1`, `STAGING_PROJECT_REF=ropciikoozdbvsmiulhh`, `STAGING_DATABASE_CA_FILE` and `NODE_EXTRA_CA_CERTS` before starting Node, then run `npm run test:staging:real`. The browser may use `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for an installed Chromium. Require Node 22+, npm dependencies, Docker/Compose and Chromium installed through Playwright or a trusted system package.

## Current limits

The real-service workflow [passed on GitHub Actions](https://github.com/cesartapian/lamadeja-saas/actions/runs/40229617433). Its downloaded summary confirms 21 distinct checks, status `passed`, and `fixture_cleanup_complete: true`, including genuine test-account authentication, verified database TLS, scoped API/workers and browser simulation. The dedicated test account and five Actions secrets are configured. This is a temporary remote runner, not a long-lived hosted environment. Interactive Google sign-in, the published Live Manager link and real WhatsApp remain separate checks. No paid service has been provisioned.

Migration 005 was explicitly authorized and applied to the selected development project on 2026-10-26 after PR #18 merged with successful review/checks. Metadata verified its scoped foreign key, state/claim constraints, all indexes, RLS and absence of browser policies; existing user/member/store/conversation/message counts were unchanged. The original 21-check run predates this extension; the expanded workflow [40270492905](https://github.com/cesartapian/lamadeja-saas/actions/runs/40270492905) subsequently passed all 28 distinct checks, with fixture_cleanup_complete true and real_whatsapp_sent false. This confirms the compiled repository against hosted development PostgreSQL; the provider outcomes are synthetic. The test command compiles the API first to exercise its actual repository.

The next receipt increment requires migration 006 before starting its updated real workflow. It sends signed synthetic delivery callbacks through the actual webhook/inbox worker and verifies deduplication and monotonic read status. It is not a Meta delivery test. Cleanup deletes sandbox_receipts before sandbox_dispatch. Apply 006 only after review; never repeat earlier migrations.
