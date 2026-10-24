import { Router } from 'express';
import { verifyMetaSignature } from '../lib/whatsappSignature.js';
import { validateMetaWebhook } from '../lib/webhookValidation.js';
export function webhookRouter(secret: string, verifyToken: string, save: (raw: Buffer, payload: Record<string, unknown>) => Promise<'created' | 'duplicate'>) {
  const router = Router();
  router.get('/', (req, res) => {
    const challenge = req.query['hub.challenge'];
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken && typeof challenge === 'string') {
      res.type('text/plain').send(challenge); return;
    }
    res.sendStatus(403);
  });
  router.post('/', async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !verifyMetaSignature(req.body, req.get('x-hub-signature-256'), secret)) { res.sendStatus(401); return; }
    let payload: unknown;
    try { payload = JSON.parse(req.body.toString('utf8')); } catch { res.sendStatus(400); return; }
    if (!validateMetaWebhook(payload)) { res.sendStatus(400); return; }
    try { res.json({ accepted: true, status: await save(req.body, payload) }); }
    catch { console.error('Webhook inbox write failed'); res.status(503).json({ error: 'Webhook temporarily unavailable' }); }
  });
  return router;
}
