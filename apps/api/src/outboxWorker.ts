import { setTimeout } from 'node:timers/promises';
import { pool } from './lib/database.js';
import { config } from './lib/config.js';
import { processNextOutbox } from './lib/processOutbox.js';
if (!config.DATABASE_URL || config.OUTBOX_MODE !== 'simulated') throw new Error('Outbox worker requires a dedicated DATABASE_URL and OUTBOX_MODE=simulated');
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
try {
  while (!stopping) {
    try {
      if (await processNextOutbox(pool, { maxAttempts: config.WORKER_MAX_ATTEMPTS, retrySeconds: config.WORKER_RETRY_SECONDS, timeoutMs: config.WORKER_TIMEOUT_MS })) continue;
    } catch { console.error('Simulation worker transaction failed; will retry'); }
    await setTimeout(config.WORKER_POLL_MS);
  }
} finally { await pool.end(); }
