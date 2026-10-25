import { pool } from './lib/database.js';
import { config } from './lib/config.js';
import { processNextOutbox } from './lib/processOutbox.js';
import { runWorker } from './lib/runWorker.js';
if (!config.DATABASE_URL || config.OUTBOX_MODE !== 'simulated') throw new Error('Outbox worker requires a dedicated DATABASE_URL and OUTBOX_MODE=simulated');
await runWorker({
  service: 'lamadeja-outbox-worker', pool,
  pollMs: config.WORKER_POLL_MS, timeoutMs: config.WORKER_TIMEOUT_MS, healthPort: config.WORKER_HEALTH_PORT,
  processNext: () => processNextOutbox(pool, {
    maxAttempts: config.WORKER_MAX_ATTEMPTS, retrySeconds: config.WORKER_RETRY_SECONDS, timeoutMs: config.WORKER_TIMEOUT_MS,
    scope: { organizationId: config.MVP_ORGANIZATION_ID, storeId: config.MVP_STORE_ID },
  }),
});
