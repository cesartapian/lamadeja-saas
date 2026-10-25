import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workerHealth, safeErrorCode } from '../src/lib/runtimeHealth.js';

test('worker readiness requires a recent successful DB cycle and fails after a cycle error', async () => {
  const health = await workerHealth('test-worker', 0, 60000);
  try {
    const url = `http://127.0.0.1:${health.port}`;
    assert.equal((await fetch(url + '/ready')).status, 503);
    assert.equal((await fetch(url + '/health')).status, 200);
    health.success();
    assert.equal((await fetch(url + '/ready')).status, 200);
    health.failure();
    const response = await fetch(url + '/ready');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { service: 'test-worker', status: 'not_ready' });
    assert.equal((await fetch(url + '/unknown')).status, 404);
  } finally { await health.close(); }
});

test('runtime diagnostics restrict output to known codes without echoing errors', () => {
  assert.equal(safeErrorCode({ code: '28P01', message: 'private password' }), '28P01');
  assert.equal(safeErrorCode({ code: 'ECONNREFUSED' }), 'ECONNREFUSED');
  assert.equal(safeErrorCode({ code: 'postgresql://private-credentials' }), 'runtime_failure');
  assert.equal(safeErrorCode(new Error('private connection URI')), 'runtime_failure');
});

test('worker readiness expires if the processing loop stops reporting success', async () => {
  const health = await workerHealth('stale-worker', 0, 1);
  try {
    health.success();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await fetch(`http://127.0.0.1:${health.port}/ready`)).status, 503);
  } finally { await health.close(); }
});
