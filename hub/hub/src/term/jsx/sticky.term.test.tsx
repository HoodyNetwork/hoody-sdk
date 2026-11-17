// position: sticky at run time (sticky.ts): the CSS rule as a pure function, then live inside a scroll box.
import { afterEach, describe, expect, test } from 'bun:test';
import { useRef, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRoot, Pressable, Scroll, Text } from '../prim';
import { focusedNode, semanticsOf } from '../prim/semantics';
import type { BoxRenderable, ScrollBoxRenderable } from '../prim/otui';
import { stickyOffset, useSticky, type StickySpec } from './sticky';

describe('stickyOffset (the CSS rule)', () => {
  const vp = { top: 0, height: 10 };
  test('bottom: a box below the viewport moves up to its bottom edge; one inside stays', () => {
    expect(stickyOffset({ bottom: 0 }, { top: 20, height: 2 }, vp, { top: 0, height: 22 })).toBe(-12);
    expect(stickyOffset({ bottom: 1 }, { top: 20, height: 2 }, vp, { top: 0, height: 22 })).toBe(-13);
    expect(stickyOffset({ bottom: 0 }, { top: 5, height: 2 }, vp, { top: 0, height: 22 })).toBe(0);
  });
  test('bottom: never above its containing block', () => {
    expect(stickyOffset({ bottom: 0 }, { top: 20, height: 2 }, vp, { top: 15, height: 7 })).toBe(-5);
  });
  test('top: a box scrolled above the viewport moves down to its top edge, held inside its containing block', () => {
    const v = { top: 3, height: 10 };
    expect(stickyOffset({ top: 0 }, { top: -4, height: 1 }, v, { top: -5, height: 30 })).toBe(7);
    expect(stickyOffset({ top: 0 }, { top: 5, height: 1 }, v, { top: -5, height: 30 })).toBe(0);
    // Its block ends 2 rows below the viewport top: the box goes no further than the block's end.
    expect(stickyOffset({ top: 0 }, { top: -4, height: 1 }, v, { top: -5, height: 7 })).toBe(5);
  });
});

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Sticky({ spec, children }: { spec: StickySpec; children: ReactNode }) {
  const ref = useRef<BoxRenderable | null>(null);
  useSticky(ref, spec);
  return <Box shrink={0} bg="bg" boxRef={ref}>{children}</Box>;
}
const rows = (n: number, p: string) => Array.from({ length: n }, (_, i) => <Text key={p + i}>{`${p} ${i + 1}`}</Text>);

test('live: a sticky footer is on the last viewport row from the start, and back in flow at the end', async () => {
  let sb: ScrollBoxRenderable | null = null;
  t = await drawTest(
    <Box dir="column" height={8}><Scroll dir="column" grow={1} scrollRef={(r) => { sb = r; }}>
      {rows(20, 'line')}<Sticky spec={{ bottom: 0 }}><Text>FOOTER</Text></Sticky>
    </Scroll></Box>, { width: 30, height: 8 });
  let f = (await t.settle()).split('\n');
  expect(f[7]).toContain('FOOTER');
  expect(f.join('\n')).toContain('line 1');
  sb!.scrollTo(1000);
  f = (await t.settle()).split('\n');
  expect(f[7]).toContain('FOOTER');
  expect(f[6]).toContain('line 20');
});

test('live: a sticky header stays on the first viewport row while its section scrolls, then leaves with it', async () => {
  let sb: ScrollBoxRenderable | null = null;
  t = await drawTest(
    <Box dir="column" height={6}><Scroll dir="column" grow={1} scrollRef={(r) => { sb = r; }}>
      <Box dir="column" shrink={0}><Sticky spec={{ top: 0 }}><Text>HEAD A</Text></Sticky>{rows(10, 'a')}</Box>
      {rows(10, 'b')}
    </Scroll></Box>, { width: 30, height: 6 });
  let f = (await t.settle()).split('\n');
  expect(f[0]).toContain('HEAD A');
  sb!.scrollTo(5);
  f = (await t.settle()).split('\n');
  expect(f[0]).toContain('HEAD A');
  expect(f.join('\n')).not.toContain('a 1\n');
  sb!.scrollTo(14);
  f = (await t.settle()).split('\n');
  expect(f.join('\n')).not.toContain('HEAD A');
  expect(f[0]).toContain('b ');
});

// Bots, a Bot open at the end of its thread: the pinned header's controls are drawn on the viewport's first rows, the
// thread's own controls above it are scrolled away (negative rows). Ordered by the drawn row, Tab entered at the
// thread's first control and never came to the header.
test('Tab order is the layout\'s: a stuck header\'s control comes before the content scrolled away above the viewport', async () => {
  let sb: ScrollBoxRenderable | null = null;
  const btn = (name: string) => <Pressable onPress={() => {}} sem={{ role: 'button', name }}><Text>{`[${name}]`}</Text></Pressable>;
  t = await drawTest(
    <FocusRoot><Box dir="column" height={6}><Scroll dir="column" grow={1} followFocus scrollRef={(r) => { sb = r; }}>
      <Box dir="column" shrink={0}>
        <Sticky spec={{ top: 0 }}>{btn('Head')}</Sticky>
        {btn('First')}{rows(20, 'a')}{btn('Last')}
      </Box>
    </Scroll></Box></FocusRoot>, { width: 30, height: 6 });
  await t.settle();
  sb!.scrollTo(1000);
  const f = await t.settle();
  expect(f.split('\n')[0]).toContain('[Head]');
  expect(f).toContain('[Last]');
  expect(f).not.toContain('[First]');
  const focused = (): string => focusedNode(semanticsOf({ root: t!.renderer.root, stdin: t!.renderer.stdin as never }))?.name ?? '';
  t.mockInput.pressTab();
  await t.settle();
  expect(focused()).toBe('Head');
});
