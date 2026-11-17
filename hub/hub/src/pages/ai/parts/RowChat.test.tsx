// RowChat: the ⋯ menu of a chat list row, Rename, Close and Delete. A row has no source: the agent is the judge. The attempt
// records are the open chat's own (same key), every row goes to ITS OWN computer, and every completion names the identity
// it was made for (attempts bind to their target).
import { boot } from '@core/test/env';
import type { Target } from '@core';
import type { Settled } from '@core/providers/types';
import { ActionMenu, can, type CapFacts, type ConversationSource, type ConvSnapshot } from '@kit';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { onAction: () => unknown } }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c); return 'k'; } }));
import strings from './ConvMenu.strings.en.json';
import { ConvMenu } from './ConvMenu';
import { attemptKey, createCloseAttempts, type CloseAttempts } from './closeAttempts';
import { createDeleteAttempts, type DeleteAttempts } from './deleteAttempts';
import { createTrimAttempts, type TrimAttempts } from './trimAttempts';
import { createRenameAttempts, type RenameAttempts } from './renameAttempts';
import type { ChatRow } from './chats.logic';
import { RenameDialog } from './RenameDialog';
import { listShows, useRowChat, type RowChatOptions, type RowChatWhere } from './RowChat';
import type { agent } from '@core';

const tgt = (id: string): Target => ({ project: { id: 'p1' }, container: { id } }) as Target;
const ATLAS = tgt('c-atlas'), BOREALIS = tgt('c-borealis');
const row = (o: Partial<ChatRow> = {}): ChatRow => ({ key: 'global/s-1', sid: 's-1', realm: 'global', title: 'Fix the cart total', cwd: '/w', at: 1, claude: false, group: 'today', mark: null, rowState: false, ...o }) as ChatRow;
const ROW_A = row({ computer: 'c-atlas', handle: 'atlas.1234' });
const ROW_B = row({ computer: 'c-borealis', handle: 'borealis.5678' });
const ID_A = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'c-atlas' };
const ID_B = { computer: 'borealis.5678', realm: 'global', sid: 's-1', target: 'c-borealis' };

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const err = (kind: 'pending' | 'failed', status: number, code = ''): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const LOST = err('pending', 0, 'network');
type Fake = agent.SessionApi & { delete: ReturnType<typeof vi.fn>; rename: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn>; loops: ReturnType<typeof vi.fn> };
const DONE = ok({ status: 'ok', closed: true, hard: true });
const fake = (o: { del?: (...a: unknown[]) => Promise<Settled<unknown>>; rename?: (...a: unknown[]) => Promise<Settled<unknown>>; close?: (...a: unknown[]) => Promise<Settled<unknown>>; read?: () => Promise<Settled<unknown>> } = {}): Fake => ({
  delete: vi.fn(o.del ?? (() => Promise.resolve(DONE))),
  rename: vi.fn(o.rename ?? ((_id: unknown, name: unknown) => Promise.resolve(ok({ status: 'ok', name })))),
  close: vi.fn(o.close ?? (() => Promise.resolve(ok({ status: 'ok' })))),
  read: vi.fn(o.read ?? (() => Promise.resolve(ok({ session: { id: 's-1' } })))),
  loops: vi.fn(() => Promise.resolve(ok({ items: [], meta: { total: 0 } }))),
}) as unknown as Fake;

let ra: RenameAttempts, ca: CloseAttempts, da: DeleteAttempts, ta: TrimAttempts;
beforeEach(() => { boot(); ra = createRenameAttempts(); ca = createCloseAttempts(); da = createDeleteAttempts(); ta = createTrimAttempts(); toasts.length = 0; });
afterEach(() => cleanup());

const whereOf = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-atlas' ? { target: ATLAS, handle: 'atlas.1234', scope: 'global' } : r.computer === 'c-borealis' ? { target: BOREALIS, handle: 'borealis.5678', scope: 'global' } : null);
interface HostProps { rows: ChatRow[]; apis: Record<string, Fake>; opts?: Partial<RowChatOptions> }
function Host({ rows, apis, opts }: HostProps) {
  const rc = useRowChat({ where: whereOf, apiFor: (t) => apis[t.container.id]!, attempts: ra, closeAttempts: ca, deleteAttempts: da, trimAttempts: ta, ...opts });
  return (
    <>
      {rows.map((r) => <ActionMenu key={r.computer ?? r.key} label={`Row ${r.computer}`} items={rc.actions(r)} />)}
      {rc.dialogs}
    </>
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const openMenu = async (computer: string) => { await userEvent.click(await screen.findByRole('button', { name: `Row ${computer}` })); };
const item = (name: string) => screen.findByRole('menuitem', { name: new RegExp(name) });
const dlg = () => screen.findByRole('alertdialog');
const renameGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['rename.go'] });
const closeGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['close.go'] });
const deleteGo = (d: HTMLElement) => within(d).getByRole('button', { name: strings['delete.go'] });
const checkBtn = (d: HTMLElement) => within(d).getByRole('button', { name: /check again/i });
const field = (d: HTMLElement) => within(d).getByRole('textbox', { name: strings['rename.label'] });
const type = async (d: HTMLElement, text: string) => { const f = field(d); await userEvent.clear(f); await userEvent.type(f, text); };
const startRename = async (computer: string, text = 'New name') => {
  await openMenu(computer);
  await userEvent.click(await item(strings['menu.rename']));
  const d = await dlg();
  await type(d, text);
  await userEvent.click(renameGo(d));
  return d;
};
const startClose = async (computer: string) => {
  await openMenu(computer);
  await userEvent.click(await item(strings['menu.close']));
  const d = await dlg();
  await waitFor(() => expect(closeGo(d)).not.toBeDisabled());
  await userEvent.click(closeGo(d));
  return d;
};

