// Playwright: a table toolbar row is at least 52 px with 6 px above and below. Its search is a 40 px field control: the
// input fill, a 1 px grey outline (--hx-field-line) and dark text. Its filter chips, Filters button and icon buttons
// (View options, More, Sort by, Refresh) are 40 px grey button plates: the plate fill in the plate's frame,
// cut at the bottom end. The values are the design's in light; in dark the same tokens give their dark pairs.
// Measured through the real DataTable on the demo page, at a wide desktop, a laptop and a phone (390, coarse: 44 px,
// touch never shrinks).
import { expect, type Locator, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';
import kit from '../strings.en.json';
import table from './DataTable.strings.en.json';

/** The design's light values, as the browser reports them. */
const FIELD_BG = 'rgb(248, 248, 248)'; // #f8f8f8 (--hx-input-bg)
const FIELD_LINE = 'rgb(122, 122, 122)'; // #7a7a7a (--hx-field-line: 3:1 on the field fill)
const FIELD_INK = 'rgb(39, 39, 39)'; // #272727 (--hx-ink)
/** The design's light plate, as written in the tokens (a plate is painted from custom properties, read as text). */
const PLATE = '#e3e3e3'; // --hx-btn-plate
const PLATE_LINE = '#7a7a7a'; // --hx-btn-line

interface Box {
  height: number;
  width: number;
  bg: string;
  line: string;
  lineWidth: string;
  ink: string;
  radius: string;
  padTop: string;
  padBottom: string;
  /** The plate's fill and frame colours, as the element resolves them ('' on an element that is not a plate). */
  plate: string;
  plateLine: string;
}

const read = (l: Locator): Promise<Box> =>
  l.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      height: Math.round(r.height),
      width: Math.round(r.width),
      bg: cs.backgroundColor,
      line: cs.borderTopColor,
      lineWidth: cs.borderTopWidth,
      ink: cs.color,
      radius: cs.borderTopLeftRadius,
      padTop: cs.paddingTop,
      padBottom: cs.paddingBottom,
      plate: cs.getPropertyValue('--plate').trim(),
      plateLine: cs.getPropertyValue('--plate-line').trim(),
    };
  });

const frame = (page: Page) => page.locator('#hub-main [data-table-frame]').first();
const toolbar = (page: Page) => frame(page).locator(':scope > div:has([data-hub-search])').first();

interface Field {
  bg: string;
  line: string;
  ink: string;
}

/** The field tokens as this theme resolves them (a probe styled with --hx-field-*), so dark is checked by value too. */
async function fieldOf(page: Page, theme: 'light' | 'dark'): Promise<Field> {
  const f = await page.locator('#hub-main').evaluate((main) => {
    const el = document.createElement('div');
    el.style.cssText = 'background: var(--hx-field-bg); border-top: 1px solid var(--hx-field-line); color: var(--hx-field-ink)';
    main.append(el);
    const cs = getComputedStyle(el);
    const out = { bg: cs.backgroundColor, line: cs.borderTopColor, ink: cs.color };
    el.remove();
    return out;
  });
  if (theme === 'light') expect(f, 'light: the field tokens are the design\'s values').toEqual({ bg: FIELD_BG, line: FIELD_LINE, ink: FIELD_INK });
  else expect.soft(f.bg, 'dark: the field fill is its own dark value').not.toBe(FIELD_BG);
  return f;
}

interface Plate {
  plate: string;
  line: string;
}

/** The plate tokens as this theme resolves them, so dark is checked by value too. */
async function plateOf(page: Page, theme: 'light' | 'dark'): Promise<Plate> {
  const p = await page.locator('#hub-main').evaluate((main) => {
    const cs = getComputedStyle(main);
    return { plate: cs.getPropertyValue('--hx-btn-plate').trim(), line: cs.getPropertyValue('--hx-btn-line').trim() };
  });
  if (theme === 'light') expect(p, 'light: the plate tokens are the design\'s values').toEqual({ plate: PLATE, line: PLATE_LINE });
  else expect.soft(p.plate, 'dark: the plate is its own dark value').not.toBe(PLATE);
  return p;
}

/** A control is a grey button plate at rest: the plate fill inside the plate's frame, a 1 px frame that the plate
 *  paints (its own border is transparent, so the cut shows), square corners. */
function expectPlate(b: Box, at: string, p: Plate) {
  expect.soft(b.lineWidth, `${at}: a 1 px frame`).toBe('1px');
  expect.soft(b.plate, `${at}: the plate fill`).toBe(p.plate);
  expect.soft(b.plateLine, `${at}: the plate frame`).toBe(p.line);
  expect.soft(b.radius, `${at}: square corners`).toBe('0px');
}

