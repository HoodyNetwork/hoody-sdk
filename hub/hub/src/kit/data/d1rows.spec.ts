// Playwright, measured as drawn in both themes: a table data row is 44 px (a
// coarse pointer keeps 48, compact density keeps 32), a group header row 40 px, and the Row actions (three-dot) button
// of a table row the kit's small grey plate: 28 px square, the plate fill in the plate's frame, a darker
// plate in a full-ink frame on hover. A plate is painted from custom properties, so its colours are read as the
// element resolves them and compared with the tokens; light also checks the spec's literal values. Boxes and
// computed styles need a real browser, not jsdom.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/table.strings.en.json';
import kitStrings from '../strings.en.json';
import galleryStrings from '../gallery/strings.en.json';
import menuStrings from '../overlays/strings.en.json';

/** The design's light plate, as the tokens write it. */
const LIGHT = { line: '#7a7a7a', bg: '#e3e3e3', hover: '#d6d6d6' };

const fullTable = (page: Page) => page.locator('[data-gallery="full-table"]');
const firstRow = (page: Page) => fullTable(page).locator('tbody tr').filter({ has: page.getByRole('button', { name: kitStrings['table.rowActions'] }) }).first(); // every data row has one; the top one is measured
const rowMore = (page: Page) => fullTable(page).getByRole('button', { name: kitStrings['table.rowActions'] }).first(); // one Row actions button per row, all the same component

async function height(l: Locator) {
  await l.waitFor({ timeout: 15_000 });
  return l.evaluate((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
}

async function look(b: Locator) {
  return b.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return {
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      line: c.borderTopColor,
      lineW: c.borderTopWidth,
      lineStyle: c.borderTopStyle,
      bg: c.backgroundColor,
      plate: c.getPropertyValue('--plate').trim(),
      plateLine: c.getPropertyValue('--plate-line').trim(),
    };
  });
}

/** A root token as written for the current theme (a plate's fill and frame are compared as text). */
const rootToken = (page: Page, name: string) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/** The full table switched to Compact through its View options, as a person does (the table, not a token, picks
 *  its row actions' size, so an attribute set by hand would not reach them). */
