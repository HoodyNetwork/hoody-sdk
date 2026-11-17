// ClipRow over a row that WRAPS (a web cell's inline-flex row: "Web address" and, after it, "seen 09:00 AM"): the cells
// it reports as its need (`onNatural`, the table column's want) are the row's ONE-LINE need, wrapped or not. Before, a
// wrapped row reported its first line only (12), and 25 once a wider box had drawn it whole; the table keeps the
// largest need it heard, so a frame depended on the sizes before it (seen on tunnels at widths 120 → 200 → 120).
// And a box that has the room draws the row on one line again: the cell kept for the "…" no longer holds it wrapped.
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { ClipRow } from './TableClip';

let setWidth: (n: number) => void = () => {};
const heard: number[] = [];
function Cell({ first }: { first: number }) {
  const [width, sw] = useState(first); setWidth = sw;
  return (
    <FocusRoot>
      <Box width={width} height={1} dir="row" clip shrink={0}>
        <ClipRow onNatural={(n) => { heard.push(n); }}>
          <Box dir="row" wrap gapX={1} shrink={1} minWidth={0}><Text shrink={0}>Web address</Text><Box dir="row" shrink={0}><Text shrink={0}>seen 09:00 AM</Text></Box></Box>
        </ClipRow>
      </Box>
    </FocusRoot>
  );
}
const open = async (first: number) => {
  heard.length = 0;
  const t = await drawTest(<Cell first={first} />, { width: 60, height: 4 });
  const frame = async (): Promise<string> => {
    let f = await t.settle();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
    return f.split('\n')[0]!.trimEnd();
  };
  return { t, frame };
};

test('wrapped in 20 cells: one "…" after the first line, and the need it reports is the one-line 25', async () => {
  const { t, frame } = await open(20);
  expect(await frame()).toBe('Web address…');
  t.renderer.destroy();
  expect(heard.at(-1)).toBe(25);
  expect(Math.max(...heard)).toBe(25);
});

test('the need is the same whichever size came first: 20 → 40 → 20 and 40 → 20 → 40 never report another number', async () => {
  for (const [a, b] of [[20, 40], [40, 20]] as const) {
    const { t, frame } = await open(a);
    await frame();
    setWidth(b); await frame();
    setWidth(a); await frame();
    t.renderer.destroy();
    expect([...new Set(heard.filter((n) => n > 0))]).toEqual([25]);
  }
});

test('a box that grows to the need draws the row on one line (20 → 25), as a box that starts at 25 does', async () => {
  const fresh = await open(25);
  const whole = await fresh.frame();
  fresh.t.renderer.destroy();
  expect(whole).toBe('Web address seen 09:00 AM');
  const { t, frame } = await open(20);
  await frame();
  setWidth(25);
  expect(await frame()).toBe(whole);
  setWidth(24);
  expect(await frame()).toBe('Web address…');
  t.renderer.destroy();
});
