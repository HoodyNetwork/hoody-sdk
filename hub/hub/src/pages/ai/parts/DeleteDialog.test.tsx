// DeleteDialog, mounted by ConvMenu: a hard delete is sent once; only {status:'ok', hard:true} is "deleted"; a lost
// answer is settled only by a read of the CAPTURED chat, and a read that cannot find the chat never claims it was deleted; a 404
// on the delete itself says nothing was deleted; 409 session_live is shown and never retried by itself. The attempt belongs to its
// chat (attemptKey), not to the dialog.
import { boot } from '@core/test/env';
import { ConfirmDialog, can, type Capability, type CapFacts, type ConversationSource, type ConvSnapshot } from '@kit';
import type { Settled } from '@core/providers/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import sv from '@kit/agent/SessionView.strings.en.json';
import strings from './ConvMenu.strings.en.json';
import { ConvMenu } from './ConvMenu';
import { attemptKey, createCloseAttempts, type CloseAttempts } from './closeAttempts';
import { createDeleteAttempts, type DeleteAttempts } from './deleteAttempts';
import { DeleteDialog } from './DeleteDialog';
import { createRenameAttempts, type RenameAttempts } from './renameAttempts';
import { createTrimAttempts, type TrimAttempts } from './trimAttempts';
import type { agent } from '@core';

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Fix the cart total', gates: [],
  blocks: [{ k: 'user', key: 'u1', text: 'Round the cart total half up.', at: 1 }],
  meta: { computer: 'atlas', realm: 'Personal', status: 'idle' },
};
const REF = { computer: 'atlas.1234', realm: 'global', sid: 's-1' };
const ID1 = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
const source = (o: { cap?: (a: string) => Capability; sid?: string } = {}): ConversationSource => ({
  kind: 'session', ref: { ...REF, sid: o.sid ?? REF.sid }, snapshot: () => SNAP, subscribe: () => () => {}, watch: () => {},
  can: (a) => (o.cap ? o.cap(a) : can(a, SNAP.facts)),
});

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const err = (kind: 'pending' | 'failed', status: number, code = ''): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const DONE = ok({ status: 'ok', closed: true, hard: true });
type Fake = agent.SessionApi & { delete: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
const fake = (o: { del?: (...a: unknown[]) => Promise<Settled<unknown>>; read?: (...a: unknown[]) => Promise<Settled<unknown>> } = {}): Fake => ({
  rename: vi.fn(() => Promise.resolve(ok({ status: 'ok', name: 'x' }))),
  read: vi.fn(o.read ?? (() => Promise.resolve(ok({ session: { id: 's-1' } })))),
  close: vi.fn(() => Promise.resolve(ok({ status: 'ok' }))),
  delete: vi.fn(o.del ?? (() => Promise.resolve(DONE))),
  loops: vi.fn(() => Promise.resolve(ok({ items: [], meta: { total: 0 } }))),
}) as unknown as Fake;

let dl: DeleteAttempts;
beforeEach(() => { boot(); dl = createDeleteAttempts(); rn = createRenameAttempts(); cl = createCloseAttempts(); tr = createTrimAttempts(); });
afterEach(() => cleanup());
let rn: RenameAttempts, cl: CloseAttempts, tr: TrimAttempts;
const view = (s: ConversationSource, a: Fake, extra: Record<string, unknown> = {}) =>
  <ConvMenu attempts={rn} closeAttempts={cl} deleteAttempts={dl} trimAttempts={tr} source={s} target={null} api={a} {...extra} />;

const openMenu = async () => { await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] })); };
const item = (name: string) => screen.findByRole('menuitem', { name: new RegExp(name) });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const openDelete = async () => { await openMenu(); await userEvent.click(await item(strings['menu.delete'])); return screen.findByRole('alertdialog'); };
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['delete.go'] });
const checkBtn = (d: HTMLElement) => within(d).getByRole('button', { name: /check again/i });
const press = async (d: HTMLElement) => { await act(async () => { fireEvent.click(go(d)); }); await flush(); };
const KEY = attemptKey(ID1);

