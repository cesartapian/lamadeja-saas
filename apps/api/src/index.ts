import { app } from './app.js';
import { config } from './lib/config.js';
import { pool } from './lib/database.js';
import { closeServer, safeErrorCode } from './lib/runtimeHealth.js';

const server = app.listen(config.PORT, () => console.info(`API listening on ${config.PORT}`));

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true; app.locals.stopping = true;
  const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, config.WORKER_TIMEOUT_MS + config.DATABASE_CONNECTION_TIMEOUT_MS + 5000);
  deadline.unref();
  try { await closeServer(server); await pool.end(); }
  catch (error) { console.error(`API shutdown failed (${safeErrorCode(error)})`); process.exitCode = 1; }
  finally { clearTimeout(deadline); }
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
