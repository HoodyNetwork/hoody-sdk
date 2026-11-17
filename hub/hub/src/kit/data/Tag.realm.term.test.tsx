// A realm tag (the computers list's realm chip: the realm's colour swatch and its name inside a kit Tag) draws as ONE
// tinted chip with the realm's colour in it: every cell from the first pad to the last carries the tag tint except the
// swatch, which carries the realm colour. Never a grey block each side of an untinted name, never
// a chip without its colour. Mono: "(Personal)", no swatch, the name carries the meaning.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, Text, setColourTier } from '../../term/prim';
import { RealmChips } from '../../pages/computers/parts/Bits';
import { REALM_HEX } from '../../term/shell/realmColour';

const LINE = [0x20, 0x20, 0x23]; // tokens.ts raised, dark (the tag tint)
const realms = [{ id: 'r1', name: 'Personal', color: 'teal' }, { id: 'r2', name: 'Acme client', color: 'orange' }] as never;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function cells(ids: string[]) {
  const t = await drawTest(<Box dir="row"><Text>name </Text><RealmChips ids={ids} realms={realms} /></Box>, { width: 50, height: 1 });
  await t.settle();
  const out: Array<{ ch: string; bg: number[]; fg: number[] }> = [];
  for (const sp of t.captureSpans().lines[0]!.spans) {
    const bg = sp.bg.toInts().slice(0, 3);
    const fg = sp.fg.toInts().slice(0, 3);
    for (const ch of [...sp.text]) out.push({ ch, bg, fg });
  }
  const frame = await t.settle();
  t.renderer.destroy();
  return { out, frame };
}

test('realm tag: one tinted chip, the realm colour in its swatch, the name on the tint (truecolor)', async () => {
  setColourTier('truecolor');
  for (const [id, name, colour] of [['r1', 'Personal', 'teal'], ['r2', 'Acme client', 'orange']] as const) {
    const { out } = await cells([id]);
    const text = out.map((c) => c.ch).join('');
    const at = text.indexOf(name);
    expect(at).toBeGreaterThan(0);
    // The chip: from the cell after "name " to one past the name's end.
    const start = 'name '.length;
    const end = at + name.length; // the closing pad
    const chip = out.slice(start, end + 1);
    const swatch = chip.filter((c) => c.ch === '█' && c.fg.join() === rgb(REALM_HEX[colour]).join());
    expect([name, swatch.length]).toEqual([name, 1]); // the realm's colour, exactly one cell
    // Every cell of the chip, the swatch and the name included, is on the tag tint: no untinted name between two grey pads.
    expect(chip.map((c) => c.bg.join() === LINE.join() ? '#' : c.ch).join('')).toBe('#'.repeat(chip.length));
    expect(chip.map((c) => c.ch).join('')).toBe(` █ ${name} `);
    // Nothing tinted after the chip.
    expect(out.slice(end + 1).some((c) => c.bg.join() === LINE.join())).toBe(false);
  }
});

test('realm tag in mono: "(Personal)", no swatch cell, reads without colour', async () => {
  setColourTier('mono');
  try {
    const { frame } = await cells(['r1']);
    expect(frame).toMatch(/name \(Personal\)/);
  } finally {
    setColourTier('truecolor');
  }
});
