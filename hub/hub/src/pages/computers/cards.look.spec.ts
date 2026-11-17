// Playwright: the Computers cards as drawn, in both themes. Each card is an article on a
// 420 px grid, its name clamped to 2 lines (never an ellipsis on one), its head, body and footer greys and its state tags
// (the kit StatusPill) are the tokens' (light also checks the spec's literal values), and its frame is the kit CutFrame: one 1 px path with a
// 16 px slanted bottom-right corner, drawn to the card's own size at 1350 and 2400 px (continuous: the path meets every
// edge of the card). Every footer button shows its whole word. At 390 the cards fill the width without a sideways scroll. Computed styles need a real browser.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';

// The state tags are the kit StatusPill (a mono caps tag): ok and bad tones of the one tone map.
const LIGHT = { head: 'rgb(233, 233, 233)', body: 'rgb(243, 243, 243)', headBad: 'rgb(240, 224, 220)', runBg: 'rgb(214, 248, 226)', failBg: 'rgb(255, 224, 218)', failInk: 'rgb(183, 25, 2)' };

/** A token's colour as the browser resolves it in the current theme. */
async function token(page: Page, name: string) {
  return page.evaluate((n) => {
    const d = document.createElement('div');
    d.style.setProperty('background', `var(${n})`);
    document.body.append(d);
    const v = getComputedStyle(d).backgroundColor;
    d.remove();
    return v;
  }, name);
}

const cards = (page: Page) => page.getByRole('table', { name: 'Computers' }).locator('article');
const card = (page: Page, name: string) => page.getByRole('article', { name, exact: true });
const part = (c: Locator, p: 'head' | 'foot') => c.locator(`[data-part="${p}"]`);
// The body grey is the clipped inner box's own background (head and footer draw theirs over it).
const inner = (c: Locator) => c.locator(':scope > div').first();
const bg = (l: Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);

/** Every worded button in the card's footer shows its whole word (nothing inside it scrolls or ellipsizes). */
async function wordsWhole(c: Locator) {
  return c.locator('[data-part="foot"] button').evaluateAll((bs) => bs.filter((b) => (b.textContent ?? '').trim()).every((b) => [b, ...b.querySelectorAll('*')].every((e) => e.scrollWidth <= e.clientWidth + 1)));
}

async function open(page: Page, theme: 'light' | 'dark', state?: string) {
  await gotoHub(page, '/computers', { theme, ...(state ? { state } : {}) });
  await choosePresentation(page.locator('#hub-main'), 'cards');
  await expect(cards(page).first()).toBeVisible({ timeout: 15_000 });
}

