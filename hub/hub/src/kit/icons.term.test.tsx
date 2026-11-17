import { expect, test } from 'bun:test';
import fs from 'node:fs';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawTest } from '../term/prim/testing';
import { Box, Text, TONE_MARK } from '../term/prim';
import { cellWidth } from '../term/prim/TableCells';
import { ICON_GLYPHS, PX_GLYPHS, type IconGlyph } from './icons.glyphs';
import { ICON_NAMES, Icon, PX_FROM_ICON, PxIcon } from './icons';
import { OUTCOME_ICON } from './outcome';

// The web file's own lists, read from its syntax (this test's loader hands an import the sibling, and the test preload
// refuses subprocesses): ICON_NAMES is the keys of the tables it spreads, in that order; PX_FROM_ICON is an object literal.
const web = (() => {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'icons.tsx');
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = new Map<string, ts.Expression>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
  }
  const strip = (e: ts.Expression): ts.Expression => (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e) ? strip(e.expression) : e);
  const keyText = (n: ts.PropertyName): string => (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n) ? n.text : n.getText(sf));
  const keysOf = (name: string): string[] => {
    const e = strip(consts.get(name)!);
    if (!ts.isObjectLiteralExpression(e)) throw new Error(`icons.tsx: ${name} is not an object literal`);
    return e.properties.map((p) => keyText(p.name!));
  };
  const namesExpr = strip(consts.get('ICON_NAMES')!);
  if (!ts.isArrayLiteralExpression(namesExpr)) throw new Error('icons.tsx: ICON_NAMES is not an array literal');
  const names = namesExpr.elements.flatMap((el) => {
    // ...Object.keys(TABLE)
    if (!ts.isSpreadElement(el) || !ts.isCallExpression(el.expression) || !ts.isIdentifier(el.expression.arguments[0]!)) throw new Error('icons.tsx: ICON_NAMES element is not ...Object.keys(TABLE)');
    return keysOf((el.expression.arguments[0] as ts.Identifier).text);
  });
  const pxExpr = strip(consts.get('PX_FROM_ICON')!);
  if (!ts.isObjectLiteralExpression(pxExpr)) throw new Error('icons.tsx: PX_FROM_ICON is not an object literal');
  const px: Record<string, string> = {};
  for (const p of pxExpr.properties) {
    if (!ts.isPropertyAssignment(p) || !ts.isStringLiteral(p.initializer)) throw new Error('icons.tsx: PX_FROM_ICON entry is not key: "value"');
    px[keyText(p.name)] = p.initializer.text;
  }
  return { names, px };
})();

const EMOJI = /\p{Emoji_Presentation}|️/u;
function checkGlyph(name: string, c: IconGlyph): void {
  if (c.kind === 'glyph') {
    expect([name, cellWidth(c.glyph)]).toEqual([name, 1]);
    expect([name, [...c.glyph].length]).toEqual([name, 1]);
    expect([name, EMOJI.test(c.glyph)]).toEqual([name, false]);
    // Nerd Font private use area is never used.
    expect([name, /[-]/u.test(c.glyph)]).toEqual([name, false]);
  } else if (c.kind === 'label') {
    expect(c.label).toMatch(/^[A-Za-z][A-Za-z ]{0,9}$/);
  }
}

test('every web icon is classified, in the web order (a new icon cannot be forgotten)', () => {
  const missing = web.names.filter((n) => !(n in ICON_GLYPHS));
  expect(missing).toEqual([]);
  expect(Object.keys(ICON_GLYPHS)).toEqual(web.names);
  expect(ICON_NAMES as string[]).toEqual(web.names);
  expect(PX_FROM_ICON).toEqual(web.px as typeof PX_FROM_ICON);
});

test('glyphs are one cell, no emoji, no Nerd Font; labels are short words', () => {
  for (const [n, c] of Object.entries(ICON_GLYPHS)) checkGlyph(n, c);
  for (const [n, c] of Object.entries(PX_GLYPHS)) checkGlyph(`px:${n}`, c);
  for (const [n, m] of Object.entries(TONE_MARK)) expect([n, cellWidth(m)]).toEqual([n, 1]);
});

