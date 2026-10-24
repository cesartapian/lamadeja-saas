import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { processNext } from '../src/lib/processInbox.js';

test('PostgreSQL: independent workers skip locked rows and recover disconnected transactions', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  // Explicit opt-in only. A random schema isolates every run in a disposable DB.
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5, options: `-c search_path=${schema},public` });
  const org = randomUUID(), store = randomUUID();
  const options = { maxAttempts: 3, retrySeconds: 1, timeoutMs: 15000 };
  try {
    await admin.query(`create schema ${schema}`);
    for (const name of ['001_initial.sql', '002_message_processing.sql', '003_inbox_read_index.sql']) {
      await pool.query(await readFile(new URL(`../../../packages/database/migrations/${name}`, import.meta.url), 'utf8'));
    }
    await pool.query('insert into organizations(id,name) values($1,\'Synthetic\')', [org]);
    await pool.query('insert into stores(id,organization_id,name) values($1,$2,\'Synthetic\')', [store, org]);
    await pool.query("insert into channel_connections(organization_id,store_id,provider,external_account_id) values($1,$2,'whatsapp','phone')", [org, store]);
    const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: 'phone' }, messages: [{ id: 'same-message', from: '56912345678', timestamp: '1700000000', type: 'text', text: { body: 'Synthetic' } }],
    } }] }] };
    for (const external of ['delivery-a', 'delivery-b']) await pool.query("insert into webhook_inbox(organization_id,store_id,provider,external_event_id,payload) values($1,$2,'whatsapp',$3,$4)", [org, store, external, payload]);
    const blocker = await pool.connect();
    await blocker.query('begin');
    const locked = await blocker.query('select id from webhook_inbox order by received_at,id for update limit 1');
    await blocker.query("update webhook_inbox set status='processing' where id=$1", [locked.rows[0].id]);
    // Other worker must process the second row without waiting for the first.
    assert.equal(await processNext(pool, options), true);
    // Dropping the connection rolls back its processing claim.
    blocker.release(true);
    assert.equal(await processNext(pool, options), true);
    assert.equal((await pool.query('select * from messages')).rowCount, 1);
    assert.equal((await pool.query("select * from webhook_inbox where status='processed'")).rowCount, 2);
    for (const external of ['delivery-c', 'delivery-d']) await pool.query("insert into webhook_inbox(organization_id,store_id,provider,external_event_id,payload) values($1,$2,'whatsapp',$3,$4)", [org, store, external, payload]);
    assert.deepEqual(await Promise.all([processNext(pool, options), processNext(pool, options)]), [true, true]);
    assert.equal((await pool.query('select * from messages')).rowCount, 1);
    assert.equal((await pool.query('select * from contacts')).rowCount, 1);
    assert.equal((await pool.query('select * from conversations')).rowCount, 1);
  } finally {
    await pool.end();
    // Schema name is generated internally and contains only [a-z0-9_].
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
