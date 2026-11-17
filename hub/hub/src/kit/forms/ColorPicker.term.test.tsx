// ColorPicker.term: the web component's observable behaviours, each held here.
//  - the presets as a radio row named as on the web (Coral ...; (•) marks the pick, so it reads in mono); arrows move
//    the pick and call onChange('#RRGGBB')
//  - a value that is a preset marks it; '' marks none
//  - the custom field takes #RGB / RGB / #RRGGBB / RRGGBB and sends '#RRGGBB' in capitals; other text goes as typed
//  - after leaving the custom field, non-hex text shows the hint (unless `accepts` takes it)
//  - PRESET_COLORS / randomPresetColor / normalizeHexColor exported as on the web
import { expect, test } from 'bun:test';
import { useState } from 'react';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { ColorPicker, PRESET_COLORS, normalizeHexColor, randomPresetColor } from './ColorPicker';
import { TextField } from './fields';

function P({ got, initial = '', accepts }: { got: string[]; initial?: string; accepts?: (t: string) => boolean }) {
  const [v, setV] = useState(initial);
  return (
    <FocusRoot>
      <ColorPicker label="Colour" value={v} accepts={accepts} onChange={(x) => { got.push(x); setV(x); }} />
      <TextField label="Next" value="" onChange={() => {}} />
    </FocusRoot>
  );
}

test('pure exports', () => {
  expect(PRESET_COLORS.length).toBe(15);
  expect(randomPresetColor(() => 0)).toBe(PRESET_COLORS[0]);
  expect(randomPresetColor(() => 0.9999)).toBe(PRESET_COLORS[14]);
  expect(normalizeHexColor('4cc')).toBe(normalizeHexColor('44CCCC'));
});

test('presets: the pick is marked, arrows move it', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} initial={PRESET_COLORS[0]} />, { width: 120, height: 14 });
  let f = t.captureCharFrame();
  expect(f).toContain('(•) ██ Coral');
  expect(f).toContain('( ) ██ Turquoise');
  expect(f).toContain('Hex code');
  t.mockInput.pressTab();
  t.mockInput.pressArrow('right');
  f = await t.settle();
  expect(got).toEqual([PRESET_COLORS[1]]);
  expect(f).toContain('(•) ██ Turquoise');
  t.renderer.destroy();
});

test('custom field: short hex goes out as #RRGGBB in capitals; bad text hinted after leaving', async () => {
  const got: string[] = [];
  const t = await drawTest(<P got={got} />, { width: 120, height: 14 });
  t.mockInput.pressTab();
  t.mockInput.pressTab();
  await t.mockInput.typeText('4cc');
  await t.settle();
  expect(got.at(-1)).toBe(normalizeHexColor('44cccc')!);
  t.mockInput.pressKey('u', { ctrl: true });
  await t.mockInput.typeText('teal');
  let f = await t.settle();
  expect(got.at(-1)).toBe('teal');
  expect(f).not.toContain('Use a hex code');
  t.mockInput.pressTab();
  f = await t.settle();
  expect(f).toContain('Use a hex code such as');
  t.renderer.destroy();
});

test('accepts: text the caller takes is not hinted', async () => {
  const t = await drawTest(<P got={[]} initial="teal" accepts={(x) => x === 'teal'} />, { width: 120, height: 14 });
  expect(t.captureCharFrame()).not.toContain('Use a hex code');
  t.renderer.destroy();
});

test('swatches: a block beside each name in colour; in mono the names alone (never colour alone)', async () => {
  const { setColourTier, colourTier } = await import('../../term/prim');
  const was = colourTier();
  try {
    setColourTier('mono');
    const t = await drawTest(<P got={[]} initial="#FF6B6B" />, { width: 120, height: 14 });
    const f = await t.settle();
    expect(f).toContain('(•) Coral');
    expect(f).toContain('( ) Turquoise');
    expect(f).not.toContain('█');
  } finally {
    setColourTier(was);
  }
});
