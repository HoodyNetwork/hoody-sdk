// A mark that names no colour (ClipRow's "…" over a cut) is drawn in `ink` where the Hub paints the ground, as a root
// Text naming none is (tokens.ts plainInk). It was left to the engine's own default foreground, which is white when the
// terminal never answered for its colours: on the light theme the "…" was white on the Hub's light ground (Support's
// list, "Computer will not start after re…").
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { ClipRow } from './TableClip';
import { colour, setThemeMode, type ThemeMode } from './tokens';

afterEach(() => { setThemeMode('dark'); });

type Ints = { toInts(): number[] };
type Span = { text: string; fg: Ints };
const hexOf = (c: Ints): string => '#' + c.toInts().slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');

for (const theme of ['light', 'dark'] as ThemeMode[]) {
  test(`truecolor ${theme}: a cut row's "…" is drawn in ink`, async () => {
    setThemeMode(theme);
    const t = await drawTest(
      <FocusRoot><Box width={21} height={1} dir="row"><ClipRow><Box dir="row"><Text shrink={0}>POST hooks.example.org</Text></Box></ClipRow></Box></FocusRoot>,
      { width: 25, height: 3 },
    );
    let f = await t.settle();
    for (let i = 0; i < 3; i++) { await new Promise((r) => setTimeout(r, 20)); f = await t.settle(); }
    expect(f.split('\n')[0]!.slice(0, 21)).toBe('POST hooks.example.o…');
    const spans = (t.captureSpans().lines as unknown as { spans: Span[] }[]).flatMap((l) => l.spans);
    const mark = spans.find((s) => s.text.includes('…'));
    expect(mark).toBeDefined();
    expect(hexOf(mark!.fg)).toBe(colour('ink')!);
    t.renderer.destroy();
  }, 60_000);
}
