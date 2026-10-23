import { createHash } from 'node:crypto';

export function webhookEventId(rawBody: Buffer): string {
  // Stable idempotency key for identical webhook deliveries. A later worker must
  // additionally deduplicate individual WhatsApp messages by their Meta IDs.
  return createHash('sha256').update(rawBody).digest('hex');
}

export function validateMetaWebhook(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    && (payload as Record<string, unknown>).object === 'whatsapp_business_account'
    && Array.isArray((payload as Record<string, unknown>).entry);
}

