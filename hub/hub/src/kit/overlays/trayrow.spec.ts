// Playwright: on a very short phone screen the tray keeps one whole row in its
// body. A two-line row (label + description or reason, 44 px with a mouse) once met a one-token-row floor (32 px), so the
// body's own scrollport cut it below about 110 px of viewport height. Now a menu with such a row (data-two-line) has a
// dialog floor of --tray-row (the taller of a token row and a two-line row) and, below that, the tray scrolls whole:
// every row fits the body's scrollport. A menu of one-line rows keeps the one-token floor (traytoast t9 pins it).
import { type Page, expect, test } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import gallery from '../gallery/overlays.strings.en.json';
import overlays from './strings.en.json';

const GALLERY = '/_kit?tab=overlays';

async function openRowMenu(page: Page) {
  await gotoHub(page, GALLERY);
  const btn = page.getByRole('button', { name: gallery['btn.menu'], exact: true });
  await btn.scrollIntoViewIfNeeded();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-hub-tray]')).toBeVisible();
}

/** The body's scrollport height and the menu's block padding, and the tallest row (the copy row has a description). */
async function measure(page: Page) {
  return page.locator('[data-hub-tray]').evaluate((tray) => {
    const body = tray.querySelector('[role="dialog"] > div:last-child') as HTMLElement;
    const menu = body.querySelector('[role="menu"]') as HTMLElement;
    const cs = getComputedStyle(menu);
    const rows = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')].map((r) => r.getBoundingClientRect().height);
    return { port: body.clientHeight, pad: parseFloat(cs.paddingBlockStart) + parseFloat(cs.paddingBlockEnd), tallest: Math.max(...rows), twoLine: rows.filter((h) => h > 40).length };
  });
}

for (const height of [90, 100, 110, 120]) {
  test(`@trayrow at 390x${height} the tray body holds a whole two-line row`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await openRowMenu(page);
    const m = await measure(page);
    expect(m.twoLine, 'the gallery menu has a two-line row (copy, with its description)').toBeGreaterThan(0);
    expect(m.port, JSON.stringify(m)).toBeGreaterThanOrEqual(m.tallest + m.pad - 0.01);
    await expect(page.locator('[data-hub-tray]')).toHaveAttribute('data-two-line');
  });
}

test('@trayrow at a normal phone height the tray is unchanged: the body scrolls under a fixed head', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRowMenu(page);
  const m = await measure(page);
  expect(m.port).toBeGreaterThanOrEqual(m.tallest + m.pad);
  const head = await page.locator('[data-tray-head]').boundingBox();
  expect(head!.height).toBeGreaterThan(0);
});

test('@trayrow a menu of one-line rows is not marked two-line (its floor stays one token row)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHub(page, GALLERY);
  const btn = page.getByRole('button', { name: gallery['btn.longMenu'], exact: true });
  await btn.scrollIntoViewIfNeeded();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-hub-tray]')).toBeVisible();
  await expect(page.locator('[data-hub-tray]')).not.toHaveAttribute('data-two-line');
});

// A reason or a description long enough to wrap to several lines
// grows its row, and the menu keeps that row as drawn. On a phone the tray's floor and its reserves take the tallest row
// (measured), so the body's scrollport never cuts it; in a desktop popover the row simply grows. Either way every row
// is whole once scrolled to, with all of its lines, rows never overlap, and nothing scrolls sideways.
async function openReasonMenu(page: Page) {
  await gotoHub(page, GALLERY);
  const btn = page.getByRole('button', { name: gallery['btn.reasonMenu'], exact: true });
  await btn.scrollIntoViewIfNeeded();
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  // Measured once a tray has slid in.
  await page.getByRole('menu').evaluate((m) => Promise.all((m.closest('[data-hub-tray]') ?? m).getAnimations({ subtree: true }).map((a) => a.finished)));
}

/** Every row's box and its second line's box (reason or description), the rows' scrollport (the menu: it scrolls, its
 *  padding inside), the menu's block padding,
 *  the long reason's line count, and any sideways overflow of the page or the menu. */
