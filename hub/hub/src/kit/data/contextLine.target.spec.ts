// Playwright: a ContextLine's linked parts (realm, computer, server) are tap targets of exactly 24 x 24
// CSS px or more (WCAG 2.5.8) on a fine pointer, 24 px high, and --touch-min (44 px) high on a coarse one, while the line
// itself stays one 20 px line on both: the target grows inside the line's box, so nothing around it moves. A part
// without a link is text and keeps the line's height. A box is a target only where it is hit: each linked part answers
// elementFromPoint at its four edges and its centre (a clamped or overlapped box fails), and no two linked boxes
// overlap. Measured on the kit gallery (both examples, linked and unlinked parts, wide and narrow) and on Home (with
// and without the phone "What is Hoody?" control under the line), then axe target-size on each line.
import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

const LINE = 20;
const CONTEXT = 'p[class*="context"]'; // CSS: the kit ContextLine is a plain paragraph with no role

/** Every shown ContextLine: its box and computed line height, whether it is the gallery's narrow example, and each
 *  part's box, link or not. A linked part is scrolled into view and probed at 1 px inside each edge and at its centre:
 *  `misses` names what elementFromPoint found instead of the link. The probes scroll the page's own scroller, so every
 *  box is measured afterwards, in one scroll position. */
async function lines(page: Page) {
  return page.evaluate((sel) => {
    const shown = [...document.querySelectorAll<HTMLElement>(sel)].filter((p) => p.getClientRects().length > 0);
    const name = (el: Element | null) => (el ? `${el.tagName.toLowerCase()}.${el.className}` : 'nothing');
    const misses = new Map<HTMLElement, string[]>();
    for (const el of shown.flatMap((p) => [...p.querySelectorAll<HTMLElement>('a[href][class*="ctxLink"]')])) {
      const miss: string[] = [];
      misses.set(el, miss);
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const points: Array<[string, number, number]> = [
        ['top', cx, b.top + 1],
        ['bottom', cx, b.bottom - 1],
        ['left', b.left + 1, cy],
        ['right', b.right - 1, cy],
        ['centre', cx, cy],
      ];
      for (const [at, x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || hit.closest('a') !== el) miss.push(`${at}: ${name(hit)}`);
      }
    }
    return shown.map((p) => {
      const r = p.getBoundingClientRect();
      return {
        h: r.height,
        lh: getComputedStyle(p).lineHeight,
        narrow: !!p.closest('[class*="narrowLine"]'),
        parts: [...p.querySelectorAll<HTMLElement>('[class*="ctxLink"]')].map((el) => {
          const b = el.getBoundingClientRect();
          return { name: el.textContent?.trim() ?? '', linked: el.matches('a[href]'), misses: misses.get(el) ?? [], w: b.width, h: b.height, x: b.left, y: b.top };
        }),
      };
    });
  }, CONTEXT);
}

const targetSize = async (page: Page) =>
  (await new AxeBuilder({ page }).include(CONTEXT).withRules(['target-size']).analyze()).violations.flatMap((v) => v.nodes.map((n) => n.html));

type Box = { name: string; x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The lines hold linked parts exactly `hit` high (at least 24 wide), each hit at its edges and centre, none
 *  overlapping another, and unlinked parts at the line's height, in a line box of exactly 20 px. */
async function expectTargets(page: Page, hit: number, needUnlinked: boolean) {
  const all = await lines(page);
  expect(all.length, 'a ContextLine is shown').toBeGreaterThan(0);
  const parts = all.flatMap((l) => l.parts);
  expect(parts.some((p) => p.linked), JSON.stringify(all)).toBe(true);
  if (needUnlinked) expect(parts.some((p) => !p.linked), JSON.stringify(all)).toBe(true);
  for (const l of all) {
    expect(l.h, `line box ${JSON.stringify(l)}`).toBe(LINE);
    expect(l.lh, `line height ${JSON.stringify(l)}`).toBe(`${LINE}px`);
  }
  const linked = parts.filter((p) => p.linked);
  for (const p of parts) {
    if (p.linked) {
      expect(p.h, `${p.name} height`).toBe(hit);
      expect(p.w, `${p.name} width`).toBeGreaterThanOrEqual(24);
      expect(p.misses, `${p.name} is hit at its edges and centre`).toEqual([]);
    } else {
      expect(p.h, `${p.name} (no link) height`).toBe(LINE);
    }
  }
  const crossed = linked.flatMap((a, i) => linked.slice(i + 1).filter((b) => overlap(a, b)).map((b) => `${a.name} x ${b.name}`));
  expect(crossed, 'no two linked boxes overlap').toEqual([]);
  expect(await targetSize(page)).toEqual([]);
  return all;
}

const pointer = (page: Page, kind: 'fine' | 'coarse') => page.evaluate((k) => matchMedia(`(pointer: ${k})`).matches, kind);

/** The gallery shows both examples: the wide line and the narrow one. */
async function gallery(page: Page) {
  await gotoHub(page, '/_kit?tab=text');
  await page.locator(CONTEXT).first().waitFor({ timeout: 30_000 });
}
const bothExamples = (all: Array<{ narrow: boolean }>) => expect(all.map((l) => l.narrow).sort(), 'the wide and the narrow example').toEqual([false, true]);

async function home(page: Page, path = '/home') {
  await gotoHub(page, path);
  await expect(page.locator(`${CONTEXT} a[href]`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
}
/** The phone "What is Hoody?" control under the line (Home's header context row). */
const reopenUnderLine = (page: Page) => page.locator('[data-home-reopen][data-home-header]:visible');

test.describe('ContextLine targets on a fine pointer at 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('@ctxline the gallery lines: linked parts 24 px high and hit, text parts and the line box 20 px', async ({ page }) => {
    await gallery(page);
    expect(await pointer(page, 'fine')).toBe(true);
    bothExamples(await expectTargets(page, 24, true));
  });
  test('@ctxline Home: linked parts 24 px high and hit, the line box 20 px', async ({ page }) => {
    await home(page);
    expect(await pointer(page, 'fine')).toBe(true);
    await expectTargets(page, 24, false);
  });
});

test.describe('ContextLine targets on a coarse pointer at 390', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('@ctxline the gallery lines: linked parts 44 px high and hit, never overlapping, text parts and the line box 20 px', async ({ page }) => {
    await gallery(page);
    expect(await pointer(page, 'coarse')).toBe(true);
    bothExamples(await expectTargets(page, 44, true));
  });
  test('@ctxline Home with "What is Hoody?" under the line: linked parts 44 px high and hit, the line box 20 px', async ({ page }) => {
    await home(page);
    expect(await pointer(page, 'coarse')).toBe(true);
    await expect(reopenUnderLine(page)).toHaveCount(1);
    await expectTargets(page, 44, false);
  });
  test('@ctxline Home without "What is Hoody?" (Welcome open): linked parts 44 px high and hit, the line box 20 px', async ({ page }) => {
    await home(page, '/home?intro=1');
    expect(await pointer(page, 'coarse')).toBe(true);
    await expect(reopenUnderLine(page)).toHaveCount(0);
    await expectTargets(page, 44, false);
  });
});
