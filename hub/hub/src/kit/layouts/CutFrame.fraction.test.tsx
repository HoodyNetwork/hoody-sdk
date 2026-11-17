// A frame of a fractional size (a card 159.5 px tall): offsetHeight rounds it up to 160, so the line drawn on h - 0.5
// sat on the card's clipped edge and its bottom line vanished (computers Overview "On atlas"). The
// measured size is the layout box floored, so the line stays inside the clip. Where the layout box is unknown (0, as
// in a test DOM) the offset size stands.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CutFrame, cutFramePath } from './CutFrame';

afterEach(() => {
  vi.restoreAllMocks();
});

const box = (width: number, height: number) => ({ x: 0, y: 0, top: 0, left: 0, width, height, right: width, bottom: height, toJSON: () => ({}) }) as DOMRect;

describe('CutFrame: a fractional size', () => {
  it('is floored, never rounded up: the bottom line stays inside the clip', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 421);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 160);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => box(420.5, 159.5));
    render(<CutFrame as="article" aria-label="frac">x</CutFrame>);
    const a = screen.getByRole('article', { name: 'frac' });
    expect(a.querySelector('[data-cut-edge] path')?.getAttribute('d')).toBe(cutFramePath(420, 159, 16));
  });

  it('a whole size is drawn as it is', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 420);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => box(420, 300));
    render(<CutFrame as="article" aria-label="whole">x</CutFrame>);
    const a = screen.getByRole('article', { name: 'whole' });
    expect(a.querySelector('[data-cut-edge] path')?.getAttribute('d')).toBe(cutFramePath(420, 300, 16));
  });
});
