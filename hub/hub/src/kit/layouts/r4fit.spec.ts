// Playwright on the real layout:
// - Connect's program links (AddressList/AddressRow) show every address whole on phones, and no row overflows; at each
//   list-width switch the rows keep that, with 44px row actions on a touch screen. A program address grants access, so
//   it is drawn masked (kit/data/Address.tsx, `https://••••`): the check is that the masked form is shown and never cut
//   by the row's ellipsis, not a width the masked text cannot reach;
// - the Projects note outside the realm has breathing room above the table (TablePage notice slot);
// - Notifications' "Mark all read" outcome wraps inside the header instead of running past it;
// - AI Spending's credit note has its own line under the period and Add AI credit, never between them;
// - gallery grids never ask for more width than a phone has.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';

/** A program address as a row shows it: the masked form, whole (no ellipsis). */
const WHOLE = { masked: true, cut: false };

for (const width of [360, 390]) {
  test(`Connect: every address keeps a usable width at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect');
    const list = page.locator('section#connect-links ul');
    await list.locator('li').first().waitFor();
    const rows = await list.evaluate((ul) =>
      [...ul.querySelectorAll<HTMLElement>(':scope > li')].map((li) => {
        // Cut: the address is not drawn (an empty box), its own ellipsis box (the nearest one hiding its overflow,
        // kit/data/Address.module.css .text) holds more than it shows, or a box between it and the nearest scroller
        // that clips an axis (hidden or clip) does not hold it on that axis. A scroller and the boxes past it only clip
        // what is scrolled away, so they are not asked.
        const cutBy = (el: HTMLElement): boolean => {
          const a = el.getBoundingClientRect();
          if (a.width < 1 || a.height < 1) return true;
          let ellipsis = false;
          for (let box = el.parentElement; box; box = box.parentElement) {
            const cs = getComputedStyle(box);
            const x = /hidden|clip/.test(cs.overflowX);
            const y = /hidden|clip/.test(cs.overflowY);
            if (!x && !y) {
              if (/auto|scroll/.test(`${cs.overflowX} ${cs.overflowY}`)) break;
              continue;
            }
            if (!ellipsis) {
              ellipsis = true;
              if (box.scrollWidth > box.clientWidth) return true;
            }
            // Overflow clips at the padding edge: the box less its borders (and scrollbar).
            const o = box.getBoundingClientRect();
            const left = o.left + box.clientLeft;
            const top = o.top + box.clientTop;
            if (x && (a.left < left - 0.5 || a.right > left + box.clientWidth + 0.5)) return true;
            if (y && (a.top < top - 0.5 || a.bottom > top + box.clientHeight + 0.5)) return true;
            if (/auto|scroll/.test(`${cs.overflowX} ${cs.overflowY}`)) break;
          }
          return false;
        };
        const addr = li.querySelector<HTMLElement>('[dir="ltr"]');
        const r = li.getBoundingClientRect();
        const buttons = [...li.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])')].map((b) => b.getBoundingClientRect());
        return {
          addr: addr ? { masked: /^https?:\/\/•+$/.test(addr.textContent ?? ''), cut: cutBy(addr) } : null,
          overflow: li.scrollWidth - li.clientWidth,
          outside: buttons.filter((b) => b.right > r.right + 1 || b.left < r.left - 1).length,
        };
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.addr, JSON.stringify(rows)).toEqual(WHOLE);
      expect(row.overflow, JSON.stringify(rows)).toBeLessThanOrEqual(1);
      expect(row.outside, JSON.stringify(rows)).toBe(0);
    }
    await noSideScroll(page);
  });
}

// The address list lays its rows out by its own width (container queries, kit/data/Address.module.css): one column below
// 380, name and actions over the address below 640, all three side by side from 640. On a touch screen each row action is a
// 44px target, so the rows are checked at the list widths just below and at each switch, with both pointers.
const LINKS = 'section#connect-links ul';

/** Steps the viewport until the address list's content box is exactly `target` px wide (the side layout is not linear). */
async function listAt(page: Page, target: number): Promise<void> {
  let vw = target + 32;
  for (let i = 0; i < 8; i++) {
    await page.setViewportSize({ width: vw, height: 900 });
    const w = await page.locator(LINKS).evaluate((ul) => ul.clientWidth);
    if (w === target) return;
    vw += target - w;
  }
  throw new Error(`the address list never measured ${target}px`);
}

const SWITCHES: Array<[number, number]> = [[379, 1], [380, 2], [639, 2], [640, 3]]; // [list width, grid columns]
for (const coarse of [true, false]) {
  test.describe(coarse ? 'Connect rows on a touch screen' : 'Connect rows with a mouse', () => {
    test.use(coarse ? { hasTouch: true, isMobile: true } : {});
    for (const [width, columns] of SWITCHES) {
      test(`Connect: at a ${width}px list every address keeps a usable width and the row actions fit (${columns} column${columns > 1 ? 's' : ''})`, async ({ page }) => {
        await page.setViewportSize({ width: width + 32, height: 900 });
        await gotoHub(page, '/computers?sel=atlas.00a1&tab=connect');
        await page.locator(`${LINKS} li`).first().waitFor();
        await listAt(page, width);
        expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse);
        const rows = await page.locator(LINKS).evaluate((ul) =>
          [...ul.querySelectorAll<HTMLElement>(':scope > li')].map((li) => {
            // Cut: the address is not drawn (an empty box), its own ellipsis box (the nearest one hiding its overflow,
            // kit/data/Address.module.css .text) holds more than it shows, or a box between it and the nearest scroller
            // that clips an axis (hidden or clip) does not hold it on that axis. A scroller and the boxes past it only clip
            // what is scrolled away, so they are not asked.
            const cutBy = (el: HTMLElement): boolean => {
              const a = el.getBoundingClientRect();
              if (a.width < 1 || a.height < 1) return true;
              let ellipsis = false;
              for (let box = el.parentElement; box; box = box.parentElement) {
                const cs = getComputedStyle(box);
                const x = /hidden|clip/.test(cs.overflowX);
                const y = /hidden|clip/.test(cs.overflowY);
                if (!x && !y) {
                  if (/auto|scroll/.test(`${cs.overflowX} ${cs.overflowY}`)) break;
                  continue;
                }
                if (!ellipsis) {
                  ellipsis = true;
                  if (box.scrollWidth > box.clientWidth) return true;
                }
                // Overflow clips at the padding edge: the box less its borders (and scrollbar).
                const o = box.getBoundingClientRect();
                const left = o.left + box.clientLeft;
                const top = o.top + box.clientTop;
                if (x && (a.left < left - 0.5 || a.right > left + box.clientWidth + 0.5)) return true;
                if (y && (a.top < top - 0.5 || a.bottom > top + box.clientHeight + 0.5)) return true;
                if (/auto|scroll/.test(`${cs.overflowX} ${cs.overflowY}`)) break;
              }
              return false;
            };
            const r = li.getBoundingClientRect();
            const addr = li.querySelector<HTMLElement>('[dir="ltr"]');
            const bs = [...li.querySelectorAll<HTMLElement>('button:not([tabindex="-1"])')].map((b) => b.getBoundingClientRect());
            const overlaps = bs.filter((b, i) => bs.some((c, j) => j > i && b.left < c.right - 0.5 && c.left < b.right - 0.5 && b.top < c.bottom - 0.5 && c.top < b.bottom - 0.5)).length;
            return {
              columns: getComputedStyle(li).gridTemplateColumns.split(' ').length,
              addr: addr ? { masked: /^https?:\/\/•+$/.test(addr.textContent ?? ''), cut: cutBy(addr) } : null,
              overflow: li.scrollWidth - li.clientWidth,
              outside: bs.filter((b) => b.right > r.right + 1 || b.left < r.left - 1 || b.bottom > r.bottom + 1 || b.top < r.top - 1).length,
              // The row's actions: its buttons but the address itself (a secret address is a button that opens it).
              buttons: bs.length - (addr?.closest('button') ? 1 : 0),
              small: bs.filter((b) => b.width < 44 - 0.5 || b.height < 44 - 0.5).length,
              overlaps,
            };
          }),
        );
        const why = JSON.stringify(rows);
        expect(rows.length, why).toBeGreaterThan(0);
        // The programs with a page (computers/links.ts KIT_PROGRAMS, less Workspaces: parts/Connect.tsx OPEN): Agent, Terminal, Desktop, Files (Mount adds a fifth
        // action), Browser, Code, Notes, SQLite, Pipe, Cron and Notifications, each with Copy, QR code and Open,
        // plus Put on Board for the ones the Board has a tile for (not Pipe, Cron, Notifications); the address
        // button, in the size, overlap and outside checks too, is not counted here.
        expect(rows.map((row) => row.buttons), why).toEqual([4, 4, 4, 5, 4, 4, 4, 4, 3, 3, 3]);
        for (const row of rows) {
          expect(row.columns, why).toBe(columns);
          expect(row.addr, why).toEqual(WHOLE);
          expect(row.overflow, why).toBeLessThanOrEqual(1);
          expect(row.outside, why).toBe(0);
          expect(row.overlaps, why).toBe(0);
          if (coarse) expect(row.small, why).toBe(0);
        }
        await noSideScroll(page);
      });
    }
  });
}

test('Projects: the outside-realm note has room above the table', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoHub(page, '/computers/projects', { state: 'projectOutside' });
  await page.locator('table').first().waitFor();
  const gap = await page.evaluate(() => {
    const table = document.querySelector('table');
    const p = [...document.querySelectorAll('p')].find((x) => /realm/i.test(x.textContent ?? '') && x.compareDocumentPosition(table as Node) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (!p || !table) return null;
    // The table's framed box (its panel), or the table itself.
    const box = (table.closest('section, [class*="wrap"]') as HTMLElement | null) ?? table;
    return Math.round(box.getBoundingClientRect().top - p.getBoundingClientRect().bottom);
  });
  expect(gap).not.toBeNull();
  expect(gap as number).toBeGreaterThanOrEqual(8);
});

test('Notifications: a failed Mark all read wraps inside the header at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await gotoHub(page, '/notifications', { state: 'ack-failed' });
  await page.getByRole('button', { name: 'Mark all read' }).click();
  const line = page.locator('header [data-outcome="failed"]').first();
  await line.waitFor();
  const m = await line.evaluate((el) => {
    const header = el.closest('header') as HTMLElement;
    const h = header.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { right: Math.round(r.right), headRight: Math.round(h.right), over: header.scrollWidth - header.clientWidth, lines: Math.round(r.height) };
  });
  expect(m.right, JSON.stringify(m)).toBeLessThanOrEqual(m.headRight + 1);
  expect(m.over, JSON.stringify(m)).toBeLessThanOrEqual(1);
  await noSideScroll(page);
});

for (const width of [390, 1440]) {
  test(`Notifications: an unknown Mark all read stays visible and whole in the header at ${width} (C9 unchanged)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await gotoHub(page, '/notifications', { state: 'ack-lost' });
    await page.getByRole('button', { name: 'Mark all read' }).click();
    const line = page.locator('header [data-outcome="pending"]').first();
    await expect(line).toBeVisible();
    await expect(line).toContainText('May have gone through');
    await expect(line).toContainText('Marking all notices read may have gone through.');
    // Nothing can be sent twice: the button is gone while the outcome is unknown; Check again reads back instead.
    await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0);
    await expect(line.getByRole('button', { name: /Check again/ })).toBeVisible();
    const m = await line.evaluate((el) => {
      const header = el.closest('header') as HTMLElement;
      const h = header.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const check = [...el.querySelectorAll('button')].map((b) => b.getBoundingClientRect().right);
      return { right: Math.round(Math.max(r.right, ...check)), headRight: Math.round(h.right), left: Math.round(r.left), headLeft: Math.round(h.left) };
    });
    expect(m.right, JSON.stringify(m)).toBeLessThanOrEqual(m.headRight + 1);
    expect(m.left, JSON.stringify(m)).toBeGreaterThanOrEqual(m.headLeft - 1);
    await noSideScroll(page);
  });
}

