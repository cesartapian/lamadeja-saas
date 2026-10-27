import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import express from 'express';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { authentication } from '../src/middleware/authorization.js';
import { conversationRouter } from '../src/routes/conversations.js';
import { outboxRouter } from '../src/routes/outbox.js';
import { processNextOutbox } from '../src/lib/processOutbox.js';

const org = '00000000-0000-4000-8000-000000000001', store = '00000000-0000-4000-8000-000000000002';
const user = '00000000-0000-4000-8000-000000000003';
const options = { maxAttempts: 2, retrySeconds: 1, timeoutMs: 15000 };
async function fixture() {
  const db = new PGlite();
  for (const migration of ['001_initial.sql', '002_message_processing.sql', '003_inbox_read_index.sql', '004_simulated_outbox.sql', '005_sandbox_dispatch.sql', '006_sandbox_receipts.sql', '007_nadia_simulation.sql', '008_agent_qualification.sql']) {
    const sql = await readFile(new URL(`../../../packages/database/migrations/${migration}`, import.meta.url), 'utf8');
    await db.exec(sql.replace('create extension if not exists pgcrypto;', ''));
  }
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { ...result, rowCount: result.affectedRows || result.rows.length };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  await query('insert into organizations(id,name) values($1,\'Synthetic\')', [org]);
  await query('insert into stores(id,organization_id,name) values($1,$2,\'Synthetic\')', [store, org]);
  await query('insert into organization_members values($1,$2,\'agent\')', [org, user]);
  const channel = randomUUID(), contact = randomUUID(), conversation = randomUUID();
  await query("insert into channel_connections(id,organization_id,store_id,provider,external_account_id) values($1,$2,$3,'whatsapp','synthetic')", [channel, org, store]);
  await query('insert into contacts(id,organization_id,store_id) values($1,$2,$3)', [contact, org, store]);
  await query('insert into conversations(id,organization_id,store_id,channel_connection_id,contact_id) values($1,$2,$3,$4,$5)', [conversation, org, store, channel, contact]);
  const enqueue = async (maxAttempts = 2) => {
    const id = randomUUID();
    await query('insert into message_outbox(id,organization_id,store_id,conversation_id,requested_by,idempotency_key,body,max_attempts) values($1,$2,$3,$4,$5,$6,\'Synthetic reply\',$7)', [id, org, store, conversation, user, randomUUID(), maxAttempts]);
    return id;
  };
  return { db, query, pool, conversation, enqueue };
}

