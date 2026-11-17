// Vitest: the apps page in live mode (LIVE on, core's run-open machine scripted per test). The machine is made
// in an effect, so the first render has none. Covers what only live mode reaches: the memoized Find Open (stale
// closure) and three double-action and dropped-options cases:
// a double Open, a double Restart, and the share dialog dropping Options.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { OpenRequest, RunOpen, RunResult } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import type * as Live from './parts/live';

const S = vi.hoisted(() => ({
  reqs: [] as unknown[],
  closes: 0,
  /** The next open()'s answer; never = a launch still in flight. */
  open: (): Promise<unknown> => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' }),
  close: (): Promise<unknown> => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' }),
  status: (): Promise<unknown> => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' }),
  /** The computer shown; a test may switch it (listeners re-render the page). */
  computer: 'b'.repeat(24),
  listeners: new Set<() => void>(),
  statuses: 0,
  /** A watch: answers at once unless a test makes it wait for its abort. */
  watch: (_s: AbortSignal): Promise<unknown> => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' }),
  aborts: 0,
  /** The page's Retry-After hook, as core's hook is given it. */
  onRetryAfter: undefined as ((ms: number) => void) | undefined,
  /** Every Check the page ran (live.ts liveCheck), settling when that Check has ended. */
  checks: [] as Promise<void>[],
}));
const CID = 'b'.repeat(24);
const never = () => new Promise<never>(() => {});

vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), LIVE: true }));
vi.mock('./parts/live', async (orig) => {
  const real = await orig<typeof Live>();
  return { ...real, liveCheck: (...a: Parameters<typeof real.liveCheck>) => { const p = real.liveCheck(...a); S.checks.push(p); return p; } };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useEffect, useState } = await import('react');
  const targets = new Map<string, unknown>();
  const targetOf = (id: string) => {
    if (!targets.has(id)) targets.set(id, { project: { id: 'a'.repeat(24) }, container: { id, server_name: 'n1' } });
    return targets.get(id);
  };
  const machine = {
    open: (req: unknown) => {
      S.reqs.push(req);
      return S.open();
    },
    status: () => {
      S.statuses++;
      return S.status();
    },
    close: () => {
      S.closes++;
      return S.close();
    },
    watch: (_h: unknown, o: { signal: AbortSignal }) => {
      o.signal.addEventListener('abort', () => void S.aborts++);
      return S.watch(o.signal);
    },
  } as unknown as RunOpen;
  return {
    ...real,
    useCurrentComputer: () => {
      const [, force] = useState(0);
      useEffect(() => {
        const l = () => force((n) => n + 1);
        S.listeners.add(l);
        return () => void S.listeners.delete(l);
      }, []);
      return targetOf(S.computer);
    },
    // As core's hook: null on the first render, the machine from an effect on.
    useRunOpen: (o?: { onRetryAfter?: (ms: number) => void }) => {
      S.onRetryAfter = o?.onRetryAfter;
      const [m, setM] = useState<RunOpen | null>(null);
      useEffect(() => setM(machine), []);
      return m;
    },
  };
});

const { harness: page } = await import('./launch/harness');
const { default: strings } = await import('./strings.en.json');
const { ops } = await import('./parts/ops');
const { fromHandle } = await import('./parts/recent');

beforeEach(() => {
  ops.reset();
  S.reqs.length = 0;
  S.closes = 0;
  S.open = () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' } as RunResult);
  S.close = () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' } as RunResult);
  S.status = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' } as RunResult);
  S.computer = CID;
  S.statuses = 0;
  S.aborts = 0;
  S.checks.length = 0;
  S.watch = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' });
});

const H = (tag: string) => ({ v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: tag, opens_in: 'terminal' as const, computer: { project: 'a'.repeat(24), computer_id: CID } });

/** Launch an app (the drawer), unless it is already open. */
async function showFind() {
  // Find is already open (a launch=1 link): its drawer is there before its table fills in.
  if (screen.queryByRole('dialog', { name: strings['launch.title'] })) return;
  const [btn] = await screen.findAllByRole('button', { name: strings['launch.action'] });
  await userEvent.click(btn!);
}

async function openFromFind(name: RegExp) {
  await showFind();
  const table = await screen.findByRole('table', { name: strings['tab.find'] });
  const row = await within(table).findByRole('row', { name });
  await userEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
}

