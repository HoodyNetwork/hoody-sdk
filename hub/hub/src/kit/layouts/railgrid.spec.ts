// The one left rail, measured in a real browser on real pages. Every rail keeps one lead column and one text edge
// (kit/tokens.css --rail-*), whatever its width; nothing runs past its end edge; a group label stays on one line; the ⋯ has its
// own column; the AI rail resizes with the same handle as the list pages. Numbers are from the rail's own edge, so the
// frame of a framed list (1 px) is read from the page, never assumed.
import { type Locator, type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const WIDTHS = [280, 340, 560] as const;
const AI = 'nav[class*="RailPane"]';
const LIST = 'section[class*="ListDetailPage"][class*="list"]';
const PAD = 12;
const TEXT = 36;
/** A row under a group header is its child, one --group-indent (the lead column and its
 *  gap) further in, and the group's note is a callout box half that in from the rail's pad. */
const GROUP = 24;

async function textLeft(page: Page, rail: string, sel: string): Promise<number | null> {
  return page.evaluate(([r, q]) => {
    const root = document.querySelector(r as string);
    const el = root?.querySelector(q as string);
    if (!root || !el) return null;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const g = document.createRange();
      g.selectNodeContents(n);
      return g.getBoundingClientRect().left - root.getBoundingClientRect().left;
    }
    return null;
  }, [rail, sel]);
}

async function left(page: Page, rail: string, sel: string): Promise<number | null> {
  return page.evaluate(([r, q]) => {
    const root = document.querySelector(r as string);
    const el = root?.querySelector(q as string);
    return root && el ? el.getBoundingClientRect().left - root.getBoundingClientRect().left : null;
  }, [rail, sel]);
}

/** What runs past the rail's end edge: scrollers and clipped text stay inside; the handle lies over the edge on purpose. */
async function overflowing(page: Page, rail: string): Promise<string[]> {
  return page.evaluate((r) => {
    const root = document.querySelector(r);
    if (!root) return ['no rail'];
    const end = root.getBoundingClientRect().right + 0.5;
    return [...root.querySelectorAll<HTMLElement>('*')]
      .filter((e) => e.getClientRects().length > 0 && e.getAttribute('role') !== 'separator' && !e.closest('[role="separator"]'))
      .filter((e) => e.getBoundingClientRect().right > end && getComputedStyle(e).position !== 'absolute')
      .map((e) => `${e.tagName} ${e.className}`.slice(0, 80));
  }, rail);
}

async function open(page: Page, path: string, key: string, width: number | null, vp = { width: 1440, height: 900 }, fx?: string): Promise<void> {
  await page.setViewportSize(vp);
  if (width !== null) await page.addInitScript(([w, k]) => { try { localStorage.setItem(`hub.v3.pane.${k}.list`, String(w)); } catch { /* the default then */ } }, [width, key] as const);
  await gotoHub(page, path, fx ? { state: fx } : {});
}

/** Bots opens on cards, and a phone draws no Cards / List switch: the List choice is made beforehand, as remembered. */
async function listChosen(page: Page): Promise<void> {
  await page.addInitScript(() => { try { localStorage.setItem('hub.v3.table.present.bots', 'list'); } catch { /* cards then */ } });
}

for (const w of WIDTHS) {
  test(`the AI rail's parts share one grid at ${w}`, async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, '/ai', 'ai', w);
    await page.locator(`${AI} td[class*="listCell"]`).first().waitFor();
    expect((await page.locator(AI).boundingBox())?.width).toBe(w);
    expect(await left(page, AI, 'ul a svg'), 'nav icon').toBe(PAD);
    expect(await textLeft(page, AI, 'ul a'), 'nav label').toBe(TEXT);
    expect(await left(page, AI, '[class*="where"] svg'), 'foot icon').toBe(PAD);
    expect(await textLeft(page, AI, '[class*="whereText"]'), 'foot text').toBe(TEXT);
    // Running, the foot offers Pause in its gear menu, not as a button of its own.
    await expect(page.locator(`${AI} [data-pause="running"] button`), 'no top-level Pause').toHaveCount(0);
    expect(await textLeft(page, AI, 'td[class*="listCell"] [class*="listLine1"]'), 'row title (a time group\'s child)').toBe(TEXT + GROUP);
    expect(await textLeft(page, AI, '[class*="groupLabel"]'), 'group label').toBe(TEXT);
    expect(await overflowing(page, AI)).toEqual([]);
  });

  for (const pg of [
    { name: 'Bots', path: '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', key: 'bots' },
    { name: 'Computers', path: '/computers?sel=cedar.00c3', key: 'computers' },
  ]) {
    test(`${pg.name} keeps the same grid inside its frame at ${w}`, async ({ page }) => {
      test.setTimeout(90_000);
      await open(page, pg.path, pg.key, w);
      await page.locator(`${LIST} td[class*="listCell"]`).first().waitFor();
      const box = await page.locator(`${LIST} [data-rail]`).first().evaluate((e) => e.getBoundingClientRect().left - (e.closest('section') as Element).getBoundingClientRect().left + parseFloat(getComputedStyle(e).borderInlineStartWidth));
      const group = await textLeft(page, LIST, '[class*="groupLabel"]');
      // The measured row is a group's child when a group header row comes before it in its table (loose rows come first),
      // read from the rows themselves, never from the mark under test.
      const first = await page.locator(`${LIST} td[class*="listCell"]`).first().evaluate((td) => {
        let grouped = false;
        for (let tr = td.closest('tr')?.previousElementSibling; tr && !grouped; tr = tr.previousElementSibling)
          grouped = !tr.hasAttribute('data-row-id') && !!tr.querySelector(':scope > td > span > button[aria-expanded]');
        return { grouped, marked: td.hasAttribute('data-group-indent') };
      });
      expect(first.marked, 'the row carries the group indent mark exactly when it is a group\'s child').toBe(first.grouped);
      expect(await textLeft(page, LIST, 'td[class*="listCell"] [class*="listLine1"]'), 'row title').toBe(box + TEXT + (first.grouped ? GROUP : 0));
      if (group !== null) expect(group, 'group label').toBe(box + TEXT);
      expect(await overflowing(page, LIST)).toEqual([]);
    });
  }
}

