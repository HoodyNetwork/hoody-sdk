// useRowFit: a row steps down while it overflows, and when its box grows it goes back
// to the most generous step whose measured width fits, even past a tighter step that needs more (a table toolbar's one
// filter chip is narrower than the Filters button with its words), so it unfolds at the width it folded at. Layout is
// faked: the row's box is set by hand and each step needs a fixed width.
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRowFit } from './media';

type Entry = { target: Element };
const observers: { cb: (e: Entry[]) => void; els: Set<Element> }[] = [];
const box = new Map<Element, number>();

beforeEach(() => {
  observers.length = 0;
  box.clear();
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o: { cb: (e: Entry[]) => void; els: Set<Element> };
    constructor(cb: (e: Entry[]) => void) {
      this.o = { cb, els: new Set() };
      observers.push(this.o);
    }
    observe(el: Element) {
      this.o.els.add(el);
    }
    unobserve(el: Element) {
      this.o.els.delete(el);
    }
    disconnect() {
      this.o.els.clear();
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return box.get(this) ?? 0; } });
});

afterEach(() => {
  document.body.innerHTML = '';
});

/** A row of three steps that needs `needs[step]` px; returns the steps it drew and a way to set its box. */
function mount(needs: readonly number[], start: number) {
  const seen: number[] = [];
  let row: HTMLDivElement | null = null;
  const need = (el: HTMLElement) => needs[Number(el.dataset.step)] ?? 0;
  function Row() {
    const ref = useRef<HTMLDivElement>(null);
    const step = useRowFit(ref, needs.length - 1, 'k', true, need);
    seen.push(step);
    return (
      <div
        data-step={step}
        ref={(el) => {
          ref.current = el;
          row = el;
          if (el && !box.has(el)) box.set(el, start);
        }}
      />
    );
  }
  render(<Row />);
  const resize = (w: number) => {
    box.set(row as unknown as Element, w);
    act(() => {
      for (const o of observers) if (o.els.has(row as unknown as Element)) o.cb([{ target: row as unknown as Element }]);
    });
  };
  return { step: () => seen.at(-1), renders: () => seen.length, seen: () => seen.slice(), resize };
}

describe('useRowFit steps back up to the most generous step that fits', () => {
  it('a step that needs more than the one before it: the row unfolds at the width it folded at (Data view: 428 chips, 454 Filters button with the count)', () => {
    const r = mount([428, 454, 300], 1000);
    expect(r.step()).toBe(0);
    r.resize(426);
    expect(r.step(), 'step 0 needs 428 and step 1 needs 454: both overflow 426').toBe(2);
    r.resize(427);
    expect(r.step(), 'at 427 step 0 fits again (the fit allows 1 px), though step 1 still does not').toBe(0);
    r.resize(426);
    expect(r.step(), 'and folds again at the same width').toBe(2);
    r.resize(500);
    expect(r.step()).toBe(0);
  });
  it('steps that narrow in order still go up one fitting step at a time', () => {
    const r = mount([500, 400, 300], 1000);
    r.resize(350);
    expect(r.step()).toBe(2);
    r.resize(398);
    expect(r.step(), 'step 1 needs 400').toBe(2);
    r.resize(399);
    expect(r.step()).toBe(1);
    r.resize(498);
    expect(r.step()).toBe(1);
    r.resize(499);
    expect(r.step()).toBe(0);
  });
  it('a folded step whose need grew while folded (its measure is stale) steps back down once at its old width and stays down, with no render loop', () => {
    const needs = [428, 454, 300];
    const r = mount(needs, 1000);
    r.resize(426);
    expect(r.step()).toBe(2);
    // While folded, step 0's content grows (a longer chip value): it now needs 480, but its stored measure says 428.
    needs[0] = 480;
    const before = r.renders();
    r.resize(430);
    expect(r.step(), 'tried step 0 on its stale 428, found it overflows at 430, and folded again').toBe(2);
    expect(r.renders() - before, 'one try up and back down, not a loop').toBeLessThanOrEqual(6);
    // The fresh measure (480) now holds: the same width, and any width below 479 (the fit allows 1 px), keeps step 0
    // folded without another try; at 478 step 1 (454) fits, so the row stands there.
    const settled = r.renders();
    r.resize(430);
    expect(r.step()).toBe(2);
    r.resize(478);
    expect(r.step(), 'step 1 needs 454 and fits; step 0 needs 480 and does not').toBe(1);
    expect(r.seen().slice(settled), 'no new try of step 0 under its fresh need').not.toContain(0);
    r.resize(479);
    expect(r.step(), 'and it unfolds once its fresh need fits (480 within the 1 px allowance at 479)').toBe(0);
  });
  it('a row that only narrows never steps up', () => {
    const r = mount([428, 454, 300], 1000);
    r.resize(426);
    r.resize(420);
    expect(r.step()).toBe(2);
  });
});