async function toCompact(page: Page) {
  await fullTable(page).getByRole('button', { name: kitStrings['table.view'] }).click();
  await page.getByRole('menuitemradio', { name: kitStrings['table.densityCompact'] }).or(page.getByRole('menuitem', { name: kitStrings['table.densityCompact'] })).click();
  await expect(fullTable(page).locator('[data-density="compact"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
}

/** The full table's data rows in compact density: each row's height, its row actions' boxes, the run of a press down
 *  each control's middle that lands on it (its ::after included), and whether any control or press area reaches outside
 *  the row's box (a row taller than its line, or a control over the next row). */
async function compactRows(page: Page) {
  await toCompact(page);
  return fullTable(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('button', { name: kitStrings['table.rowActions'] }) })
    .evaluateAll((trs) =>
      trs.map((tr) => {
        const r = tr.getBoundingClientRect();
        const size = (b: Element) => { const x = b.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)]; };
        const all = [...tr.querySelectorAll('[data-row-actions] button')];
        // Presses are read only in a row the table shows whole (its scroll box clips the last one it holds).
        const lands = (y: number) => { const e = document.elementFromPoint(r.left + 2, y); return !!e && tr.contains(e); };
        const shown = lands(r.top + 1.5) && lands(r.bottom - 1.5);
        /** [top, bottom] of the points down a control's middle where a press lands on it. */
        const press = (b: Element) => {
          const x = b.getBoundingClientRect();
          const cx = x.left + x.width / 2;
          const cy = x.top + x.height / 2;
          const on = (y: number) => { const e = document.elementFromPoint(cx, y); return !!e && (e === b || b.contains(e)); };
          // Quarter-pixel steps, so the run is the press area to within 0.25 px at each edge.
          let up = 0;
          while (up < 160 && on(cy - (up + 1) / 4)) up++;
          let down = 0;
          while (down < 160 && on(cy + (down + 1) / 4)) down++;
          return [cy - up / 4, cy + down / 4] as [number, number];
        };
        // The actions cell's share of the row's 1 px line: its own border, or (compact) an inset shadow.
        const cell = tr.querySelector('td:last-child');
        const cs = cell ? getComputedStyle(cell) : null;
        const line = !!cs && (cs.borderBottomWidth === '1px' || (/inset/.test(cs.boxShadow) && /0px -1px 0px/.test(cs.boxShadow)));
        return {
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          h: Math.round(r.height),
          hover: [...tr.querySelectorAll('div[data-row-actions]:not([data-row-menu]) button')].map(size),
          inline: [...tr.querySelectorAll('span[data-row-actions]:not([data-row-open]) button')].map(size),
          more: [...tr.querySelectorAll('[data-row-menu] button')].map(size),
          presses: (shown ? all : []).filter((b) => { const x = b.getBoundingClientRect(); return x.height > 0 && x.top >= 60 && x.bottom <= innerHeight - 20 && b.checkVisibility(); }).map((b) => [...press(b), r.top, r.bottom, b.getAttribute('aria-label') ?? b.textContent ?? '', b.getBoundingClientRect().height] as const),
          // The ⋯'s own press area as its stylesheet lays it out: the ::after's box, whatever is drawn over it.
          moreReach: [...tr.querySelectorAll('[data-row-menu] button')].map((b) => { const a = getComputedStyle(b, '::after'); return [a.position, a.width, a.height].join(' '); }),
          pressOutside: shown && all.some((b) => { const x = b.getBoundingClientRect(); if (!(x.height > 0 && x.top >= 60 && x.bottom <= innerHeight - 20 && b.checkVisibility())) return false; const [t0, b0] = press(b); return t0 < r.top - 1 || b0 > r.bottom + 1; }),
          // Along each control's middle line, every point of the box it draws is its own press (a
          // neighbour's touch press must not cover it; 1 px off each edge, as Chromium hit-tests whole pixels), and
          // the width its press reaches.
          stolen: (shown ? all : []).filter((b) => { const x = b.getBoundingClientRect(); return x.height > 0 && x.top >= 60 && x.bottom <= innerHeight - 20 && b.checkVisibility(); }).flatMap((b) => {
            const x = b.getBoundingClientRect();
            const cy = x.top + x.height / 2;
            const name = (o: Element) => o.getAttribute('aria-label') ?? o.textContent ?? '';
            for (let px = x.left + 1; px <= x.right - 1; px += 0.25) {
              const e = document.elementFromPoint(px, cy);
              const owner = e ? all.find((o) => o === e || o.contains(e)) : undefined;
              if (owner && owner !== b) return [`${name(b)} at +${(px - x.left).toFixed(2)} presses ${name(owner)}`];
            }
            return [];
          }),
          pressW: (shown ? all : []).filter((b) => { const x = b.getBoundingClientRect(); return x.height > 0 && x.top >= 60 && x.bottom <= innerHeight - 20 && b.checkVisibility(); }).map((b) => {
            const x = b.getBoundingClientRect();
            const cx = x.left + x.width / 2;
            const cy = x.top + x.height / 2;
            const on = (px: number) => { const e = document.elementFromPoint(px, cy); return !!e && (e === b || b.contains(e)); };
            let l = 0;
            while (l < 160 && on(cx - (l + 1) / 4)) l++;
            let rr = 0;
            while (rr < 160 && on(cx + (rr + 1) / 4)) rr++;
            return [(l + rr) / 4, Math.round(x.width), Math.round(x.height), b.getAttribute('aria-label') ?? b.textContent ?? ''] as const;
          }),
          line,
          outside: all.some((b) => { const x = b.getBoundingClientRect(); return x.height > 0 && (Math.round(x.top) < Math.round(r.top) || Math.round(x.bottom) > Math.round(r.bottom)); }),
        };
      }),
    );
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`table rows on a fine pointer at 1440 (${theme})`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test(`a table data row is 44 px and a group header row 40 px (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=table', { theme });
      await expect(page.locator('html')).toHaveAttribute('data-hx-theme', theme);
      expect(await height(firstRow(page))).toBe(44);
      const group = page.getByRole('row').filter({ hasText: gallery['group.apps'] }).first(); // the gallery shows the Apps group header in two tables of one section
      expect(await height(group)).toBe(40);
    });

    test(`compact density keeps its 32 px row and the small three-dot button (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=table', { theme });
      // Every row is exactly 32 with its own small controls in it at their own size. A compact table asks for xs, so
      // the hover icons (laid out always, shown on hover) are 24 x 24 and the inline Start / Resume / Restart 24 tall;
      // the ⋯ is the small plate at any size asked for, 28 x 28. Each sits inside its row's box, and on a mouse the
      // press is the box drawn. The actions cell draws its share of the row's line as an inset shadow, which takes no
      // layout.
      const rows = await compactRows(page);
      expect(await height(firstRow(page))).toBe(32);
      const m = await look(rowMore(page));
      expect([m.w, m.h]).toEqual([28, 28]);
      expect(rows.flatMap((r) => r.hover).length, 'some row has hover icons').toBeGreaterThan(0);
      expect(rows.flatMap((r) => r.inline).length, 'some row has an inline action').toBeGreaterThan(0);
      expect(rows.filter((r) => r.h !== 32), 'a compact row that is not 32').toEqual([]);
      expect(rows.flatMap((r) => r.more).filter(([w, h]) => w !== 28 || h !== 28), 'a ⋯ that is not 28 x 28').toEqual([]);
      expect(rows.flatMap((r) => r.hover).filter(([w, h]) => w !== 24 || h !== 24), 'a hover icon that is not 24 x 24').toEqual([]);
      expect(rows.flatMap((r) => r.inline).filter(([, h]) => h !== 24), 'an inline action that is not 24 tall').toEqual([]);
      expect(rows.flatMap((r) => r.presses).length, 'presses measured').toBeGreaterThan(0);
      expect(rows.flatMap((r) => r.presses).filter(([a, b, , , , drawn]) => b - a > drawn + 1), 'a mouse press area taller than the box drawn').toEqual([]);
      // The ⋯'s press is its 28 px box, no more and no less: on a mouse its press area reaches 0 out, so it is the
      // box inside its 1 px frame (26), and the frame is the button's own.
      const dots = rows.flatMap((r) => r.presses).filter(([, , , , name]) => name === kitStrings['table.rowActions']);
      expect(dots.length, '⋯ presses measured').toBeGreaterThan(0);
      expect(dots.filter(([a, b]) => Math.abs(b - a - 28) > 1), 'a ⋯ whose mouse press is not its 28 px box').toEqual([]);
      expect(rows.flatMap((r) => r.moreReach).filter((x) => x !== 'absolute 26px 26px'), 'a ⋯ whose press area reaches past its box on a mouse').toEqual([]);
      expect(rows.flatMap((r) => r.stolen), "a control part of whose box presses its neighbour").toEqual([]);
      expect(rows.filter((r) => r.outside), 'a row control outside its row').toEqual([]);
      expect(rows.filter((r) => !r.line), "a row whose actions cell drops the row's line").toEqual([]);
    });

    test(`the Row actions button: the 28 px grey plate, a 1 px frame, darker in a full-ink frame on hover, still a menu button (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=table', { theme });
      const b = rowMore(page);
      await b.waitFor({ timeout: 15_000 });
      // a11y: the same button, name and menu popup as before.
      await expect(b).toHaveAttribute('aria-label', kitStrings['table.rowActions']);
      await expect(b).toHaveAttribute('aria-haspopup', /true|menu/);
      const rest = await look(b);
      expect([rest.w, rest.h]).toEqual([28, 28]);
      // The frame is the plate's lower layer showing through a transparent 1 px border, so the cut can be drawn.
      expect([rest.lineW, rest.lineStyle]).toEqual(['1px', 'solid']);
      expect(rest.plateLine).toBe(await rootToken(page, '--hx-btn-line'));
      expect(rest.plate).toBe(await rootToken(page, '--hx-btn-plate'));
      if (theme === 'light') expect([rest.plateLine, rest.plate]).toEqual([LIGHT.line, LIGHT.bg]);
      await b.hover();
      await expect(b).toHaveAttribute('data-hovered', 'true');
      const hov = await look(b);
      expect(hov.plate).toBe(await rootToken(page, '--hx-btn-plate-hover'));
      expect(hov.plateLine).toBe(await rootToken(page, '--hx-btn-line-hover'));
      if (theme === 'light') expect(hov.plate).toBe(LIGHT.hover);
      expect(hov.plate).not.toBe(rest.plate);
      // The keyboard focus ring is the button's own (unchanged by the look).
      await page.mouse.move(0, 0);
      await b.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(b).toBeFocused();
      const ring = await b.evaluate((el) => {
        const c = getComputedStyle(el);
        return c.outlineStyle !== 'none' || c.boxShadow !== 'none';
      });
      expect(ring).toBe(true);
    });

    test(`a default More actions menu takes the look; another icon button keeps its own (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=actions', { theme });
      // The menu's own trigger (it opens a popup): the gallery also shows a ButtonStrip, whose More actions is the strip's
      // overflow, not a default menu.
      const more = page.getByRole('button', { name: menuStrings.more, exact: true }).and(page.locator('[aria-haspopup="true"]'));
      const plain = page.locator('[data-gallery="icon-buttons"]').getByRole('button', { name: galleryStrings['icon.refresh'], exact: true }).first(); // reason: the icon matrix repeats the name per row; the first is the plain (ghost) md specimen
      await more.waitFor({ timeout: 15_000 });
      await plain.waitFor({ timeout: 15_000 });
      const plate = await rootToken(page, '--hx-btn-plate');
      const line = await rootToken(page, '--hx-btn-line');
      const m = await look(more);
      expect([m.plateLine, m.plate]).toEqual([line, plate]);
      // A plain icon button is frameless at rest: no plate of its own.
      const e = await look(plain);
      expect([e.plate, e.plateLine]).toEqual(['transparent', 'transparent']);
    });
  });
}

