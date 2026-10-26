import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaSandboxAdapter } from '../src/lib/metaSandboxAdapter.js';
import type { StoredSandboxJob } from '../src/lib/sandboxRepository.js';

const scope = { organizationId: 'org', storeId: 'store', channelId: 'channel' };
const policy = () => ({ ...scope, enabled: true, allowedRecipients: new Set(['+15555550100']) });
const job = (): StoredSandboxJob => ({ id: 'synthetic-job', version: 2, state: 'dispatching', attempts: 1, maxAttempts: 3,
  nextAttemptAt: 0, claimToken: 'synthetic-claim', leaseUntil: Date.now() + 60000, providerMessageId: null,
  conversationId: 'conversation', requestedBy: 'test-user', recipient: '+15555550100', body: 'Synthetic reply' });
const context = () => ({ ...scope, lastInboundAt: Date.now() - 1000 });
const config = () => ({ token: 'synthetic-token', phoneNumberId: '1234567890', graphVersion: 'v25.0', timeoutMs: 1000, policy: policy() });
const success = () => new Response(JSON.stringify({ messages: [{ id: 'wamid.synthetic' }] }));

test('sandbox adapter makes one request to the pinned Graph endpoint and returns acceptance only', async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'https://graph.facebook.com/v25.0/1234567890/messages');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer synthetic-token');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, { messaging_product: 'whatsapp', recipient_type: 'individual', to: '15555550100', type: 'text', text: { preview_url: false, body: 'Synthetic reply' } });
    return success();
  };
  assert.deepEqual(await metaSandboxAdapter({ ...config(), transport }).send(job(), context()), { kind: 'accepted', providerMessageId: 'wamid.synthetic' });
  assert.equal(calls, 1);
});

test('sandbox policy, closed window, pre-cancellation and expired/unstarted claims prevent all HTTP', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; return success(); };
  const adapter = metaSandboxAdapter({ ...config(), transport });
  const abort = new AbortController(); abort.abort();
  const requests = [
    adapter.send({ ...job(), recipient: '+15555550199' }, context()),
    adapter.send(job(), { ...context(), storeId: 'foreign' }),
    adapter.send(job(), { ...context(), lastInboundAt: null }),
    adapter.send(job(), { ...context(), lastInboundAt: Date.now() - 86400000 }),
    adapter.send({ ...job(), state: 'claimed' }, context()),
    adapter.send({ ...job(), leaseUntil: Date.now() + 100 }, context()),
    adapter.send(job(), context(), abort.signal),
    metaSandboxAdapter({ ...config(), policy: { ...policy(), enabled: false }, transport }).send(job(), context()),
  ];
  for (const result of await Promise.all(requests)) assert.deepEqual(result, { kind: 'definitely_not_sent', retryable: false });
  assert.equal(calls, 0);
});

test('HTTP failures, malformed/oversized responses and transport errors stay ambiguous without retries', async () => {
  const providers: (() => Promise<Response>)[] = [
    async () => new Response('Provider failure', { status: 500 }),
    async () => new Response('{}', { status: 429 }),
    async () => new Response('not json'),
    async () => new Response('x'.repeat(16385)),
    async () => new Response(JSON.stringify({ messages: [{ id: '' }] })),
    async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.one' }, { id: 'wamid.two' }] })),
    async () => { throw new Error('Synthetic transport failure'); },
  ];
  for (const provider of providers) {
    let calls = 0;
    const adapter = metaSandboxAdapter({ ...config(), transport: async () => { calls++; return provider(); } });
    assert.deepEqual(await adapter.send(job(), context()), { kind: 'unknown' });
    assert.equal(calls, 1);
  }
});

test('deadline bounds an uncooperative transport and in-flight cancellation stays unknown', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; return new Promise<Response>(() => {}); };
  const adapter = metaSandboxAdapter({ ...config(), timeoutMs: 20, transport });
  assert.deepEqual(await adapter.send(job(), context()), { kind: 'unknown' });
  const abort = new AbortController();
  const pending = adapter.send(job(), context(), abort.signal); abort.abort();
  assert.deepEqual(await pending, { kind: 'unknown' });
  assert.equal(calls, 2);
});

test('configuration rejects URL injection and snapshots recipient controls', async () => {
  const transport: typeof fetch = async () => success();
  for (const change of [{ phoneNumberId: '../other' }, { graphVersion: 'https://other.invalid' }, { token: 'bad\r\nheader' }, { timeoutMs: 0 }]) {
    assert.throws(() => metaSandboxAdapter({ ...config(), ...change, transport }));
  }
  const settings = { ...config(), transport };
  const adapter = metaSandboxAdapter(settings);
  settings.policy.allowedRecipients.add('+15555550199');
  assert.deepEqual(await adapter.send({ ...job(), recipient: '+15555550199' }, context()), { kind: 'definitely_not_sent', retryable: false });
});
