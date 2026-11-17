// Playwright: the sidebar's end edge. Collapse is one small button on the edge just under the brand line,
// shown on hover and drawn above the page beside it (nothing covers it); the edge itself is a resize handle (kit
// PaneSeparator) whose width the grid draws and this browser remembers; dragged under the snap point it is the rail.
// (API's place in the main list: pages/api/nav.spec.ts.)
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const nav = (page: Page) => page.getByRole('navigation', { name: strings['nav.label'] });
const navWidth = (page: Page) => nav(page).evaluate((el) => Math.round(el.getBoundingClientRect().width));

test('the collapse button: on the edge, shown on hover, nothing drawn over it; it collapses and expands', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/home');
  const collapse = nav(page).getByRole('button', { name: strings['nav.collapse'], exact: true });
  await page.mouse.move(800, 450); // reason: the pointer starts at 0,0, which is on the sidebar
  // The button's place on the edge is its wrapper, which hides and shows it.
  const place = collapse.locator('xpath=..');
  await expect(place).toHaveCSS('opacity', '0');
  await nav(page).hover({ position: { x: 100, y: 300 } });
  await expect(place).toHaveCSS('opacity', '1');
  const box = (await collapse.boundingBox())!;
  const side = (await nav(page).boundingBox())!;
  expect(box.width, 'a 24 px button with a mouse').toBe(24);
  expect(Math.abs(box.x + box.width / 2 - (side.x + side.width)), 'its middle on the edge').toBeLessThanOrEqual(1);
  // Both halves are the button's: neither the top bar nor the page draws over it.
  for (const dx of [-6, 6]) {
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') ?? null, { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 });
    expect(hit, `the point ${dx} px from its middle`).toBe(strings['nav.collapse']);
  }
  await collapse.click();
  await expect.poll(() => navWidth(page)).toBe(56);
  await nav(page).getByRole('button', { name: strings['nav.expand'], exact: true }).click();
  await expect.poll(() => navWidth(page)).toBe(240);
});

test('the edge resizes the sidebar, the width is remembered; under the snap point it is the rail', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/home');
  const edge = page.getByRole('separator', { name: strings['nav.resize'] });
  const drag = async (to: number) => {
    const b = (await edge.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, 600);
    await page.mouse.down();
    await page.mouse.move(to, 600, { steps: 6 });
    await page.mouse.up();
  };
  const near = (w: number, to: number) => Math.abs(w - to) <= 1; // the grab point is the handle's middle, half a pixel either way
  expect(await navWidth(page)).toBe(240);
  await drag(320);
  await expect.poll(async () => near(await navWidth(page), 320)).toBe(true);
  const dragged = await navWidth(page);
  await expect(edge).toHaveAttribute('aria-valuenow', String(dragged));
  // the page beside it starts where the sidebar ends
  const main = (await page.locator('#hub-main').boundingBox())!;
  expect(Math.round(main.x)).toBeGreaterThanOrEqual(dragged);
  await page.reload();
  await page.locator('#hub-main').waitFor();
  await expect.poll(() => navWidth(page)).toBe(dragged);
  await drag(90);
  await expect.poll(() => navWidth(page)).toBe(56);
  await expect(nav(page).getByRole('button', { name: strings['nav.expand'], exact: true })).toHaveCount(1);
  await edge.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => navWidth(page)).toBe(240);
});