describe('the row menu', () => {
  it('offers Rename, Close and Delete (danger, last) and nothing else; opening a dialog sends nothing', async () => {
    const a = fake();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    expect((await screen.findAllByRole('menuitem')).map((x) => x.textContent ?? '')).toEqual([
      expect.stringContaining(strings['menu.rename']), expect.stringContaining(strings['menu.close']), expect.stringContaining(strings['menu.delete']),
    ]);
    await userEvent.click(await item(strings['menu.rename']));
    expect(await dlg()).toBeInTheDocument();
    expect(a.rename).not.toHaveBeenCalled();
    expect(a.close).not.toHaveBeenCalled();
    expect(a.delete).not.toHaveBeenCalled();
  });
  it('a row whose computer is not shown has no actions', () => {
    const seen: unknown[] = [];
    function Probe() { const rc = useRowChat({ where: whereOf }); seen.push(rc.actions(row({ computer: 'c-gone', handle: 'gone.0000' }))); return null; }
    render(<Probe />);
    expect(seen[0]).toEqual([]);
  });
  it('Rename starts with the row title and refuses the same title', async () => {
    const a = fake();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    expect(field(d)).toHaveValue('Fix the cart total');
    expect(renameGo(d)).toBeDisabled();
  });
  it('Cancel closes the dialog and sends nothing', async () => {
    const a = fake();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.rename).not.toHaveBeenCalled();
  });
});

describe('a row sends to its own computer, once, with the full identity', () => {
  it('Rename: the request goes to the row\'s own computer\'s api with the chat id, the name and its realm; the host hears the identity once', async () => {
    const a = fake(), b = fake(), onRenamed = vi.fn();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ onRenamed }} />);
    await startRename('c-borealis', 'Shop');
    await flush();
    expect(b.rename).toHaveBeenCalledTimes(1);
    expect(b.rename).toHaveBeenCalledWith('s-1', 'Shop', 'global');
    expect(a.rename).not.toHaveBeenCalled();
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith('Shop', ID_B);
  });
  it('Close: sent once to the row\'s own computer; the host hears the identity once after the proof read', async () => {
    const a = fake(), b = fake(), onClosed = vi.fn();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ onClosed }} />);
    await startClose('c-borealis');
    await flush();
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledWith('s-1', 'global');
    expect(b.read).toHaveBeenCalledWith('s-1', 'global');
    expect(a.close).not.toHaveBeenCalled();
    expect(a.read).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID_B);
  });
  it('the same chat id on two computers is two targets: a lost rename on one does not lock the other', async () => {
    const a = fake(), b = fake({ rename: () => Promise.resolve(LOST) });
    const r = render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} />);
    const d = await startRename('c-borealis');
    await flush();
    expect(checkBtn(d)).toBeInTheDocument();
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    r.rerender(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d2 = await dlg();
    await type(d2, 'Other');
    expect(renameGo(d2)).not.toBeDisabled();
    await userEvent.click(renameGo(d2));
    await flush();
    expect(a.rename).toHaveBeenCalledWith('s-1', 'Other', 'global');
    expect(b.rename).toHaveBeenCalledTimes(1);
  });
  it('a Check again handed out for one computer names that computer, whichever dialog is open now', async () => {
    const a = fake(), b = fake({ rename: () => Promise.resolve(LOST), read: () => Promise.resolve(ok({ session: { id: 's-1', name: 'Shop' } })) }), onRenamed = vi.fn();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ onRenamed }} />);
    const d = await startRename('c-borealis', 'Shop');
    await flush();
    // The person leaves it unsettled: the dialog closes and the kit hands out a sticky Check again.
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const sticky = toasts.find((x) => x.action);
    expect(sticky).toBeDefined();
    // Atlas's own dialog is open when the answer comes.
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d2 = await dlg();
    await act(async () => { await sticky!.action!.onAction(); });
    expect(b.read).toHaveBeenCalledWith('s-1', 'global');
    expect(a.read).not.toHaveBeenCalled();
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith('Shop', ID_B);
    expect(field(d2)).toHaveValue('Fix the cart total');
    expect(within(d2).queryByRole('button', { name: /check again/i })).toBeNull();
    expect(a.rename).not.toHaveBeenCalled();
  });
});

describe('the rename dialog of a row keeps its own guards', () => {
  const CHAT_A = { key: 'atlas.1234|global|s-1|c-atlas', ...ID_A };
  const CHAT_B = { key: 'atlas.1234|global|s-2|c-atlas', ...ID_A, sid: 's-2' };
  const dialog = (chat: typeof CHAT_A | null, a: Fake, extra: Partial<React.ComponentProps<typeof RenameDialog>> = {}) => (
    <RenameDialog isOpen onClose={() => {}} chat={chat} calls={a} allowed={() => true} unavailable="" current="Fix the cart total" attempts={ra} returnFocus={() => null} {...extra} />
  );

  it('two presses at once send one request (the record is read again at the press)', async () => {
    const a = fake({ rename: () => new Promise<Settled<unknown>>(() => {}) });
    render(dialog(CHAT_A, a));
    const d = await dlg();
    await type(d, 'Once');
    await act(async () => { fireEvent.click(renameGo(d)); fireEvent.click(renameGo(d)); });
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('a dialog bound to one chat sends nothing for another chat shown under it', async () => {
    const a = fake();
    const r = render(dialog(CHAT_A, a));
    const d = await dlg();
    await type(d, 'Mine');
    r.rerender(dialog(CHAT_B, a));
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
  });
  it('a dialog reopened for a lost rename shows the name that was sent, locked', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) });
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    const d = await startRename('c-atlas', 'Shop');
    await flush();
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d2 = await dlg();
    expect(field(d2)).toHaveValue('Shop');
    expect(renameGo(d2)).toBeDisabled();
  });
});

