// Vitest: the chat band of unconfirmed forks. It shows this chat's unresolved forks (not hidden ones), Check again asks the engine for that key, a Check
// that finds the chat opens it in the AI tab, and Hide goes to the engine. The engine is a stand-in: its own behavior is fork5.fake-agent-reserves-key.test.ts.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useForkChanges } from '@kit/agent/forkList';
import type { PageManifest } from '@kit/page';
import fp from '@kit/agent/ForkPending.strings.en.json';
import { ShellDataProvider } from '../shell/context';
import { PagesProvider } from '../shell/pageLinks';
import type { AskEngine } from './engine';
import type * as F from './fork';
import type { ForkRow } from './forkRecovery';
import { makeT } from '@kit';
import { pageFaq } from '../pages/ai/faq';
import aiStrings from '../pages/ai/strings.en.json';
import { ForkBand, forkViews } from './forkBand';
import { FORKS_MAX } from './journal/records';

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
beforeEach(() => { toasts.length = 0; });

const pg = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const row = (o: Partial<ForkRow> = {}): ForkRow => ({ k1: 'hx-1', h: 'atlas.1234', r: 'global', parent: 's1', turn: 0, bad: false, hidden: false, mine: false, at: 1, ...o });
function fakeEng(rows: ForkRow[] | null, check: (k1: string) => Promise<F.ForkOutcome> = async () => ({ k: 'refused', key: 'ask.forkNone', reason: 'none' })) {
  const checkFork = vi.fn(check);
  const hideFork = vi.fn(async () => true);
  const eng = { record: { s: 's1' }, forkRows: () => rows, checkFork, hideFork, chatRefOf: (sid: string) => ({ computer: 'atlas.1234', realm: 'global', sid }) } as unknown as AskEngine;
  return { eng, checkFork, hideFork };
}
/** Another fork view on the page: renders again on every fork change and shows the change count. */
function Mirror() { return <output data-testid="changes">{useForkChanges()}</output>; }
const changes = () => Number(screen.getByTestId('changes').textContent);
async function mount(eng: AskEngine) {
  const Component = () => <PagesProvider pages={[pg('ai')]}><ShellDataProvider value={{ realms: [], realmId: 'r1', computers: [] }}><ForkBand eng={eng} /><Mirror /></ShellDataProvider></PagesProvider>;
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/home'] }) });
  await act(async () => { render(<RouterProvider router={router} />); await router.load(); });
  return router;
}
afterEach(() => cleanup());

describe('forkViews', () => {
  it('keeps this chat\'s forks only, and null when the rows cannot be read', () => {
    const { eng } = fakeEng([row(), row({ k1: 'hx-2', parent: 'other' })]);
    expect(forkViews(eng)!.map((x) => x.k1)).toEqual(['hx-1']);
    expect(forkViews(fakeEng(null).eng)).toBeNull();
  });
});
describe('the chat band', () => {
  it('draws nothing without a pending fork, and does not show a hidden one', async () => {
    const a = fakeEng([]);
    await mount(a.eng);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    const b = fakeEng([row({ hidden: true })]);
    await mount(b.eng);
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('Check again asks the engine for that key; a refusal opens nothing', async () => {
    const { eng, checkFork } = fakeEng([row()]);
    const router = await mount(eng);
    await userEvent.click(screen.getByRole('button', { name: fp['fp.check'] }));
    await waitFor(() => expect(checkFork).toHaveBeenCalledWith('hx-1'));
    expect(router.state.location.pathname).toBe('/home');
  });
  it('a Check that finds the chat opens it in the AI tab', async () => {
    const { eng } = fakeEng([row()], async () => ({ k: 'opened', sid: 'sess-9', k1: 'hx-1' }));
    const router = await mount(eng);
    await userEvent.click(screen.getByRole('button', { name: fp['fp.check'] }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-9'));
  });
  it.each([['none', 'info'], ['gone', 'warn'], ['unconfirmed', 'warn']] as const)('a Check that ends the fork (%s) drops its row and the band, and the result is still said (a toast)', async (reason, tone) => {
    let rows: ForkRow[] = [row()];
    const checkFork = vi.fn(async (): Promise<F.ForkOutcome> => { rows = []; return { k: 'refused', key: 'ask.forkNone', reason }; });
    const eng = { record: { s: 's1' }, forkRows: () => rows, checkFork, hideFork: vi.fn(), chatRefOf: () => null } as unknown as AskEngine;
    await mount(eng);
    await userEvent.click(screen.getByRole('button', { name: fp['fp.check'] }));
    await waitFor(() => expect(checkFork).toHaveBeenCalledWith('hx-1'));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone });
    expect(toasts[0]!.body, 'the words of the outcome').toBeTruthy();
    // The band re-read (the Check bumps it) and the removed row is gone with nothing left on screen.
    await waitFor(() => expect(screen.queryByRole('button', { name: fp['fp.check'] })).toBeNull());
  });
  // A Check or Hide here tells the page's other fork views (kit/agent/forkList.ts forkChanged).
  it('a Check renders another mounted fork view again, once it has settled', async () => {
    let release!: () => void;
    const { eng, checkFork } = fakeEng([row()], () => new Promise((res) => { release = () => res({ k: 'refused', key: 'ask.forkNone', reason: 'none' }); }));
    await mount(eng);
    const before = changes();
    await userEvent.click(screen.getByRole('button', { name: fp['fp.check'] }));
    await waitFor(() => expect(checkFork).toHaveBeenCalledWith('hx-1'));
    expect(changes(), 'not before the Check settles').toBe(before);
    await act(async () => { release(); });
    await waitFor(() => expect(changes()).toBe(before + 1));
  });
  it('a Hide renders another mounted fork view again', async () => {
    const { eng, hideFork } = fakeEng([row()]);
    await mount(eng);
    const before = changes();
    await userEvent.click(screen.getByRole('button', { name: fp['fp.hide'] }));
    await waitFor(() => expect(hideFork).toHaveBeenCalledWith('hx-1'));
    await waitFor(() => expect(changes()).toBe(before + 1));
  });
  it('Hide goes to the engine', async () => {
    const { eng, hideFork } = fakeEng([row()]);
    await mount(eng);
    await userEvent.click(screen.getByRole('button', { name: fp['fp.hide'] }));
    await waitFor(() => expect(hideFork).toHaveBeenCalledWith('hx-1'));
  });
});

// The chat band links the AI tab's forkUnconfirmed question on its rows and on a gone/unconfirmed toast, and that answer states the
// account's fork limit the journal enforces (FORKS_MAX).
describe('the band\'s question', () => {
  const item = pageFaq(makeT(aiStrings)).byId.forkUnconfirmed;
  it('a row links the forkUnconfirmed question', async () => {
    await mount(fakeEng([row()]).eng);
    const link = screen.getByRole('link', { name: fp['fp.more'] });
    expect(link.getAttribute('href')).toContain('#faq-forkUnconfirmed');
  });
  it('a gone fork\'s toast carries that question', async () => {
    await mount(fakeEng([row()], async () => ({ k: 'refused', key: 'ask.forkNone', reason: 'gone' })).eng);
    await userEvent.click(screen.getByRole('button', { name: fp['fp.check'] }));
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ tone: 'warn', faq: { item: { id: 'forkUnconfirmed' }, label: fp['fp.more'] } });
    expect((toasts[0] as { faq?: { item: unknown } }).faq?.item).toEqual(item);
  });
  it('the answer states the account limit the journal enforces', () => {
    expect(item.a).toContain(`At most ${FORKS_MAX} forks per account wait like this.`);
  });
});