test('a group label stays on one line, even in the narrowest rail', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai', 'ai', 280);
  const label = page.locator(`${AI} [class*="groupLabel"]`).first();
  await label.waitFor();
  const lineHeight = await label.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  for (const h of await page.locator(`${AI} [class*="groupLabel"]`).evaluateAll((all) => all.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThanOrEqual(lineHeight + 1);
});

// A list row's ⋯ is the plain ghost dots at every
// width, so a row's hover no longer brings a framed box back; only the ⋯'s own hover shows the ghost plate (no frame).
test('the ⋯ has its own column: it never lands on the line under the title, and it is the plain ghost dots', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai', 'ai', 280);
  const row = page.locator(`${AI} td[class*="listCell"]`).first();
  await row.waitFor();
  const r = await row.boundingBox();
  const more = row.locator('[class*="rowMore"]').first();
  const m = await more.boundingBox();
  expect(m && r && Math.abs(m.y + m.height / 2 - (r.y + r.height / 2))).toBeLessThanOrEqual(1);
  // A rail asks for xs, so its ⋯ is 24 wide (it was 28, set by the table's CSS), and the end column is as wide.
  expect(m?.width, 'the ⋯ is the end column wide, so it cannot stick out of it').toBe(24);
  await page.mouse.move(800, 500);
  // The kit button paints its plate as a background image from --plate (its background colour stays transparent), so
  // the plate is read from --plate, its frame from --plate-line.
  const look = () => more.evaluate((e) => { const c = getComputedStyle(e); return { border: c.borderTopColor, shadow: c.boxShadow, plate: c.getPropertyValue('--plate').trim(), line: c.getPropertyValue('--plate-line').trim() }; });
  const plain = { border: 'rgba(0, 0, 0, 0)', shadow: 'none', plate: 'transparent', line: 'transparent' };
  await expect.poll(look).toEqual(plain);
  await row.hover();
  await page.waitForTimeout(250);
  expect(await look(), 'a row hover leaves the dots plain').toEqual(plain);
  await more.hover();
  await expect.poll(async () => (await look()).plate, 'the ⋯ hovered: the ghost plate').not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))?$/);
  expect((await look()).line, 'a ghost plate has no frame').toBe('transparent');
  expect((await look()).border, 'a ghost plate has no frame').toBe('rgba(0, 0, 0, 0)');
});

test('the AI rail resizes with the list pages\' handle: drag, clamp, keys, remembered', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '/ai', 'ai', null);
  const rail = page.locator(AI);
  await page.locator(`${AI} td[class*="listCell"]`).first().waitFor();
  const width = async () => (await rail.boundingBox())?.width;
  expect(await width(), 'the default of every rail').toBe(340);
  const handle = page.getByRole('separator', { name: /^Resize (list|the chat list)$/ });
  const drag = async (dx: number) => {
    const b = await handle.boundingBox();
    if (!b) throw new Error('no handle');
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx / 2, y);
    await page.mouse.move(x + dx, y);
    await page.mouse.up();
  };
  await drag(100);
  await expect.poll(width).toBe(440);
  await drag(2000);
  await expect.poll(width).toBe(560);
  await drag(-2000);
  await expect.poll(width).toBe(280);
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  const stepped = await width();
  expect(stepped).toBeGreaterThan(280);
  await page.reload();
  await page.locator(`${AI} td[class*="listCell"]`).first().waitFor();
  expect(await width(), 'remembered on this device').toBe(stepped);
});

test('a conversation\'s frame draws the same rail: its width, its handle, one line at its end', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '/ai', 'ai', 400);
  await page.locator(`${AI} td[class*="listCell"]`).nth(1).click();
  await expect(page).toHaveURL(/\/ai\/c\//);
  const pane = page.locator(`div:has(> ${AI})`).first();
  await expect.poll(async () => (await pane.boundingBox())?.width).toBe(400);
  expect(await page.locator(AI).evaluate((e) => getComputedStyle(e).borderInlineEndWidth), 'the frame draws the line').toBe('0px');
  await expect(page.getByRole('separator', { name: /^Resize (list|the chat list)$/ })).toBeVisible();
  // The frame takes its height from the rail's region: the composer ends inside the window, no outer page scroll.
  const out = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight - innerHeight, main: (() => { const m = document.querySelector('#hub-main'); return m ? m.scrollHeight - m.clientHeight : 0; })() }));
  expect(Math.max(out.doc, out.main), 'the conversation fits its region').toBeLessThanOrEqual(1);
});

test('a conversation at 860 keeps a real rail beside it: a list of destinations, its handle, nothing under 280', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '/ai', 'ai', 560, { width: 1400, height: 900 });
  await page.locator(`${AI} td[class*="listCell"]`).nth(1).click();
  await expect(page).toHaveURL(/\/ai\/c\//);
  // The window that leaves the page 865 wide: above SplitLayout's break, under the rail's own least page.
  const chrome = 1400 - (await page.evaluate(() => (document.querySelector('#hub-main') as HTMLElement).clientWidth));
  await page.setViewportSize({ width: 865 + chrome, height: 900 });
  const shown = await page.evaluate(() => (document.querySelector('#hub-main') as HTMLElement).clientWidth);
  expect(shown, 'the page is in the window this test is about').toBeGreaterThanOrEqual(840);
  expect(shown).toBeLessThan(890);
  await expect.poll(() => page.locator(`${AI} ul`).first().evaluate((e) => getComputedStyle(e).display), 'no strip inside the rail').not.toBe('grid');
  await expect(page.getByRole('separator', { name: /^Resize (list|the chat list)$/ })).toBeVisible();
});

