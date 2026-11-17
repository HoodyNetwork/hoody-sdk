// Playwright: the side nav draws a solid line between its blocks
// (and above the foot) and a dashed one between items. Rows follow the window height, clamp(min(24px, 578px / rows -
// 1px), (100vh - 122px) / rows - 1px, 40px), rows being the rows drawn (23 by default; the 1 px is each row's dashed
// line), with 5 px around each block line; at 900 px tall or less the dashed item lines are hidden (transparent, so
// nothing moves). Every item, Account block, Rent servers and foot, is in the window from 700 to 1080 px tall. On a
// shorter window the page groups scroll while the foot stays at the bottom, and the current page's row is in view. The
// same lines hold in the dark theme (its --hx-nav-line pair) and in the rail. A touch screen keeps its 44 px rows.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

test('desktop: block and item lines, item padding', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await gotoHub(page, '/home');
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  const groups = nav.getByRole('group');
  await expect(groups.nth(1)).toBeVisible();
  const style = (sel: string, i = 0) =>
    nav.locator(sel).nth(i).evaluate((el) => {
      const c = getComputedStyle(el);
      return { top: `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`, padTop: c.paddingTop, padBottom: c.paddingBottom, marginTop: c.marginTop };
    });
  // The first block has no line; every later block has the solid line with 5 px above and below it.
  expect((await style('[role="group"]', 0)).top).toMatch(/^0px none/);
  expect(await style('[role="group"]', 1)).toMatchObject({ top: '1px solid rgb(210, 210, 210)', padTop: '5px', marginTop: '5px' });
  // Items: no padding of their own; the first item of a block has no line, the next has the dashed one.
  expect(await style('[role="group"] li', 0)).toMatchObject({ padTop: '0px', padBottom: '0px' });
  expect((await style('[role="group"] li', 0)).top).toMatch(/^0px none/);
  expect((await style('[role="group"] li', 1)).top).toBe('1px dashed rgb(222, 222, 222)');
  // The foot (the nav's last block: Rent servers and Help) has the solid line above it. Collapse sidebar has no row in
  // it: it is the small button on the sidebar's edge.
  const foot = nav.locator('xpath=./div[last()]');
  await expect(foot.getByRole('listitem').first()).toBeVisible(); // reason: the foot's first row, Rent servers or Help's first page
  await expect(foot.getByRole('button', { name: strings['nav.collapse'] })).toHaveCount(0);
  expect(await foot.evaluate((el) => { const c = getComputedStyle(el); return `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`; })).toBe('1px solid rgb(210, 210, 210)');
  expect(await foot.evaluate((el) => getComputedStyle(el).paddingTop), 'the foot: 5 px between its line and its first row').toBe('5px');
});

/** The nav's lines as drawn: the second block's line and spacing, the first two items' lines, and the foot's line and top padding. */
async function navLines(page: Page) {
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  await expect.poll(() => nav.getByRole('group').count(), 'two blocks or more are drawn').toBeGreaterThan(1);
  return nav.evaluate((el) => {
    const line = (n: Element | null) => { if (!n) return 'missing'; const c = getComputedStyle(n); return `${c.borderTopWidth} ${c.borderTopStyle} ${c.borderTopColor}`; };
    const groups = el.querySelectorAll('[role="group"]');
    const items = groups[0]?.querySelectorAll('li') ?? [];
    const foot = el.lastElementChild;
    return {
      width: Math.round(el.getBoundingClientRect().width),
      block: line(groups[1] ?? null), blockPad: groups[1] ? getComputedStyle(groups[1]).paddingTop : 'missing',
      first: line(items[0] ?? null), item: line(items[1] ?? null),
      foot: line(foot), footPad: foot ? getComputedStyle(foot).paddingTop : 'missing',
    };
  });
}

test('dark: the same lines, in the dark nav-line pair', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await gotoHub(page, '/home', { theme: 'dark' });
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-hx-theme'))).toBe('dark');
  expect(await navLines(page)).toMatchObject({
    block: '1px solid rgba(255, 255, 255, 0.12)', blockPad: '5px',
    first: expect.stringMatching(/^0px none/), item: '1px dashed rgba(255, 255, 255, 0.07)',
    foot: '1px solid rgba(255, 255, 255, 0.12)', footPad: '5px',
  });
});