/** The frame's path against the card's own box: its numbers are the box's (half-pixel line, 16 px cut). */
async function frame(c: Locator) {
  return c.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const svg = el.querySelector('svg[data-cut-edge]') as SVGSVGElement | null;
    const path = svg?.querySelector('path');
    const sr = svg?.getBoundingClientRect();
    const inner = el.firstElementChild as HTMLElement;
    return { w: r.width, h: r.height, fw: Math.floor(r.width), fh: Math.floor(r.height), iw: inner.offsetWidth, ih: inner.offsetHeight, d: path?.getAttribute('d') ?? '', svg: sr ? { x: sr.x - r.x, y: sr.y - r.y, w: sr.width, h: sr.height } : null, clip: getComputedStyle(el.firstElementChild as Element).clipPath };
  });
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1350, 2400]) {
    test.describe(`cards at ${width} (${theme})`, () => {
      test.use({ viewport: { width, height: 1000 } });

      test(`cards on a 420 px grid, 2-line names, token greys and tags, a continuous cut frame (${width}, ${theme})`, async ({ page }) => {
        await open(page, theme);
        const all = await cards(page).all();
        expect(all.length).toBeGreaterThan(2);
        // The grid: each card at least 420 px wide, several to a row at these widths.
        const tbody = page.getByRole('table', { name: 'Computers' }).locator('tbody');
        const cols = await tbody.evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').map(parseFloat));
        expect(cols.length).toBeGreaterThan(1);
        for (const w of cols) expect(w).toBeGreaterThanOrEqual(420);
        expect(await tbody.evaluate((e) => getComputedStyle(e).columnGap)).toBe('12px');

        // The name: the whole name in its title, clamped to 2 lines, never a one-line ellipsis.
        const h = card(page, 'atlas').getByRole('heading', { name: 'atlas' });
        const clamp = await h.evaluate((e) => { const c = getComputedStyle(e); return { clamp: c.getPropertyValue('-webkit-line-clamp'), ws: c.whiteSpace, title: e.getAttribute('title') }; });
        expect(clamp.clamp).toBe('2');
        expect(clamp.ws).not.toBe('nowrap');
        expect(clamp.title).toBe('atlas');

        // Greys and tags are the tokens'.
        const run = card(page, 'atlas');
        expect(await bg(part(run, 'head'))).toBe(await token(page, '--hx-cc-head'));
        expect(await bg(part(run, 'foot'))).toBe(await token(page, '--hx-cc-head'));
        expect(await bg(inner(run))).toBe(await token(page, '--hx-cc-body'));
        expect(await bg(run.locator('[data-tone="run"] > span'))).toBe(await token(page, '--hx-tag-ok-bg'));
        const bad = card(page, 'ember');
        expect(await bad.getAttribute('data-bad')).toBe('');
        expect(await bg(part(bad, 'head'))).toBe(await token(page, '--hx-cc-head-bad'));
        const fail = bad.locator('[data-tone="fail"] > span');
        expect(await bg(fail)).toBe(await token(page, '--hx-tag-bad-bg'));
        if (theme === 'light') {
          expect(await bg(part(run, 'head'))).toBe(LIGHT.head);
          expect(await bg(inner(run))).toBe(LIGHT.body);
          expect(await bg(part(bad, 'head'))).toBe(LIGHT.headBad);
          expect(await bg(run.locator('[data-tone="run"] > span'))).toBe(LIGHT.runBg);
          expect(await bg(fail)).toBe(LIGHT.failBg);
          expect(await fail.evaluate((e) => getComputedStyle(e).color)).toBe(LIGHT.failInk);
        }

        // The frame on every card: the svg covers the card, the path is the card's own outline with the 16 px cut, and the
        // content is clipped to the same corner.
        for (const c of all) {
          const f = await frame(c);
          expect(f.svg).not.toBeNull();
          expect(Math.abs(f.svg!.x) + Math.abs(f.svg!.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(f.svg!.w - f.w)).toBeLessThanOrEqual(1);
          expect(Math.abs(f.svg!.h - f.h)).toBeLessThanOrEqual(1);
          const n = f.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
          // The drawn corner path, exactly, on the box it is drawn for: M0.5 0.5 H(w-.5) V(h-16.5) L(w-16.5) (h-.5) H0.5 Z,
          // where w × h is the card's layout box floored (a fractional box is never rounded up, so the line on the half
          // pixel stays inside the clip).
          expect(n).toEqual([0.5, 0.5, f.fw - 0.5, f.fh - 16.5, f.fw - 16.5, f.fh - 0.5, 0.5]);
          expect(Math.abs(f.iw - f.w)).toBeLessThanOrEqual(1);
          expect(Math.abs(f.ih - f.h)).toBeLessThanOrEqual(1);
          expect(f.clip).toContain('polygon');
          expect(await wordsWhole(c)).toBe(true);
        }
        // Keyboard focus keeps the card stretched to its row: the focused card's cell stays a column and
        // its article fills the row, so its footer stays level with its neighbours'.
        const row = all[0]!.locator('xpath=ancestor::tr[1]');
        const fill = () => row.evaluate((tr) => { const td = tr.querySelector('td')!; const art = tr.querySelector('article')!; return { display: getComputedStyle(td).display, gap: Math.round(td.getBoundingClientRect().bottom - art.getBoundingClientRect().bottom) }; });
        const before = await fill();
        await row.focus();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowLeft');
        await expect(row).toBeFocused();
        expect(await row.evaluate((tr) => tr.matches(':focus-visible'))).toBe(true);
        const after = await fill();
        expect(after.display).toBe('flex');
        expect(after.gap).toBe(before.gap);
        expect(after.gap).toBeLessThanOrEqual(1);
        await noSideScroll(page);
        await page.screenshot({ path: test.info().outputPath(`computers-d5-${width}-${theme}.png`), fullPage: true });
      });
    });
  }

  // On a phone every footer control of a failed, stopped and paused card, with the long
  // access wording, sits inside the visible (clipped) card and takes a press: the footer wraps instead of clipping.
  test.describe(`card footers on a phone at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test(`every footer control is inside its card and pressable (390 touch, ${theme})`, async ({ page }) => {
      await open(page, theme, 'cardsLongAccess');
      await expect(card(page, 'ember').getByRole('button', { name: /Has access rules/ })).toHaveText(/Has access rules/i);
      for (const name of ['ember', 'cedar', 'fjord', 'atlas']) {
        const c = card(page, name);
        await c.scrollIntoViewIfNeeded();
        const controls = c.locator('[data-part="foot"] button');
        expect(await controls.count()).toBeGreaterThanOrEqual(2);
        for (const b of await controls.all()) {
          await b.scrollIntoViewIfNeeded();
          const res = await b.evaluate((el) => {
            const art = el.closest('article')!;
            const box = (art.firstElementChild as HTMLElement).getBoundingClientRect(); // the clipped inner box
            const r = el.getBoundingClientRect();
            const inside = r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom - 16 + 0.5;
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { inside, pressable: !!hit && (hit === el || el.contains(hit)), w: r.width, h: r.height };
          });
          expect(res.inside, `${name}: a footer control lies outside the card`).toBe(true);
          expect(res.pressable, `${name}: a footer control is covered`).toBe(true);
          expect(res.h).toBeGreaterThanOrEqual(32);
        }
        expect(await wordsWhole(c)).toBe(true);
      }
      await page.screenshot({ path: test.info().outputPath(`computers-d5-390-foot-${theme}.png`), fullPage: true });
    });
  });

  test.describe(`cards at 390 (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 900 } });

    test(`one card per row, inside the page, with no sideways scroll (390, ${theme})`, async ({ page }) => {
      await open(page, theme);
      const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
      for (const c of await cards(page).all()) {
        const box = (await c.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(pageWidth + 0.5);
        const f = await frame(c);
        expect(Math.abs(f.svg!.w - f.w)).toBeLessThanOrEqual(1);
        expect(await wordsWhole(c)).toBe(true);
      }
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`computers-d5-390-${theme}.png`), fullPage: true });
    });
  });
}