test('on a phone the destinations are two rows of two, and no label is cut', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai', 'ai', null, { width: 390, height: 844 });
  const cut = await page.locator(`${AI} ul`).first().evaluate((ul) => {
    const labels = [...ul.querySelectorAll('a span')].filter((e) => e.children.length === 0 && e.textContent);
    return { cut: labels.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent), cols: getComputedStyle(ul).gridTemplateColumns.split(' ').length };
  });
  expect(cut.cols).toBe(2);
  expect(cut.cut).toEqual([]);
});

test('a running computer with every Bot paused still shows its note and Resume, above the empty state', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/bots', 'bots', null, { width: 1440, height: 900 }, 'suspendedNoBots');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 30_000 });
});

test('a list handle works from what is drawn: at a narrow page End reports the drawn width, and the first key moves it', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, BOT, 'bots', 560, { width: 1200, height: 900 });
  const sep = page.getByRole('separator', { name: /^Resize (list|the chat list)$/ });
  await sep.waitFor();
  const drawn = () => page.locator(LIST).evaluate((e) => Math.round(e.getBoundingClientRect().width));
  const w0 = await drawn();
  expect(w0, 'the detail keeps its least width').toBeLessThan(560);
  expect(Number(await sep.getAttribute('aria-valuenow'))).toBeCloseTo(w0, -1);
  expect(Number(await sep.getAttribute('aria-valuemax'))).toBeCloseTo(w0, -1);
  await sep.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(drawn).toBeLessThan(w0);
});

test('at 1350x800 the default rail shows at least 4 chats, above the foot', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai', 'ai', null, { width: 1350, height: 800 });
  await page.locator(`${AI} td[class*="listCell"]`).first().waitFor();
  const shown = await page.locator(AI).evaluate((rail) => {
    const foot = rail.querySelector('[class*="foot"]')?.getBoundingClientRect().top ?? rail.getBoundingClientRect().bottom;
    return [...rail.querySelectorAll('td[class*="listCell"]')].filter((c) => c.getBoundingClientRect().bottom <= foot).length;
  });
  expect(shown).toBeGreaterThanOrEqual(4);
});

test('at 1350 the Models page keeps its own section rail beside the default rail, and the rail nav carries none of its attributes', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai/models', 'ai', null, { width: 1350, height: 800 });
  const item = page.locator('main nav button[data-nav]').first();
  await item.waitFor();
  expect(await item.evaluate((e) => getComputedStyle(e.parentElement as Element).flexDirection), 'a column, not the strip').toBe('column');
  await expect(page.locator(`${AI} [data-nav], ${AI} [data-more]`)).toHaveCount(0);
});

test('the nested menu of a destination lands on the rail\'s text edge', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai/auto/workflows', 'ai', 340);
  const nested = page.locator(`${AI} ul [role="list"] a[aria-current="page"]`);
  await nested.waitFor();
  expect(await textLeft(page, AI, 'ul [role="list"] a')).toBe(TEXT);
});

test('questions never sit beside a detail: the list keeps the rail\'s whole height', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief', 'bots', null);
  await page.locator(`${LIST} td[class*="listCell"]`).first().waitFor();
  await expect(page.locator(`${LIST} h2, ${LIST} h3`).filter({ hasText: 'Questions' })).toHaveCount(0);
});

test('on a phone the rail\'s foot stays above the bottom bar', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai', 'ai', null, { width: 390, height: 844 });
  const gear = page.locator(`${AI} [class*="whereEnd"] button`).last(); // the settings menu, at the end of the foot's where row
  await gear.waitFor();
  const bottom = (await gear.boundingBox())?.y ?? 0;
  const bar = await page.evaluate(() => [...document.querySelectorAll('nav')].filter((n) => !n.matches('[class*="pane"]') && n.getBoundingClientRect().bottom >= innerHeight - 1 && n.getBoundingClientRect().height > 0 && n.getBoundingClientRect().height < innerHeight / 3).map((n) => n.getBoundingClientRect().top)[0] ?? innerHeight);
  expect(bottom + ((await gear.boundingBox())?.height ?? 0)).toBeLessThanOrEqual(bar);
});

const BOT = '/bots?sel=c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const frameLeft = (page: Page) => page.locator(`${LIST} [data-rail]`).first().evaluate((e) => e.getBoundingClientRect().left - (e.closest('section') as Element).getBoundingClientRect().left + parseFloat(getComputedStyle(e).borderInlineStartWidth));

test('a group\'s notice in the rail is an inset callout: its box half a group indent in, its icon in its own lead column, its words after it, its action under them', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 280, undefined, 'railPaused');
  await expect(page.locator(`${LIST} [data-rail]`).first()).toBeVisible();
  await expect(page.locator(`${LIST} [role="status"], ${LIST} [role="alert"]`).first()).toBeVisible();
  const band = page.locator(`${LIST} [data-rail] [data-band-flush]`).first();
  await expect(band, 'the notice is the flush one').toBeVisible({ timeout: 5_000 });
  const box = await frameLeft(page);
  const callout = (await left(page, LIST, '[data-group-note] > [data-band-flush]')) ?? NaN;
  expect(callout, 'the callout box').toBe(box + PAD + GROUP / 2);
  // Inside its 1 px frame the Band keeps its own rail layout: the icon at its pad, the words a lead column and gap on.
  expect(await left(page, LIST, '[data-band-flush] svg'), 'icon').toBe(callout + 1 + PAD);
  expect(await textLeft(page, LIST, '[data-band-flush]'), 'words').toBe(callout + 1 + TEXT);
  expect(await overflowing(page, LIST)).toEqual([]);
  const words = await band.locator('[class*="text"]').first().boundingBox();
  const action = await band.locator('button').first().boundingBox();
  expect(words && action && action.y >= words.y + words.height - 1, 'the action sits under the words at 280').toBe(true);
});

