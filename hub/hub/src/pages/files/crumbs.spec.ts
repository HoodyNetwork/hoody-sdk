// Playwright: a pane's breadcrumbs stay one line beside Up,
// Find and Put on Board, at phone width and in a narrow split pane, and every crumb stays in view and clickable: a long
// name is cut with an ellipsis, never pushed out. The crumb names are set long in place (the fixture folders have
// one-letter names), as the picker spec does.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import { BAR_WIDTHS } from './bar';
import strings from './strings.en.json';
import us from './Upload.strings.en.json';

const LONG = 'quarterly-reports-archive-2026-final';
const DEEP = '%2Fsrv%2Fa%2Fb%2Fc%2Fd%2Fe%2Ff%2Fg';

/** Sets the computer, parent and folder crumbs long and measures every crumb's link against the crumbs box. */
async function measure(page: Page, pane: string) {
  return page.evaluate(
    ({ pane, long }) => {
      const region = [...document.querySelectorAll<HTMLElement>('section[aria-label]')].find((x) => x.getAttribute('aria-label') === pane);
      const list = region?.querySelector<HTMLElement>('ol[aria-label="Breadcrumbs"]');
      if (!region || !list) throw new Error('no breadcrumbs');
      const items = [...list.querySelectorAll<HTMLElement>('li')];
      const linkOf = (li: HTMLElement) => li.firstElementChild as HTMLElement;
      for (const i of [0, items.length - 2, items.length - 1]) linkOf(items[i]!).textContent = long;
      const box = list.parentElement!.getBoundingClientRect();
      return {
        rows: Math.max(...items.map((li) => li.getBoundingClientRect().top)) - Math.min(...items.map((li) => li.getBoundingClientRect().top)),
        box: { left: box.left, right: Math.min(box.right, region.getBoundingClientRect().right) },
        links: items.map((li) => {
          const a = linkOf(li);
          const r = a.getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width, natural: a.scrollWidth };
        }),
      };
    },
    { pane, long: LONG },
  );
}

function expectAllInView(m: Awaited<ReturnType<typeof measure>>) {
  // One line: every crumb starts on the same row.
  expect(m.rows).toBeLessThanOrEqual(1);
  // Every crumb's link is inside the box with a few characters showing (or all of a shorter label, the "…"): none is
  // pushed out of reach.
  for (const l of m.links) {
    expect(l.left).toBeGreaterThanOrEqual(m.box.left - 1);
    expect(l.right).toBeLessThanOrEqual(m.box.right + 1);
    expect(l.width).toBeGreaterThanOrEqual(Math.min(12, l.natural - 1));
  }
}

/** Clicks crumb `i` of the pane by pointer and returns the pane's folder from the address afterwards. */
async function clickCrumb(page: Page, pane: string, i: number, key: 'ap' | 'bp') {
  const crumbs = page.getByRole('region', { name: pane }).getByRole('list', { name: 'Breadcrumbs' }).getByRole('listitem');
  const box = await crumbs.nth(i).locator(':scope > :first-child').boundingBox(); // the crumb's link, by position
  if (!box) throw new Error('crumb not drawn');
  await page.mouse.click(box.x + Math.min(8, box.width / 2), box.y + box.height / 2);
  await expect.poll(() => new URL(page.url().replace('#', '')).searchParams.get(key) ?? '/').not.toBe(decodeURIComponent(DEEP));
  return new URL(page.url().replace('#', '')).searchParams.get(key) ?? '/';
}

test('phone width: long crumbs stay on one line, all in view; the parent crumb opens the parent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  expectAllInView(await measure(page, strings['pane.a']));
  expect(await clickCrumb(page, strings['pane.a'], 2, 'ap')).toBe('/srv/a/b/c/d/e/f');
});

test('phone width: with long names the "/" crumb (the top folder) still opens the top folder', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  await measure(page, strings['pane.a']);
  expect(await clickCrumb(page, strings['pane.a'], 0, 'ap')).toBe('/');
});

