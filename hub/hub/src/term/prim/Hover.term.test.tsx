// Hover (prim/Hover.ts) on a Pressable that draws its own states: only a pointer move sets it; one part at a time; a
// disabled part never; a part that goes away takes its hover with it; a caller's own pointer handlers still run. Under a
// pointer that does not move: a leaf of the hovered part changing keeps the hover, a part sliding under the pointer takes
// it. Crossing from leaf to leaf inside one part redraws nothing. The terminal losing the focus drops it.
import { afterEach, expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest, type TestTerm } from './testing';
import { Box, FocusRoot, Pressable, ScreenRoot, Text } from './index';
import { __resetHover, clearHover, useHover, type Hover } from './Hover';
import { TRUECOLOR } from './tokens';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; __resetHover(); });

const Row = ({ name, disabled, raw }: { name: string; disabled?: boolean; raw?: Record<string, unknown> }) => (
  <Pressable dir="row" height={1} width={20} disabled={disabled} {...(raw ? { raw } : {})}>
    {({ focused, hovered }) => <Text>{`${name}:${focused ? 'F' : '-'}${hovered ? 'H' : '-'}`}</Text>}
  </Pressable>
);

test('a move sets hover on the part under the pointer, and on one part only', async () => {
  t = await drawTest(<FocusRoot><Box dir="column"><Row name="a" /><Row name="b" /></Box></FocusRoot>, { width: 30, height: 4 });
  expect(await t.settle()).toContain('a:--');
  await t.mockMouse.moveTo(1, 0);
  let f = await t.settle();
  expect(f).toContain('a:-H');
  expect(f).toContain('b:--');
  await t.mockMouse.moveTo(1, 1);
  f = await t.settle();
  expect(f).toContain('a:--');
  expect(f).toContain('b:-H');
  await t.mockMouse.moveTo(25, 3);
  f = await t.settle();
  expect(f).toContain('b:--');
});

test('a click or a wheel step alone sets none; the focused part is not hovered', async () => {
  t = await drawTest(<FocusRoot><Box dir="column"><Row name="a" /><Row name="b" /></Box></FocusRoot>, { width: 30, height: 4 });
  await t.mockMouse.scroll(1, 1, 'down');
  expect(await t.settle()).toContain('b:--');
  await t.mockMouse.click(1, 0);
  let f = await t.settle();
  expect(f).toContain('a:F-');
  await t.mockMouse.moveTo(2, 0);
  f = await t.settle();
  expect(f).toContain('a:F-');
});

test('a click alone leaves no hover behind once the focus has moved on', async () => {
  t = await drawTest(<FocusRoot><Box dir="column"><Row name="a" /><Row name="b" /></Box></FocusRoot>, { width: 30, height: 4 });
  await t.mockMouse.click(1, 0);
  expect(await t.settle()).toContain('a:F-');
  t.mockInput.pressTab();
  const f = await t.settle();
  expect(f).toContain('a:--');
  expect(f).toContain('b:F-');
});

test('a leaf of the hovered part changing under a pointer that does not move keeps the hover', async () => {
  let add: () => void = () => {};
  const App = () => {
    const [badge, setBadge] = useState(false);
    add = () => setBadge(true);
    return (
      <FocusRoot>
        <Pressable dir="row" height={1} width={20}>
          {({ hovered }) => <Box dir="row" grow={1}><Text grow={1}>{`a:${hovered ? 'H' : '-'}`}</Text>{badge && <Text>{' 26 '}</Text>}</Box>}
        </Pressable>
      </FocusRoot>
    );
  };
  t = await drawTest(<App />, { width: 30, height: 4 });
  // The pointer rests where the badge will be drawn.
  await t.mockMouse.moveTo(18, 0);
  expect(await t.settle()).toContain('a:H');
  add();
  const f = await t.settle();
  expect(f).toContain(' 26 ');
  expect(f).toContain('a:H');
});

test('a part that slides under a pointer that does not move takes the hover', async () => {
  let drop: () => void = () => {};
  const App = () => {
    const [top, setTop] = useState(true);
    drop = () => setTop(false);
    return <FocusRoot><Box dir="column">{top ? <Text>heading</Text> : null}<Row name="a" /><Row name="b" /></Box></FocusRoot>;
  };
  t = await drawTest(<App />, { width: 30, height: 4 });
  await t.mockMouse.moveTo(1, 1);
  expect(await t.settle()).toContain('a:-H');
  drop();
  // a is now on row 0 and b on row 1, where the pointer still is.
  const f = await t.settle();
  expect(f.split('\n')[1]).toContain('b:-H');
  expect(f).toContain('a:--');
});

test('crossing from one leaf to the next inside one part redraws nothing', async () => {
  let draws = 0;
  t = await drawTest(
    <FocusRoot>
      <Pressable dir="row" height={1} width={20}>
        {({ hovered }) => { draws++; return <Box dir="row"><Text>{`left:${hovered ? 'H' : '-'}`}</Text><Text>{' right'}</Text></Box>; }}
      </Pressable>
    </FocusRoot>,
    { width: 30, height: 4 },
  );
  await t.mockMouse.moveTo(1, 0);
  expect(await t.settle()).toContain('left:H');
  const before = draws;
  await t.mockMouse.moveTo(9, 0);
  expect(await t.settle()).toContain('left:H');
  expect(draws).toBe(before);
});

