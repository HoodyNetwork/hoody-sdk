// An overflow box's scrollbar sits at its padding edge, as the web draws it: content | padding | bar (for example
// AI Details Usage at 80x24, `.body { padding: sp-4; overflow: auto }`: the bar comes after the two padding cells, not
// right after the table). The padding scrolls with the content (the web's scrollport includes the padding box).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/scrollpad.module.css#${n}`;
const entry = (n: string, style: Record<string, unknown>) => ({ [cls(n)]: { id: cls(n), style, status: 'full', outcomes: [] } });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  ...entry('body', { flexDirection: 'column', height: 6, overflow: 'scroll', paddingTop: 1, paddingRight: 2, paddingBottom: 1, paddingLeft: 2 }),
  ...entry('bare', { flexDirection: 'column', height: 6, overflow: 'scroll' }),
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });
const W = 30;
const BAR = /[█░▀▄]/;
/** The columns holding a scrollbar cell (the thumb; the track draws blank). */
const barColumns = (f: string[]): number[] => [...new Set(f.flatMap((l) => [...l.padEnd(W)].flatMap((ch, i) => (BAR.test(ch) ? [i] : []))))].sort((a, b) => a - b);
const lines = (n: number) => Array.from({ length: n }, (_, i) => <p key={i}>{`row ${String(i).padStart(2, '0')} ${'x'.repeat(20)}`}</p>);

test('a padded overflow box: its bar is in the last column, the right padding between the content and the bar', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(<Box dir="column" width={W} height={8}><div className={cls('body')}>{lines(20)}</div></Box>, { width: W, height: 8 });
  const f = (await t.settle()).split('\n').slice(0, 6);
  // Top padding row first (it scrolls with the content), then the rows from the left padding edge.
  expect(f[0]!.slice(0, W - 1).trim()).toBe('');
  expect(f[1]!.startsWith('  row 00')).toBe(true);
  expect(f[2]!.startsWith('  xx')).toBe(true);
  expect(barColumns(f)).toEqual([W - 1]);
  // The two right padding cells, between the text and the bar, are blank on every row.
  for (const l of f) expect(l.padEnd(W).slice(W - 3, W - 1)).toBe('  ');
});

test('an overflow box with no padding keeps its bar right after the content (unchanged)', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(<Box dir="column" width={W} height={8}><div className={cls('bare')}>{lines(20)}</div></Box>, { width: W, height: 8 });
  const f = (await t.settle()).split('\n').slice(0, 6);
  expect(f[0]!.startsWith('row 00')).toBe(true);
  expect(barColumns(f)).toEqual([W - 1]);
});
