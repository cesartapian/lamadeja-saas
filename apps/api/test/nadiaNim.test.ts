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
