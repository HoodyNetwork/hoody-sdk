// No two boxes paint the same cells: a CSS column child is never crushed below its content (CSS
// min-height: auto), `flex: 1 1 0` inside an auto-height column keeps its content height, every Box clips, and the
// layout gate (prim/layoutcheck) names what overlaps or is cut.
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Scroll, Text } from '../prim';
import { layoutFaults } from '../prim/layoutcheck';
import { resolverFor } from '../jsx/css-table';
import { setStyleTable } from '../jsx/style';
import type { Table } from '../../../scripts/term/css-translate/types';
import type { ReactNode } from 'react';

const cls = (n: string) => `kit/x/Card.module.css#${n}`;
const table = { version: 1, generated: '', widthClass: {}, unitModel: {}, modules: {}, classes: {
  [cls('frame')]: { id: cls('frame'), style: { flexDirection: 'column', position: 'relative', minWidth: 0 }, status: 'full', outcomes: [] },
  [cls('inner')]: { id: cls('inner'), style: { flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, rowGap: 0 }, status: 'full', outcomes: [] },
  [cls('scroll')]: { id: cls('scroll'), style: { flexDirection: 'column', minHeight: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 }, status: 'full', outcomes: [] },
} } as unknown as Table;
afterEach(() => setStyleTable(null));

test('cards with flex: 1 1 0 inside an auto-height column keep their lines (billing plan cards)', async () => {
  setStyleTable(resolverFor(table));
  const card = (n: string) => (
    <div className={cls('frame')}>
      <div className={cls('inner')}><h2>{n}</h2><p>$12 / month</p><p>Computers 3</p></div>
    </div>
  );
  const t = await drawTest(<FocusRoot><div>{card('Small')}{card('Medium')}</div></FocusRoot>, { width: 40, height: 10 });
  const lines = t.captureCharFrame().split('\n').map((l) => l.trim());
  expect(lines.slice(0, 6)).toEqual(['Small', '$12 / month', 'Computers 3', 'Medium', '$12 / month', 'Computers 3']);
  expect(layoutFaults(t.renderer.root as never, { cols: 40, rows: 10 })).toEqual([]);
  t.renderer.destroy();
});

test('a column that sets min-height: 0 still shrinks (the page opted in)', async () => {
  setStyleTable(resolverFor(table));
  // A parent 3 rows tall (a prim Box: the compat runtime takes no inline style, so `style={{ height: 3 }}` was an
  // auto-height div, and the frame was read before anything was drawn). The opted-in column shrinks to it.
  const t = await drawTest(<FocusRoot><Box dir="column" height={3}><div className={cls('scroll')}><p>a</p><p>b</p><p>c</p><p>d</p><p>e</p></div></Box></FocusRoot>, { width: 20, height: 6 });
  await t.settle();
  const f = await t.settle();
  expect(f).toContain('a');
  expect(f).not.toContain('e');
  t.renderer.destroy();
});

test('the gate names overlapping siblings and children cut at their box', async () => {
  const t = await drawTest(
    <Box width={20} height={3}>
      <Box absolute={{ top: 0, left: 0 }}><Text>overlay ok</Text></Box>
      <Box height={1} dir="row"><Box width={30} raw={{ id: 'wide~x' }}><Text>wider than its row</Text></Box></Box>
      <Box height={1} raw={{ marginTop: -1, id: 'lifted' }}><Text>on top</Text></Box>
    </Box>, { width: 20, height: 3 });
  const f = layoutFaults(t.renderer.root as never, { cols: 20, rows: 3 });
  expect(f.some((x) => x.kind === 'overdraw' && x.path.includes('lifted'))).toBe(true);
  expect(f.some((x) => x.kind === 'cut' && x.path.includes('wide~x'))).toBe(true);
  // Clipping: the wide box never paints past its row.
  expect(t.captureCharFrame().split('\n')[1]!.trimEnd().length).toBeLessThanOrEqual(20);
  t.renderer.destroy();
});

test('a box whose owner declares it drops what does not fit is not reported', async () => {
  const t = await drawTest(<Box width={10} height={1} dir="row" drops><Box width={30}><Text>a long row of chips</Text></Box></Box>, { width: 10, height: 1 });
  expect(layoutFaults(t.renderer.root as never, { cols: 10, rows: 1 }).filter((x) => x.kind === 'cut')).toEqual([]);
  t.renderer.destroy();
});

// A declaring box exempts only what its own edge cuts, and a scroll box is known by its class.
test('inside a declaring box: an overlap, or a part cut by a smaller box within it, is still reported', async () => {
  const t = await drawTest(
    <Box width={20} height={2} dir="column" drops>
      <Box height={1}><Text>first</Text></Box>
      <Box height={1} raw={{ marginTop: -1, id: 'lifted' }}><Text>on top</Text></Box>
      <Box height={1} dir="row"><Box width={4} raw={{ id: 'narrow' }}><Box width={10} raw={{ id: 'inner' }}><Text>ten cells.</Text></Box></Box></Box>
    </Box>, { width: 20, height: 2 });
  const f = layoutFaults(t.renderer.root as never, { cols: 20, rows: 2 });
  expect(f.some((x) => x.kind === 'overdraw' && x.path.includes('lifted'))).toBe(true);
  expect(f.some((x) => x.kind === 'cut' && x.path.includes('inner'))).toBe(true);
  t.renderer.destroy();
});

