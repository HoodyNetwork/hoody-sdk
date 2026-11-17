import { describe, expect, it } from 'vitest';
import { PAD } from '../model/geom';
import { scrollTopFor } from './follow';

const box = (top: number, height: number) => ({ left: 0, width: 100, top, height });

describe('the scroll position that shows the active tile', () => {
  it('a tile wholly shown needs no scroll', () => {
    expect(scrollTopFor(box(PAD, 200), 0, 500)).toBeNull();
    expect(scrollTopFor(box(300, 200 - PAD), 0, 500)).toBeNull();
  });
  it('a tile below the view comes in with its bottom at the view\'s bottom', () => {
    expect(scrollTopFor(box(600, 200), 0, 500)).toBe(600 + 200 + PAD - 500);
    expect(scrollTopFor(box(300, 200), 0, 500)).toBe(300 + 200 + PAD - 500);
  });
  it('a tile above the view comes in with its top at the view\'s top', () => {
    expect(scrollTopFor(box(100, 200), 400, 500)).toBe(100 - PAD);
  });
  it('a tile taller than the view shows its top', () => {
    expect(scrollTopFor(box(700, 900), 0, 500)).toBe(700 - PAD);
  });
  it('never scrolls above the start', () => {
    expect(scrollTopFor(box(0, 200), 50, 500)).toBe(0);
  });
});
