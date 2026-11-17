// The Servers cards as drawn (left rail, three-up meters), measured in both themes.
// At 1440: each card fills the panel; its title and fields sit on a 300 px rail at the start, tinted (--hx-card-rail,
// rgba(0,0,0,.045) in light) with a 1 px dashed divider (--hx-card-rail-line, #a8a8a8 in light); the footer beside it
// is 20 / 28 px in, and AI use is a three-column grid (20 px between rows, 36 px between columns) with the heading across
// the top and the card's one upgrade in the cell after the lanes. Each lane is its name and percent on one line over a
// meter at the lane's full width. At 390 the card is the stacked card: no rail, one lane per line.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoHub, noSideScroll } from '@app/e2e';
import { choosePresentation } from '@app/e2e-toolbar';

type Box = { x: number; y: number; w: number; h: number };
const r1 = (v: number) => Math.round(v * 10) / 10;
const box = async (l: Locator): Promise<Box> => {
  const r = await l.evaluate((e) => e.getBoundingClientRect().toJSON() as DOMRect);
  return { x: r1(r.x), y: r1(r.y), w: r1(r.width), h: r1(r.height) };
};
const rail = (cell: Locator) =>
  cell.evaluate((e) => {
    const b = getComputedStyle(e, '::before');
    return { content: b.content, bg: b.backgroundColor, style: b.borderRightStyle, width: b.borderRightWidth, color: b.borderRightColor, w: parseFloat(b.width) };
  });

