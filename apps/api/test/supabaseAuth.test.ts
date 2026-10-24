import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { authentication } from '../src/middleware/authorization.js';
import { supabaseIdentity } from '../src/lib/supabaseIdentity.js';

test('real Supabase SDK verifies bearer identity and distinguishes authentication, membership and outages', async () => {
  let providerStatus = 200, email = 'test@example.com', member = true, providerCalls = 0, membershipCalls = 0, databaseFails = false;
  const userId = '00000000-0000-4000-8000-000000000001';
  const organizationId = '00000000-0000-4000-8000-000000000002';
  const storeId = '00000000-0000-4000-8000-000000000003';
  const identityProvider = express();
  identityProvider.get('/auth/v1/user', (req, res) => {
    providerCalls++;
    assert.equal(req.get('apikey'), 'synthetic-public-key');
    if (req.get('authorization') !== 'Bearer verified-token') { res.status(401).json({ message: 'invalid JWT', code: 'bad_jwt' }); return; }
    if (providerStatus !== 200) { res.status(providerStatus).json({ message: 'private upstream diagnostic' }); return; }
    res.json({ id: userId, email, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  });
  const providerServer = identityProvider.listen(0, '127.0.0.1'); await once(providerServer, 'listening');
  const providerAddress = providerServer.address(); assert(providerAddress && typeof providerAddress !== 'string');
  const client = createClient(`http://127.0.0.1:${providerAddress.port}`, 'synthetic-public-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const database = { async query(sql: string, parameters: unknown[]) {
    membershipCalls++;
    assert.match(sql, /organization_members/); assert.deepEqual(parameters, [organizationId, userId]);
    if (databaseFails) throw new Error('private database diagnostic');
    return { rowCount: member ? 1 : 0, rows: [] };
  } } as unknown as Pool;
  const app = express();
  app.get('/api/me', authentication(database, supabaseIdentity(client), new Set(['test@example.com']), organizationId, storeId), (_req, res) => res.json(res.locals.auth));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/me`;
  const request = (token = 'verified-token') => fetch(`${url}?organizationId=untrusted`, { headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': 'untrusted' } });
  try {
    assert.equal((await fetch(url)).status, 401); assert.equal(providerCalls, 0);
    assert.equal((await request('forged-token')).status, 401); assert.equal(membershipCalls, 0);
    const authenticated = await request(); assert.equal(authenticated.status, 200);
    assert.deepEqual(await authenticated.json(), { userId, email, organizationId, storeId });
    member = false; assert.equal((await request()).status, 403); member = true;
    const callsBeforeDisallowed = membershipCalls;
    email = 'other@example.com'; assert.equal((await request()).status, 403); assert.equal(membershipCalls, callsBeforeDisallowed); email = 'test@example.com';
    for (const status of [400, 401, 403]) { providerStatus = status; assert.equal((await request()).status, 401); }
    for (const status of [429, 500, 503]) {
      providerStatus = status;
      const response = await request(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private upstream/);
    }
    providerStatus = 200; databaseFails = true;
    const response = await request(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private database/);
    assert.equal(providerCalls, 11);
  } finally {
    server.closeAllConnections(); providerServer.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => providerServer.close(() => resolve()))]);
  }
});