test('a name too long for the rail stays on one line, and the row\'s status joins line 2', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 280, undefined, 'railLong');
  const label = page.locator(`${LIST} [data-rail] [class*="groupLabel"]`).first();
  await label.waitFor();
  const lineHeight = await label.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect((await label.boundingBox())?.height).toBeLessThanOrEqual(lineHeight + 1);
  expect(await overflowing(page, LIST)).toEqual([]);
});

test('a row\'s title is alone on line 1, with its status on line 2, and a two-line row is 56 tall', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 560);
  const row = page.locator(`${LIST} td[class*="listCell"]`).first();
  await row.waitFor();
  // The status is the kit's pill (StatusPill), a tag its twin: neither on line 1, the status pill on line 2.
  const chip = ':is([class*="pill" i], [class*="tag" i])';
  await expect(row.locator(`[class*="listLine1"] ${chip}`)).toHaveCount(0);
  await expect(row.locator(`[class*="listLine2"] [class*="pill" i]`).first()).toBeVisible();
  expect((await row.boundingBox())?.height).toBe(56);
});

test('in a rail each chat app is its mark, named in its tooltip and label, and the row stays two lines', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 340, undefined, 'railPaused');
  const row = page.locator(`${LIST} td[class*="listCell"]`).first();
  await row.waitFor();
  const marks = row.locator('[data-chat-app]');
  expect(await marks.count(), 'marks in the row').toBeGreaterThan(1);
  expect(await marks.evaluateAll((m) => m.map((e) => e.textContent?.trim()))).toEqual(await marks.evaluateAll((m) => m.map(() => '')));
  expect(await marks.evaluateAll((m) => m.every((e) => /^(Telegram|Slack|Discord)$/.test(e.getAttribute('aria-label') ?? ''))), 'each mark has its name as a label').toBe(true);
  expect((await row.boundingBox())?.height, 'two lines').toBe(56);
  const first = marks.first();
  const name = await first.getAttribute('aria-label');
  await page.mouse.move(5, 5); // a pointer already in use: the tooltip opens for a hover only once one has moved
  await first.hover();
  await expect(page.getByRole('tooltip'), 'the tooltip names the app').toHaveText(name ?? '');
});

test('the wide table keeps the chat apps\' names', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/bots', 'bots', null, { width: 1920, height: 1000 }, 'railPaused');
  await page.locator('table tbody tr').first().waitFor();
  const name = page.locator('table tbody [data-chat-app]').first();
  await expect(name, 'a name beside its mark').toBeVisible();
  await expect(name, 'a name beside its mark').toHaveText(/Telegram|Slack|Discord/);
});

