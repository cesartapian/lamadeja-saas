import { Pool } from 'pg';
import { safeErrorCode } from './runtimeHealth.js';
import { config } from './config.js';
// Serverless deployments cannot use a certificate path from the developer's PC.
// When a CA is injected privately, pass it explicitly and retain hostname verification.
let connectionString = config.DATABASE_URL;
if (config.DATABASE_CA_PEM && connectionString) {
  const url = new URL(connectionString);
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) url.searchParams.delete(key);
  connectionString = url.href;
}
export const pool = new Pool({ connectionString,
  ...(config.DATABASE_CA_PEM ? { ssl: { ca: config.DATABASE_CA_PEM, rejectUnauthorized: true } } : {}), max: 5, connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS, query_timeout: config.WORKER_TIMEOUT_MS });

// Idle socket errors are emitted by Pool itself, outside request/worker catches.
// Handle them without dumping the client object (which contains credentials).
pool.on('error', error => { console.error(`Database idle connection failed (${safeErrorCode(error)})`); });
