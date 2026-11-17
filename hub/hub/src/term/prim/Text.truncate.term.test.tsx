// Text `truncate` (EndCut): a cut line shows its start and one "…", at every width, in every parent shape.
// - never the first word plus blanks: the line was word-wrapped into one row, so whenever the shown text was wider than
//   the line (before the first measure, or Yoga rounding an 18-cell box to 17.99) it showed "This         ▾" or
//   "Personal           17" (a Select trigger beside a growing sibling);
// - never collapsed to nothing in a sized row beside siblings ("▾ 17"
//   percentage max on the same box made Yoga give it no cell);
// - still capped by a column that does not stretch it (start, center), still whole when there is room.
import { expect, test } from 'bun:test';
import { useEffect, useState, type ReactNode } from 'react';
import { drawTest } from './testing';
import { Box, FocusRoot, Pressable, Text } from './index';
import { layoutFaults } from './layoutcheck';

async function line(node: ReactNode, width = 50): Promise<string> {
  const t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width, height: 3 });
  await t.settle();
  const f = await t.settle();
  t.renderer.destroy();
  return f.split('\n')[0] ?? '';
}

/** "Personal computers" as shown: whole, or a start of it ending in one "…"; never a word followed by a blank gap. */
function cutOk(shown: string, full: string): boolean {
  if (shown === full) return true;
  if (!shown.endsWith('…')) return false;
  const start = shown.slice(0, -1);
  return start.length > 0 && full.startsWith(start);
}

test('beside a growing sibling: every width shows a start and "…" (or the whole text), never the first word and blanks', async () => {
  for (let w = 12; w <= 30; w++) {
    const l = await line(
      <Box dir="row" width={w}>
        <Box grow={1} shrink={1}><Text>Filters ·</Text></Box>
        <Box dir="row" width={20} shrink={1} minWidth={0}><Text truncate>This computer</Text><Text shrink={0}> ▾</Text></Box>
      </Box>,
    );
    const m = /(This[^▾]*?) ?▾/.exec(l);
    expect({ w, l, shown: m?.[1]?.trimEnd() }).toEqual({ w, l, shown: expect.anything() });
    expect({ w, ok: cutOk(m![1]!.trimEnd(), 'This computer') }).toEqual({ w, ok: true });
    expect({ w, gap: /This {2,}/.test(l) }).toEqual({ w, gap: false });
  }
});

test('a row stretched by its column: the whole label when it fits ("Personal computers 17", not "Personal" and blanks)', async () => {
  const l = await line(
    <Box dir="column" width={30}>
      <Box dir="row" height={1} gap={1} shrink={0}>
        <Text shrink={0}>▾</Text><Text truncate>Personal computers</Text><Text shrink={0}>17</Text>
        <Box dir="row" shrink={50} minWidth={0}><Text truncate>three running now</Text></Box>
      </Box>
    </Box>,
  );
  expect(l).toContain('▾ Personal computers 17 three…');
});

test('a sized row beside siblings: the label gives way with "…", never collapses to nothing', async () => {
  for (const w of [12, 14, 16, 18]) {
    const l = await line(
      <Box dir="row" width={w} height={1} gap={1} shrink={0}>
        <Text shrink={0}>▾</Text><Text truncate>Personal computers</Text><Text shrink={0}>17</Text>
        <Box dir="row" shrink={50} minWidth={0}><Text truncate>three running now</Text></Box>
      </Box>,
    );
    const m = /▾ (\S.*?) +17/.exec(l);
    expect({ w, l, label: m?.[1] }).toEqual({ w, l, label: expect.anything() });
    expect({ w, ok: cutOk(m![1]!, 'Personal computers') }).toEqual({ w, ok: true });
  }
});

test('a column that does not stretch it (start, center) still caps and cuts it; with room it is whole', async () => {
  for (const align of ['stretch', 'start', 'center'] as const) {
    expect({ align, l: (await line(<Box dir="column" width={8} align={align}><Text truncate>Personal computers</Text></Box>)).trimEnd() }).toEqual({ align, l: 'Persona…' });
    expect({ align, l: (await line(<Box dir="column" width={30} align={align}><Text truncate>Personal computers</Text></Box>)).trim() }).toEqual({ align, l: 'Personal computers' });
  }
});

// The end cut is declared, so the layout gate must not report it (home `longName` 80x24, a computer
// switcher label that arrives after the first layout in a shrinking Pressable read "cut … Box 40x1 at 29,0 past its box
// 37x1"). The inner box asks for the whole text's width on purpose and the outer box clips it, so the outer box
// declares that it drops what does not fit (an id ending in `~cut`, as Box `drops`).
const LONG = 'A computer name far too long for the bar it sits in';
function Late({ rich }: { rich: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), 20); return () => clearTimeout(t); }, []);
  return (
    <Pressable dir="row" shrink={1} onPress={() => {}}>
      {({ focused }) => (
        <Text bg={focused ? 'blue' : undefined} truncate>
          {!on ? 'short' : rich ? <>A computer <Text bold>name</Text> far too long for the bar it sits in</> : LONG}
        </Text>
      )}
    </Pressable>
  );
}

test('a long label arriving late in a shrinking Pressable: cut with "…" and no layout fault (plain and rich)', async () => {
  for (const rich of [false, true]) {
    const t = await drawTest(
      <FocusRoot><Box dir="row" width={40} height={1}><Text shrink={0}>Hub · </Text><Late rich={rich} /><Text shrink={0}> ▾</Text></Box></FocusRoot>,
      { width: 40, height: 1 });
    await new Promise((r) => setTimeout(r, 60));
    await t.settle();
    const row = (await t.settle()).split('\n')[0] ?? '';
    expect({ rich, row }).toEqual({ rich, row: expect.stringContaining('… ▾') });
    const cuts = layoutFaults(t.renderer.root as never, { cols: 40, rows: 1 }).filter((x) => x.kind === 'cut' || x.kind === 'text-cut');
    expect({ rich, cuts }).toEqual({ rich, cuts: [] });
    t.renderer.destroy();
  }
});
