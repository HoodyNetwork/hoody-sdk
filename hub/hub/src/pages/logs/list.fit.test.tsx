// Vitest: the Logs list sizes Time, Result, From and Took from
// their words (the head and every row read the same --c-* values on the list), a longer word in another language widens
// its track instead of being cut, and What's cut-off text gets a native title (an id masked) that gives way to the row's
// own title once What fits.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@app/testing';
import { textWidth } from '@kit';
import type { Snapshot } from './controller';
import { DEFAULT_VIEW, type DataItem } from './logic';
import { LogList } from './parts/LogList';
import type { Source } from './rules';
import strings from './strings.en.json';

const table = strings as Record<string, string>;
const tOf = (over: Record<string, string> = {}) =>
  ((k: string, o?: Record<string, unknown>) => (over[k] ?? table[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(o?.[x] ?? ''))) as never;

const ID = '64a1f0c2b9e8d7a6f5e4d3c2';
const visit = (n: number, url = '/files/a.txt', durationMs = 12): DataItem => ({
  kind: 'kit',
  k: `k${n}`,
  t: 1_700_000_000_000 - n * 1000,
  id: n,
  row: { id: n, serviceName: 'files', method: 'GET', url, status: 200, durationMs, clientIp: '203.0.113.7' },
});

const snap = (items: DataItem[], source: Source = 'visits'): Snapshot =>
  ({ v: { ...DEFAULT_VIEW, source }, items, loading: false, newCount: 0, moreOlder: false, moreNewer: false, liveOn: false, olderBusy: false, jump: 0 }) as unknown as Snapshot;

const props = (t: never) => ({ t, selected: undefined, onSelect: () => {}, onOlder: () => {}, onNewer: () => {}, onJump: () => {}, onReading: () => {}, active: undefined, onActive: () => {} });
const list = (c: HTMLElement) => c.querySelector('[role="region"]') as HTMLElement;
const px = (el: HTMLElement, v: string) => Number.parseFloat(el.style.getPropertyValue(v));

describe('LogList: measured tracks', () => {
  afterEach(cleanup);

  it('sets every measured track on the list, so the head and every row share one grid', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1), visit(2)])} />);
    const el = list(container);
    for (const v of ['--c-time', '--c-out', '--c-src', '--c-took']) expect(px(el, v), v).toBeGreaterThan(0);
    // The head and the rows are the list's children: they read the variables from it, never their own.
    for (const row of el.querySelectorAll('button[data-key]')) expect((row as HTMLElement).style.getPropertyValue('--c-out')).toBe('');
  });

  it('a longer outcome word (another language) widens Result instead of being cut, up to the cap', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1)])} />);
    const en = px(list(container), '--c-out');
    cleanup();
    const long = { 'out.tooMany': 'Demasiadas solicitudes por ahora' };
    const { container: c2 } = render(<LogList {...props(tOf(long))} snap={snap([visit(1)])} />);
    expect(px(list(c2), '--c-out')).toBeGreaterThan(en);
    expect(px(list(c2), '--c-out')).toBeLessThanOrEqual(200);
  });

  it('a track is never narrower than its translated header', () => {
    const head = { 'col.duration': 'Durée de la requête' };
    const { container } = render(<LogList {...props(tOf(head))} snap={snap([visit(1)])} />);
    const need = textWidth(['Durée de la requête'], { font: '600 11px "Geist", system-ui, sans-serif', glyph: 6.6, tracking: 0.33, caps: true });
    expect(px(list(container), '--c-took')).toBeGreaterThanOrEqual(Math.min(200, need));
  });

  it('Took follows the loaded durations', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1, '/a', 5)])} />);
    const short = px(list(container), '--c-took');
    cleanup();
    const { container: c2 } = render(<LogList {...props(tOf())} snap={snap([visit(1, '/a', 5), visit(2, '/a', 1_234_567)])} />);
    expect(px(list(c2), '--c-took')).toBeGreaterThanOrEqual(short);
  });
});

/** Make `el` read as cut (its text wider than its box) or not. */
function cutAs(el: Element, isCut: boolean) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => 100 });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => (isCut ? 180 : 100) });
}

describe('LogList: What tooltip', () => {
  afterEach(cleanup);
  const whatOf = (c: HTMLElement, k: string) => (c.querySelector(`button[data-key="${k}"]`) as HTMLElement).children[3] as HTMLElement;

  it('a cut What gets its shown text as title; the row keeps its own; once What fits its title goes', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1, '/files/a/very/long/path/name.txt')])} />);
    const what = whatOf(container, 'k1');
    const row = what.closest('button') as HTMLElement;
    const rowTitle = row.getAttribute('title');
    cutAs(what, true);
    fireEvent.pointerEnter(what, { pointerType: 'mouse' });
    expect(what.getAttribute('title')).toContain('Files: opened');
    expect(row.getAttribute('title')).toBe(rowTitle);
    cutAs(what, false);
    fireEvent.pointerLeave(what, { pointerType: 'mouse' });
    fireEvent.pointerEnter(what, { pointerType: 'mouse' });
    expect(what.hasAttribute('title')).toBe(false);
  });

  it('touch never sets one', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1)])} />);
    const what = whatOf(container, 'k1');
    cutAs(what, true);
    fireEvent.pointerEnter(what, { pointerType: 'touch' });
    expect(what.hasAttribute('title')).toBe(false);
  });

  it('a What that holds a program id shows the mask, never the id', () => {
    const { container } = render(<LogList {...props(tOf())} snap={snap([visit(1, `/p/${ID}/run`)])} />);
    const what = whatOf(container, 'k1');
    cutAs(what, true);
    fireEvent.pointerEnter(what, { pointerType: 'mouse' });
    expect(what.getAttribute('title') ?? '').not.toContain(ID.slice(0, 12));
  });
});
