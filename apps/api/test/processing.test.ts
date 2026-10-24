import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import type { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { processNext } from '../src/lib/processInbox.js';
import { parseWhatsapp } from '../src/lib/parseWhatsapp.js';
import { webhookSaver } from '../src/lib/saveWebhook.js';
import { webhookRouter } from '../src/routes/webhookRouter.js';
import { conversationRouter } from '../src/routes/conversations.js';
import { authentication } from '../src/middleware/authorization.js';

const org = '00000000-0000-4000-8000-000000000001';
const store = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const otherStore = '00000000-0000-4000-8000-000000000004';
const user = '00000000-0000-4000-8000-000000000005';
const options = { maxAttempts: 2, retrySeconds: 1, timeoutMs: 15000 };
function payload(id = 'wamid.synthetic') {
  return { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
    metadata: { phone_number_id: 'synthetic-phone' }, contacts: [{ wa_id: '56912345678', profile: { name: 'Synthetic' } }],
    messages: [{ id, from: '56912345678', timestamp: '1700000000', type: 'text', text: { body: 'Hola' } }],
  } }] }] };
}
async function fixture() {
  const db = new PGlite();
  for (const name of ['001_initial.sql', '002_message_processing.sql', '003_inbox_read_index.sql']) {
    const sql = await readFile(new URL(`../../../packages/database/migrations/${name}`, import.meta.url), 'utf8');
    // pgcrypto extension is unavailable in WASM; gen_random_uuid is built into PostgreSQL.
    await db.exec(sql.replace('create extension if not exists pgcrypto;', ''));
  }
  const query = async (sql: string, params?: unknown[]) => {
    const r = await db.query(sql, params);
    return { ...r, rowCount: r.affectedRows || r.rows.length };
  };
  const client = { query, release() {} };
  const pool = { query, connect: async () => client } as unknown as Pool;
  await query('insert into organizations(id,name) values($1,\'A\'),($2,\'B\')', [org, other]);
  await query('insert into stores(id,organization_id,name) values($1,$2,\'A\'),($3,$4,\'B\')', [store, org, otherStore, other]);
  await query('insert into organization_members values($1,$2,\'owner\')', [org, user]);
  await query("insert into channel_connections(organization_id,store_id,provider,external_account_id) values($1,$2,'whatsapp','synthetic-phone')", [org, store]);
  const save = webhookSaver(pool, org, store);
  const enqueue = async (body = payload()) => save(Buffer.from(JSON.stringify(body)), body);
  return { db, query, pool, save, enqueue };
}

