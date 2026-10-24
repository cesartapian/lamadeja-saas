import { readFile, mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

test('phase dashboard filters phases and exposes integration limits without external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await page.setContent(await readFile(new URL('../../../docs/progress.html', import.meta.url), 'utf8'));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Qué está construido.');
  await expect(page.locator('.phase:visible')).toHaveCount(8);
  await page.getByRole('button', { name: 'Integraciones pendientes', exact: true }).click();
  await expect(page.locator('.phase:visible')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Supabase y Google reales' })).toBeVisible();
  await page.getByRole('button', { name: 'Por revisar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Outbox persistente simulada' })).toBeVisible();
  await page.getByText('Evidencia y próximo paso', { exact: true }).click();
  await expect(page.getByText('Falta revisión, integración', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Todo', exact: true }).click();
  await expect(page.locator('.phase:visible')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(external).toEqual([]);
  await mkdir('.impeccable/review', { recursive: true });
  await page.screenshot({ path: `.impeccable/review/progress-${test.info().project.name}.png`, fullPage: true });
});
