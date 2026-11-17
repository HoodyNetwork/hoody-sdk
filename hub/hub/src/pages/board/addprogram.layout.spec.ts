// Playwright: Add a program is a constrained layout, measured. In the computer's frame, on the Programs and the Apps
// kinds and on a search's Results, at 1440 and at 390: every card of the body starts and ends on the same edges; the
// tiles of a card sit in grid slots (one width, the same left edge per column, one height per row); each tile's mark
// sits in the same place in its tile; the head's search ends where the cards end. All within 1 px. Nothing floats
// beside the cards: everything the body holds starts on the cards' left edge.
import { expect, test, type Locator } from '@playwright/test';
import { gotoHub } from '@app/e2e';
import strings from './strings.en.json';

const S = strings as Record<string, string>;
type Box = { l: number; r: number; t: number; b: number };

/** Every box the frame's body lays out: its cards (and anything between them), each card's tiles and their marks. */
async function measure(body: Locator) {
  return body.evaluate((el) => {
    const box = (e: Element): Box => { const x = e.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom }; };
    // The body's blocks: its cards, and whatever sits between them (a wrapper that holds cards is walked into).
    const blocks: Element[] = [];
    const walk = (p: Element) => {
      for (const c of Array.from(p.children)) {
        if (c.hasAttribute('data-more-below') || c.getBoundingClientRect().height === 0) continue;
        if (c.tagName === 'SECTION' || c.querySelector('section') === null) blocks.push(c);
        else walk(c);
      }
    };
    walk(el);
    // Where a tile's own words end: the lowest drawn text block of its card.
    const wordsEnd = (t: Element) =>
      Math.max(
        0,
        ...Array.from(t.querySelectorAll('[data-pick-card] > span'))
          .filter((x) => getComputedStyle(x).position !== 'absolute' && x.getBoundingClientRect().height > 2)
          .map((x) => x.getBoundingClientRect().bottom),
      );
    const cards = Array.from(el.querySelectorAll('section')).filter((c) => c.querySelector('[role="row"]')).map((c) => {
      const tiles = Array.from(c.querySelectorAll('[role="row"]')).map((t) => ({ tile: box(t), words: wordsEnd(t), mark: box(t.querySelector('[data-card-key] [aria-hidden="true"], [aria-hidden="true"]') ?? t) }));
      const grid = c.querySelector('[role="grid"]');
      return { card: box(c), grid: grid ? box(grid) : box(c), tiles };
    });
    return { blocks: blocks.map((b) => ({ tag: b.tagName, text: (b.textContent ?? '').slice(0, 30), ...box(b) })), cards };
  }) as Promise<{ blocks: (Box & { tag: string; text: string })[]; cards: { card: Box; grid: Box; tiles: { tile: Box; words: number; mark: Box }[] }[] }>;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1;

for (const [label, size, touch] of [
  ['1440', { width: 1440, height: 900 }, false],
  ['390', { width: 390, height: 844 }, true],
] as const) {
  test.describe(`${label}: the frame's edges`, () => {
    test.use({ viewport: size, hasTouch: touch, isMobile: touch });
    for (const kind of ['programs', 'apps', 'all'] as const) {
      test(`${kind}: cards on one pair of edges, tiles in grid slots, marks in one place`, async ({ page }) => {
        await gotoHub(page, '/board');
        await page.getByRole('button', { name: S['board.addProgram'] }).first().click(); // reason: the chips row's + (a phone, or a paged Board) has the same name, after the strip's or the empty slot's own
        const d = page.getByRole('dialog').last();
        await d.getByRole('row', { name: /^atlas/ }).click();
        if (kind === 'apps') await d.locator('[data-side-tab="apps"], [role="tab"]').filter({ hasText: S['browse.tab.apps'] }).first().click();
        // A search: every kind's hits and the search sources, each in a card on the same edges.
        if (kind === 'all') await d.getByRole('searchbox').fill('jupyter');
        const body = d.getByRole('region', { name: S['browse.tab.' + kind], exact: true });
        await expect(body.getByRole('row').first()).toBeVisible();
        // The apps' cards come as the agents' check answers: wait for the second card (Not listed?).
        if (kind === 'apps') await expect(body.locator('section').nth(1)).toBeVisible();
        // Every source has answered: no chip still searching.
        if (kind === 'all') await expect(body.getByText(/: searching…$/)).toHaveCount(0, { timeout: 15_000 });
        const m = await measure(body);
        expect(m.cards.length).toBeGreaterThan(1);
        const first = m.cards[0]!.card;
        // Every block of the body (cards, and anything between them) starts on the cards' left edge.
        for (const b of m.blocks) expect(near(b.l, first.l), `${b.tag} "${b.text}" starts at ${b.l}, the cards at ${first.l}`).toBe(true);
        for (const { card, grid, tiles } of m.cards) {
          expect(near(card.l, first.l) && near(card.r, first.r), 'every card on the same edges').toBe(true);
          const width = tiles[0]!.tile.r - tiles[0]!.tile.l;
          const cols = new Map<number, number>();
          for (const { tile, mark } of tiles) {
            expect(near(tile.r - tile.l, width), 'one tile width in a card').toBe(true);
            // One left edge per column, the marks at one inset from their tile, at one height from its top.
            const col = [...cols.keys()].find((x) => near(x, tile.l)) ?? tile.l;
            cols.set(col, (cols.get(col) ?? 0) + 1);
            expect(near(mark.l - tile.l, tiles[0]!.mark.l - tiles[0]!.tile.l), 'the mark at one inset').toBe(true);
            expect(near(mark.t - tile.t, tiles[0]!.mark.t - tiles[0]!.tile.t), 'the mark at one height').toBe(true);
          }
          // The grid sits inside the card at the same inset on both sides, and its first column starts on its edge (a card
          // of one tile keeps the other cards' tile width: its second slot stays empty).
          expect(near(grid.l - card.l, card.r - grid.r), 'equal insets left and right').toBe(true);
          expect(near(Math.min(...cols.keys()), grid.l), 'the first column on the grid edge').toBe(true);
          // In one column a tile is as tall as its own words: the room under them is the same in every tile, never
          // the tallest tile's height handed to a short one.
          if (cols.size === 1) for (const { tile, words } of tiles) expect(near(tile.b - words, tiles[0]!.tile.b - tiles[0]!.words), 'a tile as tall as its own words').toBe(true);
          // Tiles side by side share one row height.
          for (const a of tiles) for (const b of tiles) if (near(a.tile.t, b.tile.t)) expect(near(a.tile.b, b.tile.b), 'one height per row').toBe(true);
        }
        // The head's search ends where the cards end, and the frame is centred where it opens.
        const search = await d.getByRole('searchbox').boundingBox();
        expect(near(search!.x + search!.width, first.r), 'the search and the cards end on one edge').toBe(true);
        if (touch) {
          const sheet = await d.boundingBox();
          expect(near(sheet!.x, 0) && near(sheet!.x + sheet!.width, size.width), 'the phone sheet spans the screen').toBe(true);
        }
      });
    }
  });
}
