// The focus-scope API.
import { expect, test } from 'bun:test';
import { useRef, useState } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Pressable, Scroll, Text, useFocusControl, useFocusWithin, type FocusControl } from '../prim';
import type { BoxRenderable } from '../prim/otui';

test('an inactive FocusRoot takes no key; active again, its focus is where it was', async () => {
  let hits = 0;
  let setOn: (b: boolean) => void = () => {};
  function App() {
    const [on, set] = useState(true);
    setOn = set;
    return <FocusRoot active={on}><Pressable onPress={() => { hits++; }}><Text>[A]</Text></Pressable></FocusRoot>;
  }
  const t = await drawTest(<App />, { width: 20, height: 3 });
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(hits).toBe(1);
  setOn(false); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(hits).toBe(1);
  setOn(true); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(hits).toBe(2);
  t.renderer.destroy();
});

test('focusFirst, moveFocus, containsFocus and useFocusWithin', async () => {
  let ctl!: FocusControl;
  const seen: boolean[] = [];
  let inner!: { current: BoxRenderable | null };
  function Body() {
    ctl = useFocusControl();
    const ref = useRef<BoxRenderable | null>(null);
    inner = ref;
    useFocusWithin(ref, (b) => seen.push(b));
    return (
      <Box>
        <Pressable onPress={() => {}}><Text>[out]</Text></Pressable>
        <Box boxRef={ref}><Pressable onPress={() => {}}><Text>[in1]</Text></Pressable><Pressable onPress={() => {}}><Text>[in2]</Text></Pressable></Box>
      </Box>
    );
  }
  const t = await drawTest(<FocusRoot><Body /></FocusRoot>, { width: 20, height: 5 });
  expect(ctl.focusFirst()).toBe(true); await t.settle();
  expect(ctl.containsFocus(inner.current)).toBe(false);
  ctl.moveFocus(1); await t.settle();
  ctl.moveFocus(1); await t.settle();
  expect(ctl.containsFocus(inner.current)).toBe(true);
  ctl.moveFocus(1); await t.settle();
  expect(seen).toEqual([true, false]);
  t.renderer.destroy();
});

test('Tab skips a focusable clipped away by a scroll that does not follow focus', async () => {
  const pressed: string[] = [];
  const rows = (n: number) => Array.from({ length: n }, (_, i) => <Text key={i}>line {i}</Text>);
  const t = await drawTest(
    <FocusRoot>
      <Box>
        <Pressable onPress={() => pressed.push('top')}><Text>[top]</Text></Pressable>
        <Scroll height={3}>{rows(6)}<Pressable onPress={() => pressed.push('hidden')}><Text>[hidden]</Text></Pressable></Scroll>
        <Pressable onPress={() => pressed.push('bottom')}><Text>[bottom]</Text></Pressable>
      </Box>
    </FocusRoot>, { width: 30, height: 8 });
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(pressed).toEqual(['bottom']);
  t.renderer.destroy();
});

test('focusFirst(within) focuses the first tab stop inside a box; compat fields accept setSelectionRange', async () => {
  let ctl!: FocusControl;
  let box!: { current: BoxRenderable | null };
  let input: { setSelectionRange(a: number, b: number): void; selectionStart: number } | null = null;
  function Body() {
    ctl = useFocusControl();
    box = useRef<BoxRenderable | null>(null);
    return (
      <Box>
        <Pressable onPress={() => {}}><Text>[out]</Text></Pressable>
        <Box boxRef={box}><Pressable onPress={() => {}}><Text>[in]</Text></Pressable></Box>
        <input ref={(e) => { input = e as never; }} value="abc" onChange={() => {}} />
      </Box>
    );
  }
  const t = await drawTest(<FocusRoot><Body /></FocusRoot>, { width: 20, height: 6 });
  expect(ctl.focusFirst(box.current)).toBe(true); await t.settle();
  expect(ctl.containsFocus(box.current)).toBe(true);
  input!.setSelectionRange(0, 1);
  expect(input!.selectionStart).toBe(3);
  t.renderer.destroy();
});
