// Playwright: Knowledge → Memory is reachable in the whole Hub. A deep link opens it and keeps it on
// reload; the pane's Knowledge index opens it by keyboard; on a phone the index comes back as route tabs above the
// screen; the page's "Memory of" choice switches to Global (read-only here) and Back returns to the realm. Which rows each
// store holds is not checked here: fixture rules get the built query without the realm (core/transport.ts), so the dev
// server serves one store; Memory.test.tsx proves every Global read names realm=global.
import { type Page, expect, test } from '@playwright/test';
import { expectSearchStaysOutOfUrl, gotoHub, noSideScroll } from '@app/e2e';
import memoryStrings from './knowledge/memory/Memory.strings.en.json';
import { links } from './links';
import paneStrings from './parts/Pane.strings.en.json';

const pane = (page: Page) => page.getByRole('navigation', { name: paneStrings['pane.label'], exact: true });
const title = (page: Page) => page.getByRole('heading', { level: 1, name: memoryStrings.title, exact: true });

test('a Memory deep link opens Knowledge → Memory and keeps it on reload', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, links.memory);
  await expect(title(page)).toBeVisible({ timeout: 20_000 });
  const index = pane(page).getByRole('list', { name: paneStrings['knowledge.label'], exact: true });
  await expect(index.getByRole('link', { name: paneStrings['knowledge.memory'], exact: true })).toHaveAttribute('aria-current', 'page');
  await page.reload();
  await expect(title(page)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/#\/ai\/knowledge\/memory$/);
});

test("the pane's Knowledge index opens Memory with the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, links.skills);
  const index = pane(page).getByRole('list', { name: paneStrings['knowledge.label'], exact: true });
  const memory = index.getByRole('link', { name: paneStrings['knowledge.memory'], exact: true });
  await expect(memory).toBeVisible({ timeout: 20_000 });
  await index.getByRole('link', { name: paneStrings['knowledge.instructions'], exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(memory).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/ai\/knowledge\/memory$/);
  await expect(title(page)).toBeVisible({ timeout: 20_000 });
});

test('on a phone (390 px) Knowledge shows its index above the screen, with no page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, links.skills);
  const index = page.getByRole('list', { name: paneStrings['knowledge.label'], exact: true });
  await expect(index).toBeVisible({ timeout: 20_000 });
  await index.getByRole('link', { name: paneStrings['knowledge.memory'], exact: true }).click();
  await expect(page).toHaveURL(/#\/ai\/knowledge\/memory$/);
  await expect(title(page)).toBeVisible({ timeout: 20_000 });
  await expect(index.getByRole('link', { name: paneStrings['knowledge.memory'], exact: true })).toHaveAttribute('aria-current', 'page');
  await noSideScroll(page);
});

test("the page's choice switches to Global, without Manage memory there, and Back returns to the realm", async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, links.memory);
  await expect(page.getByText('shop', { exact: true })).toBeVisible({ timeout: 20_000 });
  const scope = page.getByRole('radiogroup', { name: memoryStrings['scope.label'], exact: true });
  const global = scope.getByRole('radio', { name: memoryStrings['scope.global'], exact: true });
  await global.click();
  await expect(page).toHaveURL(/[?&]realm=global(&|$)/);
  await expect(global).toBeChecked();
  await expect(page.getByText(memoryStrings['scope.noManage'], { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.goBack();
  await expect(page).not.toHaveURL(/[?&]realm=global(&|$)/);
  await expect(global).not.toBeChecked();
  await expect(page.getByText(memoryStrings['scope.noManage'], { exact: true })).toHaveCount(0);
});

test('@search the ranked search narrows the memories and never writes ?q', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 900 });
  await gotoHub(page, links.memory);
  await page.getByText('shop', { exact: true }).click({ timeout: 20_000 });
  const table = page.getByRole('table', { name: memoryStrings['kind.memory'], exact: true });
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(2, { timeout: 20_000 });
  // The search stays out of the URL, proved by the shared helper; the search is sent once typing pauses (data.ts SEARCH_PAUSE_MS).
  await expectSearchStaysOutOfUrl(page, { param: '', box: page.getByPlaceholder(memoryStrings.search, { exact: true }), debounce: 400 }, {
    text: 'staging',
    searched: async () => {
      await expect(rows).toHaveCount(1);
      await expect(rows.first()).toContainText('Deploys go through staging first');
      await expect(table.getByRole('columnheader', { name: memoryStrings['col.rank'], exact: true })).toBeVisible();
    },
  });
});

test('on a phone (390 px) a long project name leaves the relation count whole, inside the screen', async ({ page }) => {
  await page.goto('about:blank');
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoHub(page, `${links.memory}?project=v1%3A10n6&kind=relation`);
  await expect(page.getByRole('row').filter({ hasText: 'deploy.sh' })).toBeVisible({ timeout: 20_000 });
  const tag = page.getByText(/^3 relations$/);
  await expect(tag).toBeInViewport({ ratio: 1 });
  expect(await tag.evaluate((el) => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight))).toBeLessThanOrEqual(0);
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toContainText('customer_portal');
  await expect(h1).toBeInViewport();
  // Wrapped under the name, not squeezed beside it.
  const [nameBox, tagBox] = [await h1.boundingBox(), await tag.boundingBox()];
  expect(tagBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);
  expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(390);
  expect(await h1.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  await noSideScroll(page);
});

test('Relations lists a project\'s entities and opens one, and a phone (390 px) never scrolls sideways', async ({ page }) => {
  for (const width of [1350, 390]) {
    await page.goto('about:blank');
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, `${links.memory}?project=v1%3A5h0p&kind=relation`);
    const row = page.getByRole('row').filter({ hasText: 'deploy.sh' });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^3 relations$/)).toBeInViewport();
    await noSideScroll(page);
    await row.click();
    await expect(page.getByRole('heading', { name: 'deploy.sh' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('list', { name: memoryStrings['rel.title'], exact: true }).getByText('staging')).toBeVisible();
    await noSideScroll(page);
  }
});
