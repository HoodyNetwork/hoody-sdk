// ConvMenu: Rename and Export transcript. Items follow the capability table and say why when refused; Export works on a
// read-only chat; Rename is sent once, shows the title the agent stored, locks on a lost answer until a read settles it, and keeps
// the typed text on a refusal.
import { boot } from '@core/test/env';
import { can, type Capability, type CapFacts, type ConversationSource, type ConvSnapshot } from '@kit';
import type { Settled } from '@core/providers/types';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { onAction: () => unknown } }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c); return 'k'; } }));
import sv from '@kit/agent/SessionView.strings.en.json';
import strings from './ConvMenu.strings.en.json';
import { ConvMenu } from './ConvMenu';
import { EXPORT_BLOCK_MAX } from './exportMd.pure';
import { attemptKey } from './closeAttempts';
import { createRenameAttempts, type RenameAttempts } from './renameAttempts';
import type { agent, Target } from '@core';
import { isOff } from '@app/testing';

const FACTS: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'unknown', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: false, recovery: false, attachment: false, approver: 'missing' },
};
const SNAP: ConvSnapshot = {
  facts: FACTS, title: 'Fix the cart total', gates: [],
  blocks: [
    { k: 'user', key: 'u1', text: 'Round the cart total half up.', at: 1 },
    { k: 'reply', key: 'r1', text: 'Found it in cart.ts.', streaming: false, final: true, cost: null, at: 2 },
  ],
  meta: { computer: 'atlas', realm: 'Personal', status: 'idle' },
};
const REF = { computer: 'atlas.1234', realm: 'global', sid: 's-1' };
// The identity a completion carries: the computer, realm, session and target the attempt was made for ('api': the test api).
const ID1 = { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' };
const source = (o: { snap?: ConvSnapshot; active?: boolean; ref?: ConversationSource['ref'] } = {}): ConversationSource => {
  const snap = o.snap ?? SNAP;
  return {
    kind: 'session', ref: o.ref ?? REF, snapshot: () => snap, subscribe: () => () => {}, watch: () => {},
    can: (a) => (o.active ? ({ ok: true } as Capability) : can(a, snap.facts)),
  };
};

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const err = (kind: 'pending' | 'failed', status: number, code = ''): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
interface Fake { rename: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> }
const fake = (o: { rename?: (...a: unknown[]) => Promise<Settled<unknown>>; read?: () => Promise<Settled<unknown>> } = {}): Fake & agent.SessionApi => ({
  rename: vi.fn(o.rename ?? ((_i: unknown, name: unknown) => Promise.resolve(ok({ status: 'ok', name })))),
  read: vi.fn(o.read ?? (() => Promise.resolve(ok({ session: { id: 's-1' } })))),
}) as Fake & agent.SessionApi;

let att: RenameAttempts;
beforeEach(() => { boot(); att = createRenameAttempts(); toasts.length = 0; });
afterEach(() => cleanup());

const openMenu = async () => { await userEvent.click(await screen.findByRole('button', { name: strings['menu.label'] })); };
const item = (name: string) => screen.findByRole('menuitem', { name: new RegExp(name) });
// Items that share a reason show it once, as the menu's note: read the whole open menu.
const menuText = () => screen.getByRole('menu').textContent ?? '';
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 5)); });
const openRename = async () => { await openMenu(); await userEvent.click(await item(strings['menu.rename'])); return screen.findByRole('alertdialog'); };
const field = (d: HTMLElement) => within(d).getByRole('textbox') as HTMLInputElement;
const setName = (d: HTMLElement, v: string) => { fireEvent.change(field(d), { target: { value: v } }); };
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['rename.go'] });

