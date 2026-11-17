// Vitest: the ONE menu on a finished reply. Fork's item follows the capability table and says why when refused; a press forks
// from THAT reply's turn; the host opens the new chat ONLY for an `opened` outcome (a refusal says why, an unknown outcome is a toast that says
// the fork may or may not have been made and to look in the chat list; nothing reads it back); more than one provider adds items to the same menu, in order, with anything that must outlive the popover
// beside it; the reply footer stays up while the menu is open.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string; id?: string; action?: { label: string; onAction: () => unknown } }>);
vi.mock('../states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
import { can, type CapFacts } from './capability';
import { ReplyBox, ReplyFooter } from './Reply';
import { SessionView } from './SessionView';
import type { ConvBlock, ConvSnapshot, ConversationSource, ForkOutcome, ForkRowView } from './source';
import { forkItems, forkWholeItems, turnMenuOf, type ForkHost, type TurnItemsHook } from './ForkMenu';
import strings from './ForkMenu.strings.en.json';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' }, completedTurns: 3,
};
type Reply = Extract<ConvBlock, { k: 'reply' }>;
const reply = (o: Partial<Reply> = {}): Reply => ({ k: 'reply', key: 'r0', text: 'Done.', streaming: false, final: true, cost: null, at: null, turn: 0, ...o });
const src = (blocks: ConvBlock[]): ConversationSource => {
  const s: ConvSnapshot = { facts, title: 'Fix it', blocks, gates: [], meta: { computer: 'atlas', realm: 'Work', status: 'idle' } };
  return { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: () => ({ ok: false, reason: 'read_only' }) };
};

interface Hosted { host: ForkHost; fork: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn>; check: ReturnType<typeof vi.fn> }
function hosted(o: { f?: Partial<CapFacts>; fork?: (x?: { turn: number; pin?: number }) => Promise<ForkOutcome>; checkFork?: (k1: string) => Promise<ForkOutcome>; forks?: () => readonly ForkRowView[] | null; showForks?: () => void; canOpen?: boolean } = {}): Hosted {
  const fork = vi.fn(o.fork ?? (async () => ({ k: 'opened', sid: 'fork-1' }) as ForkOutcome));
  const open = vi.fn(() => o.canOpen ?? true);
  const f = { ...facts, ...o.f };
  const check = vi.fn(o.checkFork ?? (async () => ({ k: 'opened', sid: 'fork-1' }) as ForkOutcome));
  const host: ForkHost = { source: () => ({ can: (a) => can(a, f), fork, checkFork: check, forks: o.forks ?? (() => []) }), open, ...(o.showForks ? { showForks: o.showForks } : {}) };
  return { host, fork, open, check };
}
const view = (h: Hosted, extra: readonly TurnItemsHook[] = [], blocks: ConvBlock[] = [reply({ key: 'a', turn: 0 }), reply({ key: 'b', turn: 2, text: 'Second' })]) =>
  render(<SessionView source={src(blocks)} size="l" turnMenu={turnMenuOf(forkItems(h.host), ...extra)} />);
const ttl = (k: keyof typeof strings, n = 1): string => strings[k].replace('{{n}}', String(n));
const triggers = () => screen.getAllByRole('button', { name: strings['tm.more'] });
const openFirst = async (n = 0) => { await userEvent.click(triggers()[n] as HTMLElement); };
const forkItem = () => screen.findByRole('menuitem', { name: new RegExp(strings['tm.fork']) });
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });

