// Vitest: the Ask column's turn menu. One menu per finished reply that names its turn; Fork goes to the engine with THAT turn; the
// AI tab's chat opens ONLY for an `opened` outcome (a refused or unknown fork opens nothing); a chat the capability table refuses (closed, or
// no finished reply) is disabled with the table's sentence. The engine is a stand-in here: its own behavior is fork.fork-body.test.ts / fork2.claim-across-tabs.test.ts.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit/page';
import tm from '@kit/agent/ForkMenu.strings.en.json';

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
import { ShellDataProvider } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import { Column } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';
import type * as F from './fork';
import { useAskTurnMenu } from './turnMenu';
import { makeT } from '@kit';
import { pageFaq } from '../pages/ai/faq';
import aiStrings from '../pages/ai/strings.en.json';

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const body = { messages: [
  { role: 'user', blocks: [{ kind: 'text', text: 'Hello' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: 'First answer' }] },
  { role: 'user', blocks: [{ kind: 'text', text: 'And then?' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: 'Second answer' }] },
], turn_boundaries: [1, 3] };
function snapOf(o: { bare?: boolean } = {}): Snapshot {
  const h = C.historyFrom(o.bare ? { messages: body.messages } : body, { liveTail: false, idOf: (i) => 'h' + i, at: 1 });
  const conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
  return { phase: 'ready', conv, status: null, dormant: false, gates: [], band: null, blocked: null, decision: { pending: false, unknown: false } } as unknown as Snapshot;
}
interface Fake { eng: AskEngine; fork: ReturnType<typeof vi.fn> }
function fake(o: { fork?: () => Promise<F.ForkOutcome>; journal?: boolean } = {}): Fake {
  const fork = vi.fn(o.fork ?? (async (): Promise<F.ForkOutcome> => ({ k: 'opened', sid: 'sess-9', k1: 'hx-1' })));
  const eng = { activation: () => ({ journal: o.journal ?? true }), fork, chatRefOf: (sid: string) => ({ computer: 'atlas.1234', realm: 'global', sid }), record: { s: 's1' }, forkRows: () => [], checkFork: vi.fn() } as unknown as AskEngine;
  return { eng, fork };
}
function Host({ eng, snap }: { eng: AskEngine; snap: Snapshot }) {
  const turnMenu = useAskTurnMenu(eng, snap);
  return <Column eng={eng} snap={snap} agentUrl="" typing empty={null} turnMenu={turnMenu} />;
}
async function mount(f: Fake, snap: Snapshot, pages: PageManifest[] | null = [pg('ai')]) {
  const Component = () => {
    const inner = <ShellDataProvider value={{ realms: [], realmId: 'r1', computers: [] }}><Host eng={f.eng} snap={snap} /></ShellDataProvider>;
    return pages ? <PagesProvider pages={pages}>{inner}</PagesProvider> : inner;
  };
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}
const ttl = (k: keyof typeof tm, n = 1): string => tm[k].replace('{{n}}', String(n));
const triggers = () => screen.getAllByRole('button', { name: tm['tm.more'] });
const fork = async (n: number) => { await userEvent.click(triggers()[n] as HTMLElement); await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(tm['tm.fork']) })); };

beforeEach(() => { toasts.length = 0; vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the Ask column\'s turn menu', () => {
  it('each finished reply that names its turn has one menu; a history that names none has none', async () => {
    await mount(fake(), snapOf());
    expect(triggers()).toHaveLength(2);
    cleanup();
    await mount(fake(), snapOf({ bare: true }));
    expect(screen.queryAllByRole('button', { name: tm['tm.more'] })).toHaveLength(0);
  });
  it('Fork goes to the engine with the turn of THAT reply', async () => {
    const f = fake();
    await mount(f, snapOf());
    await fork(1);
    await waitFor(() => expect(f.fork).toHaveBeenCalledTimes(1));
    expect(f.fork).toHaveBeenCalledWith({ turn: 1 });
  });
  it('an opened fork opens the new chat in the AI tab, by the computer\'s handle, the realm and the session', async () => {
    const f = fake();
    const router = await mount(f, snapOf());
    await fork(0);
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-9'));
    expect(router.state.location.search).toEqual({ computer: 'atlas.1234', realm: 'global' });
  });
  it('a refused fork opens nothing and says why', async () => {
    const router = await mount(fake({ fork: async () => ({ k: 'refused', key: 'ask.forkChanged', reason: 'changed' }) }), snapOf());
    await fork(0);
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkRefused'), tone: 'error' });
    expect(router.state.location.pathname).toBe('/home');
  });
  it('an unknown fork opens nothing and offers Check again, which asks the engine for that key', async () => {
    const f = fake({ fork: async () => ({ k: 'unknown', k1: 'hx-7', key: 'ask.forkMade', reason: 'pending' }) });
    const router = await mount(f, snapOf());
    await fork(0);
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkUnknown'), tone: 'unknown' });
    expect((toasts[0] as unknown as { action?: { label: string } }).action?.label).toBe(tm['tm.checkAgain']);
    expect(router.state.location.pathname).toBe('/home');
    expect(f.fork).toHaveBeenCalledTimes(1);
  });
  it('a load that serves no AI tab has nowhere to open it: the toast says the fork was made', async () => {
    const router = await mount(fake(), snapOf(), [pg('home')]);
    await fork(0);
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: ttl('tm.forkMade') });
    expect(router.state.location.pathname).toBe('/home');
  });
  it('a chat with no finished turn is disabled with the table\'s sentence and calls nothing', async () => {
    const f = fake();
    const snap = snapOf();
    // the reply is still shown (a restored transcript) but the conversation counts no completed turn
    const c = { ...snap.conv, turns: snap.conv.turns.map((t) => ({ ...t, s: { ...t.s, terminal: { ...(t.s.terminal as object), state: 'failed' } } })) };
    await mount(f, { ...snap, conv: c } as Snapshot);
    await userEvent.click(triggers()[0] as HTMLElement);
    const it0 = await screen.findByRole('menuitem', { name: new RegExp(tm['tm.fork']) });
    expect(it0.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('menu').textContent).toContain('Nothing to fork yet');
    await userEvent.click(it0);
    expect(f.fork).not.toHaveBeenCalled();
  });
});

// The reply menu's host carries the AI tab's forkUnconfirmed question to a gone fork's toast.
describe('the reply menu\'s question', () => {
  it('a gone fork: the warn toast carries forkUnconfirmed', async () => {
    await mount(fake({ fork: async () => ({ k: 'refused', key: 'ask.forkNone', reason: 'gone' }) }), snapOf());
    await fork(0);
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn', faq: { item: pageFaq(makeT(aiStrings)).byId.forkUnconfirmed, label: tm['tm.faq'] } });
  });
});
