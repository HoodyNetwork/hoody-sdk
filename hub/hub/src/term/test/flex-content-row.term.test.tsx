// A row sized by its content (`flex: 0 0 auto` in a wrapping row) holding a `flex: 1` child: CSS gives the row its
// max-content width, so the child shows whole. Yoga summed the children's 0 bases and the row came out 0-1 cells
// wide (billing Wallet & usage: the GitHub bonus card's ".cardHead > h2 { flex: 1 }" lost "GITHUB BONUS").
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/flexrow.module.css#${n}`;
const entry = (n: string, style: Record<string, unknown>) => ({ [cls(n)]: { id: cls(n), style, status: 'full', outcomes: [] } });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  ...entry('band', { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 2 }),
  ...entry('head', { flexDirection: 'row', alignItems: 'center', columnGap: 1, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }),
  ...entry('label', { flexGrow: 1, flexShrink: 1, flexBasis: 0 }),
  ...entry('note', { flexBasis: 'auto' }),
  ...entry('wide', { flexDirection: 'row', width: 30 }),
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

test('a content-sized row (flex: 0 0 auto) holding a flex: 1 heading shows the heading whole', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" width={60} height={3}>
      <div className={cls('band')}>
        <div className={cls('head')}><h2 className={cls('label')}>GITHUB BONUS</h2></div>
        <p className={cls('note')}>$10.00 in credit.</p>
      </div>
    </Box>, { width: 60, height: 3 });
  const f = await t.settle();
  expect(f).toContain('GITHUB BONUS');
  expect(f).toMatch(/GITHUB BONUS\s+\$10\.00 in credit\./);
});

test('a row with a width of its own keeps its basis-0 child filling that width (unchanged)', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="row" width={60} height={2}>
      <div className={cls('wide')}><h2 className={cls('label')}>HEADING</h2><span>END</span></div>
    </Box>, { width: 60, height: 2 });
  const f = (await t.settle()).split('\n')[0]!;
  expect(f).toMatch(/^HEADING\s+END/);
  expect(f.indexOf('END')).toBeGreaterThan(20);
});