beforeEach(() => { toasts.length = 0; vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('one menu per reply', () => {
  it('every finished reply with a turn has exactly one menu trigger in its footer', () => {
    view(hosted());
    expect(triggers()).toHaveLength(2);
  });
  it('a reply without a turn has none', () => {
    view(hosted(), [], [reply({ key: 'a', turn: undefined })]);
    expect(screen.queryAllByRole('button', { name: strings['tm.more'] })).toHaveLength(0);
  });
  it('a host with nothing to offer draws no trigger', () => {
    render(<SessionView source={src([reply()])} size="l" turnMenu={turnMenuOf(forkItems({ source: () => null, open: () => true }))} />);
    expect(screen.queryAllByRole('button', { name: strings['tm.more'] })).toHaveLength(0);
  });
});

describe('the Fork item', () => {
  it('is offered with its words and forks from THIS reply\'s turn', async () => {
    const h = hosted();
    view(h);
    await openFirst(1);
    await userEvent.click(await forkItem());
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(1));
    expect(h.fork).toHaveBeenCalledWith({ turn: 2 });
  });
  it('a refused capability disables it with the table\'s sentence and calls nothing', async () => {
    const h = hosted({ f: { state: 'closed' } });
    view(h);
    await openFirst();
    const it0 = await forkItem();
    expect(it0.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menu').textContent).toContain('This chat is closed, so reopen it first.');
    await userEvent.click(it0);
    expect(h.fork).not.toHaveBeenCalled();
  });
  it('no finished reply: it says there is nothing to fork yet', async () => {
    view(hosted({ f: { completedTurns: 0 } }));
    await openFirst();
    expect((await forkItem()).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menu').textContent).toContain('Nothing to fork yet');
  });
  it('is disabled while a fork is under way (a second press makes no second request)', async () => {
    let done: (o: ForkOutcome) => void = () => {};
    const h = hosted({ fork: () => new Promise<ForkOutcome>((r) => { done = r; }) });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await openFirst();
    expect((await forkItem()).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menu').textContent).toContain(strings['tm.forking']);
    expect(h.fork).toHaveBeenCalledTimes(1);
    await act(async () => { done({ k: 'opened', sid: 'x' }); });
  });
});

describe('the new chat opens ONLY on an opened outcome', () => {
  it('opened: the host opens exactly that session, once, and no toast is needed', async () => {
    const h = hosted();
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(h.open).toHaveBeenCalledTimes(1));
    expect(h.open).toHaveBeenCalledWith('fork-1');
    expect(toasts).toHaveLength(0);
  });
  it('opened but this view has nowhere to open it: the toast says where the fork is', async () => {
    const h = hosted({ canOpen: false });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkMade'), tone: 'ok' });
  });
  it('a Check\'s answer decided for an account that is no longer shown opens nothing and toasts only the unknown (account) words', async () => {
    let shown = true;
    const guard = { still: () => shown, moved: { words: 'This answer was for another account.', k1: 'hx-1' } };
    const h = hosted({ forks: () => [{ k1: 'hx-1', parent: 's', turn: 0, bad: false, hidden: false, mine: false }], checkFork: async () => { const o = { k: 'opened', sid: 'fork-1', guard } as ForkOutcome; shown = false; return o; } });
    view(h);
    await openFirst();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['tm.check'] }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(h.open).not.toHaveBeenCalled();
    expect(toasts[0]).toMatchObject({ tone: 'unknown', body: 'This answer was for another account.' });
  });
  it('refused: the words are shown, nothing opens', async () => {
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'The chat changed.', reason: 'changed' }) });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkRefused'), body: 'The chat changed.', tone: 'error' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.retry']);
    expect(h.open).not.toHaveBeenCalled();
    await act(async () => { await toasts[0]!.action!.onAction(); });
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(2));
    expect(h.fork).toHaveBeenLastCalledWith({ turn: 0 });
  });
  it('unknown (pending): an unknown-tone toast with Check again; the press never forks twice', async () => {
    const h = hosted({ fork: async () => ({ k: 'unknown', words: 'It may have been made.', reason: 'pending', k1: 'hx-7' }), checkFork: async () => ({ k: 'opened', sid: 'fork-7' }) });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkUnknown'), body: 'It may have been made.', tone: 'unknown', id: 'fork:1' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.checkAgain']);
    expect(h.open).not.toHaveBeenCalled();
    await act(async () => { await toasts[0]!.action!.onAction(); });
    await waitFor(() => expect(h.check).toHaveBeenCalledWith('hx-7'));
    await waitFor(() => expect(h.open).toHaveBeenCalledWith('fork-7'));
    expect(h.fork).toHaveBeenCalledTimes(1);
  });
  it.each([['gone'], ['unconfirmed']] as const)('%s: warn, no retry action', async (reason) => {
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'w', reason }) });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn' });
    expect(toasts[0]!.action).toBeUndefined();
  });
  it('none: an info toast whose action is Fork again', async () => {
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'w', reason: 'none' }) });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkNone'), tone: 'info' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.fork']);
  });
  it('full: an error toast whose action shows the unconfirmed forks', async () => {
    const showForks = vi.fn();
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'w', reason: 'full' }), showForks });
    view(h);
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'error' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.showForks']);
    await act(async () => { await toasts[0]!.action!.onAction(); });
    expect(showForks).toHaveBeenCalledTimes(1);
  });
  it('a reply with an unconfirmed fork offers Check the fork instead of Fork, and a check never forks', async () => {
    const row: ForkRowView = { k1: 'hx-3', parent: 's', turn: 0, bad: false, hidden: false, mine: false };
    const h = hosted({ forks: () => [row], checkFork: async () => ({ k: 'refused', words: 'Not made.', reason: 'gone' }) });
    view(h);
    await openFirst();
    expect(screen.queryByRole('menuitem', { name: new RegExp(strings['tm.fork']) })).toBeNull();
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['tm.check'] }));
    await waitFor(() => expect(h.check).toHaveBeenCalledWith('hx-3'));
    expect(h.fork).not.toHaveBeenCalled();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn', body: 'Not made.' });
  });
  it('the other replies keep Fork', async () => {
    const row: ForkRowView = { k1: 'hx-3', parent: 's', turn: 0, bad: false, hidden: false, mine: false };
    view(hosted({ forks: () => [row] }));
    await openFirst(1);
    expect(await forkItem()).toBeTruthy();
  });
});

