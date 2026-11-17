// `align-items: center` rounds toward the top: a child centred with an odd number of rows over sits on the line a
// reader takes as its own, the first. The engine rounded the half row down (logs spike band at 80x24: the warn mark
// "!" drawn on the words' second line, "! minutes).").
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import { attachCentreUp, centreUp, type CentreRow } from '../prim/centre';
import type { Table } from '../../../scripts/term/css-translate/types';
import { renderPage } from '../../../scripts/term/render';
import { SIDEBAR_COLS } from '../shell/Sidebar';

const cls = (n: string) => `pages/x/centre.module.css#${n}`;
const entry = (n: string, style: Record<string, unknown>) => ({ [cls(n)]: { id: cls(n), style, status: 'full', outcomes: [] } });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  ...entry('band', { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 2, paddingLeft: 2 }),
  ...entry('row', { flexDirection: 'row', alignItems: 'center', columnGap: 1 }),
  ...entry('tall', { flexDirection: 'row', alignItems: 'center', columnGap: 1, height: 4, paddingTop: 1 }),
  ...entry('text', { flexShrink: 1, minWidth: 0 }),
  ...entry('end', { alignSelf: 'flex-end' }),
  ...entry('wordsAuto', { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }),
  ...entry('wordsZero', { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }),
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

const draw = async (node: React.ReactNode, width: number, height: number): Promise<string[]> => {
  setStyleTable(resolverFor(table));
  t = await drawTest(<Box dir="column" width={width} height={height}>{node}</Box>, { width, height });
  await t.settle();
  return (await t.settle()).split('\n');
};

test('the rule: an odd remainder puts the half row below; even, none, or another place is left alone', () => {
  // one line of 2 rows (content top 0): a 1-row kid laid at row 1 (0.5 rounded down the screen) moves up one.
  expect(centreUp([{ top: 1, height: 1, x: 0 }, { top: 0, height: 2, x: 2 }], { top: 0, height: 2 })).toEqual([-1, 0]);
  // even remainder (3 rows, 1-row kid at row 1): exact centre, unchanged.
  expect(centreUp([{ top: 1, height: 1, x: 0 }, { top: 0, height: 3, x: 2 }], { top: 0, height: 3 })).toEqual([0, 0]);
  // a kid already at the line's top (placed by something else) is not moved.
  expect(centreUp([{ top: 0, height: 1, x: 0 }, { top: 0, height: 2, x: 2 }], { top: 0, height: 2 })).toEqual([0, 0]);
  // wrapping: each line by its own tallest kid; the second line starts where a kid begins left of the one before.
  expect(centreUp([
    { top: 1, height: 1, x: 2 }, { top: 0, height: 2, x: 5 },
    { top: 2, height: 1, x: 2 },
  ], null)).toEqual([-1, 0, 0]);
});

// Engine 0.8.4-hoody.3 breaks a wrapping row's lines on each item's flex basis, as CSS does (Flexbox 9.3): words with
// `flex: 1 1 auto` keep their line whole and the button goes under them; with basis 0 they squeeze to two lines beside it.
test('a wrapping row breaks on the flex basis: auto keeps the words whole, 0 squeezes them beside the button', async () => {
  const words = 'Problems jumped around 08:46 (41 in a few minutes).';
  const row = (c: string) => <div className={cls('band')}><span>!</span><span className={cls(c)}>{words}</span><span>[Around this moment]</span></div>;
  const auto = await draw(row('wordsAuto'), 64, 6);
  const at = auto.findIndex((l) => l.includes('Problems jumped'));
  expect(auto[at]).toMatch(/^\s*!\s+Problems jumped.*minutes\)\./);
  expect(auto[at]).not.toContain('[Around this moment]');
  expect(auto.findIndex((l) => l.includes('[Around this moment]'))).toBeGreaterThan(at);
  t?.renderer.destroy(); t = null;
  const zero = await draw(row('wordsZero'), 64, 6);
  const z = zero.findIndex((l) => l.includes('Problems jumped'));
  expect(zero[z]).toContain('[Around this moment]');
  expect(zero[z]).not.toContain('minutes).');
});

