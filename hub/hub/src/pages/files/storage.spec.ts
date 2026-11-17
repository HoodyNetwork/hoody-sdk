// Playwright: Files' Storage tab in a real browser. The storage lists of the computer on the From side, the add
// action, the computer's own disk and the storage kinds an empty list names, axe finds nothing; at phone width nothing
// scrolls sideways, the kinds wrap inside the viewport and Add storage stays reachable.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import ss from './storage/strings.en.json';
import ts from './transfers/transfers.strings.en.json';

const STORAGE = '/files?a=atlas.00a1&tab=storage';
async function axeClean(page: Page) {
  const r = await new AxeBuilder({ page }).include('#hub-main').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 160)}`).join(' | ')}`)).toEqual([]);
}

test('files storage tab: the lists of atlas and Add storage; axe finds nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await gotoHub(page, STORAGE);
  await expect(page.getByRole('tab', { name: ts['tab.storage'] })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
  await expect(page.getByText(ss['backends.empty'])).toBeVisible({ timeout: 30_000 });
  // Under the title: the best-known storage kinds after their marks, heard as one sentence (the marks are hidden).
  const kinds = page.locator('p', { hasText: /^Works with/ });
  await expect(kinds).toBeVisible();
  expect(await kinds.evaluate((p) => { const c = p.cloneNode(true) as HTMLElement; for (const m of c.querySelectorAll('[aria-hidden="true"]')) m.remove(); return (c.textContent ?? '').replace(/\s+/g, ' ').trim(); }))
    .toMatch(/^Works with Amazon S3, Google Drive, Dropbox, Microsoft OneDrive, Box, MEGA and \d+ more$/);
  // Each kind (mark and name) is one unit on one line, three to a row.
  const units = await kinds.locator('[aria-hidden="true"]').evaluateAll((els) => els.map((e) => ({ lines: e.parentElement!.getClientRects().length, top: Math.round(e.parentElement!.getBoundingClientRect().top) })));
  expect(units.map((u) => u.lines)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(new Set(units.slice(0, 3).map((u) => u.top)).size).toBe(1);
  expect(new Set(units.slice(3).map((u) => u.top)).size).toBe(1);
  expect(units[3]!.top).toBeGreaterThan(units[0]!.top);
  await expect(page.getByText(ts['storage.for'].replace('{{name}}', 'atlas'))).toBeVisible();
  // The computer's own disk (the fixture's 12.4 GiB of 40, worded 12 GB of 40 GB), with its meter.
  await expect(page.getByRole('meter', { name: ss['glance.disk.n'].replace('{{used}}', '12 GB').replace('{{total}}', '40 GB') })).toBeVisible();
  await axeClean(page);
});

test('files storage tab at phone width: no sideways scroll, Add storage reachable', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, STORAGE);
  const add = page.getByRole('button', { name: ss.add });
  await expect(add).toBeVisible({ timeout: 30_000 });
  await add.scrollIntoViewIfNeeded();
  await expect(add).toBeInViewport();
  await noSideScroll(page);
  // The storage kinds wrap onto more than one line, every mark inside the viewport, no kind split across lines.
  const kinds = page.locator('p', { hasText: /^Works with/ });
  await kinds.scrollIntoViewIfNeeded();
  const marks = await kinds.locator('[aria-hidden="true"]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: r.left, right: r.right }; }));
  expect(marks).toHaveLength(6);
  for (const m of marks) expect(m.left >= 0 && m.right <= 390).toBe(true);
  expect(new Set(marks.map((m) => m.top)).size).toBeGreaterThan(1);
  expect(await kinds.locator('[aria-hidden="true"]').evaluateAll((els) => els.map((e) => e.parentElement!.getClientRects().length))).toEqual([1, 1, 1, 1, 1, 1]);
});