describe('a list API for more items', () => {
  const trim = (calls: string[]): TurnItemsHook => (t) => ({
    items: [{ id: 'trim', label: 'Remove what follows', tone: 'danger', onAction: () => { calls.push(`trim:${t.turn}`); } }],
    aside: <div data-testid={`aside-${t.key}`}>dialog for {t.key}</div>,
  });
  it('Fork then the next provider\'s item, in one menu', async () => {
    const calls: string[] = [];
    view(hosted(), [trim(calls)]);
    await openFirst(1);
    const names = (await screen.findAllByRole('menuitem')).map((x) => x.textContent ?? '');
    expect(names[0]).toContain(strings['tm.fork']);
    expect(names[1]).toContain('Remove what follows');
    await userEvent.click(screen.getByRole('menuitem', { name: /Remove what follows/ }));
    expect(calls).toEqual(['trim:2']);
  });
  it('what a provider needs to outlive the popover is mounted beside the menu, once per reply', () => {
    view(hosted(), [trim([])]);
    expect(screen.getByTestId('aside-a')).toBeTruthy();
    expect(screen.getByTestId('aside-b')).toBeTruthy();
  });
  it('a provider with nothing for a reply adds nothing; the menu is still one trigger', async () => {
    view(hosted(), [() => ({ items: [] })]);
    expect(triggers()).toHaveLength(2);
    await openFirst();
    expect(await screen.findAllByRole('menuitem')).toHaveLength(1);
  });
});