test('every Bots rail row is the same two lines on one grid: its words from one x, its end at one x, its ⋯ at the same height, no phrase cut, and no lone dot', async ({ page }) => {
  test.setTimeout(90_000);
  for (const w of [280, 340] as const) {
    await page.goto('about:blank');
    await open(page, BOT, 'bots', w, undefined, 'chatsWaiting');
    const rows = page.locator(`${LIST} td[class*="listCell"]`);
    await rows.first().waitFor();
    const read = await rows.evaluateAll((cells) => cells.map((td) => {
      const box = td.getBoundingClientRect();
      const line = td.querySelector('[class*="listLine2"]')?.getBoundingClientRect();
      const dots = td.querySelector('[class*="listGrid"] > [class*="rowActionsWrap"] button')?.getBoundingClientRect();
      const fill = td.querySelector('[data-list-fill]');
      const word = td.querySelector('[class*="listLine2"] [data-row-actions]')?.getBoundingClientRect();
      const fr = fill?.getBoundingClientRect();
      const marks = [...td.querySelectorAll('[data-chat-app]')].map((m) => m.getBoundingClientRect());
      // Each phrase of the line is drawn whole or not at all: a text run on line 2 ends inside the box that holds it.
      const cut: string[] = [];
      if (fill && line) {
        const walk = document.createTreeWalker(fill, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!n.textContent?.trim() || n.parentElement?.closest('[class*="hxSrOnly"], [class*="srOnly" i]')) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          if (r.width === 0 || r.top >= line.bottom - 0.5) continue; // not drawn: on the hidden line
          const box = (n.parentElement?.closest('[class*="railWhole"]') ?? fill).getBoundingClientRect();
          if (r.right > box.right + 0.5 || r.left < box.left - 0.5) cut.push(n.textContent.trim());
        }
      }
      // A " · " is drawn only between two drawn things: the words after each dot on line 2 start right after it. A dot
      // whose words left the line (a fill field's sentence out of sight) or sit at the far end of it reads as a leftover.
      const lone: string[] = [];
      if (line) {
        const drawnStart = (el: Element): number => {
          let start = Infinity;
          const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (!n.textContent?.trim() || n.parentElement?.closest('[class*="hxSrOnly"], [class*="srOnly" i]')) continue;
            const range = document.createRange();
            range.selectNodeContents(n);
            const r = range.getBoundingClientRect();
            if (r.width > 0 && r.top < line.bottom - 0.5) start = Math.min(start, r.left);
          }
          // Marks, icons and the working dots are drawn things without words: any element with no element inside it.
          for (const m of el.querySelectorAll('*')) {
            if (m.childElementCount > 0 || m.closest('[class*="hxSrOnly"], [class*="srOnly" i]')) continue;
            const r = m.getBoundingClientRect();
            if (r.width > 0 && r.top < line.bottom - 0.5) start = Math.min(start, r.left);
          }
          return start;
        };
        const dotted = [...td.querySelectorAll('[class*="listMeta"] > [class*="listItem"]')];
        for (const el of dotted) {
          const before = getComputedStyle(el, '::before');
          if (before.content === 'none' || before.content === 'normal' || !before.content.includes('·')) continue;
          const r = el.getBoundingClientRect();
          if (r.left < line.left - 0.5 || r.top >= line.bottom - 0.5) continue; // the hanging dot of a line's first field, or a dot on the hidden line
          const dotEnd = r.left + parseFloat(before.width) + (parseFloat(before.marginInlineEnd) || 0);
          if (drawnStart(el) - dotEnd > 8) lone.push((el.textContent ?? '').trim().slice(0, 24) || '(nothing drawn)');
        }
      }
      // The line's phrases: the first drawn one never starts with a dot (a dot sits only between two drawn phrases).
      const drawn = line ? [...td.querySelectorAll<HTMLElement>('[data-list-fill] [class*="railPhrase"]')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.top < line.bottom - 0.5;
      }) : [];
      if (drawn[0]?.textContent?.trim().startsWith('·')) lone.push(drawn[0].textContent.trim().slice(0, 24));
      const status = td.querySelector('[class*="railStatusTrack"]')?.getBoundingClientRect();
      const end = word ?? td.querySelector('[class*="railEnd"]')?.getBoundingClientRect();
      return {
        cut,
        lone,
        fillX: drawn[0] ? Math.round(drawn[0].getBoundingClientRect().left) : null,
        statusX: status ? Math.round(status.left) : null,
        endX: end ? Math.round(end.right) : null,
        wordTall: !!(word && line && word.height > line.height + 0.5),
        apps: line ? marks.filter((m) => m.top < line.bottom - 0.5).length : -1,
        name: td.querySelector('[class*="listPrimary"]')?.textContent?.trim() ?? '',
        height: Math.round(box.height),
        dots: dots ? Math.round(dots.top + dots.height / 2 - box.top) : null,
        // Each mark drawn is whole, inside line 2 and inside its field (one that does not fit leaves the line whole, onto
        // the line that is not shown); the field never under the row's word.
        marksOut: line && fr ? marks.filter((m) => m.top < line.bottom - 0.5 && (m.top < line.top - 0.5 || m.bottom > line.bottom + 0.5 || m.right > fr.right + 0.5)).length : -1,
        overWord: !!(word && fr && fr.right > word.left + 0.5),
      };
    }));
    expect(read.length, `rows at ${w}`).toBeGreaterThan(5);
    expect(read.filter((r) => r.height !== 56).map((r) => `${r.name} ${r.height}`), `every row is 56 tall at ${w}`).toEqual([]);
    expect(new Set(read.map((r) => r.dots)).size, `one ⋯ height at ${w}`).toBe(1);
    expect(read.filter((r) => r.marksOut !== 0).map((r) => r.name), `marks on line 2 at ${w}`).toEqual([]);
    expect(read.filter((r) => r.overWord).map((r) => r.name), `nothing under the row's word at ${w}`).toEqual([]);
    expect(read.flatMap((r) => r.cut.map((c) => `${r.name}: ${c}`)), `no phrase cut at ${w}`).toEqual([]);
    expect(read.flatMap((r) => r.lone.map((c) => `${r.name}: ${c}`)), `no lone dot at ${w}`).toEqual([]);
    // One grid: the status, the words and the row's end each start or end at one x on every row that draws them.
    expect(new Set(read.map((r) => r.statusX)).size, `one status x at ${w}`).toBe(1);
    expect(new Set(read.flatMap((r) => (r.fillX === null ? [] : [r.fillX]))).size, `one words x at ${w}`).toBe(1);
    expect(new Set(read.flatMap((r) => (r.endX === null ? [] : [r.endX]))).size, `one end x at ${w}`).toBe(1);
    expect(read.filter((r) => r.wordTall).map((r) => r.name), `no word taller than its line at ${w}`).toEqual([]);
    // The Bot with Telegram privacy on and groups waiting keeps its marks beside its Let in: all three where they fit.
    expect(read.find((r) => r.name === 'Chief')?.apps ?? 0).toBeGreaterThanOrEqual(w === 340 ? 3 : 2);
  }
});

test('a rail row with nothing for its second line has none; a value or an action keeps it', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 340);
  const line = page.locator(`${LIST} td[class*="listCell"] [class*="listLine2"]`);
  await line.first().waitFor();
  await expect(line.first(), 'a value keeps the line').toBeVisible();
  const emptied = await line.first().evaluate((l) => {
    l.querySelectorAll('[class*="listValue"]').forEach((v) => v.replaceChildren());
    l.querySelectorAll('[data-row-actions]').forEach((v) => v.remove());
    const none = getComputedStyle(l).display;
    const act = document.createElement('span');
    act.setAttribute('data-row-actions', '');
    l.append(act);
    return { none, withAction: getComputedStyle(l).display };
  });
  expect(emptied.none, 'nothing on it: no line').toBe('none');
  expect(emptied.withAction, 'an action keeps it').not.toBe('none');
});

