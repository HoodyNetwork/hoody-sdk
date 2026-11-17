// A Board past 4 tiles in the browser: pages of 4 full cells, the pager and its keys, every tile at least
// 240 x 160, frames kept across a flip, and what 4, 6 and 8 mounted frames cost (reported).
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const surface = (page: Page) => page.getByRole('group', { name: strings.tiles });
const frame = (page: Page, n: number) => page.locator(`iframe[title="terminal-${n} on atlas"]`);
const counted = (p: number, of: number) => strings['pager.count'].replace('{{page}}', String(p)).replace('{{pages}}', String(of));

/** Main with terminal-1 on atlas, then copies (each takes the lowest free number) up to `count` tiles. */
async function tiles(page: Page, count: number, from = 1) {
  if (from === 1) {
    await gotoHub(page, '/board');
    await page.getByRole('button', { name: strings['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
    await page.getByRole('row', { name: /^atlas/ }).click();
    await page.getByRole('row', { name: /^Terminal/ }).click();
    await page.getByRole('row', { name: /^terminal-1/ }).click();
    await expect(frame(page, 1)).toBeAttached();
  }
  for (let n = Math.max(from, 1) + (from === 1 ? 1 : 0); n <= count; n++) {
    await surface(page).focus();
    await page.keyboard.press('.');
    await page.getByRole('menuitem', { name: strings['tile.duplicate'] }).click();
    await expect(frame(page, n)).toBeAttached();
  }
  await surface(page).focus();
}

test('at 1350 x 900: 6 tiles are a page of 4 and a page of 2, every one at least 240 x 160, and a flip keeps every frame', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await tiles(page, 6);
  // The 5th and 6th were added on the Board that pages: they read last, so the view went to their page.
  await expect(page.getByText(counted(2, 2), { exact: true })).toBeVisible();
  await expect(frame(page, 5)).toBeVisible();
  await expect(frame(page, 6)).toBeVisible();
  await expect(frame(page, 1)).toBeHidden();
  await expect(surface(page).getByRole('separator')).toHaveCount(0); // the tiles' own: the shell's Sidebar width handle is not the Board's

  await page.keyboard.press('PageUp');
  await expect(page.getByText(counted(1, 2), { exact: true })).toBeVisible();
  for (const n of [1, 2, 3, 4]) {
    await expect(frame(page, n)).toBeVisible();
    const box = (await frame(page, n).locator('xpath=ancestor::*[@role="group"][1]').boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(240);
    expect(box.height).toBeGreaterThanOrEqual(160);
  }
  await expect(frame(page, 5)).toBeHidden();
  // A frame stays the same element across flips: mark one, flip there and back.
  await frame(page, 1).evaluate((f) => { f.setAttribute('data-kept', 'yes'); });
  await page.getByRole('button', { name: strings['pager.next'] }).click();
  await expect(frame(page, 5)).toBeVisible();
  await page.getByRole('button', { name: strings['pager.prev'] }).click();
  await expect(frame(page, 1)).toBeVisible();
  await expect(frame(page, 1)).toHaveAttribute('data-kept', 'yes');
});

test('a short window: 5 tiles at 1000 x 360 page at 2; at 330 one tile at a time', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await tiles(page, 5);
  await page.setViewportSize({ width: 1000, height: 360 });
  // Height after the top bar, the strip with its air, the area's own padding and the chips row: a tile area about 180
  // high, room for 2 a page side by side (not 4: that needs 2 x 160), 5 tiles on 3 pages, the last active.
  await expect(page.getByText(counted(3, 3), { exact: true })).toBeVisible();
  await expect(frame(page, 5)).toBeVisible();
  await expect(frame(page, 4)).toBeHidden();
  await page.getByRole('group', { name: strings.tiles }).focus();
  await page.keyboard.press('PageUp');
  await expect(page.getByText(counted(2, 3), { exact: true })).toBeVisible();
  await expect(frame(page, 3)).toBeVisible();
  await expect(frame(page, 4)).toBeVisible();
  await expect(frame(page, 5)).toBeHidden();

  // 30 px shorter the area is under a tile's 160: no pager, one tile at a time, and the band says so.
  await page.setViewportSize({ width: 1000, height: 330 });
  await expect(page.getByText(strings['board.oneAtATime'], { exact: true })).toBeVisible();
  await expect(page.getByText(counted(2, 3), { exact: true })).toHaveCount(0);
  await expect.poll(async () => { let shown = 0; for (const n of [1, 2, 3, 4, 5]) if (await frame(page, n).isVisible()) shown++; return shown; }).toBe(1);
});

test('what 4, 6 and 8 mounted frames cost, and a page flip with 8', async ({ page }, info) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async (): Promise<Record<string, number>> => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    const want = ['JSHeapUsedSize', 'Nodes', 'Frames', 'LayoutCount'];
    return Object.fromEntries(metrics.filter((m) => want.includes(m.name)).map((m) => [m.name, m.value]));
  };
  const flip = async (): Promise<number> => {
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('PageUp');
    await expect(page.getByText(counted(1, 2), { exact: true })).toBeVisible();
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    const t1 = await page.evaluate(() => performance.now());
    await page.keyboard.press('PageDown');
    await expect(page.getByText(counted(2, 2), { exact: true })).toBeVisible();
    return Math.round(t1 - t0);
  };
  await tiles(page, 4);
  const four = await read();
  await tiles(page, 6, 5);
  const six = await read();
  const flip6 = await flip();
  await tiles(page, 8, 7);
  const eight = await read();
  const flip8 = await flip();
  const out = { four, six, eight, flipMs: { six: flip6, eight: flip8 } };
  await info.attach('board-pager-measure', { body: JSON.stringify(out), contentType: 'application/json' });
  // eslint-disable-next-line no-console -- the numbers are this test's result
  console.log('board-pager-measure ' + JSON.stringify(out));
  await expect(page.locator('iframe[title^="terminal-"]')).toHaveCount(8);
});