/** A control has the field look: the field fill, the 1 px field line (light values quoted above, dark by token). */
function expectField(b: Box, at: string, f: Field) {
  expect.soft(b.lineWidth, `${at}: a 1 px outline`).toBe('1px');
  expect.soft(b.bg, `${at}: the field fill`).toBe(f.bg);
  expect.soft(b.line, `${at}: the field outline`).toBe(f.line);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [2400, 1350] as const) {
    test(`a table toolbar is the 52 px row of 40 px controls at ${width} (${theme})`, async ({ hubPage: page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoHub(page, '/demo', { theme });
      const tb = toolbar(page);
      await expect(tb).toBeVisible();
      const f = await fieldOf(page, theme);
      const p = await plateOf(page, theme);
      const row = await read(tb);
      expect.soft(row.height, `${theme} ${width}: the toolbar row is at least 52 px`).toBeGreaterThanOrEqual(52);
      expect.soft([row.padTop, row.padBottom], `${theme} ${width}: 6 px above and below its controls`).toEqual(['6px', '6px']);

      const search = await read(tb.getByRole('searchbox'));
      expect.soft(search.height, `${theme} ${width}: search is 40 px`).toBe(40);
      expectField(search, `${theme} ${width} search`, f);

      const chips = tb.locator('[role="group"][aria-label="' + kit['table.filters'] + '"] > [data-chip]');
      expect(await chips.count(), `${theme} ${width}: the demo toolbar shows its filter chips`).toBeGreaterThan(0);
      for (const c of await chips.all()) {
        const b = await read(c);
        const at = `${theme} ${width} chip ${await c.getAttribute('data-chip')}`;
        expect.soft(b.height, `${at}: 40 px`).toBe(40);
        expectPlate(b, at, p);
        const name = c.locator('button').first(); // the chip's own name button, the first of its two (name, clear)
        const ink = await name.evaluate((el) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--hx-btn-text)';
          el.append(probe);
          const out = [getComputedStyle(el).color, getComputedStyle(probe).color];
          probe.remove();
          return out;
        });
        expect.soft(ink[0], `${at}: the button ink`).toBe(ink[1]);
      }

      for (const label of [kit['table.view'], table.refresh]) {
        const btn = tb.getByRole('button', { name: label, exact: true });
        await expect(btn, `${theme} ${width}: the demo toolbar has ${label}`).toBeVisible();
        const b = await read(btn);
        const at = `${theme} ${width} ${label}`;
        expect.soft([b.width, b.height], `${at}: a 40 px square`).toEqual([40, 40]);
        expectPlate(b, at, p);
      }
    });
  }
}

test('a narrow toolbar keeps its 40 px controls: the folded Filters button and the More button (390)', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, '/demo', { theme: 'light' });
  const tb = toolbar(page);
  await expect(tb).toBeVisible();
  const plate = await plateOf(page, 'light');
  const filters = tb.getByRole('button', { name: new RegExp(`^${kit['table.filters']}`) });
  await expect(filters, 'at 390 the chips fold into the Filters button').toBeVisible();
  const f = await read(filters);
  expect.soft(f.height, 'Filters button: 40 px').toBe(40);
  expectPlate(f, 'Filters button', plate);
  const drawn: string[] = [];
  for (const label of [kit['table.view'], kit['action.more'], kit['table.sortBy'], table.refresh]) {
    const btn = tb.getByRole('button', { name: label, exact: true });
    if ((await btn.count()) === 0) continue; // the demo draws some of these at 390, not all; the count below holds coverage
    drawn.push(label);
    const b = await read(btn);
    expect.soft([b.width, b.height], `390 ${label}: a 40 px square`).toEqual([40, 40]);
    expectPlate(b, `390 ${label}`, plate);
  }
  expect(drawn, 'at 390 the demo toolbar draws View options or More, and Refresh').toEqual(expect.arrayContaining([table.refresh]));
  expect(drawn.length, 'at 390 at least two of the toolbar icon buttons are measured').toBeGreaterThanOrEqual(2);
});

