// Playwright: a side-mode list/detail page keeps the inspector beside the table, never over it,
// from the one-pane switch (846 px of the page's own usable width) up. The table keeps its least width and drops
// columns by priority instead of running under the inspector. Below 846 the page is one pane. Container sizes need
// a real browser, not jsdom.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const PATH = '/schedules';

async function openFirst(page: Page) {
  await gotoHub(page, PATH);
  await page.locator('#hub-main tbody tr[data-row-id]').first().click();
  await page.locator('h2[data-hub-title]').waitFor();
}

/** The two panes, the page's usable width (its content box) and every table cell that runs under the inspector. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const detail = document.querySelector<HTMLElement>('h2[data-hub-title]')?.closest('section');
    const split = detail?.parentElement;
    const list = split?.querySelector<HTMLElement>(':scope > section');
    const root = split?.parentElement;
    if (!detail || !list || list === detail || !root) throw new Error('no list and detail panes');
    const cs = getComputedStyle(root);
    const usable = root.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const d = detail.getBoundingClientRect();
    const l = list.getBoundingClientRect();
    const listShown = getComputedStyle(list).display !== 'none';
    const under = [...list.querySelectorAll<HTMLElement>('td, th')]
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.right > d.left + 1;
      })
      .map((c) => c.innerText.trim().slice(0, 30));
    return { usable: Math.round(usable), listShown, listW: Math.round(l.width), listRight: Math.round(l.right), detailLeft: Math.round(d.left), position: getComputedStyle(detail).position, under };
  });
}

test('at 1100 the inspector sits beside the table and nothing of the table is under it', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openFirst(page);
  const m = await measure(page);
  expect(m.listShown, JSON.stringify(m)).toBe(true);
  expect(m.position, JSON.stringify(m)).not.toBe('absolute');
  expect(m.listRight, JSON.stringify(m)).toBeLessThanOrEqual(m.detailLeft);
  expect(m.listW, JSON.stringify(m)).toBeGreaterThanOrEqual(280);
  expect(m.under, JSON.stringify(m)).toEqual([]);
});

test('the switch to one pane is at 846 px of the page: three columns at 846, one pane at 845', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await openFirst(page);
  const at1100 = await measure(page);
  // The page's usable width follows the viewport one to one here (fixed sidebar and padding).
  const w846 = 1100 - (at1100.usable - 846);

  await page.setViewportSize({ width: w846, height: 800 });
  await expect.poll(async () => (await measure(page)).usable).toBe(846);
  const two = await measure(page);
  expect(two.listShown, JSON.stringify(two)).toBe(true);
  expect(two.position, JSON.stringify(two)).not.toBe('absolute');
  expect(two.listRight, JSON.stringify(two)).toBeLessThanOrEqual(two.detailLeft);
  expect(two.listW, JSON.stringify(two)).toBeGreaterThanOrEqual(280);

  await page.setViewportSize({ width: w846 - 1, height: 800 });
  await expect.poll(async () => (await measure(page)).listShown).toBe(false);
});

/** The inspector's drawn width and what its separator reports. */
async function handle(page: Page) {
  return page.evaluate(() => {
    const detail = document.querySelector<HTMLElement>('h2[data-hub-title]')?.closest('section');
    const sep = detail?.parentElement?.querySelector<HTMLElement>(':scope > [role="separator"]');
    if (!detail || !sep) throw new Error('no inspector separator');
    return { drawn: Math.round(detail.getBoundingClientRect().width), now: Number(sep.getAttribute('aria-valuenow')), max: Number(sep.getAttribute('aria-valuemax')) };
  });
}

test('a saved 640 inspector at 846 px: the separator reports, steps and drags from the drawn 560', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('hub.v3.pane.schedules.inspector', '640'));
  await page.setViewportSize({ width: 1100, height: 800 });
  await openFirst(page);
  const w846 = 1100 - ((await measure(page)).usable - 846);
  await page.setViewportSize({ width: w846, height: 800 });
  await expect.poll(async () => (await measure(page)).usable).toBe(846);

  // 846 - 280 (list least) - 6 (separator) = 560: the inspector's room, drawn and reported.
  await expect.poll(async () => handle(page)).toEqual({ drawn: 560, now: 560, max: 560 });

  const sep = page.locator('#hub-main [role="separator"]');
  await sep.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => handle(page)).toEqual({ drawn: 544, now: 544, max: 560 });
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => handle(page)).toEqual({ drawn: 560, now: 560, max: 560 });

  // A drag starts from the drawn edge: 30 px right makes the inspector 30 px narrower at once.
  const box = await sep.boundingBox();
  if (!box) throw new Error('separator not drawn');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => handle(page)).toEqual({ drawn: 530, now: 530, max: 560 });
});
