import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';

const script = fileURLToPath(new URL('../../../scripts/check-auth.mjs', import.meta.url));
function run(environment: Record<string, string | undefined>) {
  return new Promise<{ code: number; output: string }>(resolve => {
    execFile(process.execPath, [script], { env: { ...process.env,
      AUTH_CHECK_API_URL: undefined, AUTH_CHECK_ACCESS_TOKEN: undefined, AUTH_CHECK_ORGANIZATION_ID: undefined,
      AUTH_CHECK_STORE_ID: undefined, AUTH_CHECK_ALLOW_REMOTE: undefined, ...environment,
    } }, (error, stdout, stderr) => resolve({ code: error ? 1 : 0, output: stdout + stderr }));
  });
}
test('opt-in auth check performs only scoped GETs, rejects mismatches and never prints credentials', async () => {
  const requests: string[] = [];
  let foreign = false, redirect = false;
  const app = express();
  app.get('/api/me', (req, res) => {
    requests.push(`${req.method} ${req.path}`);
    if (redirect) { res.redirect('https://example.invalid/'); return; }
    if (req.get('authorization') !== 'Bearer synthetic-sensitive-token') { res.status(401).send('private upstream response'); return; }
    res.json({ organizationId: 'organization-a', storeId: 'store-a', email: 'private@example.com' });
  });
  app.get('/api/conversations', (_req, res) => {
    requests.push('GET /api/conversations');
    res.json({ conversations: [{ organization_id: foreign ? 'organization-b' : 'organization-a', store_id: 'store-a', body: 'private body' }] });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert(address && typeof address !== 'string');
  const environment = { AUTH_CHECK_API_URL: `http://127.0.0.1:${address.port}`, AUTH_CHECK_ACCESS_TOKEN: 'synthetic-sensitive-token', AUTH_CHECK_ORGANIZATION_ID: 'organization-a', AUTH_CHECK_STORE_ID: 'store-a' };
  try {
    const success = await run(environment); assert.equal(success.code, 0); assert.match(success.output, /PASS/);
    assert.deepEqual(requests, ['GET /api/me', 'GET /api/me', 'GET /api/conversations']);
    assert.doesNotMatch(success.output, /synthetic-sensitive-token|private@example.com|private body/);
    foreign = true; const mismatch = await run(environment); assert.equal(mismatch.code, 1); assert.match(mismatch.output, /expected test scope/);
    assert.doesNotMatch(mismatch.output, /synthetic-sensitive-token|private body/);
    redirect = true; const redirected = await run(environment); assert.equal(redirected.code, 1); assert.doesNotMatch(redirected.output, /synthetic-sensitive-token/);
    const remote = await run({ ...environment, AUTH_CHECK_API_URL: 'https://example.invalid' }); assert.equal(remote.code, 1); assert.match(remote.output, /AUTH_CHECK_ALLOW_REMOTE/);
    const missing = await run({}); assert.equal(missing.code, 1); assert.match(missing.output, /Define AUTH_CHECK/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
