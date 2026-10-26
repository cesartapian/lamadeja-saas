import { z } from 'zod';

const envelope = z.object({ object: z.literal('whatsapp_business_account'), entry: z.array(z.object({
  changes: z.array(z.object({ field: z.string(), value: z.record(z.string(), z.unknown()) })),
})) });
const incoming = z.object({ id: z.string().min(1), from: z.string().regex(/^\d{5,20}$/),
  timestamp: z.string().regex(/^\d{1,12}$/), type: z.string(), text: z.object({ body: z.string() }).optional() });
export interface IncomingText { id: string; from: string; sentAt: Date; body: string; phoneId: string; name?: string }
export interface DeliveryReceipt { providerMessageId: string; recipient: string; status: 'sent' | 'delivered' | 'read' | 'failed'; occurredAt: Date; errorCode: number | null; phoneId: string }
const receipt = z.object({ id: z.string().regex(/^wamid\.[A-Za-z0-9_+=\/-]{1,500}$/),
  recipient_id: z.string().regex(/^[1-9][0-9]{7,14}$/), status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string().regex(/^\d{1,12}$/), errors: z.array(z.object({ code: z.number().int().min(0).max(2147483647) })).optional() });
export function parseWhatsapp(payload: unknown): { messages: IncomingText[]; receipts: DeliveryReceipt[]; notes: string[] } {
  const parsed = envelope.parse(payload);
  const messages: IncomingText[] = [], receipts: DeliveryReceipt[] = [], notes: string[] = [];
  for (const entry of parsed.entry) for (const change of entry.changes) {
    if (change.field !== 'messages') { notes.push(`unsupported field: ${change.field}`); continue; }
    const value = change.value;
    if (Array.isArray(value.statuses)) {
      const metadata = z.object({ phone_number_id: z.string().min(1) }).parse(value.metadata);
      for (const raw of value.statuses) {
        const parsedStatus = receipt.safeParse(raw);
        if (!parsedStatus.success) { notes.push('unsupported or invalid status notification'); continue; }
        const status = parsedStatus.data;
        const occurredAt = new Date(Number(status.timestamp) * 1000);
        if (!Number.isFinite(occurredAt.getTime())) { notes.push('invalid receipt timestamp'); continue; }
        receipts.push({ providerMessageId: status.id, recipient: '+' + status.recipient_id, status: status.status,
          occurredAt, errorCode: status.status === 'failed' ? status.errors?.[0]?.code ?? null : null, phoneId: metadata.phone_number_id });
      }
    }
    if (!Array.isArray(value.messages)) { if (!Array.isArray(value.statuses)) notes.push('non-message notification'); continue; }
    const metadata = z.object({ phone_number_id: z.string().min(1) }).parse(value.metadata);
    for (const raw of value.messages) {
      const m = incoming.parse(raw);
      if (m.type !== 'text') { notes.push(`unsupported message type: ${m.type}`); continue; }
      if (!m.text) throw new Error('Text message missing body');
      const sentAt = new Date(Number(m.timestamp) * 1000);
      if (!Number.isFinite(sentAt.getTime())) throw new Error('Invalid timestamp');
      const contacts = z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).optional() })).optional().parse(value.contacts);
      messages.push({ id: m.id, from: m.from, sentAt, body: m.text.body, phoneId: metadata.phone_number_id,
        name: contacts?.find(c => c.wa_id === m.from)?.profile?.name });
    }
  }
  return { messages, receipts, notes };
}
