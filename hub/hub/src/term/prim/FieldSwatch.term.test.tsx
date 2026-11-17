// FieldSwatch: only a real colour is drawn, at the tier's precision; mono draws nothing.
import { expect, test } from 'bun:test';
import { dataColourAtTier, dataHex } from './FieldSwatch';
import { colourTier, setColourTier } from './tokens';

test('dataHex takes #RGB and #RRGGBB only', () => {
  expect(dataHex('#FF6B6B')).toBe('#ff6b6b');
  expect(dataHex('#abc')).toBe('#aabbcc');
  expect(dataHex('FF6B6B')).toBeNull();
  expect(dataHex('red')).toBeNull();
  expect(dataHex('#ff6b6b;')).toBeNull();
  expect(dataHex(undefined)).toBeNull();
});

test('tiers: truecolor as is, ansi16 nearest xterm 16, mono nothing', () => {
  const was = colourTier();
  try {
    setColourTier('truecolor');
    expect(dataColourAtTier('#FF6B6B')).toBe('#ff6b6b');
    setColourTier('ansi16');
    expect(dataColourAtTier('#FF6B6B')).toBe('#ff0000');
    expect(dataColourAtTier('#4ECDC4')).toBe('#00ffff');
    expect(dataColourAtTier('#DDA0DD')).toBe('#ff00ff');
    expect(dataColourAtTier('#808080')).toBe('#7f7f7f');
    setColourTier('mono');
    expect(dataColourAtTier('#FF6B6B')).toBeUndefined();
  } finally {
    setColourTier(was);
  }
});

test('ansi16: every ColorPicker preset keeps a hue (never black, grey or white)', async () => {
  const { PRESET_COLORS } = await import('../../kit/forms/ColorPicker.pure');
  const was = colourTier();
  try {
    setColourTier('ansi16');
    const got = PRESET_COLORS.map((c) => dataColourAtTier(c));
    for (const g of got) expect(['#000000', '#7f7f7f', '#e5e5e5', '#ffffff']).not.toContain(g!);
  } finally {
    setColourTier(was);
  }
});