test('the terminal losing the focus drops the hover; the next move sets it again', async () => {
  t = await drawTest(<ScreenRoot><FocusRoot><Box dir="column"><Row name="a" /></Box></FocusRoot></ScreenRoot>, { width: 30, height: 4 });
  await t.mockMouse.moveTo(1, 0);
  expect(await t.settle()).toContain('a:-H');
  (t.renderer as unknown as { emit(e: string): void }).emit('blur');
  expect(await t.settle()).toContain('a:--');
  await t.mockMouse.moveTo(2, 0);
  expect(await t.settle()).toContain('a:-H');
});

const hex = (c: { toInts(): number[] }): string => '#' + c.toInts().slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
/** The background of the cell at column x of row y. */
function bgAt(x: number, y: number): string {
  let c = 0;
  for (const sp of t!.captureSpans().lines[y]!.spans) {
    const w = (sp as { width?: number }).width ?? [...sp.text].length;
    if (x < c + w) return hex(sp.bg);
    c += w;
  }
  throw new Error(`no cell at ${x},${y}`);
}

test('one input chunk carrying a move off, the focus lost and a move back keeps the fresh hover', async () => {
  let raw: Hover['raw'] | null = null;
  const Part = () => { const h = useHover(); raw = h.raw; return <Text>{h.hovered ? 'part:H' : 'part:-'}</Text>; };
  t = await drawTest(<Part />, { width: 20, height: 2 });
  raw!.onMouseMove();
  expect(await t.settle()).toContain('part:H');
  // All three before the turn ends: the `out`'s late check must not clear a hover set after the blur dropped its mark.
  raw!.onMouseOut();
  clearHover();
  raw!.onMouseMove();
  await Promise.resolve();
  expect(await t.settle()).toContain('part:H');
  // And an `out` alone still clears at the end of the turn.
  raw!.onMouseOut();
  await Promise.resolve();
  expect(await t.settle()).toContain('part:-');
});

test('hoverFill: the whole box stands on the hover ground, under its words too; never while focused or disabled', async () => {
  t = await drawTest(
    <FocusRoot><Box dir="column">
      <Pressable dir="row" height={1} width={12} hoverFill>{() => <Text>fn</Text>}</Pressable>
      <Pressable dir="row" height={1} width={12} hoverFill focusPaint={false}><Text>plain</Text></Pressable>
      <Pressable dir="row" height={1} width={12} hoverFill disabled><Text>off</Text></Pressable>
      <Pressable dir="row" height={1} width={12}><Text>none</Text></Pressable>
    </Box></FocusRoot>,
    { width: 30, height: 6 },
  );
  await t.settle();
  const rest = bgAt(0, 0);
  for (const y of [0, 1]) {
    await t.mockMouse.moveTo(8, y);
    await t.settle();
    // Under the words and in the empty cells after them, and only in the box.
    expect([bgAt(0, y), bgAt(1, y), bgAt(8, y), bgAt(11, y)]).toEqual([TRUECOLOR.dark.hover, TRUECOLOR.dark.hover, TRUECOLOR.dark.hover, TRUECOLOR.dark.hover]);
    expect(bgAt(12, y)).toBe(rest);
    expect(bgAt(0, y === 0 ? 1 : 0)).toBe(rest);
  }
  // A disabled control and one that did not ask take none.
  for (const y of [2, 3]) {
    await t.mockMouse.moveTo(8, y);
    await t.settle();
    expect(bgAt(0, y)).toBe(rest);
    expect(bgAt(8, y)).toBe(rest);
  }
  // Focused: the pointer on it changes nothing.
  await t.mockMouse.click(8, 1);
  await t.settle();
  const focused = bgAt(8, 1);
  expect(focused).not.toBe(TRUECOLOR.dark.hover);
  await t.mockMouse.moveTo(7, 1);
  await t.settle();
  expect(bgAt(8, 1)).toBe(focused);
});

test('a disabled part is never hovered', async () => {
  t = await drawTest(<FocusRoot><Box dir="column"><Row name="a" disabled /></Box></FocusRoot>, { width: 30, height: 4 });
  await t.mockMouse.moveTo(1, 0);
  expect(await t.settle()).toContain('a:--');
});

test('a part that goes away takes its hover with it', async () => {
  let drop: () => void = () => {};
  const App = () => {
    const [two, setTwo] = useState(true);
    drop = () => setTwo(false);
    return <FocusRoot><Box dir="column">{two ? <Row name="a" /> : null}<Row name="b" /></Box></FocusRoot>;
  };
  t = await drawTest(<App />, { width: 30, height: 4 });
  await t.mockMouse.moveTo(1, 0);
  expect(await t.settle()).toContain('a:-H');
  drop();
  // b is now on row 0, under the place the pointer was: no move happened, so nothing is hovered.
  const f = await t.settle();
  expect(f).not.toContain('a:');
  expect(f).toContain('b:--');
});

test("a caller's own pointer handlers still run", async () => {
  const seen: string[] = [];
  t = await drawTest(<FocusRoot><Row name="a" raw={{ onMouseMove: () => seen.push('move'), onMouseOut: () => seen.push('out') }} /></FocusRoot>, { width: 30, height: 4 });
  await t.mockMouse.moveTo(1, 0);
  expect(await t.settle()).toContain('a:-H');
  await t.mockMouse.moveTo(25, 3);
  expect(await t.settle()).toContain('a:--');
  expect(seen).toContain('move');
  expect(seen).toContain('out');
});
