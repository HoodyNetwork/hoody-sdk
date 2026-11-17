// Vitest: the Logs list measures again once the web fonts arrive, a cut cell's
// tooltip follows a resize under a still pointer (no render needed), a list past the breakpoint but too narrow for every
// measured track takes the mid template, and a capped track's cell (a translated pill) is cut with its tooltip.
import { act } from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@app/testing';
import type { Snapshot } from './controller';
import { DEFAULT_VIEW, type DataItem } from './logic';
import { LogList } from './parts/LogList';
import strings from './strings.en.json';

// A canvas whose text advance can change, as it does when a web font replaces its fallback. Installed before anything
// measures (the kit keeps the first canvas it gets).
let advance = 7;
const realGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = (() => ({ font: '', measureText: (t: string) => ({ width: t.length * advance }) })) as never;
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

const table = strings as Record<string, string>;
const tOf = (over: Record<string, string> = {}) =>
  ((k: string, o?: Record<string, unknown>) => (over[k] ?? table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;
const visit = (n: number, url = '/files/a.txt', durationMs = 12): DataItem => ({
  kind: 'kit',
  k: `k${n}`,
  t: 1_700_000_000_000 - n * 1000,
  id: n,
  row: { id: n, serviceName: 'files', method: 'GET', url, status: 200, durationMs, clientIp: '203.0.113.7' },
});
const snap = (items: DataItem[]): Snapshot =>
  ({ v: { ...DEFAULT_VIEW, source: 'visits' }, items, loading: false, newCount: 0, moreOlder: false, moreNewer: false, liveOn: false, olderBusy: false, jump: 0 }) as unknown as Snapshot;
const props = (t: never) => ({ t, selected: undefined, onSelect: () => {}, onOlder: () => {}, onNewer: () => {}, onJump: () => {}, onReading: () => {}, active: undefined, onActive: () => {} });
const list = (c: HTMLElement) => c.querySelector('[role="region"]') as HTMLElement;
const px = (el: HTMLElement, v: string) => Number.parseFloat(el.style.getPropertyValue(v));
const cellOf = (c: HTMLElement, k: string, i: number) => (c.querySelector(`button[data-key="${k}"]`) as HTMLElement).children[i] as HTMLElement;
function cutAs(el: Element, isCut: boolean) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 100 });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => (isCut ? 180 : 100) });
}

// Every ResizeObserver, so a test can resize without a render.
type Cb = () => void;
const observers: Cb[] = [];
/** Each ResizeObserver made, and whether it was disconnected. */
const made: { observing: boolean }[] = [];
let listWidth = 0;
const realClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeEach(() => {
  observers.length = 0;
  made.length = 0;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private rec = { observing: false };
    constructor(cb: Cb) {
      observers.push(cb);
      made.push(this.rec);
    }
    observe() {
      this.rec.observing = true;
    }
    unobserve() {}
    disconnect() {
      this.rec.observing = false;
    }
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'region' ? listWidth : 0;
    },
  });
});
afterEach(() => {
  cleanup();
  advance = 7;
  listWidth = 0;
  if (realClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', realClientWidth);
  Reflect.deleteProperty(document, 'fonts');
});
const resize = () => act(() => { for (const cb of [...observers]) cb(); });

describe('LogList: measured again after the fonts load', () => {
  it('measures again once the web fonts arrive', async () => {
    let loaded!: () => void;
    Object.defineProperty(document, 'fonts', { configurable: true, value: { status: 'loading', ready: new Promise<void>((r) => { loaded = r; }) } });
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1)])} />);
    const before = px(list(container), '--c-src');
    advance = 9;
    await act(async () => {
      loaded();
    });
    expect(px(list(container), '--c-src')).toBeGreaterThan(before);
  });

  it('under a still pointer, a resize that renders nothing still takes the cut What\'s title away', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1, '/files/a/very/long/path/name.txt')])} />);
    const what = cellOf(container, 'k1', 3);
    cutAs(what, true);
    fireEvent.pointerEnter(what, { pointerType: 'mouse' });
    expect(what.hasAttribute('title')).toBe(true);
    cutAs(what, false);
    resize();
    expect(what.hasAttribute('title')).toBe(false);
  });

  it('unmounting the list during hover stops watching the hovered cell at once', () => {
    const { container, unmount } = render(<LogList {...props(tOf())} snap={snap([visit(1, '/files/a/very/long/path/name.txt')])} />);
    const what = cellOf(container, 'k1', 3);
    cutAs(what, true);
    const before = made.length;
    fireEvent.pointerEnter(what, { pointerType: 'mouse' });
    const mine = made.slice(before);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.observing)).toBe(true);
    unmount();
    expect(mine.every((r) => !r.observing)).toBe(true);
  });

  it('past the breakpoint but too narrow for every measured track whole, the list takes the mid template', () => {
    // Every measured track at its 200 px cap: 4 × 200 + Visitor 172 + What's 240 + gaps and padding is past 900.
    const long = {
      'out.ok': 'Erfolgreich abgeschlossen und bestätigt',
      'src.visits': 'Besuche über den öffentlichen Zugang',
      'col.duration': 'Dauer der Anfrage insgesamt',
      'col.time': 'Uhrzeit der Anfrage insgesamt',
    };
    listWidth = 2000;
    const { container, unmount } = render(<LogList {...props(tOf(long))} snap={snap([visit(1)])} />);
    expect(list(container).dataset.cols).toBeUndefined();
    listWidth = 900;
    resize();
    expect(list(container).dataset.cols).toBe('mid');
    unmount();
    // Short words fit the wide template at the same width.
    const { container: c2 } = render(<LogList {...props(tOf())} snap={snap([visit(1)])} />);
    expect(list(c2).dataset.cols).toBeUndefined();
  });

  it('a pill cut by its capped track shows whole in the cell\'s tooltip; it never runs into What', () => {
    const long = { 'out.ok': 'Erfolgreich abgeschlossen und bestätigt' };
    const { container } = render(<LogList {...props(tOf(long))} snap={snap([visit(1)])} />);
    const result = cellOf(container, 'k1', 1);
    expect(result.className).toMatch(/clip/);
    cutAs(result, true);
    fireEvent.pointerEnter(result, { pointerType: 'mouse' });
    expect(result.getAttribute('title')).toBe('Erfolgreich abgeschlossen und bestätigt');
  });
});