/** The badge, the glyph and the button of the set icon-only Filters button, as boxes. */
async function badgeBoxes(page: Page) {
  const tb = toolbar(page);
  const filters = tb.getByRole('button', { name: `${kit['table.filtersButtonCount'].replace('{{count}}', '1')}`, exact: true });
  await expect(filters, 'the name carries the number').toBeVisible();
  expect(await filters.getAttribute('aria-label'), 'the demo toolbar folds its filters to the icon alone (no words)').not.toBeNull();
  expect((await filters.textContent())?.trim() ?? '', 'the folded Filters button draws no words').toBe('');
  const badge = tb.locator('[data-filters-count]');
  await expect(badge, 'a set Filters icon shows its number').toHaveText('1');
  await expect(badge).toHaveAttribute('aria-hidden', 'true');
  const [b, box, glyph] = await Promise.all([badge.boundingBox(), filters.boundingBox(), filters.locator('svg').boundingBox()]);
  if (!b || !box || !glyph) throw new Error('the badge, the button and its glyph all draw');
  return { filters, b, box, glyph };
}

for (const variant of [
  { at: '390 light', theme: 'light', rtl: false },
  { at: '390 dark', theme: 'dark', rtl: false },
  { at: '390 light rtl', theme: 'light', rtl: true },
] as const) {
  test(`a set filter shows its number on the folded Filters icon, inside its box and clear of the glyph (${variant.at})`, async ({ hubPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoHub(page, '/demo?status=failed', { theme: variant.theme });
    if (variant.rtl) await page.evaluate(() => void (document.documentElement.dir = 'rtl'));
    await expect(toolbar(page)).toBeVisible();
    const { filters, b, box, glyph } = await badgeBoxes(page);
    expect([Math.round(box.width), Math.round(box.height)], `${variant.at}: the Filters icon is a 40 px square`).toEqual([40, 40]);
    expect(b.x >= box.x && b.y >= box.y && b.x + b.width <= box.x + box.width && b.y + b.height <= box.y + box.height, `${variant.at}: the badge sits inside the button`).toBe(true);
    const apart = b.x >= glyph.x + glyph.width || b.x + b.width <= glyph.x || b.y >= glyph.y + glyph.height || b.y + b.height <= glyph.y;
    expect(apart, `${variant.at}: the badge never covers the filter glyph`).toBe(true);
    const endSide = variant.rtl ? b.x + b.width / 2 < box.x + box.width / 2 : b.x + b.width / 2 > box.x + box.width / 2;
    expect(endSide, `${variant.at}: the badge sits at the end corner`).toBe(true);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.getByRole('dialog', { name: kit['table.filters'] }), `${variant.at}: a click on the badge opens the filters`).toBeVisible();
    await expect(filters).toHaveAttribute('aria-expanded', 'true');
  });
}

test('on a coarse pointer the toolbar controls are 44 px (touch targets never shrink)', async ({ hubPageCoarse: page }) => {
  await gotoHub(page, '/demo', { theme: 'light' });
  const tb = toolbar(page);
  await expect(tb).toBeVisible();
  expect.soft((await read(tb.getByRole('searchbox'))).height, 'coarse search: 44 px').toBe(44);
  const refresh = await read(tb.getByRole('button', { name: table.refresh, exact: true }));
  expect.soft([refresh.width, refresh.height], 'coarse Refresh: 44 px square').toEqual([44, 44]);
});

test('on a coarse pointer the set Filters icon is 44 px and its badge stays clear of the glyph', async ({ hubPageCoarse: page }) => {
  await gotoHub(page, '/demo?status=failed', { theme: 'light' });
  await expect(toolbar(page)).toBeVisible();
  const { b, box, glyph } = await badgeBoxes(page);
  expect([Math.round(box.width), Math.round(box.height)], 'coarse: the Filters icon is a 44 px square').toEqual([44, 44]);
  expect(b.x + b.width <= box.x + box.width && b.y + b.height <= box.y + box.height, 'coarse: the badge sits inside the button').toBe(true);
  expect(b.x >= glyph.x + glyph.width || b.y >= glyph.y + glyph.height, 'coarse: the badge never covers the filter glyph').toBe(true);
});

