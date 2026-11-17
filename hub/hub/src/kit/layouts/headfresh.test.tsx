// Vitest: a header's fit follows what it holds, not only its width. When an action goes
// away (a Bot's Stop once its turn ends) the header is measured again on one line, without waiting for a resize. The
// tab strip's offset follows a change of position made by a class alone (no box resized), and a header leaving gives
// the parent back what it had, never removing a value another header wrote.
//
// jsdom has no layout: the row's box is `room`; every button in the row needs ACT px; the title shrinks into the rest.
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailHeader } from './ListDetailPage';
import { PageHeader } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const PAD = 40;
const ACT = 100;
let room = 0;
let titleW = 0;
type Cb = (entries: unknown[]) => void;
const observers: Array<{ cb: Cb; els: Element[] }> = [];

const isRow = (el: Element) => el.classList.contains('detailHeader') || el.classList.contains('row');
const stacked = (el: Element) => el.classList.contains('detailStacked') || el.classList.contains('stacked');
const rowOf = (el: Element) => el.closest('.detailHeader, .row');
const actionsW = (row: Element) => row.querySelectorAll('button').length * ACT;
function titleBox(title: Element): number {
  const row = rowOf(title);
  if (!row) return 0;
  return stacked(row) ? room - PAD : Math.max(0, room - PAD - actionsW(row));
}

let realStyle: typeof window.getComputedStyle;
beforeEach(() => {
  observers.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private o: { cb: Cb; els: Element[] };
    constructor(cb: Cb) {
      this.o = { cb, els: [] };
      observers.push(this.o);
    }
    observe(el: Element) {
      this.o.els.push(el);
    }
    unobserve() {}
    disconnect() {
      this.o.els = [];
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.isConnected) return 0;
      if (isRow(this)) return room;
      if (this.hasAttribute('data-hub-title')) return Math.min(titleW, titleBox(this));
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (isRow(this)) return stacked(this) ? room : Math.max(room, PAD + actionsW(this));
      if (this.hasAttribute('data-hub-title')) return stacked(rowOf(this) ?? this) ? Math.min(titleW, titleBox(this)) : titleW;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('detailHeader') ? 64 : 0;
    },
  });
  realStyle = window.getComputedStyle;
  window.getComputedStyle = ((el: Element) => {
    const cs = realStyle(el);
    if (!el.classList.contains('detailHeader')) return cs;
    return new Proxy(cs, { get: (t, k) => (k === 'position' ? (el.classList.contains('flat') ? 'static' : 'sticky') : Reflect.get(t, k)) });
  }) as typeof window.getComputedStyle;
});

afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
  window.getComputedStyle = realStyle;
});

function buttons(n: number) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <button key={i} type="button">
          {`Action ${i}`}
        </button>
      ))}
    </>
  );
}

describe('a header measures again when what it holds changes', () => {
  it('DetailHeader: stacked with three actions, back on one line once two go away, with no resize', () => {
    room = 500;
    titleW = 300;
    const { rerender } = render(<DetailHeader title="nightly-backup" actions={buttons(3)} />);
    const head = () => document.querySelector('.detailHeader') as HTMLElement;
    expect(head()).toHaveClass('detailStacked'); // 500 - 40 - 300 = 160 < 200
    rerender(<DetailHeader title="nightly-backup" actions={buttons(1)} />);
    expect(head()).not.toHaveClass('detailStacked'); // 500 - 40 - 100 = 360
  });

  it('PageHeader: the same when its actions shrink', () => {
    room = 560;
    titleW = 400;
    const { rerender } = render(<PageHeader title="Computers" actions={buttons(3)} />);
    const row = () => document.querySelector('header .row') as HTMLElement;
    expect(row()).toHaveClass('stacked'); // 560 - 40 - 300 = 220 < 240
    rerender(<PageHeader title="Computers" actions={buttons(2)} />);
    expect(row()).not.toHaveClass('stacked'); // 320
  });

  it('a header that gains an action stacks at once too', () => {
    room = 560;
    titleW = 400;
    const { rerender } = render(<PageHeader title="Computers" actions={buttons(2)} />);
    const row = () => document.querySelector('header .row') as HTMLElement;
    expect(row()).not.toHaveClass('stacked');
    rerender(<PageHeader title="Computers" actions={buttons(3)} />);
    expect(row()).toHaveClass('stacked');
  });
});

describe('the tab strip offset', () => {
  it('follows a change of position made by a class alone (nothing resized, no observer fired)', () => {
    room = 900;
    titleW = 100;
    const { rerender } = render(
      <div data-testid="host">
        <DetailHeader title="x" />
      </div>,
    );
    const host = document.querySelector('[data-testid="host"]') as HTMLElement;
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('64px');
    rerender(
      <div data-testid="host">
        <DetailHeader title="x" className="flat" />
      </div>,
    );
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('0px');
    rerender(
      <div data-testid="host">
        <DetailHeader title="x" />
      </div>,
    );
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('64px');
  });

  it('is published without ResizeObserver, and follows a window resize', () => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    room = 900;
    titleW = 100;
    render(
      <div data-testid="host">
        <DetailHeader title="x" />
      </div>,
    );
    const host = document.querySelector('[data-testid="host"]') as HTMLElement;
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('64px');
    (document.querySelector('.detailHeader') as HTMLElement).classList.add('flat');
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('0px');
  });

  it('a header leaving gives back what the parent had, and leaves a value another header wrote', () => {
    room = 900;
    titleW = 100;
    const host = document.createElement('div');
    host.style.setProperty('--detail-head-live', '12px');
    document.body.appendChild(host);
    const first = render(<DetailHeader title="x" />, { container: host });
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('64px');
    first.unmount();
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('12px');
    host.remove();
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const second = render(<DetailHeader title="y" />, { container: host2 });
    host2.style.setProperty('--detail-head-live', '99px'); // another writer
    second.unmount();
    expect(host2.style.getPropertyValue('--detail-head-live')).toBe('99px');
    host2.remove();
  });
});