describe('the Delete item', () => {
  it('is in the menu as a danger item that opens a dialog, after Close', async () => {
    render(view(source(), fake()));
    await openMenu();
    const names = (await screen.findAllByRole('menuitem')).map((e) => e.textContent ?? '');
    expect(names.findIndex((n) => n.includes(strings['menu.delete']))).toBeGreaterThan(names.findIndex((n) => n.includes(strings['menu.close'])));
    const d = await item(strings['menu.delete']);
    expect(d).not.toHaveAttribute('aria-disabled', 'true');
    expect(d.textContent).toContain('…');
  });
  it('is disabled with the capability\'s own reason when the table says no, and opens nothing', async () => {
    render(view(source({ cap: (a) => (a === 'delete' ? { ok: false, reason: 'turn_in_flight' } : { ok: true }) }), fake()));
    await openMenu();
    const d = await item(strings['menu.delete']);
    expect(d).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menu').textContent).toContain(sv['sv.why.turn_in_flight']);
    await userEvent.click(d);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('the dialog is a danger confirm of one short line', async () => {
    render(view(source(), fake()));
    const d = await openDelete();
    expect(d).toHaveAttribute('data-hub-overlay', 'ai-chat-delete');
    expect(d.textContent).toContain(strings['delete.body']);
    expect(strings['delete.body'].split('. ').length).toBeLessThanOrEqual(2);
    // The confirm looks like a destructive one: its button is not the plain confirm's (the kit draws tone="danger" its own way).
    const deleteLook = go(d).className;
    cleanup();
    render(<ConfirmDialog isOpen onOpenChange={() => {}} title="Plain" confirmLabel={strings['delete.go']} onConfirm={() => {}} />);
    expect(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['delete.go'] }).className).not.toBe(deleteLook);
  });
});

