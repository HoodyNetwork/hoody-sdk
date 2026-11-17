// Playwright: on a phone (390 × 844, touch) the floating action button never covers the last row or button of a page.
// For each page that floats its primary action: wait for the content, scroll the main area to its real end; the
// content's last interactive element must sit fully above the button, and the element at that element's centre
// must be itself (or inside it), never the button or any other overlay. Read-only content counts too: the lowest drawn
// leaf (a plan card's last fact row) also ends above the button.
import { type Page, expect, test } from '@playwright/test';
import { gotoHub } from '@app/e2e';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

interface Place {
  name: string;
  path: string;
  state?: string;
  /** The least number of interactive elements the loaded page has: fewer means it has not rendered its content. */
  min: number;
}

const PLACES: Place[] = [
  { name: 'billing', path: '/billing', min: 3 },
  { name: 'billing (many rows)', path: '/billing?view=wallet', state: 'many26', min: 3 },
  // The Plans view ends in plan cards whose last rows are read-only facts (Computers, CPU cores, Memory ...).
  { name: 'billing plans', path: '/billing?view=plans', min: 3 },
  // The Bots list, its row menus (⋯) last in each row, and the questions after the rows.
  { name: 'bots (many rows)', path: '/bots', min: 20 },
  { name: 'bots (partial)', path: '/bots', state: 'partial', min: 10 },
  // More pages that float their primary action on a phone.
  { name: 'keys', path: '/keys', min: 3 },
  { name: 'vault', path: '/vault', min: 3 },
  { name: 'computers', path: '/computers', min: 3 },
  { name: 'scripts', path: '/scripts', min: 3 },
  { name: 'notes', path: '/notes', min: 3 },
  { name: 'schedules', path: '/schedules', min: 3 },
  { name: 'tunnels', path: '/tunnels', min: 3 },
  { name: 'programs', path: '/programs', min: 3 },
];

/** Scrolls the main area to its end; true once it is there (a later layout shift moves it back, so it is polled). */
async function atEnd(page: Page): Promise<boolean> {
  return page.locator('#hub-main').evaluate((m) => {
    m.scrollTo({ top: m.scrollHeight });
    return m.scrollHeight - m.scrollTop - m.clientHeight <= 1;
  });
}

/** The floating button's box and the lowest interactive element of the main area (outside the button). */
async function measure(page: Page) {
  return page.evaluate(() => {
    const main = document.getElementById('hub-main');
    const fab = document.querySelector<HTMLElement>('[class*="fab"]');
    if (!main || !fab) return null;
    const fr = fab.getBoundingClientRect();
    const els = [...main.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role=button], [role=tab], [role=row]')].filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !fab.contains(e);
    });
    let last: HTMLElement | null = null;
    for (const e of els) if (!last || e.getBoundingClientRect().bottom > last.getBoundingClientRect().bottom) last = e;
    // The lowest drawn leaf of any kind (text, a fact row's value), read-only content included.
    let leafBottom = 0;
    let leafName = '';
    // A leaf with text or a picture, as drawn: cut by every clipping box between it and the main area (a visually hidden
    // label, a collapsed panel and a scroller's hidden overflow are not drawn there).
    for (const e of main.querySelectorAll<HTMLElement>('*')) {
      if (e.childElementCount > 0 && !(e instanceof SVGElement)) continue;
      if (fab.contains(e) || !(e.textContent?.trim() || e.tagName === 'svg' || e.tagName === 'IMG')) continue;
      const r = e.getBoundingClientRect();
      let top = r.top;
      let bottom = r.bottom;
      for (let a = e.parentElement; a && a !== main; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.clipPath !== 'none' || cs.clip !== 'auto') bottom = top;
        if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') {
          const ar = a.getBoundingClientRect();
          top = Math.max(top, ar.top);
          bottom = Math.min(bottom, ar.bottom);
        }
      }
      if (bottom - top < 2 || r.width < 2 || getComputedStyle(e).visibility === 'hidden') continue;
      if (bottom > leafBottom) [leafBottom, leafName] = [bottom, (e.textContent || e.tagName).trim().slice(0, 40)];
    }
    if (!last) return { count: 0, fabTop: Math.round(fr.top), lastBottom: 0, lastName: '', reachable: false, hitName: '', leafBottom: Math.round(leafBottom), leafName };
    const lr = last.getBoundingClientRect();
    // The element's own centre, unclamped: off the screen is a failure of its own, not a point to move.
    const hit = document.elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2);
    const hitName = hit ? `<${hit.tagName.toLowerCase()} class="${String(hit.className).slice(0, 60)}">` : 'nothing (off the screen)';
    return {
      count: els.length,
      fabTop: Math.round(fr.top),
      lastBottom: Math.round(lr.bottom),
      lastName: (last.innerText || last.getAttribute('aria-label') || last.tagName).trim().slice(0, 40),
      reachable: !!hit && (hit === last || last.contains(hit)),
      hitName,
      leafBottom: Math.round(leafBottom),
      leafName,
    };
  });
}

for (const place of PLACES) {
  test(`@fabroom ${place.name}: the last row stays reachable above the floating action at 390`, async ({ page }) => {
    await gotoHub(page, place.path, { state: place.state });
    await expect(page.locator('[class*="fab"]').first(), 'the page floats its primary action').toBeVisible();
    await expect.poll(async () => (await measure(page))?.count ?? 0, { message: `the page has rendered its content (at least ${place.min} controls)` }).toBeGreaterThanOrEqual(place.min);
    await expect.poll(() => atEnd(page), { message: 'the main area is scrolled to its real end' }).toBe(true);
    const m = await measure(page);
    expect(m?.count, 'content with a last interactive element').toBeGreaterThan(0);
    expect(m?.reachable, `"${m?.lastName}" is the element at its own centre, not ${m?.hitName}`).toBe(true);
    expect(m?.lastBottom ?? Infinity, `"${m?.lastName}" ends above the floating action (top ${m?.fabTop})`).toBeLessThanOrEqual(m?.fabTop ?? 0);
    expect(m?.leafBottom ?? Infinity, `the last content "${m?.leafName}" ends above the floating action (top ${m?.fabTop})`).toBeLessThanOrEqual(m?.fabTop ?? 0);
  });
}
