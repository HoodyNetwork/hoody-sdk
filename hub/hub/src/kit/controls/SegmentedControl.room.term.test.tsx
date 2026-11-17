// SegmentedControl.term measures the ROOM it is given, never what it draws (the AI chat-list toolbar: once a narrow
// first layout drew the Select, the box shrank to the Select and the segments never came back, so goldens flapped
// between "‹ This computer ›  All computers" and "│ This computer ▾"). The same box asks for the segments' width in
// both modes, so narrow -> Select and wide again -> segments, and the control is the same width either way.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { SegmentedControl, type SegmentItem } from './SegmentedControl';

const items: SegmentItem[] = [
  { id: 'here', label: 'This computer' },
  { id: 'all', label: 'All computers' },
];

let setRoom: (n: number) => void = () => {};
function Row() {
  const [room, set] = useState(20);
  setRoom = set;
  return (
    <FocusRoot>
      <Box dir="row" width={room} gap={1}>
        <SegmentedControl label="Where" items={items} value="here" onChange={() => {}} />
        <Text>↻</Text>
      </Box>
    </FocusRoot>
  );
}

test('narrow first: the Select; given room later, the segments come back; narrow again: the Select', async () => {
  const t = await drawTest(<Row />, { width: 80, height: 4 });
  let f = await t.settle();
  expect(f).toContain('This computer ▾');
  setRoom(60);
  await t.settle();
  f = await t.settle();
  expect(f).toContain('‹ This computer ›  All computers');
  setRoom(20);
  await t.settle();
  f = await t.settle();
  expect(f).toContain('This computer ▾');
  expect(f).not.toContain('All computers');
  t.renderer.destroy();
});

test('with room from the start: the segments, and the next item right after them (the box is the segments\' width)', async () => {
  const t = await drawTest(<Row />, { width: 80, height: 4 });
  setRoom(60);
  const f = await t.settle();
  expect(f).toContain('‹ This computer ›  All computers   ↻');
  t.renderer.destroy();
});

// fullWidth beside another grow item (the AI chat-list toolbar: a spacer, then the scope control). The control's basis
// must be the segments' width in BOTH modes: a basis of what is drawn (the narrower Select) gives the Select a smaller
// share of the free room, so a row with room for the segments had a second stable layout, stuck on the Select, and
// which one a frame showed depended on the first layout's timing.
let setWide: (n: number) => void = () => {};
function Toolbar() {
  const [room, set] = useState(20);
  setWide = set;
  return (
    <FocusRoot>
      <Box dir="row" width={room}>
        <Box grow={1} shrink={1}><Text>Filters ·</Text></Box>
        <SegmentedControl label="Where" items={items} value="here" fullWidth onChange={() => {}} />
      </Box>
    </FocusRoot>
  );
}

test('fullWidth beside a grow sibling: narrow first, then room for the segments: the segments come back', async () => {
  const t = await drawTest(<Toolbar />, { width: 80, height: 4 });
  let f = await t.settle();
  expect(f).toContain('▾');
  expect(f).not.toContain('All computers');
  setWide(52);
  await t.settle();
  f = await t.settle();
  expect(f).toContain('‹ This computer ›  All computers');
  t.renderer.destroy();
});

test('fullWidth beside a grow sibling, wide from the start: the same segments (one layout per width)', async () => {
  const t = await drawTest(<Toolbar />, { width: 80, height: 4 });
  setWide(52);
  const f = await t.settle();
  expect(f).toContain('‹ This computer ›  All computers');
  t.renderer.destroy();
});
