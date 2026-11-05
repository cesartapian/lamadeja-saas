import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

// No real database, Google account or external service is contacted by this test.
Object.assign(process.env, {
  PILOT_READ_ONLY: 'true', OUTBOX_MODE: 'simulated', NADIA_MODE: 'disabled',
  WEB_ORIGIN: 'https://pilot.example.com', SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-public-key', ALLOWED_EMAILS: 'pilot@example.com',
  META_APP_SECRET: 'synthetic', META_VERIFY_TOKEN: 'synthetic',
  MVP_ORGANIZATION_ID: '11111111-1111-4111-8111-111111111111',
  MVP_STORE_ID: '22222222-2222-4222-8222-222222222222',
});
const { app } = await import('../src/app.js');
const { pool } = await import('../src/lib/database.js');

test('Vercel pilot keeps authenticated reads and blocks every mutation without database calls', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + '/api/health')).status, 200);
    for (const path of ['/api/me', '/api/conversations', '/api/outbox/capabilities']) {
      assert.equal((await fetch(base + path)).status, 401);
    }
    for (const path of ['/api/conversations/example/outbox', '/api/nadia/activate', '/webhooks/whatsapp']) {
      const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(response.status, 405);
    }
    assert.equal((await fetch(base + '/webhooks/whatsapp')).status, 404);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); }
});
