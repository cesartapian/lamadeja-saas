import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { generateNadiaReply, NadiaInferenceError, type NadiaOptions, type NadiaResult } from './nadiaNim.js';

export interface NadiaWorkerOptions {
  organizationId: string; storeId: string; apiKey: string; model: string;
  timeoutMs: number; minIntervalMs: number;
  infer?: (options: NadiaOptions) => Promise<NadiaResult>;
}
async function transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect(); let broken: Error | undefined;
  const disconnected = () => { broken = new Error('Nadia database connection failed'); };
  client.on('error', disconnected);
  try {
    await client.query('begin');
    await client.query("set local statement_timeout='5s'");
    const result = await fn(client); await client.query('commit'); return result;
  } catch (error) {
    try { await client.query('rollback'); } catch { broken = new Error('Nadia transaction failed'); }
    throw error;
  } finally { client.release(broken); client.off('error', disconnected); }
}

export async function processNextNadia(pool: Pool, options: NadiaWorkerOptions): Promise<boolean> {
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 10 || options.timeoutMs > 30000
    || !Number.isInteger(options.minIntervalMs) || options.minIntervalMs < 1000) throw new Error('Invalid Nadia limits');
  const scope = [options.organizationId, options.storeId];
  const claimed = await transaction(pool, async client => {
    const setting = (await client.query('select *,clock_timestamp() as current_time from nadia_settings where organization_id=$1 and store_id=$2 for update skip locked', scope)).rows[0];
    if (!setting || (setting.last_started_at && setting.current_time.getTime() - setting.last_started_at.getTime() < options.minIntervalMs)) return null;
    const job = (await client.query(`select r.* from nadia_runs r where organization_id=$1 and store_id=$2
      and ((state='pending' and next_attempt_at<=clock_timestamp()) or (state='generating' and lease_until<=clock_timestamp()))
      and (state='generating' or not exists(select 1 from nadia_runs active where active.organization_id=$1 and active.store_id=$2 and active.state='generating'))
      order by created_at,id for update skip locked limit 1`, scope)).rows[0];
    if (!job) return null;
    const conversation = (await client.query('select * from nadia_conversations where organization_id=$1 and store_id=$2 and conversation_id=$3', [...scope, job.conversation_id])).rows[0];
    if (!conversation?.enabled || job.attempt_count >= 2) {
      await client.query(`update nadia_runs set state=$2,error_category=$3,claim_token=null,lease_until=null,updated_at=now() where id=$1`, [job.id, conversation?.enabled ? 'failed' : 'cancelled', conversation?.enabled ? 'timeout' : 'paused']);
      return { skipped: true as const };
    }
    const token = randomUUID();
    await client.query(`update nadia_runs set state='generating',claim_token=$2,attempt_count=attempt_count+1,
      lease_until=clock_timestamp()+($3 * interval '1 millisecond'),conversation_version=$4,updated_at=now() where id=$1`,
    [job.id, token, options.timeoutMs + 30000, conversation.version]);
    await client.query('update nadia_settings set last_started_at=clock_timestamp() where organization_id=$1 and store_id=$2', scope);
    const history = await client.query(`select role,content from (
      select 'user' as role,m.body as content,m.created_at as at,m.id as source_id,0 as kind from messages m
      join messages target on target.id=$3 and target.organization_id=$1 and target.conversation_id=$4
      where m.organization_id=$1 and m.conversation_id=$4 and m.direction='in' and m.message_type='text' and (m.created_at,m.id)<=(target.created_at,target.id)
      union all
      select 'assistant',r.response,m.created_at,m.id,1 from nadia_runs r join messages m on m.id=r.source_message_id and m.organization_id=r.organization_id
      join messages target on target.id=$3 and target.organization_id=$1 and target.conversation_id=$4
      where r.organization_id=$1 and r.store_id=$2 and r.conversation_id=$4 and r.state='completed' and (m.created_at,m.id)<(target.created_at,target.id)
    ) context order by at desc,source_id desc,kind desc limit 20`, [...scope, job.source_message_id, job.conversation_id]);
    const firstContact = !(await client.query("select 1 from nadia_runs where organization_id=$1 and store_id=$2 and conversation_id=$3 and state='completed' limit 1", [...scope, job.conversation_id])).rowCount;
    const messages = history.rows.reverse().map(row => ({ role: row.role as 'user' | 'assistant', content: row.content as string }));
    let characters = messages.reduce((sum, message) => sum + message.content.length, 0);
    while (messages.length > 1 && characters > 12000) characters -= messages.shift()!.content.length;
    return { skipped: false as const, job, token, firstContact, messages };
  });
  if (!claimed) return false;
  if (claimed.skipped) return true;
  let reply: NadiaResult | undefined, failure: NadiaInferenceError['category'] | undefined;
  // No database transaction or row lock spans the provider call.
  try {
    reply = await (options.infer ?? generateNadiaReply)({ apiKey: options.apiKey, model: options.model, messages: claimed.messages, firstContact: claimed.firstContact, timeoutMs: options.timeoutMs });
    if (!reply.text.trim() || reply.text.length > 4096 || reply.model !== options.model) throw new NadiaInferenceError('invalid_response');
  } catch (error) { failure = error instanceof NadiaInferenceError ? error.category : 'provider'; }
  await transaction(pool, async client => {
    const setting = (await client.query('select * from nadia_settings where organization_id=$1 and store_id=$2 for update', scope)).rows[0];
    const conversation = (await client.query('select * from nadia_conversations where organization_id=$1 and store_id=$2 and conversation_id=$3 for update', [...scope, claimed.job.conversation_id])).rows[0];
    const job = (await client.query('select *,clock_timestamp() as current_time from nadia_runs where organization_id=$1 and store_id=$2 and id=$3 for update', [...scope, claimed.job.id])).rows[0];
    if (!job || job.state !== 'generating' || job.claim_token !== claimed.token || job.lease_until <= job.current_time) return;
    if (!setting || !conversation?.enabled || job.conversation_version !== conversation.version) {
      await client.query("update nadia_runs set state='cancelled',error_category='paused',claim_token=null,lease_until=null,updated_at=now() where id=$1", [job.id]); return;
    }
    if (failure || !reply) {
      const retry = job.attempt_count < 2 && ['timeout', 'rate_limit', 'provider'].includes(failure ?? 'provider');
      await client.query(`update nadia_runs set state=$2,error_category=$3,claim_token=null,lease_until=null,next_attempt_at=now()+interval '30 seconds',updated_at=now() where id=$1`, [job.id, retry ? 'pending' : 'failed', failure ?? 'provider']); return;
    }
    const inserted = await client.query(`insert into message_outbox(organization_id,store_id,conversation_id,requested_by,idempotency_key,body,origin,nadia_run_id)
      values($1,$2,$3,null,$4,$5,'nadia',$4) on conflict(organization_id,store_id,idempotency_key) do nothing returning id`, [...scope, job.conversation_id, job.id, reply.text]);
    if (!inserted.rowCount) throw new Error('Nadia outbox idempotency conflict');
    await client.query(`update nadia_runs set state='completed',response=$2,model=$3,error_category=null,claim_token=null,lease_until=null,updated_at=now() where id=$1`, [job.id, reply.text, reply.model]);
  });
  return true;
}
