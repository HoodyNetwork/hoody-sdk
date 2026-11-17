// A page's footer note with its own flex (billing checkout): `<span class="footReason">` has
// `flex: 1 1 14rem; min-width: 0`. The drawer's footer is a ROW, so the basis is the note's WIDTH (28 cells), as on the
// web. Drawer.term put a column box around a web footer child and the span resolved its flex against that column: the
// basis became 28 ROWS of height, the footer stood 29 rows tall and the drawer's body got no row at 80x24 (9 at 120x40).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { layoutFaults } from '../../term/prim/layoutcheck';
import { resolverFor } from '../../term/jsx/css-table';
import { setStyleTable } from '../../term/jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';
import { Button } from '../controls/Button';
import { Drawer } from './Drawer';

const cls = (n: string) => `pages/x/footnote.module.css#${n}`;
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  [cls('page')]: { id: cls('page'), style: { flexDirection: 'column' }, status: 'full', outcomes: [] },
  [cls('footReason')]: { id: cls('footReason'), style: { flexGrow: 1, flexShrink: 1, flexBasis: 28, minWidth: 0 }, status: 'full', outcomes: [] },
} } as unknown as Table;

let t: TestTerm | null = null;
afterEach(() => { setStyleTable(null); t?.renderer.destroy(); t = null; });

for (const [w, h] of [[80, 24], [120, 40]] as const) {
  test(`a footer note with flex: 1 1 14rem is 28 cells wide at least, never 28 rows tall (${w}x${h})`, async () => {
    setStyleTable(resolverFor(table));
    const foot = (
      <>
        <span className={cls('footReason')}>Tick the box to agree to the terms first.</span>
        <Button variant="secondary" onPress={() => {}}>Cancel</Button>
        <Button onPress={() => {}}>Confirm purchase</Button>
      </>
    );
    // The drawer is declared inside the page's own column element, as a page declares it.
    t = await drawTest(
      <FocusRoot><OverlayHost>
        <div className={cls('page')}>
          <Drawer isOpen onOpenChange={() => {}} title="Buy a plan" size="md" resizeKey="test-foot-basis" footer={foot}><Text>What you get</Text><Text>CPU cores 2</Text></Drawer>
        </div>
      </OverlayHost></FocusRoot>, { width: w, height: h });
    const f = await t.settle();
    const ls = f.split('\n');
    expect(layoutFaults((t.renderer as unknown as { root: never }).root, { cols: w, rows: h }).filter((x) => x.kind === 'cut' || x.kind === 'overdraw'), f).toEqual([]);
    expect(f).toContain('What you get');
    expect(f).toContain('CPU cores 2');
    // The footer is at the bottom of the screen: the note on the buttons' line, taking the room they leave.
    const row = ls.findIndex((l) => l.includes('[Cancel]'));
    expect(row, f).toBeGreaterThanOrEqual(h - 2);
    expect(ls[row]).toContain('Tick the box');
    expect(ls[row]).toMatch(/\[Cancel\]\s+\[?Confirm purchase\]?\s*$/);
  });
}
