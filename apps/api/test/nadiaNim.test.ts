import assert from 'node:assert/strict';
import test from 'node:test';
import { generateNadiaReply, NadiaInferenceError } from '../src/lib/nadiaNim.js';

const base = { apiKey: 'test-secret', model: 'test-free-model', messages: [{ role: 'user' as const, content: 'Hola, necesito ayuda' }], firstContact: true };
test('Nadia sends system policy and first-contact instruction to NIM without contacting WhatsApp', async () => {
  let request: RequestInit | undefined;
  const fetcher: typeof fetch = async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Hola, soy Nadia, asistente virtual con inteligencia artificial. ¿En qué puedo ayudarte?' } }] }), { status: 200 });
  };
  const result = await generateNadiaReply({ ...base, fetcher });
  assert.match(result.text, /Nadia/);
  assert.equal(request?.method, 'POST');
  const body = JSON.parse(String(request?.body));
  assert.equal(body.stream, false);
  assert.match(body.messages[0].content, /No inventes precios/);
  assert.match(body.messages[0].content, /primer contacto/);
});
test('Nadia rejects absent credentials before any network call', async () => {
  await assert.rejects(generateNadiaReply({ ...base, apiKey: '' }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'configuration');
});
test('Nadia reports quota errors without invented fallback', async () => {
  await assert.rejects(generateNadiaReply({ ...base, fetcher: async () => new Response('', { status: 429 }) }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'rate_limit');
});
test('Nadia rejects empty model responses', async () => {
  await assert.rejects(generateNadiaReply({ ...base, fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }) }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'invalid_response');
});
test('Nadia rejects endpoint/header injection even with an injected transport', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response('{}'); };
  for (const change of [{ endpoint: 'https://other.invalid/v1/chat/completions' }, { endpoint: 'https://integrate.api.nvidia.com:444/v1/chat/completions' }, { apiKey: 'bad\r\nheader' }, { timeoutMs: 0 }]) {
    await assert.rejects(generateNadiaReply({ ...base, ...change, fetcher }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'configuration');
  }
  await assert.rejects(generateNadiaReply({ ...base, messages: Array.from({ length: 4 }, () => ({ role: 'user' as const, content: 'x'.repeat(4096) })), fetcher }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'configuration');
  assert.equal(calls, 0);
});
test('Nadia bounds slow transports and oversized/malformed responses without leaking provider details', async () => {
  await assert.rejects(generateNadiaReply({ ...base, timeoutMs: 20, fetcher: async () => new Promise<Response>(() => {}) }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'timeout');
  for (const content of ['sensitive provider failure', 'x'.repeat(65537)]) {
    await assert.rejects(generateNadiaReply({ ...base, fetcher: async () => new Response(content) }), (e: unknown) => e instanceof NadiaInferenceError && e.category === 'invalid_response' && !e.message.includes(content));
  }
});
test('application guarantees first-contact identity and avoids presentation on subsequent turns', async () => {
  const fetcher: typeof fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '¿Qué necesitas?' } }] }));
  const first = await generateNadiaReply({ ...base, fetcher });
  assert.match(first.text, /^Soy Nadia, asistente virtual con inteligencia artificial\./);
  assert.equal((await generateNadiaReply({ ...base, firstContact: false, fetcher })).text, '¿Qué necesitas?');
});
test('Nemotron 3 requests disable extended thinking and keep a bounded non-streaming reply', async () => {
  await generateNadiaReply({ ...base, model: 'nvidia/nemotron-3-ultra-550b-a55b', fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.equal(body.stream, false); assert.equal(body.max_tokens, 256); assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ choices: [{ message: { content: '¿En qué puedo ayudarte?' } }] }));
  } });
});
