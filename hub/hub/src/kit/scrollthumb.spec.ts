// Playwright: the scrollbar thumb is seen, in the design's
// whisper bar. The API page's endpoint table, a long list, at desk and phone width in both themes: its
// scroller overflows and, in Chromium, draws the kit's 7 px ::-webkit-scrollbar (the standard scrollbar-width and
// -color back to auto, which the pseudo-elements need) with the thumb in --hx-scroll-thumb (a colour of its own, not a
// hairline) and a darker --hx-scroll-thumb-hover; a screenshot of it is kept for the eye.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** In the page: the table's scroller (the nearest ancestor that scrolls), its overflow, and the thumb colour it draws
 *  next to the token's own, both as the browser resolves them. */
const scrollerFacts = (table: HTMLElement) => {
  let el: HTMLElement | null = table.parentElement;
  while (el && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)) el = el.parentElement;
  if (!el) return null;
  el.setAttribute('data-scroll-probe', '');
  const probe = document.createElement('i');
  probe.style.color = 'var(--hx-scroll-thumb)';
  document.body.append(probe);
  const token = getComputedStyle(probe).color;
  probe.remove();
  const thumb = getComputedStyle(el, '::-webkit-scrollbar-thumb');
  return { overflows: el.scrollHeight > el.clientHeight, width: getComputedStyle(el).scrollbarWidth, color: getComputedStyle(el).scrollbarColor, thumb: thumb.backgroundColor, token };
};
/** In the page: the probed scroller's vertical bar strip, in viewport pixels (its width 0 where nothing is drawn). */
const barStrip = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const bar = el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
  return { x: r.left + el.clientLeft + el.clientWidth, y: r.top + el.clientTop, width: bar, height: el.clientHeight };
};
/** In the page: the strip's painted thumb, read from its screenshot (a PNG decoded on a canvas): how many of its pixel
 *  rows hold a pixel clearly off the strip's own commonest colour (its track). A hidden or unpainted bar gives 0. */
const thumbRows = async (b64: string) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [img.naturalWidth, img.naturalHeight];
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const png = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const at = (x: number, y: number) => { const i = (y * png.width + x) * 4; return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!]; };
  const tally = new Map<string, number>();
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) { const k = at(x, y).join(); tally.set(k, (tally.get(k) ?? 0) + 1); }
  const track = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]![0].split(',').map(Number);
  let rows = 0;
  for (let y = 0; y < png.height; y++) {
    let off = false;
    for (let x = 0; x < png.width && !off; x++) off = at(x, y).some((c, i) => Math.abs(c - track[i]!) >= 24);
    if (off) rows++;
  }
  return rows;
};
const alphaOf = (c: string) => {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  const parts = m ? m[1]!.split(/[\s,/]+/).filter(Boolean) : [];
  return parts.length === 4 ? Number(parts[3]) : 1;
};

// Headless Chromium hides scrollbars by default (--hide-scrollbars): drop that so the screenshot shows the bar a person sees.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

async function open(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/api', { theme });
  // The catalog is its own lazy chunk (about 330 KB of JSON).
  await expect(page.getByRole('table').locator('tbody tr').first()).toBeVisible({ timeout: 30_000 }); // reason: any row; the table only has to have rendered
}

for (const width of [1350, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`the API table scroller shows its thumb at ${width}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
      await open(page, theme);
      const facts = await page.getByRole('table').evaluate(scrollerFacts);
      expect(facts, 'the table has a scroller that overflows').not.toBeNull();
      expect(facts!.overflows).toBe(true);
      // Chromium: the standard properties are back to auto, so the ::-webkit-scrollbar pseudo-elements draw the bar.
      expect(facts!.width).toBe('auto');
      expect(facts!.color).toBe('auto');
      // The thumb is the token's colour, and that colour is a real one (a hairline's 5% was not seen).
      expect(facts!.thumb, `${facts!.thumb} is ${facts!.token}`).toBe(facts!.token);
      expect(alphaOf(facts!.token)).toBeGreaterThanOrEqual(0.25);
      // A third of the way down, so the thumb sits inside its track; the viewport, since an element screenshot leaves
      // out the element's own scrollbar (at 390 the scroller is the page's main).
      await page.locator('[data-scroll-probe]').evaluate((el) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) / 3 }));
      await page.screenshot({ path: test.info().outputPath(`scroller-${width}-${theme}.png`), animations: 'disabled' });
      // And the pixels: the bar has room, and a thumb is painted in it (24+ levels off its track, 8+ px tall).
      const strip = await page.locator('[data-scroll-probe]').evaluate(barStrip);
      expect(strip.width, 'the bar is the whisper bar, 7 px').toBe(7);
      const shot = await page.screenshot({ clip: strip, animations: 'disabled' });
      expect(await page.evaluate(thumbRows, shot.toString('base64')), 'a thumb is painted in the bar').toBeGreaterThanOrEqual(8);
      // Hovered, the thumb darkens to its own token (stronger than the resting one).
      const hover = await page.locator('[data-scroll-probe]').evaluate(() => {
        const probe = document.createElement('i');
        probe.style.color = 'var(--hx-scroll-thumb-hover)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      expect(alphaOf(hover), `the hover thumb ${hover} is stronger than ${facts!.token}`).toBeGreaterThan(alphaOf(facts!.token));
      const sheet = await page.evaluate(() => [...document.styleSheets].some((sh) => { try { return [...sh.cssRules].some((r) => r.cssText.includes('::-webkit-scrollbar-thumb:hover') && r.cssText.includes('--hx-scroll-thumb-hover')); } catch { return false; } }));
      expect(sheet, 'the kit styles the hovered thumb with --hx-scroll-thumb-hover').toBe(true);
    });
  }
}
