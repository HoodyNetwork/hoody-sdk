// TrimDialog: "Remove what follows" on a finished reply. The trim is sent once with the clicked reply's index; the
// daemon's own {status:'ok', outcome:'done'} is done; a pending/lost answer is unknown and settled only by a read of the CAPTURED
// chat's whole transcript that shows EXACTLY the kept turns. The attempt belongs to its chat and computer, not to the dialog or the
// menu, and every completion carries the full identity it was made for.
import { boot } from '@core/test/env';
import { ConfirmDialog, can, type CapFacts, type Capability, type ConversationSource, type ConvSnapshot } from '@kit';
import type { Settled } from '@core/providers/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { onAction: () => unknown } }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c); return 'k'; } }));
import strings from './TrimDialog.strings.en.json';
import { TrimDialog } from './TrimDialog';
import { trimCap } from './trimGate';
import { createTrimAttempts, type TrimAttempts } from './trimAttempts';
import { createCloseAttempts } from './closeAttempts';
import { createDeleteAttempts } from './deleteAttempts';
import { createRenameAttempts } from './renameAttempts';
import type { AttemptBlocker } from './attemptBlockers';
import type { agent } from '@core';

const ACTIVE: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' }, completedTurns: 4,
};
const snapOf = (facts: CapFacts): ConvSnapshot => ({ facts, title: 'Fix', gates: [], blocks: [], meta: { computer: 'atlas', realm: 'Personal', status: 'idle' } });
const REF = { computer: 'atlas.1234', realm: 'global', sid: 's-1' };
const source = (o: { facts?: Partial<CapFacts>; cap?: (a: string) => Capability } = {}): ConversationSource => {
  const snap = snapOf({ ...ACTIVE, ...(o.facts ?? {}) });
  return { kind: 'session', ref: REF, snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a) => (o.cap ? o.cap(a) : can(a, snap.facts)) };
};
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const err = (kind: 'pending' | 'failed', status: number, code = ''): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const DONE = ok({ status: 'ok', outcome: 'done' });
const transcript = (n: number, sid = 's-1', realm: string = ID.realm) => ok({ session_id: sid, realm, turns_total: n, turns_returned: n, after_turn: 0, turn_boundaries: Array.from({ length: n }, (_, i) => i * 2 + 1), messages: Array.from({ length: n * 2 }, () => ({})) });
type Fake = agent.SessionApi & { trim: ReturnType<typeof vi.fn>; turns: ReturnType<typeof vi.fn> };
const fake = (o: { trim?: (...a: unknown[]) => Promise<Settled<unknown>>; turns?: () => Promise<Settled<unknown>> } = {}): Fake => ({
  rename: vi.fn(), read: vi.fn(), close: vi.fn(), loops: vi.fn(),
  trim: vi.fn(o.trim ?? (() => Promise.resolve(DONE))),
  turns: vi.fn(o.turns ?? (() => Promise.resolve(transcript(2)))),
}) as unknown as Fake;

const CHAT = { key: 'atlas.1234|global|s-1|api', computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
const ID = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
let at: TrimAttempts;
beforeEach(() => { boot(); at = createTrimAttempts(); toasts.length = 0; });
afterEach(() => cleanup());

interface V { s?: ConversationSource; a?: Fake; turn?: number; chat?: typeof CHAT | null; onTrimmed?: (c: unknown, t: number) => void; onClose?: () => void; unavailable?: string; open?: boolean; blockers?: readonly AttemptBlocker[] }
const view = (v: V = {}) => (
  <TrimDialog isOpen={v.open ?? true} onClose={v.onClose ?? (() => {})} chat={v.chat === undefined ? CHAT : v.chat} turn={v.turn ?? 1} calls={v.a ?? null}
    source={v.s ?? source()} unavailable={v.unavailable ?? ''} attempts={at} {...(v.blockers ? { blockers: v.blockers } : {})} {...(v.onTrimmed ? { onTrimmed: v.onTrimmed } : {})} returnFocus={() => null} />
);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const dlg = () => screen.findByRole('alertdialog');
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['trim.go'] });
const checkBtn = (d: HTMLElement) => within(d).getByRole('button', { name: /check again/i });