async function open(page: Page, theme: 'light' | 'dark') {
  await gotoHub(page, '/computers/servers', { theme });
  const servers = page.getByRole('table', { name: 'Servers' });
  await expect(servers.locator('tbody tr[data-row-id]').first()).toBeVisible();
  await choosePresentation(page.locator('#hub-main'), 'cards');
  const cards = servers.locator('tbody tr[data-row-id]');
  // The AI read has answered: some card shows its lanes.
  await expect(servers.locator('li').filter({ has: page.locator('[role=meter]') }).first()).toBeVisible();
  return { servers, cards };
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`server cards (${theme})`, () => {
    test(`@d33 at 1440 each card fills the panel on a 300 px dashed rail, AI use three-up (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const { servers, cards } = await open(page, theme);
      const body = await box(servers.locator('tbody'));
      const n = await cards.count();
      expect(n).toBeGreaterThan(1);
      let lanesSeen = 0;
      let upgradesSeen = 0;
      for (const c of await cards.all()) {
        const card = await box(c);
        // One card per line, the panel's width (less the grid's own inline padding, 20 px each side).
        expect(Math.abs(card.w - (body.w - 40))).toBeLessThanOrEqual(1);
        const cell = c.locator('td[role=cell]');
        const cb = await box(cell);
        const r = await rail(cell);
        expect(r.content).toBe('""');
        expect(r.w).toBe(300);
        expect(r.style).toBe('dashed');
        expect(r.width).toBe('1px');
        // The tint's alpha is stored in 8 bits (0.045 reads back as 0.043 or so): the channels exact, the alpha within 1/255.
        const [cr, cg, cb2, ca] = (r.bg.match(/[\d.]+/g) ?? []).map(Number);
        expect([cr, cg, cb2]).toEqual(theme === 'light' ? [0, 0, 0] : [255, 255, 255]);
        expect(Math.abs(ca! - 0.045)).toBeLessThanOrEqual(1 / 255);
        if (theme === 'light') expect(r.color).toBe('rgb(168, 168, 168)');
        // The title sits on the rail, 16 px down and 20 px in; the footer starts at the rail's end, 20 / 28 px in.
        const top = await box(cell.locator('> div').first());
        expect(top.x - cb.x).toBe(0);
        expect(top.w).toBe(300);
        const title = await box(cell.locator('strong').first());
        expect(r1(title.y - cb.y)).toBeGreaterThanOrEqual(16);
        expect(title.x - cb.x).toBeGreaterThanOrEqual(20);
        const ai = cell.locator('ul').first();
        if ((await ai.count()) === 0) continue;
        // The AI block and its list are display: contents, so its heading and lanes are the foot grid's own cells: the
        // heading spans the first row at the rail's end, 28 px in and 20 px down; the lanes start a 20 px row gap below.
        const foot = ai.locator('xpath=..');
        const head = await box(foot.locator('> span').first());
        expect(r1(head.x - (cb.x + 300))).toBe(28);
        expect(r1(head.y - cb.y)).toBe(20);
        const lanes = ai.locator('> li');
        const ln = await lanes.count();
        const lb: Box[] = [];
        for (let i = 0; i < ln; i++) lb.push(await box(lanes.nth(i)));
        expect(ln).toBeGreaterThanOrEqual(4);
        expect(lb[0]!.x).toBe(head.x);
        expect(r1(lb[0]!.y - (head.y + head.h))).toBe(20);
        // Three lanes a row: same top in a row, 36 px between columns, 20 px between rows; each meter at the lane's width.
        expect(lb[1]!.y).toBe(lb[0]!.y);
        expect(lb[2]!.y).toBe(lb[0]!.y);
        // The 1fr tracks land on fractional pixels, so a measured gap may read 35.9: the design's 36 within half a pixel.
        expect(Math.abs(lb[1]!.x - (lb[0]!.x + lb[0]!.w) - 36)).toBeLessThanOrEqual(0.5);
        expect(Math.abs(lb[2]!.x - (lb[1]!.x + lb[1]!.w) - 36)).toBeLessThanOrEqual(0.5);
        // The footer is 28 px in at the card's end too (padding 20px 28px): the third lane ends there, less
        // the under 3 px its whole-pixel columns give back.
        const endIn = cb.x + cb.w - (lb[2]!.x + lb[2]!.w);
        expect(endIn).toBeGreaterThanOrEqual(27.5);
        expect(endIn).toBeLessThan(31);
        // Every lane starts on a whole pixel (the meter's blocks are exact only from one).
        for (const l of lb) expect(l.x, 'lane on a whole pixel').toBe(Math.round(l.x));
        expect(lb[3]!.x).toBe(lb[0]!.x);
        // Each lane's meter starts on a whole pixel row, so its 1 px top and bottom strokes are whole.
        for (const m of await ai.locator('[role=meter]').all()) {
          const y = await m.evaluate((e) => e.getBoundingClientRect().y);
          expect(y, 'lane meter on a whole pixel row').toBe(Math.round(y));
        }
        expect(r1(lb[3]!.y - (lb[0]!.y + Math.max(lb[0]!.h, lb[1]!.h, lb[2]!.h)))).toBe(20);
        for (let i = 0; i < ln; i++) {
          const m = lanes.nth(i).locator('[role=meter]');
          if ((await m.count()) === 0) continue;
          const mb = await box(m);
          // The lane's width rounded down to 10 px, from the lane's start (not the whole cell width).
          expect(mb.w, 'lane meter a whole 10 px period').toBe(Math.floor(lb[i]!.w / 10) * 10);
          expect(mb.x).toBe(lb[i]!.x);
          // Name and percent share the line above the meter.
          const name = await box(lanes.nth(i).locator('span').first());
          expect(name.y + name.h).toBeLessThanOrEqual(mb.y + 0.5);
        }
        lanesSeen++;
        // The card's one upgrade, if any, is the cell after the last lane.
        const up = foot.getByRole('link', { name: /Get more (room|AI)/ });
        if ((await up.count()) === 0) continue;
        expect(await up.count()).toBe(1);
        // After every lane in the foot's order, in the next free cell.
        const lastLane = await lanes.nth(ln - 1).elementHandle();
        expect(await up.evaluate((u, l) => !!(l!.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_FOLLOWING), lastLane)).toBe(true);
        const ub = await box(up.locator('xpath=..'));
        const next = ln % 3;
        expect(ub.x).toBe(lb[next]!.x);
        expect(ub.y).toBeGreaterThanOrEqual(lb[ln - 1]!.y);
        // A 6 px bottom padding, rounded to the 4 px token; at the cell's end (align-self).
        expect(await up.locator('xpath=..').evaluate((e) => getComputedStyle(e).paddingBottom)).toBe('4px');
        upgradesSeen++;
      }
      expect(lanesSeen).toBeGreaterThan(0);
      expect(upgradesSeen).toBeGreaterThan(0);
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`d33-servers-1440-${theme}.png`), fullPage: true });
    });

    test(`@d33 below the rail's width the stacked cards keep their own track: two a row (${theme})`, async ({ page }) => {
      // "Narrow container: falls back to the stacked card": below a 940 px table (the rail's 900 px of cards) the
      // stacked cards' auto-fill track is the base one, which fits two from 616 px.
      let checked = false;
      for (const width of [1024, 1100, 1180, 1260]) {
        await page.setViewportSize({ width, height: 900 });
        const { servers, cards } = await open(page, theme);
        const tw = (await box(servers)).w;
        if (tw < 680 || tw >= 940) continue;
        checked = true;
        expect((await rail(cards.first().locator('td[role=cell]'))).content).toBe('none');
        // Servers are grouped one a group here (Free, Subservers, ...), so two cards never share a row: the track itself is
        // read, its resolved columns (auto-fill gives each its pixel width).
        const tracks = await servers.locator('tbody').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').map(parseFloat));
        expect(tracks.length, `two tracks a row in a ${tw} px table`).toBeGreaterThanOrEqual(2);
        for (const t of tracks) expect(t).toBeGreaterThanOrEqual(300);
        break;
      }
      expect(checked, 'some viewport gives a table between 680 and 940 px').toBe(true);
    });

    test(`@d33 at 390 the card is stacked: no rail, one lane a line (${theme})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      const { cards } = await open(page, theme);
      for (const c of await cards.all()) {
        const cell = c.locator('td[role=cell]');
        expect((await rail(cell)).content).toBe('none');
        const lanes = cell.locator('ul > li');
        const ln = await lanes.count();
        for (let i = 1; i < ln; i++) expect((await box(lanes.nth(i))).y).toBeGreaterThan((await box(lanes.nth(i - 1))).y);
      }
      await noSideScroll(page);
      await page.screenshot({ path: test.info().outputPath(`d33-servers-390-${theme}.png`), fullPage: true });
    });
  });
}
