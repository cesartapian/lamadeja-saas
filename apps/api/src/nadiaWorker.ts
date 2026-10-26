import { pool } from './lib/database.js';
import { config } from './lib/config.js';
import { runWorker } from './lib/runWorker.js';
import { processNextNadia } from './lib/processNadia.js';

if (!config.DATABASE_URL || config.NADIA_MODE !== 'simulated' || config.OUTBOX_MODE !== 'simulated' || !config.NVIDIA_API_KEY || !config.NADIA_MODEL) throw new Error('Nadia requires explicit simulation and NVIDIA configuration');
const apiKey = config.NVIDIA_API_KEY, model = config.NADIA_MODEL;
await runWorker({ service: 'lamadeja-nadia-worker', pool, pollMs: config.WORKER_POLL_MS,
  timeoutMs: config.NADIA_TIMEOUT_MS, healthPort: config.WORKER_HEALTH_PORT,
  processNext: () => processNextNadia(pool, { organizationId: config.MVP_ORGANIZATION_ID, storeId: config.MVP_STORE_ID,
    apiKey, model, timeoutMs: config.NADIA_TIMEOUT_MS, minIntervalMs: config.NADIA_MIN_INTERVAL_MS }),
});