describe('the footer marks an open menu', () => {
  const footerOf = (i: number) => triggers()[i]!.closest('[data-menu-open], div') as HTMLElement;
  const foot = () => (triggers()[0] as HTMLElement).parentElement as HTMLElement;
  it('open: data-menu-open is true; closed: it is gone', async () => {
    view(hosted());
    void footerOf;
    expect(foot().getAttribute('data-menu-open')).toBeNull();
    await openFirst();
    await screen.findByRole('menu');
    expect(foot().getAttribute('data-menu-open')).toBe('true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await settle();
    expect(foot().getAttribute('data-menu-open')).toBeNull();
  });
  it('choosing an item closes the menu and lets the footer go', async () => {
    view(hosted());
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await settle();
    expect(foot().getAttribute('data-menu-open')).toBeNull();
  });
  it('a footer with no menu has no attribute; a menu that unmounts open leaves none behind', async () => {
    const { rerender } = render(<ReplyBox><ReplyFooter text="hi" cost={null} at={null} /></ReplyBox>);
    expect(document.querySelector('[data-menu-open]')).toBeNull();
    rerender(<ReplyBox><ReplyFooter text="hi" cost={null} at={null} menu={turnMenuOf(forkItems(hosted().host))({ key: 'k', turn: 0 })} /></ReplyBox>);
    await userEvent.click(screen.getByRole('button', { name: strings['tm.more'] }));
    await screen.findByRole('menu');
    expect(document.querySelector('[data-menu-open="true"]')).not.toBeNull();
    rerender(<ReplyBox><ReplyFooter text="hi" cost={null} at={null} /></ReplyBox>);
    expect(document.querySelector('[data-menu-open]')).toBeNull();
  });
  it('the stylesheet only quiets the footer: its buttons fade on a hover pointer, never on the newest turn, a hovered or focused reply or an open menu, and keep their room', () => {
    const css = readFileSync(join(__dirname, 'Conversation.module.css'), 'utf8');
    const foot = [...css.matchAll(/([^{}]*\.replyFoot[^{]*)\{([^}]*)\}/g)];
    expect(foot.length).toBeGreaterThan(0);
    // Nothing takes the footer or its room away.
    for (const [, , body] of foot) expect(body).not.toMatch(/visibility|display:\s*none/);
    // One rule fades the buttons, and it spares a hovered or focused reply, the newest turn and an open menu.
    const fades = foot.filter(([, , body]) => /opacity:\s*0\b/.test(body ?? ''));
    expect(fades.length).toBe(1);
    const sel = fades[0]?.[1] ?? '';
    for (const spared of [':hover', ':focus-within', '[data-latest]', ':not([data-menu-open])']) expect(sel).toContain(spared);
    // Only where a pointer can hover: on touch every reply's buttons show.
    expect(css).toMatch(/@media \(hover: hover\) \{[^{}]*\.replyFoot:not\(\[data-menu-open\]\)[^{]*\{\s*opacity:\s*0;\s*\}\s*\}/);
    expect(css).not.toMatch(/\.reply:hover \.replyFoot/);
  });
});

// The item for the WHOLE chat. It forks with no argument, speaks of the whole chat, and settles exactly as the reply's item does.
describe('the whole-chat Fork item', () => {
  const wholeLabel = strings['tm.wholeFork'];
  function Whole({ h }: { h: Hosted }) {
    const use = forkWholeItems(h.host);
    const { items } = use();
    return <div>{items.map((a) => <button key={a.id} type="button" data-id={a.id} aria-disabled={a.isDisabled ? 'true' : undefined} title={a.disabledReason} onClick={() => { if (!a.isDisabled) void a.onAction(); }}>{a.label}</button>)}</div>;
  }
  const show = (h: Hosted) => render(<Whole h={h} />);
  const press = async () => { await userEvent.click(screen.getByRole('button')); };
  const wttl = (k: keyof typeof strings): string => strings[k];

  it('is offered with whole-chat words and forks with NO argument', async () => {
    const h = hosted();
    show(h);
    expect(screen.getByRole('button').textContent).toBe(wholeLabel);
    expect(screen.getByRole('button').getAttribute('data-id')).toBe('fork-whole');
    await press();
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(1));
    expect(h.fork.mock.calls[0]).toEqual([]);
  });
  it('opened: the host opens exactly that session and no toast is needed; with nowhere to open, the toast says where the fork is', async () => {
    const h = hosted();
    show(h);
    await press();
    await waitFor(() => expect(h.open).toHaveBeenCalledWith('fork-1'));
    expect(toasts).toHaveLength(0);
    cleanup();
    const g = hosted({ canOpen: false });
    show(g);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: wttl('tm.wholeMade'), tone: 'ok' });
  });
  it('refused: whole-chat words, error tone and Retry that forks again with no argument; nothing opens', async () => {
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'The chat changed.', reason: 'changed' }) });
    show(h);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: wttl('tm.wholeRefused'), body: 'The chat changed.', tone: 'error' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.retry']);
    expect(h.open).not.toHaveBeenCalled();
    await act(async () => { await toasts[0]!.action!.onAction(); });
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(2));
    expect(h.fork.mock.calls[1]).toEqual([]);
  });
  it('unknown (pending): an unknown-tone toast with the whole-chat id and Check again; the press never forks twice', async () => {
    const h = hosted({ fork: async () => ({ k: 'unknown', words: 'It may have been made.', reason: 'pending', k1: 'hx-7' }), checkFork: async () => ({ k: 'opened', sid: 'fork-7' }) });
    show(h);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: wttl('tm.wholeUnknown'), body: 'It may have been made.', tone: 'unknown', id: 'fork:whole' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.checkAgain']);
    expect(h.open).not.toHaveBeenCalled();
    await act(async () => { await toasts[0]!.action!.onAction(); });
    await waitFor(() => expect(h.check).toHaveBeenCalledWith('hx-7'));
    await waitFor(() => expect(h.open).toHaveBeenCalledWith('fork-7'));
    expect(h.fork).toHaveBeenCalledTimes(1);
  });
  it.each([['gone'], ['unconfirmed']] as const)('%s: warn, whole-chat words, no retry action', async (reason) => {
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'w', reason }) });
    show(h);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: wttl('tm.wholeRefused'), tone: 'warn' });
    expect(toasts[0]!.action).toBeUndefined();
  });
  it('none: an info toast whose action is Fork this chat (again, with no argument)', async () => {
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'w', reason: 'none' }) });
    show(h);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: wttl('tm.wholeNone'), tone: 'info' });
    expect(toasts[0]!.action?.label).toBe(wholeLabel);
    await act(async () => { await toasts[0]!.action!.onAction(); });
    await waitFor(() => expect(h.fork).toHaveBeenCalledTimes(2));
    expect(h.fork.mock.calls[1]).toEqual([]);
  });
  it('full: an error toast whose action shows the unconfirmed forks', async () => {
    const showForks = vi.fn();
    const h = hosted({ fork: async () => ({ k: 'refused', words: 'w', reason: 'full' }), showForks });
    show(h);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: wttl('tm.wholeRefused'), tone: 'error' });
    expect(toasts[0]!.action?.label).toBe(strings['tm.showForks']);
    await act(async () => { await toasts[0]!.action!.onAction(); });
    expect(showForks).toHaveBeenCalledTimes(1);
  });
  it('a refused capability disables it with the table\'s sentence and calls nothing', async () => {
    const h = hosted({ f: { state: 'closed' } });
    show(h);
    const b = screen.getByRole('button');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(b.getAttribute('title')).toBe('This chat is closed, so reopen it first.');
    await userEvent.click(b);
    expect(h.fork).not.toHaveBeenCalled();
  });
  it('a pending WHOLE fork (no turn) turns it into Check the fork, and a check never forks', async () => {
    const row: ForkRowView = { k1: 'hx-3', parent: 's', turn: null, bad: false, hidden: false, mine: false };
    const h = hosted({ forks: () => [row], checkFork: async () => ({ k: 'refused', words: 'Not made.', reason: 'gone' }) });
    show(h);
    const b = screen.getByRole('button');
    expect(b.textContent).toBe(strings['tm.check']);
    expect(b.getAttribute('data-id')).toBe('fork-whole-check');
    await userEvent.click(b);
    await waitFor(() => expect(h.check).toHaveBeenCalledWith('hx-3'));
    expect(h.fork).not.toHaveBeenCalled();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn', body: 'Not made.' });
  });
  it('a pending fork of a REPLY does not turn the whole-chat item into Check, and a whole row does not turn a reply\'s', async () => {
    const reply0: ForkRowView = { k1: 'hx-4', parent: 's', turn: 0, bad: false, hidden: false, mine: false };
    show(hosted({ forks: () => [reply0] }));
    expect(screen.getByRole('button').textContent).toBe(wholeLabel);
    cleanup();
    const whole: ForkRowView = { k1: 'hx-5', parent: 's', turn: null, bad: false, hidden: false, mine: false };
    view(hosted({ forks: () => [whole] }));
    await openFirst();
    expect(await forkItem()).toBeTruthy();
  });
  it('a pending row whose parent could not be read (null parent) is not this chat\'s fork', () => {
    const row: ForkRowView = { k1: 'hx-6', parent: null, turn: null, bad: true, hidden: false, mine: false };
    show(hosted({ forks: () => [row] }));
    expect(screen.getByRole('button').textContent).toBe(wholeLabel);
  });
  it('a Check\'s answer decided for an account that is no longer shown opens nothing and toasts only the unknown (account) words', async () => {
    let shown = true;
    const guard = { still: () => shown, moved: { words: 'This answer was for another account.', k1: 'hx-1' } };
    const h = hosted({ forks: () => [{ k1: 'hx-1', parent: 's', turn: null, bad: false, hidden: false, mine: false }], checkFork: async () => { const o = { k: 'opened', sid: 'fork-1', guard } as ForkOutcome; shown = false; return o; } });
    show(h);
    await press();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(h.open).not.toHaveBeenCalled();
    expect(toasts[0]).toMatchObject({ tone: 'unknown', body: 'This answer was for another account.' });
  });
  it('no source or a source that cannot fork: it offers nothing', () => {
    const none: ForkHost = { source: () => null, open: () => true };
    const Probe = () => <span data-testid="n">{forkWholeItems(none)().items.length}</span>;
    render(<Probe />);
    expect(screen.getByTestId('n').textContent).toBe('0');
  });
});