/** What the toolbar draws once it is still: its filter chips or not, and whether its row fits its box. */
async function settled(page: Page): Promise<{ chips: boolean; fits: boolean; search: number; least: number; rail: boolean; filtersWidth: number | null }> {
  const read1 = () =>
    toolbar(page).evaluate((el, label) => {
      const fb = [...el.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim().startsWith(label));
      const search = el.querySelector('[data-hub-search]')?.closest('div');
      return {
        chips: !!el.querySelector(`[role="group"][aria-label="${label}"]`),
        fits: el.scrollWidth <= el.clientWidth,
        search: search ? Math.round(search.getBoundingClientRect().width) : 0,
        // The least width the search keeps here, as its own CSS gives it: 200 in a page's table, the rail's 144 once the table
        // is drawn as a list rail (DataTable.module.css .rail), the tight step's 96 (data-fit='last').
        least: search ? parseFloat(getComputedStyle(search).minWidth) || 0 : 0,
        rail: !!el.closest('[data-rail]'),
        filtersWidth: fb ? Math.round(fb.getBoundingClientRect().width) : null,
      };
    }, kit['table.filters']);
  // Still means the same reading three frames pairs running (a fit step, a ResizeObserver turn and a re-render can each
  // take a frame pair, so two equal reads can fall between steps).
  let last = await read1();
  let same = 0;
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    const now = await read1();
    same = JSON.stringify(now) === JSON.stringify(last) ? same + 1 : 0;
    if (same >= 2) return now;
    last = now;
  }
  throw new Error('the toolbar did not settle');
}

// The fold in a real browser, with real widths and gaps: the unit width model is synthetic. The search is
// the row's give: it shrinks to its least width (200 px) before anything folds, so the boundary is where the search
// would go under 200. Below it the chips fold into the Filters button with its words (the first fold step, about 109 px;
// the 40 px icon is a later step); at it, and after a chosen value widens a chip, the row still fits and the search keeps
// at least 200 (the chips stay or fold, whichever fits; never cut).
// Two places, because they fold for different reasons:
// - the kit's Data view tab forces table presentation, so its chips fold only because the toolbar row runs out of room:
//   this is the page table's own width-driven fold, held to the table's 200 on both sides;
// - /demo turns into a list rail (data-rail) at the same narrowing, and list rows never draw chips, so its fold is the
//   rail switch; the folded rail row's search keeps the rail's own least width (144 px, DataTable.module.css .rail), not
//   200 (a folded rail row at 536 px gives it 199 px, and the row fits).
const SEARCH_LEAST = 200;
const RAIL_LEAST = 144;

const FOLDS = [
  { name: 'a page table (kit Data view, table presentation)', url: '/_kit?tab=dataview', rail: false, param: 'dvstate', single: false },
  { name: 'a table that becomes a list rail (/demo)', url: '/demo', rail: true, param: 'status', single: true },
] as const;

