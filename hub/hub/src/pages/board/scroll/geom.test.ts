import { describe, expect, it } from 'vitest';
import { fits, GAP, PAD, tileBoxes } from '../model/geom';
import { MIN_TILE, presetTree, slotNode, split } from '../model/tree';
import { boardHeight, layoutFits, presetFitsIn, scrollHeight, scrollSlot } from './geom';

const one = slotNode('sa');
const side = split('row', 0.5, slotNode('sa'), slotNode('sb'));
const stacked = (r: number) => split('col', r, slotNode('sa'), slotNode('sb'));
const minHeight = (layout: Parameters<typeof tileBoxes>[0], w: number, h: number) => Math.min(...Object.values(tileBoxes(layout, w, h)).map((b) => b.height));

describe('the slot height a scrolling Board gives each tile', () => {
  it('is what two stacked tiles get in the view, never under the minimum tile and never over the view', () => {
    expect(scrollSlot(800)).toBe((800 - 2 * PAD - GAP) / 2);
    expect(scrollSlot(200)).toBe(MIN_TILE.h);
    expect(scrollSlot(100)).toBe(100 - 2 * PAD);
    expect(scrollSlot(0)).toBe(0);
  });
});

describe('scroll height', () => {
  it('a single tile or a row of tiles stays the view height', () => {
    expect(scrollHeight(one, 600)).toBe(600);
    expect(scrollHeight(side, 600)).toBe(600);
  });
  it('two stacked tiles at an even split fill the view when each already gets half', () => {
    expect(scrollHeight(stacked(0.5), 600)).toBe(600);
  });
  it('a grid of four rows grows so every row gets the slot height', () => {
    const rows = split('col', 0.5, split('col', 0.5, slotNode('a'), slotNode('b')), split('col', 0.5, slotNode('c'), slotNode('d')));
    const h = scrollHeight(rows, 600);
    expect(h).toBeGreaterThan(600);
    expect(minHeight(rows, 1000, h)).toBeGreaterThanOrEqual(scrollSlot(600) - 1e-6);
    expect(minHeight(rows, 1000, h - 1)).toBeLessThan(scrollSlot(600));
  });
  it('an uneven split grows for its smaller side', () => {
    const h = scrollHeight(stacked(0.2), 600);
    expect(minHeight(stacked(0.2), 1000, h)).toBeGreaterThanOrEqual(scrollSlot(600) - 1e-6);
    expect(minHeight(stacked(0.2), 1000, h - 1)).toBeLessThan(scrollSlot(600));
  });
  it('a three-column preset with stacked tiles makes every tile tall enough to fit when wide enough', () => {
    const l = presetTree('grid', ['a', 'b', 'c', 'd']);
    const h = scrollHeight(l, 300);
    expect(fits(l, 1200, h)).toBe(true);
  });
  it('never goes under the view, and counts the padding and gaps', () => {
    const h = scrollHeight(stacked(0.5), 400);
    expect(h).toBe(400);
    expect(scrollHeight(stacked(0.5), 200)).toBe(2 * PAD + 2 * MIN_TILE.h + GAP);
  });
  it('a zero-height view gives zero', () => {
    expect(scrollHeight(stacked(0.5), 0)).toBe(0);
  });
});

describe('board height', () => {
  it('Fit keeps the view height whatever the layout', () => {
    expect(boardHeight(undefined, stacked(0.1), 600)).toBe(600);
  });
  it('Scroll uses the scroll height', () => {
    expect(boardHeight('scroll', stacked(0.1), 600)).toBe(scrollHeight(stacked(0.1), 600));
    expect(boardHeight('scroll', stacked(0.1), 600)).toBeGreaterThan(600);
  });
});

describe('fit in a mode', () => {
  const rows = split('col', 0.5, split('col', 0.5, slotNode('a'), slotNode('b')), split('col', 0.5, slotNode('c'), slotNode('d')));
  it('four stacked rows do not fit a short view in Fit but do in Scroll', () => {
    expect(layoutFits(undefined, rows, 1000, 500)).toBe(false);
    expect(layoutFits('scroll', rows, 1000, 500)).toBe(true);
  });
  it('Scroll never makes a layout too narrow fit', () => {
    expect(layoutFits('scroll', side, 2 * PAD + 2 * 240 + GAP - 1, 2000)).toBe(false);
  });
  it('a preset with stacked tiles fits a short view only in Scroll; a too-wide preset fits in neither', () => {
    expect(presetFitsIn(undefined, 'grid', 1000, 300)).toBe(false);
    expect(presetFitsIn('scroll', 'grid', 1000, 300)).toBe(true);
    expect(presetFitsIn('scroll', 'three-cols', 600, 900)).toBe(false);
  });
});
