// Playwright for page specs (hub:check). Specs are discovered by convention: every
// hub/src/pages/<page>/*.spec.ts and kit spec, never a list. The hub:check script starts a
// fixtures-mode dev server and passes its URL as HUB_BASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// node_modules linked from outside the repo (a working copy): Playwright output stays in the copy (hub/.term-cache).
function pwCache(name: string): string {
  const root = path.join(__dirname, '..');
  let outside = false;
  try { const nm = fs.realpathSync(path.join(root, 'node_modules')); const r = fs.realpathSync(root); outside = nm !== r && !nm.startsWith(r + path.sep); } catch { /* no node_modules */ }
  return outside ? path.join(__dirname, '.term-cache', name) : path.join(root, 'node_modules', '.cache', name);
}

export default defineConfig({
  testDir: path.join(__dirname, 'src'),
  testMatch: ['pages/*/*.spec.ts', 'kit/**/*.spec.ts', 'shell/**/*.spec.ts', 'standalone/**/*.spec.ts'],
  outputDir: process.env.HUB_PW_OUT ?? pwCache('hub-playwright'),
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  // The JSON report is what hub:check's search proof gate reads (scripts/lib.ts searchProofGate).
  reporter: [['list'], ['json', { outputFile: process.env.HUB_PW_REPORT ?? pwCache('hub-playwright-report.json') }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    // Off: tracing every test hung context teardowns under load. To trace a red, start the fixtures dev server, then
    // from the package root (hub/): HUB_BASE_URL=<its URL> npx playwright test --config hub/playwright.config.ts <spec> --trace on
    trace: 'off',
  },
});
