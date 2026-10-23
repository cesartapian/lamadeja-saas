import { setTimeout } from 'node:timers/promises';
import { pool } from './lib/database.js';
import { config } from './lib/config.js';
import { processNext } from './lib/processInbox.js';
let stopping = false;
if (!config.DATABASE_URL) throw new Error('Worker requires a dedicated DATABASE_URL');
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
try {
  while (!stopping) {
    try {
      if (await processNext(pool, { maxAttempts: config.WORKER_MAX_ATTEMPTS, retrySeconds: config.WORKER_RETRY_SECONDS, timeoutMs: config.WORKER_TIMEOUT_MS })) continue;
    } catch { console.error('Inbox worker transaction failed; will retry'); }
    await setTimeout(config.WORKER_POLL_MS);
  }
} finally { await pool.end(); }
