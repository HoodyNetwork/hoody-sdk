// CSS :empty in the compat runtime (dom.ts contentUnknown / useDrawnChildren): an element whose children are components
// is :empty while they draw nothing, as on the web (Scripts' `.footNote:empty { display: none }` around a banner that
// renders null took a blank footer row). It shows as soon as a child draws, and hides again when it stops.
import { afterEach, expect, test } from 'bun:test';
import { useEffect, useState, type ReactElement } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/parts.module.css#${n}`;
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  [cls('bar')]: { id: cls('bar'), style: { flexDirection: 'column', rowGap: 1 }, status: 'full', outcomes: [] },
  [cls('note')]: { id: cls('note'), style: { flexDirection: 'row' }, status: 'full', outcomes: [],
    variants: [{ when: { self: { pseudo: ['empty'] } }, selector: '.note:empty', specificity: [0, 2, 0], outcomes: [], hidden: true }] },
  [cls('scroller')]: { id: cls('scroller'), style: { flexDirection: 'column', overflow: 'scroll', maxHeight: 3 }, status: 'full', outcomes: [],
    variants: [{ when: { self: { pseudo: ['empty'] } }, selector: '.scroller:empty', specificity: [0, 2, 0], outcomes: [], hidden: true }] },
  [cls('gone')]: { id: cls('gone'), style: { flexDirection: 'row' }, status: 'full', outcomes: [], hidden: true },
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

let setSay: ((s: string | null) => void) | null = null;
function Banner(): ReactElement | null {
  const [say, set] = useState<string | null>(null);
  useEffect(() => { setSay = set; return () => { setSay = null; }; }, []);
  return say === null ? null : <span>{say}</span>;
}
const Nothing = (): null => null;

test('a box whose component children draw nothing is :empty and takes no row (nor its gap); it shows when one draws', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" height={5}>
      <p>TOP</p>
      <div className={cls('bar')}>
        <div className={cls('note')}><Banner /><Nothing /></div>
        <span>HINT</span>
      </div>
      <p>BOTTOM</p>
    </Box>, { width: 20, height: 5 });
  // The note is the bar's first row (Scripts' footer at 80 columns): empty, it is no row and no gap (HINT right under TOP).
  let f = (await t.settle()).split('\n');
  expect(f[0]).toContain('TOP');
  expect(f[1]).toContain('HINT');
  expect(f[2]).toContain('BOTTOM');
  setSay!('SAVED');
  f = (await t.settle()).split('\n');
  expect(f[1]).toContain('SAVED');
  expect(f[3]).toContain('HINT');
  setSay!(null);
  f = (await t.settle()).split('\n');
  expect(f[1]).toContain('HINT');
});

test('static text is never :empty; a class hidden for another reason stays undrawn whatever its children draw', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" height={4}>
      <div className={cls('note')}>TEXT</div>
      <div className={cls('gone')}><Banner /></div>
      <p>BOTTOM</p>
    </Box>, { width: 20, height: 4 });
  let f = (await t.settle()).split('\n');
  expect(f[0]).toContain('TEXT');
  expect(f[1]).toContain('BOTTOM');
  setSay?.('NO');
  f = (await t.settle()).split('\n');
  expect(f.join('\n')).not.toContain('NO');
});

test('a scrolling box (overflow auto, max height) whose children draw nothing is :empty too: no blank scroll rows', async () => {
  // The AI pane foot's `.stopResult` (max-block-size: 40vh; overflow: auto; :empty display none): the outer box always
  // holds its scroll, so watching the outer box never read empty and a blank scroll took the rows under the foot.
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <Box dir="column" height={6}>
      <p>TOP</p>
      <div className={cls('scroller')}><Banner /><Nothing /></div>
      <p>BOTTOM</p>
    </Box>, { width: 20, height: 6 });
  let f = (await t.settle()).split('\n');
  expect(f[0]).toContain('TOP');
  expect(f[1]).toContain('BOTTOM');
  setSay!('STOPPED 2');
  f = (await t.settle()).split('\n');
  expect(f[1]).toContain('STOPPED 2');
  expect(f.findIndex((l) => l.includes('BOTTOM'))).toBeGreaterThan(1);
  setSay!(null);
  f = (await t.settle()).split('\n');
  expect(f[1]).toContain('BOTTOM');
});