async function rowsOf(page: Page) {
  return page.getByRole('menu').evaluate((menu) => {
    const rows = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const lineOf = (r: HTMLElement) => r.querySelector<HTMLElement>('[slot="description"]');
    const cs = getComputedStyle(menu);
    let port = menu as HTMLElement;
    for (let el: HTMLElement | null = rows[0]!.parentElement; el; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if (o === 'auto' || o === 'scroll') {
        port = el;
        break;
      }
    }
    const move = lineOf(rows[0]!)!;
    return {
      rows: rows.map((r) => {
        const b = r.getBoundingClientRect();
        const l = lineOf(r);
        const lb = l?.getBoundingClientRect();
        return { top: b.top, bottom: b.bottom, h: b.height, line: lb ? { top: lb.top, bottom: lb.bottom, cut: l!.scrollHeight - l!.clientHeight } : null };
      }),
      port: port.clientHeight,
      pad: parseFloat(cs.paddingBlockStart) + parseFloat(cs.paddingBlockEnd),
      moveLines: Math.round(move.getBoundingClientRect().height / parseFloat(getComputedStyle(move).lineHeight)),
      side: { menu: menu.scrollWidth - menu.clientWidth },
    };
  });
}

async function expectReasonsWhole(page: Page, where: string) {
  const m = await rowsOf(page);
  expect(m.moveLines, `${where}: precondition, the long reason wraps to 3 lines or more`).toBeGreaterThanOrEqual(3);
  expect(m.rows.filter((r) => r.line).length, `${where}: precondition, three rows have a second line`).toBe(3);
  m.rows.forEach((r, i) => {
    if (r.line) {
      expect(r.line.top, `${where}: row ${i}'s line starts inside its row`).toBeGreaterThanOrEqual(r.top - 0.5);
      expect(r.line.bottom, `${where}: row ${i}'s line ends inside its row`).toBeLessThanOrEqual(r.bottom + 0.5);
      expect(r.line.cut, `${where}: row ${i}'s line is not cut inside its own box`).toBeLessThanOrEqual(0.5);
    }
    const next = m.rows[i + 1];
    if (next) expect(r.bottom, `${where}: row ${i} ends before row ${i + 1} starts`).toBeLessThanOrEqual(next.top + 0.5);
  });
  const tallest = Math.max(...m.rows.map((r) => r.h));
  expect(m.port, `${where}: the rows' scrollport holds the tallest row whole ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(tallest + m.pad - 0.5);
  expect(m.side, `${where}: nothing scrolls sideways`).toEqual({ menu: 0 });
  await noSideScroll(page);
  // Scrolled to, every row and its whole second line are on screen at once.
  const items = page.getByRole('menu').locator('[role^="menuitem"]');
  for (let i = 0; i < m.rows.length; i++) {
    const row = items.nth(i);
    await row.scrollIntoViewIfNeeded();
    await expect(row, `${where}: row ${i} shows whole`).toBeInViewport({ ratio: 1 });
  }
}

for (const height of [844, 200, 120, 100]) {
  test(`@trayrow at 390x${height} a long reason shows whole in the tray, rows apart, no side scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await openReasonMenu(page);
    await expect(page.locator('[data-hub-tray]')).toHaveAttribute('data-two-line');
    await expectReasonsWhole(page, `390x${height}`);
  });
}

test('@trayrow at desktop width a long reason grows its popover row: whole, rows apart, no side scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openReasonMenu(page);
  await expect(page.locator('[data-hub-tray]')).toHaveCount(0);
  await expectReasonsWhole(page, '1280x800');
});