test('a Computers rail row is state, realm, flag and server: no size, no city, one line at 340', async ({ page }) => {
  test.setTimeout(90_000);
  const SEL = '/computers?sel=cedar.00c3';
  await open(page, SEL, 'computers', 340);
  const rows = page.locator(`${LIST} td[class*="listCell"]`);
  await rows.first().waitFor();
  const read = (r: Locator) => r.evaluateAll((cells) => cells.map((td) => {
    // A field counts only when its value itself is drawn: a box, not hidden by display, visibility or opacity.
    const seen = (v: Element) => v.getBoundingClientRect().width > 0 && v.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const items = [...td.querySelectorAll('[class*="listItem"]')].filter((e) => { const v = e.querySelector('[class*="listValue"]'); return !!v && !!v.textContent && seen(v); });
    return { name: td.textContent ?? '', shown: items.map((e) => e.querySelector('[class*="listValue"]')?.textContent ?? ''), text: td.querySelector('[class*="listLine2"]')?.textContent ?? '', tops: new Set(items.map((e) => Math.round(e.getBoundingClientRect().top))).size };
  }));
  const at340 = await read(rows);
  expect(at340.length, 'rows to read').toBeGreaterThan(3);
  expect(at340.filter((r) => /\d\s*(core|GB)|Singapore|Frankfurt|Ashburn/i.test(r.text)), 'no size, no city').toEqual([]);
  expect(at340.filter((r) => r.tops > 1), 'one meta line').toEqual([]);
  expect(at340.find((r) => r.name.startsWith('cedar'))?.shown, 'a known row shows its state, realm, flag and server').toEqual(['Stopped', 'Personal', '🇸🇬n12']);
  expect(at340.filter((r) => r.shown.length < 3), 'every row has them').toEqual([]);
  await page.goto('about:blank');
  await open(page, SEL, 'computers', 280);
  await rows.first().waitFor();
  const at280 = await read(rows);
  expect(at280.find((r) => r.name.startsWith('cedar'))?.shown, 'at 280 the known row still shows all four').toEqual(['Stopped', 'Personal', '🇸🇬n12']);
  expect(at280.filter((r) => r.shown.length < 3), 'at 280 every row has them').toEqual([]);
  expect(at280.filter((r) => r.tops > 2), 'at 280 it wraps once at most').toEqual([]);
});

test('a rail\'s search says plain Search, so its words are never cut, and the page\'s own words stay outside a rail', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/computers?sel=cedar.00c3', 'computers', 340);
  const field = page.locator(`${LIST} [data-hub-search] input`).first();
  await field.waitFor();
  expect(await field.getAttribute('placeholder')).toBe('Search');
  await page.goto('about:blank');
  await open(page, '/computers', 'computers', null, { width: 1920, height: 1000 });
  await expect(page.locator('[data-hub-search] input').first()).toHaveAttribute('placeholder', 'Search computers');
});

test('the Computers table keeps size and city', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/computers', 'computers', null, { width: 1920, height: 1000 });
  await page.getByText('List', { exact: true }).first().click(); // reason: the first control named List is the table's presentation switch
  const body = page.locator('table tbody');
  await body.locator('tr').first().waitFor();
  await expect(body.getByText(/Singapore/).first(), 'the city').toBeVisible(); // reason: several rows are in Singapore, any one shows the city column
  await expect(body.getByText(/\d+\s*cores?/i).first(), 'the size').toBeVisible(); // reason: every row has a size, any one shows the size column
});

for (const w of [280, 340, 560]) {
  test(`a notice's icon sits on the centre of its first text line at ${w}`, async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, BOT, 'bots', w, undefined, 'railPaused');
    const band = page.locator(`${LIST} [data-rail] [data-band-flush]`).first();
    await band.waitFor();
    const off = await band.evaluate((b) => {
      const icon = b.querySelector('svg')?.getBoundingClientRect();
      const text = b.querySelector('[class*="text"]');
      const node = text && [...text.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      if (!icon || !node) return null;
      const g = document.createRange();
      g.selectNodeContents(node);
      const line = g.getClientRects()[0];
      return line ? icon.top + icon.height / 2 - (line.top + line.height / 2) : null;
    });
    expect(off, 'measured').not.toBeNull();
    expect(Math.abs(off ?? 99), 'icon centre to first line centre').toBeLessThanOrEqual(1);
  });

  test(`the Bot detail's actions never cover its chips at list ${w}`, async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, BOT, 'bots', w);
    await page.getByRole('button', { name: /^Stop$/ }).first().waitFor(); // reason: waits for the detail to load: the running Bot's header Stop (named "Stop") proves it
    const hit = await page.locator('header[class*="detailHeader"]').first().evaluate((h) => {
      const acts = h.querySelector('[class*="detailActions"]')?.getBoundingClientRect();
      if (!acts) return ['no actions'];
      return [...h.querySelectorAll('[class*="detailMeta"] *')].filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.left < acts.right - 0.5 && r.right > acts.left + 0.5 && r.top < acts.bottom - 0.5 && r.bottom > acts.top + 0.5;
      }).map((e) => e.textContent ?? '');
    });
    expect(hit).toEqual([]);
  });
}

test('every chip stays inside the Bot detail\'s title column: the actions drop below instead', async ({ page }) => {
  test.setTimeout(120_000);
  // Beside the actions the title column is narrowest here; a little wider and the title floor stacks the header anyway.
  for (const w of [340, 350, 360, 370]) {
    await open(page, BOT, 'bots', w);
    await page.getByRole('button', { name: /^Stop$/ }).first().waitFor(); // reason: waits for the detail to load: the running Bot's header Stop (named "Stop") proves it
    const past = await page.locator('header[class*="detailHeader"]').first().evaluate((h) => {
      const titles = h.querySelector('[class*="detailTitles"]')?.getBoundingClientRect();
      return [...h.querySelectorAll('[class*="detailMeta"] > *')].filter((e) => titles && e.getBoundingClientRect().right > titles.right + 0.5).map((e) => e.textContent ?? '');
    });
    expect(past, `no chip past the title column at ${w}`).toEqual([]);
    await page.goto('about:blank');
  }
});

test('a rail\'s group header is 32 tall on a fine pointer', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 340);
  const head = page.locator(`${LIST} [class*="groupRow"]`).first();
  await head.waitFor();
  expect((await head.boundingBox())?.height).toBe(32);
});

