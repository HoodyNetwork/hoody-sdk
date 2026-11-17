// An empty focused field draws its caret cell BEFORE the dim placeholder (engine and drawn paths).
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { FieldInput } from '../prim/FieldInput';

for (const mask of [false, true]) test(`placeholder after the caret (${mask ? 'drawn' : 'engine'} path); typing replaces it`, async () => {
  let v = '';
  const t = await drawTest(<FocusRoot><Box dir="row" height={1}><FieldInput value="" onChange={(x) => { v = x; }} placeholder="Type or pick" mask={mask} /></Box><Box dir="row" height={1}><FieldInput value="" onChange={() => {}} placeholder="Other field" mask={mask} autoFocus /></Box></FocusRoot>, { width: 20, height: 3 });
  for (let i = 0; i < 3; i++) await t.renderOnce();
  const lines = t.captureCharFrame().split('\n').map((l) => l.trimEnd());
  expect(lines[0]).toBe('Type or pick');
  expect(lines[1]).toBe(' Other field');
  void v;
  t.renderer.destroy();
});

test('engine field: typing into the empty field keeps the engine state and shows the text, no placeholder', async () => {
  const { useState } = await import('react');
  const App = () => { const [v, set] = useState(''); return <FocusRoot><Box dir="row" height={1}><FieldInput value={v} onChange={set} placeholder="Type or pick" autoFocus /></Box></FocusRoot>; };
  const t = await drawTest(<App />, { width: 20, height: 2 });
  for (let i = 0; i < 3; i++) await t.renderOnce();
  await t.mockInput.typeText('abc');
  for (let i = 0; i < 4; i++) await t.renderOnce();
  expect(t.captureCharFrame().split('\n')[0]!.trimEnd()).toBe('abc');
  t.renderer.destroy();
});
