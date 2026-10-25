import { Pool } from 'pg';
import { safeErrorCode } from './runtimeHealth.js';
import { config } from './config.js';
export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 5, connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS, query_timeout: config.WORKER_TIMEOUT_MS });

// Idle socket errors are emitted by Pool itself, outside request/worker catches.
// Handle them without dumping the client object (which contains credentials).
pool.on('error', error => { console.error(`Database idle connection failed (${safeErrorCode(error)})`); });
