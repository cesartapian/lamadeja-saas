import type { Pool } from 'pg';
import { webhookEventId } from './webhookValidation.js';
export function webhookSaver(database: Pool, organizationId: string, storeId: string) {
  return async (rawBody: Buffer, payload: Record<string, unknown>): Promise<'created' | 'duplicate'> => {
    const result = await database.query(
      `insert into webhook_inbox (organization_id, store_id, provider, external_event_id, payload)
       values ($1, $2, 'whatsapp', $3, $4::jsonb)
       on conflict (organization_id, provider, external_event_id) do nothing returning id`,
      [organizationId, storeId, webhookEventId(rawBody), JSON.stringify(payload)],
    );
    return result.rowCount === 1 ? 'created' : 'duplicate';
  };
}
