// An inactive FocusRoot draws no focus (it comes back on reactivation); blur(); inField().
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../prim/testing';
import { FocusRoot, Pressable, Text, useFocusControl, type FocusControl } from '../prim';
import { FieldInput } from '../prim/FieldInput';

test('focused reads false while the root is inactive and true again after', async () => {
  let setOn!: (b: boolean) => void;
  const App = () => {
    const [on, set] = useState(true);
    setOn = set;
    return <FocusRoot active={on}><Pressable autoFocus focusPaint={false}>{({ focused }) => <Text>{focused ? 'FOCUSED' : 'idle'}</Text>}</Pressable></FocusRoot>;
  };
  const t = await drawTest(<App />, { width: 20, height: 2 });
  await t.renderOnce();
  expect(t.captureCharFrame()).toContain('FOCUSED');
  setOn(false); await t.renderOnce(); await t.renderOnce();
  expect(t.captureCharFrame()).toContain('idle');
  setOn(true); await t.renderOnce(); await t.renderOnce();
  expect(t.captureCharFrame()).toContain('FOCUSED');
  t.renderer.destroy();
});

test('FocusControl.inField and blur', async () => {
  let c!: FocusControl;
  const Grab = () => { c = useFocusControl(); return null; };
  const t = await drawTest(<FocusRoot><Grab /><FieldInput value="" onChange={() => {}} autoFocus /></FocusRoot>, { width: 20, height: 2 });
  await t.renderOnce();
  expect(c.inField()).toBe(true);
  c.blur();
  expect(c.current()).toBeNull();
  expect(c.inField()).toBe(false);
  t.renderer.destroy();
});

test('an autoFocus inside a following Scroll does not scroll it; Tab does', async () => {
  const { Scroll, Box } = await import('../prim');
  const rows = Array.from({ length: 12 }, (_, i) => i);
  const t = await drawTest(
    <FocusRoot><Scroll followFocus height={4}><Box>{rows.map((i) => <Text key={i}>{`line ${i}`}</Text>)}<Pressable autoFocus focusPaint={false}>{({ focused }) => <Text>{focused ? 'AUTO*' : 'auto'}</Text>}</Pressable><Pressable focusPaint={false}><Text>next</Text></Pressable></Box></Scroll></FocusRoot>,
    { width: 20, height: 4 });
  await t.renderOnce(); await t.renderOnce();
  expect(t.captureCharFrame()).toContain('line 0');
  t.mockInput.pressTab(); await t.renderOnce(); await t.renderOnce();
  expect(t.captureCharFrame()).toContain('next');
  t.renderer.destroy();
});
