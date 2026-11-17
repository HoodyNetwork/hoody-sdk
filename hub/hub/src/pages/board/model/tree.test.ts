import { describe, expect, it } from 'vitest';
import {
  dragRatio, equalise, minSize, neighbour, pathTo, presetTree, PRESETS, PRESET_SLOTS, rects, removeSlot, resizeToward, setRatio, slots, split,
  splitSlot, slotNode as s, type Node, type SplitNode,
} from './tree';

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe('split tree', () => {
  it('splits right / down / left / up, keeping reading order', () => {
    expect(slots(splitSlot(s('a'), 'a', 'b', 'right'))).toEqual(['a', 'b']);
    expect(slots(splitSlot(s('a'), 'a', 'b', 'left'))).toEqual(['b', 'a']);
    expect(splitSlot(s('a'), 'a', 'b', 'down')).toEqual(split('col', 0.5, s('a'), s('b')));
    expect(splitSlot(s('a'), 'a', 'b', 'up')).toEqual(split('col', 0.5, s('b'), s('a')));
  });
  it('removing a slot gives its room to the sibling; the last slot leaves nothing', () => {
    const t = presetTree('one-two', ['a', 'b', 'c']);
    expect(removeSlot(t, 'b')).toEqual(split('row', 0.5, s('a'), s('c')));
    expect(removeSlot(t, 'a')).toEqual(split('col', 0.5, s('b'), s('c')));
    expect(removeSlot(s('a'), 'a')).toBeNull();
    expect(removeSlot(t, 'zz')).toBe(t);
  });
  it('rects tile the unit square', () => {
    const r = rects(presetTree('grid', ['a', 'b', 'c', 'd']));
    expect(r).toEqual({ a: { x: 0, y: 0, w: 0.5, h: 0.5 }, b: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, c: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, d: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } });
    const three = rects(presetTree('three-cols', ['a', 'b', 'c']));
    expect(close(three.a!.w, 1 / 3) && close(three.b!.w, 1 / 3) && close(three.c!.w, 1 / 3)).toBe(true);
  });
  it('neighbours: most shared edge, then nearest centre; null at the edge', () => {
    const t = presetTree('one-two', ['a', 'b', 'c']);
    expect(neighbour(t, 'a', 'right')).toBe('b');
    expect(neighbour(t, 'c', 'left')).toBe('a');
    expect(neighbour(t, 'b', 'down')).toBe('c');
    expect(neighbour(t, 'c', 'up')).toBe('b');
    expect(neighbour(t, 'a', 'left')).toBeNull();
    expect(neighbour(t, 'b', 'right')).toBeNull();
    const g = presetTree('grid', ['a', 'b', 'c', 'd']);
    expect(neighbour(g, 'a', 'down')).toBe('c');
    expect(neighbour(g, 'd', 'left')).toBe('c');
  });
  it('every preset has its slot count and tiles the square', () => {
    for (const p of PRESETS) {
      const ids = Array.from({ length: PRESET_SLOTS[p] }, (_, i) => 's' + i);
      const t = presetTree(p, ids);
      expect(slots(t)).toEqual(ids);
      const area = Object.values(rects(t)).reduce((n, r) => n + r.w * r.h, 0);
      expect(close(area, 1)).toBe(true);
    }
    expect(() => presetTree('grid', ['a'])).toThrow();
  });
  it('setRatio clamps to 0.1..0.9 and ignores bad paths and NaN', () => {
    const t = split('row', 0.5, s('a'), s('b'));
    expect((setRatio(t, [], 0.95) as SplitNode).ratio).toBe(0.9);
    expect((setRatio(t, [], 0.01) as SplitNode).ratio).toBe(0.1);
    expect(setRatio(t, ['a'], 0.3)).toBe(t);
    expect(setRatio(t, [], Number.NaN)).toBe(t);
  });
  it('keyboard resize moves the divider on that side of the slot', () => {
    const t = presetTree('one-two', ['a', 'b', 'c']);
    expect((resizeToward(t, 'a', 'right') as SplitNode).ratio).toBeCloseTo(0.55);
    expect((resizeToward(t, 'b', 'left') as SplitNode).ratio).toBeCloseTo(0.45);
    expect(resizeToward(t, 'a', 'left')).toBe(t);
    const down = resizeToward(t, 'b', 'down') as SplitNode;
    expect((down.b as SplitNode).ratio).toBeCloseTo(0.55);
    expect(resizeToward(t, 'b', 'up')).toBe(t);
  });
  it('equalise shares the room by slot count along each split', () => {
    const t: Node = split('row', 0.8, s('a'), split('row', 0.2, s('b'), s('c')));
    const e = equalise(t) as SplitNode;
    expect(e.ratio).toBeCloseTo(1 / 3);
    expect((e.b as SplitNode).ratio).toBeCloseTo(0.5);
    const mixed = equalise(split('row', 0.9, s('a'), split('col', 0.1, s('b'), s('c')))) as SplitNode;
    expect(mixed.ratio).toBeCloseTo(0.5);
  });
  it('minimum size adds along a split and takes the max across it', () => {
    expect(minSize(presetTree('one-two', ['a', 'b', 'c']))).toEqual({ w: 480, h: 320 });
  });
  it('dragging snaps within 12 px and keeps both sides at their minimum', () => {
    const t = split('row', 0.5, s('a'), s('b')) as SplitNode;
    expect(dragRatio(t, 0.34, 1000)).toBeCloseTo(1 / 3);
    expect(dragRatio(t, 0.36, 1000)).toBeCloseTo(0.36);
    expect(dragRatio(t, 0.05, 1000)).toBeCloseTo(0.24);
    expect(dragRatio(t, 0.99, 1000)).toBeCloseTo(0.76);
    expect(dragRatio(t, 0.7, 400)).toBeCloseTo(0.5);
    expect(dragRatio(t, Number.NaN, 1000)).toBe(0.5);
  });
  it('pathTo finds a slot', () => {
    expect(pathTo(presetTree('grid', ['a', 'b', 'c', 'd']), 'c')).toEqual(['b', 'a']);
    expect(pathTo(s('a'), 'x')).toBeNull();
  });
});
