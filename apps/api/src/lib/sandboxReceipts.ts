import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { DeliveryReceipt } from './parseWhatsapp.js';
import type { SandboxScope } from './sandboxRepository.js';

interface ReceiptTarget { id: string; provider_message_id: string; recipient: string; delivery_status: string | null; delivery_status_at: Date | null; delivery_error_code: number | null }
async function projectReceipt(client: PoolClient, scope: SandboxScope, job: ReceiptTarget): Promise<number> {
  const params = [scope.organizationId, scope.storeId, scope.channelId];
  const latest = (await client.query(`select status,occurred_at,error_code from sandbox_receipts where organization_id=$1 and store_id=$2 and channel_id=$3
    and provider_message_id=$4 and recipient=$5 order by case status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 else 1 end desc,
    occurred_at desc,event_key desc limit 1`, [...params, job.provider_message_id, job.recipient])).rows[0];
  if (!latest || (job.delivery_status === latest.status && job.delivery_status_at?.getTime() === latest.occurred_at.getTime() && job.delivery_error_code === latest.error_code)) return 0;
  await client.query(`update sandbox_dispatch set delivery_status=$5,delivery_status_at=$6,delivery_error_code=$7,updated_at=clock_timestamp()
    where organization_id=$1 and store_id=$2 and channel_id=$3 and id=$4`, [...params, job.id, latest.status, latest.occurred_at, latest.error_code]);
  return 1;
}

// Must be called inside a trusted transaction. Signed webhook processing resolves
// the channel from server-owned scope; never accept a browser-supplied scope.
export async function reconcileSandboxReceipts(client: PoolClient, scope: SandboxScope, limit = 100): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid receipt reconciliation limit');
  const params = [scope.organizationId, scope.storeId, scope.channelId];
  const jobs = await client.query(`select d.* from sandbox_dispatch d join lateral (
      select status,occurred_at,error_code from sandbox_receipts r where r.organization_id=d.organization_id and r.store_id=d.store_id and r.channel_id=d.channel_id
      and r.provider_message_id=d.provider_message_id and r.recipient=d.recipient
      order by case status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 else 1 end desc,occurred_at desc,event_key desc limit 1
    ) latest on true where d.organization_id=$1 and d.store_id=$2 and d.channel_id=$3 and d.state='accepted'
    and (d.delivery_status is distinct from latest.status or d.delivery_status_at is distinct from latest.occurred_at or d.delivery_error_code is distinct from latest.error_code)
    order by d.updated_at,d.id for update of d skip locked limit $4`, [...params, limit]);
  let updated = 0;
  for (const job of jobs.rows) {
    // Delivery/read evidence is stronger than a failure; late sent/failed events
    // must not downgrade a delivered/read message. Retain all audit events.
    updated += await projectReceipt(client, scope, job);
  }
  return updated;
}

export async function persistSandboxReceipt(client: PoolClient, organizationId: string, storeId: string, value: DeliveryReceipt) {
  const channel = (await client.query("select id from channel_connections where organization_id=$1 and store_id=$2 and provider='whatsapp' and external_account_id=$3", [organizationId, storeId, value.phoneId])).rows[0];
  if (!channel) throw new Error('WhatsApp channel is not registered for this tenant');
  const key = createHash('sha256').update(JSON.stringify([value.providerMessageId, value.recipient, value.status, value.occurredAt.toISOString(), value.errorCode])).digest('hex');
  await client.query(`insert into sandbox_receipts(organization_id,store_id,channel_id,event_key,provider_message_id,recipient,status,occurred_at,error_code)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(organization_id,store_id,channel_id,event_key) do nothing`,
  [organizationId, storeId, channel.id, key, value.providerMessageId, value.recipient, value.status, value.occurredAt, value.errorCode]);
  const scope = { organizationId, storeId, channelId: channel.id };
  // Blocking only for this message. A concurrent receipt must wait and then
  // re-read the committed ledger, rather than skip and leave stale delivery.
  const target = await client.query(`select * from sandbox_dispatch where organization_id=$1 and store_id=$2 and channel_id=$3
    and state='accepted' and provider_message_id=$4 and recipient=$5 for update`, [organizationId, storeId, channel.id, value.providerMessageId, value.recipient]);
  if (target.rows[0]) await projectReceipt(client, scope, target.rows[0]);
}
