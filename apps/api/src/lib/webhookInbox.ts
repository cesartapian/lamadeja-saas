import { config } from './config.js';
import { pool } from './database.js';
import { webhookSaver } from './saveWebhook.js';
const save = webhookSaver(pool, config.MVP_ORGANIZATION_ID, config.MVP_STORE_ID);
export async function saveWebhook(rawBody: Buffer, payload: Record<string, unknown>): Promise<'created' | 'duplicate'> {
  if (!config.DATABASE_URL) throw new Error('Webhook inbox database is not configured');
  return save(rawBody, payload);
}
