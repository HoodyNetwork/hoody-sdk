// A Scroll with no size of its own is as tall as its content, at most the room it is given (CSS overflow: auto in an
// auto-height column). The engine's scrollbox took the height of the nearest sized ancestor instead: a 6-row picker
// list stood 281 rows tall in Bots settings > Helpers, and every box around it was measured shorter than its child.
import { expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Scroll, Text } from './index';

const lines = (n: number) => Array.from({ length: n }, (_, i) => <Text key={i}>{`row ${i}`}</Text>);
type H = { height: number } | null;
type Refs = { outer: (n: unknown) => void; scroll: (n: unknown) => void };

async function heights(node: (refs: Refs) => ReactNode, rows = 40) {
  const got: { outer: H; scroll: H } = { outer: null, scroll: null };
  const refs: Refs = { outer: (n) => { if (n) got.outer = n as H; }, scroll: (n) => { if (n) got.scroll = n as H; } };
  const t = await drawTest(<FocusRoot>{node(refs)}</FocusRoot>, { width: 30, height: rows });
  const f = await t.settle();
  const out = { outer: got.outer?.height, scroll: got.scroll?.height, frame: f.split('\n').map((l) => l.trimEnd()) };
  t.renderer.destroy();
  return out;
}

test('in an auto-height column: as tall as its content, and what follows comes right after it', async () => {
  const r = await heights(({ outer, scroll }) => (
    <Box dir="column" height={40}>
      <Box dir="column" boxRef={outer}>
        <Text>head</Text>
        <Box dir="column" shrink={1}><Scroll dir="column" shrink={1} minHeight={1} scrollRef={scroll}>{lines(6)}</Scroll></Box>
        <Text>after</Text>
      </Box>
    </Box>
  ));
  expect(r.scroll).toBe(6);
  expect(r.outer).toBe(8);
  expect(r.frame.slice(0, 8)).toEqual(['head', 'row 0', 'row 1', 'row 2', 'row 3', 'row 4', 'row 5', 'after']);
});

test('content taller than the room: capped at the room, the rest scrolls', async () => {
  const r = await heights(({ scroll }) => (
    <Box dir="column" height={10}>
      <Text shrink={0}>head</Text>
      <Scroll dir="column" shrink={1} minHeight={1} scrollRef={scroll}>{lines(30)}</Scroll>
      <Text shrink={0}>after</Text>
    </Box>
  ), 12);
  expect(r.scroll).toBe(8);
  expect(r.frame[9]).toBe('after');
});

test('a Scroll that grows still fills its parent', async () => {
  const r = await heights(({ scroll }) => (
    <Box dir="column" height={20}><Scroll dir="column" grow={1} scrollRef={scroll}>{lines(3)}</Scroll></Box>
  ), 20);
  expect(r.scroll).toBe(20);
});
