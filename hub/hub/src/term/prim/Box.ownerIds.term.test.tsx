// A box's owner id (test mode: the components that made it, read by the layout checks for a fault's path) does not
// depend on how many elements React made in the last second. React keeps an owner stack for the first 10,000 elements
// of a second only; before, a box made after that had no id, and the same layout fault was reported under a different
// path from one run to the next (goldens: the page's fault list changed on an unchanged tree).
import { expect, test } from 'bun:test';
import * as React from 'react';
import { createElement } from 'react';
import { drawTest } from './testing';
import { Box, Text } from '.';
import { layoutFaults } from './layoutcheck';

function Shelf() {
  // Two siblings on the same cells: one overdraw fault, named by its owner.
  return <Box dir="row" width={10} height={1}><Box width={8} shrink={0}><Text>abcdefgh</Text></Box><Box width={8} shrink={0}><Text>ijklmnop</Text></Box></Box>;
}
const faultPaths = async (): Promise<string[]> => {
  const t = await drawTest(<Shelf />, { width: 30, height: 4 });
  try { return layoutFaults((t.renderer as unknown as { root: never }).root, { cols: 30, rows: 4 }).map((f) => `${f.kind} ${f.path}`); } finally { t.renderer.destroy(); }
};

test('a fault path names the owner whatever was drawn before (past React\'s 10,000 elements a second too)', async () => {
  const quiet = await faultPaths();
  expect(quiet.length).toBeGreaterThan(0);
  expect(quiet.join('\n')).toContain('Shelf');
  // A busy second: more elements than React keeps owner stacks for.
  for (let i = 0; i < 12_000; i++) createElement('x', null);
  expect(await faultPaths()).toEqual(quiet);
});

test('React\'s owner-stack count is held at zero in test mode (direct: no element count or timer can move it)', () => {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { recentlyCreatedOwnerStacks: number } }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  expect('recentlyCreatedOwnerStacks' in internals).toBe(true);
  for (let i = 0; i < 20_000; i++) createElement('x', null);
  expect(internals.recentlyCreatedOwnerStacks).toBe(0);
  internals.recentlyCreatedOwnerStacks = 50_000;
  internals.recentlyCreatedOwnerStacks++;
  expect(internals.recentlyCreatedOwnerStacks).toBe(0);
});
