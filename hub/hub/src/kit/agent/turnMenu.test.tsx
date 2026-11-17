// Vitest: the turn-menu slot. A reply's footer carries an optional host menu (Copy first, the menu right after it,
// cost and time last, in the one footer that already shows on hover or focus and always on touch); SessionView calls
// `turnMenu` only for a FINAL, non-streaming reply that carries a completed-turn index (0 is a real index); nothing draws, and
// nothing is called, otherwise; ConversationView passes the host's function through. The slot is consumer-side only: this
// file feeds it fixture snapshots that carry `turn`.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { ConversationView } from './ConversationView';
import { ReplyBox, ReplyFooter } from './Reply';
import { SessionView } from './SessionView';
import type { ConvBlock, ConvSnapshot, ConversationSource } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
type Reply = Extract<ConvBlock, { k: 'reply' }>;
const reply = (o: Partial<Reply> = {}): Reply => ({ k: 'reply', key: 'r0', text: 'Done.', streaming: false, final: true, cost: null, at: null, turn: 0, ...o });
const src = (blocks: ConvBlock[]): ConversationSource => {
  const s: ConvSnapshot = { facts, title: 'Fix it', blocks, gates: [], meta: { computer: 'atlas', realm: 'Work', status: 'idle' } };
  return { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, facts) };
};
/** A button's name: Copy is an icon button (its label is its name), a host's trigger here is named by its text. */
const nameOf = (b: Element) => b.getAttribute('aria-label') ?? b.textContent ?? '';
const trigger = (key: string, turn: number) => <button type="button" data-testid={`menu-${key}`} data-turn={turn}>More for {key}</button>;

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ReplyFooter menu', () => {
  it('without a menu the footer is what it was: Copy, cost, time', () => {
    const { container } = render(<ReplyBox><ReplyFooter text="hi" cost={0.0042} at={Date.UTC(2026, 9, 27, 12, 30)} /></ReplyBox>);
    const foot = container.querySelector('div > div > div') as HTMLElement;
    expect(within(foot).getAllByRole('button')).toHaveLength(1);
  });
  it('the menu comes right after Copy in the same footer, before cost and time', () => {
    render(<ReplyBox><ReplyFooter text="hi" cost={0.0042} at={Date.UTC(2026, 9, 27, 12, 30)} menu={trigger('x', 1)} /></ReplyBox>);
    const m = screen.getByTestId('menu-x');
    const foot = m.parentElement as HTMLElement;
    const copy = within(foot).getAllByRole('button').at(0) as HTMLElement;
    expect(nameOf(copy)).toMatch(/Copy/);
    expect(copy.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(foot).getAllByRole('button').at(1)).toBe(m);
    expect(m.compareDocumentPosition(within(foot).getByText(/\$0\.0042/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('the menu sits inside the footer that the hover, focus and touch rule shows (one container, no second rule)', () => {
    const { container } = render(<ReplyBox><ReplyFooter text="hi" cost={null} at={null} menu={trigger('x', 1)} /></ReplyBox>);
    const box = container.firstElementChild as HTMLElement;
    const foot = screen.getByTestId('menu-x').parentElement as HTMLElement;
    expect(foot.parentElement).toBe(box);
    expect(box.querySelectorAll('[data-testid="menu-x"]')).toHaveLength(1);
  });
  it('a menu the host gives as null or false draws nothing', () => {
    const { container } = render(<ReplyBox><ReplyFooter text="hi" cost={null} at={null} menu={null} /></ReplyBox>);
    expect(container.querySelectorAll('button')).toHaveLength(1);
  });
});

describe('SessionView turnMenu', () => {
  it('calls the host with the reply\'s key and turn and draws what it returns in the footer', () => {
    const turnMenu = vi.fn((t: { key: string; turn: number }) => trigger(t.key, t.turn));
    render(<SessionView source={src([reply({ key: 'r7', turn: 3 })])} size="l" turnMenu={turnMenu} />);
    expect(turnMenu).toHaveBeenCalledWith({ key: 'r7', turn: 3 });
    const m = screen.getByTestId('menu-r7');
    expect(m.getAttribute('data-turn')).toBe('3');
    expect(nameOf(within(m.parentElement as HTMLElement).getAllByRole('button').at(0) as HTMLElement)).toMatch(/Copy/);
  });
  it('turn 0 is a real turn: the first reply gets its menu', () => {
    render(<SessionView source={src([reply({ key: 'r0', turn: 0 })])} size="l" turnMenu={(t) => trigger(t.key, t.turn)} />);
    expect(screen.getByTestId('menu-r0')).toBeTruthy();
  });
  it('each reply gets its own menu with its own turn', () => {
    render(<SessionView source={src([reply({ key: 'a', turn: 0 }), reply({ key: 'b', turn: 1, text: 'Second' })])} size="l" turnMenu={(t) => trigger(t.key, t.turn)} />);
    expect(screen.getByTestId('menu-a').getAttribute('data-turn')).toBe('0');
    expect(screen.getByTestId('menu-b').getAttribute('data-turn')).toBe('1');
  });
  it('no turnMenu: no menu, nothing else changes (Copy is still there)', () => {
    render(<SessionView source={src([reply({ turn: 2 })])} size="l" />);
    expect(screen.queryByTestId('menu-r0')).toBeNull();
    expect(screen.getAllByRole('button').some((b) => /Copy/.test(nameOf(b)))).toBe(true);
  });
  it('a streaming reply gets no menu and the host is not called for it', () => {
    const turnMenu = vi.fn((t: { key: string; turn: number }) => trigger(t.key, t.turn));
    render(<SessionView source={src([reply({ streaming: true, final: false, turn: 1 })])} size="l" turnMenu={turnMenu} />);
    expect(turnMenu).not.toHaveBeenCalled();
    expect(screen.queryByTestId('menu-r0')).toBeNull();
  });
  it('a reply flagged both final and streaming gets none (a streaming reply never shows a footer)', () => {
    const turnMenu = vi.fn((t: { key: string; turn: number }) => trigger(t.key, t.turn));
    render(<SessionView source={src([reply({ streaming: true, final: true, turn: 1 })])} size="l" turnMenu={turnMenu} />);
    expect(turnMenu).not.toHaveBeenCalled();
    expect(screen.queryByTestId('menu-r0')).toBeNull();
  });
  it('a reply that is not final gets none, even when it is not streaming', () => {
    const turnMenu = vi.fn((t: { key: string; turn: number }) => trigger(t.key, t.turn));
    render(<SessionView source={src([reply({ streaming: false, final: false, turn: 1 })])} size="l" turnMenu={turnMenu} />);
    expect(turnMenu).not.toHaveBeenCalled();
  });
  it('a final reply with no turn (unknown, or the live tail) gets none', () => {
    const turnMenu = vi.fn((t: { key: string; turn: number }) => trigger(t.key, t.turn));
    render(<SessionView source={src([reply({ turn: undefined })])} size="l" turnMenu={turnMenu} />);
    expect(turnMenu).not.toHaveBeenCalled();
    expect(screen.queryByTestId('menu-r0')).toBeNull();
  });
  it('a host that returns nothing for a turn leaves the footer as it was', () => {
    render(<SessionView source={src([reply({ turn: 4 })])} size="l" turnMenu={() => null} />);
    expect(screen.getAllByRole('button').filter((b) => !/Copy/.test(nameOf(b))).length).toBe(0);
  });
  it('keyboard: the menu control is a tab stop after Copy, in the footer, and takes Enter/click like any button', () => {
    const onPress = vi.fn();
    render(<SessionView source={src([reply({ key: 'k', turn: 5 })])} size="l" turnMenu={(t) => <button type="button" data-testid={`menu-${t.key}`} onClick={onPress}>Turn menu</button>} />);
    const m = screen.getByTestId('menu-k');
    m.focus();
    expect(document.activeElement).toBe(m);
    const copy = within(m.parentElement as HTMLElement).getAllByRole('button').at(0) as HTMLElement;
    expect(copy.compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(m);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('ConversationView passes turnMenu through', () => {
  it('the host\'s function reaches the transcript\'s replies', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    render(<ConversationView source={src([reply({ key: 'r9', turn: 2 })])} pane={null} detailsOpen={false} onDetails={() => {}} turnMenu={(t) => trigger(t.key, t.turn)} />);
    expect(screen.getByTestId('menu-r9').getAttribute('data-turn')).toBe('2');
  });
  it('without it nothing is drawn', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    render(<ConversationView source={src([reply({ key: 'r9', turn: 2 })])} pane={null} detailsOpen={false} onDetails={() => {}} />);
    expect(screen.queryByTestId('menu-r9')).toBeNull();
  });
});
