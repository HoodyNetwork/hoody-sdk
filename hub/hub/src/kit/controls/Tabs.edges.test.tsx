// Vitest (:1806): a strip's edges follow overflow that changes inside a scroller of the same width, with no scroll: tabs
// that grow (a rename, a late font), items added to a useStripEdges strip. And the hook leaves nothing behind: once the
// strip unmounts, no observer it made reads the strip again.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs, useStripEdges } from './Tabs';
import ts from './Tabs.module.css';

// A ResizeObserver that fires only when a test says an element resized, for the observers still watching it.
interface FakeRO { cb: () => void; watched: Set<Element>; off: boolean }
let ros: FakeRO[] = [];
const resized = (el: Element) => {
  for (const ro of ros) if (!ro.off && ro.watched.has(el)) ro.cb();
};
// The real MutationObserver, counted, so a test can see each one the hook made disconnected.
let mos: Array<{ off: boolean }> = [];
const RealMO = globalThis.MutationObserver;

// Every scroller is 300 px wide; its content is `content` px (Tabs) or 100 px per child (a plain strip). The scroller's
// own width never changes, so only the content can make it overflow. Reads after unmount are counted.
let content = 290;
let reads = 0;
const isTabsScroller = (el: Element) => el.firstElementChild?.getAttribute('role') === 'tablist';
const isStrip = (el: Element) => el.getAttribute('data-testid') === 'strip';

