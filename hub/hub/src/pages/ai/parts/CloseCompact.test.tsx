// ConvMenu: Compact now and Close. Compact is the message `/compact` through the active door, disabled by the capability
// table; Close warns about the chat's loops, is sent once, and a lost answer is settled only by a read of the CAPTURED chat that
// says nothing is attached. The attempt belongs to its chat and computer, not to the dialog.
import { boot } from '@core/test/env';
import { can, type Capability, type CapFacts, type ConversationSource, type ConvSnapshot, type SendOutcome } from '@kit';
import type { Settled } from '@core/providers/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { onAction: () => unknown } }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c); return 'k'; } }));
import sv from '@kit/agent/SessionView.strings.en.json';
import strings from './ConvMenu.strings.en.json';
import { ConvMenu } from './ConvMenu';
import { createCloseAttempts, type CloseAttempts } from './closeAttempts';
import { createRenameAttempts } from './renameAttempts';
import type { agent } from '@core';
import { isOff } from '@app/testing';

const FACTS: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const ACTIVE: CapFacts = { ...FACTS, mode: 'active' };
const snapOf = (facts: CapFacts): ConvSnapshot => ({
  facts, title: 'Fix the cart total', gates: [],
  blocks: [{ k: 'user', key: 'u1', text: 'Round the cart total half up.', at: 1 }],
  meta: { computer: 'atlas', realm: 'Personal', status: 'idle' },
});
const REF = { computer: 'atlas.1234', realm: 'global', sid: 's-1' };
// The identity a completion carries: the computer, realm, session and target the attempt was made for ('api': the test api).
const ID1 = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
interface Src extends ConversationSource { send?: ReturnType<typeof vi.fn> }
const source = (o: { facts?: CapFacts; sid?: string; send?: boolean | ((...a: unknown[]) => Promise<SendOutcome>); ref?: ConversationSource['ref']; cap?: (a: string) => Capability } = {}): Src => {
  const snap = snapOf(o.facts ?? ACTIVE);
  const s: Src = {
    kind: 'session', ref: o.ref ?? { ...REF, sid: o.sid ?? REF.sid }, snapshot: () => snap, subscribe: () => () => {}, watch: () => {},
    can: (a) => (o.cap ? o.cap(a) : can(a, snap.facts)),
  };
  if (o.send !== false) s.send = vi.fn(typeof o.send === 'function' ? o.send : () => Promise.resolve({ k: 'done' } as SendOutcome));
  return s;
};

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const err = (kind: 'pending' | 'failed', status: number, code = ''): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
// The gateway's real loops page: {items:[{id, state, session_id, ...}], meta:{total}}.
const loopsOf = (...states: string[]) => ok({ items: states.map((state, i) => ({ id: `l${i}`, state, session_id: 's-1' })), meta: { total: states.length } });
// The gateway's reads of a chat: persisted summaries omit `attached` when false; a live chat with no turn yet carries the flag at the top.
const readOf = (session: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ok({ session: { id: 's-1', ...session }, ...top });
type Fake = agent.SessionApi & { close: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn>; loops: ReturnType<typeof vi.fn> };
const fake = (o: { close?: (...a: unknown[]) => Promise<Settled<unknown>>; read?: () => Promise<Settled<unknown>>; loops?: (...a: unknown[]) => Promise<Settled<unknown>> } = {}): Fake => ({
  rename: vi.fn(() => Promise.resolve(ok({ status: 'ok', name: 'x' }))),
  read: vi.fn(o.read ?? (() => Promise.resolve(ok({ session: { id: 's-1' } })))),
  close: vi.fn(o.close ?? (() => Promise.resolve(ok({ status: 'ok' })))),
  loops: vi.fn(o.loops ?? (() => Promise.resolve(loopsOf()))),
}) as unknown as Fake;

let cl: CloseAttempts;
beforeEach(() => { boot(); cl = createCloseAttempts(); toasts.length = 0; });
afterEach(() => cleanup());
const view = (s: ConversationSource, a: Fake | undefined, extra: Record<string, unknown> = {}) =>
  <ConvMenu attempts={createRenameAttempts()} closeAttempts={cl} source={s} target={null} {...(a ? { api: a } : {})} {...extra} />;

const openMenu = async () => { await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] })); };
const item = (name: string) => screen.findByRole('menuitem', { name: new RegExp(name) });
const menuText = () => screen.getByRole('menu').textContent ?? '';
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const openClose = async () => { await openMenu(); await userEvent.click(await item(strings['menu.close'])); return screen.findByRole('alertdialog'); };
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['close.go'] });
const checkBtn = (d: HTMLElement) => within(d).getByRole('button', { name: /check again/i });