for (const place of FOLDS) {
  test(`the fold boundary in a real browser, ${place.name}: the row fits at its least width with chips, and a chosen value never overflows it`, async ({ hubPage: page }) => {
    // A bisection and two widenings, each a settled resize pair: past the default timeout on a loaded host.
    test.slow();
    await page.setViewportSize({ width: 1350, height: 900 });
    await gotoHub(page, place.url, { theme: 'light' });
    await expect(toolbar(page)).toBeVisible();
    // The rows have come (the Data view answers after its fake latency): the count beside them is part of the row's width.
    await expect(frame(page).locator('tbody tr[data-row-id][data-index="0"]')).toBeVisible();
    const wide = await settled(page);
    expect(wide, '1350: the chips show, in table presentation').toMatchObject({ chips: true, rail: false, least: SEARCH_LEAST });
    // Each width is read on a narrowing window, from 1350: the row steps down as it narrows. A row that grows again steps
    // back up to the most generous step whose measured width fits, so it unfolds at the width it folded at (widenedTo,
    // below).
    const narrowedTo = async (w: number) => {
      await page.setViewportSize({ width: 1350, height: 900 });
      await settled(page);
      await page.setViewportSize({ width: w, height: 900 });
      return settled(page);
    };
    const widenedTo = async (w: number) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await settled(page);
      await page.setViewportSize({ width: w, height: 900 });
      return settled(page);
    };
    expect((await narrowedTo(390)).chips, '390: the chips are folded').toBe(false);
    // The least viewport width (to 4 px) at which the chips still show, the fold being one step on a narrowing width.
    let lo = 390;
    let hi = 1350;
    while (hi - lo > 4) {
      const mid = Math.round((lo + hi) / 2);
      if ((await narrowedTo(mid)).chips) hi = mid;
      else lo = mid;
    }
    const below = await narrowedTo(lo);
    expect(below, `${lo}: just under the boundary the chips fold into the Filters button and the row fits`).toMatchObject({ chips: false, fits: true });
    expect.soft(below.filtersWidth ?? 0, `${lo}: just under the boundary the Filters button still shows its words (the first fold step)`).toBeGreaterThan(40);
    expect(below.rail, `${lo}: ${place.rail ? 'the folded table is a list rail' : 'the folded table is still a table'}`).toBe(place.rail);
    const least = place.rail ? RAIL_LEAST : SEARCH_LEAST;
    expect(below.least, `${lo}: the search's least width there is ${least}`).toBe(least);
    expect(below.search, `${lo}: the folded row keeps the search at its least width (${least} px) or more`).toBeGreaterThanOrEqual(least);
    expect((await widenedTo(lo)).chips, `${lo}: widened from 390 to just under the boundary, the chips stay folded`).toBe(false);
    expect(await widenedTo(hi), `${hi}: widened from 390 to the boundary, the chips unfold where they folded and the row fits`).toMatchObject({ chips: true, fits: true, rail: false });
    const at = await narrowedTo(hi);
    expect(at, `${hi}: at the boundary the chips show and the row fits its box`).toMatchObject({ chips: true, fits: true, rail: false });
    expect(at.search, `${hi}: the search is at or above its least width with the chips shown`).toBeGreaterThanOrEqual(SEARCH_LEAST);
    if (!place.rail) {
      // Only a width-driven fold happens where the search reaches its least width; the rail switch follows the columns.
      expect(at.search - SEARCH_LEAST, `${hi}: the boundary is where the search reaches its least width (within the 4 px step and the end controls' own rounding)`).toBeLessThanOrEqual(40);
    }
    expect(await toolbar(page).locator('[data-chip]').count(), 'the toolbar has one filter chip').toBe(1);
    const chipBefore = (await read(toolbar(page).locator('[data-chip]'))).width;
    await expect(page, 'no value chosen yet').not.toHaveURL(new RegExp(`[?&]${place.param}=`));
    await toolbar(page).locator('[data-chip] button').first().click(); // the chip's own name button, the first of its two (name, clear)
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    if (place.single) {
      // The menu opens on its checked "any" row; the next row is a value (the demo's first status).
      await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(menu, 'a single-choice filter closes its menu on the choice').toBeHidden();
    } else {
      await menu.locator('[role="menuitemcheckbox"]').first().click();
      await page.keyboard.press('Escape');
      await expect(menu, 'the multi-choice menu closes on Escape').toBeHidden();
    }
    // The choice really set the filter: its value is in the URL.
    await expect(page, 'the chosen value is the view\'s filter').toHaveURL(new RegExp(`[?&]${place.param}=[^&]+`));
    const after = await settled(page);
    expect(after.fits, `${hi}: with a chosen value the row still fits its box`).toBe(true);
    expect(after.search, `${hi}: with a chosen value the search keeps its least width`).toBeGreaterThanOrEqual(after.rail ? RAIL_LEAST : SEARCH_LEAST);
    if (after.chips) {
      const chip = await read(toolbar(page).locator('[data-chip]'));
      expect(chip.width, `${hi}: the chip widened to show the chosen value`).toBeGreaterThan(chipBefore);
      expect(await toolbar(page).locator('[data-chip]').evaluate((el) => el.scrollWidth <= el.clientWidth), `${hi}: the chosen value is not cut`).toBe(true);
    } else {
      await expect(toolbar(page).getByRole('button', { name: kit['table.filtersButtonCount'].replace('{{count}}', '1'), exact: true }), 'folded: the Filters button names the set count').toBeVisible();
    }
  });
}

// A toolbar whose end controls take their own second row (DataTable toolbarRow2; AI chats at 390 px, the scope switch
// below the search) keeps the toolbar row inset: --toolbar-pad-y (6 px) above the first row and below the second, as a
// one-row toolbar, never the old 4 px.
test('a two-row toolbar keeps the 6 px inset above and below', async ({ hubPage: page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await gotoHub(page, '/ai', { theme: 'light' });
  const row2 = page.locator('[class*="toolbarRow2"]').filter({ visible: true }).first();
  await expect(row2, '390: the AI chats toolbar folds its end controls into a second row').toBeVisible({ timeout: 15_000 });
  const tb = row2.locator('..');
  const pad = await tb.evaluate((el) => {
    const c = getComputedStyle(el);
    const probe = document.createElement('div');
    probe.style.paddingTop = 'var(--toolbar-pad-y)';
    el.append(probe);
    const want = getComputedStyle(probe).paddingTop;
    probe.remove();
    return { top: c.paddingTop, bottom: c.paddingBottom, want };
  });
  expect(pad.want, 'the toolbar inset token').toBe('6px');
  expect([pad.top, pad.bottom], 'two rows: 6 px above the first and below the second').toEqual([pad.want, pad.want]);
});
