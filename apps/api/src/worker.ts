import { pool } from './lib/database.js';
import { config } from './lib/config.js';
import { processNext } from './lib/processInbox.js';
import { runWorker } from './lib/runWorker.js';
if (!config.DATABASE_URL) throw new Error('Worker requires a dedicated DATABASE_URL');
await runWorker({
  service: 'lamadeja-inbox-worker', pool,
  pollMs: config.WORKER_POLL_MS, timeoutMs: config.WORKER_TIMEOUT_MS, healthPort: config.WORKER_HEALTH_PORT,
  processNext: () => processNext(pool, {
    maxAttempts: config.WORKER_MAX_ATTEMPTS, retrySeconds: config.WORKER_RETRY_SECONDS, timeoutMs: config.WORKER_TIMEOUT_MS,
    scope: { organizationId: config.MVP_ORGANIZATION_ID, storeId: config.MVP_STORE_ID },
    nadiaEnabled: config.NADIA_MODE === 'simulated' && config.OUTBOX_MODE === 'simulated',
  }),
});
