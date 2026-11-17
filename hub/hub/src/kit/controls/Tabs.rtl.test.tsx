// Vitest: a strip's chevron (StripMore) scrolls toward its own side, left to right and right to left.
// Its side is logical: right to left the start side is on the right, so its press scrolls right (a positive delta).
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StripMore } from './Tabs';

afterEach(() => vi.restoreAllMocks());

// The scroller is 300 px wide over `width` px of tabs (1700 px of overflow by default); `at` is how far it is from its start.
function pressAt(side: 'start' | 'end', dir: 'ltr' | 'rtl', at: number, width = 2000): { by?: ScrollToOptions; to?: ScrollToOptions } {
  const scroller = createRef<HTMLDivElement>();
  const { container } = render(
    <div dir={dir}>
      <StripMore side={side} edges={{ start: true, end: true }} scroller={scroller} />
      <div ref={scroller} />
    </div>,
  );
  const el = scroller.current as HTMLDivElement;
  Object.defineProperty(el, 'clientWidth', { value: 300 });
  Object.defineProperty(el, 'scrollWidth', { value: width });
  Object.defineProperty(el, 'scrollLeft', { value: dir === 'rtl' ? -at : at });
  const scrollBy = vi.fn();
  el.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
  const scrollTo = vi.fn();
  el.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
  const real = window.getComputedStyle.bind(window);
  // happy-dom does not resolve `direction` from dir: the scroller's computed direction is set by hand.
  vi.spyOn(window, 'getComputedStyle').mockImplementation((e, p) => {
    const cs = real(e, p);
    return e === el ? new Proxy(cs, { get: (o, k) => (k === 'direction' ? dir : typeof Reflect.get(o, k) === 'function' ? (Reflect.get(o, k) as (...a: unknown[]) => unknown).bind(o) : Reflect.get(o, k)) }) : cs;
  });
  const btn = container.querySelector(`[data-more="${side}"]`);
  if (!btn) throw new Error('no chevron');
  fireEvent.click(btn);
  return { by: scrollBy.mock.calls[0]?.[0] as ScrollToOptions | undefined, to: scrollTo.mock.calls[0]?.[0] as ScrollToOptions | undefined };
}
const press = (side: 'start' | 'end', dir: 'ltr' | 'rtl') => pressAt(side, dir, 600).by?.left;

describe('StripMore scrolls toward its own side', () => {
  it.each([
    ['start', 'ltr', -180],
    ['end', 'ltr', 180],
    ['start', 'rtl', 180],
    ['end', 'rtl', -180],
  ] as const)('%s chevron, %s: scrollBy left %i', (side, dir, left) => {
    expect(press(side, dir)).toBe(left);
  });

  it('the direction is read at each press: a page switched to right to left reverses the same chevron', () => {
    const scroller = createRef<HTMLDivElement>();
    const { container } = render(
      <div>
        <StripMore side="end" edges={{ start: true, end: true }} scroller={scroller} />
        <div ref={scroller} />
      </div>,
    );
    const el = scroller.current as HTMLDivElement;
    Object.defineProperty(el, 'clientWidth', { value: 300 });
    Object.defineProperty(el, 'scrollWidth', { value: 2000 });
    Object.defineProperty(el, 'scrollLeft', { get: () => (dir === 'rtl' ? -600 : 600) });
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy as unknown as HTMLElement['scrollBy'];
    let dir = 'ltr';
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((e, p) => {
      const cs = real(e, p);
      return e === el ? new Proxy(cs, { get: (o, k) => (k === 'direction' ? dir : typeof Reflect.get(o, k) === 'function' ? (Reflect.get(o, k) as (...a: unknown[]) => unknown).bind(o) : Reflect.get(o, k)) }) : cs;
    });
    const btn = container.querySelector('[data-more="end"]') as Element;
    fireEvent.click(btn);
    dir = 'rtl';
    fireEvent.click(btn);
    expect(scrollBy.mock.calls.map((c) => (c[0] as ScrollToOptions).left)).toEqual([180, -180]);
  });

  // scrollTo past the edge (the whole scroll width) lands on it: the browser clamps.
  it.each([
    ['end', 'ltr', 1650, 2000],
    ['start', 'ltr', 40, -2000],
    ['end', 'rtl', 1650, -2000],
    ['start', 'rtl', 40, 2000],
    ['end', 'ltr', 1520, 2000],
  ] as const)('%s chevron, %s, %i px from the start: within one step it goes to the edge at once (scrollTo %i, auto)', (side, dir, at, left) => {
    expect(pressAt(side, dir, at)).toEqual({ by: undefined, to: { left, behavior: 'auto' } });
  });

  it('right to left a strip resting just past its start (scrollLeft +1, as Chromium leaves it) still goes all the way to the end', () => {
    expect(pressAt('end', 'rtl', -1, 326)).toEqual({ by: undefined, to: { left: -326, behavior: 'auto' } });
  });

  it('right to left that +1 rest counts as the start: 181 px of overflow is still one step and a pixel away, a smooth step', () => {
    expect(pressAt('end', 'rtl', -1, 481)).toEqual({ by: { left: -180, behavior: 'smooth' }, to: undefined });
  });

  it.each([
    ['end', 'ltr', 1400, 180],
    ['start', 'rtl', 181, 180],
  ] as const)('%s chevron, %s, %i px from the start: farther than one step from the edge it stays a smooth step (scrollBy %i)', (side, dir, at, left) => {
    expect(pressAt(side, dir, at)).toEqual({ by: { left, behavior: 'smooth' }, to: undefined });
  });

  it('a side with nothing beyond it shows no chevron', () => {
    const { container } = render(<StripMore side="end" edges={{ start: true, end: false }} scroller={createRef()} />);
    expect(container.querySelector('[data-more]')).toBeNull();
  });
});
