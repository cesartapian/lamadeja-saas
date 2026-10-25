import { setTimeout } from 'node:timers/promises';
import type { Pool } from 'pg';
import { safeErrorCode, workerHealth } from './runtimeHealth.js';

export async function runWorker(options: {
  service: string; pool: Pool; processNext: () => Promise<boolean>;
  pollMs: number; timeoutMs: number; healthPort?: number;
}) {
  const health = await workerHealth(options.service, options.healthPort, Math.max(60000, options.timeoutMs * 3, options.pollMs * 3));
  const idle = new AbortController();
  let stopping = false;
  const stop = () => { stopping = true; health.failure(); idle.abort(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    while (!stopping) {
      try {
        const worked = await options.processNext();
        health.success();
        if (worked) continue;
      } catch (error) { health.failure(); console.error(`${options.service} transaction failed; will retry (${safeErrorCode(error)})`); }
      await setTimeout(options.pollMs, undefined, { signal: idle.signal }).catch(error => {
        if (!stopping) throw error;
      });
    }
  } finally {
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    await health.close(); await options.pool.end();
  }
}
