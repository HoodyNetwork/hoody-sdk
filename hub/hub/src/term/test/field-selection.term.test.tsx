// Selected text in a field (FieldInput's engine line, the chat's Compose) is drawn in `bg` words on the focus fill, as
// the drawn field path marks a selection (focusInk), in both themes of the truecolor and 16-colour tiers. On `selected`
// (the current row's ground) it could not be seen: 1.1:1 on a card in truecolor, and on 16 colours the ground itself
// (dark: the palette's black; light: the card's white), so the next key replaced text nobody saw selected.
import { afterEach, expect, test } from 'bun:test';
import { useState, type ReactElement } from 'react';
import { drawTest, type TestTerm } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { FieldInput } from '../prim/FieldInput';
import { Compose } from '../prim/Compose';
import { colour, setColourTier, setThemeMode, type ColourTier, type ThemeMode } from '../prim/tokens';

afterEach(() => { setColourTier('truecolor'); setThemeMode('dark'); });

type Ints = { toInts(): number[] };
type Span = { text: string; fg: Ints; bg: Ints };
const hexOf = (c: Ints): string => '#' + c.toInts().slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');

/** The words drawn on `fill`, in reading order, and every colour they are drawn in. */
function onFill(t: TestTerm, fill: string): { text: string; inks: string[] } {
  const spans = (t.captureSpans().lines as unknown as { spans: Span[] }[]).flatMap((l) => l.spans).filter((s) => hexOf(s.bg) === fill);
  return { text: spans.map((s) => s.text).join(''), inks: [...new Set(spans.map((s) => hexOf(s.fg)))] };
}

function Line(): ReactElement {
  const [v, setV] = useState('');
  return <FocusRoot><FieldInput value={v} onChange={setV} autoFocus width={30} /></FocusRoot>;
}
function Chat(): ReactElement {
  const [v, setV] = useState('');
  return <FocusRoot><Box width={40} height={4}><Compose value={v} onChange={setV} autoFocus /></Box></FocusRoot>;
}

const TIERS: ReadonlyArray<readonly [ColourTier, ThemeMode]> = [['truecolor', 'dark'], ['truecolor', 'light'], ['ansi16', 'dark'], ['ansi16', 'light']];
const FIELDS: ReadonlyArray<readonly [string, () => ReactElement]> = [['FieldInput', () => <Line />], ['Compose', () => <Chat />]];

for (const [tier, theme] of TIERS) {
  for (const [name, field] of FIELDS) {
    test(`${name}, ${tier} ${theme}: text selected with Shift+Left is bg words on the focus fill`, async () => {
      setColourTier(tier);
      setThemeMode(theme);
      const t = await drawTest(field(), { width: 40, height: 4 });
      await t.mockInput.typeText('hello');
      await t.settle();
      t.mockInput.pressArrow('left', { shift: true });
      t.mockInput.pressArrow('left', { shift: true });
      await t.settle();
      const sel = onFill(t, colour('focus')!);
      expect(sel.text).toBe('lo');
      expect(sel.inks).toEqual([colour('bg')!]);
      t.renderer.destroy();
    });
  }
}
