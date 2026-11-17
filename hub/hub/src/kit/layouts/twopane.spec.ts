// Playwright: a list/detail page shows two panes only while both fit at their least widths (list 280,
// detail 560, plus the separator); otherwise it is one pane, the detail with "‹ <page>". Measured across the
// widths where the shell's content is just above 840 px, with the sidebar as the shell draws it.
// The switch sits exactly at 846 px of the page's usable width (ldpage, inside its padding) in fill
// and side mode; two panes stay inside the split, one pane fills it; a list or inspector dragged to its widest is
// drawn at that width and gives way at the line.
// Container sizes need a real browser, not jsdom.
import { expect, type Page, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const DETAIL = '/scripts?sel=atlas.00a1~daily-digest.ts';
const SIDE = '/schedules?sel=cron%3Auser%2Fa3';
const LINE = 846; // --pane-list-min 280 + --ld-sep 6 + --detail-min 560

for (const width of [896, 926, 960, 1080, 1125, 1180]) {
  test(`two panes only when both fit, at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, DETAIL);
    await page.locator('h2[data-hub-title]').waitFor();
    const m = await page.evaluate(() => {
      const detail = document.querySelector<HTMLElement>('h2[data-hub-title]')?.closest('section');
      const list = detail?.parentElement?.querySelector<HTMLElement>(':scope > section');
      if (!detail || !list || list === detail) throw new Error('no list and detail panes');
      return { listShown: getComputedStyle(list).display !== 'none', list: Math.round(list.getBoundingClientRect().width), detail: Math.round(detail.getBoundingClientRect().width) };
    });
    if (m.listShown) {
      expect(m.detail, JSON.stringify(m)).toBeGreaterThanOrEqual(560);
      expect(m.list, JSON.stringify(m)).toBeGreaterThanOrEqual(280);
    } else {
      await expect(page.getByRole('button', { name: 'Scripts', exact: true }), 'one pane offers the way back').toBeVisible();
    }
  });
}

/** The page's usable width and the split's three parts (list or table, separator, detail or inspector). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const ld = [...document.querySelectorAll<HTMLElement>('#hub-main *')].find((el) => getComputedStyle(el).containerName.split(' ').includes('ldpage'));
    const handle = ld?.querySelector<HTMLElement>('[role=separator][aria-orientation=vertical]');
    const split = handle?.parentElement;
    const list = handle?.previousElementSibling as HTMLElement | null | undefined;
    const detail = handle?.nextElementSibling as HTMLElement | null | undefined;
    if (!ld || !handle || !split || !list || !detail) throw new Error('no list/detail split');
    const cs = getComputedStyle(ld);
    const box = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { shown: getComputedStyle(el).display !== 'none' && r.width > 0, left: r.left, right: r.right, width: r.width };
    };
    const ldr = ld.getBoundingClientRect();
    return {
      usable: Math.round(ld.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      content: { left: ldr.left + parseFloat(cs.paddingLeft), right: ldr.right - parseFloat(cs.paddingRight) },
      split: box(split),
      list: box(list),
      handle: box(handle),
      detail: box(detail),
    };
  });
}

/** Resize the window until the page's usable width is exactly `usable` (the sidebar and the page padding vary). */
async function setUsable(page: Page, usable: number) {
  let vw = page.viewportSize()!.width;
  for (let i = 0; i < 5; i++) {
    const { usable: now } = await measure(page);
    if (now === usable) return;
    vw += usable - now;
    await page.setViewportSize({ width: vw, height: 800 });
    await page.waitForTimeout(100);
  }
  expect((await measure(page)).usable, `usable width ${usable} reachable`).toBe(usable);
}

/** Two panes side by side, in order, inside the split and the page's content box, with nothing overlapping. */
function expectContained(m: Awaited<ReturnType<typeof measure>>) {
  const at = JSON.stringify(m);
  for (const part of [m.list, m.handle, m.detail]) expect(part.shown, at).toBe(true);
  expect(m.list.left, at).toBeGreaterThanOrEqual(m.split.left - 0.5);
  expect(m.list.right, at).toBeLessThanOrEqual(m.handle.left + 0.5);
  expect(m.handle.right, at).toBeLessThanOrEqual(m.detail.left + 0.5);
  expect(m.detail.right, at).toBeLessThanOrEqual(m.split.right + 0.5);
  expect(m.split.right, at).toBeLessThanOrEqual(m.content.right + 0.5);
  expect(m.split.left, at).toBeGreaterThanOrEqual(m.content.left - 0.5);
}

/** One pane: list and separator hidden, the detail alone filling the split edge to edge at the usable width, the
 *  split inside the page's content box, and "‹ <page>" offered. */
async function expectOnePane(page: Page, back: string) {
  const m = await measure(page);
  const at = JSON.stringify(m);
  expect(m.list.shown, at).toBe(false);
  expect(m.handle.shown, at).toBe(false);
  expect(m.detail.shown, at).toBe(true);
  expect(Math.abs(m.detail.left - m.split.left), at).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.detail.right - m.split.right), at).toBeLessThanOrEqual(0.5);
  expect(Math.abs(m.detail.width - m.usable), at).toBeLessThanOrEqual(1);
  expect(m.split.left, at).toBeGreaterThanOrEqual(m.content.left - 0.5);
  expect(m.split.right, at).toBeLessThanOrEqual(m.content.right + 0.5);
  await expect(page.getByRole('button', { name: back, exact: true }), 'one pane offers the way back').toBeVisible();
}

const near = (got: number, want: number, at: unknown) => expect(Math.abs(got - want), `${want} wanted: ${JSON.stringify(at)}`).toBeLessThanOrEqual(1);

// dragged: the pane the separator resizes (fill: the list, its range 280-560; side: the inspector, 360-640).
const MODES = [
  { mode: 'fill', url: DETAIL, state: undefined, back: 'Scripts', listMin: 280, detailMin: 560, dragged: 'list', min: 280, max: 560 },
  { mode: 'side', url: SIDE, state: 'long', back: 'Schedules', listMin: 280, detailMin: 360, dragged: 'detail', min: 360, max: 640 },
] as const;

for (const c of MODES) {
  test.describe(`${c.mode} mode at the ${LINE} px line`, () => {
    test(`two panes at ${LINE} px usable, contained and at least their minimums; one pane at ${LINE - 1}`, async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 });
      await gotoHub(page, c.url, c.state ? { state: c.state } : {});
      await page.locator('#hub-main [role=separator][aria-orientation=vertical]').waitFor({ state: 'attached' });
      await setUsable(page, LINE);
      const two = await measure(page);
      expectContained(two);
      expect(two.list.width, JSON.stringify(two)).toBeGreaterThanOrEqual(c.listMin - 0.5);
      expect(two.detail.width, JSON.stringify(two)).toBeGreaterThanOrEqual(c.detailMin - 0.5);
      await expect(page.getByRole('button', { name: c.back, exact: true })).toBeHidden();

      await setUsable(page, LINE - 1);
      await expectOnePane(page, c.back);
    });

    test('a pane dragged to its widest stays inside the split and gives way at the line', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await gotoHub(page, c.url, c.state ? { state: c.state } : {});
      const handle = page.locator('#hub-main [role=separator][aria-orientation=vertical]');
      await handle.waitFor();
      const w = (m: Awaited<ReturnType<typeof measure>>) => m[c.dragged].width;
      // By pointer, far past the end (fill drags the list wider to the right; side drags the inspector wider to the
      // left): the drawn pane reaches its maximum, not only the separator's value.
      const b = (await handle.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.mouse.move(b.x + (c.mode === 'fill' ? 600 : -600), b.y + b.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(handle).toHaveAttribute('aria-valuenow', String(c.max));
      const dragged = await measure(page);
      expectContained(dragged);
      near(w(dragged), c.max, dragged);
      // By key, separately: Home draws the minimum, End the maximum again.
      await handle.focus();
      await page.keyboard.press('Home');
      await expect(handle).toHaveAttribute('aria-valuenow', String(c.min));
      near(w(await measure(page)), c.min, 'Home');
      await page.keyboard.press('End');
      await expect(handle).toHaveAttribute('aria-valuenow', String(c.max));
      const wide = await measure(page);
      expectContained(wide);
      near(w(wide), c.max, wide);
      expect(wide.list.width, JSON.stringify(wide)).toBeGreaterThanOrEqual(c.listMin - 0.5);
      expect(wide.detail.width, JSON.stringify(wide)).toBeGreaterThanOrEqual(c.detailMin - 0.5);

      // At the line the widened pane gives way: list (or table) 280, detail (or inspector) 560, inside the split.
      await setUsable(page, LINE);
      const line = await measure(page);
      expectContained(line);
      near(line.list.width, 280, line);
      near(line.detail.width, 560, line);
      await setUsable(page, LINE - 1);
      await expectOnePane(page, c.back);
    });
  });
}
