// useInnerWheel: a capped list takes a wheel tick while it can still move that way (a run of ticks the browser keeps
// scrolling an outer box with, as Firefox does, is still dispatched at the list). The test DOM has no layout, so sizes and scroll
// positions are set by hand; the browser case is pages/computers/realms-wheel.spec.ts. The test DOM is happy-dom, whose
// WheelEvent is a UIEvent without the MouseEvent modifier keys, so `tick` sets them on the event as a browser has them.
import { act, render } from '@testing-library/react';
import { createElement, useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { takeWheel, useInnerWheel, wheelDeltaPx } from './innerWheel';

function sized(el: HTMLElement, sh: number, ch: number): HTMLElement {
  let top = 0;
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => sh });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => ch });
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = Math.max(0, Math.min(sh - ch, v))) });
  return el;
}

const tick = (at: Element, init: WheelEventInit = {}) => {
  const e = new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, ...init });
  for (const k of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) Object.defineProperty(e, k, { configurable: true, value: init[k] ?? false });
  at.dispatchEvent(e);
  return e;
};

function List({ on = true }: { on?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useInnerWheel(ref, on);
  return createElement('div', { ref, 'data-list': '' }, createElement('div', { 'data-row': '' }, 'row'));
}

function mount(on = true) {
  const r = render(createElement(List, { on }));
  const list = sized(document.querySelector<HTMLElement>('[data-list]')!, 1150, 380);
  const row = document.querySelector<HTMLElement>('[data-row]')!;
  return { ...r, list, row };
}

afterEach(() => document.body.replaceChildren());

describe('useInnerWheel', () => {
  it('a tick on a row moves the list and cancels the browser scroll; up moves it back', () => {
    const { list, row } = mount();
    expect(tick(row).defaultPrevented).toBe(true);
    tick(row, { deltaY: -40 });
    expect(list.scrollTop).toBe(80);
  });

  it('at the list ends the browser decides', () => {
    const { list, row } = mount();
    expect(tick(row, { deltaY: -120 }).defaultPrevented).toBe(false);
    list.scrollTop = 1150 - 380;
    expect(tick(row).defaultPrevented).toBe(false);
  });

  it('zoom, Shift and sideways ticks and a tick a handler inside already took are left alone', () => {
    const { list, row } = mount();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { deltaY: 10, deltaX: 40 }]) expect(tick(row, init).defaultPrevented).toBe(false);
    const taken = (e: Event) => e.preventDefault();
    row.addEventListener('wheel', taken);
    tick(row);
    expect(list.scrollTop).toBe(0);
  });

  it('a list that is not capped (on: false) does not listen; unmounting stops listening', () => {
    const off = mount(false);
    expect(tick(off.row).defaultPrevented).toBe(false);
    off.unmount();
    const { list, row, unmount } = mount();
    unmount();
    act(() => void tick(row));
    expect(list.scrollTop).toBe(0);
  });

  it('only the list listens: a tick outside it is not touched', () => {
    mount();
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    expect(tick(outside).defaultPrevented).toBe(false);
  });
});

describe('wheel deltas', () => {
  const box = sized(document.createElement('div'), 1000, 300);
  it('pixels as they are, lines at 16 px, pages at the box height', () => {
    expect(wheelDeltaPx(new WheelEvent('wheel', { deltaY: 53.5 }), box)).toBe(53.5);
    expect(wheelDeltaPx(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1 }), box)).toBe(48);
    expect(wheelDeltaPx(new WheelEvent('wheel', { deltaY: -1, deltaMode: 2 }), box)).toBe(-300);
  });

  it('takeWheel moves by the converted amount', () => {
    const b = sized(document.createElement('div'), 1000, 300);
    takeWheel(b, new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, cancelable: true }));
    expect(b.scrollTop).toBe(48);
  });
});