test('meaningful icons are never blank: outcomes, status, direction, menus', () => {
  const meaningful = [...Object.values(OUTCOME_ICON), 'warn', 'info', 'error', 'check', 'x', 'plus', 'minus', 'external', 'reload', 'dots', 'dots-vertical', 'menu',
    'chevron-right', 'chevron-left', 'chevron-down', 'chevron-up', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'play', 'stop', 'pause', 'lock'] as const;
  for (const n of meaningful) expect([n, ICON_GLYPHS[n].kind]).not.toEqual([n, 'none']);
  for (const px of Object.values(PX_FROM_ICON)) expect([px, PX_GLYPHS[px!].kind]).not.toEqual([px, 'none']);
  // Outcomes read apart from each other without colour (pending is a clock, never a warning).
  const marks = (['done', 'pending', 'failed'] as const).map((k) => (ICON_GLYPHS[OUTCOME_ICON[k]] as { glyph: string }).glyph);
  expect(new Set(marks).size).toBe(3);
});

test('a word icon is drawn only when labelled: unlabelled it stands beside its own words', async () => {
  const t = await drawTest(
    <Box dir="column">
      <Box dir="row" gap={1}><Icon name="lock" size="sm" /><Text>Charging your wallet</Text></Box>
      <Box dir="row"><Icon name="lock" label="Locked" /></Box>
    </Box>,
    { width: 30, height: 3 },
  );
  const lines = t.captureCharFrame().split('\n').map((l) => l.trimEnd());
  expect(lines[0]).toBe('Charging your wallet');
  expect(lines[1]).toBe('lock');
  t.renderer.destroy();
});

test('draws glyphs and words; decorative draws nothing unless labelled', async () => {
  const t = await drawTest(
    <Box dir="column">
      <Box dir="row" gap={1}><Text>a</Text><Icon name="check" /><Icon name="chevron-right" tone="muted" /><Icon name="qr" label="QR code" /><Text>b</Text></Box>
      <Box dir="row"><Text>[</Text><Icon name="home" /><Text>]</Text></Box>
      <Box dir="row"><Icon name="github" label="GitHub" /></Box>
      <Text>x <Icon name="warn" /> y</Text>
      <Box dir="row"><PxIcon name="arrow" /><PxIcon name="mic" /><Text>|</Text></Box>
    </Box>,
    { width: 30, height: 6 },
  );
  const lines = t.captureCharFrame().split('\n').map((l) => l.trimEnd());
  expect(lines[0]).toBe('a ✓ › QR b');
  expect(lines[1]).toBe('[]');
  expect(lines[2]).toBe('GitHub');
  expect(lines[3]).toBe('x ! y');
  expect(lines[4]).toBe('→|');
  t.renderer.destroy();
});

test('no glyph or label in either map can take emoji presentation, and each has its declared width by prim\'s width function', () => {
  // Three refusals: a variation selector 16 (U+FE0F asks for the emoji form), an Emoji_Presentation code point (emoji by
  // default), and any other emoji-capable code point (\p{Emoji}: ⚙ ↗ ↕ … are text by default, but terminals and fonts
  // may still draw them as a wide colour emoji, and Bun.stringWidth still says 1, so the width check alone misses them).
  const bad: string[] = [];
  for (const [name, c] of [...Object.entries(ICON_GLYPHS), ...Object.entries(PX_GLYPHS)] as [string, IconGlyph][]) {
    if (c.kind === 'none') continue;
    // Glyphs and word labels alike: no string in the map may ask for or allow an emoji form.
    const text = c.kind === 'glyph' ? c.glyph : c.label;
    if (text.includes('\uFE0F')) bad.push(`${name} FE0F`);
    for (const ch of text) {
      if (/\p{Emoji_Presentation}/u.test(ch)) bad.push(`${name} ${ch} presentation`);
      else if (/\p{Extended_Pictographic}/u.test(ch)) bad.push(`${name} ${ch} pictographic`);
      else if (ch.codePointAt(0)! > 127 && /\p{Emoji}/u.test(ch)) bad.push(`${name} ${ch} emoji-capable`);
    }
    // A glyph is one cell; a label is as many cells as it has characters (plain text, no wide forms).
    const want = c.kind === 'glyph' ? 1 : [...text].length;
    if (cellWidth(text) !== want) bad.push(`${name} width ${cellWidth(text)} (want ${want})`);
  }
  expect(bad).toEqual([]);
});
