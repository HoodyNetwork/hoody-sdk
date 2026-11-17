// Playwright: one focus shape, one disabled recipe and coarse targets that are the
// control's own box. The control matrix (controls.matrix.spec.ts) reads each family's first specimen; this reads what it
// does not: every option of a segmented strip on a coarse pointer, the swatches'
// ring and its forced-colours outline, a stack of toggles and a table's bare row checks on a phone, each tap toggling
// only its own control.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import gallery from '../gallery/strings.en.json';

/** Keyboard focus on `l` (React Aria's ring needs keyboard modality: a Tab press first, then a scripted focus). */
async function keyFocus(page: Page, l: Locator) {
  await page.keyboard.press('Tab');
  await l.evaluate((n) => (n as HTMLElement).focus());
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The computed box-shadow and outline of `l`, and the page's --focus-ring as the same element would resolve it. */
const ring = (l: Locator) =>
  l.evaluate((n) => {
    const c = getComputedStyle(n);
    const probe = document.createElement('span');
    probe.style.boxShadow = 'var(--focus-ring)';
    // An input holds no children: its ring resolves as its parent's would (the same inherited tokens).
    (n instanceof HTMLInputElement ? n.parentElement! : n).appendChild(probe);
    const want = getComputedStyle(probe).boxShadow;
    probe.remove();
    return { shadow: c.boxShadow, want, outline: `${c.outlineStyle} ${c.outlineWidth}` };
  });

for (const theme of ['light', 'dark'] as const)
  test.describe(`focus and disabled, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('a swatch and the colour square take the kit ring (no outline); forced colours draw an outline instead', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoHub(page, '/_kit?tab=forms', { theme });
      const picker = page.getByRole('radiogroup', { name: gallery['f.colour'], exact: true });
      const swatch = picker.locator('label').first(); // reason: the first swatch of the enabled picker
      await swatch.scrollIntoViewIfNeeded();
      await keyFocus(page, swatch.locator('input'));
      await expect(swatch).toHaveAttribute('data-focus-visible', 'true');
      const r = await ring(swatch);
      expect(r.shadow, 'the kit ring').toBe(r.want);
      expect(r.outline, 'no outline beside it').toMatch(/^none |^\S+ 0px$/);
      const square = page.locator('input[type="color"]').first(); // reason: the enabled picker's square comes first
      await keyFocus(page, square);
      const q = await ring(square);
      expect(q.shadow, 'the colour square: the kit ring').toBe(q.want);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await keyFocus(page, swatch.locator('input'));
      expect((await ring(swatch)).outline, 'forced colours: an outline').toBe('solid 2px');
      await keyFocus(page, square);
      expect((await ring(square)).outline, 'forced colours: the square outlined too').toBe('solid 2px');
    });

    test('a segmented option takes the kit ring, the chosen one too; forced colours draw an outline', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await gotoHub(page, '/_kit?tab=controls', { theme });
      const strip = page.locator('[data-cell^="segmented.md.rest"] [role="radiogroup"]').first(); // reason: the default-density specimen
      const [chosen, next] = [strip.getByRole('radio').nth(0), strip.getByRole('radio').nth(1)]; // reason: the chosen option and the one after it
      await keyFocus(page, chosen);
      // The strip is one tab stop: an arrow key moves focus to the next option (selection stays).
      for (const opt of [chosen, next]) {
        if (opt === next) await page.keyboard.press('ArrowRight');
        await expect(opt).toHaveAttribute('data-focus-visible');
        const r = await ring(opt);
        expect(r.shadow).toBe(r.want);
        expect(r.outline).toMatch(/^none |^\S+ 0px$/);
      }
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      // `next` holds the strip's tab stop now (roving focus): a Tab back into the strip lands on it.
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(next).toBeFocused();
      await expect(next).toHaveAttribute('data-focus-visible');
      expect((await ring(next)).outline).toBe('solid 2px');
      // The folder variant (an inset ring with colours on) is outlined in forced colours too.
      const folder = page.locator('[data-cell^="segmentedFolder.md.rest"] [role="radio"]').first(); // reason: the folder specimen's chosen tab
      await keyFocus(page, folder);
      await expect(folder).toHaveAttribute('data-focus-visible');
      expect((await ring(folder)).outline, 'a folder tab: outlined').toBe('solid 2px');
    });

    test('a locked picker: every swatch and the square at --ctl-off-opacity', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=forms', { theme });
      const locked = page.getByRole('radiogroup', { name: gallery['f.colourOff'], exact: true });
      await locked.scrollIntoViewIfNeeded();
      const ops = await locked.locator('label').evaluateAll((ls) => ls.map((l) => getComputedStyle(l).opacity));
      expect(ops.length).toBeGreaterThan(3);
      expect(new Set(ops)).toEqual(new Set(['0.5']));
      const square = page.locator('input[type="color"]:disabled');
      await expect(square).toHaveCount(1);
      expect(await square.evaluate((n) => getComputedStyle(n).opacity)).toBe('0.5');
    });
  });

/** Every point of a box `inset` px inside its edges: the centre, the four edge midpoints and the four corners. */
const points = (b: { x: number; y: number; width: number; height: number }, inset = 1): Array<[number, number]> => {
  const [l, t, r, d] = [b.x + inset, b.y + inset, b.x + b.width - inset, b.y + b.height - inset];
  const [cx, cy] = [b.x + b.width / 2, b.y + b.height / 2];
  return [[cx, cy], [l, cy], [r, cy], [cx, t], [cx, d], [l, t], [r, t], [l, d], [r, d]];
};
const checked = (l: Locator) => l.evaluate((n) => (n.querySelector('input') as HTMLInputElement | null)?.checked ?? false);

for (const theme of ['light', 'dark'] as const)
  test.describe(`coarse targets at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('every option of a segmented strip owns a 44 px tall target, and no point is a neighbour\'s', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=controls', { theme });
      const strip = page.locator('[data-cell^="segmented.md.rest"] [role="radiogroup"]').first(); // reason: the default-density specimen
      await strip.scrollIntoViewIfNeeded();
      const got = await strip.evaluate((g) => {
        const opts = [...g.querySelectorAll<HTMLElement>('[role="radio"]')];
        return opts.map((o, i) => {
          const r = o.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const owner = (x: number, y: number) => opts.findIndex((p) => p.contains(document.elementFromPoint(x, y)));
          let up = 0;
          while (up < 40 && owner(cx, cy - up - 1) === i) up++;
          let down = 0;
          while (down < 40 && owner(cx, cy + down + 1) === i) down++;
          return { i, tall: up + down + 1, edges: [owner(r.x + 1, cy), owner(r.right - 1, cy)] };
        });
      });
      expect(got.length).toBe(3);
      for (const g of got) {
        expect(g.tall, `option ${g.i} target height`).toBeGreaterThanOrEqual(44);
        expect(g.edges, `option ${g.i}: its own edges are its own`).toEqual([g.i, g.i]);
      }
    });

    test('a Switch and a Checkbox in a form are 44 tall each, apart, and a tap anywhere in one toggles only it', async ({ page }) => {
      await gotoHub(page, '/_kit?tab=forms', { theme });
      const sw = page.locator('label').filter({ has: page.getByRole('switch', { name: gallery['f.backups'] }) });
      const cb = page.locator('label').filter({ has: page.getByRole('checkbox', { name: gallery['f.terms'] }) });
      await cb.scrollIntoViewIfNeeded();
      const [bs, bc] = [(await sw.boundingBox())!, (await cb.boundingBox())!];
      expect(bs.height).toBeGreaterThanOrEqual(44);
      expect(bc.height).toBeGreaterThanOrEqual(44);
      expect(bs.y + bs.height <= bc.y || bc.y + bc.height <= bs.y, 'the two targets do not overlap').toBe(true);
      for (const [mine, other] of [[sw, cb], [cb, sw]] as const) {
        const box = (await mine.boundingBox())!;
        for (const [x, y] of points(box)) {
          const [a, b] = [await checked(mine), await checked(other)];
          await page.touchscreen.tap(x, y);
          expect([await checked(mine), await checked(other)], `tap at ${Math.round(x)},${Math.round(y)}`).toEqual([!a, b]);
        }
      }
    });

    test("a table's bare row check is a 44 x 44 target of its own: each tap toggles its row only", async ({ page }) => {
      await rowChecks(page, theme);
    });
  });

