import { test, expect } from '@playwright/test';
import { readWebConfig } from '../src/webConfig';
import { createHash } from 'node:crypto';

const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
function session() {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user };
}

test('Google login starts PKCE with a same-origin callback and S256 challenge', async ({ page }) => {
  let authorizationUrl = '';
  await page.route('http://127.0.0.1:54321/**', route => {
    authorizationUrl = route.request().url();
    return route.fulfill({ contentType: 'text/html', body: 'Synthetic Google handoff; no external provider contacted.' });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar con Google' }).click();
  await expect.poll(() => authorizationUrl).not.toBe('');
  const url = new URL(authorizationUrl), callback = new URL(url.searchParams.get('redirect_to')!);
  expect(url.pathname).toBe('/auth/v1/authorize'); expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('code_challenge_method')?.toLowerCase()).toBe('s256');
  expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(callback.origin).toBe('http://127.0.0.1:4173'); expect(callback.pathname).toBe('/auth/callback');
});

test('PKCE callback exchanges once, cleans the URL, sends bearer token and survives reload', async ({ page }) => {
  let exchanges = 0;
  let authorizationUrl = '';
  const data = session();
  await page.route('http://127.0.0.1:54321/**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/authorize')) {
      authorizationUrl = route.request().url();
      return route.fulfill({ contentType: 'text/html', body: 'Synthetic Google handoff.' });
    }
    expect(new URL(route.request().url()).searchParams.get('grant_type')).toBe('pkce');
    const body = route.request().postDataJSON();
    expect(body.auth_code).toBe('synthetic-code');
    expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(new URL(authorizationUrl).searchParams.get('code_challenge'));
    exchanges++; return route.fulfill({ json: data });
  });
  await page.route('**/api/**', route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${data.access_token}`);
    return route.fulfill({ json: { conversations: [], hasMore: false, nextOffset: 25 } });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Entrar con Google' }).click();
  await expect.poll(() => authorizationUrl).not.toBe('');
  const callbackUrl = new URL(new URL(authorizationUrl).searchParams.get('redirect_to')!);
  callbackUrl.searchParams.set('code', 'synthetic-code'); callbackUrl.searchParams.set('next', 'https://example.invalid/');
  await page.goto(callbackUrl.href);
  await expect(page.getByRole('heading', { name: 'Tu bandeja está al día' })).toBeVisible();
  expect(new URL(page.url()).origin).toBe('http://127.0.0.1:4173'); expect(new URL(page.url()).pathname).toBe('/');
  expect(new URL(page.url()).searchParams.has('code')).toBe(false); expect(exchanges).toBe(1);
  await page.reload(); await expect(page.getByRole('heading', { name: 'Tu bandeja está al día' })).toBeVisible(); expect(exchanges).toBe(1);
  expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer');
});

test('expired code displays a recoverable error without provider diagnostics or code in the URL', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sb-127-auth-token-code-verifier', JSON.stringify('synthetic-verifier')));
  await page.route('http://127.0.0.1:54321/**', route => route.fulfill({ status: 400, json: { message: 'sensitive diagnostic', code: 'bad_code_verifier' } }));
  await page.goto('/auth/callback?code=sensitive-code');
  await expect(page.getByRole('alert')).toContainText('No pudimos completar');
  await expect(page.locator('body')).not.toContainText('sensitive'); expect(page.url()).not.toContain('code=');
  await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeVisible();
});

test('callback opened in another browser cannot exchange without its verifier', async ({ page }) => {
  let externalRequests = 0;
  await page.route('http://127.0.0.1:54321/**', route => { externalRequests++; return route.fulfill({ status: 400 }); });
  await page.goto('/auth/callback?code=synthetic-code');
  await expect(page.getByRole('alert')).toContainText('este navegador'); expect(externalRequests).toBe(0);
});

for (const prefix of ['?', '#']) test(`cancelled Google return in ${prefix} is sanitized and allows retry`, async ({ page }) => {
  let apiReads = 0;
  await page.route('**/api/**', route => { apiReads++; return route.fulfill({ status: 401 }); });
  await page.goto(`/auth/callback${prefix}error=access_denied&error_description=sensitive-provider-text`);
  await expect(page.getByRole('alert')).toContainText('se canceló');
  await expect(page.locator('body')).not.toContainText('sensitive-provider-text');
  expect(page.url()).not.toContain('error'); expect(apiReads).toBe(0);
});

test('legacy token fragments are removed and never used to read the inbox', async ({ page }) => {
  let apiReads = 0;
  await page.route('**/api/**', route => { apiReads++; return route.fulfill({ status: 401 }); });
  await page.goto('/#access_token=synthetic-access&refresh_token=synthetic-refresh');
  await expect(page.getByRole('alert')).toContainText('ya no es compatible'); expect(new URL(page.url()).hash).toBe(''); expect(apiReads).toBe(0);
});

test('expired stored session with revoked refresh token returns to login without private reads', async ({ page }) => {
  let apiReads = 0;
  const expired = { ...session(), expires_at: 1 };
  await page.addInitScript(data => localStorage.setItem('sb-127-auth-token', JSON.stringify(data)), expired);
  await page.route('http://127.0.0.1:54321/**', route => route.fulfill({ status: 400, json: { message: 'Refresh token not found', code: 'refresh_token_not_found' } }));
  await page.route('**/api/**', route => { apiReads++; return route.fulfill({ status: 401 }); });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeVisible(); expect(apiReads).toBe(0);
});

test('configuration rejects invalid URL schemes and normalizes trailing slashes', () => {
  const values = { VITE_SUPABASE_URL: 'https://example.supabase.co/', VITE_SUPABASE_ANON_KEY: 'public-key', VITE_API_URL: 'http://localhost:4000/' };
  expect(readWebConfig(values)).toEqual({ supabaseUrl: 'https://example.supabase.co', publicKey: 'public-key', apiUrl: 'http://localhost:4000' });
  for (const url of ['not-a-url', 'javascript:alert(1)', 'https://user:pass@api.example.com', 'https://api.example.com/?token=secret']) expect(readWebConfig({ ...values, VITE_API_URL: url })).toBeNull();
  expect(readWebConfig({ ...values, VITE_SUPABASE_ANON_KEY: ' ' })).toBeNull();
});
