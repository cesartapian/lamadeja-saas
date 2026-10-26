import { test, expect, type Page, type Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const first = '00000000-0000-4000-8000-000000000011', second = '00000000-0000-4000-8000-000000000012';
const stamp = '2026-10-23T14:32:00Z';
const conversations = [
  { id: first, contact_id: first, contact_name: 'Camila Soto', contact_phone: '56912345678', status: 'open', updated_at: stamp, last_message: 'Hola, ¿tienen lana merino en color crudo?', last_message_type: 'text' },
  { id: second, contact_id: second, contact_name: 'Daniela Rojas', contact_phone: '56987654321', status: 'open', updated_at: stamp, last_message: 'Muchas gracias por la información.', last_message_type: 'text' },
];
const message = (id: string, body: string, direction = 'in') => ({ id, body, direction, message_type: 'text', created_at: stamp, sent_at: stamp });
async function authenticate(page: Page) {
  const user = { id: '00000000-0000-4000-8000-000000000001', email: 'equipo.pruebas@example.com', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: stamp };
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: user.id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic-signature`;
  await page.addInitScript(({ token, user }) => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user })), { token, user });
  await page.route('http://127.0.0.1:54321/**', route => route.fulfill({ json: user }));
  return token;
}
async function apiRoute(route: Route) {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith('/nadia')) return route.fulfill({ json: { available: false } });
  if (url.pathname === '/api/conversations') return route.fulfill({ json: { conversations, hasMore: true, nextOffset: 25 } });
  if (url.pathname.includes('/messages')) return route.fulfill({ json: { messages: [message('newest', 'Hola, ¿tienen lana merino en color crudo?'), message('previous', '¡Hola! Quisiera consultar por los colores disponibles.')], hasMore: true, nextOffset: 50 } });
  const contact = url.pathname.includes(second) ? conversations[1] : conversations[0];
  return route.fulfill({ json: { contact: { id: contact.id, display_name: contact.contact_name, external_contact_id: contact.contact_phone, created_at: stamp, updated_at: stamp } } });
}
async function openFirst(page: Page) {
  await page.getByRole('button', { name: /Camila Soto/ }).click();
  await expect(page.getByRole('heading', { name: 'Camila Soto', exact: true, level: 2 })).toBeVisible();
}

test('authenticated inbox, pagination, contact, chronological history and responsive navigation', async ({ page }, info) => {
  const token = await authenticate(page);
  await page.route('**/api/**', async route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    const url = new URL(route.request().url());
    if (url.searchParams.get('offset') === '25') return route.fulfill({ json: { conversations: [{ ...conversations[1], id: 'third', contact_name: 'Paula Díaz' }], hasMore: false, nextOffset: 50 } });
    if (url.searchParams.get('offset') === '50') return route.fulfill({ json: { messages: [message('oldest', 'Consulta anterior de prueba.')], hasMore: false, nextOffset: 100 } });
    return apiRoute(route);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cargar más conversaciones' }).click();
  await expect(page.getByRole('button', { name: /Paula Díaz/ })).toBeVisible();
  await openFirst(page);
  await expect(page.locator('.message p')).toHaveText(['¡Hola! Quisiera consultar por los colores disponibles.', 'Hola, ¿tienen lana merino en color crudo?']);
  await page.getByRole('button', { name: 'Cargar mensajes anteriores' }).click();
  await expect(page.locator('.message p')).toHaveText(['Consulta anterior de prueba.', '¡Hola! Quisiera consultar por los colores disponibles.', 'Hola, ¿tienen lana merino en color crudo?']);
  if (info.project.name === 'mobile') await page.getByText('Ficha del contacto', { exact: false }).click();
  await expect(page.getByText('+56912345678', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const output = resolve('.impeccable/review'); await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, `${info.project.name}.png`), fullPage: true });
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Volver a conversaciones' }).click();
    await expect(page.getByRole('heading', { name: 'Conversaciones', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Camila Soto/ })).toBeFocused();
  }
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Camila Soto/ })).toHaveCount(0);
});

test('empty inbox has an explanatory state', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => route.fulfill({ json: { conversations: [], hasMore: false, nextOffset: 25 } }));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Tu bandeja está al día' })).toBeVisible();
});

test('service errors can be retried without losing the session', async ({ page }) => {
  await authenticate(page); let failing = true;
  await page.route('**/api/**', route => failing ? route.fulfill({ status: 503 }) : apiRoute(route));
  await page.goto('/'); await expect(page.getByRole('alert')).toContainText('No pudimos cargar');
  failing = false; await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByRole('button', { name: /Camila Soto/ })).toBeVisible();
});

for (const status of [401, 403]) test(`${status} removes private content and explains access recovery`, async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => route.request().url().includes('/messages') ? route.fulfill({ status }) : apiRoute(route));
  await page.goto('/'); await page.getByRole('button', { name: /Camila Soto/ }).click();
  await expect(page.getByRole('heading', { name: status === 401 ? 'Tu sesión ha caducado' : 'Tu cuenta necesita acceso' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Camila Soto/ })).toHaveCount(0);
});

test('late responses from another conversation never replace the current selection', async ({ page }, info) => {
  await authenticate(page);
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes(first) && url.includes('/messages')) {
      await new Promise(resolve => setTimeout(resolve, 250));
      await route.fulfill({ json: { messages: [message('late', 'Respuesta atrasada de Camila')], hasMore: false, nextOffset: 50 } }).catch(() => {}); return;
    }
    if (url.includes(second) && url.includes('/messages')) return route.fulfill({ json: { messages: [message('current', 'Mensaje de Daniela')], hasMore: false, nextOffset: 50 } });
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Volver a conversaciones' }).click();
  await page.getByRole('button', { name: /Daniela Rojas/ }).click();
  await expect(page.locator('.message p')).toHaveText(['Mensaje de Daniela']);
  await page.waitForTimeout(300);
  await expect(page.locator('.message p')).toHaveText(['Mensaje de Daniela']);
});

test('empty history, independent contact error and retry', async ({ page }, info) => {
  await authenticate(page); let failing = true;
  await page.route('**/api/**', route => {
    const url = route.request().url();
    if (url.includes('/messages')) return route.fulfill({ json: { messages: [], hasMore: false, nextOffset: 50 } });
    if (url.includes('/contacts/') && failing) return route.fulfill({ status: 503 });
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  await expect(page.getByRole('heading', { name: 'Aún no hay mensajes' })).toBeVisible();
  if (info.project.name === 'mobile') await page.getByText('Ficha del contacto', { exact: false }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  failing = false; await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('+56912345678', { exact: true })).toBeVisible();
});

test('unsupported messages and long unbroken text remain readable without horizontal overflow', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => route.request().url().includes('/messages') ? route.fulfill({ json: {
    messages: [{ ...message('image', ''), message_type: 'image' }, message('long', 'prueba'.repeat(200))], hasMore: false, nextOffset: 50,
  } }) : apiRoute(route));
  await page.goto('/'); await openFirst(page);
  await expect(page.getByText('Mensaje de tipo image. Su contenido no está disponible en esta bandeja.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('unsigned visitor sees Google login without reading private APIs', async ({ page }) => {
  let requests = 0; await page.route('**/api/**', route => { requests++; return route.fulfill({ status: 401 }); });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Entrar con Google' })).toBeVisible(); expect(requests).toBe(0);
});

test('keyboard can scroll long history and narrow reflow does not overflow', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => route.request().url().includes('/messages') ? route.fulfill({ json: {
    messages: Array.from({ length: 30 }, (_, n) => message(`message-${n}`, `Mensaje de prueba ${n}: ` + 'Texto para comprobar la lectura y el desplazamiento con teclado. '.repeat(4))), hasMore: false, nextOffset: 50,
  } }) : apiRoute(route));
  await page.goto('/'); await openFirst(page);
  const history = page.getByRole('region', { name: 'Historial de mensajes' });
  await expect(history.locator('.message')).toHaveCount(30);
  await history.focus(); await page.keyboard.press('Home');
  await expect.poll(() => history.evaluate(element => element.scrollTop)).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(() => history.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  // 720 CSS px is the reflow width of a 1440px display at 200% zoom.
  await page.setViewportSize({ width: 720, height: 480 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const summary = page.locator('.contact-details summary');
  await summary.focus();
  if ((await page.locator('.contact-details').getAttribute('open')) === null) await page.keyboard.press('Enter');
  await expect(page.getByText('+56912345678', { exact: true })).toBeVisible();
});

test('simulation composer shows durable queue states without claiming a real send', async ({ page }) => {
  await authenticate(page);
  let items: { id: string; conversation_id: string; body: string; status: string; attempt_count: number; max_attempts: number; created_at: string; completed_at: string | null }[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/outbox/capabilities') return route.fulfill({ json: { mode: 'simulated' } });
    if (path.endsWith('/outbox')) {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON();
        expect(input.body).toBe('Respuesta de prueba');
        expect(input.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
        items = [{ id: 'queued', conversation_id: first, body: input.body, status: 'pending', attempt_count: 0, max_attempts: 5, created_at: stamp, completed_at: null }];
        return route.fulfill({ status: 202, json: { item: items[0] } });
      }
      return route.fulfill({ json: { items, hasMore: false, nextOffset: 25 } });
    }
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  const composer = page.getByRole('region', { name: 'Bandeja de salida simulada' });
  await expect(composer.getByRole('button', { name: 'Simular envío' })).toBeDisabled();
  await page.getByLabel('Mensaje de prueba', { exact: true }).fill('Respuesta de prueba');
  await composer.getByRole('button', { name: 'Simular envío' }).click();
  await expect(composer.getByText('Pendiente · Intentos 0/5')).toBeVisible();
  await expect(page.getByLabel('Mensaje de prueba', { exact: true })).toHaveValue('');
  items[0].status = 'simulated'; items[0].attempt_count = 1; items[0].completed_at = stamp;
  await composer.getByRole('button', { name: 'Actualizar simulaciones' }).click();
  await expect(composer.getByText('Simulado · sin envío real · Intentos 1/5')).toBeVisible();
  await expect(composer.getByText('Solo pruebas: ningún mensaje se envía a WhatsApp.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('ambiguous submission retries keep the same idempotency key and draft', async ({ page }) => {
  await authenticate(page);
  const keys: string[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/outbox/capabilities') return route.fulfill({ json: { mode: 'simulated' } });
    if (path.endsWith('/outbox')) {
      if (route.request().method() === 'POST') {
        keys.push(route.request().postDataJSON().idempotencyKey);
        if (keys.length === 1) return route.abort();
        return route.fulfill({ status: 200, json: { item: { id: 'existing' } } });
      }
      return route.fulfill({ json: { items: [], hasMore: false, nextOffset: 25 } });
    }
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  await page.getByLabel('Mensaje de prueba', { exact: true }).fill('No duplicar');
  await page.getByRole('button', { name: 'Simular envío' }).click();
  await expect(page.getByRole('alert')).toContainText('conserva la misma solicitud');
  await expect(page.getByLabel('Mensaje de prueba', { exact: true })).toHaveValue('No duplicar');
  await page.getByRole('button', { name: 'Simular envío' }).click();
  await expect(page.getByLabel('Mensaje de prueba', { exact: true })).toHaveValue('');
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});

test('disabled simulation keeps inbox read-only; exhausted jobs are labeled as failures', async ({ page }) => {
  await authenticate(page);
  let mode = 'disabled';
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/outbox/capabilities') return route.fulfill({ json: { mode } });
    if (path.endsWith('/outbox')) return route.fulfill({ json: { items: [{ id: 'failed', body: 'Prueba fallida', status: 'failed', attempt_count: 2, max_attempts: 2 }], hasMore: false, nextOffset: 25 } });
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  await expect(page.getByText('Bandeja de solo lectura. La simulación está deshabilitada.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simular envío' })).toHaveCount(0);
  mode = 'simulated'; await page.reload(); await openFirst(page);
  await expect(page.getByText('Falló la simulación · Intentos 2/2')).toBeVisible();
});

test('Nadia pauses only the selected conversation and labels AI simulations', async ({ page }) => {
  await authenticate(page);
  let enabled = true;
  const toggles: string[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/nadia')) {
      if (route.request().method() === 'POST') { toggles.push(path); enabled = route.request().postDataJSON().enabled; return route.fulfill({ json: { enabled } }); }
      return route.fulfill({ json: { available: true, active: enabled, canManage: true, runs: [] } });
    }
    if (path === '/api/outbox/capabilities') return route.fulfill({ json: { mode: 'simulated', nadia: true } });
    if (path.endsWith('/outbox')) return route.fulfill({ json: { items: [{ id: first, origin: 'nadia', body: 'Soy Nadia, asistente virtual con inteligencia artificial.', status: enabled ? 'simulated' : 'cancelled', attempt_count: 1, max_attempts: 5 }], hasMore: false, nextOffset: 25 } });
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  const toggle = page.getByRole('switch', { name: 'Nadia en esta conversación' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Nadia · IA · Simulado · sin envío real', { exact: false })).toBeVisible();
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Pausada · no se generan respuestas automáticas')).toBeVisible();
  expect(toggles).toEqual([`/api/conversations/${first}/nadia`]);
  await expect(page.getByRole('switch')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
});

test('Nadia permission rejection keeps the authenticated inbox open', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/nadia')) return route.request().method() === 'POST' ? route.fulfill({ status: 403 })
      : route.fulfill({ json: { available: true, active: true, canManage: true, runs: [] } });
    return apiRoute(route);
  });
  await page.goto('/'); await openFirst(page);
  await page.getByRole('switch', { name: 'Nadia en esta conversación' }).click();
  await expect(page.getByText('No pudimos cambiar la pausa de Nadia. Tu sesión sigue abierta.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Camila Soto', exact: true, level: 2 })).toBeVisible();
});
