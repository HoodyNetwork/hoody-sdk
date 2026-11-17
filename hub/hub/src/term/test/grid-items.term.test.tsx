// Grid items drawn by a component (Home's "Start something" card was blank, its `ul.tiles` one row
// tall with the four tiles on top of each other). A grid's track was put on the box around a component's item AND again
// on the element the component rendered; inside that column box the track's `flexBasis: 0` is a HEIGHT, so every item
// was 0 rows tall. Every case is Home's real structure with Home's own stylesheet (the CSS translator's table).
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | A grid item is as tall as its content whether the page writes the `<li>` inline or a component renders it (Home's tiles: `grid-template-columns: repeat(2, minmax(0, 1fr))`, four items in two rows) | 'component items: every tile drawn' |
// | 2 | The same items written inline lay out the same (the control the fix must not move) | 'inline items: the same layout' |
// | 3 | Fewer items than tracks (one grid row): each component item still has its content's height and its track's share of the width | 'one row of component items' |
// | 4 | The grid's next sibling starts below the last grid row, never on top of it | 'component items: every tile drawn' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { Link } from '../../kit/controls/Link';
import s from '../../pages/home/parts/home.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function frame(node: ReactNode, width = 46, height = 14): Promise<string[]> {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });
  for (let i = 0; i < 6; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  t.renderer.destroy();
  return rows;
}

/** Home's main tile (QuickActions.tsx Tile, the icon left out: it is not what is measured). */
const tileItem = (n: string) => (
  <li className={s.tileItem}>
    <Link variant="plain" className={s.tile} href={`/${n.toLowerCase()}`}>
      <span className={s.tileText}><span className={s.tileName}>{n}</span><span className={s.tileBody}>{`${n} body`}</span></span>
    </Link>
  </li>
);
function Tile({ n }: { n: string }) { return tileItem(n); }

const card = (items: ReactNode) => (
  <Box dir="column" width={46}>
    <div className={s.quick}>
      <ul className={s.tiles}>{items}</ul>
      <div className={s.more}><span className={s.moreLabel}>More</span></div>
    </div>
  </Box>
);
const NAMES = ['Bot', 'Board', 'Script', 'Schedule'];
/** Row of the frame holding `word` (first match), -1 if absent. */
const rowOf = (rows: string[], word: string): number => rows.findIndex((r) => r.includes(word));

test('component items: every tile drawn', async () => {
  const rows = await frame(card(NAMES.map((n) => <Tile key={n} n={n} />)));
  for (const n of NAMES) {
    expect(rowOf(rows, `${n} body`)).toBeGreaterThan(-1);
    // Title above its body, each on a line of its own.
    expect(rowOf(rows, `${n} body`)).toBe(rowOf(rows, n) + 1);
  }
  // Two grid rows: Bot and Board side by side, Script and Schedule below them.
  expect(rowOf(rows, 'Board body')).toBe(rowOf(rows, 'Bot body'));
  expect(rowOf(rows, 'Script body')).toBeGreaterThan(rowOf(rows, 'Bot body'));
  expect(rowOf(rows, 'Schedule body')).toBe(rowOf(rows, 'Script body'));
  expect(rows[rowOf(rows, 'Bot body')]!.indexOf('Board body')).toBeGreaterThan(rows[rowOf(rows, 'Bot body')]!.indexOf('Bot body'));
  // The next sibling starts below the grid.
  expect(rowOf(rows, 'MORE')).toBeGreaterThan(rowOf(rows, 'Schedule body'));
});

test('inline items: the same layout', async () => {
  const inline = await frame(card(NAMES.map((n) => <li key={n} className={s.tileItem}>{tileItem(n).props.children}</li>)));
  const comp = await frame(card(NAMES.map((n) => <Tile key={n} n={n} />)));
  expect(comp).toEqual(inline);
});

test('one row of component items', async () => {
  const rows = await frame(card(['Bot', 'Board'].map((n) => <Tile key={n} n={n} />)));
  const y = rowOf(rows, 'Bot body');
  expect(y).toBeGreaterThan(-1);
  expect(rowOf(rows, 'Board body')).toBe(y);
  // Each takes its track's half: Board starts in the second half of the 46 cells.
  expect(rows[y]!.indexOf('Board body')).toBeGreaterThanOrEqual(22);
  expect(rowOf(rows, 'MORE')).toBeGreaterThan(y);
});