describe('Compact now', () => {
  it('a read-only chat: disabled, with the capability reason', async () => {
    render(view(source({ facts: FACTS, send: false }), fake()));
    await openMenu();
    const c = await item(strings['menu.compact']);
    expect(c).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(sv['sv.why.read_only']);
  });
  it('a waiting approval: disabled and says to answer it first', async () => {
    render(view(source({ facts: { ...ACTIVE, gate: 'confirm' } }), fake()));
    await openMenu();
    const c = await item(strings['menu.compact']);
    expect(c).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(sv['sv.why.gate_parked']);
  });
  it('a source that cannot send is disabled even when the table allows it', async () => {
    render(view(source({ send: false }), fake()));
    await openMenu();
    const c = await item(strings['menu.compact']);
    expect(c).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(strings['menu.readOnly']);
  });
  it('sends "/compact" through the active door, once, however fast it is pressed', async () => {
    let finish: (v: SendOutcome) => void = () => {};
    const s = source({ send: () => new Promise<SendOutcome>((r) => { finish = r; }) });
    render(view(s, fake()));
    await openMenu();
    const c = await item(strings['menu.compact']);
    await act(async () => { fireEvent.click(c); fireEvent.click(c); });
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(s.send).toHaveBeenCalledWith({ text: '/compact' });
    await act(async () => { finish({ k: 'done' }); });
    expect(toasts).toEqual([]);
  });
  it('the capability is read again when it is pressed: a chat that stopped allowing Compact gets no send', async () => {
    let allowed = true;
    const s = source({ cap: (act2) => (act2 === 'compact' && !allowed ? { ok: false, reason: 'closed' } : { ok: true }) });
    render(view(s, fake()));
    await openMenu();
    const c = await item(strings['menu.compact']);
    allowed = false; // no re-render: the item on screen is still the old one
    await act(async () => { fireEvent.click(c); });
    expect(s.send).not.toHaveBeenCalled();
  });
  it('a running chat is allowed (it queues like a follow-up): the same one send', async () => {
    const s = source({ facts: { ...ACTIVE, turn: true, state: 'running' } });
    render(view(s, fake()));
    await openMenu();
    await userEvent.click(await item(strings['menu.compact']));
    expect(s.send).toHaveBeenCalledWith({ text: '/compact' });
  });
  it('a refusal says it was not sent; the gate refusal says why; a lost answer says it may not have been', async () => {
    for (const [out, title] of [
      [{ k: 'refused', code: 'bad_request' } as SendOutcome, strings['compact.refused']],
      [{ k: 'refused', code: 'gate_parked' } as SendOutcome, strings['compact.parked']],
      [{ k: 'unknown' } as SendOutcome, strings['compact.unknown']],
    ] as const) {
      toasts.length = 0;
      const s = source({ send: () => Promise.resolve(out) });
      const r = render(view(s, fake()));
      await openMenu();
      await userEvent.click(await item(strings['menu.compact']));
      await flush();
      expect(toasts.map((t) => t.title)).toEqual([title]);
      r.unmount();
    }
  });
});

