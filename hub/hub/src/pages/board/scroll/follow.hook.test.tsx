// useFollowActive on a real element: when it scrolls, when it holds still, and how it stops an older glide.
import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Box } from '../model/geom';
import { useFollowActive, type Follow } from './follow';

const box = (top: number, height = 200): Box => ({ left: 0, width: 100, top, height });
let calls: Array<{ top: number; behavior?: string }> = [];
let viewH = 500;
let el: HTMLDivElement | null = null;

function View({ k, ...p }: Omit<Follow, 'key' | 'viewH' | 'mode'> & { k: string; mode?: Follow['mode']; viewH?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFollowActive(ref, { mode: 'scroll', viewH, key: k, ...p });
  return <div ref={(e) => { ref.current = e; el = e; }} />;
}

beforeEach(() => {
  calls = [];
  viewH = 500;
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewH);
  HTMLElement.prototype.scrollTo = function (this: HTMLElement, o?: ScrollToOptions | number) {
    const opts = typeof o === 'object' ? o : {};
    calls.push({ top: opts.top ?? 0, behavior: opts.behavior });
    this.scrollTop = opts.top ?? 0;
  } as typeof HTMLElement.prototype.scrollTo;
});
afterEach(() => { vi.restoreAllMocks(); });

describe('following the active tile', () => {
  it('holds still while a drag is on, and catches up on release', () => {
    const r = render(<View k="v" box={box(4)} paused={false} />);
    expect(calls).toHaveLength(0);
    r.rerender(<View k="v" box={box(900)} paused />);
    expect(calls).toHaveLength(0);
    r.rerender(<View k="v" box={box(900)} paused={false} />);
    expect(calls.map((c) => c.top)).toEqual([900 + 200 + 4 - 500]);
  });
  it('a smaller view with the same boxes follows again', () => {
    const r = render(<View k="v" box={box(168, 160)} paused={false} viewH={300} />);
    expect(calls).toHaveLength(0);
    viewH = 250;
    r.rerender(<View k="v" box={box(168, 160)} paused={false} viewH={250} />);
    expect(calls.map((c) => c.top)).toEqual([168 + 160 + 4 - 250]);
  });
  it('another Board with the same slot and box still follows from where the view is', () => {
    const r = render(<View k="b1:s1" box={box(100)} paused={false} />);
    (el as HTMLDivElement).scrollTop = 800;
    r.rerender(<View k="b2:s1" box={box(100)} paused={false} />);
    expect(calls.map((c) => c.top)).toEqual([100 - 4]);
  });
  it('a newer target already shown stops a glide still heading for an older one; after the glide ends nothing is sent', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList);
    HTMLElement.prototype.scrollTo = function (o?: ScrollToOptions | number) { calls.push({ top: (o as ScrollToOptions).top ?? 0, behavior: (o as ScrollToOptions).behavior }); } as typeof HTMLElement.prototype.scrollTo;
    const r = render(<View k="v:a" box={box(4)} paused={false} />);
    r.rerender(<View k="v:b" box={box(900)} paused={false} />);
    expect(calls).toEqual([{ top: 604, behavior: 'smooth' }]);
    // Still at 0 (the glide has not moved yet): the upper tile is shown, so the glide is stopped where it is.
    r.rerender(<View k="v:a" box={box(4)} paused={false} />);
    expect(calls[1]).toEqual({ top: 0, behavior: 'instant' });
  });
  it('once a glide has ended, a shown target sends nothing', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList);
    HTMLElement.prototype.scrollTo = function (o?: ScrollToOptions | number) { calls.push({ top: (o as ScrollToOptions).top ?? 0, behavior: (o as ScrollToOptions).behavior }); } as typeof HTMLElement.prototype.scrollTo;
    const r = render(<View k="v:a" box={box(4)} paused={false} />);
    r.rerender(<View k="v:b" box={box(900)} paused={false} />);
    expect(calls).toHaveLength(1);
    (el as HTMLDivElement).dispatchEvent(new Event('scrollend'));
    r.rerender(<View k="v:c" box={box(14)} paused={false} />);
    expect(calls).toHaveLength(1);
  });
  it.each([
    ['a drag begins', { paused: true }],
    ['the Board goes back to Fit', { mode: undefined }],
    ['the tile is maximised', { box: undefined }],
  ] as const)('a glide still running stops where it is when %s', (_name, change) => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: false }) as MediaQueryList);
    HTMLElement.prototype.scrollTo = function (o?: ScrollToOptions | number) { calls.push({ top: (o as ScrollToOptions).top ?? 0, behavior: (o as ScrollToOptions).behavior }); } as typeof HTMLElement.prototype.scrollTo;
    const r = render(<View k="v:a" box={box(4)} paused={false} />);
    r.rerender(<View k="v:b" box={box(900)} paused={false} />);
    expect(calls).toEqual([{ top: 604, behavior: 'smooth' }]);
    r.rerender(<View k="v:b" box={box(900)} paused={false} {...change} />);
    expect(calls[1]).toEqual({ top: 0, behavior: 'instant' });
    // Stopped once: the next render sends nothing more.
    r.rerender(<View k="v:b" box={box(900)} paused={false} {...change} viewH={499} />);
    expect(calls).toHaveLength(2);
  });
  it('with no glide running (reduced motion), a drag sends nothing', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ matches: true }) as MediaQueryList);
    const r = render(<View k="v" box={box(900)} paused={false} />);
    expect(calls).toHaveLength(1);
    r.rerender(<View k="v" box={box(900)} paused />);
    expect(calls).toHaveLength(1);
  });
  it('never scrolls in Fit', () => {
    const r = render(<View k="v" box={box(4)} paused={false} mode={undefined} />);
    r.rerender(<View k="v:x" box={box(900)} paused={false} mode={undefined} />);
    expect(calls).toHaveLength(0);
  });
});
