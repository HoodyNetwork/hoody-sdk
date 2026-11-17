// StatusLine in the terminal (StatusLine.term.tsx). StatusLine.scenario.ts holds the status role and its words; this
// holds the terminal's own promise: the line keeps its row while it has nothing to say, so the lines under it never
// move when the words come and go (a person reading the next line does not see it jump).
import { afterEach, expect, test } from 'bun:test';
import { useState, type ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { StatusLine } from './StatusLine';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

let say: (w: ReactNode) => void = () => {};
function Page({ first }: { first: ReactNode }) {
  const [words, setWords] = useState<ReactNode>(first);
  say = setWords;
  return (
    <FocusRoot>
      <Box dir="column">
        <Text>Above the status</Text>
        <StatusLine>{words}</StatusLine>
        <Text>Under the status</Text>
      </Box>
    </FocusRoot>
  );
}
const rowOf = (f: string, s: string): number => f.split('\n').findIndex((l) => l.includes(s));

// Catches the kept row (line 13, minHeight 1): without it "Under the status" sits one line higher while there is
// nothing to say and jumps down when the words come.
test('the row is kept while empty: the line under it stays put as the words come and go', async () => {
  t = await drawTest(<Page first={null} />, { width: 50, height: 6 });
  let f = await t.settle();
  expect(rowOf(f, 'Above the status')).toBe(0);
  expect(rowOf(f, 'Under the status')).toBe(2);
  expect(f.split('\n')[1]!.trim()).toBe('');
  say('Starting the run…');
  f = await t.settle();
  expect(rowOf(f, 'Starting the run…')).toBe(1);
  expect(rowOf(f, 'Under the status')).toBe(2);
  say('');
  f = await t.settle();
  expect(f).not.toContain('Starting the run');
  expect(rowOf(f, 'Under the status')).toBe(2);
  say(false);
  f = await t.settle();
  expect(rowOf(f, 'Under the status')).toBe(2);
});
