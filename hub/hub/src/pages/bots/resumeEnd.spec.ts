// When the list spans computers, each
// computer's notes are one notice in its own group, the group's first row under its header, whether or not it has Bots
// listed. Resume ends the notice and the notice's box ends on the line of the row ⋯ buttons (the note is a boxed callout:
// its frame lines up with the row actions' end, its action sits at its own end inside its padding), wrapped or not, in
// the table and in the narrow list; the words stay at the start. Edges are logical (the end is the left one in RTL). Measured in the browser.
import { expect, type Page } from '@playwright/test';
import { gotoHub, test } from '@app/e2e';

type Dir = 'ltr' | 'rtl';

async function open(page: Page, width: number, path: string, state: string, dir: Dir) {
  await page.setViewportSize({ width, height: 1000 });
  await gotoHub(page, path, { state });
  // The computer groups are the List presentation's (the page opens on cards, one grid with the notes above it).
  // The switch comes with the loaded list: read it once the table is drawn, never before.
  await expect(page.getByRole('table', { name: 'Bots' })).toBeVisible({ timeout: 30000 });
  const list = page.getByRole('radio', { name: /^List$/i }).or(page.getByRole('button', { name: /^List$/i }));
  if (await list.count()) await list.first().click(); // reason: at phone width the remembered choice holds with no switch drawn
  if (dir === 'rtl') await page.evaluate(() => { document.documentElement.dir = 'rtl'; });
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Resume, its notice and every row ⋯ button, as logical edges, after scrolling the table to its end. */
async function edges(page: Page) {
  return page.evaluate(() => {
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const end = (el: Element) => (rtl ? el.getBoundingClientRect().left : el.getBoundingClientRect().right);
    const resume = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Resume');
    if (!resume) return null;
    const band = resume.closest<HTMLElement>('[data-band-flush]');
    if (!band) return { rtl, resume: Math.round(end(resume)), inRow: !!resume.closest('tr, [role="row"]'), band: false, menus: [], inner: 0, boxEnd: 0, wrapped: false, gap: 0, words: 0 };
    let el: HTMLElement | null = band.parentElement;
    while (el && el.scrollWidth <= el.clientWidth) el = el.parentElement;
    if (el) el.scrollLeft = rtl ? -el.scrollWidth : el.scrollWidth;
    const menus = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label="Row actions"]')].filter((b) => b.getClientRects().length > 0);
    const walker = document.createTreeWalker(band, NodeFilter.SHOW_TEXT);
    let words: Node | null = null;
    while (walker.nextNode()) if (!resume.contains(walker.currentNode) && walker.currentNode.textContent?.trim()) { words = walker.currentNode; break; }
    const range = document.createRange();
    if (words) range.selectNodeContents(words);
    const t = range.getBoundingClientRect();
    const r = resume.getBoundingClientRect();
    const box = band.getBoundingClientRect();
    const cs = getComputedStyle(band);
    return {
      rtl,
      resume: Math.round(end(resume)),
      inRow: !!resume.closest('tr, [role="row"]'),
      band: true,
      inner: Math.round(rtl ? box.left + parseFloat(cs.paddingLeft) : box.right - parseFloat(cs.paddingRight)),
      boxEnd: Math.round(end(band)),
      menus: menus.map((b) => Math.round(end(b))),
      wrapped: Math.round(t.top) < Math.round(r.top) - 4,
      gap: Math.round(rtl ? t.left - r.right : r.left - t.right),
      words: Math.round(rtl ? box.right - t.right : t.left - box.left),
    };
  });
}

async function expectAligned(page: Page, label: string) {
  const g = await edges(page);
  expect(g, label).not.toBeNull();
  const m = g!;
  const shown = `${label} (${JSON.stringify(m)})`;
  expect(m.inRow, `${shown}: the note is a row of its computer's group`).toBe(true);
  expect(m.band, `${shown}: the one notice shape`).toBe(true);
  expect(Math.abs(m.resume - m.inner), `${shown}: Resume ends the notice`).toBeLessThanOrEqual(1);
  expect(m.menus.length, shown).toBeGreaterThan(0);
  for (const e of m.menus) expect(Math.abs(m.boxEnd - e), `${shown}: the notice's box ends on the line of the row ⋯`).toBeLessThanOrEqual(1);
  return m;
}

test.describe('Bots Resume at the end', () => {
  test.describe.configure({ timeout: 180000 });

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`a computer with a group row ${dir}: the notice is its group's first row and Resume ends on the ⋯ line, in the table (1440) and the list (390)`, async ({ hubPage: page }) => {
      await open(page, 1440, '/bots', 'suspendedNotice', dir);
      const wide = await expectAligned(page, `${dir} 1440`);
      expect(wide.gap, `${dir} 1440: Resume is apart from the words`).toBeGreaterThan(16);
      await open(page, 390, '/bots', 'suspendedNotice', dir);
      const narrow = await expectAligned(page, `${dir} 390`);
      // At 390 the words wrap beside Resume, or Resume drops under them; either way nothing overlaps and it ends on the ⋯ line.
      if (!narrow.wrapped) expect(narrow.gap, `${dir} 390: the words stop before Resume`).toBeGreaterThanOrEqual(0);
    });
  }

  test('a notice with two notes (more Bots, paused): each is its own line, and Resume still ends its own at 1440 and 390', async ({ hubPage: page }) => {
    for (const width of [1440, 390]) {
      // The more-Bots note is said on the last page (before it the pager still has rows to give).
      await open(page, width, '/bots?page=2', 'suspendedCombined', 'ltr');
      await expect(page.getByText('More Bots than the list can show', { exact: false }).first()).toBeVisible(); // reason: atlas and cinder both show this note; the Resume row's alignment is measured below
      await expectAligned(page, `combined ${width}`);
    }
  });

  for (const dir of ['ltr', 'rtl'] as const) {
    test(`a computer with no Bots listed ${dir}: its group holds the same notice, words at the start and only Resume at the end`, async ({ hubPage: page }) => {
      for (const width of [1440, 390]) {
        // Only cinder's Bots are listed, so atlas (2 paused) has a group with its notice alone: the same notice, same shape.
        await open(page, width, '/bots?computer=c-cinder', 'suspendedNotice', dir);
        const m = await expectAligned(page, `${dir} ${width}`);
        expect(m.words, `${dir} ${width}: the words sit on the text edge`).toBeLessThanOrEqual(40);
        if (width === 1440) expect(m.gap, `${dir} ${width}: Resume is apart from the words`).toBeGreaterThan(16);
      }
    });
  }
});
