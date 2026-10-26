import type { PoolClient } from 'pg';

export async function ensureNadiaSettings(client: PoolClient, organizationId: string, storeId: string, conversationId?: string) {
  await client.query('insert into nadia_settings(organization_id,store_id) values($1,$2) on conflict do nothing', [organizationId, storeId]);
  if (conversationId) await client.query('insert into nadia_conversations(organization_id,store_id,conversation_id) values($1,$2,$3) on conflict do nothing', [organizationId, storeId, conversationId]);
}
export async function enqueueNadia(client: PoolClient, organizationId: string, storeId: string, conversationId: string, messageId: string) {
  await ensureNadiaSettings(client, organizationId, storeId, conversationId);
  await client.query('select store_id from nadia_settings where organization_id=$1 and store_id=$2 for update', [organizationId, storeId]);
  const conversation = (await client.query('select enabled from nadia_conversations where organization_id=$1 and store_id=$2 and conversation_id=$3', [organizationId, storeId, conversationId])).rows[0];
  const enabled = conversation.enabled;
  await client.query(`insert into nadia_runs(organization_id,store_id,conversation_id,source_message_id,state,error_category)
    select $1,$2,$3,id,$5,$6 from messages where id=$4 and organization_id=$1 and conversation_id=$3 and direction='in' and message_type='text'
    on conflict(source_message_id) do nothing`, [organizationId, storeId, conversationId, messageId, enabled ? 'pending' : 'cancelled', enabled ? null : 'paused']);
}

// Caller holds the store settings lock first, matching inference completion.
export async function setNadiaPaused(client: PoolClient, organizationId: string, storeId: string, enabled: boolean, conversationId: string) {
  await ensureNadiaSettings(client, organizationId, storeId, conversationId);
  await client.query('select store_id from nadia_settings where organization_id=$1 and store_id=$2 for update', [organizationId, storeId]);
  await client.query('update nadia_conversations set enabled=$4,version=version+1 where organization_id=$1 and store_id=$2 and conversation_id=$3', [organizationId, storeId, conversationId, enabled]);
  if (!enabled) {
    await client.query(`update message_outbox set status='cancelled',last_error='nadia_paused',updated_at=now()
      where organization_id=$1 and store_id=$2 and origin='nadia' and status in ('pending','retrying') and ($3::uuid is null or conversation_id=$3)`, [organizationId, storeId, conversationId ?? null]);
    await client.query(`update nadia_runs set state='cancelled',error_category='paused',updated_at=now()
      where organization_id=$1 and store_id=$2 and state='pending' and ($3::uuid is null or conversation_id=$3)`, [organizationId, storeId, conversationId ?? null]);
  }
}
