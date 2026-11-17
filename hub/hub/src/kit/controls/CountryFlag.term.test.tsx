import { expect, test } from 'bun:test';
import { FocusRoot, Text } from '../../term/prim';
import { drawTest } from '../../term/prim/testing';
import { CountryFlag } from './CountryFlag';

test('draws the code as text, never the emoji; nothing for an unknown code', async () => {
  const t = await drawTest(<FocusRoot><Text>Host <CountryFlag code="sg" label="Singapore" /> n12</Text><CountryFlag code="x1" /></FocusRoot>, { width: 40, height: 3 });
  const f = await t.settle();
  expect(f).toContain('Host SG n12');
  expect(f).not.toMatch(/[\u{1F1E6}-\u{1F1FF}]/u);
  expect(f).not.toContain('X1');
  t.renderer.destroy();
});