test('rail: the blocks keep their lines and the foot its line and 5 px', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.addInitScript(() => { try { window.localStorage.setItem('hub.v3.shell', JSON.stringify({ collapsed: true })); } catch { /* none */ } });
  await gotoHub(page, '/home');
  const lines = await navLines(page);
  expect(lines.width, 'the rail is 56 px wide').toBe(56);
  expect(lines).toMatchObject({
    block: '1px solid rgb(210, 210, 210)', blockPad: '5px',
    first: expect.stringMatching(/^0px none/), item: '1px dashed rgb(222, 222, 222)',
    foot: '1px solid rgb(210, 210, 210)', footPad: '5px',
  });
});

test('short window: the groups scroll, the foot stays at the bottom, the current page is in view', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 560 });
  await gotoHub(page, '/account');
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toBeVisible();
  // The scroller: the nav's one child holding the page groups (the brand and the foot hold none).
  const scroller = nav.locator('xpath=./div[.//*[@role="group"]]');
  const geo = await scroller.evaluate((el) => ({ scrolls: el.scrollHeight > el.clientHeight, top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom }));
  expect(geo.scrolls, 'the groups overflow at 560 px').toBe(true);
  const row = await current.evaluate((el) => (el.closest('li') as HTMLElement).getBoundingClientRect().toJSON() as DOMRect);
  expect(row.top).toBeGreaterThanOrEqual(geo.top - 0.5);
  expect(row.bottom).toBeLessThanOrEqual(geo.bottom + 0.5);
  // The foot (its last row, Help's last page) sits at the bottom of the window, below the scroller.
  const last = await nav.locator('xpath=./div[last()]').getByRole('listitem').last().boundingBox();
  expect(last && last.y + last.height).toBeLessThanOrEqual(560);
  expect(last && last.y).toBeGreaterThanOrEqual(geo.bottom);
});

/** The nav's fluid metrics as drawn: row and label heights, the scroller's padding, whether it scrolls, and whether every row is inside the window. */
async function fluid(page: Page) {
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  await expect.poll(() => nav.getByRole('group').count(), 'two blocks or more are drawn').toBeGreaterThan(1);
  await expect(nav.getByRole('button', { name: strings['nav.collapse'] })).toBeVisible();
  return nav.evaluate((el) => {
    const scroller = Array.from(el.children).find((c) => c.querySelector('[role="group"]')) as HTMLElement;
    const rows = Array.from(el.querySelectorAll('li')).map((li) => (li.firstElementChild as HTMLElement).getBoundingClientRect());
    const label = el.querySelector('[role="group"] > div:first-child') as HTMLElement; // a static block label (the first block has none; the switch is a button)
    const items = el.querySelectorAll('[role="group"] li');
    const c = getComputedStyle(scroller);
    const first = rows[0]?.height ?? 0;
    return {
      rowH: Math.round(first * 100) / 100,
      allRows: rows.every((r) => Math.abs(r.height - first) < 0.5),
      labelH: Math.round(label.getBoundingClientRect().height),
      scrollPad: `${c.paddingTop} ${c.paddingBottom}`,
      scrolls: scroller.scrollHeight > scroller.clientHeight,
      inWindow: rows.every((r) => r.top >= 0 && r.bottom <= window.innerHeight + 0.5),
      count: rows.length,
      navRows: Number(getComputedStyle(el).getPropertyValue('--nav-rows')),
      dashed: items[1] ? (({ borderTopWidth: w, borderTopStyle: st, borderTopColor: c }) => `${w} ${st} ${c}`)(getComputedStyle(items[1])) : 'missing',
    };
  });
}

