import { describe, expect, it } from 'vitest';
import { dividers, dropZone, fits, GAP, PAD, presetFits, ratioLabel, tileBoxes } from './geom';
import { presetTree, slotNode, split } from './tree';

const two = split('row', 0.5, slotNode('sa'), slotNode('sb'));

describe('tile boxes', () => {
  it('pads the area and leaves a gap between tiles, none at the outer edges', () => {
    const b = tileBoxes(two, 1008, 608);
    expect(b.sa).toEqual({ left: PAD, top: PAD, width: 500 - GAP / 2, height: 600 });
    expect(b.sb).toEqual({ left: PAD + 500 + GAP / 2, top: PAD, width: 500 - GAP / 2, height: 600 });
  });
});

describe('fit', () => {
  it('every tile needs 240 x 160', () => {
    expect(fits(two, 2 * PAD + 2 * 240 + GAP, 2 * PAD + 160)).toBe(true);
    expect(fits(two, 2 * PAD + 2 * 240 + GAP - 1, 2 * PAD + 160)).toBe(false);
    expect(fits(two, 1000, 2 * PAD + 159)).toBe(false);
  });
  it('at 712 px a 2-column preset fits and a 3-column one does not (768 portrait)', () => {
    expect(presetFits('two-side', 712, 900)).toBe(true);
    expect(presetFits('three-cols', 712, 900)).toBe(false);
    expect(presetFits('grid', 712, 900)).toBe(true);
  });
});

describe('dividers', () => {
  it('one per split, in the gap, with the split\'s length and sides', () => {
    const d = dividers(presetTree('one-two', ['sa', 'sb', 'sc']), 1008, 608);
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ dir: 'row', path: [], length: 1000, start: PAD, a: ['sa'], b: ['sb', 'sc'] });
    expect(d[0]!.box).toEqual({ left: PAD + 500 - GAP / 2, top: PAD, width: GAP, height: 600 });
    expect(d[1]).toMatchObject({ dir: 'col', path: ['b'], length: 600, a: ['sb'], b: ['sc'] });
    expect(d[1]!.box.left).toBe(PAD + 500);
  });
});

describe('drop zones', () => {
  const box = { left: 0, top: 0, width: 100, height: 100 };
  it('the middle half swaps; the nearest edge band splits; outside is none', () => {
    expect(dropZone(box, 50, 50)).toBe('centre');
    expect(dropZone(box, 10, 50)).toBe('left');
    expect(dropZone(box, 90, 40)).toBe('right');
    expect(dropZone(box, 50, 5)).toBe('up');
    expect(dropZone(box, 60, 95)).toBe('down');
    expect(dropZone(box, 101, 50)).toBeNull();
  });
  it('ratio captions read as fractions', () => {
    expect(ratioLabel(1 / 3)).toBe('1/3');
    expect(ratioLabel(0.42)).toBe('42%');
  });
});
