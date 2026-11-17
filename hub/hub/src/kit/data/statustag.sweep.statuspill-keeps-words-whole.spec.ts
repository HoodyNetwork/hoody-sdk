// Playwright: the mono capitals of the "Mono caps tag" are wider than the sentence-case words they replace,
// and a StatusPill never wraps. On every page's default fixture, at a desktop and a phone width, each StatusPill keeps
// its words whole (nothing clipped inside it) and is not cut by a box that hides its overflow (a scroller is fine: the
// pill is reached by scrolling). Only Hub-written pills are swept: a Tag may hold a person's name and may end in an ellipsis.
import { expect, test, type Page } from '@playwright/test';
import { gotoHub } from '@app/e2e';

/** No pill is excused: the Account SSH keys' "No key" was cut by the old phone list view's
 *  field rule; the section is a table at 390 now and the pill sits whole in its cell. A pill this sweep finds cut is a
 *  real one to fix, never a row to add here. */
const KNOWN = new Set<string>([]);

const PAGES = [
  '/home', '/computers', '/bots', '/logs?src=everything', '/scripts', '/schedules', '/programs', '/tunnels', '/apps',
  '/files', '/vault', '/keys', '/notes', '/notifications', '/billing', '/market', '/support', '/realms', '/referrals',
  '/account', '/ai',
];

for (const width of [1350, 390]) {
  test(`every StatusPill keeps its words whole at ${width}`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width, height: 900 });
    let seen = 0;
    const cut: string[] = [];
    for (const path of PAGES) {
      await gotoHub(page, path);
      await page.waitForTimeout(400); // reason: let a page's first fixture read paint its rows; nothing to wait on by name across 21 pages
      // A table sizes its columns after its rows paint (the Market's, reached by same-document navigation, had not at
      // 400 ms): the pills are judged only once their words and boxes hold still for three reads 250 ms apart (half a
      // second), and a page that never settles in 4 s fails here rather than being judged mid-layout.
      let rows = await read(page);
      let still = 0;
      for (let i = 0; i < 16 && still < 2; i++) {
        await page.waitForTimeout(250); // reason: a settle check across 21 pages; no one element to wait on by name
        const again = await read(page);
        still = JSON.stringify(again) === JSON.stringify(rows) ? still + 1 : 0;
        rows = again;
      }
      expect(still, `${width} ${path}: the pills settle (words and boxes unchanged for half a second)`).toBe(2);
      seen += rows.length;
      for (const r of rows) {
        if (r.whole && !r.hiddenBy) continue;
        const what = `${path} "${r.text}"${r.whole ? '' : ' clipped inside'}${r.hiddenBy ? ` cut by ${r.hiddenBy.replace(/_[\w-]{5}$/, '')}` : ''}`;
        if (!KNOWN.has(`${width} ${what}`)) cut.push(what);
      }
    }
    expect(seen, 'pills found across the pages').toBeGreaterThan(10);
    expect(cut, `pills cut at ${width}px`).toEqual([]);
  });
}

/** Every Hub-written StatusPill in the main region that draws: its words, whether they fit inside it, and the box that
 *  hides its overflow and cuts it, if any, and its box. */
function read(page: Page) {
  return page.evaluate(() => {
    const pill = /^Display-module__pill_[\w-]{5}$/;
    const out: { text: string; whole: boolean; hiddenBy: string | null; box: number[] }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('#hub-main [class*="Display-module__pill_"]')) {
      if (![...el.classList].some((c) => pill.test(c))) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      let hiddenBy: string | null = null;
      for (let a = el.parentElement; a && a.id !== 'hub-main'; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (!/hidden|clip/.test(cs.overflowX)) continue;
        const b = a.getBoundingClientRect();
        if (r.left < b.left - 0.5 || r.right > b.right + 0.5) { hiddenBy = `${a.tagName.toLowerCase()}.${[...a.classList].join('.')}`; break; }
      }
      // box: where it is drawn, to the half pixel; the settle check compares it, the verdict does not read it.
      const box = [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 2) / 2);
      out.push({ text: (el.textContent ?? '').trim(), whole: el.scrollWidth <= el.clientWidth + 0.5, hiddenBy, box });
    }
    return out;
  });
}
