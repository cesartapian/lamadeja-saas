import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { beginSandboxDispatch, claimSandboxJob, completeSandboxDispatch, recoverSandboxClaim, type DispatchOutcome, type SandboxJob } from './sandboxDispatch.js';

const uuid = z.string().uuid();
const scopeSchema = z.object({ organizationId: uuid, storeId: uuid, channelId: uuid });
export interface SandboxScope { organizationId: string; storeId: string; channelId: string }
export interface StoredSandboxJob extends SandboxJob {
  id: string; version: number; conversationId: string; requestedBy: string; recipient: string; body: string;
}
export interface SandboxClaim { id: string; version: number; claimToken: string }
interface Row {
  id: string; version: number; state: SandboxJob['state']; attempts: number; max_attempts: number;
  conversation_id: string; requested_by: string; recipient: string; body: string;
  next_attempt_at: Date; lease_until: Date | null; claim_token: string | null; provider_message_id: string | null;
}
function stored(row: Row): StoredSandboxJob {
  return { id: row.id, version: row.version, conversationId: row.conversation_id, requestedBy: row.requested_by, recipient: row.recipient, body: row.body,
    state: row.state, attempts: row.attempts, maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at.getTime(), claimToken: row.claim_token, leaseUntil: row.lease_until?.getTime() ?? null, providerMessageId: row.provider_message_id };
}

