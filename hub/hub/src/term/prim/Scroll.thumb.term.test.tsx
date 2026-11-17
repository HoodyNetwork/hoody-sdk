// The scrollbar of a Scroll is drawn in the page's own line tones (thumb: lineStrong, track: line), never the engine's
// default thumb, which was brighter than every border and word beside it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Scroll, Text } from './index';
import { colour, colourTier, setColourTier, type ColourTier } from './tokens';

let was: ColourTier = 'truecolor';
beforeAll(() => { was = colourTier(); setColourTier('truecolor'); });
afterAll(() => { setColourTier(was); });

type Rgb = { toInts(): number[] } | undefined;
const hex = (c: Rgb): string => '#' + (c?.toInts().slice(0, 3) ?? []).map((n) => n.toString(16).padStart(2, '0')).join('');

test('truecolor: the thumb is lineStrong on a line track', async () => {
  const t = await drawTest(
    <FocusRoot>
      <Box dir="column" height={10}>
        <Scroll dir="column" grow={1}>{Array.from({ length: 40 }, (_, i) => <Text key={i}>{`row ${i}`}</Text>)}</Scroll>
      </Box>
    </FocusRoot>,
    { width: 30, height: 10 },
  );
  await t.settle();
  const spans = (t as unknown as { captureSpans(): { lines: { spans: { text: string; fg: Rgb; bg: Rgb }[] }[] } }).captureSpans();
  const thumbs = spans.lines.flatMap((l) => l.spans).filter((sp) => sp.text.includes('█'));
  t.renderer.destroy();
  expect(thumbs.length).toBeGreaterThan(0);
  for (const sp of thumbs) {
    expect(hex(sp.fg)).toBe(String(colour('lineStrong')));
    expect(hex(sp.bg)).toBe(String(colour('line')));
  }
});
