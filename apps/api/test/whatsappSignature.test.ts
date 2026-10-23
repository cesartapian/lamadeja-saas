import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyMetaSignature } from '../src/lib/whatsappSignature.js';

test('accepts valid signature over exact raw bytes', () => {
  const body = Buffer.from('{"entry":[]}');
  const signature = 'sha256=' + createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifyMetaSignature(body, signature, 'secret'), true);
  assert.equal(verifyMetaSignature(Buffer.from('{"entry": []}'), signature, 'secret'), false);
});
test('rejects malformed and absent signatures', () => {
  const body = Buffer.from('{}');
  assert.equal(verifyMetaSignature(body, undefined, 'secret'), false);
  assert.equal(verifyMetaSignature(body, 'sha256=xyz', 'secret'), false);
});

test('webhook payload must be WhatsApp event envelope', async () => {
  const { validateMetaWebhook, webhookEventId } = await import('../src/lib/webhookValidation.js');
  assert.equal(validateMetaWebhook({ object: 'whatsapp_business_account', entry: [] }), true);
  assert.equal(validateMetaWebhook({ object: 'instagram', entry: [] }), false);
  assert.equal(validateMetaWebhook([]), false);
  assert.equal(webhookEventId(Buffer.from('abc')), webhookEventId(Buffer.from('abc')));
  assert.notEqual(webhookEventId(Buffer.from('abc')), webhookEventId(Buffer.from('abd')));
});