// The logs spike band is the kit Band now: its words have `flex: 1 1 240px` (Band.module.css .text), so at 80 columns
// they wrap beside the button, and the mark sits on their first line.
test('logs spike band at 80x24: the mark sits on the first line of words, the button beside them', async () => {
  const page = await renderPage({ page: 'logs', path: '/logs?live=1', cols: 80, rows: 24 });
  try {
    const lines = (await page.settle()).split('\n');
    expect(page.failures).toEqual([]);
    const words = lines.findIndex((l) => l.includes('Problems jumped'));
    expect(words).toBeGreaterThanOrEqual(0);
    expect(lines[words]).toMatch(/^\s*!\s+Problems jumped/);
    expect(lines[words]).toContain('[Around this moment]');
    expect(lines[words + 1]).not.toContain('!');
  } finally {
    page.close();
  }
}, 120_000);

// The page's own case of the rule above: in a narrower pane the words do wrap to two lines beside the mark. 80 columns
// is the least the shell draws its frame in (TooSmall.tsx); at 100 the sidebar shows and the pane is 75 columns.
test('logs spike band at 100x24, beside the sidebar: the mark sits on the first line of words that wrap to two', async () => {
  const page = await renderPage({ page: 'logs', path: '/logs?live=1', cols: 100, rows: 24 });
  try {
    // The pane's part of each line (the sidebar is the first SIDEBAR_COLS columns).
    const lines = (await page.settle()).split('\n').map((l) => l.slice(SIDEBAR_COLS));
    expect(page.failures).toEqual([]);
    const words = lines.findIndex((l) => l.includes('Problems jumped'));
    expect(words).toBeGreaterThanOrEqual(0);
    expect(lines[words]).toMatch(/^\s*!\s+Problems jumped/);
    expect(lines[words + 1]).toContain('minutes).');
    expect(lines[words + 1]).not.toContain('!');
  } finally {
    page.close();
  }
}, 120_000);

test('a one-line row and an explicit height with padding: the half row goes below', async () => {
  const lines = await draw(
    <div>
      <div className={cls('row')}><span>A</span><div><p>two</p><p>rows</p></div></div>
      <div className={cls('tall')}><span>B</span><div><p>x</p><p>y</p></div></div>
    </div>, 30, 8);
  // row: 2 rows, "A" beside "two".
  expect(lines[0]).toMatch(/^A\s+two/);
  // tall: 4 rows, padding 1 on top: content rows 1-3; the 2-row kid at 1-2 (0.5 down), "B" (1 row, 2 over) at 2.
  const b = lines.findIndex((l) => l.includes('B'));
  const x = lines.findIndex((l) => l.includes('x'));
  expect(b - x).toBeLessThanOrEqual(1);
  expect(lines.join('\n')).toContain('rows');
});

test('align-self: flex-end in a centring row is not moved', async () => {
  const lines = await draw(
    <div className={cls('row')}><span className={cls('end')}>E</span><div><p>one</p><p>two</p></div></div>, 30, 4);
  expect(lines[1]).toMatch(/^E\s+two/);
});

// Re-hooking (padding changed) must not drop a pass chained on after this one: putting the old chain back lost
// useDrawnChildren's :empty report and the width measures (market 80x24 table columns changed with centring on).
test('leaving keeps every pass chained on after it', () => {
  const ran: string[] = [];
  const row: CentreRow = { y: 0, height: 1, translateY: 0, getChildren: () => [], onLifecyclePass: () => ran.push('first') };
  const off = attachCentreUp(row, 0, 0);
  const under = row.onLifecyclePass!;
  row.onLifecyclePass = () => { under(); ran.push('later'); };
  off();
  const again = attachCentreUp(row, 1, 0);
  row.onLifecyclePass!();
  expect(ran).toEqual(['first', 'later']);
  again();
  ran.length = 0;
  row.onLifecyclePass!();
  expect(ran).toEqual(['first', 'later']);
});
