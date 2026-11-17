// ConvMenu's ask: a typed "/rename" or "/exit" opens the menu's own dialog once. The menu reports every ask it has
// handled (opened, or refused with the item's reason), so the page drops it and a menu mounted again never replays it.
import { boot } from '@core/test/env';
import type { Settled } from '@core/providers/types';
import { can, type Capability, type CapFacts, type ConversationSource, type ConvSnapshot } from '@kit';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toasts = vi.hoisted(() => [] as Array<{ title: string; action?: { onAction: () => unknown } }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; action?: { onAction: () => unknown } }) => { toasts.push(c); return 'k'; } }));
import strings from './ConvMenu.strings.en.json';
import { ConvMenu } from './ConvMenu';
import { createRenameAttempts, type RenameAttempts } from './renameAttempts';
import type { agent } from '@core';

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
const source = (o: { snap?: ConvSnapshot; active?: boolean; ref?: ConversationSource['ref'] } = {}): ConversationSource => {
  const snap = o.snap ?? SNAP;
  return {
    kind: 'session', ref: o.ref ?? REF, snapshot: () => snap, subscribe: () => () => {}, watch: () => {},
    can: (a) => (o.active ? ({ ok: true } as Capability) : can(a, snap.facts)),
  };
};

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
interface Fake { rename: ReturnType<typeof vi.fn>; read: ReturnType<typeof vi.fn> }
const fake = (o: { rename?: (...a: unknown[]) => Promise<Settled<unknown>>; read?: () => Promise<Settled<unknown>> } = {}): Fake & agent.SessionApi => ({
  rename: vi.fn(o.rename ?? ((_i: unknown, name: unknown) => Promise.resolve(ok({ status: 'ok', name })))),
  read: vi.fn(o.read ?? (() => Promise.resolve(ok({ session: { id: 's-1' } })))),
  // Close reads the chat's loops when it opens.
  loops: vi.fn(() => Promise.resolve(ok({ items: [] }))),
}) as unknown as Fake & agent.SessionApi;

let att: RenameAttempts;
beforeEach(() => { boot(); att = createRenameAttempts(); toasts.length = 0; });
afterEach(() => cleanup());

const dlg = () => screen.queryByRole('alertdialog') ?? screen.queryByRole('dialog');
const ask = (what: 'rename' | 'close', n: number, seed?: string) => ({ what, n, ...(seed !== undefined ? { seed } : {}) });

describe('ConvMenu ask', () => {
  it('an ask opens its dialog once and is reported done with its number', async () => {
    const done = vi.fn();
    render(<ConvMenu source={source({ active: true })} target={null} api={fake()} attempts={att} ask={ask('rename', 1, 'Cart')} onAskDone={done} />);
    await waitFor(() => expect(dlg()).toBeTruthy());
    expect((within(dlg()!).getByRole('textbox', { name: strings['rename.label'] }) as HTMLInputElement).value).toBe('Cart');
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(1);
  });

  it('an ask whose item is unavailable says why, opens nothing, and is reported done too', async () => {
    const done = vi.fn();
    render(<ConvMenu source={source()} target={null} attempts={att} ask={ask('rename', 1)} onAskDone={done} />);
    await waitFor(() => expect(done).toHaveBeenCalledWith(1));
    expect(dlg()).toBeNull();
    expect(toasts.length).toBe(1);
  });

  it('a menu mounted again after the page dropped the ask opens nothing', async () => {
    const done = vi.fn();
    const first = render(<ConvMenu source={source({ active: true })} target={null} api={fake()} attempts={att} ask={ask('close', 1)} onAskDone={done} />);
    await waitFor(() => expect(done).toHaveBeenCalledWith(1));
    first.unmount();
    render(<ConvMenu source={source({ active: true })} target={null} api={fake()} attempts={att} ask={null} onAskDone={done} />);
    await act(async () => { await Promise.resolve(); });
    expect(dlg()).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });
});
