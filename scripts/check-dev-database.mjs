import { Client } from 'pg';
import { validateDevelopmentDatabase, databaseFailureMessage } from './lib/dev-database.mjs';

let client;
try {
  // Run from the repository root. Existing shell bindings take precedence.
  try { process.loadEnvFile('apps/api/.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Unsafe TLS configuration.');
  const connectionString = validateDevelopmentDatabase(process.env.DATABASE_URL, process.env.DEV_SUPABASE_PROJECT_REF);
  client = new Client({ connectionString, connectionTimeoutMillis: 10000, query_timeout: 10000,
    options: '-c default_transaction_read_only=on -c statement_timeout=10000' });
  await client.connect();
  const result = await client.query('select ssl from pg_stat_ssl where pid=pg_backend_pid()');
  if (result.rows[0]?.ssl !== true) throw new Error('TLS was not negotiated.');
  console.info('PASS: development PostgreSQL connection authenticated with verified TLS. Read-only check; no application data queried or changed.');
} catch (error) {
  console.error(`FAIL: ${databaseFailureMessage(error)}`);
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