describe('ConvMenu items follow the capability table', () => {
  it('a read-only chat: Rename is disabled and says why; Export is enabled', async () => {
    render(<ConvMenu attempts={att} source={source()} target={null} api={fake()} />);
    await openMenu();
    const r = await item(strings['menu.rename']);
    expect(r).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(sv['sv.why.read_only']);
    expect(await item(strings['menu.export'])).not.toHaveAttribute('aria-disabled', 'true');
  });
  it('forkWhole: the page\'s Fork this chat item comes first; without the prop the menu has no Fork', async () => {
    const fork = vi.fn();
    const useFork = () => ({ items: [{ id: 'fork-whole', label: 'Fork this chat', onAction: fork }] });
    const v = render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={fake()} forkWhole={useFork} />);
    await openMenu();
    const names = (await screen.findAllByRole('menuitem')).map((x) => x.textContent ?? '');
    expect(names[0]).toContain('Fork this chat');
    expect(names[1]).toContain(strings['menu.rename']);
    await userEvent.click(await item('Fork this chat'));
    expect(fork).toHaveBeenCalledTimes(1);
    v.unmount();
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={fake()} />);
    await openMenu();
    await item(strings['menu.rename']);
    expect(screen.queryByRole('menuitem', { name: /Fork this chat/ })).toBeNull();
  });
  it('an active chat: Rename is enabled', async () => {
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={fake()} />);
    await openMenu();
    expect(await item(strings['menu.rename'])).not.toHaveAttribute('aria-disabled', 'true');
  });
  it('an active chat whose computer is not shown cannot send: Rename says so', async () => {
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} />);
    await openMenu();
    const r = await item(strings['menu.rename']);
    expect(r).toHaveAttribute('aria-disabled', 'true');
    expect(menuText()).toContain(strings['menu.noComputer']);
  });
  it('a Bot reference has no session id: Rename is refused with its reason', async () => {
    render(<ConvMenu attempts={att} source={source({ active: true, ref: { bot: 'b1' } })} target={null} api={fake()} />);
    await openMenu();
    expect(await item(strings['menu.rename'])).toHaveAttribute('aria-disabled', 'true');
  });
  it('an empty chat has nothing to export, and says so', async () => {
    render(<ConvMenu attempts={att} source={source({ snap: { ...SNAP, blocks: [] } })} target={null} />);
    await openMenu();
    const e = await item(strings['menu.export']);
    expect(e).toHaveAttribute('aria-disabled', 'true');
    expect(e.textContent).toContain(strings['menu.nothing']);
  });
  it('the rename dialog names its overlay, only while it is open (layout.overlayId)', async () => {
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={fake()} />);
    expect(document.querySelector('[data-hub-overlay]')).toBeNull();
    const d = await openRename();
    expect(d).toHaveAttribute('data-hub-overlay', 'ai-chat-rename');
  });
});

