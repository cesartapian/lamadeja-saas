import express from 'express';
import cors from 'cors';
import { config } from './lib/config.js';
import { requireAuth } from './middleware/auth.js';
import { whatsappRouter } from './routes/whatsapp.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.WEB_ORIGIN }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'lamadeja-api' }));
// Raw bytes MUST be retained for HMAC; no JSON parser before this route.
app.use('/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '1mb' }), whatsappRouter);
app.use(express.json({ limit: '1mb' }));
app.get('/api/me', requireAuth, (_req, res) => res.json(res.locals.auth));
app.get('/api/modules', requireAuth, (_req, res) => res.json({ messaging: 'scaffold', commerce: 'scaffold', agents: 'scaffold', crm: 'scaffold' }));
app.listen(config.PORT, () => console.info(`API listening on ${config.PORT}`));
