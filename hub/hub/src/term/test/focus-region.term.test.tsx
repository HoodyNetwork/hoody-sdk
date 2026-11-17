// Tab order by region: Tab goes through the FocusRegions in their order (the web's DOM order:
// sidebar, top bar, page) and by drawn position only inside one; Shift+Tab is the exact reverse; F6 / Shift+F6 jump to
// the next / previous region (the web's skip link). A FocusRoot inside a region starts with no region.
import { expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRegion, FocusRoot, Pressable, Text, useFocusControl, type FocusControl } from '../prim';

/** The shell's shape: a top bar drawn first, then a sidebar beside a page whose rows interleave with the sidebar's. */
function Shell({ seen, ctl }: { seen: string[]; ctl?: (c: FocusControl) => void }) {
  const P = ({ n }: { n: string }) => <Pressable onPress={() => {}} onKey={(k) => { if (k.name === 'x') seen.push(n); return k.name === 'x'; }}><Text>[{n}]</Text></Pressable>;
  function Grab() { ctl?.(useFocusControl()); return null; }
  return (
    <FocusRoot>
      <Grab />
      <Box dir="column" width="100%" height="100%">
        <FocusRegion order={1}><Box dir="row" height={1}><P n="top1" /><P n="top2" /></Box></FocusRegion>
        <Box dir="row" grow={1}>
          <FocusRegion order={0}><Box dir="column" width={10}><P n="side1" /><P n="side2" /><P n="side3" /></Box></FocusRegion>
          <FocusRegion order={2}><Box dir="column" grow={1}><P n="page1" /><P n="page2" /><P n="page3" /></Box></FocusRegion>
        </Box>
      </Box>
    </FocusRoot>
  );
}
const WEB_ORDER = ['side1', 'side2', 'side3', 'top1', 'top2', 'page1', 'page2', 'page3'];

/** Which control has the focus: `x` is taken only by the focused one, which records its name. */
async function focusedName(t: TestTerm, seen: string[]): Promise<string | undefined> {
  seen.length = 0;
  t.mockInput.pressKey('x'); await t.settle();
  return seen[0];
}

test('Tab goes region by region in the regions order, drawn position only inside one', async () => {
  const seen: string[] = [];
  const t = await drawTest(<Shell seen={seen} />, { width: 40, height: 6 });
  const got: string[] = [];
  for (let i = 0; i < WEB_ORDER.length + 1; i++) {
    t.mockInput.pressTab(); await t.settle();
    got.push((await focusedName(t, seen)) ?? '-');
  }
  // Old code (drawn position over the whole screen): top1 top2 side1 page1 side2 page2 side3 page3.
  expect(got).toEqual([...WEB_ORDER, 'side1']);
  t.renderer.destroy();
}, 30000);

test('Shift+Tab is the exact reverse', async () => {
  const seen: string[] = [];
  const t = await drawTest(<Shell seen={seen} />, { width: 40, height: 6 });
  const got: string[] = [];
  for (let i = 0; i < WEB_ORDER.length + 1; i++) {
    t.mockInput.pressTab({ shift: true }); await t.settle();
    got.push((await focusedName(t, seen)) ?? '-');
  }
  expect(got).toEqual([...WEB_ORDER].reverse().concat('page3'));
  t.renderer.destroy();
}, 30000);

test('F6 jumps to the first stop of the next region, Shift+F6 of the previous; nothing focused: F6 enters the last', async () => {
  const seen: string[] = [];
  let ctl!: FocusControl;
  const t = await drawTest(<Shell seen={seen} ctl={(c) => { ctl = c; }} />, { width: 40, height: 6 });
  const f6 = async (shift = false) => { t.mockInput.pressKey('F6', shift ? { shift: true } : undefined); await t.settle(); return focusedName(t, seen); };
  expect(await f6()).toBe('page1');
  expect(await f6()).toBe('side1');
  t.mockInput.pressTab(); await t.settle();
  expect(await f6()).toBe('top1');
  expect(await f6()).toBe('page1');
  expect(await f6(true)).toBe('top1');
  expect(await f6(true)).toBe('side1');
  expect(await f6(true)).toBe('page1');
  expect(ctl.moveRegion(1)).toBe(true); await t.settle();
  expect(await focusedName(t, seen)).toBe('side1');
  t.renderer.destroy();
}, 30000);

test('a scope without regions: Tab is drawn position as before, F6 moves nothing and reaches the shortcut handlers', async () => {
  const seen: string[] = [];
  let ctl!: FocusControl;
  function Body() {
    ctl = useFocusControl();
    return <Box dir="column"><Pressable onPress={() => seen.push('a')}><Text>[a]</Text></Pressable><Pressable onPress={() => seen.push('b')}><Text>[b]</Text></Pressable></Box>;
  }
  const t = await drawTest(<FocusRoot><Body /></FocusRoot>, { width: 20, height: 4 });
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressKey('F6'); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(seen).toEqual(['a', 'b']);
  expect(ctl.moveRegion(1)).toBe(false);
  t.renderer.destroy();
}, 30000);

test('a FocusRoot inside a region starts with no region (a layer keeps its own order)', async () => {
  const seen: string[] = [];
  const t = await drawTest(
    <FocusRoot active={false}>
      <FocusRegion order={5}>
        <FocusRoot>
          <Box dir="column">
            <Pressable onPress={() => seen.push('first')}><Text>[first]</Text></Pressable>
            <FocusRegion order={9}><Pressable onPress={() => seen.push('second')}><Text>[second]</Text></Pressable></FocusRegion>
          </Box>
        </FocusRoot>
      </FocusRegion>
    </FocusRoot>, { width: 20, height: 4 });
  // In the inner root `first` has no region (after every region), `second` is in region 9: Tab reaches `second` first.
  // Had the inner root inherited region 5, `first` (5) would come before `second` (9).
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(seen).toEqual(['second']);
  t.renderer.destroy();
}, 30000);
