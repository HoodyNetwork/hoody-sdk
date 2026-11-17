// Vitest: an OPEN reply menu follows fork changes made elsewhere. Its Fork / Check the fork item reads the
// pending forks at render, so the page's one fork-change signal (kit/agent/forkList.ts) renders it again when another tab writes the records
// (`storage`) or a Check on this page settles (the unconfirmed-forks list). The window's `storage` listener lives only while a view is mounted.
import type * as CoreMod from '@core';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core', async (orig) => {
  const real = await orig<typeof CoreMod>();
  return { ...real, useCore: () => ({ ...real.useCore(), account: 'acc' }) };
});
import { can, type CapFacts } from './capability';
import { SessionView } from './SessionView';
import type { ConvBlock, ConvSnapshot, ConversationSource, ForkOutcome, ForkRowView } from './source';
import { forkItems, turnMenuOf, type ForkHost } from './ForkMenu';
import { provideForkList, useForkChanges, useForkList, type ForkListView } from './forkList';
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
const pending: ForkRowView = { k1: 'hx-3', parent: 's', turn: 0, bad: false, hidden: false, mine: false };

/** The stored records both readers see: the chat's source (the menu) and the list provider (the unconfirmed-forks list). */
let rows: ForkRowView[] = [];
const forks = vi.fn(() => rows);
const host: ForkHost = {
  source: () => ({ can: (a) => can(a, facts), fork: async () => ({ k: 'opened', sid: 'f' }) as ForkOutcome, checkFork: async () => ({ k: 'opened', sid: 'f' }) as ForkOutcome, forks }),
  open: () => true,
};
const menu = () => <SessionView source={src([reply({ key: 'a', turn: 0 })])} size="l" turnMenu={turnMenuOf(forkItems(host))} />;
const openMenu = async () => { await userEvent.click(screen.getByRole('button', { name: strings['tm.more'] })); };
const otherTab = () => act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'hoody.journal' })); });
const forkItem = () => screen.queryByRole('menuitem', { name: new RegExp(strings['tm.fork']) });
const checkItem = () => screen.queryByRole('menuitem', { name: strings['tm.check'] });

beforeEach(() => { rows = []; forks.mockClear(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); provideForkList(null); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('an open menu follows fork changes made elsewhere', () => {
  it('another tab leaves a fork pending on this reply: the open menu turns Fork into Check the fork without closing', async () => {
    render(menu());
    await openMenu();
    expect(forkItem()).not.toBeNull();
    rows = [pending];
    otherTab();
    await waitFor(() => expect(checkItem()).not.toBeNull());
    expect(forkItem()).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
  });
  it('a Check in the unconfirmed-forks list settles the fork: the open menu turns back to Fork', async () => {
    rows = [pending];
    const listCheck = vi.fn(async (): Promise<ForkOutcome> => { rows = []; return { k: 'refused', words: 'Not made.', reason: 'gone' }; });
    provideForkList({ open: () => ({ rows: () => rows, elsewhere: () => [], check: listCheck, hide: async () => true }) });
    let list: ForkListView | null = null;
    function List() { list = useForkList({ computer: 'atlas.1234', realm: 'global' }, { project: 'p', id: 'c', name: 'atlas' }); return null; }
    render(<><List />{menu()}</>);
    await openMenu();
    expect(checkItem()).not.toBeNull();
    await act(async () => { await list!.check('hx-3'); });
    expect(listCheck).toHaveBeenCalledWith('hx-3');
    await waitFor(() => expect(forkItem()).not.toBeNull());
    expect(checkItem()).toBeNull();
    expect(screen.getByRole('menu')).toBeTruthy();
  });
  it('a fork from the menu that is left pending shows up in the unconfirmed-forks list at once', async () => {
    provideForkList({ open: () => ({ rows: () => rows, elsewhere: () => [], check: async () => ({ k: 'opened', sid: 'f' }) as ForkOutcome, hide: async () => true }) });
    let list: ForkListView | null = null;
    function List() { list = useForkList({ computer: 'atlas.1234', realm: 'global' }, { project: 'p', id: 'c', name: 'atlas' }); return null; }
    const left: ForkHost = { ...host, source: () => ({ ...host.source()!, fork: async () => { rows = [pending]; return { k: 'unknown', words: 'Lost.', reason: 'pending', k1: 'hx-3' } as ForkOutcome; } }) };
    render(<><List /><SessionView source={src([reply({ key: 'a', turn: 0 })])} size="l" turnMenu={turnMenuOf(forkItems(left))} /></>);
    expect(list!.rows).toHaveLength(0);
    await openMenu();
    await userEvent.click(forkItem()!);
    await waitFor(() => expect(list!.rows).toHaveLength(1));
  });
});

describe('the storage listener lives only while a fork view is mounted', () => {
  const storageCalls = (s: { mock: { calls: unknown[][] } }) => s.mock.calls.filter((c) => c[0] === 'storage').map((c) => c[1]);
  it('mounting adds one listener, unmounting the last view removes that same one, and a later write reads nothing', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const rm = vi.spyOn(window, 'removeEventListener');
    const v = render(menu());
    expect(storageCalls(add)).toHaveLength(1);
    v.unmount();
    expect(storageCalls(rm)).toEqual(storageCalls(add));
    forks.mockClear();
    otherTab();
    expect(forks).not.toHaveBeenCalled();
  });
  it('a view mounted again subscribes afresh and follows the next write', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(menu()).unmount();
    render(menu());
    expect(storageCalls(add)).toHaveLength(2);
    await openMenu();
    rows = [pending];
    otherTab();
    await waitFor(() => expect(checkItem()).not.toBeNull());
  });
  /** The `storage` handlers still on the window: every add minus the removes of the same handler. */
  const live = (add: { mock: { calls: unknown[][] } }, rm: { mock: { calls: unknown[][] } }) => {
    const on = storageCalls(add);
    for (const h of storageCalls(rm)) {
      const i = on.indexOf(h);
      if (i >= 0) on.splice(i, 1);
    }
    return on;
  };
  it('under StrictMode the double subscribe leaves exactly one listener that follows a write, and unmounting leaves none', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const rm = vi.spyOn(window, 'removeEventListener');
    const v = render(<StrictMode>{menu()}</StrictMode>);
    expect(live(add, rm)).toHaveLength(1);
    await openMenu();
    rows = [pending];
    otherTab();
    await waitFor(() => expect(checkItem()).not.toBeNull());
    v.unmount();
    expect(live(add, rm)).toHaveLength(0);
    forks.mockClear();
    otherTab();
    expect(forks).not.toHaveBeenCalled();
  });
  describe('two views at once', () => {
    const Probe = ({ id }: { id: string }) => <output data-testid={id}>{useForkChanges()}</output>;
    const count = (id: string) => Number(screen.getByTestId(id).textContent);
    it.each([['a', 'b'], ['b', 'a']] as const)('share one listener; unmounting %s keeps it for %s, and the last one out removes it', (first, second) => {
      const add = vi.spyOn(window, 'addEventListener');
      const rm = vi.spyOn(window, 'removeEventListener');
      const views = { a: render(<Probe id="a" />), b: render(<Probe id="b" />) };
      expect(storageCalls(add)).toHaveLength(1);
      views[first].unmount();
      expect(storageCalls(rm)).toHaveLength(0);
      const before = count(second);
      otherTab();
      expect(count(second)).toBe(before + 1);
      views[second].unmount();
      expect(live(add, rm)).toHaveLength(0);
      expect(storageCalls(rm)).toEqual(storageCalls(add));
    });
  });
});
