// useSizeClass in the terminal: the class comes from the pane's columns at 8 px a cell (no ResizeObserver, which the
// strict globals trap), so a conversation in a narrow dock takes the small layout and a wide pane the wide one.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, PaneSize, Text } from '../../term/prim';
import { activeStrictGlobals } from '../../term/env/strict-globals';
import { useSizeClass } from './useSizeClass';

function Probe() {
  const [, c] = useSizeClass();
  return <Text>{'class=' + c}</Text>;
}

test('the class follows the pane width, with no browser global read', async () => {
  const before = activeStrictGlobals()?.ledger().length ?? 0;
  const t = await drawTest(
    <Box dir="row" width={200} height={3}>
      <PaneSize width={60} grow={0}><Probe /></PaneSize>
      <PaneSize width={120} grow={0}><Probe /></PaneSize>
    </Box>, { width: 200, height: 3 });
  const f = await t.settle();
  expect(f).toContain('class=xs'); // 480 px
  expect(f).toContain('class=m'); // 960 px
  expect((activeStrictGlobals()?.ledger() ?? []).slice(before).map((r) => r.name)).toEqual([]);
  t.renderer.destroy();
});