describe('apps page, live mode', () => {
  it('the Find table\'s Open uses the machine made after the first render (no stale closure)', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    await openFromFind(/htop/);
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    // The machine's unknown outcome reads "may have gone through", never "the computer didn't answer".
    expect(await screen.findByText(strings['outcome.launch.title'].replace('{{name}}', 'htop'), {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['fail.unreachable'])).toBeNull();
  });

  it('a second Open while the first is still starting starts nothing', async () => {
    S.open = never;
    await renderPage(page, { path: '/apps?launch=1' });
    await openFromFind(/htop/);
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    await openFromFind(/htop/);
    expect((await screen.findAllByText(strings['note.opening'])).length).toBeGreaterThan(0);
    expect(S.reqs).toHaveLength(1);
  });

  it('Restart pressed twice from the row menu stops and starts once', async () => {
    S.close = never;
    const row = fromHandle(
      { v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: 'd'.repeat(16), opens_in: 'terminal', computer: { project: 'a'.repeat(24), computer_id: CID } },
      { name: 'htop', catalogId: 'htop', app: 'htop' },
      1,
    )!;
    ops.addLaunch({ key: 'k1', name: 'htop', catalogId: 'htop', app: 'htop', opensIn: 'terminal', state: 'running', terminal: 15001, handle: 'dddd', source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
    ops.bind('k1', row);
    await renderPage(page, { path: '/apps' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    for (let i = 0; i < 2; i++) {
      const r = await within(table).findByRole('row', { name: /htop/ });
      await userEvent.click(within(r).getByRole('button', { name: 'Row actions' }));
      const item = screen.queryByRole('menuitem', { name: strings['menu.restart'] });
      if (item) await userEvent.click(item);
      else await userEvent.keyboard('{Escape}');
    }
    await waitFor(() => expect(S.closes).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(S.closes).toBe(1);
    expect(S.reqs).toHaveLength(0);
  });

  it('a first-time share starter keeps the Options it was opened with through the share note', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /Shared folder/ });
    // Options is an item of the row's ⋯ menu (the standard row actions).
    await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    await userEvent.type(await screen.findByLabelText(strings['opt.args']), '--readonly');
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['opt.open'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['share.go'] }));
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    expect((S.reqs[0] as OpenRequest).args).toEqual(['--readonly']);
  });

  it('Stop goes ahead of a Check still waiting for its answer (a read never blocks a Stop)', async () => {
    S.status = never;
    const row = fromHandle(
      { v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: 'd'.repeat(16), opens_in: 'terminal', computer: { project: 'a'.repeat(24), computer_id: CID } },
      { name: 'htop', catalogId: 'htop', app: 'htop' },
      1,
    )!;
    ops.addLaunch({ key: 'k2', name: 'htop', catalogId: 'htop', app: 'htop', opensIn: 'terminal', state: 'unknown', code: 'unreachable', terminal: 15001, handle: 'd'.repeat(16), source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
    ops.bind('k2', row);
    await renderPage(page, { path: '/apps?appsel=k2' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const r = await within(table).findByRole('row', { name: /htop/ });
    await userEvent.click(within(r).getByRole('button', { name: strings['act.check'] }));
    await userEvent.click(within(r).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['act.stop'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['act.stop'] }));
    await waitFor(() => expect(S.closes).toBe(1));
  });

  it('Options on a row that is not a starter opens its app by name, never its row key as a candidate', async () => {
    ops.addLaunch({ key: 'k3', name: 'sqlite-web', app: 'sqlite-web', opensIn: 'terminal', state: 'not_started', code: 'invalid_options', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
    await renderPage(page, { path: '/apps?appsel=k3' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const r = await within(table).findByRole('row', { name: /sqlite-web/ });
    await userEvent.click(within(r).getByRole('button', { name: strings['act.options'] }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: strings['opt.open'] }));
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    const req = S.reqs[0] as OpenRequest;
    expect(req.app).toBe('sqlite-web');
    expect(req.pick).toBeUndefined();
    expect(JSON.stringify(req)).not.toContain('k3');
  });

  it('a launch the computer has not admitted shows no handle ("Nothing yet"), never a made-up one', async () => {
    S.open = never;
    await renderPage(page, { path: '/apps?launch=1' });
    await openFromFind(/htop/);
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    const facts = await screen.findByText(strings['insp.handle']);
    expect(facts.parentElement?.textContent).toContain(strings['insp.none']);
  });

  it('a computer switch closes Options (its secret values never act on the new computer)', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const table = await screen.findByRole('table', { name: strings['tab.find'] });
    const row = await within(table).findByRole('row', { name: /JupyterLab/ });
    // Options is an item of the row's ⋯ menu (the standard row actions).
    await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const optionsTitle = strings['opt.title'].replace('{{name}}', 'JupyterLab');
    expect(await screen.findByRole('dialog', { name: optionsTitle })).toBeInTheDocument();
    await act(async () => {
      S.computer = 'e'.repeat(24);
      for (const l of S.listeners) l();
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: optionsTitle })).toBeNull());
    expect(S.reqs).toHaveLength(0);
  });
});

describe('apps page, live mode: double presses and dropped options', () => {
  // The parked-sleep spy below is restored even when its test fails.
  let parked: { mockRestore(): void } | null = null;
  afterEach(() => { parked?.mockRestore(); parked = null; });
  it('"Choose a version" on a search row searches Find, never sends the same request again', async () => {
    S.open = () => Promise.resolve({ ok: false, code: 'needs_pick', message: '', notSent: true } as RunResult);
    await renderPage(page, { path: '/apps?launch=1&launchq=jupy' });
    await openFromFind(/jupyter\/base-notebook/);
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const r = await within(table).findByRole('row', { name: /jupyter\/base-notebook/ });
    await userEvent.click(await within(r).findByRole('button', { name: strings['act.pick'] }));
    // Find opens on the app's name; Options does not.
    const find = await screen.findByRole('dialog', { name: strings['launch.title'] });
    const picked = ops.get().launches.find((l) => l.name === 'jupyter/base-notebook');
    expect(within(find).getByRole('searchbox')).toHaveValue(picked?.app ?? picked?.name);
    expect(screen.queryByRole('dialog', { name: /^Options for/ })).toBeNull();
    expect(S.reqs).toHaveLength(1);
  });

  it('a Check sleeping out a server hold never writes over a Stop that began meanwhile', async () => {
    S.close = () => Promise.resolve({ ok: false, code: 'other', message: '' } as RunResult);
    // The read made on mount never answers, so the row stays unknown with its Check.
    S.status = never;
    const row = fromHandle(H('d'.repeat(16)), { name: 'htop', catalogId: 'htop', app: 'htop' }, 1)!;
    ops.addLaunch({ key: 'k5', name: 'htop', catalogId: 'htop', app: 'htop', opensIn: 'terminal', state: 'unknown', code: 'unreachable', terminal: 15001, handle: 'd'.repeat(16), source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
    ops.bind('k5', row);
    await renderPage(page, { path: '/apps?appsel=k5' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const r = await within(table).findByRole('row', { name: /htop/ });
    await waitFor(() => expect(S.onRetryAfter).toBeDefined());
    // The read made on mount has gone out (it never answers): only a later read could count from here.
    await waitFor(() => expect(S.statuses).toBeGreaterThan(0));
    // The Check sleeps out this hold. Its sleep (the only timer this long) is parked, not armed, and woken below once
    // the Stop has begun, so the Stop begins while the Check sleeps however long the clicks take (otherwise,
    // with a real 2 s hold, slow clicks let the Check wake first and read, which is right then).
    const sleeps: Array<() => void> = [];
    const realTimeout = globalThis.setTimeout;
    parked = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) =>
      (ms ?? 0) > 120_000 ? (sleeps.push(() => fn(...a)), 0) : realTimeout(fn, ms, ...a)) as typeof setTimeout);
    act(() => S.onRetryAfter?.(123_457));
    const before = S.statuses;
    await userEvent.click(within(r).getByRole('button', { name: strings['act.check'] }));
    await waitFor(() => expect(sleeps).toHaveLength(1));
    await userEvent.click(within(r).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['act.stop'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['act.stop'] }));
    await waitFor(() => expect(S.closes).toBe(1));
    expect(sleeps).toHaveLength(1);
    expect(S.checks).toHaveLength(1);
    // Wake the Check and wait for its own end: whatever it was going to read, it has read by then (a read it should
    // not make answers at once, so a Check that reads still ends and the count below shows it).
    S.status = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' } as RunResult);
    await act(async () => { sleeps.splice(0).forEach((wake) => wake()); await S.checks[0]; });
    expect(S.statuses).toBe(before);
    expect(ops.get().patches.get('k5')?.code).toBe('stop_unconfirmed');
  });

  it('a computer switch stops the old computer\'s watches', async () => {
    S.watch = (sig) => new Promise((res) => sig.addEventListener('abort', () => res(undefined)));
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H('e'.repeat(16)) } as unknown as RunResult);
    await renderPage(page, { path: '/apps?launch=1' });
    await openFromFind(/htop/);
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    await new Promise((res) => setTimeout(res, 50));
    expect(S.aborts).toBe(0);
    await act(async () => {
      S.computer = 'e'.repeat(24);
      for (const l of S.listeners) l();
    });
    await waitFor(() => expect(S.aborts).toBe(1));
  });
});

describe('apps page, live mode: C9 (two tabs)', () => {
  it('a copy another tab opened and stored holds this tab\'s Open of the same app: nothing is sent', async () => {
    const { addRecent, loadRecent, removeRecent, saveRecent, recentKey } = await import('./parts/recent');
    // The read of the other tab's copy never answers, so it stays "may have gone through".
    S.status = never;
    await renderPage(page, { path: '/apps?launch=1' });
    await screen.findByRole('table', { name: strings['tab.find'] });
    // The machine comes from an effect and the stored rows load after it: let both settle first.
    await act(async () => void (await new Promise((r) => setTimeout(r, 100))));
    // After this tab loaded its list, another tab opens htop and stores its handle.
    const other = fromHandle(H('e'.repeat(16)), { name: 'htop', catalogId: 'htop', app: 'htop' }, Date.now())!;
    saveRecent(addRecent(loadRecent(), other));
    try {
      await openFromFind(/htop/);
      expect((await screen.findAllByText(strings['note.held'])).length).toBeGreaterThan(0);
      await new Promise((r) => setTimeout(r, 50));
      expect(S.reqs).toHaveLength(0);
    } finally {
      saveRecent(removeRecent(loadRecent(), recentKey(other)));
    }
  });
});

describe('apps page, live mode: late answers and other tabs', () => {
  it('an access code that comes back after the page was left is dropped, never shown on return', async () => {
    let answer!: (r: unknown) => void;
    S.open = () => new Promise((r) => (answer = r));
    const a = await renderPage(page, { path: '/apps?launch=1' });
    await openFromFind(/htop/);
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    const key = ops.get().launches.find((l) => l.name === 'htop')!.key;
    a.unmount();
    await act(async () => answer({ ok: true, code: 'running', message: '', state: 'running', handle: H('f'.repeat(16)), access: { value: 'pw-after-leave' } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(ops.get().patches.get(key)?.accessCode).toBeUndefined();
    // The row still says it asks for a code, so a return shows "code not kept", not a bare address.
    expect(ops.get().patches.get(key)?.asksCode).toBe(true);
  });

  it('a copy another tab stores shows in this tab\'s Open list without a reload', async () => {
    const { addRecent, loadRecent, removeRecent, saveRecent, recentKey } = await import('./parts/recent');
    S.status = never;
    await renderPage(page, { path: '/apps' });
    await screen.findAllByRole('button', { name: strings['launch.action'] });
    await act(async () => void (await new Promise((r) => setTimeout(r, 100))));
    const other = fromHandle(H('a'.repeat(16)), { name: 'btop-other-tab', app: 'btop-other-tab' }, Date.now())!;
    saveRecent(addRecent(loadRecent(), other));
    try {
      // The browser tells other tabs of a write by a storage event on the raw key.
      await act(async () => void window.dispatchEvent(new StorageEvent('storage', { key: 'hub_apps_recent_v2' })));
      const table = await screen.findByRole('table', { name: strings['tab.open'] });
      expect(await within(table).findByRole('row', { name: /btop-other-tab/ })).toBeInTheDocument();
    } finally {
      saveRecent(removeRecent(loadRecent(), recentKey(other)));
    }
  });
});

describe('apps page, live mode: a failed Restart on an unknown row', () => {
  it('a Restart that fails on a row already unknown says the app may still be running, not just "Didn\'t restart"', async () => {
    S.status = never;
    S.close = () => Promise.resolve({ ok: false, code: 'stop_failed', message: '', state: 'running' } as RunResult);
    const row = fromHandle(H('9'.repeat(16)), { name: 'htop', catalogId: 'htop', app: 'htop' }, 1)!;
    ops.addLaunch({ key: 'k11', name: 'htop', catalogId: 'htop', app: 'htop', opensIn: 'terminal', state: 'unknown', code: 'start_unconfirmed', terminal: 15001, handle: '9'.repeat(16), source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
    ops.bind('k11', row);
    await renderPage(page, { path: '/apps' });
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    await userEvent.click(within(await within(table).findByRole('row', { name: /htop/ })).getByRole('button', { name: 'Row actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.restart'] }));
    await waitFor(() => expect(S.closes).toBe(1));
    expect((await screen.findAllByText(strings['note.restartFailedUnknown'])).length).toBeGreaterThan(0);
    expect(screen.queryByText(strings['note.restartFailed'])).toBeNull();
    expect(S.reqs).toHaveLength(0);
  });
});