test.describe('a touch screen', () => {
  test.use({ viewport: { width: 1440, height: 768 }, hasTouch: true, isMobile: true }); // 1280 and wider: expanded by default

  /** What a press at (x, y) lands on: the resize handle, a nav link (its href), or another button's name. */
  const at = (page: Page, x: number, y: number) =>
    page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (el?.closest('[role="separator"]')) return 'handle';
      const a = el?.closest('a[href]');
      if (a) return a.getAttribute('href');
      return el?.closest('button')?.getAttribute('aria-label') ?? `${el?.tagName}.${el?.className}`;
    }, { x, y });

  test('expanded: the 44 px handle is all handle, the rows keep the rest; the 44 px button is in the brand row', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHub(page, '/home');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the run emulates a coarse pointer').toBe(true);
    const side = (await nav(page).boundingBox())!;
    const edge = (await page.getByRole('separator', { name: strings['nav.resize'] }).boundingBox())!;
    expect(Math.round(edge.width)).toBe(44);
    expect(Math.abs(edge.x + edge.width / 2 - (side.x + side.width))).toBeLessThanOrEqual(1);
    const end = side.x + side.width;
    const row = (await nav(page).getByRole('group').first().getByRole('link').first().boundingBox())!; // reason: the main list's first row
    const href = await nav(page).getByRole('group').first().getByRole('link').first().getAttribute('href'); // reason: the same row
    const y = row.y + row.height / 2;
    // across the whole handle, on a row's height, a press resizes; just inside it, the row
    for (const dx of [-20, -12, -2, 2, 12, 20]) expect(await at(page, end + dx, y), `${dx} px from the edge`).toBe('handle');
    expect(await at(page, end - 24, y)).toBe(href);
    // the button: drawn small, its press area 44 px (its holder), inside the brand row (the top bar's height), its own area
    const collapse = nav(page).getByRole('button', { name: strings['nav.collapse'], exact: true });
    const holder = collapse.locator('xpath=..');
    await expect(holder).toHaveCSS('opacity', '1');
    const b = (await holder.boundingBox())!;
    expect(Math.round(b.width)).toBe(44);
    expect(Math.round(b.height)).toBe(44);
    expect(b.x + b.width).toBeLessThanOrEqual(end + 0.5);
    expect(b.y).toBeGreaterThanOrEqual(side.y - 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(side.y + 48 + 0.5);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    for (const dy of [-21, 0, 21]) expect(await at(page, cx, cy + dy), `${dy} px from its centre`).toBe(strings['nav.collapse']);
  });

  test('a drag that crosses into the rail and back before it ends is the sidebar again (the handle stays while it lasts)', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHub(page, '/home');
    const edge = page.getByRole('separator', { name: strings['nav.resize'] });
    const b = (await edge.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, 600);
    await page.mouse.down();
    await page.mouse.move(90, 600, { steps: 6 });
    await expect.poll(() => navWidth(page)).toBe(56);
    // still drawn while the drag lasts: a hidden handle can lose its pointer (Chromium keeps it; the spec lets go)
    await expect(edge).toBeVisible();
    await page.mouse.move(300, 600, { steps: 6 });
    await expect.poll(async () => Math.abs((await navWidth(page)) - 300) <= 1).toBe(true);
    await page.mouse.up();
    await expect(edge).toBeVisible();
    // released in the rail, the handle goes
    await page.mouse.move((await edge.boundingBox())!.x + 22, 600);
    await page.mouse.down();
    await page.mouse.move(90, 600, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => navWidth(page)).toBe(56);
    await expect(edge).toBeHidden();
  });

  test('rail: no handle, the expand button in the brand row, every row whole', async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => { try { window.localStorage.setItem('hub.v3.shell', JSON.stringify({ collapsed: true })); } catch { /* none */ } });
    await gotoHub(page, '/home');
    await expect.poll(() => navWidth(page)).toBe(56);
    await expect(page.getByRole('separator', { name: strings['nav.resize'] })).toBeHidden();
    const expand = nav(page).getByRole('button', { name: strings['nav.expand'], exact: true });
    const b = (await expand.boundingBox())!;
    const side = (await nav(page).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(side.x - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(side.x + side.width + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(side.y + 48 + 0.5);
    // every row in view is its link from edge to edge
    const rows = await nav(page).evaluate((el) =>
      Array.from(el.querySelectorAll('[role="group"] a[href]')).map((a) => { const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), x0: r.left + 2, x1: r.right - 2, y: r.top + r.height / 2, h: r.height }; }),
    );
    const scroller = await nav(page).evaluate((el) => (Array.from(el.children).find((c) => c.querySelector('[role="group"]')) as HTMLElement).getBoundingClientRect().toJSON() as DOMRect);
    for (const r of rows.filter((r) => r.y > scroller.top + r.h / 2 && r.y < scroller.bottom - r.h / 2)) {
      expect(await at(page, r.x0, r.y), `${r.href} start`).toBe(r.href);
      expect(await at(page, r.x1, r.y), `${r.href} end`).toBe(r.href);
    }
    await expand.click();
    await expect.poll(() => navWidth(page)).toBe(240);
  });
});
