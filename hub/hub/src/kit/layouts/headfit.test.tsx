// Vitest: detail and page headers fit their OWN width, not the
// page region: when the actions leave the title less than its floor (200 px for a detail, 240 for a page) or the row
// overflows, the title takes its own line and the actions the line below; they go back when the box grows. A detail
// header tells the tab strip under it how far down to stick (its height while it sticks, 0 once it scrolls away),
// so a header that wraps never leaves a gap or an overlap. DetailBody and DetailFooter are the kit's body inset and
// notice-above-actions footer.
//
// jsdom has no layout, so widths are modelled: the header row's box is `room`; its title shrinks into what the
// actions leave (its scrollWidth is its whole text width); stacked, the title has the whole line and wraps.
import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DetailBody, DetailFooter, DetailHeader } from './ListDetailPage';
import { PageHeader } from './PageHeader';

vi.mock('../nav', () => ({ useSearchParam: () => [undefined, () => undefined] }));
vi.mock('../ask', () => ({ useAskDock: () => ({ isOpen: false }) }));

const PAD = 40;
const ACTIONS = 300;
let room = 0;
let titleW = 0;
let headH = 64;
let headPos = 'sticky';
type Cb = (entries: unknown[]) => void;
const observers: Array<{ cb: Cb; els: Element[] }> = [];

/** The measured row: a DetailHeader, or a PageHeader's title row. */
const isRow = (el: Element) => el.classList.contains('detailHeader') || el.classList.contains('row');
const stacked = (el: Element) => el.classList.contains('detailStacked') || el.classList.contains('stacked');
const rowOf = (el: Element) => el.closest('.detailHeader, .row');
/** What the title gets: the whole line when stacked, else what the actions leave. */
function titleBox(title: Element): number {
  const row = rowOf(title);
  if (!row) return 0;
  return stacked(row) ? room - PAD : Math.max(0, room - PAD - ACTIONS);
}

let realStyle: typeof window.getComputedStyle;
beforeEach(() => {
  observers.length = 0;
  room = 0;
  titleW = 0;
  headH = 64;
  headPos = 'sticky';
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
      if (isRow(this)) return stacked(this) ? room : Math.max(room, PAD + ACTIONS);
      if (this.hasAttribute('data-hub-title')) return stacked(rowOf(this) ?? this) ? Math.min(titleW, titleBox(this)) : titleW;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('detailHeader') ? headH : 0;
    },
  });
  realStyle = window.getComputedStyle;
  window.getComputedStyle = ((el: Element) => {
    const cs = realStyle(el);
    if (!el.classList.contains('detailHeader')) return cs;
    return new Proxy(cs, { get: (t, k) => (k === 'position' ? headPos : Reflect.get(t, k)) });
  }) as typeof window.getComputedStyle;
});

afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
  delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
  window.getComputedStyle = realStyle;
});

/** Changes the modelled box and tells every observer. */
function resize(w: number) {
  room = w;
  act(() => {
    for (const o of observers) if (o.els.length) o.cb([]);
  });
}

const actions = <button type="button">Run</button>;

describe('DetailHeader fits its own pane', () => {
  const header = () => document.querySelector('.detailHeader') as HTMLElement;

  it('keeps one line while the name has its room, stacks when squeezed below 200 px, and goes back when the pane grows', () => {
    room = 900;
    titleW = 400;
    render(<DetailHeader title="nightly-backup" actions={actions} />);
    expect(header()).not.toHaveClass('detailStacked');
    resize(500); // the name would get 160 px
    expect(header()).toHaveClass('detailStacked');
    resize(900);
    expect(header()).not.toHaveClass('detailStacked');
  });

  it('a long name that still gets 200 px stays one cut line rather than stacking', () => {
    room = 900;
    titleW = 2000;
    render(<DetailHeader title="a very long name" actions={actions} />);
    expect(header()).not.toHaveClass('detailStacked');
  });

  it('a short name squeezed below its own width stacks too', () => {
    room = 420; // 80 px for a 120 px name
    titleW = 120;
    render(<DetailHeader title="web" actions={actions} />);
    expect(header()).toHaveClass('detailStacked');
  });

  it('tells the tab strip its height while it sticks, follows it, and says 0 once it scrolls away', () => {
    room = 900;
    titleW = 100;
    const { unmount } = render(
      <div data-testid="host">
        <DetailHeader title="web" actions={actions} />
      </div>,
    );
    const host = screen.getByTestId('host');
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('64px');
    headH = 112;
    resize(900);
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('112px');
    headPos = 'static';
    resize(600);
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('0px');
    unmount();
    expect(host.style.getPropertyValue('--detail-head-live')).toBe('');
  });

  it('a stuck tab strip uses the measured height before its host guess', () => {
    const css = readFileSync(join(__dirname, '../controls/Tabs.module.css'), 'utf8');
    expect(css).toMatch(/\.sticky\s*\{[^}]*inset-block-start:\s*var\(--detail-head-live,\s*var\(--tabs-sticky-top,\s*0\)\)/);
  });
});

describe('PageHeader fits its own width', () => {
  const row = () => document.querySelector('.row') as HTMLElement;

  it('stacks the actions under the title when the title would get less than 240 px, and goes back', () => {
    room = 1000;
    titleW = 300;
    render(<PageHeader title="Computers" actions={actions} />);
    expect(row()).not.toHaveClass('stacked');
    resize(520); // the title would get 180 px
    expect(row()).toHaveClass('stacked');
    resize(1000);
    expect(row()).not.toHaveClass('stacked');
  });
});

describe('DetailBody and DetailFooter', () => {
  it('the body starts at the pane inset, the same as the header', () => {
    render(<DetailBody>facts</DetailBody>);
    expect(screen.getByText('facts')).toHaveClass('detailBody');
    const css = readFileSync(join(__dirname, 'ListDetailPage.module.css'), 'utf8');
    expect(css).toMatch(/\.detailBody\s*\{[^}]*padding:[^;]*var\(--pane-inset,\s*var\(--sp-5\)\)/);
  });

  it('the notice is a full-width line above the actions, and a narrow footer gives each action its own line', () => {
    render(
      <DetailFooter notice="You're $4.10 short">
        <button type="button">Add funds</button>
        <button type="button">Rent this server</button>
      </DetailFooter>,
    );
    const notice = screen.getByText("You're $4.10 short");
    const add = screen.getByRole('button', { name: 'Add funds' });
    expect(notice).toHaveClass('footerNotice');
    expect(notice.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(add.parentElement).toHaveClass('footerActions');
    const css = readFileSync(join(__dirname, 'ListDetailPage.module.css'), 'utf8');
    expect(css).toMatch(/\.footerNotice\s*\{[^}]*flex:\s*1 1 100%/);
    expect(css).toMatch(/@container detailfoot \(width < 400px\)\s*\{\s*\.footerActions\s*\{[^}]*flex-direction:\s*column/);
  });
});
