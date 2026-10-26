import type { Pool, PoolClient } from 'pg';
import { parseWhatsapp, type IncomingText } from './parseWhatsapp.js';
import { ZodError } from 'zod';
import { persistSandboxReceipt } from './sandboxReceipts.js';

async function persist(client: PoolClient, organization: string, store: string, m: IncomingText) {
  const channel = await client.query(`select id from channel_connections where organization_id=$1 and store_id=$2 and provider='whatsapp' and external_account_id=$3`, [organization, store, m.phoneId]);
  if (!channel.rows[0]) throw new Error('WhatsApp channel is not registered for this tenant');
  const contact = await client.query(`insert into contacts(organization_id,store_id,external_contact_id,display_name) values($1,$2,$3,$4)
    on conflict(organization_id,store_id,external_contact_id) do update set display_name=coalesce(excluded.display_name,contacts.display_name),updated_at=now() returning id`, [organization, store, m.from, m.name ?? null]);
  const conversation = await client.query(`insert into conversations(organization_id,store_id,channel_connection_id,contact_id) values($1,$2,$3,$4)
    on conflict(organization_id,store_id,channel_connection_id,contact_id) do update set updated_at=now() returning id`, [organization, store, channel.rows[0].id, contact.rows[0].id]);
  await client.query(`insert into messages(organization_id,conversation_id,external_message_id,direction,body,message_type,sent_at)
    values($1,$2,$3,'in',$4,'text',$5) on conflict(organization_id,external_message_id) where external_message_id is not null do nothing`, [organization, conversation.rows[0].id, m.id, m.body, m.sentAt]);
}

export interface WorkerOptions { maxAttempts: number; retrySeconds: number; timeoutMs: number; scope?: { organizationId: string; storeId: string } }
// One transaction holds the row lock until completion. A crash rolls everything
// back to the prior pending/failed state; there is no expired-lease race.
export async function processNext(pool: Pool, options: WorkerOptions): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('statement_timeout',$1,true), set_config('idle_in_transaction_session_timeout',$1,true)`, [String(options.timeoutMs)]);
    const result = await client.query(`select * from webhook_inbox where ($2::uuid is null or (organization_id=$2 and store_id=$3)) and provider='whatsapp' and status in ('pending','failed') and attempt_count < $1 and next_attempt_at <= now() order by received_at,id for update skip locked limit 1`, [options.maxAttempts, options.scope?.organizationId ?? null, options.scope?.storeId ?? null]);
    const event = result.rows[0];
    if (!event) { await client.query('commit'); return false; }
    await client.query(`update webhook_inbox set status='processing',attempt_count=attempt_count+1,updated_at=now() where id=$1`, [event.id]);
    await client.query('savepoint business_work');
    try {
      const { messages, receipts, notes } = parseWhatsapp(event.payload);
      for (const message of messages) await persist(client, event.organization_id, event.store_id, message);
      for (const receipt of receipts) await persistSandboxReceipt(client, event.organization_id, event.store_id, receipt);
      await client.query(`update webhook_inbox set status='processed',processed_at=now(),updated_at=now(),last_error=null,processing_notes=$2::jsonb where id=$1`, [event.id, JSON.stringify(notes)]);
    } catch (error) {
      await client.query('rollback to savepoint business_work');
      // Do not store payloads, SQL details or credentials in error logs.
      const code = error instanceof ZodError ? 'invalid_payload'
        : error instanceof Error && error.message === 'WhatsApp channel is not registered for this tenant' ? 'unregistered_channel'
        : 'persistence_or_message_validation_failure';
      await client.query(`update webhook_inbox set status='failed',last_error=$3,updated_at=now(),next_attempt_at=now()+($2 * interval '1 second') where id=$1`, [event.id, options.retrySeconds * 2 ** Math.min(event.attempt_count, 10), code]);
    }
    await client.query('commit');
    return true;
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
  finally { client.release(); }
}
