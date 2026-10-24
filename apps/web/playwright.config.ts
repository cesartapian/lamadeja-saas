import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test', fullyParallel: true, workers: 2, forbidOnly: Boolean(process.env.CI), retries: 0,
  reporter: 'list', timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 960 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'synthetic-public-key', VITE_API_URL: 'http://127.0.0.1:4173' },
  },
});
