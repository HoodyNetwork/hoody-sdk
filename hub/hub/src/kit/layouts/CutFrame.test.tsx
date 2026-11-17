// CutFrame: the slanted-corner frame. Its outline is one path whose bottom-right corner is cut by
// `cut`, drawn at the frame's size and redrawn when that changes; the content sits in the clipped inner box.
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CutFrame, cutFramePath } from './CutFrame';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CutFrame', () => {
  // The source's path: every point on the half pixel, the diagonal from (w-0.5, h-0.5-cut) to
  // (w-0.5-cut, h-0.5), so a 420 × 300 frame reads V283.5L403.5 299.5 (it was V284L404).
  it('the outline is one closed path on the half pixel, its corner cut by the given size', () => {
    expect(cutFramePath(420, 300, 16)).toBe('M0.5 0.5H419.5V283.5L403.5 299.5H0.5Z');
    expect(cutFramePath(100, 50, 8)).toBe('M0.5 0.5H99.5V41.5L91.5 49.5H0.5Z');
  });

  it('draws the edge at its size, redraws it on a resize, and keeps its element, attributes and content', () => {
    const fire: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: (e: unknown[]) => void) {
        fire.push(() => cb([]));
      }
      observe() {}
      disconnect() {}
    });
    let w = 420;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => w);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 300);
    render(
      <CutFrame as="article" aria-label="atlas" data-bad="">
        <p>inside</p>
      </CutFrame>,
    );
    const a = screen.getByRole('article', { name: 'atlas' });
    expect(a.hasAttribute('data-bad')).toBe(true);
    expect(a.style.getPropertyValue('--cut')).toBe('16px');
    expect(screen.getByText('inside')).toBeInTheDocument();
    const d = () => a.querySelector('[data-cut-edge] path')?.getAttribute('d');
    expect(a.querySelector('[data-cut-edge]')?.getAttribute('aria-hidden')).toBe('true');
    expect(d()).toBe(cutFramePath(420, 300, 16));
    w = 500;
    act(() => fire.forEach((f) => f()));
    expect(d()).toBe(cutFramePath(500, 300, 16));
  });

  it('draws no edge before it has a size larger than its corner', () => {
    render(<CutFrame>x</CutFrame>);
    expect(document.querySelector('[data-cut-edge]')).toBeNull();
  });
});
