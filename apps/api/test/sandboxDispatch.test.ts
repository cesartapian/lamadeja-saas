import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimSandboxJob, beginSandboxDispatch, completeSandboxDispatch, recoverSandboxClaim, sandboxTextAllowed, type SandboxJob } from '../src/lib/sandboxDispatch.js';

const queued = (): SandboxJob => ({ state: 'queued', attempts: 0, maxAttempts: 3, nextAttemptAt: 0, claimToken: null, leaseUntil: null, providerMessageId: null });
const dispatch = (job = queued(), now = 1000) => beginSandboxDispatch(claimSandboxJob(job, 'claim-A', now, 1000), 'claim-A', now);

test('ambiguous timeout or worker crash never makes a sandbox send eligible for retry', () => {
  for (const job of [completeSandboxDispatch(dispatch(), 'claim-A', 1100, { kind: 'unknown' }, 100), recoverSandboxClaim(dispatch(), 2000)]) {
    assert.equal(job.state, 'unknown'); assert.equal(job.attempts, 1);
    assert.throws(() => claimSandboxJob(job, 'claim-B', 3000, 1000));
  }
  const claimed = claimSandboxJob(queued(), 'claim-A', 1000, 1000);
  assert.equal(recoverSandboxClaim(claimed, 1999), claimed);
  const recovered = recoverSandboxClaim(claimed, 2000);
  assert.equal(recovered.state, 'queued'); assert.equal(recovered.attempts, 0);
  const replacement = claimSandboxJob(recovered, 'claim-B', 2000, 1000);
  assert.throws(() => beginSandboxDispatch(replacement, 'claim-A', 2001));
  assert.throws(() => completeSandboxDispatch(dispatch(), 'claim-A', 2000, { kind: 'accepted', providerMessageId: 'wamid.test' }, 100));
});

test('provider acknowledgement is accepted rather than delivered and cannot be resent', () => {
  const result = completeSandboxDispatch(dispatch(), 'claim-A', 1100, { kind: 'accepted', providerMessageId: 'wamid.test' }, 100);
  assert.equal(result.state, 'accepted'); assert.equal(result.providerMessageId, 'wamid.test');
  assert.equal(result.claimToken, null);
  assert.throws(() => claimSandboxJob(result, 'claim-B', 3000, 1000));
  assert.throws(() => completeSandboxDispatch(dispatch(), 'claim-A', 1100, { kind: 'accepted', providerMessageId: '' }, 100));
});

test('only definitely unsent failures retry, respecting delay and the attempt cap', () => {
  let job = dispatch();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const now = attempt === 1 ? 1100 : job.nextAttemptAt + 1;
    job = completeSandboxDispatch(job, 'claim-A', now, { kind: 'definitely_not_sent', retryable: true, retryAfterMs: 500 }, 100);
    assert.equal(job.attempts, attempt);
    if (attempt < 3) {
      assert.equal(job.state, 'retry_wait'); assert.equal(job.nextAttemptAt, now + 500);
      assert.throws(() => claimSandboxJob(job, 'early', job.nextAttemptAt - 1, 1000));
      job = dispatch(job, job.nextAttemptAt);
    }
  }
  assert.equal(job.state, 'failed');
  assert.throws(() => claimSandboxJob(job, 'fourth', 10000, 1000));
  assert.equal(completeSandboxDispatch(dispatch(), 'claim-A', 1100, { kind: 'definitely_not_sent', retryable: false }, 100).state, 'failed');
  const retry = completeSandboxDispatch(dispatch(), 'claim-A', 1100, { kind: 'definitely_not_sent', retryable: true }, 100);
  assert.equal(retry.nextAttemptAt, 1200);
  const secondRetry = completeSandboxDispatch(dispatch(retry, 1200), 'claim-A', 1201, { kind: 'definitely_not_sent', retryable: true }, 100);
  assert.equal(secondRetry.nextAttemptAt, 1401);
});

test('sandbox text is restricted to explicit channel scope, recipients and an open reply window', () => {
  const now = 100000000;
  const policy = { enabled: true, organizationId: 'org', storeId: 'store', channelId: 'channel', allowedRecipients: new Set(['+56912345678']) };
  const request = { organizationId: 'org', storeId: 'store', channelId: 'channel', recipient: '+56912345678', body: 'Test reply', lastInboundAt: now - 1000 };
  assert.equal(sandboxTextAllowed(policy, request, now), true);
  assert.equal(sandboxTextAllowed({ ...policy, enabled: false }, request, now), false);
  for (const change of [{ organizationId: 'other' }, { storeId: 'other' }, { channelId: 'other' }, { recipient: '+56999999999' }, { recipient: '56912345678' }, { body: ' ' }, { body: 'a'.repeat(4097) }, { lastInboundAt: null }, { lastInboundAt: now + 1 }, { lastInboundAt: now - 86400000 }]) {
    assert.equal(sandboxTextAllowed(policy, { ...request, ...change }, now), false);
  }
  assert.equal(sandboxTextAllowed(policy, { ...request, lastInboundAt: now - 86400000 + 1 }, now), true);
});