// The same at 1440 on a touch screen, where the table draws its columns (at 390 it is a list): the selection column holds
// its 44 checks whole, beside the next column.
for (const theme of ['light', 'dark'] as const)
  test.describe(`coarse table columns at 1440, ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true, isMobile: true });
    test("a column table's row checks and select-all are 44 x 44, whole in the selection column, each tap its own", async ({ page }) => {
      await rowChecks(page, theme);
    });
  });

/** A table's checks on a coarse pointer: each 44 x 44 and whole inside its cell (the header's select-all too), rows
 *  apart, and a tap anywhere in a row's check toggles that row only. */
async function rowChecks(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/_kit?tab=table', { theme });
  const checks = page.locator('#hub-main tbody:has(input[type="checkbox"])').first().locator('label:has(input[type="checkbox"])'); // reason: the gallery's first table with row checks
  await expect(checks.nth(1)).toBeVisible(); // reason: at least two rows
  const n = Math.min(3, await checks.count());
  const boxes = [];
  for (let i = 0; i < n; i++) {
    const b = (await checks.nth(i).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    boxes.push(b);
  }
  for (let i = 1; i < n; i++) expect(boxes[i]!.y >= boxes[i - 1]!.y + boxes[i - 1]!.height, `rows ${i - 1} and ${i} apart`).toBe(true);
  // Every check, the header's select-all included, sits whole inside its own cell: it reaches into no other column
  // and nothing (the header's overflow) clips it.
  const table = page.locator('#hub-main table:has(tbody input[type="checkbox"])').first(); // reason: the same first table with row checks
  const inCell = await table.locator('label:has(input[type="checkbox"])').evaluateAll((ls) =>
    ls.map((l) => {
      const r = l.getBoundingClientRect();
      const c = l.closest('td, th')!.getBoundingClientRect();
      return { head: !!l.closest('th'), w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= c.left - 0.5 && r.right <= c.right + 0.5 && r.top >= c.top - 0.5 && r.bottom <= c.bottom + 0.5 };
    }),
  );
  expect(inCell.length).toBeGreaterThan(n);
  for (const [k, c] of inCell.entries()) {
    expect(c.inside, `check ${k} (${c.w}x${c.h}) inside its cell`).toBe(true);
    // A row check is 44 square (44 x 43 in a compact row, its line below); the select-all is 44 wide and fills the
    // 32 px header, whose height the sticky group rows stick under.
    expect(c.w, `check ${k} 44 wide`).toBeGreaterThanOrEqual(44);
    expect(c.h, `check ${k} tall enough`).toBeGreaterThanOrEqual(c.head ? 31 : 43);
  }
  const states = () => Promise.all([...Array(n).keys()].map((k) => checked(checks.nth(k))));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 9; j++) {
      // A selection can show the bulk bar and move the rows (it slides in): the box is read again before every tap, once
      // it has held still for two frames.
      await checks.nth(i).evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const [x, y] = points(await stillBox(checks.nth(i)), 2)[j]!;
      const before = await states();
      await page.touchscreen.tap(x, y);
      const want = before.map((v, k) => (k === i ? !v : v));
      await expect.poll(states, { message: `row ${i} point ${j} (${Math.round(x)},${Math.round(y)})` }).toEqual(want);
    }
  }
}

/** The element's box once it is the same in two reads two frames apart (a bar sliding in moves the rows). */
async function stillBox(l: Locator) {
  let last = '';
  for (;;) {
    const b = await l.evaluate((el) => new Promise<{ x: number; y: number; width: number; height: number }>((done) =>
      requestAnimationFrame(() => requestAnimationFrame(() => { const r = el.getBoundingClientRect(); done({ x: r.x, y: r.y, width: r.width, height: r.height }); })),
    ));
    const key = JSON.stringify(b);
    if (key === last) return b;
    last = key;
  }
}
