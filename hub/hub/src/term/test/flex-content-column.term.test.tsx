// A column whose height is indefinite (no height, not grown by a definite parent) sizes its children by their content:
// a `flex: 1` (basis 0) child counts at its content height there, `min-height: 0` or not (CSS intrinsic sizing uses
// the item's max-content contribution). dom.ts kept the 0 basis whenever min-height was set, so the Files phone pane's
// `.folder { flex: 1; min-height: 0 }` inside `.pane { flex: 1 }` inside `.phone { min-height: 0 }` drew at no height
// (empty pane under the From / To switch at 80x24). In a column of definite height the 0 basis stays: siblings share
// the height by their grow factors, whatever their content.
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/flexcol.module.css#${n}`;
const entry = (n: string, style: Record<string, unknown>) => ({ [cls(n)]: { id: cls(n), style, status: 'full', outcomes: [] } });
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  ...entry('phone', { flexDirection: 'column', rowGap: 1, minHeight: 0 }),
  ...entry('pane', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }),
  ...entry('folder', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, minWidth: 0 }),
  ...entry('fixed', { flexDirection: 'column', height: 6 }),
  ...entry('half', { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, overflow: 'hidden' }),
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

test('in a column of indefinite height, a flex: 1 child with min-height: 0 takes its content height (Files phone pane)', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" width={30} height={10}>
      <div className={cls('phone')}>
        <p>From To</p>
        <section className={cls('pane')}>
          <div className={cls('folder')}>
            <p>public</p>
            <p>package.json</p>
            <p>server.js</p>
          </div>
        </section>
      </div>
    </Box>, { width: 30, height: 10 });
  const f = await t.settle();
  for (const name of ['From To', 'public', 'package.json', 'server.js']) expect(f).toContain(name);
});

test('in a column of definite height, flex: 1 siblings with min-height: 0 still share it by grow, not by content (unchanged)', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" width={30} height={8}>
      <div className={cls('fixed')}>
        <div className={cls('half')}><p>a1</p></div>
        <div className={cls('half')}><p>b1</p><p>b2</p><p>b3</p><p>b4</p><p>b5</p></div>
      </div>
    </Box>, { width: 30, height: 8 });
  const lines = (await t.settle()).split('\n');
  // 6 rows, 3 each: "a1" at row 0, "b1" at row 3, and b4/b5 cut by the second half's clip.
  expect(lines[0]).toContain('a1');
  expect(lines[3]).toContain('b1');
  expect(lines.join('\n')).not.toContain('b4');
});
