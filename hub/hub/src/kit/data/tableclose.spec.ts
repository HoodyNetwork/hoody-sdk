// Playwright (width plan and "Slanted close"), 1440 and 390, light and dark:
// - every table drawn from a width plan (the gallery's table and data view tabs, the Keys page) is marked 'fit', hides
//   its horizontal bar and does not overflow sideways (the planner's widths add up to the room, so no edge cue is drawn);
// - a page table's frame (no card around it) ends under its last row and has the slanted corner: the corner pixel is
//   the page, a pixel on the slant is the panel line; a table inside a card or a rail stays square.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** Every table frame on the page: its fit flag, the scroller's overflow-x and whether it overflows sideways. */
const frames = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-table-frame]')].map((f) => {
      const sc = f.querySelector('table')!.parentElement!;
      return {
        label: f.querySelector('table')?.getAttribute('aria-label') ?? '',
        x: sc.getAttribute('data-x'),
        // Drawn from a width plan, read apart from the flag under test: its columns carry the plan's px widths.
        planned: ((cols) => cols.length > 0 && cols.every((c) => /px$/.test(c.style.width)))([...f.querySelectorAll<HTMLElement>('table > colgroup > col:not([class])')]),
        overflowX: getComputedStyle(sc).overflowX,
        sideways: sc.scrollWidth > sc.clientWidth + 1,
        cut: f.hasAttribute('data-table-cut'),
        rail: f.hasAttribute('data-rail'),
      };
    }),
  );

