// The layer's interior is opaque in every colour tier (prim/Overlay.ts `opaqueRaw`).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | The web draws a dialog / drawer / popover / tooltip on its own opaque surface; nothing behind shows through a blank | 'opaque <tier> <kind>' |
// | 2 | Mono (NO_COLOR): the scrim's shade never shows inside a layer; colour tiers: the page's text never does | 'opaque <tier> <kind>' |
// | 3 | Mono paints with the terminal's own background (no colour emitted) | 'mono emits no colour for the fill' |
// | 4 | Mono: a modal's scrim hides everything beneath, a lower layer included | 'mono scrim hides what is beneath' |
//
// The engine has three tiers (truecolor, ansi16, mono); a 256-colour terminal gets ansi16 (tokens.ts tierFromEnv).
import { afterEach, expect, test } from 'bun:test';
import { drawTest } from './testing';
import { Box, FocusRoot, Text } from './index';
import { Layer, OverlayHost, opaqueRaw, type LayerKind, type Place as LayerPlace } from './Overlay';
import { setColourTier, type ColourTier } from './tokens';

afterEach(() => setColourTier('truecolor'));

const W = 80, H = 24;
const PAGE = 'X';
function Page({ kind, place }: { kind: LayerKind; place: LayerPlace }) {
  return (
    <Box>
      {Array.from({ length: H }, (_, i) => <Text key={i}>{PAGE.repeat(W)}</Text>)}
      <Layer open kind={kind} place={place} frameTitle="Title" onEscape={() => {}}>
        <Text>hi</Text>
        <Box height={3} />
        <Text>end of body</Text>
      </Layer>
    </Box>
  );
}

const CASES: { kind: LayerKind; place: LayerPlace; label: string }[] = [
  { label: 'dialog', kind: 'modal', place: { at: 'center', width: 30 } },
  { label: 'drawer', kind: 'modal', place: { at: 'right', width: 40 } },
  { label: 'popover', kind: 'popover', place: { at: 'anchor', anchor: { x: 5, y: 3, width: 6, height: 1 }, width: 24 } },
  { label: 'tip', kind: 'tip', place: { at: 'anchor', anchor: { x: 40, y: 10, width: 6, height: 1 }, width: 20 } },
];

/** The inner box of the frame: rows/cols strictly between the first ╔/┌ corner and its matching ╝/┘. */
function interior(frame: string): string[] {
  const lines = frame.split('\n');
  const top = lines.findIndex((l) => /[╔┌]/.test(l));
  const left = [...lines[top]!].findIndex((c) => c === '╔' || c === '┌');
  const right = [...lines[top]!].findIndex((c, i) => i > left && (c === '╗' || c === '┐'));
  const bottom = lines.findIndex((l, i) => i > top && [...l][left] !== undefined && /[╚└]/.test([...l][left]!));
  expect(top).toBeGreaterThanOrEqual(0);
  expect(right).toBeGreaterThan(left);
  expect(bottom).toBeGreaterThan(top);
  return lines.slice(top + 1, bottom).map((l) => [...l].slice(left + 1, right).join(''));
}

for (const tier of ['truecolor', 'ansi16', 'mono'] as ColourTier[]) {
  for (const c of CASES) {
    test(`opaque ${tier} ${c.label}`, async () => {
      setColourTier(tier);
      const t = await drawTest(<FocusRoot><OverlayHost><Page kind={c.kind} place={c.place} /></OverlayHost></FocusRoot>, { width: W, height: H });
      const f = await t.settle();
      const inside = interior(f);
      expect(inside.length).toBeGreaterThanOrEqual(5);
      const leak = inside.filter((l) => l.includes('░') || l.includes(PAGE));
      expect(leak).toEqual([]);
      expect(inside.join('\n')).toContain('end of body');
      if (c.kind === 'modal' && tier === 'mono') expect(f).toContain('░'); // the scrim is still drawn outside
      t.renderer.destroy();
    });
  }
}

test('mono emits no colour for the fill', () => {
  setColourTier('mono');
  const fill = opaqueRaw('card').backgroundColor;
  expect(typeof fill).not.toBe('string');
  expect((fill as { intent: string }).intent).toBe('default');
  setColourTier('truecolor');
  expect(typeof opaqueRaw('card').backgroundColor).toBe('string');
});

function Nested() {
  return (
    <Box>
      {Array.from({ length: H }, (_, i) => <Text key={i}>{PAGE.repeat(W)}</Text>)}
      <Layer open kind="modal" place={{ at: 'right', width: 40 }} frameTitle="Drawer" onEscape={() => {}}>
        <Text>{'D'.repeat(30)}</Text>
      </Layer>
      <Layer open kind="modal" place={{ at: 'center', width: 24 }} frameTitle="Confirm" onEscape={() => {}}>
        <Text>sure?</Text>
      </Layer>
    </Box>
  );
}

test('mono scrim hides what is beneath', async () => {
  setColourTier('mono');
  const t = await drawTest(<FocusRoot><OverlayHost><Nested /></OverlayHost></FocusRoot>, { width: W, height: H });
  const f = await t.settle();
  expect(f).toContain('sure?');
  expect(f).not.toContain(PAGE); // the page is covered
  expect(f).not.toContain('DDDD'); // and so is the drawer under the confirm
  t.renderer.destroy();
  setColourTier('truecolor');
  const c = await drawTest(<FocusRoot><OverlayHost><Nested /></OverlayHost></FocusRoot>, { width: W, height: H });
  const g = await c.settle();
  expect(g).toContain('DDDD'); // colour tiers dim, they do not hide
  c.renderer.destroy();
});
