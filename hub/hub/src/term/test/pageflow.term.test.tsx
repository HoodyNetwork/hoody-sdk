// A compat page root under the shell's scrolling outlet lays out as in the web's block scroll container (dom.ts,
// PageFlowRoot): `flex: 1; min-height: 0` no longer pins it to the viewport, so the outlet scrolls it; its
// `position: sticky; bottom: 0` footer stays on the last viewport row (sticky.ts).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import { PageOutlet } from '../../kit/layouts/termScroll';
import type { Table } from '../../../scripts/term/css-translate/types';

const cls = (n: string) => `pages/x/parts.module.css#${n}`;
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  [cls('page')]: { id: cls('page'), style: { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 }, status: 'full', outcomes: [] },
  [cls('clip')]: { id: cls('clip'), style: { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0, overflow: 'hidden' }, status: 'full', outcomes: [] },
  [cls('foot')]: { id: cls('foot'), style: { flexDirection: 'row', sticky: { bottom: 0 } }, status: 'full', outcomes: [] },
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });
const PAGE_DOWN = '\x1b[6~';
const lines = (n: number) => Array.from({ length: n }, (_, i) => <p key={i}>{`line ${i + 1}`}</p>);

test('a flex: 1; min-height: 0 page root scrolls under the outlet, its sticky footer on the last row throughout', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <FocusRoot><Box dir="column" height={8}><PageOutlet>
      <div className={cls('page')}>{lines(20)}<div className={cls('foot')}><span>FOOTER</span></div></div>
    </PageOutlet></Box></FocusRoot>, { width: 30, height: 8 });
  let f = (await t.settle()).split('\n');
  expect(f[0]).toContain('line 1');
  expect(f[7]).toContain('FOOTER');
  t.mockInput.pressKey(PAGE_DOWN);
  f = (await t.settle()).split('\n');
  expect(f.join('\n')).not.toMatch(/^line 1 *$/m);
  expect(f[7]).toContain('FOOTER');
});

test('a page root with its own overflow box keeps its own rules (it clips itself; the outlet has nothing to scroll)', async () => {
  setStyleTable(resolverFor(table));
  t = await drawTest(
    <FocusRoot><Box dir="column" height={8}><PageOutlet>
      <div className={cls('clip')}>{lines(20)}</div>
    </PageOutlet></Box></FocusRoot>, { width: 30, height: 8 });
  let f = await t.settle();
  t.mockInput.pressKey(PAGE_DOWN);
  f = await t.settle();
  expect(f.split('\n')[0]).toContain('line 1');
});
