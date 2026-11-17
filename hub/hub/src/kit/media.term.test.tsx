// Terminal useMedia: a px media query read against the terminal's width (1 column = 8 px), in every syntax the Hub
// writes: the old (max-width/min-width) form, the range form (width < 600px), both-sided ranges, `and`, `,`, `not`, and
// features a terminal cannot match (hover, pointer).
import { afterEach, expect, test } from 'bun:test';
import { drawTest, type TestTerm } from '../term/prim/testing';
import { Text } from '../term/prim';
import { useMedia } from './media';
import { PHONE_QUERY } from './overlays/shared';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

function Probe({ queries }: { queries: readonly string[] }) {
  return <>{queries.map((q, i) => <Text key={q}>{`${i}:${useMedia(q) ? 'y' : 'n'}`}</Text>)}</>;
}
const ask = async (cols: number, queries: readonly string[]) => {
  t?.renderer.destroy();
  t = await drawTest(<Probe queries={queries} />, { width: cols, height: queries.length + 1 });
  const f = t.captureCharFrame();
  return queries.map((_, i) => new RegExp(`${i}:(y|n)`).exec(f)?.[1]);
};

test('"phone" (the overlays\' query) is a terminal under 75 columns: 80x24 is not a phone', async () => {
  expect(await ask(74, [PHONE_QUERY])).toEqual(['y']);
  expect(await ask(75, [PHONE_QUERY])).toEqual(['n']);
  expect(await ask(80, [PHONE_QUERY])).toEqual(['n']);
});

test('range forms: <, <=, >, >=, value first, and both-sided', async () => {
  // 100 columns = 800 px.
  const q = ['(width < 800px)', '(width <= 800px)', '(width > 800px)', '(width >= 800px)', '(800px > width)',
    '(800px <= width)', '(600px <= width < 900px)', '(600px <= width < 800px)', '(900px > width >= 800px)', '(width>=50em)'];
  expect(await ask(100, q)).toEqual(['n', 'y', 'n', 'y', 'n', 'y', 'y', 'n', 'y', 'y']);
});

test('the classic form, and/or/not, and features a terminal never matches', async () => {
  const q = ['(max-width: 719px)', '(min-width: 600px)', '(min-width: 600px) and (max-width: 719px)',
    'screen and (width < 768px)', '(width < 100px), (width >= 600px)', 'not (width < 768px)', '(hover: none)',
    '(pointer: coarse)', '(width < 768px) and (pointer: coarse)', 'not (pointer: coarse)', '(prefers-color-scheme: dark)'];
  // 85 columns = 680 px.
  expect(await ask(85, q)).toEqual(['y', 'y', 'y', 'y', 'y', 'n', 'n', 'n', 'n', 'n', 'n']);
});

test('the Hub\'s own queries answer at the widths the breakpoint table names', async () => {
  const q = ['(width < 768px)', '(width >= 1280px)', '(width >= 1560px)'];
  expect(await ask(80, q)).toEqual(['y', 'n', 'n']);
  expect(await ask(160, q)).toEqual(['n', 'y', 'n']);
  expect(await ask(200, q)).toEqual(['n', 'y', 'y']);
});