for (const height of [700, 900, 1080]) {
  test(`fluid fit at ${height} px tall: rows share the height, every row in the window`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height });
    await gotoHub(page, '/home');
    const m = await fluid(page);
    expect(m.navRows, '--nav-rows is the number of rows drawn').toBe(m.count);
    const rowH = Math.min(40, Math.max(Math.min(24, 578 / m.count - 1), (height - 122) / m.count - 1));
    expect(m.rowH, 'row height = clamp(min(24px, 578px / rows - 1px), (100vh - 122px) / rows - 1px, 40px)').toBeCloseTo(rowH, 1);
    expect(m.allRows, 'every row takes the same height, the foot rows included').toBe(true);
    expect(m.labelH, 'the block labels are 18 px').toBe(18);
    expect(m.scrollPad, 'the groups have 4 px above and below').toBe('4px 4px');
    expect(m.scrolls, 'nothing to scroll from 700 to 1080 px tall').toBe(false);
    expect(m.inWindow, `all ${m.count} rows are inside the window`).toBe(true);
    // Hidden at 900 px or less: the 1 px dashed line stays, transparent, so no row moves.
    expect(m.dashed).toBe(height <= 900 ? '1px dashed rgba(0, 0, 0, 0)' : '1px dashed rgb(222, 222, 222)');
  });
}

test('a nav with one more row still fits at 700 px tall: the row height counts its dashed line', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 700 });
  await gotoHub(page, '/home');
  const before = await fluid(page);
  // One more row in a block (its 1 px dashed line included) and --nav-rows one higher, as Sidebar.tsx would draw it.
  const after = await page.getByRole('navigation', { name: strings['nav.label'] }).evaluate((el, n) => {
    const li = el.querySelector('[role="group"] li + li') as HTMLElement;
    li.parentElement!.append(li.cloneNode(true));
    (el as HTMLElement).style.setProperty('--nav-rows', String(n + 1));
    const scroller = Array.from(el.children).find((c) => c.querySelector('[role="group"]')) as HTMLElement;
    return { scrolls: scroller.scrollHeight > scroller.clientHeight, rows: el.querySelectorAll('li').length };
  }, before.count);
  expect(after.rows).toBe(before.count + 1);
  expect(after.scrolls, 'nothing to scroll with one more row at 700 px tall').toBe(false);
});

test('the current page at the end of the nav is in view at 700 px tall', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 700 });
  await gotoHub(page, '/account');
  const current = page.getByRole('navigation', { name: strings['nav.label'] }).locator('[aria-current="page"]');
  await expect(current).toBeInViewport({ ratio: 1 });
});

test.describe('a touch screen', () => {
  test.use({ viewport: { width: 1440, height: 700 }, hasTouch: true, isMobile: true });

  test('rows keep their 44 px touch height and the labels 24 px', async ({ page }) => {
    test.setTimeout(90_000);
    await gotoHub(page, '/home');
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the run emulates a coarse pointer').toBe(true);
    const m = await fluid(page);
    expect(m.rowH).toBe(44);
    expect(m.labelH).toBe(24);
  });
});

test('the "On <computer>" switch: an 18 px label with a 24 px hit area reaching up, never over the first row', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await gotoHub(page, '/home');
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  const button = nav.locator('[role="group"] > button:first-child').first();
  await expect(button).toBeVisible();
  const hit = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const at = (y: number) => document.elementFromPoint(x, y)?.closest('button') === el;
    const row = el.parentElement!.querySelector('li')!.getBoundingClientRect();
    const label = r.height - parseFloat(getComputedStyle(el).paddingTop);
    // The block line above: the group's top border. The hit box (and so its focus ring) starts under it.
    const group = el.parentElement!;
    const line = group.getBoundingClientRect().top + parseFloat(getComputedStyle(group).borderTopWidth);
    // Hit from 6 px above the drawn label down to the label's end: 1 px inside each edge, and the first row's top is not it.
    const top = r.bottom - 24;
    return { h: Math.round(label), hit: Math.round(r.height), above: at(top + 1), inside: at(r.bottom - 1), row: at(row.top + 1), underLine: r.top >= line - 0.01 };
  });
  expect(hit).toEqual({ h: 18, hit: 24, above: true, inside: true, row: false, underLine: true });
});

