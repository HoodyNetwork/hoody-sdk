// useContainerNarrow (computers): a page swaps to compact forms by the width of its page
// region (#hub-main) or of an element it names, never by the viewport.
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useContainerNarrow } from './media';

type Entry = { target: Element };
const observers: { cb: (e: Entry[]) => void; els: Set<Element> }[] = [];
const widths = new Map<Element, number>();

beforeEach(() => {
  observers.length = 0;
  widths.clear();
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
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return widths.get(this) ?? 0; } });
});

afterEach(() => {
  document.body.innerHTML = '';
});

const resize = (el: Element, w: number) => {
  widths.set(el, w);
  act(() => {
    for (const o of observers) if (o.els.has(el)) o.cb([{ target: el }]);
  });
};

describe('useContainerNarrow', () => {
  it('follows the page region (#hub-main) when no element is named', () => {
    const main = document.createElement('main');
    main.id = 'hub-main';
    document.body.append(main);
    widths.set(main, 900);
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useContainerNarrow(600));
      return null;
    }
    render(<Probe />, { container: main });
    expect(seen.at(-1)).toBe(false);
    resize(main, 590);
    expect(seen.at(-1)).toBe(true);
    resize(main, 600);
    expect(seen.at(-1)).toBe(false);
  });

  it('follows a named element instead', () => {
    const seen: boolean[] = [];
    let box: HTMLDivElement | null = null;
    function Probe() {
      const ref = useRef<HTMLDivElement>(null);
      seen.push(useContainerNarrow(400, ref));
      return (
        <div
          ref={(el) => {
            ref.current = el;
            box = el;
            if (el && !widths.has(el)) widths.set(el, 300);
          }}
        />
      );
    }
    render(<Probe />);
    expect(seen.at(-1)).toBe(true);
    resize(box!, 500);
    expect(seen.at(-1)).toBe(false);
  });

  it('is false where there is no ResizeObserver and no region', () => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useContainerNarrow(600));
      return null;
    }
    render(<Probe />);
    expect(seen.at(-1)).toBe(false);
  });
});
