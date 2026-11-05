import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { requireAuth } from './middleware/auth.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { pool } from './lib/database.js';
import { outboxRouter } from './routes/outbox.js';
import { conversationRouter } from './routes/conversations.js';
import { nadiaRouter } from './routes/nadia.js';
import type { ErrorRequestHandler } from 'express';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.WEB_ORIGIN }));
app.get(['/health', '/api/health'], (_req, res) => res.json({ status: 'ok', service: 'lamadeja-api' }));
app.get('/ready', async (_req, res) => {
  try {
    if (app.locals.stopping || !config.DATABASE_URL) throw new Error('Database not configured or stopping');
    await pool.query('select 1');
    res.json({ status: 'ready', service: 'lamadeja-api' });
  } catch { res.status(503).json({ status: 'not_ready', service: 'lamadeja-api' }); }
});
// Raw bytes MUST be retained for HMAC; no JSON parser before this route.
if (!config.PILOT_READ_ONLY) app.use('/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '1mb' }), whatsappRouter);
app.use(express.json({ limit: '1mb' }));
if (config.PILOT_READ_ONLY) app.use((_req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(_req.method)) { res.set('Allow', 'GET, HEAD, OPTIONS').sendStatus(405); return; }
  next();
});
app.get('/api/me', requireAuth, (_req, res) => res.json(res.locals.auth));
app.get('/api/modules', requireAuth, (_req, res) => res.json({ messaging: 'scaffold', commerce: 'scaffold', agents: 'scaffold', crm: 'scaffold' }));
app.use('/api', outboxRouter(pool, requireAuth, { enabled: !config.PILOT_READ_ONLY && config.OUTBOX_MODE === 'simulated', maxAttempts: config.WORKER_MAX_ATTEMPTS,
  nadiaEnabled: !config.PILOT_READ_ONLY && config.NADIA_MODE === 'simulated' && Boolean(config.NVIDIA_API_KEY && config.NADIA_MODEL) }));
app.use('/api', conversationRouter(pool, requireAuth));
app.use('/api', nadiaRouter(pool, requireAuth, !config.PILOT_READ_ONLY && config.NADIA_MODE === 'simulated' && config.OUTBOX_MODE === 'simulated' && Boolean(config.NVIDIA_API_KEY && config.NADIA_MODEL)));
const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => { res.status(500).json({ error: 'Request failed' }); };
app.use(errorHandler);