describe('a dialog that has not sent is bound to the list it opened in', () => {
  const only = (computer: 'c-atlas' | 'c-borealis' | null, scope = 'global') => (r: ChatRow): RowChatWhere | null =>
    (computer && r.computer === computer ? { target: computer === 'c-atlas' ? ATLAS : BOREALIS, handle: computer === 'c-atlas' ? 'atlas.1234' : 'borealis.5678', scope } : null);
  const stage = (a: Fake, b: Fake, where: (r: ChatRow) => RowChatWhere | null) => <Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ where }} />;

  it('the list moves to another computer under an open Rename: the dialog closes and Rename sends nothing', async () => {
    const a = fake(), b = fake();
    const r = render(stage(a, b, only('c-atlas')));
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'Mine');
    r.rerender(stage(a, b, only('c-borealis')));
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    expect(b.rename).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('the row\'s computer is no longer followed under an open Close: the dialog closes and Close sends nothing', async () => {
    const a = fake(), b = fake();
    const r = render(stage(a, b, only('c-atlas')));
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const d = await dlg();
    await waitFor(() => expect(closeGo(d)).not.toBeDisabled());
    r.rerender(stage(a, b, only(null)));
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('the same row now resolves to another container (the list moved computers): nothing is sent', async () => {
    const a = fake(), b = fake();
    const toBorealis = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-atlas' ? { target: BOREALIS, handle: 'borealis.5678', scope: 'global' } : null);
    const r = render(stage(a, b, only('c-atlas')));
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'Mine');
    r.rerender(stage(a, b, toBorealis));
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    expect(b.rename).not.toHaveBeenCalled();
  });
  it('the list moves on after the last render and before the press: the press reads the answer then', async () => {
    const a = fake(), b = fake();
    let here = true;
    const flip = (r: ChatRow): RowChatWhere | null => (here ? only('c-atlas')(r) : null);
    render(stage(a, b, flip));
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'Mine');
    here = false; // no render in between
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
  });
  it('the list changes realm under an open dialog: nothing is sent', async () => {
    const a = fake(), b = fake();
    const r = render(stage(a, b, only('c-atlas', 'global')));
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'Mine');
    r.rerender(stage(a, b, only('c-atlas', 'acme')));
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
  });
  it('a request that already left keeps its record and its Api when the list moves on', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) }), b = fake();
    const r = render(stage(a, b, only('c-atlas')));
    await startRename('c-atlas', 'Shop');
    await flush();
    r.rerender(stage(a, b, only('c-borealis')));
    const held = ra.get(attemptKey(ID_A));
    expect(held?.phase).toBe('unknown');
    expect(held?.calls).toBe(a);
  });
});

describe('the attempt key is the chat on its container, not the computer\'s name', () => {
  it('a computer renamed while a rename is unknown: the row still finds the record and sends nothing again', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) });
    const renamed = (_r: ChatRow): RowChatWhere | null => ({ target: ATLAS, handle: 'atlas-new.1234', scope: 'global' });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startRename('c-atlas', 'Shop');
    await flush();
    r.unmount();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ where: renamed }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    expect(renameGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('the same chat on the same container has one key whatever the handle; another container has another', () => {
    const base = { realm: 'global', sid: 's-1', target: 'c-atlas' };
    expect(attemptKey({ ...base, computer: 'atlas.1234' })).toBe(attemptKey({ ...base, computer: 'renamed.1234' }));
    expect(attemptKey({ ...base, computer: 'atlas.1234' })).not.toBe(attemptKey({ ...base, computer: 'atlas.1234', target: 'c-borealis' }));
    expect(attemptKey({ ...base, computer: 'atlas.1234', realm: 'acme' })).not.toBe(attemptKey({ ...base, computer: 'atlas.1234' }));
    // A test Api names no container: the handle stands in.
    expect(attemptKey({ ...base, computer: 'a.1', target: 'api' })).not.toBe(attemptKey({ ...base, computer: 'b.2', target: 'api' }));
  });
  it('the open chat\'s menu on the same container under another handle finds the row\'s unknown rename', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startRename('c-atlas', 'Shop');
    await flush();
    r.unmount();
    const FACTS2: CapFacts = {
      mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
      turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
      prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
    };
    const snap2: ConvSnapshot = { facts: FACTS2, title: 'Fix the cart total', gates: [], blocks: [], meta: { computer: 'atlas', realm: 'Personal', status: 'idle' } };
    const src: ConversationSource = { kind: 'session', ref: { computer: 'atlas-new.1234', realm: 'global', sid: 's-1' }, snapshot: () => snap2, subscribe: () => () => {}, watch: () => {}, can: (x) => can(x, FACTS2) };
    render(<ConvMenu attempts={ra} closeAttempts={ca} source={src} target={ATLAS} api={a} />);
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] }));
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    expect(renameGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
  });
});

describe('a finished request refreshes only the list that shows its chat', () => {
  const chat = { computer: 'atlas.1234', realm: 'acme', sid: 's-1', target: 'c-atlas' };
  it('same computer and realm, or an all-realms list: yes; another computer or another realm: no', () => {
    expect(listShows('acme', 'c-atlas', chat)).toBe(true);
    expect(listShows('all', 'c-atlas', chat)).toBe(true);
    expect(listShows('global', 'c-atlas', chat)).toBe(false);
    expect(listShows('acme', 'c-borealis', chat)).toBe(false);
    expect(listShows('all', 'c-borealis', chat)).toBe(false);
  });
});