describe('trimCap: the chat answers through the table, the reply is the menu\'s own check', () => {
  it('a reply with a later turn is allowed; the last reply and an unreported count are not', () => {
    expect(trimCap(source(), 0).ok).toBe(true);
    expect(trimCap(source(), 2).ok).toBe(true);
    expect(trimCap(source(), 3)).toEqual({ ok: false, reason: 'no_later_turn' });
    expect(trimCap(source(), 9)).toEqual({ ok: false, reason: 'no_later_turn' });
    expect(trimCap(source({ facts: { completedTurns: undefined } }), 0)).toEqual({ ok: false, reason: 'loading' });
  });
  it('the chat\'s own reasons come first; a bad index is refused', () => {
    expect(trimCap(source({ facts: { turn: true } }), 0)).toEqual({ ok: false, reason: 'turn_in_flight' });
    expect(trimCap(source({ facts: { gate: 'confirm' } }), 0)).toEqual({ ok: false, reason: 'gate_parked' });
    expect(trimCap(source({ facts: { completedTurns: 1 } }), 0)).toEqual({ ok: false, reason: 'no_later_turn' });
    expect(trimCap(source(), -1).ok).toBe(false);
    expect(trimCap(source(), 1.5).ok).toBe(false);
  });
});

describe('Trim: the request', () => {
  it('names its overlay, is a danger confirm, and says what stays and what goes', async () => {
    render(view({ a: fake() }));
    const d = await dlg();
    expect(d).toHaveAttribute('data-hub-overlay', 'ai-turn-trim');
    expect(d.textContent).toContain(strings['trim.body']);
    // The confirm looks like a destructive one: its button is not the plain confirm's (the kit draws tone="danger" its own way).
    const trimLook = go(d).className;
    cleanup();
    render(<ConfirmDialog isOpen onOpenChange={() => {}} title="Plain" confirmLabel={strings['trim.go']} onConfirm={() => {}} />);
    const plain = within(await dlg());
    expect(plain.getByRole('button', { name: strings['trim.go'] }).className).not.toBe(trimLook);
  });
  it('sends once with the chat\'s own id and realm and exactly the clicked reply\'s index; the host hears the full identity once', async () => {
    const a = fake(), onTrimmed = vi.fn();
    render(view({ a, turn: 1, onTrimmed }));
    const d = await dlg();
    await act(async () => { fireEvent.click(go(d)); fireEvent.click(go(d)); });
    await flush();
    expect(a.trim).toHaveBeenCalledTimes(1);
    expect(a.trim).toHaveBeenCalledWith('s-1', 1, 'global');
    expect(onTrimmed).toHaveBeenCalledTimes(1);
    expect(onTrimmed).toHaveBeenCalledWith(ID, 1);
    expect(a.turns).not.toHaveBeenCalled();
  });
  it('reply 0 is a real index and is sent as 0', async () => {
    const a = fake();
    render(view({ a, turn: 0 }));
    await userEvent.click(go(await dlg()));
    await flush();
    expect(a.trim).toHaveBeenCalledWith('s-1', 0, 'global');
  });
  it('the dialog closes when it is done', async () => {
    const onClose = vi.fn();
    render(view({ a: fake(), onClose }));
    await userEvent.click(go(await dlg()));
    await flush();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
  it.each([
    ['a turn is running (409 turn_in_flight)', err('failed', 409, 'turn_in_flight'), strings['trim.busy']],
    ['a Claude Code chat that cannot rebuild (409 delegated_session)', err('failed', 409, 'delegated_session'), strings['trim.cannot']],
    ['the chat is not live (404)', err('failed', 404, 'not_found'), strings['trim.gone']],
    ['trim_failed (500): nothing was removed', err('failed', 500, 'trim_failed'), strings['trim.failed']],
    ['another refusal', err('failed', 403, 'forbidden'), strings['trim.refused']],
  ])('%s: said in words, the host hears nothing, and another try is allowed', async (_n, r, words) => {
    const a = fake({ trim: () => Promise.resolve(r) }), onTrimmed = vi.fn();
    render(view({ a, onTrimmed }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    expect(within(d).getByText(words)).toBeInTheDocument();
    expect(onTrimmed).not.toHaveBeenCalled();
    expect(go(d)).not.toBeDisabled();
  });
  it.each([
    ['202 pending', ok({ status: 'pending', request_id: 'r' })], ['a lost answer', err('pending', 0, 'network')], ['a 503', err('failed', 503, 'unavailable')],
    ['a 200 that is not the documented shape', ok({})], ['outcome unknown', ok({ status: 'ok', outcome: 'outcome_unknown' })],
  ])('%s is not proof: unknown, locked on Check again, nothing is sent again, the host hears nothing', async (_n, r) => {
    const a = fake({ trim: () => Promise.resolve(r) }), onTrimmed = vi.fn();
    render(view({ a, onTrimmed }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(go(d)).toBeDisabled();
    await act(async () => { fireEvent.click(go(d)); });
    expect(a.trim).toHaveBeenCalledTimes(1);
    expect(onTrimmed).not.toHaveBeenCalled();
  });
  it('the capability and the reply are read again when Trim is pressed: a chat that stopped allowing it gets no request', async () => {
    let allowed = true;
    const s = source({ cap: () => (allowed ? { ok: true } : { ok: false, reason: 'turn_in_flight' }) });
    const a = fake();
    render(view({ a, s }));
    const d = await dlg();
    allowed = false; // no re-render: the button on screen is still the old one
    await act(async () => { fireEvent.click(go(d)); });
    expect(a.trim).not.toHaveBeenCalled();
  });
  it('a count that changed under the open dialog (the clicked reply is now the last) sends nothing', async () => {
    let n = 4;
    const s: ConversationSource = { ...source(), snapshot: () => snapOf({ ...ACTIVE, completedTurns: n }) };
    const a = fake();
    render(view({ a, s, turn: 2 }));
    const d = await dlg();
    n = 3; // reply 2 is the last now
    await act(async () => { fireEvent.click(go(d)); });
    expect(a.trim).not.toHaveBeenCalled();
  });
});

describe('Trim: Check again proves only the exact kept turns', () => {
  const sendLost = async (a: Fake, onTrimmed: (c: unknown, t: number) => void, turn = 1) => {
    render(view({ a, onTrimmed, turn }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    return d;
  };
  const lost = (turns: () => Promise<Settled<unknown>>) => fake({ trim: () => Promise.resolve(err('pending', 0, 'network')), turns });

  it('turn + 1 turns left: done, the host hears the identity once, and nothing was sent again', async () => {
    const a = lost(() => Promise.resolve(transcript(2))), onTrimmed = vi.fn();
    const d = await sendLost(a, onTrimmed, 1);
    await userEvent.click(checkBtn(d));
    await flush();
    expect(a.turns).toHaveBeenCalledWith('s-1', 'global');
    expect(onTrimmed).toHaveBeenCalledTimes(1);
    expect(onTrimmed).toHaveBeenCalledWith(ID, 1);
    expect(a.trim).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['more turns than kept (it may still land)', transcript(4)], ['fewer than kept', transcript(1)], ['another chat', transcript(2, 's-9')],
    ['a failed read', err('failed', 500)], ['a lost read', err('pending', 0)], ['an unreadable shape', ok({})],
    ['the same session id in another realm', transcript(2, 's-1', 'cccccccccccccccccccccccc')], ['a transcript with no realm', ok({ session_id: 's-1', turns_total: 2, turns_returned: 2, after_turn: 0, turn_boundaries: [1, 3], messages: [{}, {}, {}, {}] })],
    ['a read answered 202 (the api hands on no body)', ok(undefined)],
    ['boundaries that go back (the count alone would say done)', ok({ session_id: 's-1', realm: ID.realm, turns_total: 2, turns_returned: 2, after_turn: 0, turn_boundaries: [3, 1], messages: [{}, {}, {}, {}] })],
    ['a boundary past the messages', ok({ session_id: 's-1', realm: ID.realm, turns_total: 2, turns_returned: 2, after_turn: 0, turn_boundaries: [1, 9], messages: [{}, {}, {}, {}] })],
    ['messages that are not an array', ok({ session_id: 's-1', realm: ID.realm, turns_total: 2, turns_returned: 2, after_turn: 0, turn_boundaries: [1, 3], messages: 'x' })],
  ])('%s: still unknown, locked, the host hears nothing', async (_n, r) => {
    const a = lost(() => Promise.resolve(r)), onTrimmed = vi.fn();
    const d = await sendLost(a, onTrimmed, 1);
    await userEvent.click(checkBtn(d));
    await flush();
    expect(onTrimmed).not.toHaveBeenCalled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(go(d)).toBeDisabled();
  });
  it('two Check agains at once tell the host once', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = lost(() => new Promise<Settled<unknown>>((r) => { finish = r; })), onTrimmed = vi.fn();
    const d = await sendLost(a, onTrimmed, 1);
    await act(async () => { fireEvent.click(checkBtn(d)); fireEvent.click(checkBtn(d)); });
    await act(async () => { finish(transcript(2)); });
    expect(onTrimmed).toHaveBeenCalledTimes(1);
  });
});

describe('a trim attempt belongs to its chat and computer, not to the dialog', () => {
  const OTHER = { ...CHAT, key: 'atlas.1234|global|s-2|api', sid: 's-2' };
  const ORION = { ...CHAT, key: 'orion.9999|global|s-1|api', computer: 'orion.9999' };
  const lostApi = (turns?: () => Promise<Settled<unknown>>) => fake({ trim: () => Promise.resolve(err('pending', 0, 'network')), ...(turns ? { turns } : {}) });

  it('dismissing a lost-answer dialog and reopening restores it locked: only Check again, no second request', async () => {
    const a = lostApi();
    const r = render(view({ a }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    r.rerender(view({ a, open: false }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    r.rerender(view({ a, open: true }));
    const d2 = await dlg();
    expect(go(d2)).toBeDisabled();
    expect(checkBtn(d2)).toBeInTheDocument();
    await act(async () => { fireEvent.click(go(d2)); });
    expect(a.trim).toHaveBeenCalledTimes(1);
  });
  it('the record outlives the dialog: a new dialog for another reply of the same chat is locked too', async () => {
    const a = lostApi();
    const r = render(view({ a, turn: 1 }));
    await userEvent.click(go(await dlg()));
    await flush();
    r.unmount();
    render(view({ a, turn: 2 }));
    const d = await dlg();
    expect(go(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.trim).toHaveBeenCalledTimes(1);
  });
  it('another chat is not locked by it, and another reply of the same chat closes an open dialog', async () => {
    const a = lostApi(), b = fake();
    const r = render(view({ a }));
    await userEvent.click(go(await dlg()));
    await flush();
    r.rerender(view({ a: b, chat: OTHER, open: true }));
    const onClose = vi.fn();
    r.rerender(view({ a: b, chat: OTHER, open: true, onClose }));
    await waitFor(() => expect(onClose).toHaveBeenCalled()); // bound to s-1: s-2 is another chat
    r.rerender(view({ a: b, chat: OTHER, open: false }));
    r.rerender(view({ a: b, chat: OTHER, open: true }));
    const d = await dlg();
    expect(go(d)).not.toBeDisabled();
    await userEvent.click(go(d));
    await flush();
    expect(b.trim).toHaveBeenCalledWith('s-2', 1, 'global');
  });
  it('the same chat id on another computer is another target: its dialog is not locked', async () => {
    const a = lostApi(), b = fake();
    const r = render(view({ a }));
    await userEvent.click(go(await dlg()));
    await flush();
    r.rerender(view({ a: b, chat: ORION, open: false }));
    r.rerender(view({ a: b, chat: ORION, open: true }));
    expect(go(await dlg())).not.toBeDisabled();
  });
  it('a late answer after the chat changed reaches the host with the ORIGINAL identity, and touches nothing of the new chat', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ trim: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), b = fake();
    const first = vi.fn(), second = vi.fn();
    const r = render(view({ a, onTrimmed: first }));
    await act(async () => { fireEvent.click(go(await dlg())); });
    r.rerender(view({ a: b, chat: ORION, onTrimmed: second }));
    await act(async () => { finish(DONE); });
    expect([...first.mock.calls, ...second.mock.calls]).toEqual([[ID, 1]]);
    expect(b.trim).not.toHaveBeenCalled();
    expect(b.turns).not.toHaveBeenCalled();
  });
  it('a late answer with a menu mounted again and other callbacks still names the chat it was made for', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ trim: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), b = fake();
    const first = vi.fn(), second = vi.fn();
    const r = render(view({ a, onTrimmed: first }));
    await act(async () => { fireEvent.click(go(await dlg())); });
    r.unmount();
    render(view({ a: b, chat: OTHER, onTrimmed: second }));
    await act(async () => { finish(DONE); });
    expect([...first.mock.calls, ...second.mock.calls]).toEqual([[ID, 1]]);
  });
  it('a Check again handed out by an older dialog (a sticky toast) reads ITS chat through ITS api and tells the host ITS identity', async () => {
    const a = lostApi(() => Promise.resolve(transcript(2))), b = fake(), onTrimmed = vi.fn();
    const r = render(view({ a, onTrimmed }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    r.rerender(view({ a, onTrimmed, open: false }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const sticky = toasts.find((t) => t.action);
    r.rerender(view({ a: b, chat: ORION, onTrimmed, open: false }));
    if (sticky?.action) await act(async () => { await sticky.action!.onAction(); });
    expect(b.turns).not.toHaveBeenCalled();
    expect(a.turns).toHaveBeenCalledWith('s-1', 'global');
    expect(onTrimmed).toHaveBeenCalledTimes(1);
    expect(onTrimmed).toHaveBeenCalledWith(ID, 1);
  });
  it('losing the capability closes the dialog and sends nothing', async () => {
    const a = fake(), onClose = vi.fn();
    const r = render(view({ a, onClose }));
    await dlg();
    r.rerender(view({ a, onClose, unavailable: 'A turn is running.' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.trim).not.toHaveBeenCalled();
  });
  it('the computer replaced under an open dialog closes it and nothing is sent', async () => {
    const a = fake(), b = fake(), onClose = vi.fn();
    const r = render(view({ a, onClose }));
    await dlg();
    r.rerender(view({ a: b, chat: ORION, onClose }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.trim).not.toHaveBeenCalled();
    expect(b.trim).not.toHaveBeenCalled();
  });
  it('Check again of an attempt that was replaced reads nothing and tells the host nothing', async () => {
    const a = lostApi(), onTrimmed = vi.fn();
    render(view({ a, onTrimmed }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    const held = at.get(CHAT.key)!;
    // The record is replaced by another attempt of the same chat; the dialog still shows the old one with its Check again.
    await act(async () => { at.set({ ...held }); });
    await userEvent.click(checkBtn(d));
    await flush();
    expect(a.turns).not.toHaveBeenCalled();
    expect(onTrimmed).not.toHaveBeenCalled();
  });
  it('a Check again whose attempt was replaced while it was reading changes nothing and tells the host nothing', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = lostApi(() => new Promise<Settled<unknown>>((r) => { finish = r; })), onTrimmed = vi.fn();
    render(view({ a, onTrimmed }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    await act(async () => { fireEvent.click(checkBtn(d)); });
    const held = at.get(CHAT.key)!;
    await act(async () => { at.set({ ...held }); });
    await act(async () => { finish(transcript(2)); });
    expect(onTrimmed).not.toHaveBeenCalled();
    expect(at.get(CHAT.key)).not.toBe(held);
    expect(at.get(CHAT.key)?.phase).toBe('unknown');
  });
  it('a Check again proved after the chat changed tells the host the ORIGINAL identity', async () => {
    const a = lostApi(() => Promise.resolve(transcript(2))), b = fake(), onTrimmed = vi.fn();
    const r = render(view({ a, onTrimmed }));
    const d = await dlg();
    await userEvent.click(go(d));
    await flush();
    r.rerender(view({ a: b, chat: OTHER, onTrimmed }));
    await userEvent.click(checkBtn(d));
    await flush();
    expect(a.turns).toHaveBeenCalledWith('s-1', 'global');
    expect(b.turns).not.toHaveBeenCalled();
    expect(onTrimmed).toHaveBeenCalledTimes(1);
    expect(onTrimmed).toHaveBeenCalledWith(ID, 1);
  });
  it('the reply changed under an open dialog (the host has not closed it yet): Remove sends nothing', async () => {
    const a = fake();
    const r = render(view({ a, turn: 1 }));
    const d = await dlg();
    r.rerender(view({ a, turn: 0 }));
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(a.trim).not.toHaveBeenCalled();
  });
  it('a Trim for a dialog with no api (no computer shown) sends nothing', async () => {
    render(view({ a: undefined }));
    const d = await dlg();
    await act(async () => { fireEvent.click(go(d)); });
    expect(toasts).toEqual([]);
  });
});

describe('Trim waits for an unsettled Rename, Close or Delete of the same chat (the reverse lock)', () => {
  const KEY = CHAT.key;
  const rn = () => createRenameAttempts(), cl = () => createCloseAttempts(), dl = () => createDeleteAttempts();
  const rec = (a: Fake, phase: 'sending' | 'unknown', key = KEY) => ({ key, chat: ID, sid: 's-1', realm: 'global', calls: a, name: 'x', phase }) as never;
  type Store = { set(a: never): void; end(a: never, p: 'failed', f?: string): void } & AttemptBlocker;
  const STORES: Array<[string, () => Store]> = [['Rename', rn as never], ['Close', cl as never], ['Delete', dl as never]];

  describe.each(STORES)('%s', (_name, make) => {
    it.each([['an unknown', 'unknown' as const], ['a still sending', 'sending' as const]])('%s record of this chat: Remove is off, one line says why, and nothing is sent', async (_p, phase) => {
      const a = fake(), s = make();
      s.set(rec(a, phase));
      render(view({ a, blockers: [s] }));
      const d = await dlg();
      expect(go(d)).toBeDisabled();
      expect(within(d).getByText(new RegExp(strings['trim.blocked']))).toBeInTheDocument();
      await act(async () => { fireEvent.click(go(d)); });
      await flush();
      expect(a.trim).not.toHaveBeenCalled();
      expect(at.get(CHAT.key)).toBeUndefined();
    });
    it('the record of another chat does not block, and a record that settles frees it', async () => {
      const a = fake(), s = make();
      s.set(rec(a, 'unknown', CHAT.key.replace('s-1', 's-other')));
      render(view({ a, blockers: [s] }));
      const d = await dlg();
      expect(go(d)).not.toBeDisabled();
      expect(within(d).queryByText(new RegExp(strings['trim.blocked']))).toBeNull();
      const mine = rec(a, 'unknown');
      act(() => s.set(mine));
      await waitFor(() => expect(go(d)).toBeDisabled());
      act(() => s.end(mine, 'failed'));
      await waitFor(() => expect(go(d)).not.toBeDisabled());
    });
  });
  it('the record is read again at the press: one that appeared after the last render still refuses the send', async () => {
    const a = fake();
    let blocked = false;
    const blocker: AttemptBlocker = { get: (k) => (blocked && k === KEY ? { phase: 'unknown' } : undefined), subscribe: () => () => {}, version: () => 0 };
    render(view({ a, blockers: [blocker] }));
    const d = await dlg();
    expect(go(d)).not.toBeDisabled();
    blocked = true; // no render in between
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(a.trim).not.toHaveBeenCalled();
    expect(at.get(CHAT.key)).toBeUndefined();
  });
  it.each([['an unknown', 'unknown' as const], ['a still sending', 'sending' as const]])('a Trim that failed for sure, then %s record of another action: Remove is off and the line says why beside the failure', async (_p, phase) => {
    const a = fake({ trim: () => Promise.resolve(err('failed', 409, 'turn_in_flight')) });
    const s = createRenameAttempts();
    render(view({ a, blockers: [s] }));
    const d = await dlg();
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(within(d).getByText(strings['trim.busy'])).toBeInTheDocument(); // the definite failure, no record left
    expect(at.get(CHAT.key)).toBeUndefined();
    act(() => s.set(rec(a, phase)));
    await waitFor(() => expect(go(d)).toBeDisabled());
    expect(within(d).getByText(new RegExp(strings['trim.blocked']))).toBeInTheDocument();
    expect(within(d).getByText(strings['trim.busy'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(a.trim).toHaveBeenCalledTimes(1);
  });
  it('without blockers the Trim is not held back (the default is none)', async () => {
    const a = fake();
    render(view({ a }));
    const d = await dlg();
    expect(go(d)).not.toBeDisabled();
    expect(within(d).queryByText(new RegExp(strings['trim.blocked']))).toBeNull();
  });
});