test('parser extracts text, rejects malformed nested payloads and records unsupported notifications', () => {
  const parsed = parseWhatsapp(payload());
  assert.equal(parsed.messages[0].sentAt.toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(parsed.messages[0].name, 'Synthetic');
  assert.throws(() => parseWhatsapp({ object: 'whatsapp_business_account', entry: [{}] }));
  const unsupported = payload();
  unsupported.entry[0].changes[0].value.messages[0].type = 'image';
  assert.match(parseWhatsapp(unsupported).notes[0], /unsupported/);
  assert.equal(parseWhatsapp(unsupported).messages.length, 0);
});

test('signed HTTP webhook -> durable inbox -> worker -> authenticated tenant-scoped API', async () => {
  const f = await fixture();
  const app = express();
  app.use('/webhooks/whatsapp', express.raw({ type: 'application/json' }), webhookRouter('synthetic-secret', 'verify', f.save));
  const auth = authentication(f.pool, async token => token === 'synthetic-session' ? { id: user, email: 'test@example.com' } : null, new Set(['test@example.com']), org, store);
  app.use('/api', conversationRouter(f.pool, auth));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: 'Bearer synthetic-session' };
  const send = async (body: string, valid = true) => fetch(`${url}/webhooks/whatsapp`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'x-hub-signature-256': valid ? 'sha256=' + createHmac('sha256', 'synthetic-secret').update(body).digest('hex') : 'sha256=bad',
  }, body });
  try {
    assert.equal((await send(JSON.stringify(payload()), false)).status, 401);
    assert.equal((await send('{bad')).status, 400);
    assert.equal((await send('{}')).status, 400);
    assert.equal((await send(JSON.stringify(payload()))).status, 200);
    assert.equal((await (await send(JSON.stringify(payload()))).json()).status, 'duplicate');
    assert.equal(await processNext(f.pool, options), true);
    // Different raw delivery with the same Meta message ID.
    const body = payload();
    body.entry[0].changes[0].value.contacts[0].profile.name = 'Changed';
    await f.enqueue(body);
    await processNext(f.pool, options);
    assert.equal((await f.query('select * from messages')).rows.length, 1);
    assert.equal((await f.query('select * from contacts')).rows.length, 1);
    assert.equal((await f.query('select * from conversations')).rows.length, 1);
    assert.equal((await fetch(`${url}/api/conversations`)).status, 401);
    assert.equal((await fetch(`${url}/api/conversations`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    const response = await fetch(`${url}/api/conversations?organizationId=${other}`, { headers });
    const conversations = (await response.json()).conversations;
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].contact_name, 'Changed');
    assert.equal(conversations[0].last_message, 'Hola');
    assert.equal(conversations[0].contact_phone, '56912345678');
    const messages = await (await fetch(`${url}/api/conversations/${conversations[0].id}/messages`, { headers })).json();
    assert.equal(messages.messages[0].body, 'Hola');
    await f.query(`insert into messages(organization_id,conversation_id,direction,body,created_at) values($1,$2,'in','Earlier','2023-01-01T13:00:00Z'),($1,$2,'in','Previous','2023-01-01T14:00:00Z')`, [org, conversations[0].id]);
    const newest = await (await fetch(`${url}/api/conversations/${conversations[0].id}/messages?limit=1&order=desc`, { headers })).json();
    assert.equal(newest.messages[0].body, 'Hola'); assert.equal(newest.hasMore, true); assert.equal(newest.nextOffset, 1);
    const previous = await (await fetch(`${url}/api/conversations/${conversations[0].id}/messages?limit=1&order=desc&offset=1`, { headers })).json();
    assert.equal(previous.messages[0].body, 'Previous');
    const earliest = await (await fetch(`${url}/api/conversations/${conversations[0].id}/messages?limit=1&order=desc&offset=2`, { headers })).json();
    assert.equal(earliest.messages[0].body, 'Earlier'); assert.equal(earliest.hasMore, false);
    // Provider time wins over ingestion time; equal effective times use the ID.
    await f.query(`insert into messages(id,organization_id,conversation_id,direction,body,sent_at,created_at) values
      ('00000000-0000-4000-8000-000000000010',$1,$2,'in','Tie lower','2025-01-01T00:00:00Z','2027-01-01T00:00:00Z'),
      ('00000000-0000-4000-8000-000000000011',$1,$2,'in','Tie higher',null,'2025-01-01T00:00:00Z'),
      ('00000000-0000-4000-8000-000000000012',$1,$2,'in','Delayed old message','2022-01-01T00:00:00Z','2028-01-01T00:00:00Z')`, [org, conversations[0].id]);
    const expected = ['Delayed old message', 'Earlier', 'Previous', 'Hola', 'Tie lower', 'Tie higher'];
    for (const order of ['asc', 'desc']) {
      const expectedOrder = order === 'asc' ? expected : [...expected].reverse();
      const result = await (await fetch(`${url}/api/conversations/${conversations[0].id}/messages?order=${order}`, { headers })).json();
      assert.deepEqual(result.messages.map((message: { body: string }) => message.body), expectedOrder);
      const page = await (await fetch(`${url}/api/conversations/${conversations[0].id}/messages?order=${order}&limit=1&offset=${order === 'asc' ? 5 : 1}`, { headers })).json();
      assert.equal(page.messages[0].body, order === 'asc' ? 'Tie higher' : 'Tie lower');
    }
    const latest = (await (await fetch(`${url}/api/conversations`, { headers })).json()).conversations[0];
    assert.equal(latest.last_message, 'Tie higher');
    assert.equal(new Date(latest.last_message_at).toISOString(), '2025-01-01T00:00:00.000Z');
    await f.query("delete from messages where id='00000000-0000-4000-8000-000000000011'");
    const providerLatest = (await (await fetch(`${url}/api/conversations`, { headers })).json()).conversations[0];
    assert.equal(providerLatest.last_message, 'Tie lower');
    assert.equal(new Date(providerLatest.last_message_at).toISOString(), '2025-01-01T00:00:00.000Z');
    assert.equal((await fetch(`${url}/api/conversations?limit=101`, { headers })).status, 400);
    assert.equal((await fetch(`${url}/api/conversations/${conversations[0].id}/messages?order=invalid`, { headers })).status, 400);
    assert.equal((await fetch(`${url}/api/contacts/${conversations[0].contact_id}`, { headers })).status, 200);
    const foreign = await f.query('insert into contacts(organization_id,store_id,external_contact_id) values($1,$2,\'56999999999\') returning id', [other, otherStore]);
    assert.equal((await fetch(`${url}/api/contacts/${(foreign.rows[0] as {id:string}).id}`, { headers })).status, 404);
    const channel = await f.query("insert into channel_connections(organization_id,store_id,provider,external_account_id) values($1,$2,'whatsapp','other-phone') returning id", [other, otherStore]);
    const foreignConversation = await f.query('insert into conversations(organization_id,store_id,channel_connection_id,contact_id) values($1,$2,$3,$4) returning id', [other, otherStore, (channel.rows[0] as {id:string}).id, (foreign.rows[0] as {id:string}).id]);
    assert.equal((await fetch(`${url}/api/conversations/${(foreignConversation.rows[0] as {id:string}).id}/messages`, { headers })).status, 404);
    assert.equal((await (await fetch(`${url}/api/conversations`, { headers })).json()).conversations.length, 1);
    await f.query('delete from organization_members');
    assert.equal((await fetch(`${url}/api/conversations`, { headers })).status, 403);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await f.db.close(); }
});