test('a window made shorter keeps the current page in view', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await gotoHub(page, '/account');
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toBeInViewport({ ratio: 1 });
  await page.setViewportSize({ width: 1440, height: 560 });
  const scroller = nav.locator('xpath=./div[.//*[@role="group"]]');
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight > el.clientHeight), 'the groups scroll at 560 px').toBe(true);
  await expect.poll(async () => {
    const row = await current.evaluate((el) => (el.closest('li') as HTMLElement).getBoundingClientRect().toJSON() as DOMRect);
    const view = await scroller.evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    return row.top >= view.top - 0.5 && row.bottom <= view.bottom + 0.5;
  }, 'the current row is inside the scrolled groups').toBe(true);
});

/** Where the Account block sits in the nav: the scroller's box and bottom padding, the block before Account, Account
 *  itself and the foot's top. Account is the last group (role group, labelled Account). */
async function accountPlace(page: Page, nav = page.getByRole('navigation', { name: strings['nav.label'] })) {
  await expect.poll(() => nav.getByRole('group').count(), 'the blocks are drawn').toBeGreaterThan(2);
  return nav.evaluate((el) => {
    const scroller = Array.from(el.children).find((c) => c.querySelector('[role="group"]')) as HTMLElement;
    const groups = Array.from(scroller.querySelectorAll(':scope > [role="group"]'));
    const account = groups[groups.length - 1] as HTMLElement;
    const before = groups[groups.length - 2] as HTMLElement;
    const s = scroller.getBoundingClientRect();
    const a = account.getBoundingClientRect();
    const b = before.getBoundingClientRect();
    const foot = (el.lastElementChild as HTMLElement).getBoundingClientRect();
    return {
      name: account.getAttribute('aria-label'),
      scrolls: scroller.scrollHeight > scroller.clientHeight,
      gap: a.top - b.bottom,
      // From Account's end to the end of the groups' box (inside its padding), and to the end of the scrolled content.
      toEnd: s.bottom - parseFloat(getComputedStyle(scroller).paddingBottom) - a.bottom,
      contentEnd: scroller.scrollHeight - parseFloat(getComputedStyle(scroller).paddingBottom) - (a.bottom - s.top + scroller.scrollTop),
      aboveFoot: foot.top - a.bottom,
      line: `${getComputedStyle(account).borderTopWidth} ${getComputedStyle(account).borderTopStyle}`,
      order: groups.map((g) => g.getAttribute('aria-label') ?? 'main'),
    };
  });
}

for (const [width, height] of [[1440, 1300], [1440, 1080]] as const)
  test(`Account at the bottom (${width}x${height}): just above the foot's line, the free space above it`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height });
    await gotoHub(page, '/home');
    const p = await accountPlace(page);
    expect(p.name).toBe(strings['nav.group.account']);
    expect(p.order[0], 'the main block stays at the top').toBe('main');
    expect(p.scrolls, 'nothing to scroll').toBe(false);
    expect(Math.abs(p.toEnd), 'Account ends at the bottom of the groups').toBeLessThanOrEqual(1);
    expect(p.aboveFoot, 'Account is above the foot, never in it').toBeGreaterThanOrEqual(0);
    expect(p.aboveFoot, 'only the groups padding between Account and the foot line').toBeLessThanOrEqual(5);
    expect(p.gap, 'the free space sits between On <computer> and Account').toBeGreaterThan(height >= 1300 ? 100 : 5);
    expect(p.line, 'Account keeps its block line').toBe('1px solid');
  });

test('rail: Account at the bottom just above the foot', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1300 });
  await page.addInitScript(() => { try { window.localStorage.setItem('hub.v3.shell', JSON.stringify({ collapsed: true })); } catch { /* none */ } });
  await gotoHub(page, '/home');
  const p = await accountPlace(page);
  expect(p.scrolls).toBe(false);
  expect(Math.abs(p.toEnd)).toBeLessThanOrEqual(1);
  expect(p.aboveFoot).toBeGreaterThanOrEqual(0);
  expect(p.gap).toBeGreaterThan(100);
});