describe('sending', () => {
  it('sends one hard delete for the chat\'s own session and realm, however fast it is pressed; 200 hard:true is deleted and the host hears it once', async () => {
    const a = fake(), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await act(async () => { fireEvent.click(go(d)); fireEvent.click(go(d)); });
    await flush();
    expect(a.delete).toHaveBeenCalledTimes(1);
    expect(a.delete).toHaveBeenCalledWith('s-1', 'global');
    expect(a.read).not.toHaveBeenCalled(); // the documented success needs no proof read
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(ID1, 'deleted');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(dl.get(KEY)).toBeUndefined();
  });
  it('a 200 that is not {status:"ok", hard:true} is not "deleted": unknown, locked, Check again, the host is not told', async () => {
    const a = fake({ del: () => Promise.resolve(ok({ status: 'ok', closed: true, hard: false })) }), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await press(d);
    expect(onDeleted).not.toHaveBeenCalled();
    expect(dl.get(KEY)?.phase).toBe('unknown');
    expect(go(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
  });
  it('a 5xx is unknown too, and nothing is sent again', async () => {
    const a = fake({ del: () => Promise.resolve(err('pending', 503, 'session_terminating')) });
    render(view(source(), a));
    const d = await openDelete();
    await press(d);
    expect(dl.get(KEY)?.phase).toBe('unknown');
    expect(a.delete).toHaveBeenCalledTimes(1);
    expect(go(d)).toBeDisabled();
  });
  it('the capability is read again when Delete is pressed: a chat that stopped allowing it gets no send', async () => {
    let allowed = true;
    const a = fake();
    render(view(source({ cap: (act2) => (act2 === 'delete' && !allowed ? { ok: false, reason: 'turn_in_flight' } : { ok: true }) }), a));
    const d = await openDelete();
    allowed = false;
    await press(d);
    expect(a.delete).not.toHaveBeenCalled();
    expect(dl.get(KEY)).toBeUndefined();
  });
});

describe('what the answer says', () => {
  it('409 session_live: "still open somewhere else", nothing retried by itself, and a second press (the person\'s) sends again', async () => {
    const a = fake({ del: () => Promise.resolve(err('failed', 409, 'session_live')) }), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await press(d);
    expect(within(d).getByText(strings['delete.live'])).toBeInTheDocument();
    await flush();
    expect(a.delete).toHaveBeenCalledTimes(1);
    expect(a.read).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(dl.get(KEY)).toBeUndefined();
    expect(go(d)).not.toBeDisabled();
    await press(d);
    expect(a.delete).toHaveBeenCalledTimes(2);
  });
  it('404 on the delete: "could not be found for you, nothing was deleted", never "deleted"; the host refreshes; Delete cannot be pressed again', async () => {
    const a = fake({ del: () => Promise.resolve(err('failed', 404, 'not_found')) }), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await press(d);
    expect(within(d).getByText(strings['delete.missing'])).toBeInTheDocument();
    expect(strings['delete.missing']).toBe('This chat could not be found for you. Nothing was deleted.');
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(ID1, 'not_found');
    expect(go(d)).toBeDisabled();
    expect(a.read).not.toHaveBeenCalled();
  });
  it('any other refusal: the agent did not delete it, and Delete comes back', async () => {
    const a = fake({ del: () => Promise.resolve(err('failed', 403, 'forbidden')) }), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await press(d);
    expect(within(d).getByText(strings['delete.refused'])).toBeInTheDocument();
    expect(go(d)).not.toBeDisabled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('a lost answer is settled only by a read of the captured chat', () => {
  const lost = (read: () => Promise<Settled<unknown>>) => fake({ del: () => Promise.resolve(err('pending', 0)), read });
  it('the chat is still there: not deleted, said plainly, the host is not told, Delete comes back', async () => {
    const a = lost(() => Promise.resolve(ok({ session: { id: 's-1' } }))), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await press(d);
    expect(dl.get(KEY)?.phase).toBe('unknown');
    await act(async () => { fireEvent.click(checkBtn(d)); });
    await flush();
    expect(within(d).getByText(strings['delete.there'])).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(dl.get(KEY)).toBeUndefined();
    expect(a.delete).toHaveBeenCalledTimes(1);
    expect(go(d)).not.toBeDisabled();
  });
  it('the chat cannot be found: said as that ("may have been deleted"), never as deleted; the host refreshes with not_found; Delete stays off', async () => {
    const a = lost(() => Promise.resolve(err('failed', 404, 'not_found'))), onDeleted = vi.fn();
    render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await press(d);
    await act(async () => { fireEvent.click(checkBtn(d)); });
    await flush();
    expect(within(d).getByText(strings['delete.absent'])).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(ID1, 'not_found');
    expect(go(d)).toBeDisabled();
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('a read that cannot say (a failed read, or another chat\'s session) leaves it unknown with Check again', async () => {
    for (const r of [err('pending', 0), err('failed', 500), ok({ session: { id: 's-9' } }), ok({})]) {
      cleanup(); dl = createDeleteAttempts();
      const a = lost(() => Promise.resolve(r)), onDeleted = vi.fn();
      render(view(source(), a, { onDeleted }));
      const d = await openDelete();
      await press(d);
      await act(async () => { fireEvent.click(checkBtn(d)); });
      await flush();
      expect(dl.get(KEY)?.phase).toBe('unknown');
      expect(onDeleted).not.toHaveBeenCalled();
      expect(checkBtn(d)).toBeInTheDocument();
    }
  });
  it('Check again reads through the Api that SENT the delete, and the record survives the dialog and the menu', async () => {
    const a = lost(() => Promise.resolve(ok({ session: { id: 's-1' } }))), b = fake(), onDeleted = vi.fn();
    const v = render(view(source(), a, { onDeleted }));
    let d = await openDelete();
    await press(d);
    v.unmount();
    render(view(source(), b, { onDeleted }));
    d = await openDelete();
    expect(go(d)).toBeDisabled(); // the record is still held for this chat
    await act(async () => { fireEvent.click(checkBtn(d)); });
    await flush();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(b.read).not.toHaveBeenCalled();
    expect(b.delete).not.toHaveBeenCalled();
  });
  it('an answer that arrives after the dialog was dismissed still tells the host, with the identity it was made for, and clears the record', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ del: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), onDeleted = vi.fn();
    const v = render(view(source(), a, { onDeleted }));
    const d = await openDelete();
    await act(async () => { fireEvent.click(go(d)); });
    v.rerender(view(source({ sid: 's-2' }), a, { onDeleted }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(dl.get(KEY)).toBeDefined();
    await act(async () => { finish(DONE); });
    expect(onDeleted).toHaveBeenCalledWith(ID1, 'deleted');
    expect(dl.get(KEY)).toBeUndefined();
    expect(dl.get(attemptKey({ ...ID1, sid: 's-2' }))).toBeUndefined();
  });
});

describe('Delete waits for an unsettled Rename or Close of the same chat', () => {
  const api = () => fake();
  const renameRec = (a: Fake, key = KEY, phase: 'sending' | 'unknown' = 'unknown') => ({ key, chat: ID1, sid: 's-1', realm: 'global', calls: a, name: 'x', phase }) as unknown as Parameters<RenameAttempts['set']>[0];
  const closeRec = (a: Fake, key = KEY, phase: 'sending' | 'unknown' = 'unknown') => ({ key, chat: ID1, sid: 's-1', realm: 'global', calls: a, phase }) as unknown as Parameters<CloseAttempts['set']>[0];

  it.each([
    ['an unknown Rename', (a: Fake) => rn.set(renameRec(a))],
    ['a Rename still sending', (a: Fake) => rn.set(renameRec(a, KEY, 'sending'))],
    ['an unknown Close', (a: Fake) => cl.set(closeRec(a))],
    ['a Close still sending', (a: Fake) => cl.set(closeRec(a, KEY, 'sending'))],
  ])('%s of this chat: the confirm is off, one line says why, and nothing is sent', async (_n, hold) => {
    const a = api();
    hold(a);
    render(view(source(), a));
    const d = await openDelete();
    expect(go(d)).toBeDisabled();
    expect(within(d).getByText(new RegExp(strings['delete.busy']))).toBeInTheDocument();
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
    expect(dl.get(KEY)).toBeUndefined();
  });
  it('the record of another chat does not block', async () => {
    const a = api();
    rn.set(renameRec(a, attemptKey({ ...ID1, sid: 's-other' })));
    cl.set(closeRec(a, attemptKey({ ...ID1, target: 'other' })));
    render(view(source(), a));
    const d = await openDelete();
    expect(go(d)).not.toBeDisabled();
    expect(within(d).queryByText(new RegExp(strings['delete.busy']))).toBeNull();
    await press(d);
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('a record that settles while the dialog is open frees Delete, and one that appears blocks it', async () => {
    const a = api();
    render(view(source(), a));
    const d = await openDelete();
    expect(go(d)).not.toBeDisabled();
    const rec = renameRec(a);
    act(() => rn.set(rec));
    await waitFor(() => expect(go(d)).toBeDisabled());
    act(() => rn.end(rec as never, 'done'));
    await waitFor(() => expect(go(d)).not.toBeDisabled());
    await press(d);
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('the record is read again at the press: a block that appeared after the last render still refuses the send', async () => {
    const a = api();
    let blocked = false;
    const blocker = { get: (k: string) => (blocked && k === KEY ? {} : undefined), subscribe: () => () => {}, version: () => 0 };
    render(<DeleteDialog isOpen onClose={() => {}} chat={{ key: KEY, ...ID1 }} calls={a} allowed={() => true} unavailable="" attempts={dl} blockers={[blocker]} returnFocus={() => null} />);
    const d = await screen.findByRole('alertdialog');
    expect(go(d)).not.toBeDisabled();
    blocked = true; // no render in between
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
    expect(dl.get(KEY)).toBeUndefined();
  });
});

describe('Rename and Close wait for an unsettled Delete of the same chat (the reverse lock)', () => {
  const api = () => fake();
  const delRec = (a: Fake, key = KEY, phase: 'sending' | 'unknown' = 'unknown') => ({ key, chat: ID1, sid: 's-1', realm: 'global', calls: a, phase }) as unknown as Parameters<DeleteAttempts['set']>[0];
  const openRename = async () => { await openMenu(); await userEvent.click(await item(strings['menu.rename'])); return screen.findByRole('alertdialog'); };
  const openClose = async () => { await openMenu(); await userEvent.click(await item(strings['menu.close'])); return screen.findByRole('alertdialog'); };
  const renameGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['rename.go'] });
  const closeGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['close.go'] });
  const typeName = async (d: HTMLElement) => { const f = within(d).getByRole('textbox'); await userEvent.clear(f); await userEvent.type(f, 'A new name'); };

  it.each([['an unknown Delete', 'unknown' as const], ['a Delete still sending', 'sending' as const]])('%s of this chat: Rename is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    dl.set(delRec(a, KEY, phase));
    render(view(source(), a));
    const d = await openRename();
    await typeName(d);
    expect(renameGo(d)).toBeDisabled();
    expect(within(d).getByText(strings['rename.busy'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    expect(rn.get(KEY)).toBeUndefined();
  });
  it.each([['an unknown Delete', 'unknown' as const], ['a Delete still sending', 'sending' as const]])('%s of this chat: Close is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    dl.set(delRec(a, KEY, phase));
    render(view(source(), a));
    const d = await openClose();
    await waitFor(() => expect(within(d).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(d)).toBeDisabled();
    expect(within(d).getByText(new RegExp(strings['close.busy']))).toBeInTheDocument();
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
    expect(cl.get(KEY)).toBeUndefined();
  });
  it('a Delete lost from one mount blocks Rename and Close in a second mount of the same chat', async () => {
    const a = fake({ del: () => Promise.resolve(err('pending', 0, 'network')) });
    const first = render(view(source(), a));
    await press(await openDelete());
    expect(dl.get(KEY)?.phase).toBe('unknown');
    first.unmount();
    render(view(source(), a));
    const r = await openRename();
    await typeName(r);
    expect(renameGo(r)).toBeDisabled();
    await act(async () => { fireEvent.click(renameGo(r)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    cleanup();
    render(view(source(), a));
    const c = await openClose();
    await waitFor(() => expect(within(c).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(c)).toBeDisabled();
    await act(async () => { fireEvent.click(closeGo(c)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
  });
  it('the Delete record of another chat does not block', async () => {
    const a = api();
    dl.set(delRec(a, attemptKey({ ...ID1, sid: 's-other' })));
    render(view(source(), a));
    const d = await openRename();
    await typeName(d);
    expect(renameGo(d)).not.toBeDisabled();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('a Delete that settles while the dialog is open frees Rename, and one that appears blocks it', async () => {
    const a = api();
    render(view(source(), a));
    const d = await openRename();
    await typeName(d);
    expect(renameGo(d)).not.toBeDisabled();
    const rec = delRec(a);
    act(() => dl.set(rec));
    await waitFor(() => expect(renameGo(d)).toBeDisabled());
    act(() => dl.end(rec as never, 'failed', 'live'));
    await waitFor(() => expect(renameGo(d)).not.toBeDisabled());
  });
  it('the record is read again at the press: a Delete that appeared after the last render still refuses the Rename and the Close', async () => {
    const a = api();
    let blocked = false;
    const blocker = { get: (k: string) => (blocked && k === KEY ? {} : undefined), subscribe: () => () => {}, version: () => 0 };
    const chat = { key: KEY, ...ID1 };
    const { RenameDialog } = await import('./RenameDialog');
    const { CloseDialog } = await import('./CloseDialog');
    const r = render(<RenameDialog isOpen onClose={() => {}} chat={chat} calls={a} allowed={() => true} unavailable="" current="old" attempts={rn} blockers={[blocker]} returnFocus={() => null} />);
    const d = await screen.findByRole('alertdialog');
    await typeName(d);
    expect(renameGo(d)).not.toBeDisabled();
    blocked = true; // no render in between
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    expect(rn.get(KEY)).toBeUndefined();
    r.unmount();
    blocked = false;
    render(<CloseDialog isOpen onClose={() => {}} chat={chat} calls={a} allowed={() => true} unavailable="" attempts={cl} blockers={[blocker]} returnFocus={() => null} />);
    const c = await screen.findByRole('alertdialog');
    await waitFor(() => expect(within(c).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(c)).not.toBeDisabled();
    blocked = true;
    await act(async () => { fireEvent.click(closeGo(c)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
    expect(cl.get(KEY)).toBeUndefined();
  });
});

describe('Rename, Close and Delete wait for an unsettled Trim of the same chat (the reverse lock of the Trim)', () => {
  const api = () => fake();
  const trimRec = (a: Fake, key = KEY, phase: 'sending' | 'unknown' = 'unknown') => ({ key, chat: ID1, turn: 1, calls: a, phase }) as unknown as Parameters<TrimAttempts['set']>[0];
  const openRename = async () => { await openMenu(); await userEvent.click(await item(strings['menu.rename'])); return screen.findByRole('alertdialog'); };
  const openClose = async () => { await openMenu(); await userEvent.click(await item(strings['menu.close'])); return screen.findByRole('alertdialog'); };
  const renameGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['rename.go'] });
  const closeGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['close.go'] });
  const typeName = async (d: HTMLElement) => { const f = within(d).getByRole('textbox'); await userEvent.clear(f); await userEvent.type(f, 'A new name'); };
  const PHASES: Array<[string, 'unknown' | 'sending']> = [['an unknown Trim', 'unknown'], ['a Trim still sending', 'sending']];

  it.each(PHASES)('%s of this chat: Rename is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    tr.set(trimRec(a, KEY, phase));
    render(view(source(), a));
    const d = await openRename();
    await typeName(d);
    expect(renameGo(d)).toBeDisabled();
    expect(within(d).getByText(strings['rename.busy'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    expect(rn.get(KEY)).toBeUndefined();
  });
  it.each(PHASES)('%s of this chat: Close is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    tr.set(trimRec(a, KEY, phase));
    render(view(source(), a));
    const d = await openClose();
    await waitFor(() => expect(within(d).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(d)).toBeDisabled();
    expect(within(d).getByText(new RegExp(strings['close.busy']))).toBeInTheDocument();
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
    expect(cl.get(KEY)).toBeUndefined();
  });
  it.each(PHASES)('%s of this chat: Delete is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    tr.set(trimRec(a, KEY, phase));
    render(view(source(), a));
    const d = await openDelete();
    expect(go(d)).toBeDisabled();
    expect(within(d).getByText(new RegExp(strings['delete.busy']))).toBeInTheDocument();
    await act(async () => { fireEvent.click(go(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
    expect(dl.get(KEY)).toBeUndefined();
  });
  it('the Trim record of another chat does not block any of the three', async () => {
    const a = api();
    tr.set(trimRec(a, attemptKey({ ...ID1, sid: 's-other' })));
    render(view(source(), a));
    const d = await openDelete();
    expect(go(d)).not.toBeDisabled();
    expect(within(d).queryByText(new RegExp(strings['delete.busy']))).toBeNull();
    cleanup();
    render(view(source(), a));
    const r = await openRename();
    await typeName(r);
    expect(renameGo(r)).not.toBeDisabled();
    cleanup();
    render(view(source(), a));
    const c = await openClose();
    await waitFor(() => expect(within(c).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(c)).not.toBeDisabled();
  });
  it('a Trim that settles while the dialog is open frees it, and one that appears blocks it', async () => {
    const a = api();
    render(view(source(), a));
    const d = await openDelete();
    expect(go(d)).not.toBeDisabled();
    const rec = trimRec(a);
    act(() => tr.set(rec));
    await waitFor(() => expect(go(d)).toBeDisabled());
    act(() => tr.end(rec as never, 'failed', 'refused'));
    await waitFor(() => expect(go(d)).not.toBeDisabled());
  });
});

describe('Rename and Close wait for each other (the same chat)', () => {
  const api = () => fake();
  const renameRec = (a: Fake, phase: 'sending' | 'unknown', key = KEY) => ({ key, chat: ID1, sid: 's-1', realm: 'global', calls: a, name: 'x', phase }) as unknown as Parameters<RenameAttempts['set']>[0];
  const closeRec = (a: Fake, phase: 'sending' | 'unknown', key = KEY) => ({ key, chat: ID1, sid: 's-1', realm: 'global', calls: a, phase }) as unknown as Parameters<CloseAttempts['set']>[0];
  const openRename = async () => { await openMenu(); await userEvent.click(await item(strings['menu.rename'])); return screen.findByRole('alertdialog'); };
  const openClose = async () => { await openMenu(); await userEvent.click(await item(strings['menu.close'])); return screen.findByRole('alertdialog'); };
  const renameGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['rename.go'] });
  const closeGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['close.go'] });
  const typeName = async (d: HTMLElement) => { const f = within(d).getByRole('textbox'); await userEvent.clear(f); await userEvent.type(f, 'A new name'); };
  const PHASES: Array<[string, 'unknown' | 'sending']> = [['an unknown', 'unknown'], ['a still sending', 'sending']];

  it.each(PHASES)('%s Close of this chat: Rename is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    cl.set(closeRec(a, phase));
    render(view(source(), a));
    const d = await openRename();
    await typeName(d);
    expect(renameGo(d)).toBeDisabled();
    expect(within(d).getByText(strings['rename.busy'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    expect(rn.get(KEY)).toBeUndefined();
  });
  it.each(PHASES)('%s Rename of this chat: Close is off, one line says why, and nothing is sent', async (_n, phase) => {
    const a = api();
    rn.set(renameRec(a, phase));
    render(view(source(), a));
    const d = await openClose();
    await waitFor(() => expect(within(d).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(d)).toBeDisabled();
    expect(within(d).getByText(new RegExp(strings['close.busy']))).toBeInTheDocument();
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
    expect(cl.get(KEY)).toBeUndefined();
  });
  it('the other action\'s record on another chat blocks neither', async () => {
    const a = api();
    cl.set(closeRec(a, 'unknown', attemptKey({ ...ID1, sid: 's-other' })));
    rn.set(renameRec(a, 'unknown', attemptKey({ ...ID1, sid: 's-other' })));
    render(view(source(), a));
    const r = await openRename();
    await typeName(r);
    expect(renameGo(r)).not.toBeDisabled();
    cleanup();
    render(view(source(), a));
    const c = await openClose();
    await waitFor(() => expect(within(c).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(c)).not.toBeDisabled();
  });
});