for (const width of [1440, 390] as const)
  for (const theme of ['light', 'dark'] as const)
    test.describe(`table close at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });

      for (const path of ['/_kit?tab=table', '/_kit?tab=dataview', '/keys'])
        test(`every planned table on ${path} hides its horizontal bar and fits, at ${width} ${theme}`, async ({ page }) => {
          await gotoHub(page, path, { theme });
          await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15_000 }); // reason: any table; the page only has to have rendered
          await page.evaluate(() => document.fonts.ready);
          const planned = async () => (await frames(page)).filter((f) => f.planned);
          // The Keys table is auto: at 390 it cannot fit, so it is drawn as a list, which carries no plan and no flag.
          const asList = path === '/keys' && width === 390;
          if (asList) await expect.poll(async () => (await frames(page)).map((f) => f.x), { message: 'the Keys table is a list at 390' }).toEqual([null]);
          else await expect.poll(async () => (await planned()).length, { message: 'the page has tables drawn from a width plan' }).toBeGreaterThan(0);
          for (const f of await planned()) {
            expect(f.x, `${f.label}: marked fit`).toBe('fit');
            expect(f.overflowX, `${f.label}: no horizontal bar`).toBe('hidden');
            expect(f.sideways, `${f.label}: no sideways overflow`).toBe(false);
          }
        });

      test(`a page table ends under its last row with the slanted corner, at ${width} ${theme}`, async ({ page }) => {
        await gotoHub(page, '/keys', { theme });
        const frame = page.locator('[data-table-frame]').first(); // reason: the Keys page has one table
        await expect(frame.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 }); // reason: any row; the table only has to have rendered
        await expect(frame).toHaveAttribute('data-table-cut', '');
        await expect(frame.locator(':scope > [data-table-edge] path')).toHaveCount(1);
        await expect(frame.locator(':scope > [data-card-edge]')).toHaveCount(0);
        const g = await frame.evaluate((f) => {
          f.scrollIntoView({ block: 'end' });
          const r = f.getBoundingClientRect();
          const rows = [...f.querySelectorAll('tbody tr')];
          const last = rows.at(-1)!.getBoundingClientRect();
          const foot = [...f.children].filter((c) => c.getBoundingClientRect().top >= last.bottom - 0.5 && c.tagName !== 'svg');
          const below = foot.reduce((n, c) => Math.max(n, c.getBoundingClientRect().bottom), last.bottom);
          return { x: r.left, y: r.top, w: r.width, h: r.height, gap: r.bottom - below };
        });
        expect(g.gap, 'the frame ends under its last row (or its footer)').toBeLessThanOrEqual(2);
        const shot = await page.screenshot({ clip: { x: g.x + g.w - 24, y: g.y + g.h - 24, width: 24, height: 24 }, animations: 'disabled' });
        const px = await page.evaluate(async (b64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          [c.width, c.height] = [img.naturalWidth, img.naturalHeight];
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const s = c.width / 24;
          const at = (x: number, y: number) => [...ctx.getImageData(Math.floor(x * s), Math.floor(y * s), 1, 1).data.slice(0, 3)];
          // The corner (outside the 18 px cut), and the pixels around the slant's middle, (w − 9.5, h − 9.5) in the frame.
          const around: number[][] = [];
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) around.push(at(14.5 + dx, 14.5 + dy));
          return { corner: at(22.5, 22.5), around };
        }, shot.toString('base64'));
        // The surface behind the frame: the nearest ancestor that paints a background.
        const page_ = await frame.evaluate((f) => { let e = f.parentElement; while (e && /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor)) e = e.parentElement; return getComputedStyle(e ?? document.documentElement).backgroundColor; });
        const line = await frame.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--hx-panel-line)'; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; });
        const nums = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const rgb = (c: string) => nums(c).slice(0, 3);
        // The panel line can carry alpha (dark: white 12%): the drawn line is it over the frame's own card fill.
        const card = await frame.evaluate((f) => getComputedStyle(f).backgroundColor);
        const over = (fg: string, bg: string) => { const [r, g, b, a = 1] = nums(fg); const k = rgb(bg); return [r!, g!, b!].map((v, i) => v * a + k[i]! * (1 - a)); };
        const near = (a: number[], b: number[], d: number) => a.every((v, i) => Math.abs(v - b[i]!) <= d);
        expect(near(px.corner, rgb(page_), 12), `the corner ${px.corner} is the page ${page_}`).toBe(true);
        const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));
        const drawn = over(line, card);
        // On the line, and nearer it than the bare card (dark: the line is only white 12% over the card).
        expect(px.around.some((c) => near(c, drawn, 24) && dist(c, drawn) < dist(c, rgb(card))), `a pixel on the slant (${JSON.stringify(px.around)}) is the panel line ${line}, not the card ${card}`).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`keys-${width}-${theme}.png`), animations: 'disabled' });
      });

      test(`a filling page table (list-fill) ends under its last row, not at the pane's bottom, at ${width} ${theme}`, async ({ page }) => {
        await gotoHub(page, '/_kit?layout=list-fill', { theme });
        const frame = page.locator('[data-table-frame][data-fill]').first(); // reason: the layout specimen has one filling table
        await expect(frame.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 }); // reason: any row; the table only has to have rendered
        const gap = await frame.evaluate((f) => {
          const r = f.getBoundingClientRect();
          const last = [...f.querySelectorAll('tbody tr')].at(-1)!.getBoundingClientRect();
          const below = [...f.children].filter((c) => c.getBoundingClientRect().top >= last.bottom - 0.5 && c.tagName !== 'svg').reduce((n, c) => Math.max(n, c.getBoundingClientRect().bottom), last.bottom);
          return r.bottom - below;
        });
        expect(gap, 'the frame ends under its last row (or its footer)').toBeLessThanOrEqual(2);
      });

      test(`tables inside cards stay square, at ${width} ${theme}`, async ({ page }) => {
        await gotoHub(page, '/_kit?tab=table', { theme });
        await expect(page.getByRole('table').first()).toBeVisible({ timeout: 15_000 }); // reason: any table; the gallery only has to have rendered
        const all = await frames(page);
        expect(all.length).toBeGreaterThan(3);
        expect(all.filter((f) => f.cut).map((f) => f.label), 'no table in a gallery card is cut').toEqual([]);
      });
    });

