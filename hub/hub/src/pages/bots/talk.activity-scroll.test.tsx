// Vitest: the Activity log has no scroll of its own; it lives in the
// one scroll of the page (or a Board tile), and that scroll follows the newest row only while the reader is at its end. Once
// they have scrolled up it never moves by itself and says so (Jump to newest, in the tab's dock); Load older keeps the row
// they were reading where it was; a turn running with no reply text yet shows a working row. The geometry in a browser is
// activity.scroll.spec.ts; here jsdom stands in a scroller with set heights.
import { act, cleanup, render, renderPage, screen } from '@app/testing';
import { boot } from '@core/test/env';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogPage, LogRow } from './data';
import page from './page';
import { ActivityLog } from './parts/ActivityTab';
import { useGateSent } from './parts/gate-sent';
import { renderHook } from '@testing-library/react';
import S from './strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

// The hint's own rules are shell/notify/NotifyHint.test.tsx's: here it is a marker that records its kind (as notify-hint.test.tsx).
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, NotifyHint: ({ kind }: { kind: string }) => <i data-testid="notify-hint" data-kind={kind} /> };
});

const row = (seq: number, o: Partial<LogRow> = {}): LogRow => ({ seq, kind: 'bot', text: `Reply ${seq}`, at: '2026-11-06T10:00:00Z', raw: null, delegateTitle: null, sender: null, ...o });
const pageOf = (from: number, to: number, hasOlder = true): LogPage => ({ rows: Array.from({ length: to - from + 1 }, (_, i) => row(from + i)), live: 'up_to_date', hasOlder, archiveRows: 0 });
const logProps = { loading: false, error: false, onRetry: () => undefined, loadingOlder: false, olderFailed: false, hideTasks: false, onHideTasks: () => undefined };

// A scroller of 400 px whose content is 50 px per log row (plus 100 px of head): scrollHeight follows the rows drawn, and a
// row's top is its place in the content less the scroll position, as a browser lays them out.
const ROW = 50;
const CARD = 100;
// Content that grows without a new row (the dock's bars, a late font), in px.
let grown = 0;
let restore: (() => void) | null = null;
function fakeLayout() {
  const proto = HTMLElement.prototype;
  const sh = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
  const ch = Object.getOwnPropertyDescriptor(proto, 'clientHeight');
  const rect = proto.getBoundingClientRect;
  const scroller = (el: HTMLElement) => el.dataset.testScroller !== undefined;
  const rows = (el: HTMLElement) => el.querySelectorAll('li[data-seq]').length;
  const cardH = (el: HTMLElement) => (el.querySelector('[data-card-end]') ? CARD : 0);
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get(this: HTMLElement) { return scroller(this) ? 100 + rows(this) * ROW + cardH(this) + grown : 0; } });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get(this: HTMLElement) { return scroller(this) ? 400 : 0; } });
  proto.getBoundingClientRect = function (this: HTMLElement) {
    const sc = this.closest<HTMLElement>('[data-test-scroller]');
    if (scroller(this)) return new DOMRect(0, 0, 800, 400);
    if (this.matches('li[data-seq]') && sc) {
      const i = Array.from(sc.querySelectorAll('li[data-seq]')).indexOf(this);
      return new DOMRect(0, 100 + i * ROW - sc.scrollTop, 800, ROW);
    }
    if (this.matches('[data-card-end]') && sc) return new DOMRect(0, 100 + rows(sc) * ROW - sc.scrollTop, 800, CARD);
    return rect.call(this);
  };
  restore = () => {
    if (sh) Object.defineProperty(proto, 'scrollHeight', sh);
    if (ch) Object.defineProperty(proto, 'clientHeight', ch);
    proto.getBoundingClientRect = rect;
  };
}

function InScroller(p: Parameters<typeof ActivityLog>[0]) {
  return (
    <div data-test-scroller="" style={{ overflowY: 'auto' }}>
      <ActivityLog {...p} />
    </div>
  );
}
const sc = () => document.querySelector<HTMLElement>('[data-test-scroller]')!;

beforeAll(async () => {
  await import('./view');
}, 30000);
beforeEach(() => { boot(); fakeLayout(); grown = 0; });
afterEach(() => { cleanup(); restore?.(); restore = null; });

