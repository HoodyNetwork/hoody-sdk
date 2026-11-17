// Playwright: no page scrolls past its end. The shell owns scrolling (#hub-main is the one scroll container), so on every
// page, and on every tab of a page's own tab list, in its default fixture state at 1350x900, 1350x700 and 390x800:
// - the document itself never scrolls (a box placed against the viewport, deep in the content, once let it scroll a
//   second time past the page's end: AppShell.module.css `.main` is their containing block);
// - #hub-main scrolls no further than the bottom of the page's own boxes (their padding included), or of its last
//   visible content plus LEAF_ROOM where content overflows a fixed-height page box, plus main's own end padding (the
//   phone bar's strip and the action button's room), within OVERHANG px. A taller scroll means something hangs out
//   below the page: a stray min-height, an unclipped hidden element, an off-screen part kept in the layout.
// The pages are read from the same sources as allpages.axe.spec.ts (every pages/<id>/page.ts), which also checks that
// walk against the router's own list.
import fs from 'node:fs';
import path from 'node:path';
import { type Page, expect, test } from '@playwright/test';
import { hubUrl } from '@app/e2e';
import kit from '@kit/strings.en.json';

const SRC = [path.resolve('hub/src'), path.resolve('src')].find((d) => fs.existsSync(path.join(d, 'pages'))) ?? path.resolve('hub/src');
/** demo is the page template's sample, whose card throws on purpose (app/pages.ts). */
const EXCLUDED = new Set(['demo']);
const SIZES = [
  { width: 1350, height: 900 },
  { width: 1350, height: 700 },
  { width: 390, height: 800 },
];
/** Sub-pixel rounding of the measured boxes. */
const OVERHANG = 2;
/** Room under the last visible content (text, icon, control) when the page's content overflows its own box: the page's
 *  end padding (--sp-9) plus a part's inner padding (a card, a table cell, a question row). */
const LEAF_ROOM = 128;
/** Tabs judged per page (each one re-measured after it is selected). */
const MAX_TABS = 8;

const pathOf = (file: string) => /\bpath:\s*['"]([^'"]+)['"]/.exec(fs.readFileSync(file, 'utf8'))?.[1] ?? '';
const pages = fs
  .readdirSync(path.join(SRC, 'pages'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !EXCLUDED.has(d.name) && fs.existsSync(path.join(SRC, 'pages', d.name, 'page.ts')))
  .map((d) => ({ id: d.name, path: pathOf(path.join(SRC, 'pages', d.name, 'page.ts')) }))
  .sort((a, b) => a.id.localeCompare(b.id));

const SHOWN = '[data-hub-page]:not([data-hub-page-hidden])';

interface Measure {
  docOver: number;
  mainScroll: number;
  mainClient: number;
  allowed: number;
  tallest: string;
}

/** The document's scroll past the viewport, and main's scroll against the bottom its page's boxes allow. */
async function measure(page: Page): Promise<Measure | null> {
  // null while the document is replaced (a dev server reload) or main is not drawn yet: the poll in judge() reads again.
  return page.evaluate(({ shown, leafRoom }) => {
    const main = document.getElementById('hub-main');
    if (!main) return null;
    const top = main.getBoundingClientRect().top - main.scrollTop;
    let bottom = 0;
    for (const slot of main.querySelectorAll(shown))
      for (const child of slot.children) {
        const r = child.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        bottom = Math.max(bottom, r.bottom - top + parseFloat(getComputedStyle(child).marginBlockEnd || '0'));
        for (const leaf of child.querySelectorAll('*')) {
          if (leaf.childElementCount > 0 && leaf.tagName !== 'svg') continue;
          const lr = leaf.getBoundingClientRect();
          if (lr.width <= 2 || lr.height <= 2 || getComputedStyle(leaf).visibility === 'hidden') continue;
          if (!leaf.textContent?.trim() && !/^(svg|img|input|textarea|select|canvas|video|button)$/i.test(leaf.tagName)) continue;
          bottom = Math.max(bottom, lr.bottom - top + leafRoom);
        }
      }
    // The element reaching lowest in main, named for the failure message.
    let low = 0;
    let tallest = '';
    for (const el of main.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.bottom - top > low) {
        low = r.bottom - top;
        tallest = `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]} bottom ${Math.round(low)}`;
      }
    }
    const scroller = document.scrollingElement ?? document.documentElement;
    return {
      docOver: scroller.scrollHeight - innerHeight,
      mainScroll: main.scrollHeight,
      mainClient: main.clientHeight,
      allowed: Math.ceil(bottom + parseFloat(getComputedStyle(main).paddingBlockEnd)),
      tallest,
    };
  }, { shown: SHOWN, leafRoom: LEAF_ROOM }).catch(() => null);
}

async function judge(page: Page, where: string) {
  // Let late layout (fonts, measured parts) settle: two equal readings in a row.
  let m = await measure(page);
  await expect
    .poll(async () => {
      const next = await measure(page);
      if (!next || !m) {
        m = next;
        return false;
      }
      const same = next.mainScroll === m.mainScroll && next.docOver === m.docOver && next.allowed === m.allowed;
      m = next;
      return same;
    })
    .toBe(true);
  if (!m) throw new Error(`${where}: #hub-main never settled`);
  expect(m.docOver, `${where}: the document scrolls (only #hub-main may)`).toBeLessThanOrEqual(0);
  expect(m.mainScroll, `${where}: #hub-main scrolls past the page's end (lowest: ${m.tallest})`).toBeLessThanOrEqual(Math.max(m.mainClient, m.allowed) + OVERHANG);
}

test.describe('no page scrolls past its end', () => {
  test.describe.configure({ mode: 'default', timeout: 240_000 });

  for (const p of pages)
    test(`${p.id} (${p.path})`, async ({ page }) => {
      for (const size of SIZES) {
        await page.setViewportSize(size);
        // preview=1 serves any page still in preview (none today), as the test host does.
        await page.goto(hubUrl(p.path).replace('/?', '/?preview=1&'));
        await page.locator('#hub-main').waitFor();
        await expect(page.locator(SHOWN).first()).toBeAttached({ timeout: 30_000 });
        await expect(page.locator('[data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
        await expect(page.getByText(kit['page.loadError']), `${p.path} rendered without a page error`).toHaveCount(0);
        const at = `${p.path} at ${size.width}x${size.height}`;
        await judge(page, at);
        const tabs = page.locator(`${SHOWN} [role="tablist"]`).first().locator('[role="tab"]');
        const n = Math.min(await tabs.count(), MAX_TABS);
        for (let i = 0; i < n; i++) {
          const tab = tabs.nth(i);
          if (!(await tab.isVisible()) || (await tab.getAttribute('aria-disabled')) === 'true') continue;
          const name = ((await tab.textContent()) ?? '').trim();
          await tab.click();
          await expect(page.locator('[data-skeleton]')).toHaveCount(0, { timeout: 20_000 });
          await judge(page, `${at}, tab "${name}"`);
        }
      }
    });
});