test('short window: Account follows On <computer> in the one scrolling list, its line 5 px below, nothing overlaps', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 560 });
  await gotoHub(page, '/home');
  const nav = page.getByRole('navigation', { name: strings['nav.label'] });
  const p = await accountPlace(page);
  expect(p.scrolls, 'the groups overflow at 560 px').toBe(true);
  expect(p.gap, 'the block before keeps its 5 px above Account\'s line, no more').toBeCloseTo(5, 0);
  expect(Math.abs(p.contentEnd), 'Account is the end of the scrolled list').toBeLessThanOrEqual(1);
  // Scrolled to the end, Account's last row is inside the scroller, above the foot.
  const scroller = nav.locator('xpath=./div[.//*[@role="group"]]');
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const last = nav.getByRole('group', { name: strings['nav.group.account'] }).getByRole('listitem').last();
  await expect(last).toBeInViewport({ ratio: 1 });
  const foot = await nav.locator('xpath=./div[last()]').boundingBox();
  const row = await last.boundingBox();
  expect(row && foot && row.y + row.height).toBeLessThanOrEqual(foot!.y + 0.5);
});

// The phone drawer: one case per overflow state, each asserting the state it
// expects. At 390 px the touch rows overflow up to about 1200 px tall (measured at 1073: 844 and 1200 scroll, 1400 not).
async function openDrawer(page: Page) {
  await gotoHub(page, '/home');
  const more = page.getByRole('navigation', { name: 'Quick navigation' }).getByRole('button', { name: 'More', exact: true });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
}

test.describe('the phone drawer, short (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the list scrolls as one; Account follows the block before at 5 px, ends the list, and scrolled there sits wholly inside the scroller above the foot', async ({ page }) => {
    test.setTimeout(90_000);
    await openDrawer(page);
    // The drawer is the same nav, moved in over the page.
    const p = await accountPlace(page);
    expect(p.order[p.order.length - 1]).toBe(strings['nav.group.account']);
    expect(p.scrolls, 'the touch rows overflow at 844 px').toBe(true);
    expect(p.gap, 'the block before keeps its 5 px above Account\'s line').toBeCloseTo(5, 0);
    expect(Math.abs(p.contentEnd), 'Account is the end of the scrolled list').toBeLessThanOrEqual(1);
    const nav = page.getByRole('navigation', { name: strings['nav.label'] });
    const scroller = nav.locator('xpath=./div[.//*[@role="group"]]');
    await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const box = await scroller.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const last = await nav.getByRole('group', { name: strings['nav.group.account'] }).getByRole('listitem').last().boundingBox();
    const foot = await nav.locator('xpath=./div[last()]').boundingBox();
    expect(last, 'the last Account row is drawn').not.toBeNull();
    expect(last!.y, 'its top is inside the scroller').toBeGreaterThanOrEqual(box.top - 0.5);
    expect(last!.y + last!.height, 'its bottom is inside the scroller').toBeLessThanOrEqual(box.bottom + 0.5);
    expect(last!.y + last!.height, 'and above the foot').toBeLessThanOrEqual(foot!.y + 0.5);
  });
});

test.describe('the phone drawer, tall (390x1400)', () => {
  test.use({ viewport: { width: 390, height: 1400 }, hasTouch: true, isMobile: true });

  test('nothing scrolls; Account is the last block, at the bottom of the groups just above the foot, the free space above it', async ({ page }) => {
    test.setTimeout(90_000);
    await openDrawer(page);
    const p = await accountPlace(page);
    expect(p.order[p.order.length - 1]).toBe(strings['nav.group.account']);
    expect(p.scrolls, 'every row fits at 1400 px').toBe(false);
    expect(Math.abs(p.toEnd), 'Account ends at the bottom of the groups').toBeLessThanOrEqual(1);
    expect(p.aboveFoot, 'Account is above the foot, never in it').toBeGreaterThanOrEqual(0);
    expect(p.aboveFoot, 'only the groups padding between Account and the foot line').toBeLessThanOrEqual(5);
    expect(p.gap, 'the free space sits between the block before and Account').toBeGreaterThan(5);
  });
});
