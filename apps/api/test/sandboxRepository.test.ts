import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { sandboxRepository, type SandboxScope, type StoredSandboxJob } from '../src/lib/sandboxRepository.js';
import { persistSandboxReceipt } from '../src/lib/sandboxReceipts.js';
import { setTimeout as delay } from 'node:timers/promises';

test('PostgreSQL: sandbox claims persist, fence concurrent workers and preserve ambiguous sends', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async t => {
  const schema = `sandbox_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 8, options: `-c search_path=${schema},public` });
  const secondPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 3, options: `-c search_path=${schema},public` });
  // The application's shared pool also handles idle errors. Record these so
  // deliberate backend termination cannot become an unhandled EventEmitter error.
  const idleErrors: Error[] = [];
  pool.on('error', error => idleErrors.push(error));
  secondPool.on('error', error => idleErrors.push(error));
  const user = randomUUID();
  async function seed() {
    const organizationId = randomUUID(), storeId = randomUUID(), channelId = randomUUID(), conversationId = randomUUID(), contactId = randomUUID();
    await pool.query("insert into organizations(id,name) values($1,'Synthetic sandbox')", [organizationId]);
    await pool.query("insert into organization_members(organization_id,user_id,role) values($1,$2,'agent')", [organizationId, user]);
    await pool.query("insert into stores(id,organization_id,name) values($1,$2,'Synthetic')", [storeId, organizationId]);
    await pool.query("insert into channel_connections(id,organization_id,store_id,provider,external_account_id) values($1,$2,$3,'whatsapp',$4)", [channelId, organizationId, storeId, randomUUID()]);
    await pool.query('insert into contacts(id,organization_id,store_id) values($1,$2,$3)', [contactId, organizationId, storeId]);
    await pool.query('insert into conversations(id,organization_id,store_id,channel_connection_id,contact_id) values($1,$2,$3,$4,$5)', [conversationId, organizationId, storeId, channelId, contactId]);
    const scope: SandboxScope = { organizationId, storeId, channelId };
    const repo = sandboxRepository(pool, scope), otherWorker = sandboxRepository(secondPool, scope);
    const input = () => ({ conversationId, requestedBy: user, idempotencyKey: randomUUID(), recipient: '+56912345678', body: 'Synthetic sandbox', maxAttempts: 2 });
    return { scope, repo, otherWorker, input };
  }
  const ref = (job: StoredSandboxJob | null) => { assert(job?.claimToken); return { id: job.id, version: job.version, claimToken: job.claimToken }; };
  const expire = (id: string) => pool.query("update sandbox_dispatch set lease_until=clock_timestamp()-interval '1 second' where id=$1", [id]);
  try {
    await admin.query(`create schema ${schema}`);
    for (const name of ['001_initial.sql', '002_message_processing.sql', '003_inbox_read_index.sql', '004_simulated_outbox.sql', '005_sandbox_dispatch.sql', '006_sandbox_receipts.sql', '007_nadia_simulation.sql']) {
      await pool.query(await readFile(new URL(`../../../packages/database/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await t.test('enqueue is idempotent across connections and rejects cross-scope/channel data', async () => {
      const f = await seed(), other = await seed(), input = f.input();
      const results = await Promise.all([f.repo.enqueue(input), f.otherWorker.enqueue(input)]);
      assert.equal(results[0].job.id, results[1].job.id);
      assert.equal(results[0].job.body, input.body);
      assert.equal(results[0].job.recipient, input.recipient);
      assert.equal(results.filter(result => result.created).length, 1);
      await assert.rejects(f.repo.enqueue({ ...input, body: 'Different body' }), /idempotency conflict/);
      await assert.rejects(f.repo.enqueue({ ...input, recipient: '+56999999999' }), /idempotency conflict/);
      await assert.rejects(f.repo.enqueue({ ...input, idempotencyKey: randomUUID(), requestedBy: randomUUID() }), /not an organization member/);
      await assert.rejects(other.repo.enqueue(input));
      const extraChannel = randomUUID();
      await pool.query("insert into channel_connections(id,organization_id,store_id,provider,external_account_id) values($1,$2,$3,'whatsapp',$4)", [extraChannel, f.scope.organizationId, f.scope.storeId, randomUUID()]);
      const wrongChannel = sandboxRepository(pool, { ...f.scope, channelId: extraChannel });
      await assert.rejects(wrongChannel.enqueue({ ...input, idempotencyKey: randomUUID() }));
      assert.equal(await wrongChannel.claim(), null);
      assert.equal(await other.repo.claim(), null);
      assert.equal((await pool.query("select relrowsecurity from pg_class where oid='sandbox_dispatch'::regclass")).rows[0].relrowsecurity, true);
    });
    await t.test('only one worker claims a job; a locked row does not block other jobs', async () => {
      const f = await seed();
      const first = (await f.repo.enqueue(f.input())).job;
      const claims = await Promise.all([f.repo.claim(), f.otherWorker.claim()]);
      assert.equal(claims.filter(Boolean).length, 1);
      assert.equal(claims.find(Boolean)?.id, first.id);
      assert.equal(claims.find(Boolean)?.attempts, 0);
      const locked = (await f.repo.enqueue(f.input())).job;
      const available = (await f.repo.enqueue(f.input())).job;
      const blocker = await pool.connect();
      try {
        await blocker.query('begin');
        await blocker.query('select id from sandbox_dispatch where id=$1 for update', [locked.id]);
        assert.equal((await f.otherWorker.claim())?.id, available.id);
      } finally { await blocker.query('rollback'); blocker.release(); }
      assert.equal((await f.repo.claim())?.id, locked.id);
    });
    await t.test('expired pre-send claims recover without attempts and obsolete tokens/versions cannot dispatch', async () => {
      const f = await seed(); await f.repo.enqueue(f.input());
      const oldClaim = await f.repo.claim(); assert(oldClaim);
      assert.deepEqual(await f.repo.recover(), []);
      await expire(oldClaim.id);
      const recovered = await f.otherWorker.recover();
      assert.equal(recovered[0].state, 'queued'); assert.equal(recovered[0].attempts, 0);
      const replacement = await f.otherWorker.claim(); assert(replacement);
      assert.notEqual(replacement.claimToken, oldClaim.claimToken);
      assert.equal(await f.repo.begin(ref(oldClaim)), null);
      assert.equal(await f.repo.begin({ ...ref(replacement), version: replacement.version - 1 }), null);
      const started = await f.otherWorker.begin(ref(replacement)); assert(started);
      assert.equal(started.attempts, 1); assert.equal(started.state, 'dispatching');
      // A separate connection sees committed dispatching; no HTTP occurs under a row lock.
      assert.equal((await secondPool.query('select state from sandbox_dispatch where id=$1', [started.id])).rows[0].state, 'dispatching');
      assert.equal(await f.repo.begin(ref(replacement)), null);
      await expire(started.id);
      assert.equal(await f.repo.complete(ref(started), { kind: 'accepted', providerMessageId: 'wamid.late' }), null);
      assert.equal((await f.repo.recover())[0].state, 'unknown');
      assert.equal(await f.otherWorker.claim(), null);
    });
    await t.test('retry delay and cap persist; acceptance is terminal and scoped completions cannot cross tenants', async () => {
      const f = await seed(), other = await seed(); await f.repo.enqueue(f.input());
      let started = await f.repo.begin(ref(await f.repo.claim())); assert(started);
      assert.equal(await other.repo.complete(ref(started), { kind: 'unknown' }), null);
      const retry = await f.repo.complete(ref(started), { kind: 'definitely_not_sent', retryable: true, retryAfterMs: 60000 }, 1000); assert(retry);
      assert.equal(retry.state, 'retry_wait');
      assert.equal(await f.repo.claim(), null);
      await pool.query("update sandbox_dispatch set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1", [retry.id]);
      started = await f.repo.begin(ref(await f.repo.claim())); assert(started);
      const failed = await f.repo.complete(ref(started), { kind: 'definitely_not_sent', retryable: true });
      assert.equal(failed?.state, 'failed'); assert.equal(failed?.attempts, 2);
      assert.equal(await f.repo.claim(), null);
      await f.repo.enqueue(f.input());
      started = await f.repo.begin(ref(await f.repo.claim())); assert(started);
      const accepted = await f.repo.complete(ref(started), { kind: 'accepted', providerMessageId: 'wamid.synthetic' });
      assert.equal(accepted?.state, 'accepted'); assert.equal(accepted?.providerMessageId, 'wamid.synthetic');
      assert.equal(await f.repo.complete(ref(started), { kind: 'unknown' }), null);
      assert.equal(await f.repo.claim(), null);
    });
    await t.test('concurrent delivery receipts converge without duplicates or cross-channel updates', async () => {
      const f = await seed(), input = f.input(), messageId = 'wamid.concurrent-receipt';
      const queued = await f.repo.enqueue(input);
      const started = await f.repo.begin(ref(await f.repo.claim())); assert(started);
      await f.repo.complete(ref(started), { kind: 'accepted', providerMessageId: messageId });
      const channel = (await pool.query('select external_account_id from channel_connections where id=$1', [f.scope.channelId])).rows[0].external_account_id;
      const receiptPids: number[] = [];
      async function receipt(status: 'read' | 'delivered', db: Pool) {
        const client = await db.connect();
        try {
          receiptPids.push((await client.query('select pg_backend_pid() as pid')).rows[0].pid);
          await client.query('begin');
          await persistSandboxReceipt(client, f.scope.organizationId, f.scope.storeId, { providerMessageId: messageId, recipient: input.recipient,
            status, occurredAt: new Date('2026-01-01T00:00:00Z'), errorCode: null, phoneId: channel });
          await client.query('commit');
        } catch (error) { await client.query('rollback'); throw error; }
        finally { client.release(); }
      }
      const blocker = await pool.connect();
      await blocker.query('begin');
      await blocker.query('select id from sandbox_dispatch where id=$1 for update', [queued.job.id]);
      const competing = Promise.all([receipt('delivered', pool), receipt('read', secondPool)]);
      try {
        const deadline = Date.now() + 5000;
        let waiting = 0;
        while (Date.now() < deadline) {
          waiting = (await admin.query("select count(*)::int as count from pg_stat_activity where pid=any($1::int[]) and wait_event_type='Lock'", [receiptPids])).rows[0].count;
          if (waiting === 2) break;
          await delay(10);
        }
        assert.equal(waiting, 2, 'both receipt transactions must wait rather than skip the message lock');
      } finally { await blocker.query('rollback'); blocker.release(); await competing; }
      assert.equal((await pool.query('select delivery_status from sandbox_dispatch where id=$1', [queued.job.id])).rows[0].delivery_status, 'read');
      await Promise.all([receipt('read', pool), receipt('read', secondPool)]);
      assert.equal((await pool.query('select delivery_status from sandbox_dispatch where id=$1', [queued.job.id])).rows[0].delivery_status, 'read');
      assert.equal((await pool.query('select count(*)::int as count from sandbox_receipts where provider_message_id=$1', [messageId])).rows[0].count, 2);
      const foreign = await seed();
      const foreignQueued = await foreign.repo.enqueue(foreign.input());
      const foreignStarted = await foreign.repo.begin(ref(await foreign.repo.claim())); assert(foreignStarted);
      await foreign.repo.complete(ref(foreignStarted), { kind: 'accepted', providerMessageId: messageId });
      assert.equal(await foreign.repo.reconcileReceipts(), 0);
      assert.equal((await pool.query('select delivery_status from sandbox_dispatch where id=$1', [foreignQueued.job.id])).rows[0].delivery_status, null);
    });
    await t.test('connection loss rolls back enqueue and the pool can retry the same key safely', async () => {
      const f = await seed(), input = { ...f.input(), body: 'Disconnect fixture' };
      await pool.query(`create function disconnect_sandbox_enqueue() returns trigger language plpgsql as $$ begin
        if new.body='Disconnect fixture' then perform pg_terminate_backend(pg_backend_pid()); end if; return new; end $$;
        create trigger disconnect_enqueue before insert on sandbox_dispatch for each row execute function disconnect_sandbox_enqueue()`);
      try {
        await assert.rejects(f.repo.enqueue(input));
        assert.equal((await pool.query('select count(*)::int as count from sandbox_dispatch where idempotency_key=$1', [input.idempotencyKey])).rows[0].count, 0);
      } finally { await pool.query('drop trigger disconnect_enqueue on sandbox_dispatch; drop function disconnect_sandbox_enqueue()'); }
      assert.equal((await f.repo.enqueue(input)).created, true);
      assert.equal((await f.otherWorker.enqueue(input)).created, false);
    });
    await t.test('failure persisting a provider acknowledgement leaves dispatch durable and recovers as unknown', async () => {
      const f = await seed(); await f.repo.enqueue(f.input());
      const started = await f.repo.begin(ref(await f.repo.claim())); assert(started);
      await pool.query(`create function reject_sandbox_ack() returns trigger language plpgsql as $$ begin
        if new.state='accepted' then raise exception 'Synthetic persistence failure'; end if; return new; end $$;
        create trigger reject_ack before update on sandbox_dispatch for each row execute function reject_sandbox_ack()`);
      try {
        await assert.rejects(f.repo.complete(ref(started), { kind: 'accepted', providerMessageId: 'wamid.failedcommit' }));
        assert.equal((await pool.query('select state,version from sandbox_dispatch where id=$1', [started.id])).rows[0].state, 'dispatching');
        await expire(started.id);
        assert.equal((await f.otherWorker.recover())[0].state, 'unknown');
        assert.equal(await f.repo.claim(), null);
      } finally { await pool.query('drop trigger reject_ack on sandbox_dispatch; drop function reject_sandbox_ack()'); }
      assert.equal((await pool.query("select count(*)::int as count from messages where direction='out'")).rows[0].count, 0);
    });
    assert(idleErrors.every(error => error.message === 'Connection terminated unexpectedly'));
  } finally {
    await secondPool.end(); await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`); await admin.end();
  }
});
