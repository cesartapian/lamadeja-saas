import { readFile } from 'node:fs/promises';

// Read-only checks for the explicitly selected development project.
try {
  process.loadEnvFile('apps/web/.env');
  const ref = process.env.DEV_SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z]{20}$/.test(ref)) throw new Error('Set DEV_SUPABASE_PROJECT_REF to the intended development project ref.');
  const cloud = new URL(process.env.VITE_SUPABASE_URL);
  const api = new URL(process.env.VITE_API_URL);
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (cloud.protocol !== 'https:' || cloud.hostname !== `${ref}.supabase.co` || cloud.username || cloud.password || cloud.search || cloud.hash) throw new Error('Frontend Auth URL does not match the selected development project.');
  if (!['http:', 'https:'].includes(api.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname) || api.username || api.password || api.search || api.hash) throw new Error('The API check is restricted to a local development server.');
  if (!key || key.startsWith('sb_secret_')) throw new Error('A public client key is required.');
  const get = (url, headers = {}) => fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  const settingsResponse = await get(new URL('/auth/v1/settings', cloud), { apikey: key });
  if (!settingsResponse.ok) throw new Error(`Public Auth settings unavailable (${settingsResponse.status}).`);
  const settings = await settingsResponse.json();
  const anonymousRead = await get(new URL('/rest/v1/organizations?select=id&limit=1', cloud), { apikey: key });
  if (anonymousRead.status === 200) {
    const rows = await anonymousRead.json();
    if (!Array.isArray(rows) || rows.length) throw new Error('Unexpected anonymous access to organization rows.');
  } else if (![401, 403].includes(anonymousRead.status)) throw new Error(`Unexpected Data API response (${anonymousRead.status}).`);
  const base = api.href.replace(/\/+$/, '');
  const health = await get(`${base}/health`);
  if (!health.ok) throw new Error(`Local API health failed (${health.status}).`);
  const missing = await get(`${base}/api/me`);
  if (missing.status !== 401) throw new Error(`Anonymous API request was not rejected (${missing.status}).`);
  const forged = await get(`${base}/api/me`, { Authorization: 'Bearer invalid-development-token' });
  if (forged.status !== 401) throw new Error(`Invalid-token API request was not rejected (${forged.status}).`);
  const apiEnv = await readFile('apps/api/.env', 'utf8');
  console.info(JSON.stringify({
    checks: 'passed', project_ref: ref, local_api: 'healthy', anonymous_data_access: 'denied',
    missing_token_status: missing.status, invalid_token_status: forged.status,
    google_enabled: Boolean(settings.external?.google),
    database_connection_configured: /^DATABASE_URL=\s*\S+/m.test(apiEnv),
    real_google_login_tested: false,
  }, null, 2));
} catch (error) {
  const safe = error instanceof Error && !['TypeError', 'SyntaxError', 'TimeoutError'].includes(error.name)
    ? error.message : 'Connection or response validation failed.';
  console.error(`FAIL: ${safe}`); process.exitCode = 1;
}