// Billing plans has no table since the plan columns: its plans are kit PlanCards. The
// plain tables left (Keys candidates, AI usage) keep the table row height by rule (rows.table-data-row-px.test.tsx).

test.describe('table rows on a coarse pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });

  test('a table data row keeps 48 px and the three-dot button its 44 px hit area', async ({ page }) => {
    await gotoHub(page, '/_kit?tab=table');
    expect(await height(firstRow(page))).toBeGreaterThanOrEqual(48);
    const m = await look(rowMore(page));
    expect(Math.min(m.w, m.h)).toBeGreaterThanOrEqual(44);
  });
});

// On a coarse pointer a compact row is 44 (--row-h-dense there); rows stack without overlapping, and no row's control
// reaches into the next row. Its controls are xs: the inline action and the hover icons draw 24, the ⋯ the 28 px plate,
// and a press down each one's middle lands on it across the row's whole 44 (the ::after: 9 px past the inside of the
// ⋯'s 1 px frame each way, so 8 px past its 28 px box and 44 in all, the touch minimum), never past the row's line.
test.describe('compact table rows on a coarse pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });

  for (const theme of ['light', 'dark'] as const)
    test(`compact rows are 44, stack without overlap, and hold their controls (${theme})`, async ({ page }) => {
      await gotoHub(page, '/_kit?tab=table', { theme });
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      await firstRow(page).waitFor({ timeout: 15_000 });
      const rows = await compactRows(page);
      expect(rows.length, 'rows measured').toBeGreaterThan(1);
      expect(rows.flatMap((r) => r.inline).length, 'some row has an inline action').toBeGreaterThan(0);
      expect(rows.filter((r) => r.h !== 44), 'a compact coarse row that is not 44').toEqual([]);
      expect(rows.flatMap((r) => r.inline).filter(([, h]) => h !== 24), 'an inline action that is not drawn 24 tall').toEqual([]);
      expect(rows.flatMap((r) => r.more).filter(([w, h]) => w !== 28 || h !== 28), 'a ⋯ that is not drawn 28 x 28').toEqual([]);
      expect(rows.flatMap((r) => r.moreReach).filter((x) => x !== 'absolute 44px 44px'), 'a ⋯ whose press area is not 44 x 44 (8 px past its 28 px box each way)').toEqual([]);
      expect(rows.flatMap((r) => r.presses).length, 'presses measured').toBeGreaterThan(0);
      // The press covers its 44 px row, to within a pixel at each edge (Chromium hit-tests whole pixels: at the row's
      // last half pixel a point already reads as the next row's).
      expect(rows.flatMap((r) => r.presses).filter(([a, b, top, bottom]) => a > top + 1 || b < bottom - 1), 'a control whose press does not cover its 44 px row').toEqual([]);
      expect(rows.filter((r) => r.pressOutside), 'a press area past its row').toEqual([]);
      // Side by side (the ⋯, the open chevron, the inline action), no touch press covers a neighbour's box, and an
      // icon's press is still 44 wide to within a pixel.
      // Not vacuous: rows hold two controls side by side (the gallery's inline Start / Resume / Restart beside the ⋯).
      expect(rows.filter((r) => r.pressW.length > 1).length, 'rows with two controls side by side').toBeGreaterThan(0);
      expect(rows.flatMap((r) => r.stolen), "a control part of whose box presses its neighbour").toEqual([]);
      expect(rows.flatMap((r) => r.pressW).filter(([p, w, h]) => w === h && (w === 24 || w === 28) && p < 43), 'an icon whose touch press is under 44 wide').toEqual([]);
      expect(rows.flatMap((r) => r.pressW).filter(([, w, h]) => w === 28 && h === 28).length, '⋯ press widths measured').toBeGreaterThan(0);
      const overlaps = rows.slice(1).filter((r, i) => r.top < rows[i]!.bottom).map((r) => r.top);
      expect(overlaps, 'a row that starts above the end of the row before it').toEqual([]);
      expect(rows.filter((r) => r.outside), 'a row control outside its row').toEqual([]);
      expect(rows.filter((r) => !r.line), "a row whose actions cell drops the row's line").toEqual([]);
    });
});
