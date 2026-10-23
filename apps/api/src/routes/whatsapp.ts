import { Router } from 'express';
import { config } from '../lib/config.js';
import { verifyMetaSignature } from '../lib/whatsappSignature.js';
import { saveWebhook } from '../lib/webhookInbox.js';
import { validateMetaWebhook } from '../lib/webhookValidation.js';

export const whatsappRouter = Router();
whatsappRouter.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.META_VERIFY_TOKEN && typeof challenge === 'string') {
    res.status(200).type('text/plain').send(challenge); return;
  }
  res.sendStatus(403);
});

whatsappRouter.post('/', async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !verifyMetaSignature(req.body, req.get('x-hub-signature-256'), config.META_APP_SECRET)) {
    res.sendStatus(401); return;
  }
  let payload: unknown;
  try { payload = JSON.parse(req.body.toString('utf8')); }
  catch { res.status(400).json({ error: 'Invalid JSON' }); return; }
  if (!validateMetaWebhook(payload)) {
    res.status(400).json({ error: 'Unexpected webhook payload' }); return;
  }
  try {
    const status = await saveWebhook(req.body, payload);
    // Acknowledge only after durable insert (or confirmed duplicate).
    // No outbound messages, Shopify mutations or AI processing are enabled.
    res.status(200).json({ accepted: true, status });
  } catch (error) {
    console.error('Webhook inbox write failed', error instanceof Error ? error.message : 'unknown');
    res.status(503).json({ error: 'Webhook temporarily unavailable' });
  }
});
