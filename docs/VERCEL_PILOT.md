# Vercel pilot deployment

The repository root deploys the Vite frontend and `/api/*` Express routes together. `api/[...path].ts` forces read-only mode before importing configuration, does not bind a port and does not start workers. Existing persistent API/worker entry points remain available for a later full deployment.

Required private Vercel runtime variables: `DATABASE_URL`, `DATABASE_CA_PEM` (official Supabase root CA content, never a PC file path), `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_EMAILS`, `MVP_ORGANIZATION_ID`, `MVP_STORE_ID`, `WEB_ORIGIN`, and synthetic `META_APP_SECRET` / `META_VERIFY_TOKEN` satisfying existing configuration validation. Keep `OUTBOX_MODE` and `NADIA_MODE` disabled. Do not upload local `.env` files or any production credentials.

Frontend build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public key only), `VITE_API_URL` equal to the confirmed HTTPS deployment origin. The frontend and API use the same project origin; session tokens are sent in headers, never in links from LiveManager.

Select the existing development Supabase project only. For IPv4 Vercel runtimes use its verified session-pooler credentials, not a direct IPv6 address unless reachability is confirmed. The previously rejected pooler connection is not a successful deployment; verify real TLS and authentication before activation.

After the origin exists, allow its `/auth/callback` in Supabase, verify `/api/health`, anonymous/forged JWT rejection, real Google identity and membership, and authenticated inbox reading. The pilot disables inbound webhooks and all outbox/Nadia mutation routes regardless of simulation settings. A pilot with read-only data is not a deployed worker or a live WhatsApp integration.

LiveManager activation is a separate PR and build configuration. Publish its entry only after this deployment and Claude review pass. No paid resource provisioning is part of this change.
