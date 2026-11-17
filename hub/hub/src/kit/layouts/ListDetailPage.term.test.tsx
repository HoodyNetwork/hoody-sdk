import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { PaneSize, Pressable, Text } from '../../term/prim';
import { useState } from 'react';
import { localStore } from '../../core/host-env';
import { beginTermSession } from '../../term/env/session';
import { routed } from './termHarness';
import { DetailHeader, ListDetailPage, useSelection } from './ListDetailPage';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Page({ mode = 'fill' as 'fill' | 'side' }) {
  const [sel, select] = useSelection();
  return (
    <ListDetailPage
      mode={mode}
      storageKey="t"
      header={{ title: 'Things' }}
      list={<>{['one', 'two'].map((id) => <Pressable key={id} onPress={() => select(id)}>{({ focused }) => <Text inverse={focused}>{`row ${id}`}</Text>}</Pressable>)}</>}
      detail={sel ? <><DetailHeader title={`thing ${sel}`} /><Text>{`detail of ${sel}`}</Text></> : null}
    />
  );
}
const draw = async (w: number, path = '/page', mode: 'fill' | 'side' = 'fill') => {
  const r = routed(() => <Page mode={mode} />, path);
  t = await drawTest(r.element, { width: w, height: 14 });
  return { frame: await t.settle(), router: r.router };
};
const search = (r: { state: { location: { search: unknown } } }) => r.state.location.search as Record<string, string>;

test('wide: list and detail side by side with a handle; the detail title takes the focus on open', async () => {
  const { router } = await draw(110);
  t!.mockInput.pressTab();
  await t!.settle();
  t!.mockInput.pressEnter();
  const f = await t!.settle();
  expect(search(router).sel).toBe('one');
  const line = f.split('\n').find((l) => l.includes('row one'))!;
  expect(line).toContain('│');
  expect(f).toContain('detail of one');
  expect(f).not.toContain('‹ Things');
  // the focus is on the detail's title, not the row
  expect(f).toMatchSnapshot();
});

test('narrow: one pane; the detail replaces the list with "‹ <page>" focused; Esc closes', async () => {
  const { frame, router } = await draw(70, '/page?sel=two');
  expect(frame).toContain('‹ Things');
  expect(frame).not.toContain('row one');
  t!.mockInput.pressEscape();
  // A lone ESC byte is told apart from an escape sequence by a short wait in the key parser.
  await new Promise((r) => setTimeout(r, 120));
  const f = await t!.settle();
  expect(search(router).sel).toBeUndefined();
  expect(f).toContain('row one');
});

test('\\ hides and shows the list beside a fill detail (?list=0)', async () => {
  const { router } = await draw(110, '/page?sel=one');
  t!.mockInput.pressKey('\\');
  const f = await t!.settle();
  expect(search(router).list).toBe('0');
  expect(f).not.toContain('row one');
  expect(f).toContain('‹ Things');
});

test('the handle resizes the list in 2-column steps and the width is kept in the shared store (px)', async () => {
  const session = beginTermSession();
  await draw(120, '/page?sel=one');
  // Tab order: rows, the handle, the title (reading order); find the handle by walking until a right arrow changes the width.
  const before = localStore().getItem('hub.v3.pane.t.list');
  for (let i = 0; i < 4; i++) { t!.mockInput.pressTab(); await t!.settle(); t!.mockInput.pressArrow('right'); await t!.settle(); }
  const after = localStore().getItem('hub.v3.pane.t.list');
  expect(Number(after)).toBeGreaterThan(Number(before ?? 340));
  expect((Number(after) - 340) % 16).toBe(0);
  session.end();
});

test('side mode: the inspector sits on the end side; the list keeps the focus', async () => {
  const { frame } = await draw(120, '/page?sel=one', 'side');
  const line = frame.split('\n').find((l) => l.includes('row one'))!;
  expect(line).toContain('thing one');
});

test('closing the detail gives the focus back to the row that opened it (both panes)', async () => {
  const { router } = await draw(110);
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressTab(); await t!.settle();
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(search(router).sel).toBe('two');
  t!.mockInput.pressEscape();
  await new Promise((r) => setTimeout(r, 120));
  const f = await t!.settle();
  expect(search(router).sel).toBeUndefined();
  // row two is drawn inverse when focused: press Enter again and it is "two" that opens
  t!.mockInput.pressEnter();
  await t!.settle();
  expect(search(router).sel).toBe('two');
  expect(f).toContain('row two');
});

test('container questions inside a pane answer from the pane, not the terminal (and again when the pane moves)', async () => {
  const { useContainerNarrow } = await import('../media');
  const seen: boolean[] = [];
  function Probe() { const narrow = useContainerNarrow(1000); seen.push(narrow); return <Text>{narrow ? 'detail narrow' : 'detail roomy'}</Text>; }
  function P() {
    const [sel, select] = useSelection();
    return (
      <ListDetailPage storageKey="cq" header={{ title: 'Things' }}
        list={<Pressable onPress={() => select('a')}>{() => <Text>row a</Text>}</Pressable>}
        detail={sel ? <Probe /> : null} />
    );
  }
  // 160 columns of terminal (1280 px), but the detail pane beside the list has less than 125 columns (1000 px).
  const r = routed(() => <P />, '/page?sel=a');
  t = await drawTest(r.element, { width: 160, height: 14 });
  let f = await t.settle();
  f = await t.settle();
  expect(f).toContain('detail narrow');
  // The list hidden: the detail takes the whole width and the same question answers again.
  t.mockInput.pressKey('\\');
  f = await t.settle();
  f = await t.settle();
  expect(f).toContain('detail roomy');
});

// The page's own width is unknown until its first layout; a pane narrower than BOTH_PANES_COLS must not draw both panes
// in that first frame (Computers detail at 120x40: page box 93, settle() saw the split before the measure landed).
test('a detail mounted in a pane under BOTH_PANES_COLS is one pane from its very first frame', async () => {
  let show: (v: boolean) => void = () => {};
  function Late() {
    const [on, set] = useState(false);
    show = set;
    return <PaneSize width={93} grow={0} shrink={0}>{on ? <Page /> : <Text>waiting</Text>}</PaneSize>;
  }
  const r = routed(() => <Late />, '/page?sel=one');
  t = await drawTest(r.element, { width: 120, height: 14 });
  show(true);
  const frames: string[] = [];
  for (let i = 0; i < 8; i++) { await t.renderOnce(); frames.push(t.captureCharFrame()); await new Promise((res) => setTimeout(res, 5)); }
  const drawn = frames.filter((f) => f.includes('detail of one'));
  expect(drawn.length).toBeGreaterThan(0);
  for (const f of drawn) expect(f).not.toContain('row two');
});
