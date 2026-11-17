import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, Text } from '../../term/prim';
import { ComputerMark } from './ComputerMark';

test('ComputerMark: one coloured cell before the name, inside or outside running text; nothing for no colour', async () => {
  const t = await drawTest(<Box dir="column"><Box dir="row"><ComputerMark color="#e07a5f" /><Text> atlas</Text></Box><Text><ComputerMark color="#81b29a" /> borealis</Text><Box dir="row"><ComputerMark color="nope" /><Text>plain</Text></Box></Box>, { width: 30, height: 4 });
  const f = await t.settle();
  const lines = f.split('\n');
  expect(lines[0]).toMatch(/^\S atlas/);
  expect(lines[1]).toMatch(/^\S borealis/);
  expect(lines[2]).toMatch(/^plain/);
  t.renderer.destroy();
});