describe('focus returns to the row\'s menu button', () => {
  it('Cancel on a row\'s Rename returns focus to the row\'s actions button', async () => {
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': fake() }} />);
    const btn = await screen.findByRole('button', { name: 'Row c-atlas' });
    await userEvent.click(btn);
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(btn));
  });
});

describe('Close from a row: the agent is the judge, the proof is a read', () => {
  it('a chat that is not live (404) and reads back closed is done, once, never a bare done', async () => {
    const a = fake({ close: () => Promise.resolve(err('failed', 404, 'not_found')), read: () => Promise.resolve(ok({ session: { id: 's-1' } })) }), onClosed = vi.fn();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ onClosed }} />);
    await startClose('c-atlas');
    await flush();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(a.read).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID_A);
  });
  it('a 404 whose read cannot say is not closed: unknown, locked, Check again, the host hears nothing', async () => {
    const a = fake({ close: () => Promise.resolve(err('failed', 404, 'not_found')), read: () => Promise.resolve(LOST) }), onClosed = vi.fn();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ onClosed }} />);
    const d = await startClose('c-atlas');
    await flush();
    expect(onClosed).not.toHaveBeenCalled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(closeGo(d)).toBeDisabled();
  });
  it('a chat still attached somewhere else ends "still open", and the host hears nothing', async () => {
    const a = fake({ read: () => Promise.resolve(ok({ session: { id: 's-1', attached: true } })) }), onClosed = vi.fn();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ onClosed }} />);
    const d = await startClose('c-atlas');
    await flush();
    expect(onClosed).not.toHaveBeenCalled();
    expect(d.textContent).toContain(strings['close.open']);
  });
});

