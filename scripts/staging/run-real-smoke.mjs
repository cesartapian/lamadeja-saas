import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { stagingConfig, envFile, developmentRef } from './config.mjs';
import { buildImages, compose } from './docker.mjs';
import { sandboxRepository } from '../../apps/api/dist/lib/sandboxRepository.js';

// This is opt-in to the dedicated development project. No mocks or admin session.
let phase = 'configuration', directory, database, auth, browser, fixtureCreated = false, stackCreated = false, runtimeEnv;
const runId = randomUUID(), organizationId = randomUUID(), storeId = randomUUID(), channelId = randomUUID();
const marker = `Staging smoke ${runId}`, phoneId = `staging-${runId}`;
const project = `lamadeja-smoke-${runId.slice(0, 8)}`, checks = [];
const reportPath = resolve(process.env.STAGING_REPORT_PATH || '.staging-results/summary.json');
const stop = new AbortController();
process.once('SIGINT', () => stop.abort()); process.once('SIGTERM', () => stop.abort());
const check = (condition, name) => { if (!condition) { const error = new Error('Check failed'); error.check = name; throw error; } checks.push(name); };
const safeFetch = (url, options = {}) => fetch(url, { ...options, redirect: 'error', signal: AbortSignal.any([stop.signal, AbortSignal.timeout(10000)]) });
async function until(probe) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    stop.signal.throwIfAborted();
    const result = await probe(); if (result) return result;
    await setTimeout(1000, undefined, { signal: stop.signal });
  }
  throw new Error('Readiness timed out');
}
let passed = false, cleanupComplete = false;
try {
  const config = stagingConfig(process.env);
  const ca = await readFile(config.caFile, 'utf8');
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || ca.includes('PRIVATE KEY')) throw new Error('Invalid CA');
  phase = 'real_supabase_auth';
  auth = createClient(config.authUrl, config.publicKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: safeFetch } });
  const login = await auth.auth.signInWithPassword({ email: config.email, password: config.password });
  const session = login.data.session, user = login.data.user;
  check(!login.error && Boolean(session && user?.email), 'real_test_account_authenticated');
  // Only use the identity actually returned by Auth; never forge user claims.
  phase = 'verified_database_and_schema';
  database = new Pool({ connectionString: config.databaseUrl, max: 2, connectionTimeoutMillis: 10000, query_timeout: 15000 });
  database.on('error', () => { console.error('Database pool disconnected during real staging smoke.'); });
  const connection = await database.connect();
  try { check(connection.connection.stream.encrypted === true && connection.connection.stream.authorized === true, 'database_tls_verified'); }
  finally { connection.release(); }
  const schema = (await database.query(`select to_regclass('public.message_outbox') is not null as outbox,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.message_outbox')),false) as rls`)).rows[0];
  check(schema.outbox && schema.rls, 'development_outbox_schema_present');
  const sandboxSchema = (await database.query(`select to_regclass('public.sandbox_dispatch') is not null as present,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.sandbox_dispatch')),false) as rls,
    to_regclass('public.sandbox_dispatch_due') is not null as due,
    to_regclass('public.sandbox_dispatch_expired') is not null as expired,
    to_regclass('public.sandbox_provider_message_unique') is not null as provider_unique`)).rows[0];
  check(sandboxSchema.present && sandboxSchema.rls && sandboxSchema.due && sandboxSchema.expired && sandboxSchema.provider_unique, 'development_sandbox_005_schema_present');
  const receiptSchema = (await database.query(`select to_regclass('public.sandbox_receipts') is not null as present,
    coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.sandbox_receipts')),false) as rls`)).rows[0];
  check(receiptSchema.present && receiptSchema.rls, 'development_receipts_006_schema_present');
  directory = await mkdtemp(join(tmpdir(), 'lamadeja-real-staging-'));
  const apiPort = Number(process.env.STAGING_API_PORT || 4000), webPort = Number(process.env.STAGING_WEB_PORT || 5173);
  check(Number.isInteger(apiPort) && apiPort > 0 && apiPort <= 65535 && Number.isInteger(webPort) && webPort > 0 && webPort <= 65535, 'valid_fixture_ports');
  const apiUrl = `http://127.0.0.1:${apiPort}`, webUrl = `http://127.0.0.1:${webPort}`;
  const metaSecret = randomBytes(32).toString('hex');
  const values = {
    PORT: '4000', WEB_ORIGIN: webUrl, DATABASE_URL: config.databaseUrl,
    SUPABASE_URL: config.authUrl, SUPABASE_ANON_KEY: config.publicKey,
    ALLOWED_EMAILS: user.email.toLowerCase(), MVP_ORGANIZATION_ID: organizationId, MVP_STORE_ID: storeId,
    META_APP_SECRET: metaSecret, META_VERIFY_TOKEN: randomBytes(32).toString('hex'), OUTBOX_MODE: 'simulated',
    WORKER_POLL_MS: '500', WORKER_TIMEOUT_MS: '15000',
  };
  const runtimeFile = join(directory, '.env.runtime');
  await writeFile(runtimeFile, envFile(values), { mode: 0o600 });
  runtimeEnv = { ...process.env, STAGING_ENV_FILE: runtimeFile, STAGING_CA_FILE: resolve(config.caFile),
    STAGING_API_IMAGE: `lamadeja-api:smoke-${runId}`, STAGING_WEB_IMAGE: `lamadeja-web:smoke-${runId}`,
    STAGING_API_PORT: String(apiPort), STAGING_WEB_PORT: String(webPort),
    VITE_SUPABASE_URL: config.authUrl, VITE_SUPABASE_ANON_KEY: config.publicKey, VITE_API_URL: apiUrl };
  phase = 'container_build';
  await buildImages(runtimeEnv.STAGING_API_IMAGE, runtimeEnv.STAGING_WEB_IMAGE, runtimeEnv);
  phase = 'isolated_tenant_fixture';
  const seed = await database.connect();
  try {
    await seed.query('begin');
    await seed.query('insert into organizations(id,name) values($1,$2)', [organizationId, marker]);
    await seed.query('insert into stores(id,organization_id,name) values($1,$2,$3)', [storeId, organizationId, marker]);
    await seed.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'agent')", [organizationId, user.id]);
    await seed.query("insert into channel_connections(id,organization_id,store_id,provider,external_account_id) values($1,$2,$3,'whatsapp',$4)", [channelId, organizationId, storeId, phoneId]);
    await seed.query('commit'); fixtureCreated = true;
  } catch (error) { await seed.query('rollback'); throw error; }
  finally { seed.release(); }
  phase = 'container_readiness'; stackCreated = true;
  await compose(project, ['up', '--no-build', '--detach', '--wait', '--wait-timeout', '120'], runtimeEnv);
  const request = (path, body, token = session.access_token) => safeFetch(apiUrl + path, {
    method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  phase = 'real_auth_and_scope';
  check((await request('/api/me', undefined, '')).status === 401, 'anonymous_denied');
  check((await request('/api/me', undefined, 'invalid-staging-token')).status === 401, 'invalid_token_denied');
  const meResponse = await request('/api/me'); check(meResponse.status === 200, 'real_identity_authorized');
  const me = await meResponse.json(); check(me.organizationId === organizationId && me.storeId === storeId, 'server_scope_matches_fixture');
  check((await request(`/api/conversations/${randomUUID()}/messages`)).status === 404, 'unknown_conversation_denied');
  phase = 'signed_inbound_processing';
  const message = `Remote smoke ${runId}`;
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: phoneId }, contacts: [{ wa_id: '00000000000', profile: { name: marker } }],
    messages: [{ id: `staging:${runId}`, from: '00000000000', timestamp: String(Math.floor(Date.now()/1000)), type: 'text', text: { body: message } }],
  } }] }] });
  const send = () => safeFetch(apiUrl + '/webhooks/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', metaSecret).update(payload).digest('hex') }, body: payload });
  check((await send()).status === 200, 'signed_event_durably_accepted');
  const duplicate = await send(); check(duplicate.status === 200 && (await duplicate.json()).status === 'duplicate', 'duplicate_delivery_deduplicated');
  const conversation = await until(async () => {
    const response = await request('/api/conversations?limit=100'); check(response.status === 200, 'conversation_query_authorized');
    const rows = (await response.json()).conversations;
    check(rows.every(row => row.organization_id === organizationId && row.store_id === storeId), 'conversation_scope_enforced');
    return rows.find(row => row.contact_name === marker);
  });
  const history = await (await request(`/api/conversations/${conversation.id}/messages`)).json();
  check(history.messages.length === 1 && history.messages[0].body === message, 'worker_persisted_one_incoming_message');
  const contact = await request(`/api/contacts/${conversation.contact_id}`); check(contact.status === 200, 'contact_read_authorized');
  // Exercise the compiled repository on the owned fixture only. No Meta adapter
  // is called: these synthetic outcomes verify durable storage, not delivery.
  phase = 'sandbox_005_persistence';
  const sandbox = sandboxRepository(database, { organizationId, storeId, channelId });
  const sandboxInput = { conversationId: conversation.id, requestedBy: user.id, idempotencyKey: randomUUID(), recipient: '+15555550100', body: `Sandbox persistence ${runId}` };
  const sandboxQueued = await sandbox.enqueue(sandboxInput);
  const sandboxDuplicate = await sandbox.enqueue(sandboxInput);
  check(sandboxQueued.created && !sandboxDuplicate.created && sandboxQueued.job.id === sandboxDuplicate.job.id, 'sandbox_005_idempotency');
  const claimRef = job => {
    check(Boolean(job?.claimToken), 'sandbox_005_claim_owned');
    return { id: job.id, version: job.version, claimToken: job.claimToken };
  };
  const sandboxClaim = await sandbox.claim();
  const sandboxStart = await sandbox.begin(claimRef(sandboxClaim));
  check(sandboxStart?.state === 'dispatching' && sandboxStart.attempts === 1, 'sandbox_005_dispatch_start_persisted');
  check(await sandbox.begin(claimRef(sandboxClaim)) === null, 'sandbox_005_stale_version_rejected');
  const sandboxUnknown = await sandbox.complete(claimRef(sandboxStart), { kind: 'unknown' });
  check(sandboxUnknown?.state === 'unknown' && await sandbox.claim() === null, 'sandbox_005_ambiguous_result_not_retried');
  await sandbox.enqueue({ ...sandboxInput, idempotencyKey: randomUUID() });
  const sandboxAcceptedStart = await sandbox.begin(claimRef(await sandbox.claim()));
  const sandboxAccepted = await sandbox.complete(claimRef(sandboxAcceptedStart), { kind: 'accepted', providerMessageId: `wamid.staging-${runId}` });
  check(sandboxAccepted?.state === 'accepted' && await sandbox.claim() === null, 'sandbox_005_synthetic_acceptance_persisted');
  phase = 'signed_delivery_receipts';
  const receiptEvent = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: phoneId }, statuses: ['read', 'delivered', 'sent', 'failed'].map(status => ({
      id: sandboxAccepted.providerMessageId, recipient_id: sandboxInput.recipient.slice(1), status,
      timestamp: String(Math.floor(Date.now() / 1000)), ...(status === 'failed' ? { errors: [{ code: 131026 }] } : {}),
    })),
  } }] }] });
  const receiptSend = () => safeFetch(apiUrl + '/webhooks/whatsapp', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', metaSecret).update(receiptEvent).digest('hex'),
  }, body: receiptEvent });
  check((await receiptSend()).status === 200, 'signed_delivery_receipts_accepted');
  const receiptDuplicate = await receiptSend();
  check(receiptDuplicate.status === 200 && (await receiptDuplicate.json()).status === 'duplicate', 'delivery_receipt_redelivery_deduplicated');
  await until(async () => (await database.query('select delivery_status from sandbox_dispatch where id=$1 and organization_id=$2', [sandboxAccepted.id, organizationId])).rows[0]?.delivery_status === 'read');
  check(Number((await database.query('select count(*) from sandbox_receipts where organization_id=$1', [organizationId])).rows[0].count) === 4, 'delivery_receipts_durable_and_monotonic');
  check(await sandbox.reconcileReceipts() === 0, 'delivery_reconciliation_idempotent');
  phase = 'simulated_outbox';
  const submission = { body: `Remote reply ${runId}`, idempotencyKey: randomUUID() };
  const created = await request(`/api/conversations/${conversation.id}/outbox`, submission);
  check(created.status === 202, 'reply_durably_enqueued'); const item = (await created.json()).item;
  const repeated = await request(`/api/conversations/${conversation.id}/outbox`, submission);
  check(repeated.status === 200 && (await repeated.json()).item.id === item.id, 'submission_idempotency_verified');
  check((await request(`/api/conversations/${conversation.id}/outbox`, { ...submission, body: 'Conflicting synthetic body' })).status === 409, 'conflicting_idempotency_key_denied');
  await until(async () => {
    const response = await request(`/api/conversations/${conversation.id}/outbox`); check(response.status === 200, 'outbox_read_authorized');
    const row = (await response.json()).items.find(row => row.id === item.id);
    return row?.status === 'simulated';
  });
  check(Number((await database.query("select count(*) from messages where organization_id=$1 and direction='out'", [organizationId])).rows[0].count) === 0, 'no_real_outgoing_messages');
  phase = 'browser_with_real_services';
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  const context = await browser.newContext();
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${developmentRef}-auth-token`, session });
  const page = await context.newPage(); await page.goto(webUrl);
  await page.getByRole('button', { name: new RegExp(marker) }).click();
  await page.locator('.message p').filter({ hasText: message }).waitFor({ state: 'visible', timeout: 20000 });
  await page.getByLabel('Mensaje de prueba', { exact: true }).fill(`Browser reply ${runId}`);
  await page.getByRole('button', { name: 'Simular envío', exact: true }).click();
  const row = page.getByRole('region', { name: 'Bandeja de salida simulada' }).getByRole('listitem').filter({ hasText: `Browser reply ${runId}` });
  await row.getByText('Simulado · sin envío real', { exact: false }).waitFor({ state: 'visible', timeout: 60000 });
  checks.push('browser_real_auth_api_database_and_workers');
  passed = true;
} catch (error) {
  if (typeof error.check === 'string' && /^[a-z_]+$/.test(error.check)) console.error(`Failed check: ${error.check}`);
  // Never dump SDK, SQL, Docker or Playwright errors: they can hold session data.
  console.error(`FAIL: real staging smoke at phase ${phase}. Check protected configuration and service readiness.`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (stackCreated) {
    try { await compose(project, ['down', '--volumes', '--remove-orphans', '--timeout', '30'], runtimeEnv); }
    catch { passed = false; console.error('FAIL: staging container cleanup'); }
  }
  if (fixtureCreated && database) {
    const client = await database.connect().catch(() => null);
    if (client) {
      try {
        await client.query('begin');
        const owned = await client.query('select id from organizations where id=$1 and name=$2 for update', [organizationId, marker]);
        if (owned.rowCount !== 1) throw new Error('Fixture ownership mismatch');
        for (const table of ['sandbox_receipts', 'sandbox_dispatch', 'message_outbox', 'webhook_inbox', 'messages', 'conversations', 'contacts', 'channel_connections', 'organization_members', 'stores']) {
          await client.query(`delete from ${table} where organization_id=$1`, [organizationId]);
        }
        await client.query('delete from organizations where id=$1 and name=$2', [organizationId, marker]);
        await client.query('commit'); cleanupComplete = true;
      } catch { await client.query('rollback').catch(() => {}); passed = false; console.error('FAIL: staging fixture cleanup'); }
      finally { client.release(); }
    } else { passed = false; console.error('FAIL: staging fixture cleanup connection'); }
  } else { cleanupComplete = true; }
  if (auth) await auth.auth.signOut({ scope: 'local' }).catch(() => {});
  if (database) await database.end().catch(() => {});
  if (directory) await rm(directory, { recursive: true, force: true });
  await mkdir(resolve(reportPath, '..'), { recursive: true });
  await writeFile(reportPath, JSON.stringify({ status: passed ? 'passed' : 'failed', phase, run_id: runId, project_ref: developmentRef, checks: [...new Set(checks)], fixture_cleanup_complete: cleanupComplete, real_whatsapp_sent: false }, null, 2));
  if (passed) console.info('PASS: remote development Auth, API, database, workers and browser verified; test fixture removed.');
  process.exitCode = passed ? 0 : 1;
}
