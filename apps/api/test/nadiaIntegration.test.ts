import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import { Pool } from 'pg';
import { webhookSaver } from '../src/lib/saveWebhook.js';
import { processNext } from '../src/lib/processInbox.js';
import { processNextOutbox } from '../src/lib/processOutbox.js';
import { processNextNadia, type NadiaWorkerOptions } from '../src/lib/processNadia.js';
import { NadiaInferenceError, type NadiaResult } from '../src/lib/nadiaNim.js';
import { authentication } from '../src/middleware/authorization.js';
import { nadiaRouter } from '../src/routes/nadia.js';

test('PostgreSQL: Nadia inbox, idempotency, conversation pause, fencing and simulated outbox', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const schema = `nadia_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 8, options: `-c search_path=${schema},public` });
  const org = randomUUID(), store = randomUUID(), user = randomUUID(), agent = randomUUID();
  const otherOrg = randomUUID(), otherStore = randomUUID();
  const inboxOptions = { maxAttempts: 2, retrySeconds: 1, timeoutMs: 15000, scope: { organizationId: org, storeId: store }, nadiaEnabled: true };
  const workerOptions: NadiaWorkerOptions = { organizationId: org, storeId: store, apiKey: 'synthetic-nvidia-key', model: 'synthetic-free-model', timeoutMs: 100, minIntervalMs: 1000,
    infer: async options => ({ text: options.firstContact ? 'Soy Nadia, asistente virtual con inteligencia artificial. ¿En qué puedo ayudarte?' : '¿Qué color necesitas?', model: options.model }) };
  const app = express(); app.use(express.json());
  app.use('/api', nadiaRouter(pool, authentication(pool, async token => token === 'admin' ? { id: user, email: 'admin@example.invalid' } : token === 'agent' ? { id: agent, email: 'agent@example.invalid' } : null,
    new Set(['admin@example.invalid', 'agent@example.invalid']), org, store), true));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const api = (path: string, enabled?: boolean, token = 'admin') => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method: enabled === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: enabled === undefined ? undefined : JSON.stringify({ enabled }),
  });
  const save = webhookSaver(pool, org, store);
  async function incoming(body: string, from = '56912345678', external = randomUUID()) {
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'nadia-phone' },
      messages: [{ id: external, from, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body } }],
    } }] }] };
    await save(Buffer.from(JSON.stringify(payload)), payload); await processNext(pool, inboxOptions);
    const message = (await pool.query('select id,conversation_id from messages where organization_id=$1 and external_message_id=$2', [org, external])).rows[0];
    assert(message); return { ...message, payload, external };
  }
  async function tick(options = workerOptions) {
    await pool.query("update nadia_settings set last_started_at=now()-interval '2 seconds' where organization_id=$1 and store_id=$2", [org, store]);
    return processNextNadia(pool, options);
  }
  try {
    await admin.query(`create schema ${schema}`);
    for (const file of ['001_initial.sql', '002_message_processing.sql', '003_inbox_read_index.sql', '004_simulated_outbox.sql', '005_sandbox_dispatch.sql', '006_sandbox_receipts.sql', '007_nadia_simulation.sql']) {
      await pool.query(await readFile(new URL(`../../../packages/database/migrations/${file}`, import.meta.url), 'utf8'));
    }
    await pool.query("insert into organizations(id,name) values($1,'Nadia test'),($2,'Foreign')", [org, otherOrg]);
    await pool.query("insert into stores(id,organization_id,name) values($1,$2,'Test'),($3,$4,'Foreign')", [store, org, otherStore, otherOrg]);
    await pool.query("insert into organization_members values($1,$2,'admin'),($1,$3,'agent')", [org, user, agent]);
    await pool.query("insert into channel_connections(organization_id,store_id,provider,external_account_id) values($1,$2,'whatsapp','nadia-phone')", [org, store]);
    await t.test('a repeated inbound message creates exactly one generation and one attributed simulation', async () => {
      const first = await incoming('Hola, ¿qué colores tienen?');
      const varied = { ...first.payload, redelivery_marker: true };
      await save(Buffer.from(JSON.stringify(varied)), varied); await processNext(pool, inboxOptions);
      assert.equal((await pool.query('select count(*)::int as count from nadia_runs')).rows[0].count, 1);
      assert.equal(await tick(), true); assert.equal(await tick(), false);
      const output = (await pool.query('select * from message_outbox')).rows[0];
      assert.equal(output.origin, 'nadia'); assert.equal(output.requested_by, null); assert.match(output.body, /asistente virtual con inteligencia artificial/);
      assert.equal(await processNextOutbox(pool, inboxOptions), true);
      assert.equal((await pool.query('select status from message_outbox')).rows[0].status, 'simulated');
      assert.equal((await pool.query("select count(*)::int as count from messages where direction='out'")).rows[0].count, 0);
      const second = await incoming('¿Y en azul?');
      let firstContact = true;
      await tick({ ...workerOptions, infer: async options => { firstContact = options.firstContact; assert.equal(options.messages.at(-1)?.content, '¿Y en azul?'); assert(options.messages.some(message => message.role === 'assistant')); return { text: 'No tengo inventario confirmado. ¿Qué tipo de lana buscas?', model: options.model }; } });
      assert.equal(firstContact, false);
      assert.equal((await api(`/conversations/${second.conversation_id}/nadia`)).status, 200);
    });
    await t.test('pause is per conversation, cancels queued AI output and preserves manual simulation', async () => {
      const first = await incoming('Pausa esta conversación');
      await tick();
      assert.equal((await api(`/conversations/${first.conversation_id}/nadia`, false)).status, 200);
      assert.equal((await pool.query("select count(*)::int as count from message_outbox where origin='nadia' and status in ('pending','retrying')")).rows[0].count, 0);
      const paused = await incoming('Mensaje mientras está pausada');
      assert.equal((await pool.query('select state from nadia_runs where source_message_id=$1', [paused.id])).rows[0].state, 'cancelled');
      const other = await incoming('Otra conversación sigue activa', '56911111111');
      assert.equal((await pool.query('select state from nadia_runs where source_message_id=$1', [other.id])).rows[0].state, 'pending');
      await tick();
      await pool.query("insert into message_outbox(organization_id,store_id,conversation_id,requested_by,idempotency_key,body) values($1,$2,$3,$4,$5,'Manual unaffected')", [org, store, first.conversation_id, user, randomUUID()]);
      while (await processNextOutbox(pool, inboxOptions)) { /* Drain only deterministic simulations. */ }
      assert.equal((await pool.query("select status from message_outbox where body='Manual unaffected'")).rows[0].status, 'simulated');
      assert.equal((await api(`/conversations/${first.conversation_id}/nadia`, true)).status, 200);
    });
    await t.test('pause and resume during inference discards the old answer and serializes workers', async () => {
      const source = await incoming('Consulta durante inferencia');
      let entered!: () => void, finish!: (result: NadiaResult) => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const processing = tick({ ...workerOptions, infer: () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
      await started;
      assert.equal(await processNextNadia(pool, workerOptions), false);
      assert.equal((await api(`/conversations/${source.conversation_id}/nadia`, false)).status, 200);
      assert.equal((await api(`/conversations/${source.conversation_id}/nadia`, true)).status, 200);
      finish({ text: 'Must not be queued after pause', model: workerOptions.model }); await processing;
      assert.equal((await pool.query('select state from nadia_runs where source_message_id=$1', [source.id])).rows[0].state, 'cancelled');
      assert.equal((await pool.query("select count(*)::int as count from message_outbox where body='Must not be queued after pause'")).rows[0].count, 0);
    });
    await t.test('quota errors retry at most twice and never create fallback replies', async () => {
      const source = await incoming('Pregunta sin respuesta'); let calls = 0;
      const failing = { ...workerOptions, infer: async () => { calls++; throw new NadiaInferenceError('rate_limit'); } };
      await tick(failing);
      assert.equal(await processNextNadia(pool, failing), false);
      await pool.query("update nadia_runs set next_attempt_at=now()-interval '1 second' where source_message_id=$1", [source.id]);
      await tick(failing); assert.equal(calls, 2);
      const run = (await pool.query('select state,error_category from nadia_runs where source_message_id=$1', [source.id])).rows[0];
      assert.deepEqual(run, { state: 'failed', error_category: 'rate_limit' });
      assert.equal((await pool.query('select count(*)::int as count from message_outbox o join nadia_runs r on r.id=o.nadia_run_id where r.source_message_id=$1', [source.id])).rows[0].count, 0);
    });
    await t.test('agents can inspect but only admins manage; tenant selectors and global pause are absent', async () => {
      const conversation = (await pool.query('select id from conversations where organization_id=$1 limit 1', [org])).rows[0].id;
      const read = await api(`/conversations/${conversation}/nadia`, undefined, 'agent'); assert.equal(read.status, 200); assert.equal((await read.json()).canManage, false);
      assert.equal((await api(`/conversations/${conversation}/nadia`, false, 'agent')).status, 403);
      assert.equal((await api(`/conversations/${randomUUID()}/nadia`)).status, 404);
      assert.equal((await api('/nadia', false)).status, 404);
      assert.equal(await processNextNadia(pool, { ...workerOptions, organizationId: otherOrg, storeId: otherStore }), false);
      assert.equal((await pool.query('select count(*)::int as count from nadia_runs where organization_id=$1', [otherOrg])).rows[0].count, 0);
    });
    await t.test('expired inference claims cannot overwrite the replacement result', async () => {
      const source = await incoming('Verifica recuperación');
      let entered!: () => void, finish!: (reply: NadiaResult) => void;
      const waiting = new Promise<void>(resolve => { entered = resolve; });
      const old = tick({ ...workerOptions, infer: () => { entered(); return new Promise(resolve => { finish = resolve; }); } });
      await waiting;
      await pool.query("update nadia_runs set lease_until=now()-interval '1 second' where source_message_id=$1", [source.id]);
      await tick({ ...workerOptions, infer: async options => ({ text: 'Replacement result', model: options.model }) });
      finish({ text: 'Obsolete result', model: workerOptions.model }); await old;
      const run = (await pool.query('select response,attempt_count from nadia_runs where source_message_id=$1', [source.id])).rows[0];
      assert.equal(run.response, 'Replacement result'); assert.equal(run.attempt_count, 2);
      assert.equal((await pool.query("select count(*)::int as count from message_outbox where body='Obsolete result'")).rows[0].count, 0);
    });
    await t.test('eligible foreign jobs remain untouched and cannot contaminate model context', async () => {
      await pool.query("insert into channel_connections(organization_id,store_id,provider,external_account_id) values($1,$2,'whatsapp','other-phone')", [otherOrg, otherStore]);
      const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'other-phone' }, messages: [{ id: randomUUID(), from: '56999999999', timestamp: '1700000000', type: 'text', text: { body: 'FOREIGN PRIVATE CONTEXT' } }] } }] }] };
      await webhookSaver(pool, otherOrg, otherStore)(Buffer.from(JSON.stringify(body)), body);
      await processNext(pool, { ...inboxOptions, scope: { organizationId: otherOrg, storeId: otherStore } });
      await incoming('Mensaje del tenant correcto');
      await tick({ ...workerOptions, infer: async options => {
        assert(options.messages.every(message => !message.content.includes('FOREIGN PRIVATE CONTEXT')));
        return { text: 'Scoped reply', model: options.model };
      } });
      assert.equal((await pool.query('select state from nadia_runs where organization_id=$1', [otherOrg])).rows[0].state, 'pending');
      assert.equal((await pool.query('select count(*)::int as count from message_outbox where organization_id=$1', [otherOrg])).rows[0].count, 0);
    });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end(); await admin.query(`drop schema if exists ${schema} cascade`); await admin.end();
  }
});