describe('a row and the open chat share the attempt records', () => {
  const FACTS: CapFacts = {
    mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
    turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
    prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
  };
  const snap: ConvSnapshot = { facts: FACTS, title: 'Fix the cart total', gates: [], blocks: [], meta: { computer: 'atlas', realm: 'Personal', status: 'idle' } };
  const source = (): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's-1' }, snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, FACTS) });
  const menu = (a: Fake) => <ConvMenu attempts={ra} closeAttempts={ca} source={source()} target={ATLAS} api={a} />;
  const openChatMenu = async (name: string) => { await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] })); await userEvent.click(await item(name)); return dlg(); };

  it('a rename lost from a row locks the open chat\'s Rename: Check again only, nothing sent again', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startRename('c-atlas');
    await flush();
    r.unmount();
    render(menu(a));
    const d = await openChatMenu(strings['menu.rename']);
    expect(renameGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('a rename lost from the open chat locks the row\'s Rename', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) });
    const r = render(menu(a));
    const d0 = await openChatMenu(strings['menu.rename']);
    await type(d0, 'Mine');
    await userEvent.click(renameGo(d0));
    await flush();
    r.unmount();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    expect(renameGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('a close lost from a row locks the open chat\'s Close, and the reverse', async () => {
    const a = fake({ close: () => Promise.resolve(LOST) });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startClose('c-atlas');
    await flush();
    r.unmount();
    const r2 = render(menu(a));
    const d = await openChatMenu(strings['menu.close']);
    expect(closeGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.close).toHaveBeenCalledTimes(1);
    r2.unmount();
    ca = createCloseAttempts();
    const b = fake({ close: () => Promise.resolve(LOST) });
    const r3 = render(menu(b));
    const d3 = await openChatMenu(strings['menu.close']);
    await waitFor(() => expect(closeGo(d3)).not.toBeDisabled());
    await userEvent.click(closeGo(d3));
    await flush();
    r3.unmount();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': b }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const d4 = await dlg();
    expect(closeGo(d4)).toBeDisabled();
    expect(checkBtn(d4)).toBeInTheDocument();
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  it('the open chat\'s Close still follows its own source: a chat that stopped being closable gets no request from the menu', async () => {
    const a = fake();
    let closable = true;
    const s = { ...source(), can: (act2: string) => (act2 === 'close' && !closable ? ({ ok: false, reason: 'closed' } as const) : can(act2 as 'close', FACTS)) } as ConversationSource;
    render(<ConvMenu attempts={ra} closeAttempts={ca} source={s} target={ATLAS} api={a} />);
    const d = await openChatMenu(strings['menu.close']);
    await waitFor(() => expect(closeGo(d)).not.toBeDisabled());
    closable = false; // no re-render: only the press-time read can see it
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
  });
  it('the open chat\'s Rename still follows its own source at press time', async () => {
    const a = fake();
    let renamable = true;
    const s = { ...source(), can: (act2: string) => (act2 === 'rename' && !renamable ? ({ ok: false, reason: 'closed' } as const) : can(act2 as 'rename', FACTS)) } as ConversationSource;
    render(<ConvMenu attempts={ra} closeAttempts={ca} source={s} target={ATLAS} api={a} />);
    const d = await openChatMenu(strings['menu.rename']);
    await type(d, 'Mine');
    renamable = false;
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
  });
});

describe('Delete from a row', () => {
  const startDelete = async (computer: string) => {
    await openMenu(computer);
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    await userEvent.click(deleteGo(d));
    return d;
  };
  it('is sent once to the row\'s own computer with the chat id and realm; the host hears the identity once, as deleted', async () => {
    const a = fake(), b = fake(), onDeleted = vi.fn();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ onDeleted }} />);
    await startDelete('c-borealis');
    await flush();
    expect(b.delete).toHaveBeenCalledTimes(1);
    expect(b.delete).toHaveBeenCalledWith('s-1', 'global');
    expect(a.delete).not.toHaveBeenCalled();
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(ID_B, 'deleted');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('a 404 says nothing was deleted and tells the host to refresh that chat\'s list (not_found), never "deleted"', async () => {
    const a = fake({ del: () => Promise.resolve(err('failed', 404, 'not_found')) }), onDeleted = vi.fn();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ onDeleted }} />);
    const d = await startDelete('c-atlas');
    await flush();
    expect(within(d).getByText(strings['delete.missing'])).toBeInTheDocument();
    expect(onDeleted).toHaveBeenCalledWith(ID_A, 'not_found');
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
  it('a lost answer is unknown with Check again; the read goes to the SAME computer\'s Api and finds the chat: not deleted', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) }), b = fake(), onDeleted = vi.fn();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ onDeleted }} />);
    const d = await startDelete('c-atlas');
    await flush();
    await act(async () => { fireEvent.click(checkBtn(d)); });
    await flush();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(b.read).not.toHaveBeenCalled();
    expect(within(d).getByText(strings['delete.there'])).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('the same chat id on two computers is two targets: a lost delete on one does not lock the other', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) }), b = fake();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} />);
    await startDelete('c-atlas');
    await flush();
    cleanup();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} />);
    await startDelete('c-borealis');
    await flush();
    expect(b.delete).toHaveBeenCalledTimes(1);
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('a dialog that has not sent is bound to its list: the row\'s computer is no longer followed, and Delete sends nothing', async () => {
    const a = fake();
    const only = (on: boolean) => (r: ChatRow): RowChatWhere | null => (on && r.computer === 'c-atlas' ? { target: ATLAS, handle: 'atlas.1234', scope: 'global' } : null);
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ where: only(true) }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    r.rerender(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ where: only(false) }} />);
    await act(async () => { fireEvent.click(deleteGo(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
  it('the list moves on after the last render and before the press: the press reads the answer then, and Delete sends nothing', async () => {
    let here = true;
    const a = fake();
    const flip = (r: ChatRow): RowChatWhere | null => (here && r.computer === 'c-atlas' ? { target: ATLAS, handle: 'atlas.1234', scope: 'global' } : null);
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ where: flip }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    here = false; // no render in between
    await act(async () => { fireEvent.click(deleteGo(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
    expect(da.get(attemptKey(ID_A))).toBeUndefined();
  });
  it('a computer renamed while a delete is unknown: the row still finds the record and sends nothing again', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) });
    const renamed = (_r: ChatRow): RowChatWhere | null => ({ target: ATLAS, handle: 'atlas-new.1234', scope: 'global' });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startDelete('c-atlas');
    await flush();
    r.unmount();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} opts={{ where: renamed }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    expect(deleteGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
});

describe('a row\'s Delete waits for an unsettled Rename or Close of the same chat', () => {
  it('a rename lost from the row blocks the row\'s Delete: the confirm is off and nothing is sent', async () => {
    const a = fake({ rename: () => Promise.resolve(LOST) });
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startRename('c-atlas');
    await flush();
    cleanup();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    expect(deleteGo(d)).toBeDisabled();
    await act(async () => { fireEvent.click(deleteGo(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
  });
  it('a close lost from the row blocks the row\'s Delete too', async () => {
    const a = fake({ close: () => Promise.resolve(LOST) });
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await startClose('c-atlas');
    await flush();
    cleanup();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    expect(deleteGo(d)).toBeDisabled();
    expect(a.delete).not.toHaveBeenCalled();
  });
});

describe('a row and the open chat share the delete record', () => {
  const FACTS: CapFacts = {
    mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
    turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
    prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
  };
  const snap: ConvSnapshot = { facts: FACTS, title: 'Fix the cart total', gates: [], blocks: [], meta: { computer: 'atlas', realm: 'Personal', status: 'idle' } };
  const source = (): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's-1' }, snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, FACTS) });
  const menu = (a: Fake) => <ConvMenu attempts={ra} closeAttempts={ca} deleteAttempts={da} source={source()} target={ATLAS} api={a} />;
  const openChatDelete = async () => { await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] })); await userEvent.click(await item(strings['menu.delete'])); return dlg(); };

  it('a delete lost from a row locks the open chat\'s Delete: Check again only, nothing sent again', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    await userEvent.click(deleteGo(await dlg()));
    await flush();
    r.unmount();
    render(menu(a));
    const d = await openChatDelete();
    expect(deleteGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('a delete lost from the open chat locks the row\'s Delete', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) });
    const r = render(menu(a));
    await userEvent.click(deleteGo(await openChatDelete()));
    await flush();
    r.unmount();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    expect(deleteGo(d)).toBeDisabled();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(a.delete).toHaveBeenCalledTimes(1);
  });
  it('the open chat\'s Delete follows its own source at press time: a chat that stopped allowing it gets no request', async () => {
    let allowed = true;
    const a = fake();
    const src: ConversationSource = { ...source(), can: (x) => (x === 'delete' && !allowed ? { ok: false, reason: 'turn_in_flight' } : { ok: true }) };
    render(<ConvMenu attempts={ra} closeAttempts={ca} deleteAttempts={da} source={src} target={ATLAS} api={a} />);
    const d = await openChatDelete();
    allowed = false;
    await act(async () => { fireEvent.click(deleteGo(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
  });
});

describe('a row\'s Rename and Close wait for an unsettled Delete of the same chat (the reverse lock)', () => {
  const FACTS: CapFacts = {
    mode: 'active', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
    turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
    prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
  };
  const snap: ConvSnapshot = { facts: FACTS, title: 'Fix the cart total', gates: [], blocks: [], meta: { computer: 'atlas', realm: 'Personal', status: 'idle' } };
  const source = (): ConversationSource => ({ kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's-1' }, snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a) => can(a, FACTS) });
  const menu = (a: Fake) => <ConvMenu attempts={ra} closeAttempts={ca} deleteAttempts={da} source={source()} target={ATLAS} api={a} />;
  const menuOpen = async (name: string) => { await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] })); await userEvent.click(await item(name)); return dlg(); };

  it('a delete lost from the open chat blocks the row\'s Rename and Close: confirms off, nothing sent', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) });
    const r = render(menu(a));
    await userEvent.click(deleteGo(await menuOpen(strings['menu.delete'])));
    await flush();
    expect(da.get(attemptKey(ID_A))?.phase).toBe('unknown');
    r.unmount();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'Another name');
    expect(renameGo(d)).toBeDisabled();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    cleanup();
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const c = await dlg();
    await waitFor(() => expect(within(c).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(c)).toBeDisabled();
    await act(async () => { fireEvent.click(closeGo(c)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
  });
  it('a delete lost from a row blocks the open chat\'s Rename and Close', async () => {
    const a = fake({ del: () => Promise.resolve(LOST) });
    const r = render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    await userEvent.click(deleteGo(await dlg()));
    await flush();
    r.unmount();
    render(menu(a));
    const d = await menuOpen(strings['menu.rename']);
    await type(d, 'Another name');
    expect(renameGo(d)).toBeDisabled();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
    cleanup();
    render(menu(a));
    const c = await menuOpen(strings['menu.close']);
    await waitFor(() => expect(within(c).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(c)).toBeDisabled();
    expect(a.close).not.toHaveBeenCalled();
  });
  it('a delete of the same chat id on another computer does not block this row', async () => {
    const a = fake(), b = fake({ del: () => Promise.resolve(LOST) });
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} />);
    await openMenu('c-borealis');
    await userEvent.click(await item(strings['menu.delete']));
    await userEvent.click(deleteGo(await dlg()));
    await flush();
    expect(da.get(attemptKey(ID_B))?.phase).toBe('unknown');
    cleanup();
    render(<Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'Fine name');
    expect(renameGo(d)).not.toBeDisabled();
  });
});

