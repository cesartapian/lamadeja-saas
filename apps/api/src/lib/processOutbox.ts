import type { Pool } from 'pg';
import type { WorkerOptions } from './processInbox.js';

export interface SimulationJob { id: string; body: string }
export interface SimulationProvider { simulate(job: SimulationJob, signal: AbortSignal): Promise<string> }
// No network or real WhatsApp transport. Stable receipt makes simulation replay harmless.
export const simulatedProvider: SimulationProvider = {
  async simulate(job, signal) { signal.throwIfAborted(); return `simulation:${job.id}`; },
};

export async function processNextOutbox(database: Pool, options: WorkerOptions, provider: SimulationProvider = simulatedProvider): Promise<boolean> {
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('statement_timeout',$1,true),set_config('idle_in_transaction_session_timeout',$1,true)`, [String(options.timeoutMs)]);
    const { rows } = await client.query(`select * from message_outbox where provider='simulated' and status in ('pending','retrying') and attempt_count < max_attempts and next_attempt_at <= now() order by next_attempt_at,created_at,id for update skip locked limit 1`);
    const job = rows[0];
    if (!job) { await client.query('commit'); return false; }
    await client.query(`update message_outbox set status='processing',attempt_count=attempt_count+1,updated_at=now() where id=$1`, [job.id]);
    await client.query('savepoint simulation_work');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    try {
      // Enforce a deadline even if a test provider ignores the cancellation signal.
      const receipt = await Promise.race([
        provider.simulate({ id: job.id, body: job.body }, abort.signal),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('Simulation timed out')); }, Math.max(1, Math.floor(options.timeoutMs / 2))); }),
      ]);
      if (!receipt.startsWith('simulation:')) throw new Error('Invalid simulation receipt');
      await client.query(`update message_outbox set status='simulated',simulation_receipt=$2,completed_at=now(),last_error=null,updated_at=now() where id=$1`, [job.id, receipt]);
    } catch {
      await client.query('rollback to savepoint simulation_work');
      await client.query(`update message_outbox set status=case when attempt_count >= max_attempts then 'failed' else 'retrying' end,last_error='simulation_failed',next_attempt_at=now()+($2 * interval '1 second'),updated_at=now() where id=$1`, [job.id, options.retrySeconds * 2 ** Math.min(job.attempt_count, 10)]);
    } finally { if (timer) clearTimeout(timer); abort.abort(); }
    await client.query('commit');
    return true;
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
  finally { client.release(); }
}