test('outbox HTTP: membership, tenant isolation, input limits, opt-in and idempotency', async () => {
  const f = await fixture();
  const app = express(); app.use(express.json());
  let identityLookups = 0;
  const auth = authentication(f.pool, async token => { identityLookups++; return token === 'valid' ? { id: user, email: 'synthetic@example.invalid' } : null; }, new Set(['synthetic@example.invalid']), org, store);
  app.use('/api', outboxRouter(f.pool, auth, { enabled: true, maxAttempts: 2 }));
  app.use('/api', conversationRouter(f.pool, auth));
  app.use('/disabled', outboxRouter(f.pool, auth, { enabled: false, maxAttempts: 2 }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const root = `http://127.0.0.1:${address.port}`;
  const path = `/conversations/${f.conversation}/outbox`;
  const headers = { Authorization: 'Bearer valid', 'Content-Type': 'application/json' };
  const key = randomUUID();
  const post = (value: unknown, prefix = '/api', conversationPath = path) => fetch(root + prefix + conversationPath, { method: 'POST', headers, body: JSON.stringify(value) });
  try {
    const lookupsBefore = identityLookups;
    assert.equal((await fetch(root + '/api/conversations', { headers })).status, 200);
    assert.equal(identityLookups - lookupsBefore, 1, 'existing inbox routes authenticate once');
    assert.equal((await fetch(root + '/api' + path)).status, 401);
    assert.equal((await fetch(root + '/api/outbox/capabilities', { headers })).status, 200);
    assert.deepEqual(await (await fetch(root + '/disabled/outbox/capabilities', { headers })).json(), { mode: 'disabled', nadia: false });
    assert.equal((await post({ body: 'Hello', idempotencyKey: key }, '/disabled')).status, 503);
    for (const body of ['', '  ', 'x'.repeat(4097)]) assert.equal((await post({ body, idempotencyKey: key })).status, 400);
    assert.equal((await post({ body: 'Reply', idempotencyKey: 'bad' })).status, 400);
    assert.equal((await post({ body: 'Reply', idempotencyKey: key, organizationId: randomUUID() })).status, 400);
    const first = await post({ body: '  Reply  ', idempotencyKey: key });
    assert.equal(first.status, 202); const original = (await first.json()).item;
    const duplicate = await post({ body: 'Reply', idempotencyKey: key });
    assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).item.id, original.id);
    assert.equal((await post({ body: 'Different', idempotencyKey: key })).status, 409);
    assert.equal((await f.query('select * from message_outbox')).rows.length, 1);
    const listed = await (await fetch(root + '/api' + path, { headers })).json();
    assert.equal(listed.items[0].status, 'pending'); assert.equal(listed.items[0].requested_by, undefined);
    assert.equal((await fetch(root + '/api' + path + '?offset=-1', { headers })).status, 400);
    // A second store in the same organization must not expose this conversation.
    const wrongStore = randomUUID();
    await f.query('insert into stores(id,organization_id,name) values($1,$2,\'Other\')', [wrongStore, org]);
    await assert.rejects(f.query('insert into message_outbox(organization_id,store_id,conversation_id,requested_by,idempotency_key,body) values($1,$2,$3,$4,$5,\'Wrong tenant\')', [org, wrongStore, f.conversation, user, randomUUID()]));
    const otherOrg = randomUUID(), foreignStore = randomUUID(), foreignChannel = randomUUID(), foreignContact = randomUUID(), foreignConversation = randomUUID();
    await f.query('insert into organizations(id,name) values($1,\'Other tenant\')', [otherOrg]);
    await f.query('insert into stores(id,organization_id,name) values($1,$2,\'Other\')', [foreignStore, otherOrg]);
    await f.query("insert into channel_connections(id,organization_id,store_id,provider,external_account_id) values($1,$2,$3,'whatsapp','foreign')", [foreignChannel, otherOrg, foreignStore]);
    await f.query('insert into contacts(id,organization_id,store_id) values($1,$2,$3)', [foreignContact, otherOrg, foreignStore]);
    await f.query('insert into conversations(id,organization_id,store_id,channel_connection_id,contact_id) values($1,$2,$3,$4,$5)', [foreignConversation, otherOrg, foreignStore, foreignChannel, foreignContact]);
    const foreignPath = `/conversations/${foreignConversation}/outbox`;
    assert.equal((await fetch(root + '/api' + foreignPath, { headers })).status, 404);
    assert.equal((await post({ body: 'No access', idempotencyKey: randomUUID() }, '/api', foreignPath)).status, 404);
    await f.query('delete from organization_members');
    assert.equal((await post({ body: 'No membership', idempotencyKey: randomUUID() })).status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await f.db.close(); }
});

test('simulation survives retries, stops at the attempt limit, records no real message and respects provider timeouts', async () => {
  const f = await fixture();
  try {
    const id = await f.enqueue();
    assert.equal(await processNextOutbox(f.pool, options), true);
    const simulated = (await f.query('select * from message_outbox where id=$1', [id])).rows[0] as {status:string;simulation_receipt:string;attempt_count:number};
    assert.equal(simulated.status, 'simulated'); assert.equal(simulated.simulation_receipt, `simulation:${id}`); assert.equal(simulated.attempt_count, 1);
    assert.equal(await processNextOutbox(f.pool, options), false);
    assert.equal((await f.query('select * from messages')).rows.length, 0);
    const retry = await f.enqueue();
    const failing = { async simulate(): Promise<string> { throw new Error('private credential/provider response must not be stored'); } };
    await processNextOutbox(f.pool, options, failing);
    const failedOnce = (await f.query('select * from message_outbox where id=$1', [retry])).rows[0] as {status:string;last_error:string;attempt_count:number};
    assert.equal(failedOnce.status, 'retrying'); assert.equal(failedOnce.last_error, 'simulation_failed'); assert.equal(failedOnce.attempt_count, 1);
    assert.equal(await processNextOutbox(f.pool, options), false);
    await f.query('update message_outbox set next_attempt_at=now() where id=$1', [retry]);
    await processNextOutbox(f.pool, options);
    assert.equal(((await f.query('select status from message_outbox where id=$1', [retry])).rows[0] as {status:string}).status, 'simulated');
    const exhausted = await f.enqueue(1);
    await processNextOutbox(f.pool, options, failing);
    assert.equal(((await f.query('select status from message_outbox where id=$1', [exhausted])).rows[0] as {status:string}).status, 'failed');
    assert.equal(await processNextOutbox(f.pool, options), false);
    const hanging = await f.enqueue(1);
    await processNextOutbox(f.pool, { ...options, timeoutMs: 1000 }, { simulate: () => new Promise<string>(() => {}) });
    assert.equal(((await f.query('select status from message_outbox where id=$1', [hanging])).rows[0] as {status:string}).status, 'failed');
    const rls = await f.query("select relrowsecurity from pg_class where relname='message_outbox'");
    assert.equal((rls.rows[0] as {relrowsecurity:boolean}).relrowsecurity, true);
  } finally { await f.db.close(); }
});

test('outbox retries recover on the third attempt or stop after five failures', async () => {
  const f = await fixture();
  try {
    const retryOptions = { ...options, retrySeconds: 30 };
    const exhausted = await f.enqueue(5);
    let failures = 0;
    const failing = { async simulate(): Promise<string> { failures++; throw new Error('Synthetic provider failure'); } };
    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.equal(await processNextOutbox(f.pool, retryOptions, failing), true);
      const job = (await f.query(`select status,attempt_count,simulation_receipt,completed_at,
        extract(epoch from (next_attempt_at-updated_at))::integer as delay_seconds
        from message_outbox where id=$1`, [exhausted])).rows[0] as {
        status:string;attempt_count:number;simulation_receipt:string|null;completed_at:Date|null;delay_seconds:number;
      };
      assert.equal(job.attempt_count, attempt);
      assert.equal(job.status, attempt < 5 ? 'retrying' : 'failed');
      assert.equal(job.simulation_receipt, null); assert.equal(job.completed_at, null);
      if (attempt < 5) {
        assert.equal(job.delay_seconds, [30, 60, 120, 240][attempt - 1]);
        assert.equal(await processNextOutbox(f.pool, retryOptions, failing), false, 'backoff prevents immediate retries');
      }
      // Advance eligibility only in this isolated fixture; never change live jobs.
      await f.query('update message_outbox set next_attempt_at=now() where id=$1', [exhausted]);
    }
    assert.equal(failures, 5);
    assert.equal(await processNextOutbox(f.pool, retryOptions, failing), false, 'terminal failure cannot be claimed a sixth time');
    assert.equal(failures, 5);

    const recovered = await f.enqueue(5);
    let attempts = 0;
    const intermittent = { async simulate(job: {id:string}): Promise<string> {
      attempts++;
      if (attempts < 3) throw new Error('Synthetic transient failure');
      return `simulation:${job.id}`;
    } };
    for (let attempt = 1; attempt <= 3; attempt++) {
      assert.equal(await processNextOutbox(f.pool, retryOptions, intermittent), true);
      const job = (await f.query('select status,attempt_count,last_error,simulation_receipt from message_outbox where id=$1', [recovered])).rows[0] as {
        status:string;attempt_count:number;last_error:string|null;simulation_receipt:string|null;
      };
      assert.equal(job.status, attempt < 3 ? 'retrying' : 'simulated');
      assert.equal(job.attempt_count, attempt);
      if (attempt < 3) {
        assert.equal(await processNextOutbox(f.pool, retryOptions, intermittent), false);
        await f.query('update message_outbox set next_attempt_at=now() where id=$1', [recovered]);
      } else {
        assert.equal(job.last_error, null);
        assert.equal(job.simulation_receipt, `simulation:${recovered}`);
      }
    }
    assert.equal(await processNextOutbox(f.pool, retryOptions, intermittent), false, 'successful simulation must not be retried');
    assert.equal(attempts, 3);
    assert.equal((await f.query("select * from messages where direction='out'")).rows.length, 0);
  } finally { await f.db.close(); }
});

test('a scoped outbox worker leaves another tenant or store queue untouched', async () => {
  const f = await fixture();
  try {
    const id = await f.enqueue();
    assert.equal(await processNextOutbox(f.pool, { ...options, scope: { organizationId: randomUUID(), storeId: store } }), false);
    assert.equal(await processNextOutbox(f.pool, { ...options, scope: { organizationId: org, storeId: randomUUID() } }), false);
    const before = (await f.query('select status,attempt_count from message_outbox where id=$1', [id])).rows[0];
    assert.deepEqual(before, { status: 'pending', attempt_count: 0 });
    assert.equal(await processNextOutbox(f.pool, { ...options, scope: { organizationId: org, storeId: store } }), true);
  } finally { await f.db.close(); }
});