describe('the log in one scroll', () => {
  it('opens at the end of the scroll it lives in', () => {
    render(<InScroller {...logProps} onLoadOlder={() => undefined} page={pageOf(1, 20)} />);
    expect(sc().scrollTop).toBe(sc().scrollHeight - 400);
  });

  it('at the end, a new row is followed', () => {
    const onBehind = vi.fn();
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 20)} />);
    sc().scrollTop = sc().scrollHeight - 400;
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 21)} />);
    expect(sc().scrollTop).toBeGreaterThanOrEqual(sc().scrollHeight - 400);
    expect(onBehind).not.toHaveBeenLastCalledWith(true);
  });

  it('at the end, content that grows under the reader is not a move up: the next row is still followed', () => {
    const onBehind = vi.fn();
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 20)} />);
    grown = 100;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 21)} />);
    expect(sc().scrollTop).toBe(sc().scrollHeight - 400);
    expect(onBehind).not.toHaveBeenCalledWith(true);
  });

  it('a scroll up heard in the same frame as the content growing is the reader leaving: the next row is not followed', () => {
    // The race this pins: the page's layout grows (the Details panel
    // opens above the log) and the scroll up that brought the header's button into view is delivered in that same frame, so
    // the scroll handler sees a move up and a taller content at once. Growth cannot move the scroll up; only a shrink clamps it.
    const onBehind = vi.fn();
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 20)} />);
    grown = 100;
    sc().scrollTop = 0;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    onBehind.mockClear();
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 21)} />);
    expect(sc().scrollTop, 'the reader stays where they scrolled').toBe(0);
    expect(onBehind).toHaveBeenLastCalledWith(true);
  });

  it('content that shrinks and moves the scroll up with it is not the reader leaving: the next row is still followed', () => {
    const onBehind = vi.fn();
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 20)} />);
    // Content above the browser's scroll anchor goes (150 px) while 50 px arrives below it: the content is 100 px shorter and the
    // browser has moved the position up by 150, 50 px short of the new end (more than a line, so the end alone does not say it).
    grown = -100;
    sc().scrollTop = sc().scrollHeight - 400 - 50;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    grown = 0;
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 21)} />);
    expect(sc().scrollTop).toBe(sc().scrollHeight - 400);
    expect(onBehind).not.toHaveBeenCalledWith(true);
  });

  it('scrolled up, a new row moves nothing and the log says it is behind; Jump brings it to the end', () => {
    const onBehind = vi.fn();
    const jump: { current: (() => void) | null } = { current: null };
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} jumpRef={jump} page={pageOf(1, 20)} />);
    sc().scrollTop = 120;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} jumpRef={jump} page={pageOf(1, 21)} />);
    expect(sc().scrollTop).toBe(120);
    expect(onBehind).toHaveBeenLastCalledWith(true);
    act(() => jump.current!());
    expect(sc().scrollTop).toBe(sc().scrollHeight - 400);
    expect(onBehind).toHaveBeenLastCalledWith(false);
  });

  it('Load older keeps the row being read where it was, and is not a reason to say behind', () => {
    const onBehind = vi.fn();
    const onLoadOlder = vi.fn();
    const r = render(<InScroller {...logProps} onLoadOlder={onLoadOlder} onBehind={onBehind} page={pageOf(11, 20)} />);
    sc().scrollTop = 0;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    const first = () => document.querySelector<HTMLElement>('li[data-seq="11"]')!.getBoundingClientRect().top;
    const before = first();
    act(() => screen.getByRole('button', { name: S['activity.older'] }).click());
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    onBehind.mockClear();
    r.rerender(<InScroller {...logProps} onLoadOlder={onLoadOlder} onBehind={onBehind} page={pageOf(1, 20)} />);
    expect(first()).toBe(before);
    expect(sc().scrollTop).toBe(10 * ROW);
    expect(onBehind).not.toHaveBeenCalledWith(true);
  });
});

describe('Load older while the reader moves', () => {
  it('a scroll made while the older rows are on their way is kept: the row stays where the reader left it', () => {
    const onLoadOlder = vi.fn();
    const r = render(<InScroller {...logProps} onLoadOlder={onLoadOlder} page={pageOf(11, 20)} />);
    sc().scrollTop = 0;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    act(() => screen.getByRole('button', { name: S['activity.older'] }).click());
    sc().scrollTop = 120;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    const first = () => document.querySelector<HTMLElement>('li[data-seq="11"]')!.getBoundingClientRect().top;
    const moved = first();
    r.rerender(<InScroller {...logProps} onLoadOlder={onLoadOlder} page={pageOf(1, 20)} />);
    expect(first()).toBe(moved);
    expect(sc().scrollTop).toBe(120 + 10 * ROW);
  });

  it('a failed load leaves nothing behind: rows drawn above later move nothing on its account', () => {
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} page={pageOf(11, 20)} />);
    sc().scrollTop = 0;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    act(() => screen.getByRole('button', { name: S['activity.older'] }).click());
    r.rerender(<InScroller {...logProps} olderFailed onLoadOlder={() => undefined} page={pageOf(11, 20)} />);
    // The reader moves on without a scroll event reaching the log (a programmatic move), then rows arrive above.
    sc().scrollTop = 30;
    r.rerender(<InScroller {...logProps} olderFailed onLoadOlder={() => undefined} page={pageOf(1, 20)} />);
    expect(sc().scrollTop).toBe(30);
  });
});