test.describe('a coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('keeps a group header at least 44 tall', async ({ page }) => {
    test.setTimeout(90_000);
    await listChosen(page);
    await open(page, '/bots', 'bots', null, { width: 390, height: 844 });
    const head = page.locator(`${LIST} [class*="groupRow"]`).first();
    await head.waitFor();
    expect((await head.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect((await head.locator('button').first().boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  // A rail draws a row's inline word (line 2) and its ⋯ (the end column) in two grid cells --rail-gap
  // apart, and the ⋯ is xs there, its touch press reaching 10 px past its box. No page's rail has an inline word,
  // so the probe adds one to a real rail row the way rowActionCell draws it (a wrap with the kit's own class, then
  // span[data-row-actions] > button), and checks that no point of the word's box presses the ⋯.
  test('a rail row\'s inline word keeps clear of its ⋯\'s touch press', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, '/computers?sel=cedar.00c3', 'computers', 340);
    const cell = page.locator(`${LIST} td[class*="listCell"]`).filter({ has: page.locator('[data-row-menu] button') }).first(); // reason: any rail row with a ⋯ stands for all; the first is probed
    await cell.waitFor();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const r = await cell.evaluate((td) => {
      const end = td.querySelector('[data-row-menu]')!.parentElement!;
      const line2 = td.querySelector('[class*="listLine2"]')!;
      const wrap = document.createElement('div');
      wrap.className = end.className;
      wrap.setAttribute('data-row-size', end.getAttribute('data-row-size') ?? '');
      const span = document.createElement('span');
      span.setAttribute('data-row-actions', '');
      const word = document.createElement('button');
      word.textContent = 'Start';
      word.style.cssText = 'inline-size: 64px; block-size: 24px; padding: 0; border: 0';
      span.append(word);
      wrap.append(span);
      line2.append(wrap);
      const more = end.querySelector('button')!;
      more.scrollIntoView({ block: 'center' });
      const w = word.getBoundingClientRect();
      const m = more.getBoundingClientRect();
      const hits: string[] = [];
      for (const y of [w.top + 1, w.top + w.height / 2, w.bottom - 1])
        for (let px = w.left + 1; px <= w.right - 1; px += 0.25) {
          const e = document.elementFromPoint(px, y);
          if (e && (e === more || more.contains(e))) { hits.push(`+${(px - w.left).toFixed(2)},${(y - w.top).toFixed(0)}`); break; }
        }
      return { size: end.getAttribute('data-row-size'), wordRight: w.right, moreLeft: m.left, hits };
    });
    expect(r.size, 'a rail asks for xs').toBe('xs');
    expect(r.moreLeft - r.wordRight, 'the word sits at the end of its column, --rail-gap from the ⋯').toBeLessThanOrEqual(12);
    expect(r.hits, 'a point of the word that presses the ⋯').toEqual([]);
  });

  test('a Bots rail row\'s text word presses 44 by 44 on its line-high word, clear of its ⋯, and the row keeps its neighbours\' height', async ({ page }, info) => {
    test.setTimeout(90_000);
    await open(page, BOT, 'bots', 340, undefined, 'chatsWaiting');
    const cell = page.locator(`${LIST} td[class*="listCell"]`).filter({ has: page.locator('[class*="listLine2"] [data-row-actions] [data-text-button]') }).first(); // reason: the Let in row stands for every worded row
    await cell.waitFor();
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    const r = await cell.evaluate((td) => {
      const word = td.querySelector<HTMLElement>('[class*="listLine2"] [data-row-actions] [data-text-button]')!;
      const more = td.querySelector<HTMLElement>('[data-row-menu] button')!;
      word.scrollIntoView({ block: 'center' });
      const w = word.getBoundingClientRect();
      const line = td.querySelector('[class*="listLine2"]')!.getBoundingClientRect();
      const cx = w.right - 22;
      const cy = w.top + w.height / 2;
      const presses = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return !!e && (e === word || word.contains(e)); };
      const hitsMore = (x: number, y: number) => { const e = document.elementFromPoint(x, y); return !!e && (e === more || more.contains(e)); };
      const ring: string[] = [];
      // 44 by 44: 21 px up and down from its middle, and from its end back 43 px (its press never reaches past its end,
      // where the ⋯'s press begins).
      for (const [x, y, at] of [[cx, cy - 21, 'up'], [cx, cy + 21, 'down'], [w.right - 43, cy, 'start'], [w.right - 1, cy, 'end']] as const) if (!presses(x, y)) ring.push(at);
      const overMore: string[] = [];
      for (let x = w.right - 43; x < w.right; x += 1) for (const y of [cy - 21, cy, cy + 21]) if (hitsMore(x, y)) overMore.push(`${Math.round(x - w.right)},${Math.round(y - cy)}`);
      // A two-line row with no word stands for the rail's row height on this pointer.
      const plain = [...(td.closest('table') as HTMLElement).querySelectorAll('td[class*="listCell"]')].find((c) => c.querySelector('[class*="listLine2"]') && !c.querySelector('[class*="listLine2"] [data-row-actions] :is(button, [data-text-button])'));
      return { wordH: w.height, lineH: line.height, ring, overMore, rowH: td.getBoundingClientRect().height, plainH: plain?.getBoundingClientRect().height ?? -1 };
    });
    await page.screenshot({ path: info.outputPath('bots-rail-coarse.png') });
    expect(r.wordH, 'the word is drawn no taller than its line').toBeLessThanOrEqual(r.lineH + 0.5);
    expect(r.ring, 'edges of the word\'s 44 by 44 press that miss it').toEqual([]);
    expect(r.overMore, 'points of the word\'s press that press the ⋯').toEqual([]);
    expect(r.plainH, 'a row with no word to compare with').toBeGreaterThan(0);
    expect(r.rowH, 'the row keeps the height of a row with no word').toBe(r.plainH);
  });
});