test('at 760 x 900: a Scroll Board with uneven shares offers evening out inside the window (the row\'s button, or Layout\'s Equalise once the row is tight), and it shows every tile', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1350, height: 900 });
  await tiles(page, 4);
  await page.getByRole('button', { name: strings.layout, exact: true }).click();
  await page.getByRole('menuitemcheckbox', { name: /^Scroll$/ }).click();
  await page.setViewportSize({ width: 760, height: 900 });
  const even = page.getByRole('button', { name: strings['overflow.even'], exact: true });
  // From step 1 Even out tiles leaves the row and Layout's Equalise does the same.
  await expect(page.locator('[data-strip-step]')).toBeVisible({ timeout: 20_000 });
  if ((await page.locator('[data-strip-step]').getAttribute('data-strip-step')) !== '0') {
    await expect(even).toHaveCount(0);
    await page.getByRole('button', { name: strings.layout, exact: true }).click();
    const equalise = page.getByRole('menuitem', { name: new RegExp('^' + strings['layout.equalise']) });
    await expect(equalise).toBeInViewport({ ratio: 1 });
    await equalise.click();
    for (const n of [1, 2, 3, 4]) await expect(frame(page, n)).toBeVisible();
    return;
  }
  await expect(even).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: strings.focus, exact: true })).toBeVisible();
  // The note shrinks before the button does: the button is whole, inside the window, and Focus after it too.
  await expect(async () => {
    const box = (await even.boundingBox())!;
    const last = (await page.getByRole('button', { name: strings.focus, exact: true }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(last.x);
    expect(last.x + last.width).toBeLessThanOrEqual(760);
    const text = await even.evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width <= el.getBoundingClientRect().width; });
    expect(text).toBe(true);
  }).toPass({ timeout: 10_000 });
  await even.click();
  await expect(even).toHaveCount(0);
  for (const n of [1, 2, 3, 4]) await expect(frame(page, n)).toBeVisible();
});