// Add AI credit left Spending (AI credit is not on sale yet: pages/ai/parts/Spending.tsx, Allowance.test.tsx), so the
// controls line holds the period alone; the credit note keeps its own line under it and the period its whole labels.
for (const width of [360, 390, 1440]) {
  test(`AI Spending: the credit note has its own line under the controls, and the period keeps whole labels at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await gotoHub(page, '/ai/models?section=spending');
    await page.locator('#hub-main [role="radiogroup"][aria-label="Period"], #hub-main button[aria-label*="Period"]').first().waitFor(); // CSS: either presentation
    await page.waitForFunction(() => /\$|unknown|Loading/i.test(document.getElementById('hub-main')?.textContent ?? ''));
    const m = await page.evaluate(() => {
      const main = document.getElementById('hub-main')!;
      const per = main.querySelector('[role="radiogroup"][aria-label="Period"]') ?? [...main.querySelectorAll('button')].find((b) => /Period/.test(b.getAttribute('aria-label') ?? ''));
      const bar = per?.closest('[role="group"]'); // the kit Toolbar is a group
      const note = bar?.parentElement?.querySelector(':scope > :not([role="group"])');
      // A label is cut when any part of the control is narrower than its own content.
      const cut = per ? [per, ...per.querySelectorAll('*')].filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1).map((e) => e.textContent) : ['no period'];
      const b = (e?: Element | null) => e?.getBoundingClientRect();
      return { bar: Boolean(bar), per: b(per)?.bottom ?? 0, perRight: b(per)?.right ?? 0, barRight: b(bar)?.right ?? 0, noteTop: b(note)?.top ?? -1, note: note?.textContent ?? '', cut };
    });
    expect(m.bar, JSON.stringify(m)).toBe(true);
    expect(m.cut, JSON.stringify(m)).toEqual([]);
    expect(m.perRight, JSON.stringify(m)).toBeLessThanOrEqual(m.barRight + 1);
    expect(m.note, JSON.stringify(m)).toMatch(/credit|left|unknown|Loading/i);
    expect(m.noteTop, JSON.stringify(m)).toBeGreaterThanOrEqual(m.per - 1);
  });
}

// Every gallery tab, read from the gallery's own tab list, so a new tab is checked without editing this file.
const SRC = [path.resolve('hub/src'), path.resolve('src')].find((d) => fs.existsSync(path.join(d, 'kit/gallery/view.tsx'))) ?? path.resolve('hub/src');
const GALLERY_SRC = fs.readFileSync(path.join(SRC, 'kit/gallery/view.tsx'), 'utf8');
// Only the DetailPage tab list (its tabs={[ ... ]} block); other { id, label } lists in the file are not tabs. Any
// property order or quote style. The guard below compares this list with the tabs the gallery draws.
const TAB_BLOCK = GALLERY_SRC.slice(GALLERY_SRC.indexOf('tabs={['), GALLERY_SRC.indexOf(']}', GALLERY_SRC.indexOf('tabs={[')));
const GALLERY_TABS = [...TAB_BLOCK.matchAll(/\bid:\s*['"]([a-z0-9-]+)['"]/g)].flatMap((m) => (m[1] ? [m[1]] : []));

test('the gallery grid check reads every gallery tab', async ({ page }) => {
  // A parse that breaks, or misses one tab, goes red instead of checking fewer tabs: the list read from the source must
  // be the tabs the gallery draws, in order (each tab's data-key is its id).
  expect(GALLERY_TABS.length).toBeGreaterThanOrEqual(15);
  await gotoHub(page, '/_kit');
  await page.locator('#hub-main [role="tab"]').first().waitFor();
  const drawn = await page.locator('#hub-main [role="tab"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-key')));
  expect(drawn).toEqual(GALLERY_TABS);
});

/** Waits until the asked tab is the open one and its panel has drawn its content (dataview's rows come after a delay). */
async function galleryTabReady(page: Page, tab: string): Promise<void> {
  await expect(page.locator(`#hub-main [role="tab"][data-key="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
  const panel = page.locator(`#hub-main [role="tabpanel"][aria-labelledby$="-tab-${tab}"]`);
  await expect(panel).toBeVisible();
  await expect.poll(() => panel.evaluate((el) => el.childElementCount)).toBeGreaterThan(0);
  if (tab === 'dataview') await panel.locator('tbody tr').first().waitFor();
}

for (const width of [360, 390]) {
  for (const tab of GALLERY_TABS) {
    test(`gallery grid tracks fit a phone: ${tab} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, `/_kit?tab=${tab}`);
      await galleryTabReady(page, tab);
      // Each grid's columns (and the gaps between them) fit inside the grid. What a cell holds is its own matter.
      const over = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('#hub-main *')]
          .filter((el) => getComputedStyle(el).display === 'grid')
          .map((el) => {
            const cs = getComputedStyle(el);
            const cols = cs.gridTemplateColumns.split(' ').map(parseFloat).filter((n) => !Number.isNaN(n));
            const gap = parseFloat(cs.columnGap) || 0;
            const need = cols.reduce((a, b) => a + b, 0) + gap * Math.max(0, cols.length - 1);
            const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            return { el: el.className, need: Math.round(need), room: Math.round(room) };
          })
          // Layout grids only: an icon button drawn as a 1-cell grid (Copy, 8 px of room) is not a page grid.
          .filter((g) => g.room >= 120 && g.need > g.room + 1),
      );
      expect(over).toEqual([]);
    });
  }
}