test('narrow split pane: long crumbs stay on one line, all in view; the folded crumb opens the deepest folder it hides', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.b'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  expectAllInView(await measure(page, strings['pane.b']));
  expect(await clickCrumb(page, strings['pane.b'], 1, 'bp')).toBe('/srv/a/b/c/d/e');
});

test('keyboard: every crumb link, focused, is inside the crumbs box', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  const m = await measure(page, strings['pane.a']);
  const links = page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' }).getByRole('link');
  const n = await links.count();
  expect(n).toBe(4); // "/" (the top folder), "…", the parent and the folder itself (the current crumb)
  for (let i = 0; i < n; i++) {
    await links.nth(i).focus();
    const r = (await links.nth(i).boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(m.box.left - 1);
    expect(r.x + r.width).toBeLessThanOrEqual(m.box.right + 1);
  }
});

// The crumbs get their room from New folder and Find (the bar's buttons are large): on a narrow bar both
// show their icon only and keep their names; on a wide bar both show their label. Both sit at the bar's end.
test('a narrow bar shows New folder and Find as icons with their names on a second line; a wide bar shows their labels beside the crumbs', async ({ page }) => {
  for (const [width, labels] of [[390, false], [1440, true]] as const) {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
    const pane = page.getByRole('region', { name: strings['pane.a'] });
    for (const name of [strings['action.newFolder'], strings['action.find']]) {
      const button = pane.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      if (labels) await expect(button).toContainText(name);
      else await expect(button).not.toContainText(name);
    }
    // New folder sits with the folder's actions at the bar's end, after Find and clear of the crumbs. On a
    // phone the actions take a second line under the crumbs; on a wide bar they sit beside them.
    const bar = pane.locator('[class*="files-module__bar_"]');
    const crumbs = bar.locator('[class*="files-module__crumbs_"]');
    const [b, c, f, n] = await Promise.all([bar.boundingBox(), crumbs.boundingBox(), pane.getByRole('button', { name: strings['action.find'], exact: true }).boundingBox(), pane.getByRole('button', { name: strings['action.newFolder'], exact: true }).boundingBox()]);
    expect(n!.x + n!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
    expect(f!.x + f!.width).toBeLessThanOrEqual(n!.x);
    if (labels) expect(c!.x + c!.width).toBeLessThan(f!.x);
    else expect(f!.y).toBeGreaterThanOrEqual(c!.y + c!.height);
  }
});

// A split pane at 1440 (about 560px): with the picker as the path's root, Up, the picker and a deep trail with
// long names take the first line, in view, and the actions the second, in order: Find, then New folder, inside the bar.
test('a 1440 split pane: a long deep trail stays in view, the actions take a second line, Find before New folder', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=${DEEP}`);
  const pane = page.getByRole('region', { name: strings['pane.b'] });
  await expect(pane.getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  expectAllInView(await measure(page, strings['pane.b']));
  const bar = pane.locator('[class*="files-module__bar_"]');
  const [b, c, f, n] = await Promise.all([bar.boundingBox(), bar.locator('[class*="files-module__crumbs_"]').boundingBox(), pane.getByRole('button', { name: strings['action.find'], exact: true }).boundingBox(), pane.getByRole('button', { name: strings['action.newFolder'], exact: true }).boundingBox()]);
  expect(b!.width).toBeLessThan(BAR_WIDTHS.fine.stack);
  expect(f!.y).toBeGreaterThanOrEqual(c!.y + c!.height);
  expect(c!.x + c!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
  expect(f!.x + f!.width).toBeLessThanOrEqual(n!.x);
  expect(n!.x + n!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
});

// A narrow split pane: a deep trail still stays on one line and in view, and the actions keep their order at the bar's
// end with More last and inside the bar. Put on Board sits in More, so these run
// with or without the Board.
/** How long a resize may take to settle before a layout check fails: above one attempt's own waits (barActions waits for
    each button to show, 5 s by default), so a retry always gets a second try. */
const SETTLE_MS = 15_000;

/** The bar's boxes: the bar, the crumbs, Up, and the actions in order (Find, New folder, Upload, More: Run here,
    Download from link and Put on Board are in More). */
async function barActions(page: Page, paneName: string) {
  const pane = page.getByRole('region', { name: paneName });
  const bar = pane.locator('[class*="files-module__bar_"]');
  const buttons = [
    pane.getByRole('button', { name: strings['action.find'], exact: true }),
    pane.getByRole('button', { name: strings['action.newFolder'], exact: true }),
    pane.getByRole('button', { name: us['action.upload'], exact: true }),
    pane.getByRole('button', { name: strings['action.more'], exact: true }),
  ];
  for (const b of buttons) await expect(b).toBeVisible();
  const [box, crumbs, up, ...rest] = await Promise.all([bar.boundingBox(), bar.locator('[class*="files-module__crumbs_"]').boundingBox(), pane.getByRole('button', { name: strings['action.up'], exact: true }).boundingBox(), ...buttons.map((b) => b.boundingBox())]);
  return { box: box!, crumbs: crumbs!, up: up!, actions: rest.map((r) => r!) };
}

function expectActionsInOrder(m: Awaited<ReturnType<typeof barActions>>, hit: number, stacked: boolean | 'either' = false) {
  // No action is squeezed below its hit size (28px, 44px on a coarse pointer): the crumbs give way, never a button.
  for (const a of [m.up, ...m.actions]) expect(Math.min(a.width, a.height)).toBeGreaterThanOrEqual(hit - 1);
  // The actions share one row: beside the crumbs, or (a phone) on a second line under them.
  const mid = (r: { y: number; height: number }) => r.y + r.height / 2;
  for (const a of m.actions) expect(Math.abs(mid(a) - mid(m.actions[0]!))).toBeLessThanOrEqual(2);
  if (stacked === 'either') stacked = m.actions[0]!.y >= m.crumbs.y + m.crumbs.height;
  if (stacked) expect(m.actions[0]!.y).toBeGreaterThanOrEqual(m.crumbs.y + m.crumbs.height);
  else expect(m.crumbs.x + m.crumbs.width).toBeLessThan(m.actions[0]!.x);
  for (let i = 1; i < m.actions.length; i++) expect(m.actions[i - 1]!.x + m.actions[i - 1]!.width).toBeLessThanOrEqual(m.actions[i]!.x);
  const last = m.actions.at(-1)!;
  expect(last.x + last.width).toBeLessThanOrEqual(m.box.x + m.box.width + 1);
  expect(last.x).toBeGreaterThanOrEqual(m.box.x);
}

test.describe('a split pane', () => {

  test('a split pane with its bar near 520px: a long deep trail stays in view, More last and inside the bar', async ({ page }) => {
    await page.setViewportSize({ width: 1350, height: 800 });
    await gotoHub(page, `/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=${DEEP}`);
    const pane = page.getByRole('region', { name: strings['pane.b'] });
    await expect(pane.getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
    const m = await barActions(page, strings['pane.b']);
    expect(m.box.width).toBeGreaterThan(470);
    expect(m.box.width).toBeLessThan(570);
    expectAllInView(await measure(page, strings['pane.b']));
    // With the picker as the path's root this bar is below `stack`: the actions take a second line.
    expectActionsInOrder(await barActions(page, strings['pane.b']), 28, m.box.width < BAR_WIDTHS.fine.stack);
  });

  // Below `labels`, with the picker in the bar: Find and New folder show their icons (names kept), More
  // is an icon, and the actions take the second line, in view and in order.
  test('a 1440 split pane: Find, New folder and More are icons with their names, on a second line, in view and in order', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await gotoHub(page, `/files?a=atlas.00a1&ap=%2Fsrv&b=atlas.00a1&bp=${DEEP}`);
    const pane = page.getByRole('region', { name: strings['pane.b'] });
    await expect(pane.getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
    for (const k of ['action.find', 'action.newFolder', 'action.more'] as const) await expect(pane.getByRole('button', { name: strings[k], exact: true })).not.toContainText(strings[k]);
    expectAllInView(await measure(page, strings['pane.b']));
    const m = await barActions(page, strings['pane.b']);
    expect(m.box.width).toBeLessThan(BAR_WIDTHS.fine.labels);
    expectActionsInOrder(m, 28, true);
  });
});

test('phone width, fine pointer: the actions take a second line, each at its full size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  expectAllInView(await measure(page, strings['pane.a']));
  expectActionsInOrder(await barActions(page, strings['pane.a']), 28, true);
});

/** Every width from a small phone to a wide pane, one pane: the trail stays in view and no action is squeezed. */
async function sweep(page: Page, hit: number) {
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  const pane = page.getByRole('region', { name: strings['pane.a'] });
  await expect(pane.getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  for (let w = 340; w <= 1100; w += 4) { // 4px steps: the narrowest bad window seen was 9px wide
    await page.setViewportSize({ width: w, height: 800 });
    await expect.poll(async () => (await pane.locator('[class*="files-module__bar_"]').boundingBox())?.width ?? 0).toBeGreaterThan(0);
    // The bar settles a few frames after the resize: the checks retry until they hold, bounded, never a fixed sleep.
    await test.step(`viewport ${w}`, async () => {
      await expect(async () => {
        expectAllInView(await measure(page, strings['pane.a']));
        expectActionsInOrder(await barActions(page, strings['pane.a']), hit, 'either');
      }).toPass({ timeout: SETTLE_MS });
    });
  }
}

/** Sets the bar's own width (its clientWidth, what view.tsx reads) to `px` exactly by moving the viewport. */
async function setBarWidth(page: Page, px: number) {
  const bar = page.getByRole('region', { name: strings['pane.a'] }).locator('[class*="files-module__bar_"]');
  let vw = px + 100;
  for (let i = 0; i < 8; i++) {
    await page.setViewportSize({ width: vw, height: 800 });
    // Read the width once it holds still: two reads in a row agree (bounded).
    let w = -1;
    await expect.poll(async () => { const was = w; w = await bar.evaluate((el) => el.clientWidth); return w === was; }, { timeout: SETTLE_MS }).toBe(true);
    if (w === px) return;
    vw += px - w;
  }
  throw new Error(`the bar can't be set to ${px}px`);
}

/** Which tier the bar shows: stacked, and which actions show their label. */
async function tierOf(page: Page) {
  const pane = page.getByRole('region', { name: strings['pane.a'] });
  const labelled = async (name: string) => ((await pane.getByRole('button', { name, exact: true }).textContent()) ?? '').includes(name);
  return {
    stacked: await pane.locator('[class*="files-module__bar_"]').evaluate((el) => [...el.classList].some((c) => c.includes('barStacked'))),
    find: await labelled(strings['action.find']),
    newFolder: await labelled(strings['action.newFolder']),
    upload: await labelled(us['action.upload']),
  };
}

/** Each threshold in bar.ts, 1px under and at it, on the real bar: the tier it names shows, and at both widths the
    trail stays in view with every action whole. The browser's own token sizes and gap decide, so a threshold too
    narrow for the bar's buttons fails here. */
async function thresholds(page: Page, pointer: 'fine' | 'coarse', hit: number) {
  const w = BAR_WIDTHS[pointer];
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  for (const edge of Object.values(w)) {
    for (const px of [edge - 1, edge]) {
      await test.step(`bar ${px}px`, async () => {
        await setBarWidth(page, px);
        await expect.poll(() => tierOf(page), { timeout: SETTLE_MS }).toEqual({ stacked: px < w.stack, find: px >= w.labels, newFolder: px >= w.labels, upload: px >= w.upload });
        await expect(async () => {
          expectAllInView(await measure(page, strings['pane.a']));
          expectActionsInOrder(await barActions(page, strings['pane.a']), hit, px < w.stack);
        }).toPass({ timeout: SETTLE_MS });
      });
    }
  }
}

test('each bar threshold, fine pointer: 1px under it the narrower tier shows, at it the wider one, and both fit', async ({ page }) => {
  test.setTimeout(120_000);
  await thresholds(page, 'fine', 28);
});

test('every bar width, fine pointer: the trail stays in view and no action is squeezed', async ({ page }) => {
  test.setTimeout(360_000);
  await sweep(page, 28);
});

test.describe('coarse pointer at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('every bar width, coarse pointer: the trail stays in view and no action is squeezed', async ({ page }) => {
    test.setTimeout(360_000);
    await sweep(page, 44);
  });

  test('each bar threshold, coarse pointer: 1px under it the narrower tier shows, at it the wider one, and both fit', async ({ page }) => {
    test.setTimeout(120_000);
    await thresholds(page, 'coarse', 44);
  });

  test('a long deep trail stays in view beside the icon actions, the last one (More) inside the bar', async ({ page }) => {
    await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
    await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
    expectAllInView(await measure(page, strings['pane.a']));
    expectActionsInOrder(await barActions(page, strings['pane.a']), 44, true);
  });
});

