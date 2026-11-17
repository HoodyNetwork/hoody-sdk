// Inert disabled/read-only controls and the one press-propagation rule (Box.ts pressHandlers).
import { expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Pressable, Text, TextInput, type Focusable } from '../prim';
import { FieldInput } from '../prim/FieldInput';

const draw = (node: ReactNode, width = 40, height = 6) => drawTest(<FocusRoot>{node}</FocusRoot>, { width, height });

test('a disabled TextInput: a click does not focus it, typing and paste change nothing, no callback', async () => {
  const changes: string[] = [];
  function F() {
    const [v, setV] = useState('locked');
    return <TextInput value={v} disabled onChange={(x) => { changes.push(x); setV(x); }} width={20} />;
  }
  const t = await draw(<F />);
  await t.mockMouse.click(2, 0); await t.settle();
  await t.mockInput.typeText('Z'); await t.settle();
  await t.mockInput.pasteBracketedText?.('PASTE'); await t.settle();
  expect(changes).toEqual([]);
  expect(t.captureCharFrame()).toContain('locked');
  expect(t.captureCharFrame()).not.toContain('Z');
  t.renderer.destroy();
});

test('a disabled FieldInput: click, type and paste are inert', async () => {
  const changes: string[] = [];
  const t = await draw(<FieldInput value="locked" disabled onChange={(x) => changes.push(x)} width={20} />);
  await t.mockMouse.click(2, 0); await t.settle();
  await t.mockInput.typeText('Z'); await t.settle();
  expect(changes).toEqual([]);
  t.renderer.destroy();
});

test('focus() on a disabled control is refused; becoming disabled gives the focus up', async () => {
  const h: { current: Focusable | null } = { current: null };
  let setOff: (b: boolean) => void = () => {};
  let presses = 0;
  function P() {
    const [off, set] = useState(false);
    setOff = set;
    return <Pressable handle={h} disabled={off} onPress={() => { presses++; }}><Text>Go</Text></Pressable>;
  }
  const t = await draw(<P />);
  h.current!.focus(); await t.settle();
  expect(h.current!.focused).toBe(true);
  setOff(true); await t.settle();
  expect(h.current!.focused).toBe(false);
  h.current!.focus(); await t.settle();
  expect(h.current!.focused).toBe(false);
  t.mockInput.pressEnter(); await t.settle();
  expect(presses).toBe(0);
  t.renderer.destroy();
});

test('a click on a button inside a clickable row presses the button only', async () => {
  const hits: string[] = [];
  const t = await draw(
    <Pressable dir="row" onPress={() => hits.push('row')}>
      <Text>row </Text>
      <Pressable onPress={() => hits.push('button')}><Text>[Btn]</Text></Pressable>
    </Pressable>,
  );
  await t.mockMouse.click(6, 0); await t.settle();
  expect(hits).toEqual(['button']);
  await t.mockMouse.click(1, 0); await t.settle();
  expect(hits).toEqual(['button', 'row']);
  t.renderer.destroy();
});

test('a click on a DISABLED button inside a clickable row fires nothing', async () => {
  const hits: string[] = [];
  const t = await draw(
    <Pressable dir="row" onPress={() => hits.push('row')}>
      <Text>row </Text>
      <Pressable disabled onPress={() => hits.push('button')}><Text>[Btn]</Text></Pressable>
    </Pressable>,
  );
  await t.mockMouse.click(6, 0); await t.settle();
  expect(hits).toEqual([]);
  t.renderer.destroy();
});

test('press is primary-button down AND up on the same box: right button and drag-off do nothing', async () => {
  let n = 0;
  const t = await draw(<Box dir="row"><Pressable onPress={() => { n++; }}><Text>[Go]</Text></Pressable><Text>     elsewhere</Text></Box>);
  await t.mockMouse.click(1, 0, 2 as never); await t.settle();
  expect(n).toBe(0);
  await t.mockMouse.pressDown(1, 0); await t.settle();
  await t.mockMouse.release(12, 0); await t.settle();
  expect(n).toBe(0);
  await t.mockMouse.click(1, 0); await t.settle();
  expect(n).toBe(1);
  t.renderer.destroy();
});

test('a drag off a control (down, motion, up elsewhere) never presses it; a drag that comes back onto it does', async () => {
  let n = 0;
  let row = 0;
  // The control is wider than its word: a down on its own blank cells hits the control itself.
  const t = await draw(
    <Box dir="column">
      <Box dir="row" onPress={() => { row++; }}><Pressable width={8} onPress={() => { n++; }}><Text>[Go]</Text></Pressable><Text>     elsewhere</Text></Box>
      <Text>plain text, no control</Text>
    </Box>,
  );
  await t.mockMouse.drag(6, 0, 14, 0); await t.settle();
  expect(n).toBe(0);
  expect(row).toBe(0);
  // Released back on the control after moving: the browser's click.
  await t.mockMouse.drag(6, 0, 2, 0); await t.settle();
  expect(n).toBe(1);
  // A cancelled press leaves nothing armed, whether it ends over another control's row or over plain text: a later up
  // on the control with no down on it presses nothing.
  await t.mockMouse.drag(6, 0, 14, 0); await t.settle();
  await t.mockMouse.release(6, 0); await t.settle();
  expect(n).toBe(1);
  await t.mockMouse.drag(6, 0, 3, 1); await t.settle();
  await t.mockMouse.release(6, 0); await t.settle();
  expect(n).toBe(1);
  expect(row).toBe(0);
  t.renderer.destroy();
});

test('compat: <div role=button onClick> around <button onClick>: a click on the button fires the button only', async () => {
  const hits: string[] = [];
  const t = await draw(
    <div role="button" onClick={() => hits.push('row')} style={{}}>
      <span>row </span>
      <button onClick={() => hits.push('button')}>Btn</button>
    </div>,
  );
  const f = t.captureCharFrame().split('\n');
  const y = f.findIndex((l) => l.includes('Btn'));
  const x = f[y]!.indexOf('Btn');
  await t.mockMouse.click(x, y); await t.settle();
  expect(hits).toEqual(['button']);
  t.renderer.destroy();
});

test('compat: a clickable span is reachable by Tab and pressed by Enter', async () => {
  let n = 0;
  const t = await draw(<div><span onClick={() => { n++; }}>open</span></div>);
  t.mockInput.pressTab(); await t.settle();
  t.mockInput.pressEnter(); await t.settle();
  expect(n).toBe(1);
  t.renderer.destroy();
});