describe('Export transcript', () => {
  it('saves one Markdown file named from the title, from the snapshot, with no request', async () => {
    const save = vi.fn(), a = fake();
    render(<ConvMenu attempts={att} source={source()} target={null} api={a} save={save} />);
    await openMenu();
    await userEvent.click(await item(strings['menu.export']));
    expect(save).toHaveBeenCalledTimes(1);
    const [name, text] = save.mock.calls[0] as [string, string];
    expect(name).toBe('Fix the cart total.md');
    expect(text.startsWith('# Fix the cart total\n')).toBe(true);
    expect(text).toContain('> Round the cart total half up.');
    expect(text).toContain('> Found it in cart.ts.');
    expect(a.rename).not.toHaveBeenCalled();
    expect(a.read).not.toHaveBeenCalled();
  });
  it('what the agent wrote cannot start a heading of the file, and controls are gone', async () => {
    const save = vi.fn();
    const snap: ConvSnapshot = { ...SNAP, blocks: [{ k: 'reply', key: 'r', text: '# Pwned\u001b[31m\n```\nx', streaming: false, final: true, cost: null, at: 1 }] };
    render(<ConvMenu attempts={att} source={source({ snap })} target={null} save={save} />);
    await openMenu();
    await userEvent.click(await item(strings['menu.export']));
    const text = (save.mock.calls[0] as [string, string])[1];
    expect(text.split('\n').filter((l) => /^#{1,6} /.test(l))).toEqual(['# Fix the cart total', '## Assistant']);
    expect(text).not.toContain('\u001b');
  });
  it('a reply cut by one character says so in the singular, by two in the plural', async () => {
    for (const [over, said] of [[1, '*1 character of this message is not included.*'], [2, '*2 characters of this message are not included.*']] as const) {
      const save = vi.fn();
      const snap: ConvSnapshot = { ...SNAP, blocks: [{ k: 'reply', key: 'r', text: 'x'.repeat(EXPORT_BLOCK_MAX + over), streaming: false, final: true, cost: null, at: 1 }] };
      render(<ConvMenu attempts={att} source={source({ snap })} target={null} save={save} />);
      await openMenu();
      await userEvent.click(await item(strings['menu.export']));
      expect((save.mock.calls[0] as [string, string])[1]).toContain(said);
      cleanup();
    }
  });
});

describe('Rename', () => {
  it('opens on the current title; Rename waits for a change', async () => {
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={fake()} />);
    const d = await openRename();
    expect(field(d).value).toBe('Fix the cart total');
    expect(isOff(go(d))).toBe(true);
    setName(d, 'Fix the cart total ');
    expect(isOff(go(d))).toBe(true);
    setName(d, 'Cart rounding');
    expect(isOff(go(d))).toBe(false);
  });
  it('sends once with the chat\'s own id and realm; the stored title is what the host hears, and the dialog closes', async () => {
    const a = fake({ rename: () => Promise.resolve(ok({ status: 'ok', name: 'Cart rounding (stored)' })) }), onRenamed = vi.fn();
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
    const d = await openRename();
    setName(d, '  Cart rounding  ');
    await userEvent.click(go(d));
    await flush();
    expect(a.rename).toHaveBeenCalledTimes(1);
    expect(a.rename).toHaveBeenCalledWith('s-1', 'Cart rounding', 'global');
    expect(onRenamed).toHaveBeenCalledWith('Cart rounding (stored)', ID1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('a second press before the answer sends nothing more', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ rename: () => new Promise<Settled<unknown>>((r) => { finish = r; }) });
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    const b = go(d);
    await act(async () => { fireEvent.click(b); fireEvent.click(b); fireEvent.keyDown(field(d), { key: 'Enter' }); });
    expect(a.rename).toHaveBeenCalledTimes(1);
    await act(async () => { finish(ok({ status: 'ok', name: 'Cart rounding' })); });
  });
  it('an empty name clears the title: "" is sent and the host hears null', async () => {
    const a = fake({ rename: () => Promise.resolve(ok({ status: 'ok', name: '' })) }), onRenamed = vi.fn();
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
    const d = await openRename();
    setName(d, '');
    await userEvent.click(go(d));
    await flush();
    expect(a.rename).toHaveBeenCalledWith('s-1', '', 'global');
    expect(onRenamed).toHaveBeenCalledWith(null, ID1);
  });
  it('a refusal keeps the dialog and the typed text, says so, and allows another try', async () => {
    let n = 0;
    const a = fake({ rename: () => Promise.resolve(++n === 1 ? err('failed', 400, 'bad_request') : ok({ status: 'ok', name: 'Cart rounding' })) }), onRenamed = vi.fn();
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    await userEvent.click(go(d));
    await flush();
    expect(within(d).getByText(strings['rename.bad'])).toBeInTheDocument();
    expect(field(d).value).toBe('Cart rounding');
    expect(onRenamed).not.toHaveBeenCalled();
    await userEvent.click(go(d));
    await flush();
    expect(a.rename).toHaveBeenCalledTimes(2);
    expect(onRenamed).toHaveBeenCalledWith('Cart rounding', ID1);
  });
  it('a chat that is gone says so and is not shown as renamed', async () => {
    const a = fake({ rename: () => Promise.resolve(err('failed', 404, 'not_found')) }), onRenamed = vi.fn();
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
    const d = await openRename();
    setName(d, 'x');
    await userEvent.click(go(d));
    await flush();
    expect(within(d).getByText(strings['rename.gone'])).toBeInTheDocument();
    expect(onRenamed).not.toHaveBeenCalled();
  });
  describe('a lost answer', () => {
    const lost = () => fake({ rename: () => Promise.resolve(err('pending', 0, 'network')) });
    it('is never called done: the dialog stays, nothing is sent again, the host hears nothing', async () => {
      const a = lost(), onRenamed = vi.fn();
      render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
      const d = await openRename();
      setName(d, 'Cart rounding');
      await userEvent.click(go(d));
      await flush();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(isOff(go(d))).toBe(true);
      expect(within(d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
      expect(a.rename).toHaveBeenCalledTimes(1);
      expect(onRenamed).not.toHaveBeenCalled();
    });
    it('Check again closes it only when the stored title is the one sent', async () => {
      const a = lost(), onRenamed = vi.fn();
      a.read.mockResolvedValueOnce(ok({ session: { id: 's-1', name: 'Old name' } }));
      render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
      const d = await openRename();
      setName(d, 'Cart rounding');
      await userEvent.click(go(d));
      await flush();
      await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
      await flush();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(onRenamed).not.toHaveBeenCalled();
      a.read.mockResolvedValueOnce(ok({ session: { id: 's-1', name: 'Cart rounding' } }));
      await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
      await flush();
      expect(a.read).toHaveBeenCalledWith('s-1', 'global');
      expect(onRenamed).toHaveBeenCalledWith('Cart rounding', ID1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(a.rename).toHaveBeenCalledTimes(1);
    });
    it('a read that fails proves nothing', async () => {
      const a = lost(), onRenamed = vi.fn();
      a.read.mockResolvedValue(err('failed', 500));
      render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
      const d = await openRename();
      setName(d, 'Cart rounding');
      await userEvent.click(go(d));
      await flush();
      await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
      await flush();
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(onRenamed).not.toHaveBeenCalled();
    });
    it('an unnamed chat read back proves a cleared title', async () => {
      const a = lost(), onRenamed = vi.fn();
      a.read.mockResolvedValue(ok({ session: { id: 's-1' } }));
      render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={onRenamed} />);
      const d = await openRename();
      setName(d, '');
      await userEvent.click(go(d));
      await flush();
      await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
      await flush();
      expect(onRenamed).toHaveBeenCalledWith(null, ID1);
    });
  });
  it('Cancel closes without a request and focus returns to the menu button', async () => {
    const a = fake();
    render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} />);
    const d = await openRename();
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.rename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: strings['menu.label'] })).toHaveFocus();
  });
});