// The host's question rides the warn toast of a fork that is gone or can't be confirmed, and no other toast.
describe('host.faq', () => {
  const FAQ = { id: 'forkUnconfirmed', q: 'Why is a fork not confirmed?', a: 'Check again only reads.' };
  const withFaq = (h: Hosted): Hosted => ({ ...h, host: { ...h.host, faq: FAQ } });
  it.each([['gone'], ['unconfirmed']] as const)('%s: the warn toast carries the question', async (reason) => {
    view(withFaq(hosted({ fork: async () => ({ k: 'refused', words: 'w', reason }) })));
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn', faq: { item: FAQ, label: strings['tm.faq'] } });
  });
  it.each([['none'], ['busy'], ['full']] as const)('%s: no question on the toast', async (reason) => {
    view(withFaq(hosted({ fork: async () => ({ k: 'refused', words: 'w', reason }), showForks: () => undefined })));
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect((toasts[0] as { faq?: unknown }).faq).toBeUndefined();
  });
  it('gone without host.faq: the warn toast carries none', async () => {
    view(hosted({ fork: async () => ({ k: 'refused', words: 'w', reason: 'gone' }) }));
    await openFirst();
    await userEvent.click(await forkItem());
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect((toasts[0] as { faq?: unknown }).faq).toBeUndefined();
  });
});
