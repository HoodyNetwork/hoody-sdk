// Container-size context: usePaneSize reads the nearest measured pane, else the terminal.
import { expect, test } from 'bun:test';
import { drawTest } from '../prim/testing';
import { Box, PaneSize, Text, usePaneSize } from '../prim';

function Show({ tag }: { tag: string }) {
  const p = usePaneSize();
  return <Text>{`${tag}:${p.source}:${p.cols}x${p.rows}`}</Text>;
}

test('a pane answers its own measured size; outside, the terminal; a resize re-measures', async () => {
  const t = await drawTest(
    <Box dir="column">
      <Show tag="out" />
      <Box dir="row" height={6}><Box width={10} /><PaneSize><Show tag="in" /></PaneSize></Box>
    </Box>, { width: 50, height: 10 });
  await t.settle(); await t.settle();
  let f = t.captureCharFrame();
  expect(f).toContain('out:terminal:50x10');
  expect(f).toContain('in:pane:40x6');
  t.resize(70, 12); await t.settle(); await t.settle(); await t.settle();
  f = t.captureCharFrame();
  expect(f).toContain('out:terminal:70x12');
  expect(f).toContain('in:pane:60x6');
  t.renderer.destroy();
});
