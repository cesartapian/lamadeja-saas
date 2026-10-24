// Read-only, opt-in smoke check. Never print bearer tokens or response bodies.
const { AUTH_CHECK_API_URL, AUTH_CHECK_ACCESS_TOKEN, AUTH_CHECK_ORGANIZATION_ID, AUTH_CHECK_STORE_ID } = process.env;
try {
  if (![AUTH_CHECK_API_URL, AUTH_CHECK_ACCESS_TOKEN, AUTH_CHECK_ORGANIZATION_ID, AUTH_CHECK_STORE_ID].every(Boolean)) throw new Error('Define AUTH_CHECK_API_URL, AUTH_CHECK_ACCESS_TOKEN, AUTH_CHECK_ORGANIZATION_ID and AUTH_CHECK_STORE_ID in a private environment file.');
  const base = new URL(AUTH_CHECK_API_URL);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('API URL must be an HTTP(S) base URL without credentials, query or fragment.');
  const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (!localhost && (base.protocol !== 'https:' || process.env.AUTH_CHECK_ALLOW_REMOTE !== 'true')) throw new Error('Remote checks require HTTPS and AUTH_CHECK_ALLOW_REMOTE=true; use an isolated test API.');
  const request = async (path, authenticated) => fetch(`${base.href.replace(/\/+$/, '')}${path}`, {
    headers: authenticated ? { Authorization: `Bearer ${AUTH_CHECK_ACCESS_TOKEN}` } : {}, signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  const anonymous = await request('/api/me', false);
  if (anonymous.status !== 401) throw new Error(`Anonymous access: expected 401, received ${anonymous.status}.`);
  const authenticated = await request('/api/me', true);
  if (authenticated.status !== 200) throw new Error(`Authenticated access: expected 200, received ${authenticated.status}.`);
  const scope = await authenticated.json();
  if (scope.organizationId !== AUTH_CHECK_ORGANIZATION_ID || scope.storeId !== AUTH_CHECK_STORE_ID) throw new Error('Authenticated organization/store does not match the expected test scope.');
  const conversations = await request('/api/conversations?limit=1', true);
  if (conversations.status !== 200) throw new Error(`Conversation read: expected 200, received ${conversations.status}.`);
  const result = await conversations.json();
  if (!Array.isArray(result.conversations) || result.conversations.some(row => row.organization_id !== AUTH_CHECK_ORGANIZATION_ID || row.store_id !== AUTH_CHECK_STORE_ID)) throw new Error('Conversation response does not match the expected test scope.');
  console.info('PASS: anonymous denied; authenticated identity and tenant scope verified; conversations readable. No writes performed.');
} catch (error) {
  // Network/parsing errors can contain URLs or internal details; keep them private.
  const message = error instanceof Error && !['TypeError', 'SyntaxError', 'TimeoutError'].includes(error.name) ? error.message : 'Connection or response validation failed.';
  console.error(`FAIL: ${message}`); process.exitCode = 1;
}
