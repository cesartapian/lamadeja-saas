const port = process.env.WORKER_HEALTH_PORT || process.env.PORT || '4000';
try {
  if (!/^\d+$/.test(port)) throw new Error('Invalid port');
  const response = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) process.exitCode = 1;
} catch { process.exitCode = 1; }
export {};