describe('Load older that brings nothing, then the task filter changes', () => {
  it('the place read before the load moves nothing once the filter draws rows above the row read', () => {
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} page={pageOf(11, 20)} />);
    sc().scrollTop = 0;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    act(() => screen.getByRole('button', { name: S['activity.older'] }).click());
    // The load ends with nothing older (no failure), and the reader is moved without a scroll event reaching the log.
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} page={pageOf(11, 20)} />);
    sc().scrollTop = 30;
    // The filter changes and rows show above the row read: they are not the load's, so they move nothing.
    r.rerender(<InScroller {...logProps} hideTasks onLoadOlder={() => undefined} page={pageOf(1, 20)} />);
    expect(sc().scrollTop).toBe(30);
  });
});

describe('the scroll heard at the document (the scroller change itself is activity.scroll.spec.ts)', () => {
  it('a scroll of another element (not the log\'s scroller) changes nothing', () => {
    const onBehind = vi.fn();
    const r = render(
      <>
        <div data-other-scroller="" />
        <InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 20)} />
      </>,
    );
    // The log's scroller stands up from its end, but only another element's scroll is heard: the log still follows.
    sc().scrollTop = 0;
    act(() => { document.querySelector('[data-other-scroller]')!.dispatchEvent(new Event('scroll')); });
    r.rerender(
      <>
        <div data-other-scroller="" />
        <InScroller {...logProps} onLoadOlder={() => undefined} onBehind={onBehind} page={pageOf(1, 21)} />
      </>,
    );
    expect(sc().scrollTop).toBe(sc().scrollHeight - 400);
    expect(onBehind).not.toHaveBeenCalledWith(true);
  });
});

describe('the decision sent for the open gate', () => {
  const hook = (init: { bot: string; gate: string; read: boolean }) => renderHook((p: typeof init) => useGateSent(p.bot, p.gate, p.read), { initialProps: init });
  it('is kept for its own Bot and gate, also while the Bot is being read again', () => {
    const h = hook({ bot: 'a', gate: '1:0', read: true });
    act(() => h.result.current[1]('once'));
    expect(h.result.current[0]).toBe('once');
    h.rerender({ bot: 'a', gate: '', read: false });
    h.rerender({ bot: 'a', gate: '1:0', read: true });
    expect(h.result.current[0]).toBe('once');
  });
  it('another Bot with a gate of the same id and generation starts unsent, and so does the first Bot on its return', () => {
    const h = hook({ bot: 'a', gate: '1:0', read: true });
    act(() => h.result.current[1]('deny'));
    h.rerender({ bot: 'b', gate: '1:0', read: true });
    expect(h.result.current[0]).toBeNull();
    h.rerender({ bot: 'a', gate: '1:0', read: true });
    expect(h.result.current[0]).toBeNull();
  });
  it('a gate the Bot no longer has ends it: the same id later (a reset session) starts unsent', () => {
    const h = hook({ bot: 'a', gate: '1:0', read: true });
    act(() => h.result.current[1]('answer'));
    h.rerender({ bot: 'a', gate: '', read: true });
    expect(h.result.current[0]).toBeNull();
    h.rerender({ bot: 'a', gate: '1:0', read: true });
    expect(h.result.current[0]).toBeNull();
  });
  it('a Bot switch while loading ends it too', () => {
    const h = hook({ bot: 'a', gate: '1:0', read: true });
    act(() => h.result.current[1]('once'));
    h.rerender({ bot: 'b', gate: '', read: false });
    h.rerender({ bot: 'a', gate: '1:0', read: true });
    expect(h.result.current[0]).toBeNull();
  });
});

