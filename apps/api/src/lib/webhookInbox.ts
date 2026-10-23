import { Pool } from 'pg';
import { config } from './config.js';

// Deliberately isolated from the Live Manager database and Shopify storefront.
const pool = config.DATABASE_URL ? new Pool({ connectionString: config.DATABASE_URL, max: 5 }) : null;

import { webhookEventId, validateMetaWebhook } from './webhookValidation.js';

export async function saveWebhook(rawBody: Buffer, payload: Record<string, unknown>): Promise<'created' | 'duplicate'> {
  if (!pool) throw new Error('Webhook inbox database is not configured');
  const result = await pool.query(
    `insert into webhook_inbox (organization_id, store_id, provider, external_event_id, payload)
     values ($1, $2, 'whatsapp', $3, $4::jsonb)
     on conflict (organization_id, provider, external_event_id) do nothing
     returning id`,
    [config.MVP_ORGANIZATION_ID, config.MVP_STORE_ID, webhookEventId(rawBody), JSON.stringify(payload)],
  );
  return result.rowCount === 1 ? 'created' : 'duplicate';
}