// Attempts bind to their target.
describe('a rename attempt belongs to its chat, not to the dialog', () => {
  const S1 = (active = true) => source({ active });
  const S2 = (active = true) => source({ active, ref: { ...REF, sid: 's-2' } });
  const lost = () => fake({ rename: () => Promise.resolve(err('pending', 0, 'network')) });
  const sendLost = async (_a?: Fake & agent.SessionApi) => {
    const d = await openRename();
    setName(d, 'Cart rounding');
    await userEvent.click(go(d));
    await flush();
    return d;
  };

  it('dismissing a lost-answer dialog and reopening it restores it locked: only Check again, the same name, no second request', async () => {
    const a = lost();
    render(<ConvMenu attempts={att} source={S1()} target={null} api={a} />);
    const d = await sendLost(a);
    await userEvent.click(within(d).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const d2 = await openRename();
    expect(field(d2).value).toBe('Cart rounding');
    expect(isOff(field(d2))).toBe(true);
    expect(isOff(go(d2))).toBe(true);
    expect(within(d2).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    await act(async () => { fireEvent.click(go(d2)); fireEvent.keyDown(field(d2), { key: 'Enter' }); });
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('the record outlives the menu: a menu mounted again for the same chat restores it locked', async () => {
    const a = lost();
    const first = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} />);
    await sendLost(a);
    first.unmount();
    render(<ConvMenu attempts={att} source={S1()} target={null} api={a} />);
    const d = await openRename();
    expect(isOff(go(d))).toBe(true);
    expect(within(d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('another chat is not locked by it: its own Rename opens fresh and sends for that chat', async () => {
    const a = lost();
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} />);
    await sendLost(a);
    v.rerender(<ConvMenu attempts={att} source={S2()} target={null} api={a} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const d = await openRename();
    expect(field(d).value).toBe('Fix the cart total');
    setName(d, 'Other chat');
    expect(isOff(go(d))).toBe(false);
    await userEvent.click(go(d));
    await flush();
    expect(a.rename).toHaveBeenLastCalledWith('s-2', 'Other chat', 'global');
  });
  it('the same chat id on another computer is another target: the lock does not carry over', async () => {
    const a = lost();
    const A = { project: { id: 'p1' }, container: { id: 'cA', server_name: 'sv' } } as unknown as Target, B = { project: { id: 'p1' }, container: { id: 'cB', server_name: 'sv' } } as unknown as Target;
    const v = render(<ConvMenu attempts={att} source={S1()} target={A} api={a} />);
    await sendLost(a);
    v.rerender(<ConvMenu attempts={att} source={S1()} target={B} api={a} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const d = await openRename();
    expect(isOff(field(d))).toBe(false);
    v.rerender(<ConvMenu attempts={att} source={S1()} target={A} api={a} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(isOff(field(await openRename()))).toBe(true);
  });
  it('changing the chat under an open dialog closes it and sends nothing', async () => {
    const a = fake();
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    v.rerender(<ConvMenu attempts={att} source={S2()} target={null} api={a} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.rename).not.toHaveBeenCalled();
  });
  it('Check again after the chat changed reads the CAPTURED chat through the Api that sent it, never the current props', async () => {
    const a1 = lost(), a2 = fake(), onRenamed = vi.fn();
    a1.read.mockResolvedValue(ok({ session: { id: 's-1', name: 'Cart rounding' } }));
    a2.read.mockResolvedValue(ok({ session: { id: 's-2', name: 'Cart rounding' } }));
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a1} onRenamed={onRenamed} />);
    await sendLost(a1);
    v.rerender(<ConvMenu attempts={att} source={S2()} target={null} api={a2} onRenamed={onRenamed} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(toasts.length).toBe(1)); // the sticky "may have gone through" with its Check again
    await act(async () => { await toasts[0]!.action!.onAction(); });
    expect(a1.read).toHaveBeenCalledWith('s-1', 'global');
    expect(a2.read).not.toHaveBeenCalled();
    expect(onRenamed).toHaveBeenCalledTimes(1);
    // proved: the record is gone, the chat can be renamed again
    v.rerender(<ConvMenu attempts={att} source={S1()} target={null} api={a1} onRenamed={onRenamed} />);
    const d = await openRename();
    expect(isOff(field(d))).toBe(false);
  });
  it('a capability lost under an open dialog closes it and refuses the confirm', async () => {
    const a = fake();
    const v = render(<ConvMenu attempts={att} source={S1(true)} target={null} api={a} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    v.rerender(<ConvMenu attempts={att} source={S1(false)} target={null} api={a} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.rename).not.toHaveBeenCalled();
    await openMenu();
    expect(await item(strings['menu.rename'])).toHaveAttribute('aria-disabled', 'true');
  });
  it('a computer lost under an open dialog closes it and sends nothing', async () => {
    const a = fake();
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    v.rerender(<ConvMenu attempts={att} source={S1()} target={null} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(a.rename).not.toHaveBeenCalled();
  });
  it('an answer that names no stored title stays unknown: the host hears nothing, the typed text is not filled in', async () => {
    const a = fake({ rename: () => Promise.resolve(ok({ status: 'ok' })) }), onRenamed = vi.fn();
    render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
    const d = await sendLost(a);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(onRenamed).not.toHaveBeenCalled();
    expect(a.rename).toHaveBeenCalledTimes(1);
  });
  it('an answer that arrives after the dialog was closed (the chat changed under it) still tells the host, and clears the record', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ rename: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), onRenamed = vi.fn();
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    await act(async () => { fireEvent.click(go(d)); });
    v.rerender(<ConvMenu attempts={att} source={S2()} target={null} api={a} onRenamed={onRenamed} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(att.get(attemptKey(ID1))).toBeDefined(); // the record exists while the request is out (so the check below is not vacuous)
    await act(async () => { finish(ok({ status: 'ok', name: 'Cart rounding' })); });
    expect(onRenamed).toHaveBeenCalledWith('Cart rounding', ID1);
    expect(att.get(attemptKey(ID1))).toBeUndefined();
  });

  it('a late answer names the chat it was made for, so a host that moved on to another chat can tell (the callback is identity-bearing)', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ rename: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), first = vi.fn(), second = vi.fn();
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={first} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    await act(async () => { fireEvent.click(go(d)); });
    v.unmount();
    render(<ConvMenu attempts={att} source={S2()} target={null} api={a} onRenamed={second} />);
    await act(async () => { finish(ok({ status: 'ok', name: 'Cart rounding' })); });
    const heard = [...first.mock.calls, ...second.mock.calls];
    expect(heard).toEqual([['Cart rounding', ID1]]); // never taken for the chat now shown
  });

  it('the same chat id on another computer: a late rename names the ORIGINAL computer, never the one now shown', async () => {
    let finish: (v: Settled<unknown>) => void = () => {};
    const a = fake({ rename: () => new Promise<Settled<unknown>>((r) => { finish = r; }) }), b = fake(), first = vi.fn(), second = vi.fn();
    const orion = () => source({ active: true, ref: { ...REF, computer: 'orion.9999' } });
    const v = render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={first} />);
    const d = await openRename();
    setName(d, 'Cart rounding');
    await act(async () => { fireEvent.click(go(d)); });
    v.rerender(<ConvMenu attempts={att} source={orion()} target={null} api={b} onRenamed={second} />);
    await act(async () => { finish(ok({ status: 'ok', name: 'Cart rounding' })); });
    const heard = [...first.mock.calls, ...second.mock.calls];
    expect(heard).toEqual([['Cart rounding', { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' }]]);
  });

  it('a saved Check again after the computer changed names the ORIGINAL computer', async () => {
    const a = lost(), b = fake(), first = vi.fn(), second = vi.fn();
    a.read.mockResolvedValue(ok({ session: { id: 's-1', name: 'Cart rounding' } }));
    const v = render(<ConvMenu attempts={att} source={source({ active: true })} target={null} api={a} onRenamed={first} />);
    await sendLost(a);
    v.rerender(<ConvMenu attempts={att} source={source({ active: true, ref: { ...REF, computer: 'orion.9999' } })} target={null} api={b} onRenamed={second} />);
    await waitFor(() => expect(toasts.length).toBe(1));
    await act(async () => { await toasts[0]!.action!.onAction(); });
    const heard = [...first.mock.calls, ...second.mock.calls];
    expect(heard).toEqual([['Cart rounding', { computer: 'atlas.1234', realm: 'global', sid: 's-1', target: 'api' }]]);
    expect(b.read).not.toHaveBeenCalled();
  });

  // A Check again handed out earlier (a sticky toast) belongs to ITS attempt.
  it('an older dialog\'s saved Check again reads ITS chat after another chat\'s dialog was opened, and leaves the other record alone', async () => {
    const a = lost(), onRenamed = vi.fn();
    a.read.mockImplementation((id: unknown) => Promise.resolve(ok({ session: { id, name: id === 's-1' ? 'Chat A new' : 'Chat B new' } })));
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
    let d = await openRename();
    setName(d, 'Chat A new');
    await userEvent.click(go(d));
    await flush();
    v.rerender(<ConvMenu attempts={att} source={S2()} target={null} api={a} onRenamed={onRenamed} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(toasts.length).toBe(1));
    d = await openRename(); // chat B's dialog is now the open one
    setName(d, 'Chat B new');
    await userEvent.click(go(d));
    await flush();
    await act(async () => { await toasts[0]!.action!.onAction(); }); // A's toast
    expect(a.read).toHaveBeenCalledTimes(1);
    expect(a.read).toHaveBeenCalledWith('s-1', 'global');
    expect(onRenamed).toHaveBeenCalledTimes(1);
    expect(onRenamed).toHaveBeenCalledWith('Chat A new', ID1);
    expect(att.get(attemptKey({ ...ID1, sid: 's-2' }))).toBeDefined(); // B is still unresolved
  });
  it('two Check agains at once prove it once: the host hears the title once', async () => {
    const a = lost(), onRenamed = vi.fn();
    a.read.mockResolvedValue(ok({ session: { id: 's-1', name: 'Cart rounding' } }));
    const v = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
    await sendLost(a);
    v.rerender(<ConvMenu attempts={att} source={S2()} target={null} api={a} onRenamed={onRenamed} />);
    await waitFor(() => expect(toasts.length).toBe(1));
    await act(async () => { await Promise.all([toasts[0]!.action!.onAction(), toasts[0]!.action!.onAction()]); });
    expect(onRenamed).toHaveBeenCalledTimes(1);
  });
  it('a read-back of another chat with the same title proves nothing', async () => {
    const a = lost(), onRenamed = vi.fn();
    a.read.mockResolvedValue(ok({ session: { id: 'other-chat', name: 'Cart rounding' } }));
    render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
    const d = await sendLost(a);
    await userEvent.click(within(d).getByRole('button', { name: /check again/i }));
    await flush();
    expect(onRenamed).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
  it('a contradictory success body (status failed, with a name) stays unknown', async () => {
    const a = fake({ rename: () => Promise.resolve(ok({ status: 'failed', name: 'Never stored' })) }), onRenamed = vi.fn();
    render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
    const d = await sendLost(a);
    expect(within(d).getByRole('button', { name: /check again/i })).toBeInTheDocument();
    expect(onRenamed).not.toHaveBeenCalled();
  });

  // A menu mounted again while the request is still out follows the record to its end.
  describe('a menu mounted again while the request is out', () => {
    const remount = async (onRenamed = vi.fn()) => {
      let finish!: (v: Settled<unknown>) => void;
      const p = new Promise<Settled<unknown>>((r) => { finish = r; });
      const a = fake({ rename: () => p });
      const first = render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
      const d = await openRename();
      setName(d, 'Cart rounding');
      await act(async () => { fireEvent.click(go(d)); });
      first.unmount();
      cleanup();
      render(<ConvMenu attempts={att} source={S1()} target={null} api={a} onRenamed={onRenamed} />);
      const d2 = await openRename();
      expect(isOff(go(d2))).toBe(true);
      return { a, d2, finish, onRenamed };
    };
    it('unknown: the replacement dialog turns to Check again', async () => {
      const m = await remount();
      await act(async () => { m.finish(err('pending', 0, 'network')); });
      expect(within(m.d2).getByRole('button', { name: /check again/i })).toBeInTheDocument();
      expect(m.a.rename).toHaveBeenCalledTimes(1);
    });
    it('success: the replacement dialog closes and the host hears the stored title once', async () => {
      const m = await remount();
      await act(async () => { m.finish(ok({ status: 'ok', name: 'Cart rounding' })); });
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(m.onRenamed).toHaveBeenCalledTimes(1);
      expect(m.onRenamed).toHaveBeenCalledWith('Cart rounding', ID1);
    });
    it('refusal: the replacement dialog shows it, is no longer busy and may try again', async () => {
      const m = await remount();
      await act(async () => { m.finish(err('failed', 400, 'bad_request')); });
      expect(within(m.d2).getByText(strings['rename.bad'])).toBeInTheDocument();
      setName(m.d2, 'Cart rounding 2');
      expect(isOff(go(m.d2))).toBe(false);
      expect(isOff(field(m.d2))).toBe(false);
      expect(m.onRenamed).not.toHaveBeenCalled();
    });
  });
});
