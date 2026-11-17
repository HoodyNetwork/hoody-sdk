// Playwright for hub:shots: runs scripts/shots.spec.ts, which renders a page's shots.ts.
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
  testDir: path.join(__dirname, 'scripts'),
  testMatch: ['shots.spec.ts'],
  outputDir: process.env.HUB_PW_OUT ?? pwCache('hub-playwright-shots'),
  workers: 3,
  fullyParallel: true,
  timeout: 60_000,
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'] },
});
