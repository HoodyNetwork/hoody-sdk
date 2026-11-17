// A string or number handed straight to a prim Box (no Text around it: a shared page's `{none}`, a kit Row's model
// name, a fragment's words) is drawn in the colour a root Text naming none takes. React makes it an engine text of its
// own, whose default colour is a fixed white (the engine's TextBufferRenderable default): on the light theme it was
// white on the Hub's light ground (Account "Not set", New Bot's "Hoody Free", a plan card's "Next: Small.").
import { afterEach, expect, test } from 'bun:test';
import { type ReactNode } from 'react';
import { drawTest, type TestTerm } from './testing';
import { Box, DefaultInk, FocusRoot, Text } from './index';
import { colour, setColourTier, setThemeMode, textColour, type ThemeMode } from './tokens';

let term: TestTerm | null = null;
afterEach(() => { term?.renderer.destroy(); term = null; setColourTier('truecolor'); setThemeMode('dark'); });

type Ints = { toInts(): number[] };
type Span = { text: string; fg: Ints };
const hexOf = (c: Ints): string => '#' + c.toInts().slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');

async function draw(node: ReactNode): Promise<{ first: string; spans: Span[] }> {
  term = await drawTest(<FocusRoot>{node}</FocusRoot>, { width: 32, height: 3 });
  const frame = await term.settle();
  const spans = (term.captureSpans().lines as unknown as { spans: Span[] }[]).flatMap((l) => l.spans);
  return { first: frame.split('\n')[0]!, spans };
}
function fgOf(spans: Span[], words: string): string {
  const s = spans.find((x) => x.text.includes(words));
  expect(s).toBeDefined();
  return hexOf(s!.fg);
}

for (const theme of ['light', 'dark'] as ThemeMode[]) {
  test(`truecolor ${theme}: a bare string in a box is ink`, async () => {
    setThemeMode(theme);
    const d = await draw(<Box dir="row" width={20}>Not set</Box>);
    expect(d.first.startsWith('Not set')).toBe(true);
    expect(fgOf(d.spans, 'Not set')).toBe(colour('ink')!);
  }, 60_000);

  test(`truecolor ${theme}: a fragment's words and a number are ink too`, async () => {
    setThemeMode(theme);
    const d = await draw(<Box dir="row" width={30}><>{'Next: '}{'Small.'}</>{3}</Box>);
    expect(d.first.startsWith('Next: Small.3')).toBe(true);
    expect(fgOf(d.spans, 'Next')).toBe(colour('ink')!);
    expect(fgOf(d.spans, '3')).toBe(colour('ink')!);
  }, 60_000);
}

test('inside a DefaultInk a bare string takes that colour, as a Text naming none does', async () => {
  setThemeMode('light');
  const d = await draw(<DefaultInk colour="muted"><Box dir="row" width={20}>meta line</Box></DefaultInk>);
  expect(fgOf(d.spans, 'meta line')).toBe(textColour('muted')!);
}, 60_000);

test('an empty string draws nothing and elements keep their place', async () => {
  const d = await draw(<Box dir="row" width={20}>{''}<Text>ab</Text>{'cd'}</Box>);
  expect(d.first.startsWith('abcd')).toBe(true);
}, 60_000);
