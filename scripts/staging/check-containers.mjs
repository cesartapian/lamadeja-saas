import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';
import { buildImages, compose, docker } from './docker.mjs';
import { envFile } from './config.mjs';

// Reproducible packaging test with a disposable PostgreSQL service. Not a claim
// about real Supabase/Google: run-real-smoke.mjs is the separate real-service test.
const directory = await mkdtemp(join(tmpdir(), 'lamadeja-containers-'));
const run = randomUUID().slice(0, 8), project = `lamadeja-container-${run}`;
const org = randomUUID(), store = randomUUID(), otherOrg = randomUUID(), otherStore = randomUUID();
let database, started = false, phase = 'fixture_configuration';
let passed = false;
const syntheticPassword = randomBytes(24).toString('hex'), metaSecret = randomBytes(24).toString('hex');
const runtimeFile = join(directory, '.env.runtime'), overlay = join(directory, 'fixture.json');
const ca = process.env.STAGING_CONTAINER_CA_FILE || process.env.NODE_EXTRA_CA_CERTS;
if (!ca) { console.error('FAIL: set STAGING_CONTAINER_CA_FILE to a trusted public CA PEM for the runtime mount'); process.exit(1); }
const apiPort = '14000', webPort = '15173';
const env = { ...process.env, STAGING_ENV_FILE: runtimeFile, STAGING_CA_FILE: resolve(ca), STAGING_API_PORT: apiPort, STAGING_WEB_PORT: webPort,
  STAGING_API_IMAGE: `lamadeja-api:container-${run}`, STAGING_WEB_IMAGE: `lamadeja-web:container-${run}`,
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'sb_publishable_containerfixture', VITE_API_URL: `http://127.0.0.1:${apiPort}` };
const runCompose = args => compose(project, ['-f', overlay, ...args], env);
const http = path => fetch(`http://127.0.0.1:${apiPort}${path}`, { signal: AbortSignal.timeout(10000) });
const check = (condition, label) => { if (!condition) throw new Error('Check failed'); console.info(`PASS: ${label}`); };
async function until(probe) {
  const until = Date.now() + 45000;
  while (Date.now() < until) { if (await probe()) return; await setTimeout(500); }
  throw new Error('Timed out');
}
try {
  await writeFile(runtimeFile, envFile({ PORT: '4000', WEB_ORIGIN: `http://127.0.0.1:${webPort}`,
    DATABASE_URL: `postgresql://synthetic:${syntheticPassword}@postgres:5432/lamadeja_test`,
    SUPABASE_URL: env.VITE_SUPABASE_URL, SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY, ALLOWED_EMAILS: 'fixture@example.invalid',
    META_APP_SECRET: metaSecret, META_VERIFY_TOKEN: randomBytes(24).toString('hex'),
    MVP_ORGANIZATION_ID: org, MVP_STORE_ID: store, OUTBOX_MODE: 'simulated', WORKER_POLL_MS: '200' }), { mode: 0o600 });
  await writeFile(overlay, JSON.stringify({ services: { postgres: {
    image: 'postgres:16', environment: { POSTGRES_USER: 'synthetic', POSTGRES_PASSWORD: syntheticPassword, POSTGRES_DB: 'lamadeja_test' },
    ports: ['127.0.0.1::5432'], healthcheck: { test: ['CMD-SHELL', 'pg_isready -U synthetic -d lamadeja_test'], interval: '1s', timeout: '3s', retries: 30 },
  } } }), { mode: 0o600 });
  phase = 'container_images';
  await buildImages(env.STAGING_API_IMAGE, env.STAGING_WEB_IMAGE, env);
  phase = 'disposable_database'; started = true;
  await runCompose(['up', '--detach', '--wait', 'postgres']);
  const id = await runCompose(['ps', '-q', 'postgres']);
  const mapped = await docker(['port', id, '5432']);
  const port = Number(mapped.trim().split(':').at(-1));
  if (!Number.isInteger(port)) throw new Error('No fixture port');
  database = new Pool({ connectionString: `postgresql://synthetic:${syntheticPassword}@127.0.0.1:${port}/lamadeja_test`, connectionTimeoutMillis: 5000 });
  for (const file of ['001_initial.sql', '002_message_processing.sql', '003_inbox_read_index.sql', '004_simulated_outbox.sql', '005_sandbox_dispatch.sql', '006_sandbox_receipts.sql']) {
    await database.query(await readFile(`packages/database/migrations/${file}`, 'utf8'));
  }
  for (const [organization, shop] of [[org, store], [otherOrg, otherStore]]) {
    await database.query('insert into organizations(id,name) values($1,\'Container fixture\')', [organization]);
    await database.query('insert into stores(id,organization_id,name) values($1,$2,\'Fixture\')', [shop, organization]);
    const channel = (await database.query("insert into channel_connections(organization_id,store_id,provider,external_account_id) values($1,$2,'whatsapp',$3) returning id", [organization, shop, organization === org ? 'container-phone' : 'other-phone'])).rows[0].id;
    const contact = (await database.query('insert into contacts(organization_id,store_id) values($1,$2) returning id', [organization, shop])).rows[0].id;
    const conversation = (await database.query('insert into conversations(organization_id,store_id,channel_connection_id,contact_id) values($1,$2,$3,$4) returning id', [organization, shop, channel, contact])).rows[0].id;
    await database.query("insert into message_outbox(organization_id,store_id,conversation_id,requested_by,idempotency_key,body) values($1,$2,$3,$4,$5,'Container simulation')", [organization, shop, conversation, randomUUID(), randomUUID()]);
  }
  phase = 'application_readiness';
  await runCompose(['up', '--no-build', '--detach', '--wait', '--wait-timeout', '120']);
  check((await http('/health')).status === 200 && (await http('/ready')).status === 200, 'compiled API liveness and database readiness');
  check((await http('/api/me')).status === 401, 'anonymous API access denied');
  const web = await fetch(`http://127.0.0.1:${webPort}/auth/callback`, { signal: AbortSignal.timeout(10000) });
  const html = await web.text();
  check(web.status === 200 && html.includes('id="root"'), 'compiled web serves PKCE callback SPA');
  const assetPath = html.match(/src="(\/assets\/[^"\s]+\.js)"/)?.[1];
  if (!assetPath) throw new Error('Compiled JavaScript asset missing');
  for (const path of ['/', '/auth/callback', assetPath, '/assets/missing-fixture.js']) {
    const response = await fetch(`http://127.0.0.1:${webPort}${path}`, { signal: AbortSignal.timeout(10000) });
    check(response.status === (path.includes('missing-fixture') ? 404 : 200)
      && response.headers.get('X-Content-Type-Options') === 'nosniff'
      && response.headers.get('X-Frame-Options') === 'DENY'
      && response.headers.get('Referrer-Policy') === 'no-referrer', `web security headers present on ${path}`);
    if (path === '/' || path === '/auth/callback') check(response.headers.get('Cache-Control') === 'no-store', `SPA cache disabled on ${path}`);
    if (path === assetPath) check(response.headers.get('Cache-Control')?.includes('immutable'), 'compiled assets retain immutable cache');
    await response.arrayBuffer();
  }
  const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: 'container-phone' }, messages: [{ id: 'container-message', from: '00000000000', timestamp: '1700000000', type: 'text', text: { body: 'Container smoke' } }],
  } }] }] });
  const accepted = await fetch(`http://127.0.0.1:${apiPort}/webhooks/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', metaSecret).update(payload).digest('hex') }, body: payload, signal: AbortSignal.timeout(10000) });
  check(accepted.status === 200, 'signed event durably accepted');
  await until(async () => Number((await database.query('select count(*) from messages where organization_id=$1', [org])).rows[0].count) === 1);
  check(true, 'compiled inbox worker processed the event');
  await until(async () => (await database.query('select status from message_outbox where organization_id=$1', [org])).rows[0].status === 'simulated');
  check((await database.query('select status,attempt_count from message_outbox where organization_id=$1', [otherOrg])).rows[0].status === 'pending', 'compiled outbox worker respects configured tenant');
  check(Number((await database.query("select count(*) from messages where direction='out'")).rows[0].count) === 0, 'no real outbound messages');
  phase = 'graceful_shutdown';
  const serviceIds = {};
  for (const service of ['api', 'inbox', 'outbox']) serviceIds[service] = await runCompose(['ps', '-q', service]);
  await runCompose(['stop', '--timeout', '30', 'api', 'inbox', 'outbox']);
  for (const [service, container] of Object.entries(serviceIds)) {
    check(await docker(['inspect', '--format', '{{.State.ExitCode}}', container]) === '0', `${service} exits cleanly on SIGTERM`);
  }
  phase = 'database_failure_readiness';
  await runCompose(['up', '--no-build', '--detach', '--wait', '--wait-timeout', '90', 'api', 'inbox', 'outbox']);
  await database.end(); database = null;
  await runCompose(['stop', '--timeout', '10', 'postgres']);
  await until(async () => (await http('/ready')).status === 503);
  check((await http('/health')).status === 200, 'liveness stays distinct from failed database readiness');
  for (const service of ['inbox', 'outbox']) {
    const container = await runCompose(['ps', '-q', service]);
    await until(async () => (await docker(['exec', container, 'node', '-e', "fetch('http://127.0.0.1:4001/ready').then(r=>console.log(r.status))"])) === '503');
    check(true, `${service} readiness fails after database loss`);
  }
  phase = 'database_recovery_readiness';
  await runCompose(['up', '--detach', '--wait', 'postgres']);
  await until(async () => (await http('/ready')).status === 200);
  for (const service of ['inbox', 'outbox']) {
    const container = await runCompose(['ps', '-q', service]);
    await until(async () => (await docker(['exec', container, 'node', '-e', "fetch('http://127.0.0.1:4001/ready').then(r=>console.log(r.status))"])) === '200');
  }
  check(true, 'API and workers recover readiness after PostgreSQL returns');
  passed = true;
} catch (error) {
  console.error(`FAIL: disposable container runtime check at phase ${phase}`);
  // All containers in this suite contain synthetic fixtures only. Print bounded
  // infrastructure diagnostics with fixture secrets removed; never use this for real smoke.
  const redact = value => String(value || '').replaceAll(syntheticPassword, '[redacted]').replaceAll(metaSecret, '[redacted]');
  console.error(redact(error.stderr || error.code || 'runtime failure').slice(-2000));
  for (const service of ['api', 'inbox', 'outbox', 'web']) {
    try { console.error(`${service}: ` + redact(await runCompose(['logs', '--no-color', '--tail', '12', service])).slice(-2000)); } catch {}
  }
}
finally {
  if (database) await database.end().catch(() => {});
  if (started) await runCompose(['down', '--volumes', '--remove-orphans', '--timeout', '15']).catch(() => { passed = false; });
  await rm(directory, { recursive: true, force: true });
  process.exitCode = passed ? 0 : 1;
}