// Edge cases: the row host with a request in flight, a dialog dismissed, another row's
// dialog open, a computer renamed or gone, and a container that names nothing.
describe('a request that left keeps its identity whatever the host shows now', () => {
  const hold = () => { let release: (r: Settled<unknown>) => void = () => {}; const p = new Promise<Settled<unknown>>((res) => { release = res; }); return { p, release }; };
  const cancel = (d: HTMLElement) => userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
  const both = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-atlas' ? { target: ATLAS, handle: 'atlas.1234', scope: 'global' } : r.computer === 'c-borealis' ? { target: BOREALIS, handle: 'borealis.5678', scope: 'global' } : null);
  const stage = (a: Fake, b: Fake, onRenamed: () => void, onClosed: () => void, where = both) =>
    <Host rows={[ROW_A, ROW_B]} apis={{ 'c-atlas': a, 'c-borealis': b }} opts={{ where, onRenamed, onClosed }} />;
  // The kit refuses Cancel while a request is out, so a dialog that is still sending is dismissed the way a real host does it: its computer
  // leaves the list under it (the dialog closes itself), then the list shows it again.
  const lose = (c: 'c-atlas' | 'c-borealis') => (r: ChatRow): RowChatWhere | null => (r.computer === c ? null : both(r));
  const dropAndRestore = async (r: { rerender: (ui: React.ReactElement) => void }, a: Fake, b: Fake, onRenamed: () => void, onClosed: () => void, c: 'c-atlas' | 'c-borealis') => {
    r.rerender(stage(a, b, onRenamed, onClosed, lose(c)));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    r.rerender(stage(a, b, onRenamed, onClosed));
  };

  it('(1) a delayed Rename answer while another row\'s Rename dialog is open names the ORIGINAL chat and leaves the open dialog alone', async () => {
    const g = hold(), a = fake({ rename: () => g.p }), b = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const r = render(stage(a, b, onRenamed, onClosed));
    await startRename('c-atlas', 'Shop');
    await flush();
    await dropAndRestore(r, a, b, onRenamed, onClosed, 'c-atlas');
    await openMenu('c-borealis');
    await userEvent.click(await item(strings['menu.rename']));
    const d2 = await dlg();
    await type(d2, 'Mine');
    await act(async () => { g.release(ok({ status: 'ok', name: 'Shop' })); });
    await flush();
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith('Shop', ID_A);
    expect(ra.get(attemptKey(ID_A))).toBeUndefined();
    expect(screen.getByRole('alertdialog')).toBe(d2);
    expect(field(d2)).toHaveValue('Mine');
    expect(renameGo(d2)).not.toBeDisabled();
    expect(b.rename).not.toHaveBeenCalled();
  });
  it('(1) a delayed Close answer while another row\'s Close dialog is open: the proof is read on ITS computer, the host hears the original chat, the open dialog is untouched', async () => {
    const g = hold(), a = fake({ close: () => g.p }), b = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const r = render(stage(a, b, onRenamed, onClosed));
    await startClose('c-atlas');
    await flush();
    await dropAndRestore(r, a, b, onRenamed, onClosed, 'c-atlas');
    await openMenu('c-borealis');
    await userEvent.click(await item(strings['menu.close']));
    const d2 = await dlg();
    await waitFor(() => expect(closeGo(d2)).not.toBeDisabled());
    await act(async () => { g.release(ok({ status: 'ok' })); });
    await flush();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(b.read).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID_A);
    expect(screen.getByRole('alertdialog')).toBe(d2);
    expect(closeGo(d2)).not.toBeDisabled();
    expect(b.close).not.toHaveBeenCalled();
  });

  it('(2) Close recovery across a computer-handle change: Check again proves the chat and names the handle captured at send', async () => {
    const a = fake({ close: () => Promise.resolve(LOST), read: () => Promise.resolve(ok({ session: { id: 's-1' } })) }), b = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const renamed = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-atlas' ? { target: ATLAS, handle: 'atlas-new.1234', scope: 'global' } : both(r));
    const r = render(stage(a, b, onRenamed, onClosed));
    const d = await startClose('c-atlas');
    await flush();
    expect(checkBtn(d)).toBeInTheDocument();
    await cancel(d);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    r.rerender(stage(a, b, onRenamed, onClosed, renamed));
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const d2 = await dlg();
    expect(closeGo(d2)).toBeDisabled();
    expect(a.close).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(checkBtn(d2)); });
    await flush();
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID_A);
    expect(a.close).toHaveBeenCalledTimes(1);
  });

  it('(3) a Rename answered after its computer left the list still tells the host the original chat, and the record clears', async () => {
    const g = hold(), b = fake({ rename: () => g.p }), a = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const gone = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-borealis' ? null : both(r));
    const r = render(stage(a, b, onRenamed, onClosed));
    await startRename('c-borealis', 'Shop');
    await flush();
    r.rerender(stage(a, b, onRenamed, onClosed, gone));
    await act(async () => { g.release(ok({ status: 'ok', name: 'Shop' })); });
    await flush();
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith('Shop', ID_B);
    expect(ra.get(attemptKey(ID_B))).toBeUndefined();
    expect(a.rename).not.toHaveBeenCalled();
  });
  it('(3) a Close answered after its computer left the list is still proven through that computer\'s own Api', async () => {
    const g = hold(), b = fake({ close: () => g.p }), a = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const gone = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-borealis' ? null : both(r));
    const r = render(stage(a, b, onRenamed, onClosed));
    await startClose('c-borealis');
    await flush();
    r.rerender(stage(a, b, onRenamed, onClosed, gone));
    await act(async () => { g.release(ok({ status: 'ok' })); });
    await flush();
    expect(b.read).toHaveBeenCalledWith('s-1', 'global');
    expect(a.read).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledWith(ID_B);
    expect(ca.get(attemptKey(ID_B))).toBeUndefined();
  });

  it('(4) a Rename still sending when its dialog is dismissed and then lost becomes unknown: reopened it is locked on Check again, never sent twice', async () => {
    const g = hold(), a = fake({ rename: () => g.p, read: () => Promise.resolve(ok({ session: { id: 's-1', name: 'Shop' } })) }), b = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const r = render(stage(a, b, onRenamed, onClosed));
    await startRename('c-atlas', 'Shop');
    await flush();
    expect(ra.get(attemptKey(ID_A))?.phase).toBe('sending');
    await dropAndRestore(r, a, b, onRenamed, onClosed, 'c-atlas');
    await act(async () => { g.release(LOST); });
    await flush();
    expect(ra.get(attemptKey(ID_A))?.phase).toBe('unknown');
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d2 = await dlg();
    expect(renameGo(d2)).toBeDisabled();
    expect(field(d2)).toHaveValue('Shop');
    await act(async () => { fireEvent.click(checkBtn(d2)); });
    await flush();
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith('Shop', ID_A);
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('(4) a Close still sending when its dialog is dismissed and then lost becomes unknown: reopened it is locked on Check again', async () => {
    const g = hold(), a = fake({ close: () => g.p }), b = fake(), onRenamed = vi.fn(), onClosed = vi.fn();
    const r = render(stage(a, b, onRenamed, onClosed));
    await startClose('c-atlas');
    await flush();
    expect(ca.get(attemptKey(ID_A))?.phase).toBe('sending');
    await dropAndRestore(r, a, b, onRenamed, onClosed, 'c-atlas');
    await act(async () => { g.release(LOST); });
    await flush();
    expect(ca.get(attemptKey(ID_A))?.phase).toBe('unknown');
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const d2 = await dlg();
    expect(closeGo(d2)).toBeDisabled();
    expect(checkBtn(d2)).toBeInTheDocument();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(onClosed).not.toHaveBeenCalled();
  });
});

