// Vitest: a full-width SegmentedControl draws equal cells or a Select, never unequal cells. A segment
// never shrinks below its label, so when one label is longer than an equal share its cell is that label's width and
// the others split the rest. The control then needs count × the widest cell, not the track's width.
//
// jsdom has no layout. The model: the track's border box is the control's box (room); inside its 1 px borders, PAD
// (padding and gaps) and the cells. Each cell is max(its label, an equal share of what is left), the stretching cells
// splitting what the long ones leave. scrollWidth holds PAD and the cells but not the borders, as in a browser.
// `labels` gives each label's width.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const PAD = 8;
const BORDER = 1;
const ONE_LONG: Record<string, number> = { Normal: 70, 'Errors only': 150, All: 40 };
const TWO_LONG: Record<string, number> = { Normal: 150, 'Errors only': 150, All: 40 };
let labels: Record<string, number> = ONE_LONG;
let room = 0;
const observers: Array<{ cb: () => void; el?: Element }> = [];

function cellWidths(): number[] {
  const ws = Object.values(labels);
  const inner = room - 2 * BORDER - PAD;
  // Cells never go below their label; the ones that can stretch split what the long ones leave (CSS flex, settled).
  let fixed = ws.map(() => false);
  for (;;) {
    const left = inner - ws.reduce((a, w, i) => a + (fixed[i] ? w : 0), 0);
    const free = fixed.filter((f) => !f).length;
    const each = free ? left / free : 0;
    const next = ws.map((w, i) => fixed[i] || w > each);
    if (next.every((f, i) => f === fixed[i])) return ws.map((w, i) => (fixed[i] ? w : Math.max(w, each)));
    fixed = next;
  }
}

/** The widths drawn while segments show: max - min, the spread the fix keeps within 1 px. */
const spread = () => Math.max(...cellWidths()) - Math.min(...cellWidths());

beforeEach(() => {
  observers.length = 0;
  room = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o: { cb: () => void; el?: Element };
    constructor(cb: () => void) {
      this.o = { cb };
      observers.push(this.o);
    }
    observe(el: Element) {
      this.o.el = el;
    }
    unobserve() {}
    disconnect() {
      this.o.el = undefined;
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('fit') && this.isConnected ? room : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('track')) return PAD + cellWidths().reduce((a, w) => a + w, 0);
      return this.classList.contains('fit') ? room : 0;
    },
  });
  const realStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
    const st = realStyle(el, pseudo);
    if (!(el as HTMLElement).classList?.contains('track')) return st;
    return new Proxy(st, { get: (t, k) => (k === 'borderLeftWidth' || k === 'borderRightWidth' ? `${BORDER}px` : Reflect.get(t, k)) });
  });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const i = this.parentElement?.classList.contains('track') ? [...this.parentElement.children].indexOf(this) : -1;
    const width = i >= 0 ? cellWidths()[i] ?? 0 : 0;
    return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  labels = ONE_LONG;
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
});

function resize(w: number) {
  room = w;
  act(() => {
    for (const o of observers) if (o.el) o.cb();
  });
}

const items = () => Object.keys(labels).map((label) => ({ id: label.toLowerCase().replace(' ', '-'), label }));
const segments = () => screen.queryByRole('radiogroup', { name: 'Output' });

describe('a full-width SegmentedControl keeps its cells equal', () => {
  // Equal cells hold the widest label (150) from 2 + 8 + 3 × 150 = 460 px; the labels alone fit from 2 + 8 + 260 = 270.
  it('draws segments where equal cells hold the widest label, and a Select below that, though the labels alone would fit', () => {
    room = 480;
    render(<SegmentedControl label="Output" items={items()} value="normal" fullWidth />);
    expect(segments()).toBeInTheDocument();
    resize(400);
    expect(segments()).toBeNull();
    expect(screen.getByRole('button', { name: /Output/ })).toHaveTextContent('Normal');
    resize(470);
    expect(segments()).toBeInTheDocument();
  });

  it('opens on a Select when the first measurement already has unequal cells', () => {
    room = 300;
    render(<SegmentedControl label="Output" items={items()} value="all" fullWidth />);
    expect(segments()).toBeNull();
    expect(screen.getByRole('button', { name: /Output/ })).toHaveTextContent('All');
  });

  // The track's borders are not in its scrollWidth: a need without them comes 2 px short, and 457 px drew
  // 148.5 / 150 / 148.5. Every width near the edge, down and back up, keeps the spread within 1 px.
  for (const [name, set] of [['one long label', ONE_LONG], ['two long labels', TWO_LONG]] as const) {
    it(`near the edge, with ${name}, drawn cells differ by at most 1 px going down and coming back up`, () => {
      labels = set;
      room = 470;
      render(<SegmentedControl label="Output" items={items()} value="normal" fullWidth />);
      const widths = [...Array.from({ length: 16 }, (_, i) => 470 - i), ...Array.from({ length: 16 }, (_, i) => 456 + i)];
      for (const w of widths) {
        resize(w);
        if (segments()) expect(spread(), `${w}px`).toBeLessThanOrEqual(1);
      }
      resize(457);
      expect(segments(), '457px: a Select').toBeNull();
      resize(461);
      expect(segments(), '461px: segments again').toBeInTheDocument();
    });
  }
});
