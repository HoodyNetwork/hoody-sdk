// Text truncate cuts plain text at the END with one "…" cell, and shows it whole when room returns.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot, Text } from '../prim';

test('truncate: end cut with one ellipsis cell, whole again when the row widens', async () => {
  let setW!: (n: number) => void;
  const App = () => { const [w, s] = useState(12); setW = s; return <FocusRoot><Box dir="row" width={w}><Text truncate>deploy-production-west</Text></Box></FocusRoot>; };
  const t = await drawTest(<App />, { width: 30, height: 2 });
  for (let i = 0; i < 4; i++) await t.renderOnce();
  expect(t.captureCharFrame().split('\n')[0]!.trimEnd()).toBe('deploy-prod…');
  setW(30);
  for (let i = 0; i < 4; i++) await t.renderOnce();
  expect(t.captureCharFrame().split('\n')[0]!.trimEnd()).toBe('deploy-production-west');
  t.renderer.destroy();
});

// A truncated Text in a COLUMN parent is one row tall: its natural size is a width, never a main-axis basis
// (a basis in a column is the height: a 30-cell line asked for 30 rows and pushed its siblings off the screen).
test('truncate in a column parent: one row each, later siblings still draw', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={60}>
      <Text>one</Text>
      <Text truncate>a truncated line of thirty cells!!</Text>
      <Text truncate>b</Text>
      <Text>plain c</Text>
    </Box></FocusRoot>, { width: 60, height: 10 });
  for (let i = 0; i < 4; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  expect(rows.slice(0, 4)).toEqual(['one', 'a truncated line of thirty cells!!', 'b', 'plain c']);
  t.renderer.destroy();
});

test('truncate in a narrow column parent: cut to the parent width, still one row', async () => {
  const t = await drawTest(
    <FocusRoot><Box dir="column" width={12}><Text truncate>deploy-production-west</Text><Text>next</Text></Box></FocusRoot>,
    { width: 30, height: 4 });
  for (let i = 0; i < 4; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  expect(rows.slice(0, 2)).toEqual(['deploy-prod…', 'next']);
  t.renderer.destroy();
});