describe('the waiting card at the end of the thread', () => {
  it('says whether the card is wholly on screen: at the end it is; scrolled up it is not', () => {
    const onCardSeen = vi.fn();
    render(<InScroller {...logProps} onLoadOlder={() => undefined} onCardSeen={onCardSeen} card={<p>Card</p>} page={pageOf(1, 20)} />);
    expect(sc().scrollTop).toBe(sc().scrollHeight - 400);
    expect(onCardSeen).toHaveBeenLastCalledWith(true);
    sc().scrollTop = 0;
    act(() => { sc().dispatchEvent(new Event('scroll')); });
    expect(onCardSeen).toHaveBeenLastCalledWith(false);
  });
});

describe('the working row', () => {
  it('a running turn with no reply text yet shows one working row, last in the column; reply text replaces it', () => {
    const r = render(<InScroller {...logProps} onLoadOlder={() => undefined} working page={pageOf(1, 3)} />);
    // The kit Spinner, named: one working row.
    const w = screen.getByRole('status', { name: S['activity.working'] });
    expect(screen.getAllByRole('status', { name: S['activity.working'] })).toHaveLength(1);
    const list = screen.getByRole('list', { name: S['activity.title'] });
    expect(list.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} working tail="Looking" page={pageOf(1, 3)} />);
    expect(screen.queryByRole('status', { name: S['activity.working'] })).toBeNull();
    r.rerender(<InScroller {...logProps} onLoadOlder={() => undefined} page={pageOf(1, 3)} />);
    expect(screen.queryByRole('status', { name: S['activity.working'] })).toBeNull();
  });

  it('a Bot that waits on the person is not said to be working: the card stands alone', () => {
    render(<InScroller {...logProps} onLoadOlder={() => undefined} working card={<div data-testid="waiting-card" />} page={pageOf(1, 3)} />);
    expect(screen.getByTestId('waiting-card')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: S['activity.working'] })).toBeNull();
  });
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
describe('the waiting card on the Activity tab', () => {
  it('sits at the end of the thread, after the log and before the chat box, with the alert hint as its last line', async () => {
    await renderPage(page, { state: 'waitingApprove', path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const card = await screen.findByRole('region', { name: K['agent.needsApproval'] });
    const list = screen.getByRole('list', { name: S['activity.title'] });
    const box = screen.getByRole('textbox', { name: S['say.label'] });
    expect(list.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const wrap = card.closest<HTMLElement>('[data-gate-wrap]');
    expect(wrap).not.toBeNull();
    const hint = document.querySelector('[data-testid="notify-hint"][data-kind="bot"]');
    expect(hint).not.toBeNull();
    expect(wrap!.contains(hint)).toBe(true);
    expect(wrap!.lastElementChild?.contains(hint)).toBe(true);
    // Not also above the tabs: one card.
    expect(screen.getAllByRole('region', { name: K['agent.needsApproval'] })).toHaveLength(1);
  });

  it('on another tab the card stays above the tabs, the hint still its last line', async () => {
    await renderPage(page, { state: 'waitingApprove', path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work` });
    const card = await screen.findByRole('region', { name: K['agent.needsApproval'] });
    const tabs = screen.getByRole('tablist');
    expect(card.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const wrap = card.closest<HTMLElement>('[data-gate-wrap]')!;
    const hint = document.querySelector('[data-testid="notify-hint"][data-kind="bot"]');
    expect(hint).not.toBeNull();
    expect(wrap.contains(hint)).toBe(true);
    expect(wrap.lastElementChild?.contains(hint)).toBe(true);
  });
});

const css = readFileSync(path.join(__dirname, 'parts/pane.module.css'), 'utf8');
const rule = (sel: string, src = css) => src.match(new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[2] ?? '';
const block = (cond: string) => {
  const at = css.indexOf(`@container bot-pane (${cond}) {`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  return '';
};

describe('the Activity CSS', () => {
  it('the log has no scroll of its own and no height cap', () => {
    expect(rule('.log')).not.toMatch(/overflow/);
    expect(rule('.log')).not.toMatch(/max-block-size|max-height/);
  });

  it('the tab sets no minimum height (no blank band under an empty or failed log)', () => {
    expect(rule('.activity')).not.toMatch(/min-height|min-block-size/);
  });

  it('below the phone breakpoint the Activity head wraps: title and state, then the rest, nothing shrinks past its box', () => {
    const b = block('width < 600px');
    expect(b).not.toBe('');
    expect(rule('.logHead', b)).toMatch(/flex-wrap: wrap;/);
    expect(rule('.logHead > *', b)).toMatch(/min-width: 0;/);
  });
});