describe('Close: availability', () => {
  it('a read-only chat is disabled with the reason; an active one is enabled', async () => {
    const r = render(view(source({ facts: FACTS, send: false }), fake()));
    await openMenu();
    const c = await item(strings['menu.close']);
    expect(c).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(sv['sv.why.read_only']);
    r.unmount();
    render(view(source(), fake()));
    await openMenu();
    expect(await item(strings['menu.close'])).not.toHaveAttribute('aria-disabled', 'true');
  });
  it('an already closed chat, a chat whose computer is not shown and a Bot reference are disabled', async () => {
    const r1 = render(view(source({ facts: { ...ACTIVE, state: 'closed' } }), fake()));
    await openMenu();
    expect(await item(strings['menu.close'])).toHaveAttribute('aria-disabled', 'true');
    r1.unmount();
    const r2 = render(view(source(), undefined));
    await openMenu();
    expect(await item(strings['menu.close'])).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(strings['menu.noComputer']);
    r2.unmount();
    render(view(source({ ref: { bot: 'b1' } }), fake()));
    await openMenu();
    expect(await item(strings['menu.close'])).toHaveAttribute('aria-disabled', 'true');
  });
  it('the dialog names its overlay while open (layout.overlayId)', async () => {
    render(view(source(), fake()));
    expect(document.querySelector('[data-hub-overlay="ai-chat-close"]')).toBeNull();
    expect(await openClose()).toHaveAttribute('data-hub-overlay', 'ai-chat-close');
  });
});

describe('Close: the loops sentence', () => {
  const text = async () => (await openClose()).textContent ?? '';
  it('reads the chat\'s loops once, for this chat and realm', async () => {
    const a = fake();
    render(view(source(), a));
    await openClose();
    await flush();
    expect(a.loops).toHaveBeenCalledTimes(1);
    expect(a.loops).toHaveBeenCalledWith('s-1', 'global');
  });
  it('names the loops still scheduled (running, paused, firing): singular and plural; ended ones are not counted', async () => {
    const one = render(view(source(), fake({ loops: () => Promise.resolve(loopsOf('running', 'ended', 'expired', 'stopped', 'error')) })));
    expect(await text()).toContain('Its 1 loop stops too.');
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
    one.unmount();
    render(view(source(), fake({ loops: () => Promise.resolve(loopsOf('running', 'paused', 'firing')) })));
    expect(await text()).toContain('Its 3 loops stop too.');
  });
  it('zero proven: no loop sentence', async () => {
    render(view(source(), fake({ loops: () => Promise.resolve(loopsOf()) })));
    const t = await text();
    await flush();
    expect(screen.getByRole('alertdialog').textContent).not.toMatch(/loop/i);
    expect(t).toBeDefined();
  });
  it.each([
    ['a failed read', () => Promise.resolve(err('failed', 500))], ['a lost read', () => Promise.resolve(err('pending', 0))],
    ['an incomplete page', () => Promise.resolve(ok({ items: [], meta: { total: 4 } }))], ['no items', () => Promise.resolve(ok({ meta: { total: 0 } }))],
    ['a loop of another chat', () => Promise.resolve(ok({ items: [{ id: 'l', state: 'running', session_id: 's-9' }], meta: { total: 1 } }))],
    ['a loop in a state we do not know', () => Promise.resolve(loopsOf('sleeping'))],
  ])('%s: "if it has any", never "no loops"', async (_n, loops) => {
    render(view(source(), fake({ loops })));
    await openClose();
    await flush();
    expect(screen.getByRole('alertdialog').textContent).toContain(strings['close.loops.unknown']);
  });
  it('Close waits for the loops read: disabled while it is out, enabled after', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ loops: () => new Promise<Settled<unknown>>((r) => { finish = r; }) });
    render(view(source(), a));
    const d = await openClose();
    expect(isOff(go(d))).toBe(true);
    expect(d.textContent).toContain(strings['close.loops.reading']);
    await act(async () => { fireEvent.click(go(d)); });
    expect(a.close).not.toHaveBeenCalled();
    await act(async () => { finish(loopsOf('running')); });
    expect(isOff(go(d))).toBe(false);
  });
  it('a loops answer for a dialog that is gone changes nothing (another chat, or closed)', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ loops: () => new Promise<Settled<unknown>>((r) => { finish = r; }) });
    const r = render(view(source(), a));
    await openClose();
    r.rerender(view(source({ sid: 's-2', ref: { ...REF, sid: 's-2' } }), a));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await act(async () => { finish(loopsOf('running')); });
    const d = await openClose();
    expect(d.textContent).not.toContain('Its 1 loop');
  });
});

