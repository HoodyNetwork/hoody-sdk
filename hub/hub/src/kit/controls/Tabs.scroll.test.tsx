// Vitest: an overflowing strip keeps the open tab in view until the person scrolls it, and then leaves it where they
// put it until the open tab changes. Only input is the person's (a sideways wheel, a chevron); a scroll event alone, a
// layout clamp or the strip's own write, never is.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from './Tabs';

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs' },
];

// Tabs are 100 px wide, 120 px apart (340 px in all); the scroller is `width` px wide, so it overflows below 340.
// Right to left the first tab sits at the right edge and scrollLeft runs from 0 down to minus the overflow.
let width = 300;
let rtl = false;
let observers: Array<() => void> = [];
const lefts = new WeakMap<Element, number>();
const isScroller = (el: Element) => el.firstElementChild?.getAttribute('role') === 'tablist';
const scrollerOf = () => screen.getByRole('tablist').parentElement as HTMLElement;
const over = () => Math.max(0, 340 - width);
const clampLeft = (v: number) => (rtl ? Math.min(0, Math.max(-over(), v)) : Math.min(over(), Math.max(0, v)));
// A browser's scroll position change: one scroll event at the next frame, however many moves came before it.
const pendingScroll = new WeakSet<Element>();
const moveTo = (el: Element, v: number) => {
  const next = clampLeft(v);
  if (next === (lefts.get(el) ?? 0)) return;
  lefts.set(el, next);
  if (pendingScroll.has(el)) return;
  pendingScroll.add(el);
  requestAnimationFrame(() => {
    pendingScroll.delete(el);
    el.dispatchEvent(new Event('scroll'));
  });
};
const at = () => Math.abs(scrollerOf().scrollLeft);
// Runs once right after the next scrollLeft write (only the strip itself writes it; the person moves via moveTo).
let afterWrite: (() => void) | undefined;
const realScrollBy = Element.prototype.scrollBy;

beforeEach(() => {
  width = 300;
  rtl = false;
  observers = [];
  afterWrite = undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: () => void) {}
      observe() {
        observers.push(() => this.cb());
      }
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isScroller(this) ? Math.max(340, width) : 0;
  });
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockImplementation(function (this: Element) {
    return lefts.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function (this: Element, v: number) {
    moveTo(this, v);
    const then = afterWrite;
    afterWrite = undefined;
    then?.();
  });
  Element.prototype.scrollBy = function (this: Element, o?: ScrollToOptions | number) {
    moveTo(this, (lefts.get(this) ?? 0) + (typeof o === 'number' ? o : (o?.left ?? 0)));
  } as Element['scrollBy'];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (left: number, w: number) => ({ left, right: left + w, width: w, top: 0, bottom: 40, height: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    if (isScroller(this)) return rect(0, width);
    const i = VIEWS.findIndex((v) => this.getAttribute('role') === 'tab' && this.textContent?.includes(v.label));
    if (i < 0) return rect(0, 0);
    const sl = lefts.get(scrollerOf()) ?? 0;
    return rect(rtl ? width - sl - i * 120 - 100 : i * 120 - sl, 100);
  });
});
afterEach(() => {
  Element.prototype.scrollBy = realScrollBy;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A few frames and microtasks: keep-in-view runs a frame after its effect, and each move's scroll comes after it.
const settle = () => act(async () => {
  for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r(undefined)));
});
// The person scrolls: a sideways wheel, then the position it leads to (toward the end is positive left to right).
const wheelTo = (abs: number) => {
  const el = scrollerOf();
  fireEvent.wheel(el, { deltaX: 40 });
  moveTo(el, rtl ? -abs : abs);
};
// The bar changes width: the browser clamps the position (a scroll event, no input), then the observer reports.
const resize = async (w: number) => {
  width = w;
  const el = scrollerOf();
  moveTo(el, lefts.get(el) ?? 0);
  await act(async () => observers.forEach((o) => o()));
  await settle();
};

describe.each([false, true])('Tabs keep-in-view leaves a scroll by hand alone (rtl %s)', (dir) => {
  beforeEach(() => {
    rtl = dir;
  });

  it('first tab open, wheeled to the end: the start edge appearing does not pull it back', async () => {
    render(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    expect(at()).toBe(0);
    wheelTo(40);
    await settle();
    expect(at()).toBe(40);
  });

  // A mouse press on the strip's own scrollbar (a bar 8 px tall under the 40 px of tabs), as the browser reports it: the target is the
  // scroller and offsetY lies below its content box. A press on a tab or in the tab row reports a smaller offsetY or another target.
  const press = (target: Element, offsetY: number) => {
    const e = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(e, { pointerType: { value: 'mouse' }, button: { value: 0 }, offsetY: { value: offsetY } });
    act(() => { target.dispatchEvent(e); });
  };
  const withScrollbar = () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return isScroller(this) ? 48 : 0; });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return isScroller(this) ? 40 : 0; });
  };

  it('a mouse press on the strip\'s own scrollbar, then the drag: the strip stays where the drag took it', async () => {
    withScrollbar();
    render(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    press(scrollerOf(), 44);
    moveTo(scrollerOf(), rtl ? -40 : 40);
    await settle();
    expect(at()).toBe(40);
  });

  it('a mouse press in the tab row (not the scrollbar) is not a scroll by hand: the same move is pulled back', async () => {
    withScrollbar();
    render(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    press(scrollerOf(), 10);
    moveTo(scrollerOf(), rtl ? -40 : 40);
    await settle();
    expect(at()).toBe(0);
  });

  it('a change of the open tab brings it into view again after a scroll by hand', async () => {
    const { rerender } = render(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    wheelTo(40);
    await settle();
    rerender(<Tabs label="Board" items={VIEWS} value="b" />);
    await settle();
    rerender(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    expect(at()).toBe(0);
  });

  it('a layout clamp is not a scroll by hand: widened (clamped), then narrowed, the open tab stays in view', async () => {
    render(<Tabs label="Board" items={VIEWS} value="c" />);
    await settle();
    expect(at()).toBe(40);
    await resize(330);
    expect(at()).toBe(10);
    await resize(250);
    expect(at()).toBe(90);
  });

  it('a scroll by hand after keep-in-view was scheduled, before its frame, is not undone', async () => {
    const { rerender } = render(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    act(() => rerender(<Tabs label="Board" items={VIEWS} value="c" />));
    wheelTo(20);
    await settle();
    expect(at()).toBe(20);
  });

  it("a small move by hand next to the strip's own write still counts as the person's", async () => {
    width = 400;
    render(<Tabs label="Board" items={VIEWS} value="c" />);
    await settle();
    // Narrowed: keep-in-view writes 40. The person's wheel lands right after that write, before the one scroll event
    // both moves share.
    afterWrite = () => wheelTo(39);
    await resize(300);
    expect(at()).toBe(39);
    await resize(250);
    expect(at()).toBe(39);
  });
});

describe('Tabs keep-in-view and the strip chevron', () => {
  it('first tab open, the end chevron pressed: the strip stays where the press took it', async () => {
    render(<Tabs label="Board" items={VIEWS} value="a" />);
    await settle();
    const more = document.querySelector('[data-more="end"]');
    if (!more) throw new Error('no end chevron');
    fireEvent.click(more);
    await settle();
    expect(at()).toBe(40);
  });
});