// When the tallest row's reserve (the frame and the long-reason row) is taller than the
// viewport, the tray takes the whole viewport and scrolls whole. At 390x100 the reserve is (149 px), at 390x64 the row
// itself is too (76 px). Either way every line of that row (each line box of its text) scrolls whole into view, and so
// does Close.
for (const height of [100, 64]) {
  test(`@trayrow at 390x${height} a reserve taller than the viewport: the tray takes the viewport and scrolls whole, every line of the tallest row and Close reachable`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height });
    await openReasonMenu(page);
    const tray = page.locator('[data-hub-tray]');
    await expect(tray).toHaveAttribute('data-two-line');
    const g = await tray.evaluate((t) => {
      const b = t.getBoundingClientRect();
      const move = t.querySelector<HTMLElement>('[role^="menuitem"]')!;
      return {
        vh: window.innerHeight,
        r1: parseFloat(getComputedStyle(t).getPropertyValue('--tray-r1')),
        row: move.getBoundingClientRect().height,
        top: b.top,
        h: b.height,
        scrolls: t.scrollHeight - t.clientHeight,
        overflow: getComputedStyle(t).overflowY,
      };
    });
    expect(g.r1, `precondition: the reserve is taller than the viewport ${JSON.stringify(g)}`).toBeGreaterThan(g.vh);
    if (height < 76) expect(g.row, `precondition: the row itself is taller than the viewport ${JSON.stringify(g)}`).toBeGreaterThan(g.vh);
    expect(Math.abs(g.top), `the tray starts at the viewport's top ${JSON.stringify(g)}`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(g.h - g.vh), `the tray takes the whole viewport, no more ${JSON.stringify(g)}`).toBeLessThanOrEqual(0.5);
    expect(g.scrolls, `the tray holds more than the viewport ${JSON.stringify(g)}`).toBeGreaterThan(0);
    expect(['auto', 'scroll'], `the tray scrolls whole (a user can scroll it) ${JSON.stringify(g)}`).toContain(g.overflow);
    const m = await rowsOf(page);
    expect(m.moveLines, 'precondition: the long reason wraps to 3 lines or more').toBeGreaterThanOrEqual(3);
    const move = page.getByRole('menu').locator('[role^="menuitem"]').first(); // reason: the reason menu's first row is the disabled Move row, the tallest (its wrapped reason)
    // Each line box of the row's text in turn (never an element's box, which can be taller than the viewport): every
    // box a user can scroll (overflow auto or scroll) from the text's own element outward scrolls the line to its top,
    // as far as it goes; the line is then whole inside the viewport and inside the padding box of every element that
    // clips it, from the text's own element (the reason, the label) through the row and outward.
    const lines = await move.evaluate((el) => {
      const texts: Text[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) texts.push(n as Text);
      const lineOf = (n: Text, i: number) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0)[i];
      };
      const all = texts.flatMap((n) => {
        const r = document.createRange();
        r.selectNodeContents(n);
        return [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0).map((_, i) => ({ n, i }));
      });
      return all.map(({ n, i }, k) => {
        const clips: Element[] = [];
        for (let a: Element | null = n.parentElement; a; a = a.parentElement) if (getComputedStyle(a).overflowY !== 'visible') clips.push(a);
        for (const a of clips) if (/^(auto|scroll)$/.test(getComputedStyle(a).overflowY)) a.scrollTop += lineOf(n, i)!.top - (a.getBoundingClientRect().top + a.clientTop);
        const b = lineOf(n, i)!;
        let top = 0;
        let bottom = window.innerHeight;
        for (const a of clips) {
          const c = a.getBoundingClientRect();
          top = Math.max(top, c.top + a.clientTop);
          bottom = Math.min(bottom, c.top + a.clientTop + a.clientHeight);
        }
        return { line: k, top: b.top, bottom: b.bottom, clipTop: top, clipBottom: bottom, clips: clips.length };
      });
    });
    expect(lines.length, 'precondition: the row has its label line and 3 or more reason lines').toBeGreaterThanOrEqual(m.moveLines + 1);
    for (const at of lines) {
      expect(at.top, `390x${height}: line ${at.line} of the tallest row starts on screen ${JSON.stringify(at)}`).toBeGreaterThanOrEqual(at.clipTop - 0.5);
      expect(at.bottom, `390x${height}: line ${at.line} of the tallest row ends on screen ${JSON.stringify(at)}`).toBeLessThanOrEqual(at.clipBottom + 0.5);
    }
    // Back at the start of the one scroll box (the tray, and the menu inside it), Close is on screen whole. The
    // matcher's IntersectionObserver clips by every overflow-clipping ancestor too, so a clipped head fails it.
    await tray.evaluate((t) => {
      for (const el of [t, t.querySelector<HTMLElement>('[role="menu"]')]) if (el) el.scrollTop = 0;
    });
    await expect(page.getByRole('button', { name: overlays.close, exact: true }), `390x${height}: scrolling back to the start shows Close whole`).toBeInViewport({ ratio: 1 });
  });
}