beforeEach(() => {
  ros = [];
  mos = [];
  content = 290;
  reads = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private me: FakeRO;
      constructor(cb: () => void) {
        this.me = { cb, watched: new Set(), off: false };
        ros.push(this.me);
      }
      observe(el: Element) {
        this.me.watched.add(el);
      }
      unobserve(el: Element) {
        this.me.watched.delete(el);
      }
      disconnect() {
        this.me.off = true;
        this.me.watched.clear();
      }
    },
  );
  vi.stubGlobal(
    'MutationObserver',
    class extends RealMO {
      private me = { off: false };
      constructor(cb: MutationCallback) {
        super(cb);
        mos.push(this.me);
      }
      override disconnect() {
        this.me.off = true;
        super.disconnect();
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return isTabsScroller(this) || isStrip(this) ? 300 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    if (isStrip(this)) {
      reads++;
      return Math.max(300, this.children.length * 100);
    }
    return isTabsScroller(this) ? Math.max(300, content) : 0;
  });
  // Nothing scrolls in these tests: the strip stays at its start (keep-in-view's write is dropped; jsdom has no layout).
  vi.spyOn(Element.prototype, 'scrollLeft', 'get').mockReturnValue(0);
  vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const VIEWS = [
  { id: 'a', label: 'Overview' },
  { id: 'b', label: 'Builds' },
  { id: 'c', label: 'Logs' },
];
const chevrons = () => [...document.querySelectorAll('[data-more]')].map((b) => b.getAttribute('data-more'));

describe('Tabs: overflow from the tabs themselves', () => {
  it('tabs that grow past the strip with no scroll and no resize of the scroller show the end chevron', async () => {
    render(<Tabs label="Board" items={VIEWS} value="a" />);
    expect(chevrons()).toEqual([]);
    // The tab list grows (its own box resizes); the scroller keeps its 300 px and nothing scrolls.
    content = 420;
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual(['end']);
    // And back: the tabs fit again, the chevron goes.
    content = 290;
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual([]);
  });
});

function Strip({ n }: { n: number }) {
  const { ref, edges } = useStripEdges<HTMLDivElement>(undefined);
  return (
    <>
      <div ref={ref} data-testid="strip">
        {Array.from({ length: n }, (_, i) => <span key={i}>Item {i}</span>)}
      </div>
      <output data-testid="edges">{`${edges.start} ${edges.end}`}</output>
    </>
  );
}

describe('useStripEdges: items added later', () => {
  it('an item added to a strip that fit makes it overflow: the end edge shows, with no scroll and no resize', async () => {
    const { rerender } = render(<Strip n={2} />);
    expect(screen.getByTestId('edges').textContent).toBe('false false');
    // A third item: 300 px of content in 300 px fits, a fourth overflows. No element the hook watched resized.
    await act(async () => rerender(<Strip n={4} />));
    expect(screen.getByTestId('edges').textContent).toBe('false true');
  });

  it('an item added later is watched too: when it grows, the edges are read again', async () => {
    const { rerender } = render(<Strip n={2} />);
    await act(async () => rerender(<Strip n={3} />));
    const third = screen.getByTestId('strip').children[2] as Element;
    const before = reads;
    await act(async () => resized(third));
    expect(reads).toBeGreaterThan(before);
  });

  it('unmounted, it leaves no observer behind: none is still on, and a resize or a new child reads nothing', async () => {
    const { unmount } = render(<Strip n={3} />);
    const strip = screen.getByTestId('strip');
    const kids = [...strip.children];
    unmount();
    expect(ros.length).toBeGreaterThan(0);
    expect(ros.every((r) => r.off)).toBe(true);
    expect(mos.length).toBeGreaterThan(0);
    expect(mos.every((m) => m.off)).toBe(true);
    reads = 0;
    await act(async () => {
      for (const k of [strip, ...kids]) resized(k);
      strip.appendChild(document.createElement('span'));
      await Promise.resolve();
    });
    expect(reads).toBe(0);
  });
});

// A badge wholly past an edge puts a dot on that side's chevron. Badges sit by their tab: the Chat apps
// tab's at 400 px (past the 300 px scroller), any other tab's at 100 px (in view). The scroller spans 0 to 300.
describe('Tabs: a badge past an edge', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = (left: number, width: number) => ({ left, right: left + width, top: 0, bottom: 20, width, height: 20, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
      if (isTabsScroller(this)) return at(0, 300);
      if (this.classList.contains(ts.badge ?? 'badge')) return at(this.closest('[role=tab]')?.textContent?.startsWith('Chat apps') ? 400 : 100, 20);
      return at(0, 0);
    });
  });
  const dotted = () => [...document.querySelectorAll('[data-more][data-attention]')].map((b) => b.getAttribute('data-more'));

  it('a count on a tab past the end edge marks the end chevron; a count in view marks nothing', async () => {
    content = 600;
    const { rerender } = render(<Tabs label="Bot" items={[...VIEWS, { id: 'd', label: 'Chat apps', badge: 2 }]} value="a" />);
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual(['end']);
    expect(dotted()).toEqual(['end']);
    // The same strip with its only badge in view: the chevron stays, plain.
    await act(async () => rerender(<Tabs label="Bot" items={[{ id: 'a', label: 'Overview', badge: 1 }, ...VIEWS.slice(1), { id: 'd', label: 'Chat apps' }]} value="a" />));
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual(['end']);
    expect(dotted()).toEqual([]);
  });

  it('a badge that moves to another tab with no change of size moves the dot too (nothing scrolled)', async () => {
    content = 600;
    const { rerender } = render(<Tabs label="Bot" items={[...VIEWS, { id: 'd', label: 'Chat apps', badge: 2 }]} value="a" />);
    await act(async () => resized(screen.getByRole('tablist')));
    expect(dotted()).toEqual(['end']);
    // The count moves from Chat apps (past the end) to Overview (in view): same width, no resize, no scroll.
    await act(async () => rerender(<Tabs label="Bot" items={[{ id: 'a', label: 'Overview', badge: 2 }, ...VIEWS.slice(1), { id: 'd', label: 'Chat apps' }]} value="a" />));
    expect(chevrons()).toEqual(['end']);
    expect(dotted()).toEqual([]);
    // And back.
    await act(async () => rerender(<Tabs label="Bot" items={[...VIEWS, { id: 'd', label: 'Chat apps', badge: 2 }]} value="a" />));
    expect(dotted()).toEqual(['end']);
  });

  it('a strip that fits shows no chevron and so no dot, whatever its badges', async () => {
    content = 290;
    render(<Tabs label="Bot" items={[...VIEWS, { id: 'd', label: 'Chat apps', badge: 2 }]} value="a" />);
    await act(async () => resized(screen.getByRole('tablist')));
    expect(chevrons()).toEqual([]);
    expect(dotted()).toEqual([]);
  });
});