test('persistence failure rolls business writes back; retries recover and stop at configured limit', async () => {
  const f = await fixture();
  try {
    await f.db.exec(`create function reject_message() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
      create trigger synthetic_failure before insert on messages for each row execute function reject_message();`);
    await f.enqueue();
    await processNext(f.pool, options);
    assert.equal((await f.query('select * from contacts')).rows.length, 0);
    let event = (await f.query('select * from webhook_inbox')).rows[0] as {status:string;attempt_count:number;last_error:string};
    assert.equal(event.status, 'failed'); assert.equal(event.attempt_count, 1); assert(event.last_error);
    assert.equal(await processNext(f.pool, options), false);
    await f.db.exec('drop trigger synthetic_failure on messages; update webhook_inbox set next_attempt_at=now();');
    await processNext(f.pool, options);
    assert.equal((await f.query('select * from messages')).rows.length, 1);
    await f.enqueue({ object: 'whatsapp_business_account', entry: [{}] } as ReturnType<typeof payload>);
    await processNext(f.pool, options);
    await f.db.exec("update webhook_inbox set next_attempt_at=now() where status='failed'");
    await processNext(f.pool, options);
    assert.equal(await processNext(f.pool, options), false);
    event = (await f.query("select * from webhook_inbox where status='failed'")).rows[0] as typeof event;
    assert.equal(event.attempt_count, 2);
    // Simulate a disconnected worker transaction: no business writes survive.
    await f.db.exec("begin; update webhook_inbox set status='processing'; rollback;");
    assert.equal((await f.query("select * from webhook_inbox where status='processing'")).rows.length, 0);
    await assert.rejects(f.query('insert into contacts(organization_id,store_id) values($1,$2)', [org, otherStore]));
  } finally { await f.db.close(); }
});

test('webhook returns 503 rather than acknowledging persistence failure', async () => {
  const app = express();
  app.use(express.raw({ type: 'application/json' }), webhookRouter('secret', 'verify', async () => { throw new Error('unavailable'); }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  try {
    const body = JSON.stringify(payload());
    const response = await fetch(`http://127.0.0.1:${address.port}`, { method: 'POST', body, headers: {
      'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex'),
    } });
    assert.equal(response.status, 503);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