describe('a container that names nothing: the handle stands in for it in the key', () => {
  const T0 = tgt('');
  const ID_0A = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: '' };
  const ID_0B = { computer: 'borealis.5678', realm: 'global', sid: 's-1', target: '' };
  const none = (r: ChatRow): RowChatWhere | null => (r.computer === 'c-atlas' ? { target: T0, handle: 'atlas.1234', scope: 'global' } : r.computer === 'c-borealis' ? { target: T0, handle: 'borealis.5678', scope: 'global' } : null);

  it('the key of an empty target is "<empty>:<handle>|realm|sid": distinct per handle, distinct from a test Api\'s, equal across a re-render of the same handle', () => {
    expect(attemptKey(ID_0A)).toBe(':atlas.1234|global|s-1');
    expect(attemptKey(ID_0A)).not.toBe(attemptKey(ID_0B));
    expect(attemptKey(ID_0A)).not.toBe(attemptKey({ ...ID_0A, target: 'api' }));
    expect(attemptKey(ID_0A)).toBe(attemptKey({ ...ID_0A }));
  });
  it('a lost rename on one empty-container row locks that chat only: the other computer\'s row, same chat id, still renames', async () => {
    const a = fake({ rename: (_i: unknown, name: unknown) => Promise.resolve(name === 'Shop' ? LOST : ok({ status: 'ok', name })) });
    const r = render(<Host rows={[ROW_A, ROW_B]} apis={{ '': a }} opts={{ where: none }} />);
    const d = await startRename('c-atlas', 'Shop');
    await flush();
    expect(checkBtn(d)).toBeInTheDocument();
    expect(ra.get(':atlas.1234|global|s-1')?.phase).toBe('unknown');
    expect(ra.get(':borealis.5678|global|s-1')).toBeUndefined();
    await userEvent.click(within(d).getByRole('button', { name: /^cancel$/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    r.rerender(<Host rows={[ROW_A, ROW_B]} apis={{ '': a }} opts={{ where: none }} />);
    await openMenu('c-borealis');
    await userEvent.click(await item(strings['menu.rename']));
    const d2 = await dlg();
    await type(d2, 'Other');
    expect(renameGo(d2)).not.toBeDisabled();
    await userEvent.click(renameGo(d2));
    await flush();
    expect(a.rename).toHaveBeenCalledTimes(2);
    expect(a.rename).toHaveBeenLastCalledWith('s-1', 'Other', 'global');
    // The first chat is still locked, whichever row opens it again.
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d3 = await dlg();
    expect(renameGo(d3)).toBeDisabled();
    expect(checkBtn(d3)).toBeInTheDocument();
    expect(a.rename).toHaveBeenCalledTimes(2);
  });
});

describe('a row\'s Rename, Close and Delete wait for an unsettled Trim of the same chat (the reverse lock of the Trim)', () => {
  const trimRec = (a: Fake, phase: 'sending' | 'unknown', id = ID_A) => ({ key: attemptKey(id), chat: id, turn: 1, calls: a, phase }) as unknown as Parameters<TrimAttempts['set']>[0];
  const PHASES: Array<[string, 'unknown' | 'sending']> = [['an unknown Trim', 'unknown'], ['a Trim still sending', 'sending']];

  it.each(PHASES)('%s: the row\'s Rename is off and sends nothing', async (_n, phase) => {
    const a = fake();
    ta.set(trimRec(a, phase));
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'New name');
    expect(renameGo(d)).toBeDisabled();
    expect(within(d).getByText(strings['rename.busy'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
  });
  it.each(PHASES)('%s: the row\'s Close is off and sends nothing', async (_n, phase) => {
    const a = fake();
    ta.set(trimRec(a, phase));
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const d = await dlg();
    await waitFor(() => expect(within(d).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(d)).toBeDisabled();
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
  });
  it.each(PHASES)('%s: the row\'s Delete is off and sends nothing', async (_n, phase) => {
    const a = fake();
    ta.set(trimRec(a, phase));
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    expect(deleteGo(d)).toBeDisabled();
    await act(async () => { fireEvent.click(deleteGo(d)); });
    await flush();
    expect(a.delete).not.toHaveBeenCalled();
  });
  it('a Trim of another computer\'s chat does not block this row', async () => {
    const a = fake();
    ta.set(trimRec(a, 'unknown', ID_B));
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.delete']));
    const d = await dlg();
    expect(deleteGo(d)).not.toBeDisabled();
  });
});

describe('a row\'s Rename and Close wait for each other (the same chat)', () => {
  const renameRec = (a: Fake, phase: 'sending' | 'unknown') => ({ key: attemptKey(ID_A), chat: ID_A, sid: 's-1', realm: 'global', calls: a, name: 'x', phase }) as unknown as Parameters<RenameAttempts['set']>[0];
  const closeRec = (a: Fake, phase: 'sending' | 'unknown') => ({ key: attemptKey(ID_A), chat: ID_A, sid: 's-1', realm: 'global', calls: a, phase }) as unknown as Parameters<CloseAttempts['set']>[0];
  const PHASES: Array<[string, 'unknown' | 'sending']> = [['an unknown', 'unknown'], ['a still sending', 'sending']];

  it.each(PHASES)('%s Close: the row\'s Rename is off and sends nothing', async (_n, phase) => {
    const a = fake();
    ca.set(closeRec(a, phase));
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.rename']));
    const d = await dlg();
    await type(d, 'New name');
    expect(renameGo(d)).toBeDisabled();
    expect(within(d).getByText(strings['rename.busy'])).toBeInTheDocument();
    await act(async () => { fireEvent.click(renameGo(d)); });
    await flush();
    expect(a.rename).not.toHaveBeenCalled();
  });
  it.each(PHASES)('%s Rename: the row\'s Close is off and sends nothing', async (_n, phase) => {
    const a = fake();
    ra.set(renameRec(a, phase));
    render(<Host rows={[ROW_A]} apis={{ 'c-atlas': a }} />);
    await openMenu('c-atlas');
    await userEvent.click(await item(strings['menu.close']));
    const d = await dlg();
    await waitFor(() => expect(within(d).queryByText(strings['close.loops.reading'])).toBeNull());
    expect(closeGo(d)).toBeDisabled();
    expect(within(d).getByText(new RegExp(strings['close.busy']))).toBeInTheDocument();
    await act(async () => { fireEvent.click(closeGo(d)); });
    await flush();
    expect(a.close).not.toHaveBeenCalled();
  });
});