// A phone's coarse pointer: its 44 px controls are what the row must fit.
test.describe('on a touch phone', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('a rail toolbar goes to an icon rather than cutting the Filters label', async ({ page }) => {
    test.setTimeout(90_000);
    await listChosen(page);
    await open(page, '/bots', 'bots', null, { width: 390, height: 844 });
    // The rows first: the Filters button comes with the loaded list, and a toolbar read earlier has none to cut.
    await page.locator(`${LIST} td[class*="listCell"]`).first().waitFor();
    await expect(page.locator(`${LIST} button[aria-label="Filters"], ${LIST} button:has-text("Filters")`).first(), 'the Filters button is there').toBeVisible();
    const cut = await page.locator(LIST).first().evaluate((rail) => {
      const end = rail.querySelector('[data-hub-search]')?.getBoundingClientRect().bottom ?? 0;
      const buttons = [...rail.querySelectorAll('button')].filter((x) => x.getBoundingClientRect().top < end);
      if (buttons.length === 0) return ['no toolbar button found'];
      // Drawn narrower than its own content wants: read the label's ellipsis as width, whatever the button holds.
      return buttons.filter((x) => {
        const drawn = x.getBoundingClientRect().width;
        x.style.flex = 'none';
        const whole = x.getBoundingClientRect().width;
        x.style.flex = '';
        return whole > drawn + 0.5;
      }).map((x) => x.textContent ?? x.getAttribute('aria-label') ?? '');
    });
    expect(cut).toEqual([]);
  });
});

test('a rail row with no chat app draws no dash, and the wide table keeps it', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, BOT, 'bots', 340);
  const rows = page.locator(`${LIST} td[class*="listCell"]`);
  await rows.first().waitFor();
  expect(await rows.count(), 'rows to read').toBeGreaterThan(1);
  const dashes = await page.locator(LIST).first().evaluate((rail) => [...rail.querySelectorAll('[class*="listItem"]')].filter((e) => e.textContent?.trim() === '\u2014' && (e as HTMLElement).offsetParent !== null).length);
  expect(dashes, 'no lone dash in a rail row').toBe(0);
  await page.goto('about:blank');
  await open(page, '/bots', 'bots', null, { width: 1920, height: 1000 });
  await page.getByRole('radio', { name: 'List' }).click(); // the dense table is List's (the page opens on cards)
  await page.locator('table tbody tr').first().waitFor();
  expect(await page.locator('table tbody td').filter({ hasText: /^\u2014$/ }).count(), 'the table keeps its dash').toBeGreaterThan(0);
});

test('no second frame inside a rail', async ({ page }) => {
  test.setTimeout(120_000);
  for (const c of [{ path: '/ai', key: 'ai', rail: AI }, { path: BOT, key: 'bots', rail: LIST }]) {
    await open(page, c.path, c.key, 340);
    await page.locator(`${c.rail} td[class*="listCell"]`).first().waitFor();
    const framed = await page.locator(c.rail).first().evaluate((rail, isList) => {
      const w = rail.getBoundingClientRect().width;
      const boxed = (e: Element) => { const k = getComputedStyle(e); return ['Top', 'Right', 'Bottom', 'Left'].every((d) => parseFloat(k.getPropertyValue(`border-${d.toLowerCase()}-width`)) > 0); };
      const all = [...rail.querySelectorAll('*')].filter((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > w * 0.9 && boxed(e) && !e.matches('a, button, input, [class*="newChat" i], [role="radiogroup"], [role="list"]'));
      // A list page's own frame is the one allowed: the first framed element in it.
      return (isList ? all.slice(1) : all).map((e) => e.className.toString().slice(0, 70));
    }, c.rail === LIST);
    expect(framed, c.path).toEqual([]);
  }
});

test('with no questions beside a detail, a list holds at least 5 rows at 900 high', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/computers?sel=cedar.00c3', 'computers', null);
  const rows = page.locator(`${LIST} td[class*="listCell"]`);
  await rows.first().waitFor();
  const bottom = await page.locator(LIST).first().evaluate((e) => e.getBoundingClientRect().bottom);
  const seen = await rows.evaluateAll((all, b) => all.filter((r) => r.getBoundingClientRect().bottom <= (b as number)).length, bottom);
  expect(seen).toBeGreaterThanOrEqual(5);
});

test('the handle answers Home, End, Enter and a double click, and reports what is drawn', async ({ page }) => {
  test.setTimeout(120_000);
  await open(page, '/ai', 'ai', 400);
  const rail = page.locator(AI);
  await page.locator(`${AI} td[class*="listCell"]`).first().waitFor();
  const handle = page.getByRole('separator', { name: /^Resize (list|the chat list)$/ });
  const width = async () => (await rail.boundingBox())?.width;
  await handle.focus();
  await page.keyboard.press('Home');
  await expect.poll(width).toBe(280);
  await page.keyboard.press('End');
  await expect.poll(width).toBe(560);
  await expect(handle).toHaveAttribute('aria-valuenow', '560');
  await page.keyboard.press('Enter');
  await expect.poll(width).toBe(340);
  await page.keyboard.press('End');
  await expect.poll(width).toBe(560);
  await handle.dblclick();
  await expect.poll(width).toBe(340);
});

test('the main region never falls under its least width, however wide the rail was left', async ({ page }) => {
  test.setTimeout(90_000);
  await open(page, '/ai', 'ai', 560, { width: 1000, height: 800 });
  const rail = page.locator(AI);
  await page.locator(`${AI} td[class*="listCell"]`).first().waitFor();
  const r = await rail.boundingBox();
  const main = await page.locator('#hub-main').boundingBox();
  expect((main?.width ?? 0) - (r?.width ?? 0)).toBeGreaterThanOrEqual(610);
  await expect(page.getByRole('separator', { name: /^Resize (list|the chat list)$/ })).toHaveAttribute('aria-valuenow', String(r?.width));
});
