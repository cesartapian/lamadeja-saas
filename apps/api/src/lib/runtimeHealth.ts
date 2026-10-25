import { createServer, type Server } from 'node:http';

export function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (/^[0-9A-Z]{5}$/.test(code)
    || ['ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) ? code : 'runtime_failure';
}
export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
export async function workerHealth(service: string, port: number | undefined, staleMs: number) {
  let successfulAt = 0, healthy = false;
  const server = port === undefined ? undefined : createServer((req, res) => {
    if (req.url !== '/health' && req.url !== '/ready') { res.writeHead(404).end(); return; }
    const ready = healthy && successfulAt > 0 && Date.now() - successfulAt < staleMs;
    res.writeHead(req.url === '/health' || ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service, status: ready ? 'ready' : 'not_ready' }));
  });
  if (server) await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => { server.off('error', reject); resolve(); });
  });
  const address = server?.address();
  return {
    port: address && typeof address !== 'string' ? address.port : undefined,
    success() { successfulAt = Date.now(); healthy = true; },
    failure() { healthy = false; },
    async close() { if (server) await closeServer(server); },
  };
}