describe('Close: the request', () => {
  it('sends once with the chat\'s own id and realm; the host hears it once; the dialog closes', async () => {
    const a = fake(), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await act(async () => { fireEvent.click(go(d)); fireEvent.click(go(d)); });
    await flush();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(a.close).toHaveBeenCalledWith('s-1', 'global');
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('a refusal keeps the dialog, says so, the host hears nothing, and another try is allowed', async () => {
    let n = 0;
    const a = fake({ close: () => Promise.resolve(++n === 1 ? err('failed', 403, 'forbidden') : ok({ status: 'ok' })) }), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    expect(within(d).getByText(strings['close.refused'])).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
    await userEvent.click(go(d));
    await flush();
    expect(a.close).toHaveBeenCalledTimes(2);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
  it('a 404 "not live" is not "deleted": the chat is read back, and one that is closed already is closed', async () => {
    const a = fake({ close: () => Promise.resolve(err('failed', 404, 'not_found')), read: () => Promise.resolve(readOf()) }), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('a 404 "not live" and a chat the agent cannot find: neutral words, the host hears nothing', async () => {
    const a = fake({ close: () => Promise.resolve(err('failed', 404, 'not_found')), read: () => Promise.resolve(err('failed', 404, 'not_found')) }), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    expect(within(d).getByText(strings['close.gone'])).toBeInTheDocument();
    expect(strings['close.gone']).not.toMatch(/no longer exists|deleted/i);
    expect(onClosed).not.toHaveBeenCalled();
  });
  it('a 404 "not live" whose read cannot say stays unknown: locked, Check again', async () => {
    const a = fake({ close: () => Promise.resolve(err('failed', 404, 'not_found')), read: () => Promise.resolve(err('failed', 500)) }), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(isOff(go(d))).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
  });
  it.each([['no status', {}], ['a failed status', { status: 'failed' }], ['an array', []]])('a 200 with %s is not proof: locked, Check again', async (_n, body) => {
    const a = fake({ close: () => Promise.resolve(ok(body)) }), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(isOff(go(d))).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
  });
});

describe('Close: the route\'s {status:ok} is not proof that the chat is closed', () => {
  const sendOk = async (a: Fake, onClosed: () => void) => {
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    return d;
  };
  it('the chat is read back after the answer, once, through the same api, for the same chat', async () => {
    const a = fake({ read: () => Promise.resolve(readOf()) }), onClosed = vi.fn();
    await sendOk(a, onClosed);
    expect(a.read).toHaveBeenCalledTimes(1);
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(onClosed).toHaveBeenCalledWith(ID1);
  });
  it.each([
    ['the daemon summary says attached', readOf({ attached: true, attached_clients: 1 })],
    ['another client is attached', readOf({ attached: true, attached_clients: 3 })],
    ['this gateway still holds a live chat that has no turn yet', readOf({ live: true, started: false }, { attached: true, started: {} })],
    ['this gateway\'s hub still holds it', readOf({}, { attached: true })],
  ])('%s: "still open", the host hears nothing, and Close can be pressed again', async (_n, read) => {
    const a = fake({ read: () => Promise.resolve(read) }), onClosed = vi.fn();
    const d = await sendOk(a, onClosed);
    expect(within(d).getByText(strings['close.open'])).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
    expect(isOff(go(d))).toBe(false);
  });
  it.each([
    ['a lost read', err('pending', 0)], ['a failed read', err('failed', 500)], ['another chat', readOf({}, {}) && ok({ session: { id: 's-9' } })],
    ['channels that disagree', readOf({ attached: false }, { attached: true })], ['a malformed top-level flag', readOf({}, { attached: 'yes' })],
  ])('%s: unknown, locked on Check again, the host hears nothing', async (_n, read) => {
    const a = fake({ read: () => Promise.resolve(read) }), onClosed = vi.fn();
    const d = await sendOk(a, onClosed);
    expect(checkBtn(d)).toBeInTheDocument();
    expect(isOff(go(d))).toBe(true);
    expect(onClosed).not.toHaveBeenCalled();
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('a gone chat after the answer: neutral words, the host hears nothing', async () => {
    const a = fake({ read: () => Promise.resolve(err('failed', 404, 'not_found')) }), onClosed = vi.fn();
    const d = await sendOk(a, onClosed);
    expect(within(d).getByText(strings['close.gone'])).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
  });
  it('the read-back that could not say is settled later by Check again, which tells the host once', async () => {
    let n = 0;
    const a = fake({ read: () => Promise.resolve(++n === 1 ? err('pending', 0) : readOf()) }), onClosed = vi.fn();
    const d = await sendOk(a, onClosed);
    await userEvent.click(checkBtn(d));
    await flush();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID1);
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('while the read-back is out the dialog is busy and cannot send again', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ read: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    await act(async () => { fireEvent.click(go(d)); });
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
    await act(async () => { finish(readOf()); });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});

describe('Close: a lost answer', () => {
  const lost = (read?: () => Promise<Settled<unknown>>) => fake({ close: () => Promise.resolve(err('pending', 0, 'network')), ...(read ? { read } : {}) });
  const sendLost = async () => { const d = await openClose(); await flush(); await userEvent.click(go(d)); await flush(); return d; };

  it('is never called done: the dialog stays locked on Check again, nothing is sent again, the host hears nothing', async () => {
    const a = lost(), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await sendLost();
    expect(isOff(go(d))).toBe(true);
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
  });
  it('Check again proves it only when the agent says nothing is attached', async () => {
    const a = lost(), onClosed = vi.fn();
    a.read.mockResolvedValueOnce(err('failed', 500));
    render(view(source(), a, { onClosed }));
    const d = await sendLost();
    await userEvent.click(checkBtn(d));
    await flush();
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    a.read.mockResolvedValueOnce(ok({ session: { id: 's-1' } }));
    await userEvent.click(checkBtn(d));
    await flush();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('a chat still attached after a lost answer: "still open", not closed, and Close can be pressed again', async () => {
    const a = lost(() => Promise.resolve(ok({ session: { id: 's-1', attached: true, attached_clients: 1 } }))), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await sendLost();
    await userEvent.click(checkBtn(d));
    await flush();
    expect(within(d).getByText(strings['close.open'])).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
    expect(isOff(go(d))).toBe(false);
  });
  it('a read that names another chat, a gone chat or a contradiction proves nothing', async () => {
    for (const [r, onClosedCalls, text] of [
      [ok({ session: { id: 's-9' } }), 0, ''],
      [ok({ session: { id: 's-1', attached: false, attached_clients: 2 } }), 0, ''],
      [err('failed', 404, 'not_found'), 0, strings['close.gone']],
    ] as const) {
      cleanup(); cl = createCloseAttempts();
      const a = lost(() => Promise.resolve(r)), onClosed = vi.fn();
      render(view(source(), a, { onClosed }));
      const d = await sendLost();
      await userEvent.click(checkBtn(d));
      await flush();
      expect(onClosed).toHaveBeenCalledTimes(onClosedCalls);
      if (text) expect(within(d).getByText(text)).toBeInTheDocument();
    }
  });
});

describe('a close attempt belongs to its chat, not to the dialog', () => {
  const S1 = () => source();
  const S2 = () => source({ sid: 's-2' });
  const lost = (read?: () => Promise<Settled<unknown>>) => fake({ close: () => Promise.resolve(err('pending', 0, 'network')), ...(read ? { read } : {}) });
  const sendLost = async () => { const d = await openClose(); await flush(); await userEvent.click(go(d)); await flush(); return d; };

  it('dismissing a lost-answer dialog and reopening restores it locked: only Check again, no second request, no loops read', async () => {
    const a = lost();
    render(view(S1(), a));
    const d = await sendLost();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    a.loops.mockClear();
    const d2 = await openClose();
    expect(isOff(go(d2))).toBe(true);
    expect(checkBtn(d2)).toBeInTheDocument();
    await act(async () => { fireEvent.click(go(d2)); });
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(a.loops).not.toHaveBeenCalled();
  });
  it('the record outlives the menu: a menu mounted again for the same chat restores it locked', async () => {
    const a = lost();
    const first = render(view(S1(), a));
    await sendLost();
    first.unmount();
    render(view(S1(), a));
    const d = await openClose();
    expect(isOff(go(d))).toBe(true);
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('a menu mounted again while the request is out follows it: a refusal after the remount is shown', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ close: () => new Promise<Settled<unknown>>((r) => { finish = r; }) });
    const first = render(view(S1(), a));
    const d = await openClose();
    await flush();
    await act(async () => { fireEvent.click(go(d)); });
    first.unmount();
    render(view(S1(), a));
    const d2 = await openClose();
    expect(isOff(go(d2))).toBe(true);
    await act(async () => { finish(err('failed', 403, 'forbidden')); });
    expect(within(d2).getByText(strings['close.refused'])).toBeInTheDocument();
  });
  it('another chat closes the dialog and refuses its confirm; the first chat\'s attempt is not the second\'s', async () => {
    const a = lost(), b = fake();
    const r = render(view(S1(), a));
    await sendLost();
    r.rerender(view(S2(), b));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const d = await openClose();
    await flush();
    expect(isOff(go(d))).toBe(false);
    await userEvent.click(go(d));
    await flush();
    expect(b.close).toHaveBeenCalledWith('s-2', 'global');
    expect(a.close).toHaveBeenCalledTimes(1);
  });
  it('a late answer after the chat changed still reaches the host once, and cannot touch the new chat\'s dialog', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ close: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), b = fake(), onClosed = vi.fn();
    const r = render(view(S1(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await act(async () => { fireEvent.click(go(d)); });
    r.rerender(view(S2(), b, { onClosed }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await act(async () => { finish(ok({ status: 'ok' })); });
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID1); // the chat the close was made for, not the current one
    expect(b.read).not.toHaveBeenCalled();
  });
  it('a late answer reaches the callback of the chat it was made for even when the menu was mounted again with others', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ close: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), b = fake();
    const first = vi.fn(), second = vi.fn();
    const r = render(view(S1(), a, { onClosed: first }));
    const d = await openClose();
    await flush();
    await act(async () => { fireEvent.click(go(d)); });
    r.unmount();
    render(view(S2(), b, { onClosed: second }));
    await act(async () => { finish(ok({ status: 'ok' })); });
    const heard = [...first.mock.calls, ...second.mock.calls];
    expect(heard).toEqual([[ID1]]);
  });
  it('a Check again from an older toast tells the host about ITS chat, after the menu moved to another', async () => {
    const a = lost(() => Promise.resolve(ok({ session: { id: 's-1' } }))), b = fake(), onClosed = vi.fn();
    const r = render(view(S1(), a, { onClosed }));
    const d = await sendLost();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const sticky = toasts.find((t) => t.action);
    r.rerender(view(S2(), b, { onClosed }));
    if (sticky?.action) await act(async () => { await sticky.action!.onAction(); });
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID1);
  });
  it('the same chat id on another computer: a late completion names the ORIGINAL computer, never the one now shown', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ close: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), b = fake();
    const first = vi.fn(), second = vi.fn();
    const orion = () => source({ ref: { ...REF, computer: 'orion.9999' } });
    const r = render(view(source(), a, { onClosed: first }));
    const d = await openClose();
    await flush();
    await act(async () => { fireEvent.click(go(d)); });
    r.rerender(view(orion(), b, { onClosed: second })); // same sid and realm, another computer, the menu stays mounted
    await act(async () => { finish(ok({ status: 'ok' })); });
    const heard = [...first.mock.calls, ...second.mock.calls];
    expect(heard).toEqual([[{ computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' }]]);
    expect(b.read).not.toHaveBeenCalled();
  });
  it('a target replaced under the same chat: the completion carries the target the close went to', async () => {
    const a = fake(), onClosed = vi.fn();
    render(view(source(), a, { onClosed }));
    const d = await openClose();
    await flush();
    await userEvent.click(go(d));
    await flush();
    expect(onClosed.mock.calls[0]![0]).toMatchObject({ target: 'api' });
    expect(Object.keys(onClosed.mock.calls[0]![0]).sort()).toEqual(['computer', 'realm', 'sid', 'target']);
  });
  it('the computer replaced while the confirm is open: the dialog closes and nothing is sent', async () => {
    const a = fake(), b = fake();
    const r = render(view(source(), a));
    await openClose();
    await flush();
    r.rerender(view(source({ ref: { ...REF, computer: 'orion.9999' } }), b));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.close).not.toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
  });
  it('losing the capability closes the dialog and sends nothing', async () => {
    let allowed = true;
    const a = fake();
    const s = source({ cap: (act2) => (act2 === 'close' && !allowed ? { ok: false, reason: 'closed' } : { ok: true }) });
    const r = render(view(s, a));
    await openClose();
    await flush();
    allowed = false;
    r.rerender(view(source({ cap: () => ({ ok: false, reason: 'closed' }) }), a));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.close).not.toHaveBeenCalled();
  });
  it('a Check again handed out by an older dialog reads ITS chat through ITS api, not the current one', async () => {
    const a = lost(() => Promise.resolve(ok({ session: { id: 's-1' } }))), b = fake(), onClosed = vi.fn();
    const r = render(view(S1(), a, { onClosed }));
    const d = await sendLost();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const sticky = toasts.find((t) => t.action);
    r.rerender(view(S2(), b, { onClosed }));
    if (sticky?.action) await act(async () => { await sticky.action!.onAction(); });
    expect(b.read).not.toHaveBeenCalled();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
  });
  it('a Check again from the dialog and one from an older toast, at once, tell the host once', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const reads: Array<(v: Settled<unknown>) => void> = [];
    const a = lost(() => new Promise<Settled<unknown>>((r) => { reads.push(r); })), onClosed = vi.fn();
    render(view(S1(), a, { onClosed }));
    const d = await sendLost();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const sticky = toasts.find((t) => t.action);
    const d2 = await openClose();
    await act(async () => { fireEvent.click(checkBtn(d2)); void sticky?.action?.onAction(); });
    expect(reads.length).toBe(2);
    finish = reads[0]!;
    await act(async () => { finish(ok({ session: { id: 's-1' } })); reads[1]!(ok({ session: { id: 's-1' } })); });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
  it('the capability is read again when Close is pressed: a chat that stopped being closable gets no request', async () => {
    let closable = true;
    const a = fake();
    const s = source({ cap: () => (closable ? { ok: true } : { ok: false, reason: 'closed' }) });
    render(view(s, a));
    const d = await openClose();
    await flush();
    closable = false; // no re-render: the button on screen is still the old one
    await act(async () => { fireEvent.click(go(d)); });
    expect(a.close).not.toHaveBeenCalled();
  });
  it('two Check agains at once tell the host once', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = lost(() => new Promise<Settled<unknown>>((r) => { finish = r; })), onClosed = vi.fn();
    render(view(S1(), a, { onClosed }));
    const d = await sendLost();
    await act(async () => { fireEvent.click(checkBtn(d)); fireEvent.click(checkBtn(d)); });
    await act(async () => { finish(ok({ session: { id: 's-1' } })); });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
