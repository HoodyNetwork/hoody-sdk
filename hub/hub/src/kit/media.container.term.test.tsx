// useContainerNarrow with a ref, in the terminal: the element's own laid-out width (the web's ResizeObserver on that
// element), not its pane's. Files' toolbar sits in a scrolling body whose scrollbar takes a column: judged at the pane
// it missed its stacked tier by one column at 80x24.
import { afterEach, expect, test } from 'bun:test';
import { useRef, useState } from 'react';
import { drawTest, type TestTerm } from '../term/prim/testing';
import { Box, PaneSize, Text } from '../term/prim';
import { useContainerNarrow } from './media';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

let setW: ((w: number) => void) | null = null;
function Bar({ px }: { px: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, set] = useState(50);
  setW = set;
  const narrow = useContainerNarrow(px, ref);
  return (
    <Box dir="column">
      <Box width={w} dir="column"><div ref={ref}>{'bar'}</div></Box>
      <Text>{narrow ? 'NARROW' : 'WIDE'}</Text>
    </Box>
  );
}

test('a ref is judged at its element\'s own width, re-read after every layout (resize included)', async () => {
  // The pane is 80 columns; the bar is 50. 60 columns = 480 px: narrow for the bar, not for the pane.
  t = await drawTest(<PaneSize><Bar px={60 * 8} /></PaneSize>, { width: 80, height: 4 });
  await t.settle();
  expect(await t.settle()).toContain('NARROW');
  setW!(70);
  await t.settle();
  expect(await t.settle()).toContain('WIDE');
  setW!(59);
  await t.settle();
  expect(await t.settle()).toContain('NARROW');
});

test('one column under the line is narrow (the scrollbar column counts against the bar)', async () => {
  t = await drawTest(<PaneSize><Bar px={51 * 8} /></PaneSize>, { width: 80, height: 4 });
  await t.settle();
  expect(await t.settle()).toContain('NARROW');
  setW!(51);
  await t.settle();
  expect(await t.settle()).toContain('WIDE');
});