test('a box named like a scroll part (id "wrapper", "viewport") is checked like any box', async () => {
  const t = await drawTest(
    <Box width={10} height={1} dir="row" raw={{ id: 'probe-wrapper' }}><Box width={30} raw={{ id: 'wide-in-wrapper' }}><Text>wider than its row</Text></Box></Box>,
    { width: 10, height: 1 });
  expect(layoutFaults(t.renderer.root as never, { cols: 10, rows: 1 }).some((x) => x.kind === 'cut' && x.path.includes('wide-in-wrapper'))).toBe(true);
  t.renderer.destroy();
});

test('an absolute popup cut by its small parent is a layout fault and a dev-time error naming it', async () => {
  const errs: string[] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => { errs.push(a.map(String).join(' ')); };
  try {
    const t = await drawTest(
      <Box dir="column"><Box dir="row" wrap><Box dir="column" shrink={0}><Text>State</Text><Box absolute={{ top: 1, left: 0 }} z={20}><Text>PANEL</Text></Box></Box></Box></Box>,
      { width: 20, height: 4 });
    await new Promise((r) => setTimeout(r, 80));
    expect(layoutFaults(t.renderer.root as never, { cols: 20, rows: 4 }).some((f) => f.kind === 'popup-clipped')).toBe(true);
    expect(errs.some((e) => e.startsWith('TERM_POPUP_CLIPPED'))).toBe(true);
    t.renderer.destroy();
  } finally { console.error = real; }
});

test('gapX / gapY set the two axes apart: wrapped lines touch with gapY 0', async () => {
  const t = await drawTest(<Box dir="row" wrap gapX={1} gapY={0} width={9}><Text>aaaa</Text><Text>bbbb</Text><Text>cccc</Text></Box>, { width: 9, height: 3 });
  expect(t.captureCharFrame().split('\n').slice(0, 2).map((l) => l.trimEnd())).toEqual(['aaaa bbbb', 'cccc']);
  t.renderer.destroy();
});

test('a box many screens tall is a layout explosion, named once', async () => {
  const t = await drawTest(<Box height={4}><Box height={400} raw={{ id: 'blown' }}><Box height={399}><Text>x</Text></Box></Box></Box>, { width: 10, height: 4 });
  const f = layoutFaults(t.renderer.root as never, { cols: 10, rows: 4 }).filter((x) => x.kind === 'explosion');
  expect(f.length).toBe(1);
  expect(f[0]!.path).toContain('blown');
  t.renderer.destroy();
});

test('scrolledBoxes names a scroll that is not at its top', async () => {
  const { Scroll } = await import('../prim');
  const { scrolledBoxes } = await import('../prim/layoutcheck');
  const t = await drawTest(<Scroll height={3} scrollRef={(r: unknown) => { if (r) (r as { scrollTop: number }).scrollTop = 0; }}><Box>{Array.from({ length: 10 }, (_, i) => <Text key={i}>{`l${i}`}</Text>)}</Box></Scroll>, { width: 10, height: 3 });
  await t.renderOnce();
  expect(scrolledBoxes(t.renderer.root as never)).toEqual([]);
  const sb = (t.renderer.root as unknown as { getChildren(): Array<{ scrollTop: number; getChildren(): unknown[] }> }).getChildren()[0]!;
  (sb as unknown as { scrollBy(n: number): void }).scrollBy(3);
  await t.renderOnce();
  expect(scrolledBoxes(t.renderer.root as never).length).toBe(1);
  t.renderer.destroy();
});

test('a 0x0 anchor box (OpenTUI lays it out 1x1) paints nothing: no overdraw; a box with a background still counts', async () => {
  const t = await drawTest(<FocusRoot><Box width={0} height={0} /><Box grow={1}><Text>page</Text></Box></FocusRoot>, { width: 20, height: 4 });
  expect(layoutFaults(t.renderer.root as never, { cols: 20, rows: 4 })).toEqual([]);
  t.renderer.destroy();
  const u = await drawTest(<FocusRoot><Box width={0} height={0} bg="danger" /><Box grow={1}><Text>page</Text></Box></FocusRoot>, { width: 20, height: 4 });
  expect(layoutFaults(u.renderer.root as never, { cols: 20, rows: 4 }).map((f) => f.kind)).toEqual(['overdraw']);
  u.renderer.destroy();
});

test('an absolute mark in scroll content below the fold is not a clipped popup; one cut by its own small parent still is', async () => {
  // Home's Quick actions tile: a kit Link's 1x1 absolute mark sat at row 42 of the page's scroll content, past the
  // viewport, and was reported "reaches past scrollbox" though nothing cut it (it shows once scrolled to).
  // layoutFaults keeps one fault per path, so each case is drawn on its own.
  const popups = async (node: ReactNode): Promise<string[]> => {
    const t = await drawTest(node, { width: 20, height: 6 });
    await new Promise((r) => setTimeout(r, 80));
    const d = layoutFaults(t.renderer.root as never, { cols: 20, rows: 6 }).filter((f) => f.kind === 'popup-clipped').map((f) => f.detail);
    t.renderer.destroy();
    return d;
  };
  const rows = Array.from({ length: 20 }, (_, i) => <Text key={i}>{`row ${i + 1}`}</Text>);
  expect(await popups(
    <Box dir="column" height={6}><Scroll dir="column" grow={1}>
      {rows}
      <Box dir="row"><Text>tile</Text><Box absolute={{ top: 0, left: 0 }} width={1} height={1}><Text>•</Text></Box></Box>
    </Scroll></Box>,
  )).toEqual([]);
  const cut = await popups(
    <Box dir="column" height={6}>
      <Box dir="column" height={1} shrink={0}><Text>cut</Text><Box absolute={{ top: 1, left: 0 }}><Text>PANEL</Text></Box></Box>
    </Box>,
  );
  expect(cut.length).toBe(1);
  expect(cut[0]).toMatch(/^5x1 at 0,1 reaches past /);
});