// The computer picker is the path's root. One row on a wide pane (Up, the picker, "/" and the folders,
// the actions); at phone width Up and the picker share the first line, the crumbs take theirs when they don't fit
// beside it, and nothing leaves the bar or overlaps.
async function rowOf(page: Page, paneName: string) {
  const pane = page.getByRole('region', { name: paneName });
  const bar = pane.locator('[class*="files-module__bar_"]');
  const picker = bar.getByRole('button', { name: new RegExp(`${strings['pick.label'].replace('{{pane}}', paneName)}$`) });
  const [box, up, pick, crumbs] = await Promise.all([bar.boundingBox(), bar.getByRole('button', { name: strings['action.up'], exact: true }).boundingBox(), picker.boundingBox(), bar.locator('[class*="files-module__crumbs_"]').boundingBox()]);
  return { box: box!, up: up!, pick: pick!, crumbs: crumbs!, heads: await pane.locator('[class*="files-module__paneHead_"]').count() };
}
const mid = (r: { y: number; height: number }) => r.y + r.height / 2;

test('a wide pane: Up, the picker and the crumbs on one line in that order, no head above the bar', async ({ page }) => {
  await page.setViewportSize({ width: 1350, height: 800 });
  await gotoHub(page, '/files?a=atlas.00a1&ap=%2Fhome%2Fada');
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  const r = await rowOf(page, strings['pane.a']);
  expect(r.heads).toBe(0);
  for (const x of [r.pick, r.crumbs]) expect(Math.abs(mid(x) - mid(r.up))).toBeLessThanOrEqual(2);
  expect(r.up.x + r.up.width).toBeLessThanOrEqual(r.pick.x);
  expect(r.pick.x + r.pick.width).toBeLessThanOrEqual(r.crumbs.x);
  // The picker keeps its marks: at least its minimum (10rem) and never past the bar.
  expect(r.pick.width).toBeGreaterThanOrEqual(159);
  expect(r.crumbs.x + r.crumbs.width).toBeLessThanOrEqual(r.box.x + r.box.width + 1);
});

test('phone width: Up and the picker share the first line, the crumbs stay in view under or beside it, nothing overlaps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, `/files?a=atlas.00a1&ap=${DEEP}`);
  await expect(page.getByRole('region', { name: strings['pane.a'] }).getByRole('list', { name: 'Breadcrumbs' })).toBeVisible();
  const r = await rowOf(page, strings['pane.a']);
  expect(Math.abs(mid(r.pick) - mid(r.up))).toBeLessThanOrEqual(2);
  expect(r.pick.x + r.pick.width).toBeLessThanOrEqual(r.box.x + r.box.width + 1);
  // The crumbs: beside the picker, or on a line of their own under it, never over it.
  if (Math.abs(mid(r.crumbs) - mid(r.pick)) > 2) expect(r.crumbs.y).toBeGreaterThanOrEqual(r.pick.y + r.pick.height - 1);
  else expect(r.pick.x + r.pick.width).toBeLessThanOrEqual(r.crumbs.x);
  expectAllInView(await measure(page, strings['pane.a']));
});
