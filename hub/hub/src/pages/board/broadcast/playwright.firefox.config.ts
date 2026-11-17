// Playwright for Broadcast across engines: pages/board/broadcast.spec.ts (hub:check runs it on Chromium) on Chromium
// and on Firefox, so a browser's limit is proven in that browser, not assumed. Run it with
// `HUB_BASE_URL=<fixtures dev server> bunx playwright test --config hub/src/pages/board/broadcast/playwright.firefox.config.ts`.
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: path.join(__dirname, '..'),
  testMatch: ['broadcast.spec.ts'],
  outputDir: process.env.HUB_PW_OUT ?? path.join(__dirname, '..', '..', '..', '..', '..', 'node_modules', '.cache', 'hub-playwright-broadcast'),
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: { viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  ],
});