// Preparatory trusted-backend repository. Not mounted in an API or worker.
// Never call a network provider from these short transactions.
export function sandboxRepository(pool: Pool, scopeInput: SandboxScope) {
  const scope = scopeSchema.parse(scopeInput);
  const params = [scope.organizationId, scope.storeId, scope.channelId];
  async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    let releaseError: Error | undefined;
    const onConnectionError = () => { releaseError = new Error('Sandbox connection failed'); };
    client.on('error', onConnectionError);
    try {
      await client.query('begin');
      await client.query("set local statement_timeout='5s'; set local idle_in_transaction_session_timeout='10s'");
      const result = await work(client);
      await client.query('commit');
      return result;
    } catch (error) {
      try { await client.query('rollback'); }
      catch { releaseError = new Error('Sandbox transaction rollback failed'); }
      throw error;
    } finally { client.release(releaseError); client.off('error', onConnectionError); }
  }
  async function time(client: PoolClient): Promise<number> {
    return (await client.query('select floor(extract(epoch from clock_timestamp())*1000)::float8 as now_ms')).rows[0].now_ms;
  }
  async function persist(client: PoolClient, row: Row, next: SandboxJob, requireLiveClaim = false): Promise<StoredSandboxJob> {
    const result = await client.query(`update sandbox_dispatch set state=$6,attempts=$7,next_attempt_at=$8,
      claim_token=$9,lease_until=$10,provider_message_id=$11,version=version+1,updated_at=clock_timestamp()
      where organization_id=$1 and store_id=$2 and channel_id=$3 and id=$4 and version=$5
      and (not $12::boolean or lease_until > clock_timestamp()) returning *`,
    [...params, row.id, row.version, next.state, next.attempts, new Date(next.nextAttemptAt), next.claimToken,
      next.leaseUntil === null ? null : new Date(next.leaseUntil), next.providerMessageId, requireLiveClaim]);
    if (result.rowCount !== 1) throw new Error('Sandbox transition lost its version');
    return stored(result.rows[0]);
  }
  async function transition(ref: SandboxClaim, expectedState: 'claimed' | 'dispatching', change: (job: SandboxJob, now: number) => SandboxJob): Promise<StoredSandboxJob | null> {
    uuid.parse(ref.id); uuid.parse(ref.claimToken); z.number().int().nonnegative().parse(ref.version);
    return transaction(async client => {
      const result = await client.query('select * from sandbox_dispatch where organization_id=$1 and store_id=$2 and channel_id=$3 and id=$4 for update', [...params, ref.id]);
      const row: Row | undefined = result.rows[0];
      const now = await time(client);
      if (!row || row.version !== ref.version || row.claim_token !== ref.claimToken || row.state !== expectedState
        || row.lease_until === null || row.lease_until.getTime() <= now) return null;
      return persist(client, row, change(stored(row), now), true);
    });
  }
  return {
    async enqueue(input: { conversationId: string; requestedBy: string; idempotencyKey: string; recipient: string; body: string; maxAttempts?: number }): Promise<{ job: StoredSandboxJob; created: boolean }> {
      const data = z.object({ conversationId: uuid, requestedBy: uuid, idempotencyKey: uuid,
        recipient: z.string().regex(/^\+[1-9][0-9]{7,14}$/), body: z.string().max(4096).refine(value => value.trim().length > 0),
        maxAttempts: z.number().int().min(1).max(100).default(5) }).parse(input);
      return transaction(async client => {
        const membership = await client.query('select 1 from organization_members where organization_id=$1 and user_id=$2 for key share', [scope.organizationId, data.requestedBy]);
        if (!membership.rowCount) throw new Error('Sandbox requester is not an organization member');
        const inserted = await client.query(`insert into sandbox_dispatch(organization_id,store_id,channel_id,conversation_id,requested_by,idempotency_key,recipient,body,max_attempts)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(organization_id,store_id,idempotency_key) do nothing returning *`,
        [...params, data.conversationId, data.requestedBy, data.idempotencyKey, data.recipient, data.body, data.maxAttempts]);
        if (inserted.rowCount) return { job: stored(inserted.rows[0]), created: true };
        const existing = (await client.query('select * from sandbox_dispatch where organization_id=$1 and store_id=$2 and idempotency_key=$3 for update', [scope.organizationId, scope.storeId, data.idempotencyKey])).rows[0];
        if (!existing || existing.channel_id !== scope.channelId || existing.conversation_id !== data.conversationId || existing.requested_by !== data.requestedBy
          || existing.recipient !== data.recipient || existing.body !== data.body || existing.max_attempts !== data.maxAttempts) throw new Error('Sandbox idempotency conflict');
        return { job: stored(existing), created: false };
      });
    },
    async claim(leaseMs = 30000): Promise<StoredSandboxJob | null> {
      z.number().int().min(1000).max(300000).parse(leaseMs);
      return transaction(async client => {
        const result = await client.query(`select * from sandbox_dispatch where organization_id=$1 and store_id=$2 and channel_id=$3
          and state in ('queued','retry_wait') and attempts < max_attempts and next_attempt_at <= clock_timestamp()
          order by next_attempt_at,created_at,id for update skip locked limit 1`, params);
        if (!result.rowCount) return null;
        return persist(client, result.rows[0], claimSandboxJob(stored(result.rows[0]), randomUUID(), await time(client), leaseMs));
      });
    },
    begin(ref: SandboxClaim) {
      return transition(ref, 'claimed', (job, now) => beginSandboxDispatch(job, ref.claimToken, now));
    },
    complete(ref: SandboxClaim, outcome: DispatchOutcome, retryBaseMs = 30000) {
      return transition(ref, 'dispatching', (job, now) => completeSandboxDispatch(job, ref.claimToken, now, outcome, retryBaseMs));
    },
    async recover(limit = 100): Promise<StoredSandboxJob[]> {
      z.number().int().min(1).max(1000).parse(limit);
      return transaction(async client => {
        const result = await client.query(`select * from sandbox_dispatch where organization_id=$1 and store_id=$2 and channel_id=$3
          and state in ('claimed','dispatching') and lease_until <= clock_timestamp()
          order by lease_until,id for update skip locked limit $4`, [...params, limit]);
        const now = await time(client), recovered: StoredSandboxJob[] = [];
        for (const row of result.rows) recovered.push(await persist(client, row, recoverSandboxClaim(stored(row), now)));
        return recovered;
      });
    },
  };
}