// A cut frame keeps --table-cut clear at its rows' end, so the last row's ⋯, focused from the
// keyboard, has its whole ring inside the frame's uncut part: the ring's bottom-right corner is at least the cut (in
// x + y from the frame's corner) away from it, at 1440 and 390, on a fine and a coarse pointer.
// Right to left, the cut and its clearance both sit at the inline end, the frame's bottom left: the frame's
// bottom-left corner pixel is clipped (not hit), its bottom-right one is not, the edge is mirrored, and the ⋯ ring clears.
for (const [width, coarse, rtl] of [[1440, false, false], [390, false, false], [1440, true, false], [390, true, false], [1440, false, true], [390, true, true]] as const)
  test.describe(`the last row's ⋯ clears the slant, ${width} ${coarse ? 'coarse' : 'fine'}${rtl ? ' rtl' : ''}`, () => {
    test.use({ viewport: { width, height: 900 }, ...(coarse ? { hasTouch: true, isMobile: true } : {}) });
    test(`its focus ring is not clipped by the corner, ${width} ${coarse ? 'coarse' : 'fine'}${rtl ? ' rtl' : ''}`, async ({ page }) => {
      await gotoHub(page, '/keys');
      if (rtl) await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
      const frame = page.locator('[data-table-frame][data-table-cut]').first(); // reason: the Keys page has one table
      await expect(frame.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 }); // reason: any row; the table only has to have rendered
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse);
      const menu = frame.locator('tbody tr').last().getByRole('button', { name: 'Row actions' });
      await page.keyboard.press('Tab'); // a keyboard interaction first, so focus() below shows the ring (:focus-visible)
      await menu.focus();
      await expect(menu).toBeFocused();
      const g = await menu.evaluate((b) => {
        const f = b.closest<HTMLElement>('[data-table-frame]')!;
        f.scrollIntoView({ block: 'end' });
        const cs = getComputedStyle(b);
        // The kit's ring is a box-shadow (--focus-ring: a 2 px gap, then the 4 px ring): its reach is the largest spread.
        const spreads = [...cs.boxShadow.matchAll(/(-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/g)].map((m) => Number(m[4]));
        const ring = Math.max(0, ...spreads, cs.outlineStyle === 'none' ? 0 : Number.parseFloat(cs.outlineWidth) + Number.parseFloat(cs.outlineOffset));
        const r = b.getBoundingClientRect();
        const fr = f.getBoundingClientRect();
        const cut = Number.parseFloat(getComputedStyle(f).getPropertyValue('--table-cut'));
        const end = getComputedStyle(f).direction === 'rtl';
        const hit = (x: number) => f.contains(document.elementFromPoint(x, fr.bottom - 2));
        return {
          visible: b.hasAttribute('data-focus-visible') && ring > 0,
          x: end ? r.left - ring - fr.left : fr.right - (r.right + ring),
          y: fr.bottom - (r.bottom + ring),
          cut,
          end,
          // The corner pixel at the inline end is clipped away; the other bottom corner is the frame.
          clipped: { endCorner: hit(end ? fr.left + 2 : fr.right - 2), startCorner: hit(end ? fr.right - 2 : fr.left + 2) },
          mirrored: getComputedStyle(f.querySelector(':scope > [data-table-edge]')!).transform.startsWith('matrix(-1'),
        };
      });
      expect(g.end, 'the frame runs in the page direction').toBe(rtl);
      expect(g.clipped, 'the slant is at the inline end').toEqual({ endCorner: false, startCorner: true });
      expect(g.mirrored, 'the edge line is mirrored right to left').toBe(rtl);
      expect(g.visible, 'the focused ⋯ draws a ring').toBe(true);
      // A ring reaching past the frame's bottom is cut by the frame's edge as on any table (not the slant): the corner of
      // what is inside the frame must clear the slant.
      expect(g.x + Math.max(g.y, 0), `the ring's corner is ${g.x} + ${g.y} from the frame's, the cut is ${g.cut}`).toBeGreaterThanOrEqual(g.cut);
    });
  });
