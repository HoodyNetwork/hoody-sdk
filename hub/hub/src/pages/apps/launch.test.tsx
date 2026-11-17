// Vitest: the launcher as other pages mount it (the Board's AppLauncher and LaunchHold), in live mode with the
// core's run-open machine scripted per test, plus the pure placement rules and the old /apps link mapping.
//
// One test per C9 rule the mount adds (the page's own rules are covered in live-mode.test.ts):
//   - never send twice: a Board Open held by an earlier launch of the same app sends nothing and places nothing;
//   - unknown is never shown as failed: an unknown outcome is placed as "may still be starting", never as failed;
//   - a hold frees only on proof or a warned Dismiss: Check is one read and no resend; Dismiss asks first;
//   - a tile is placed only once the Open is answered (the handle comes before the request leaves).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RunOpen, RunProgress, RunResult, Target } from '@core';
import { useCurrentComputer } from '@core';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import type { PageManifest } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as BoardLinks from '../board/links';
import type * as Data from './data';

type OpenFn = (o: { onProgress?: (e: RunProgress) => void }) => Promise<unknown>;
const S = vi.hoisted(() => ({
  reqs: [] as unknown[],
  open: (() => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' })) as OpenFn,
  status: (): Promise<unknown> => Promise.resolve({ ok: false, code: 'unreachable', message: '', state: 'unknown' }),
  statuses: 0,
  /** The targets core's hook was given (undefined: the current computer). */
  targets: [] as unknown[],
  /** Every watch made, with the handle it follows. */
  watches: [] as { computer: string; signal: AbortSignal }[],
  /** Terminal DELETEs sent (a leftover's Remove). */
  discards: 0,
  /** The catalogue answer, when a test gives its own (undefined: the page's fixture rules). */
  starters: undefined as unknown[] | undefined,
  /** The account core reports, when a test switches it (undefined: the real one). */
  account: undefined as string | undefined,
  /** Whether the Board can address a tile (undefined: the Board's real rule on the test's real-shaped ids). */
  fits: true as boolean | undefined,
  /** What the launcher asked the Board: [program, session] per call. */
  asked: [] as [string, number][],
}));
const CID = 'b'.repeat(24);
const EID = 'e'.repeat(24);
const PID = 'a'.repeat(24);
const never = () => new Promise<never>(() => {});

vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  return {
    ...real,
    LIVE: true,
    useCatalog: (...args: Parameters<typeof real.useCatalog>) =>
      S.starters ? ({ data: S.starters, isPending: false, error: null, refetch: () => Promise.resolve() } as unknown as ReturnType<typeof real.useCatalog>) : real.useCatalog(...args),
  };
});
vi.mock('../board/links', async (orig) => {
  const real = await orig<typeof BoardLinks>();
  return { ...real, tileHostFits: (...a: Parameters<typeof real.tileHostFits>) => (S.asked.push([a[0], a[1]]), S.fits ?? real.tileHostFits(...a)) };
});
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useEffect, useState } = await import('react');
  const t = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
  const machine = {
    open: (req: unknown, o: { onProgress?: (e: RunProgress) => void }) => {
      S.reqs.push(req);
      return S.open(o ?? {});
    },
    status: () => {
      S.statuses++;
      return S.status();
    },
    close: () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' }),
    discard: () => {
      S.discards++;
      return Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' });
    },
    watch: (h: { computer: { computer_id: string } }, o: { signal: AbortSignal }) => {
      S.watches.push({ computer: h.computer.computer_id, signal: o.signal });
      return new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ ok: false, code: 'aborted', message: '', state: 'unknown' })));
    },
  } as unknown as RunOpen;
  return {
    ...real,
    useCurrentComputer: () => t,
    useCore: () => {
      const c = real.useCore();
      return S.account === undefined ? c : { ...c, account: S.account };
    },
    useRunOpen: (o?: { target?: unknown }) => {
      S.targets.push(o?.target);
      const [m, setM] = useState<RunOpen | null>(null);
      useEffect(() => setM(machine), []);
      return m;
    },
  };
});

const { harness } = await import('./launch/harness');
const { default: strings } = await import('./strings.en.json');
const { ops } = await import('./parts/ops');
const { addRecent, fromHandle, loadRecent, saveRecent } = await import('./parts/recent');
const { AppLauncher, LaunchHold } = await import('./launch');
const { useLaunchHeld } = await import('./links');
const { placementOf } = await import('./launch/placement');
const { arrivalOf, arriving, resetArrivals } = await import('./parts/arrival');
const { arrivalKind } = await import('./launch/LaunchHold');
const { redirectFor } = await import('./view');

const targetFor = (id: string): Target => ({ project: { id: PID }, container: { id, server_name: 'n1' } }) as Target;
const H = (tag: string, computerId = CID, terminal = 15001, opens: 'terminal' | 'web' | 'screen' = 'terminal') => ({
  v: 1, terminal_id: terminal, incarnation: 'c'.repeat(32), command_id: 7, display: terminal, launch_tag: tag, opens_in: opens, computer: { project: PID, container: computerId },
});

/** A screen or web app's launch listed at display N (the place a screen app is shown), in the given state. */
function listedApp(key: string, state: string, opens: 'screen' | 'web', more: Partial<{ code: string; exitCode: number; ipv6Only: boolean }> = {}, terminal = 15001) {
  const tag = [...key].map((c) => c.charCodeAt(0).toString(16)).join('').padEnd(16, '0').slice(0, 16);
  // The wire names a screen app `window`; a web app's handle carries its port once a read gave it.
  const h = { ...H(tag, CID, terminal, (opens === 'screen' ? 'window' : 'web') as never), ...(opens === 'web' ? { web: { port: 8080, path: '/' } } : {}) };
  const row = fromHandle(h as never, { name: 'firefox', catalogId: 'firefox', app: 'firefox' }, 1)!;
  ops.addLaunch({ key, name: 'firefox', catalogId: 'firefox', app: 'firefox', opensIn: opens, state: state as 'running', code: more.code ?? '', ...(more.exitCode !== undefined ? { exitCode: more.exitCode } : {}), ...(more.ipv6Only ? { ipv6Only: true } : {}), terminal, handle: tag, source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID });
  ops.bind(key, row);
  return row;
}

/** A launch already listed (another page, an earlier Open) at terminal N of a computer. */
function listed(key: string, state: string, computerId = CID, terminal = 15001, app = 'htop') {
  const tag = [...key].map((c) => c.charCodeAt(0).toString(16)).join('').padEnd(16, '0').slice(0, 16);
  const row = fromHandle(H(tag, computerId, terminal) as never, { name: app, catalogId: app, app }, 1)!;
  ops.addLaunch({ key, name: app, catalogId: app, app, opensIn: 'terminal', state: state as 'unknown', code: state === 'unknown' ? 'start_unconfirmed' : '', terminal, handle: tag, source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: computerId });
  ops.bind(key, row);
  return row;
}

let View: () => ReactNode = () => null;
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <>{View()}</> }) };

const placed: unknown[] = [];
function Launcher({ target }: { target?: Target }) {
  const current = useCurrentComputer() as Target;
  return <AppLauncher target={target ?? current} onPlaced={(p) => placed.push(p)} />;
}

async function openInLauncher(name: string) {
  const list = await screen.findByRole('list', { name: strings['tab.find'] }, { timeout: 4000 });
  const row = (await within(list).findByText(name)).closest('li') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
}

beforeEach(() => {
  ops.reset();
  resetArrivals();
  saveRecent({ v: 2, rows: [], ack: [] } as never);
  S.reqs.length = 0;
  S.targets.length = 0;
  S.watches.length = 0;
  S.statuses = 0;
  S.discards = 0;
  S.open = () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' });
  S.status = () => Promise.resolve({ ok: false, code: 'unreachable', message: '', state: 'unknown' });
  S.starters = undefined;
  S.account = undefined;
  S.fits = true;
  S.asked.length = 0;
  placed.length = 0;
});

describe('AppLauncher (Board > Add a program)', () => {
  it('marks every result in its compact list with a chip naming where it was found', async () => {
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    const list = await screen.findByRole('list', { name: strings['tab.find'] }, { timeout: 4000 });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.querySelector('[class*="pill" i]')?.textContent?.trim(), row.textContent ?? '').toBeTruthy();
    const htop = (within(list).getByText('htop').closest('li') as HTMLElement);
    expect(within(htop).getByText('Ready to install').closest('[class*="pill" i]')).not.toBeNull();
  });

  it('runs on the computer it is given, not the current one', async () => {
    View = () => <Launcher target={targetFor(EID)} />;
    await renderPage(page, { path: '/apps' });
    await screen.findByRole('list', { name: strings['tab.find'] }, { timeout: 4000 });
    expect(S.targets.some((x) => (x as Target | undefined)?.container.id === EID)).toBe(true);
  });

  it('places a terminal app once its Open is answered, never while it is in flight (the handle comes first)', async () => {
    let answer!: (r: RunResult) => void;
    S.open = (o) => {
      o.onProgress?.({ handle: H('f'.repeat(16)) } as unknown as RunProgress);
      return new Promise((r) => (answer = r as never));
    };
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    // The handle is known and the row starts, but nothing answered yet.
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(placed).toEqual([]);
    expect(await screen.findByText(strings['launcher.opening'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    await act(async () => answer({ ok: true, code: 'started', message: '', state: 'started', handle: H('f'.repeat(16)) } as unknown as RunResult));
    await waitFor(() => expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]));
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(placed).toHaveLength(1);
    expect(S.reqs).toHaveLength(1);
  });

  it('places an unknown outcome with a handle (it may still be starting), never as failed', async () => {
    S.open = () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown', handle: H('9'.repeat(16)) });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    await waitFor(() => expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]));
    expect(screen.queryByText(strings['launcher.failed'].replace('{{name}}', 'htop'))).toBeNull();
  });

  it('an unknown outcome without a handle places nothing and offers Check, not Try again', async () => {
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    expect(await screen.findByText(strings['launcher.unknown'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['act.check'] }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: strings['act.retry'] })).toBeNull();
    expect(placed).toEqual([]);
  });

  it('a launch that definitely did not start places nothing and says why, with Try again', async () => {
    S.open = () => Promise.resolve({ ok: false, code: 'not_found', message: '', notSent: true, state: 'not_started' });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    expect(await screen.findByText(strings['launcher.failed'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['act.retry'] })).toBeInTheDocument();
    expect(placed).toEqual([]);
  });

  it('an Open held by an earlier unknown launch of the same app sends nothing and places nothing by itself', async () => {
    listed('k1', 'unknown');
    S.status = never;
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    expect(await screen.findByText(strings['launcher.held'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    expect(S.reqs).toHaveLength(0);
    expect(placed).toEqual([]);
    // A terminal the Board can show (pinned here) gets no new-tab note or link.
    expect(screen.queryByText(strings['launcher.noTile'].replace('{{name}}', 'htop'))).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(strings['launcher.openTab']) })).toBeNull();
    // Its terminal can still be added, by a press.
    await userEvent.click(screen.getByRole('button', { name: strings['launcher.addHeld'] }));
    expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]);
  });

  it('an earlier held launch that Check proves running is added only by a press, and Back stays', async () => {
    listed('k5', 'unknown');
    S.status = never;
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    await screen.findByText(strings['launcher.held'].replace('{{name}}', 'htop'));
    S.status = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' });
    await userEvent.click(screen.getAllByRole('button', { name: strings['act.check'] })[0] as HTMLElement);
    const add = await screen.findByRole('button', { name: strings['launcher.addTile'] });
    expect(screen.getByRole('button', { name: strings['launcher.back'] })).toBeInTheDocument();
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(placed).toEqual([]);
    await userEvent.click(add);
    expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]);
    expect(S.reqs).toHaveLength(0);
  });

  it('wiping the access code never places the tile by itself: Add stays, with a note', async () => {
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('5'.repeat(16)), access: { value: 'k7Gd-92xQ' } });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    const add = await screen.findByRole('button', { name: strings['launcher.addTile'] });
    expect(placed).toEqual([]);
    const key = [...ops.get().runs.keys()][0] as string;
    await act(async () => ops.unset(key, 'accessCode'));
    expect(await screen.findByText(strings['launcher.codeGone'])).toBeInTheDocument();
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(placed).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: strings['launcher.addTile'] }));
    expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]);
    expect(add).toBeTruthy();
  });

  it('every result stays reachable: past the first 50, Show more lists the rest', async () => {
    S.starters = Array.from({ length: 60 }, (_, i) => ({ id: `app${i}`, name: `App ${String(i).padStart(2, '0')}`, description: '', opensIn: 'terminal', available: true, shares: false }));
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    const list = await screen.findByRole('list', { name: strings['tab.find'] }, { timeout: 4000 });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(50));
    await userEvent.click(screen.getByRole('button', { name: strings['find.more_other'].replace('{{count}}', '10') }));
    expect(within(screen.getByRole('list', { name: strings['tab.find'] })).getAllByRole('listitem')).toHaveLength(60);
    expect(screen.queryByRole('button', { name: /^Show \d+ more/ })).toBeNull();
  });

  it('Options opens inside the panel, never as a second dialog', async () => {
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    const list = await screen.findByRole('list', { name: strings['tab.find'] }, { timeout: 4000 });
    const row = (await within(list).findByText('htop')).closest('li') as HTMLElement;
    // Options is an item of the row's ⋯ menu (the standard row actions).
    await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    expect(await screen.findByRole('heading', { name: strings['opt.title'].replace('{{name}}', 'htop') })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AppLauncher: a launch the Board cannot show as a tile (a terminal-15001 host label)', () => {
  // "<project>-<computer>-terminal-15001" on real-shaped ids (24 hex each) is 64 characters, past a host label's 63.
  // The Board's tiles now take core's short "t" form there (board links tileHostFits), so the real rule places it;
  // the cases after that have the Board refuse the tile (S.fits false), whatever its reason.
  const DOMAIN = 'fixture.invalid';
  const tabHref = (n: number) => `https://${PID}-${CID}-t-${n}.n1.${DOMAIN}`;
  const noTile = () => strings['launcher.noTile'].replace('{{name}}', 'htop');
  beforeEach(() => {
    S.fits = false;
  });

  it('on the real rule a terminal app at 15001 is placed: the Board takes the short host', async () => {
    S.fits = undefined;
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('5'.repeat(16)) });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    await waitFor(() => expect(placed).toEqual([{ kind: 'terminal', session: 15001 }]));
    expect(screen.queryByText(noTile())).toBeNull();
  });

  it('a terminal app the Board refuses at 15001 is not placed: the panel says why and opens it in a new tab', async () => {
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('6'.repeat(16)) });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    expect(await screen.findByText(noTile())).toBeInTheDocument();
    const tab = screen.getByRole('link', { name: new RegExp(strings['launcher.openTab']) });
    expect(tab).toHaveAttribute('href', tabHref(15001));
    expect(screen.getByRole('button', { name: strings['launcher.back'] })).toBeInTheDocument();
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(placed).toEqual([]);
    expect(S.reqs).toHaveLength(1);
  });

  it('an unknown outcome the Board refuses at 15001 is not placed either: the same offer, with Check', async () => {
    S.open = () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown', handle: H('7'.repeat(16)) });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    expect(await screen.findByText(noTile())).toBeInTheDocument();
    expect(screen.getByRole('link', { name: new RegExp(strings['launcher.openTab']) })).toHaveAttribute('href', tabHref(15001));
    expect(screen.getAllByRole('button', { name: strings['act.check'] }).length).toBeGreaterThan(0);
    await act(async () => void (await new Promise((r) => setTimeout(r, 50))));
    expect(placed).toEqual([]);
  });

  it('a held earlier launch the Board refuses at 15001 offers no Add button: it says why and offers only the new tab', async () => {
    listed('k6', 'unknown');
    // Its address as live reads give a listed row (live.ts urlsFor; the helper lists it without one).
    ops.patch('k6', { urls: { terminal: tabHref(15001) } });
    S.status = never;
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    expect(await screen.findByText(strings['launcher.held'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    expect(screen.getByText(noTile())).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['launcher.addHeld'] })).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(strings['launcher.openTab']) })).toHaveAttribute('href', tabHref(15001));
    expect(placed).toEqual([]);
    expect(S.reqs).toHaveLength(0);
  });

  it('a web app still waiting for its page, whose terminal the Board refuses, offers it in a new tab, then is placed at its port', async () => {
    S.starters = [{ id: 'jupyter', name: 'Jupyter', description: '', opensIn: 'web', available: true, shares: false }];
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('9'.repeat(16), CID, 15001, 'web') });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('Jupyter');
    expect(await screen.findByText(strings['launcher.waitWeb'].replace('{{name}}', 'Jupyter'))).toBeInTheDocument();
    expect(screen.getByText(strings['launcher.noTileTerminal'].replace('{{name}}', 'Jupyter'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['launcher.addTerminal'] })).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(strings['launcher.openTab']) })).toHaveAttribute('href', tabHref(15001));
    expect(screen.getAllByRole('button', { name: strings['act.check'] }).length).toBeGreaterThan(0);
    expect(placed).toEqual([]);
    // A read gives its port: a web port is never judged, so it is placed there and the terminal offer goes.
    const [key, run] = [...ops.get().runs.entries()][0]!;
    act(() => ops.bind(key, { ...run, web: { port: 8888, path: '/' } }));
    await waitFor(() => expect(placed).toEqual([{ kind: 'port', port: 8888, path: '/' }]));
    expect(S.reqs).toHaveLength(1);
  });

  it('on the real rule a screen app at display 15001 fits (display-15001 is 63 characters) and is placed', async () => {
    S.fits = undefined;
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('8'.repeat(16), CID, 15001, 'window' as never) });
    View = () => <Launcher />;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    await waitFor(() => expect(placed).toEqual([{ kind: 'display', session: 15001 }]));
    expect(screen.queryByText(noTile())).toBeNull();
    expect(S.asked).toContainEqual(['display', 15001]);
    expect(S.asked.some(([k]) => k === 'terminal')).toBe(false);
  });
});

describe('LaunchHold (a Board tile placed for an unproven launch)', () => {
  const tile = <p>the program</p>;

  it('a tile with no launch at its place is the program, untouched', async () => {
    View = () => (
      <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15009 }}>
        {tile}
      </LaunchHold>
    );
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(S.targets).toHaveLength(0);
  });

  it('holds an unknown launch with Check; Check is one read and never sends the launch again', async () => {
    listed('k2', 'unknown');
    View = () => (
      <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
        {tile}
      </LaunchHold>
    );
    await renderPage(page, { path: '/apps' });
    const check = await screen.findByRole('button', { name: strings['act.check'] }, { timeout: 4000 });
    expect(screen.queryByText('the program')).toBeNull();
    const before = S.statuses;
    await userEvent.click(check);
    await waitFor(() => expect(S.statuses).toBe(before + 1));
    expect(S.reqs).toHaveLength(0);
    expect(screen.queryByText('the program')).toBeNull();
  });

  it('a read that proves the launch shows the program', async () => {
    listed('k3', 'unknown');
    View = () => (
      <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
        {tile}
      </LaunchHold>
    );
    await renderPage(page, { path: '/apps' });
    await screen.findByRole('button', { name: strings['act.check'] }, { timeout: 4000 });
    S.status = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running' });
    await userEvent.click(screen.getByRole('button', { name: strings['act.check'] }));
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(S.reqs).toHaveLength(0);
  });

  it('Dismiss asks first: Cancel keeps the hold, Dismiss shows the program and lifts the hold', async () => {
    listed('k4', 'unknown');
    View = () => (
      <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
        {tile}
      </LaunchHold>
    );
    await renderPage(page, { path: '/apps' });
    await userEvent.click(await screen.findByRole('button', { name: strings['act.dismiss'] }, { timeout: 4000 }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Cancel/ }));
    expect(screen.queryByText('the program')).toBeNull();
    expect(ops.get().forgotten.has('k4')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: strings['act.dismiss'] }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: strings['dismiss.confirm'] }));
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(ops.get().forgotten.has('k4')).toBe(true);
  });

  it('after a reload the program never mounts before the stored launch is proven', async () => {
    S.status = never;
    let mounts = 0;
    function Program() {
      useState(() => void mounts++);
      return <p>the program</p>;
    }
    let show!: () => void;
    function Later() {
      const [on, setOn] = useState(false);
      show = () => setOn(true);
      return on ? (
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
          <Program />
        </LaunchHold>
      ) : null;
    }
    View = () => <Later />;
    await renderPage(page, { path: '/apps' });
    const row = fromHandle(H('6'.repeat(16)) as never, { name: 'htop', catalogId: 'htop', app: 'htop' }, 1)!;
    saveRecent(addRecent(loadRecent(), row));
    await act(async () => show());
    await screen.findByText(strings['hold.checking'].replace('{{name}}', 'htop'), {}, { timeout: 4000 });
    expect(mounts).toBe(0);
  });

  it('an older ended launch at the place never lets the program in before a newer stored launch is read', async () => {
    S.status = never;
    listed('k6', 'exited');
    let mounts = 0;
    function Program() {
      useState(() => void mounts++);
      return <p>the program</p>;
    }
    let show!: () => void;
    function Later() {
      const [on, setOn] = useState(false);
      show = () => setOn(true);
      return on ? (
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
          <Program />
        </LaunchHold>
      ) : null;
    }
    View = () => <Later />;
    await renderPage(page, { path: '/apps' });
    // Another tab reused terminal 15001 for a new launch and stored it.
    const row = fromHandle({ ...H('8'.repeat(16)), command_id: 9 } as never, { name: 'htop', catalogId: 'htop', app: 'htop' }, 5)!;
    saveRecent(addRecent(loadRecent(), row));
    await act(async () => show());
    await screen.findByText(strings['hold.checking'].replace('{{name}}', 'htop'), {}, { timeout: 4000 });
    expect(mounts).toBe(0);
  });

  it('a launch this tab dismissed, stored again by another tab, never strands the tile on loading', async () => {
    let show!: () => void;
    function Later() {
      const [on, setOn] = useState(false);
      show = () => setOn(true);
      return on ? (
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
          {tile}
        </LaunchHold>
      ) : null;
    }
    View = () => <Later />;
    await renderPage(page, { path: '/apps' });
    // Stored after core is up (renderPage starts from empty storage), then the tile mounts.
    const row = listed('k7', 'unknown');
    await act(async () => ops.forget('k7'));
    saveRecent(addRecent(loadRecent(), row));
    expect(loadRecent().rows).toHaveLength(1);
    await act(async () => show());
    expect(await screen.findByText('the program')).toBeInTheDocument();
    await act(async () => void (await new Promise((r) => setTimeout(r, 100))));
    expect(screen.getByText('the program')).toBeInTheDocument();
    expect(screen.queryByText(strings['hold.loading'])).toBeNull();
  });

  it('an account switch with the same machine lists the stored launch again: the tile never sticks on loading', async () => {
    S.status = never;
    let show!: () => void;
    let bump!: () => void;
    function Later() {
      const [on, setOn] = useState(false);
      const [, setN] = useState(0);
      show = () => setOn(true);
      bump = () => setN((n) => n + 1);
      return on ? (
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
          {tile}
        </LaunchHold>
      ) : null;
    }
    View = () => <Later />;
    await renderPage(page, { path: '/apps' });
    const row = fromHandle(H('4'.repeat(16)) as never, { name: 'htop', catalogId: 'htop', app: 'htop' }, 1)!;
    saveRecent(addRecent(loadRecent(), row));
    await act(async () => show());
    await screen.findByText(strings['hold.checking'].replace('{{name}}', 'htop'), {}, { timeout: 4000 });
    // The account changes; core's generation (so the machine) does not: the store is emptied, then refilled.
    const epoch = ops.get().epoch;
    S.account = 'switched-account';
    await act(async () => bump());
    await waitFor(() => expect(ops.get().epoch).toBeGreaterThan(epoch));
    expect(await screen.findByText(strings['hold.checking'].replace('{{name}}', 'htop'), {}, { timeout: 4000 })).toBeInTheDocument();
    await act(async () => void (await new Promise((r) => setTimeout(r, 100))));
    expect(screen.queryByText(strings['hold.loading'])).toBeNull();
    expect(screen.queryByText('the program')).toBeNull();
    expect(S.reqs).toHaveLength(0);
  });

  it('a stored launch at the place still holds after a reload (the recent list)', async () => {
    S.status = never;
    let show!: () => void;
    function Later() {
      const [on, setOn] = useState(false);
      show = () => setOn(true);
      return on ? (
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
          {tile}
        </LaunchHold>
      ) : null;
    }
    View = () => <Later />;
    await renderPage(page, { path: '/apps' });
    // Stored after core is up (as a reload finds it), then the tile mounts.
    const row = fromHandle(H('7'.repeat(16)) as never, { name: 'htop', catalogId: 'htop', app: 'htop' }, 1)!;
    saveRecent(addRecent(loadRecent(), row));
    await act(async () => show());
    expect(await screen.findByText(strings['hold.checking'].replace('{{name}}', 'htop'), {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('the program')).toBeNull();
    expect(S.reqs).toHaveLength(0);
  });

  it('a launch another tab stores at the place holds a tile already showing its program', async () => {
    S.status = never;
    View = () => (
      <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
        {tile}
      </LaunchHold>
    );
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByText('the program')).toBeInTheDocument();
    // The other tab's write: the bytes land in storage and this tab hears a storage event on the raw key.
    const row = fromHandle(H('8'.repeat(16)) as never, { name: 'htop', catalogId: 'htop', app: 'htop' }, 1)!;
    saveRecent(addRecent(loadRecent(), row));
    await act(async () => void window.dispatchEvent(new StorageEvent('storage', { key: 'hub_apps_recent_v2' })));
    expect(await screen.findByText(strings['hold.checking'].replace('{{name}}', 'htop'), {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('the program')).toBeNull();
    expect(S.reqs).toHaveLength(0);
  });
});

// After Launch, the tile says what is happening until the app is there (screen and web apps this tab sent).
describe('LaunchHold: the launch card', () => {
  const tile = <p>the program</p>;
  const fill = (k: keyof typeof strings, v: Record<string, string | number> = {}) => Object.entries(v).reduce((x, [n, w]) => x.replace(`{{${n}}}`, String(w)), strings[k] as string);
  const PORT = { kind: 'port', port: 8080, path: '/' } as const;
  const show = (at: { kind: 'display' | 'terminal'; session: number } | typeof PORT = { kind: 'display', session: 15001 }) => {
    View = () => (
      <LaunchHold target={targetFor(CID)} at={at}>
        {tile}
      </LaunchHold>
    );
    return renderPage(page, { path: '/apps' });
  };
  beforeEach(() => {
    S.status = never;
  });

  it('a screen app this tab sent, running but not there yet: the step, what it waits for, the time, and Show the screen now (sends nothing)', async () => {
    listedApp('w1', 'running', 'screen');
    arriving('w1', Date.now() - 12000);
    await show();
    const card = await screen.findByRole('group', { name: fill('card.starting', { name: 'firefox' }) }, { timeout: 4000 });
    expect(within(card).getByText(strings['card.waitScreen'])).toBeInTheDocument();
    expect(within(card).getByText(/^1[23] s$/)).toBeInTheDocument();
    // Before 15 s nothing says it downloads.
    expect(within(card).queryByText(strings['card.slow'])).toBeNull();
    expect(screen.queryByText('the program')).toBeNull();
    const reads = S.statuses;
    await userEvent.click(within(card).getByRole('button', { name: strings['card.showScreen'] }));
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(S.reqs).toHaveLength(0);
    expect(S.statuses).toBe(reads);
    expect(ops.get().forgotten.has('w1')).toBe(false);
  });

  it('the wait is a centred loader in the frame: a large spinner, the step as its title, the wait, the time, then Show', async () => {
    listedApp('w30', 'running', 'screen');
    arriving('w30', Date.now() - 20000);
    await show();
    const card = await screen.findByRole('group', { name: fill('card.starting', { name: 'firefox' }) }, { timeout: 4000 });
    expect(card.className).toContain('hold');
    const frame = card.firstElementChild as HTMLElement;
    expect(frame.className).toContain('frame');
    const loader = within(frame).getByRole('status', { name: fill('card.starting', { name: 'firefox' }) });
    expect(loader.className).toContain('spinnerLg');
    const title = within(frame).getByText(fill('card.starting', { name: 'firefox' }), { selector: 'p' });
    expect(title.className).toContain('title');
    // Reading order: spinner, title, what it waits for, the time, the download line, then Show.
    const order = [loader, title, within(frame).getByText(strings['card.waitScreen']), within(frame).getByText(/^\d+ s$/), within(frame).getByText(strings['card.slow']), within(frame).getByRole('button', { name: strings['card.showScreen'] })];
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The wait lines take the muted colour (.wait), the time its tabular figures too.
    for (const el of order.slice(2, 5)) expect(el.className).toContain('wait');
    expect(order[3]!.className).toContain('elapsed');
  });

  it('the ended card and the held Check sit in the same frame', async () => {
    listedApp('w31', 'exited', 'screen', { exitCode: 1 });
    arriving('w31');
    await show();
    const ended = await screen.findByRole('group', { name: fill('st.error', { name: 'firefox' }) }, { timeout: 4000 });
    expect(ended.className).toContain('hold');
    expect((ended.firstElementChild as HTMLElement).className).toContain('frame');
    expect(within(ended.firstElementChild as HTMLElement).getByRole('button', { name: strings['card.showScreenEnded'] })).toBeInTheDocument();
  });

  it('the held Check sits in the frame too', async () => {
    listedApp('w32', 'unknown', 'screen', { code: 'start_unconfirmed' });
    arriving('w32');
    await show();
    const check = await screen.findByRole('button', { name: strings['act.check'] }, { timeout: 4000 });
    const frame = check.closest('.frame');
    expect(frame).not.toBeNull();
    expect(frame!.parentElement!.className).toContain('hold');
    expect(within(frame as HTMLElement).getByRole('button', { name: strings['act.dismiss'] })).toBeInTheDocument();
  });

  it('starting reads "Getting it ready"; past 15 s it says the first start downloads it; past a minute in minutes and seconds', async () => {
    listedApp('w2', 'starting', 'screen');
    arriving('w2', Date.now() - 65000);
    await show();
    const card = await screen.findByRole('group', { name: fill('st.starting', { name: 'firefox' }) }, { timeout: 4000 });
    expect(within(card).getByText(strings['card.slow'])).toBeInTheDocument();
    expect(within(card).getByText(/^1 min [56] s$/)).toBeInTheDocument();
  });

  it('a web app waits for its page, with Show the page now', async () => {
    listedApp('w3', 'started', 'web');
    arriving('w3');
    await show(PORT);
    const card = await screen.findByRole('group', { name: fill('card.starting', { name: 'firefox' }) }, { timeout: 4000 });
    expect(within(card).getByText(strings['card.waitWeb'])).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: strings['card.showPage'] })).toBeInTheDocument();
  });

  it('leaves by itself once the app is there (ready), and the mark goes', async () => {
    listedApp('w4', 'running', 'screen');
    arriving('w4');
    await show();
    await screen.findByText(strings['card.waitScreen'], {}, { timeout: 4000 });
    act(() => ops.patch('w4', { state: 'ready', code: '' }));
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(arrivalOf('w4')).toBeUndefined();
    // A later read of running (its window closed) never brings the card back.
    act(() => ops.patch('w4', { state: 'running', code: '' }));
    expect(screen.getByText('the program')).toBeInTheDocument();
  });

  it('a web app that settles on IPv6 only (no ready will come) shows the program, and its mark goes', async () => {
    listedApp('w5', 'running', 'web');
    arriving('w5');
    await show(PORT);
    await screen.findByText(strings['card.waitWeb'], {}, { timeout: 4000 });
    act(() => ops.patch('w5', { state: 'running', code: '', ipv6Only: true }));
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(arrivalOf('w5')).toBeUndefined();
  });

  it('the terminal tile of a waiting screen app is its terminal; the display tile keeps the card', async () => {
    listedApp('w13', 'running', 'screen');
    arriving('w13');
    View = () => (
      <>
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 15001 }}>
          <p>the terminal</p>
        </LaunchHold>
        <LaunchHold target={targetFor(CID)} at={{ kind: 'display', session: 15001 }}>
          <p>the display</p>
        </LaunchHold>
      </>
    );
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByText('the terminal', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getAllByText(strings['card.waitScreen'])).toHaveLength(1);
    expect(screen.queryByText('the display')).toBeNull();
    expect(arrivalOf('w13')).toBeDefined();
  });

  it('the download line comes once 15 s have passed, while the card is shown, and says "if"', async () => {
    listedApp('w14', 'running', 'screen');
    arriving('w14', Date.now() - 14000);
    await show();
    await screen.findByText(strings['card.waitScreen'], {}, { timeout: 4000 });
    expect(screen.queryByText(strings['card.slow'])).toBeNull();
    expect(await screen.findByText(strings['card.slow'], {}, { timeout: 4000 })).toBeInTheDocument();
    expect(strings['card.slow']).toMatch(/^If /);
  });

  it('a launch this tab did not send (a reload, another tab) shows the program, never "Starting"', async () => {
    listedApp('w6', 'running', 'screen');
    await show();
    expect(await screen.findByText('the program', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['card.waitScreen'])).toBeNull();
  });

  it('a terminal app this tab sent shows its terminal: it prints its own progress', async () => {
    listed('w7', 'running');
    arriving('w7');
    await show({ kind: 'terminal', session: 15001 });
    expect(await screen.findByText('the program', {}, { timeout: 4000 })).toBeInTheDocument();
  });

  it('an unknown outcome keeps the C9 hold (Check, never a step or a time)', async () => {
    listedApp('w8', 'unknown', 'screen', { code: 'start_unconfirmed' });
    arriving('w8');
    await show();
    expect(await screen.findByRole('button', { name: strings['act.check'] }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['card.waitScreen'])).toBeNull();
    expect(screen.queryByText('the program')).toBeNull();
  });

  it('ended before it was there: says so in the row\'s words, points to Add a program, offers no Try again', async () => {
    listedApp('w9', 'exited', 'screen', { exitCode: 1 });
    arriving('w9');
    await show();
    const card = await screen.findByRole('group', { name: fill('st.error', { name: 'firefox' }) }, { timeout: 4000 });
    expect(within(card).getByText(strings['card.again'])).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: strings['act.retry'] })).toBeNull();
    expect(within(card).queryByText(/may/)).toBeNull();
    // Show only: no Dismiss (a terminal it left keeps the row's own Remove).
    expect(within(card).getAllByRole('button').map((b) => b.textContent)).toEqual([strings['card.showScreenEnded']]);
    const reads = S.statuses;
    await userEvent.click(within(card).getByRole('button', { name: strings['card.showScreenEnded'] }));
    expect(await screen.findByText('the program')).toBeInTheDocument();
    expect(S.reqs).toHaveLength(0);
    expect(S.statuses).toBe(reads);
    expect(S.discards).toBe(0);
  });

  it('a launch that left its terminal behind never gets the card: the row keeps its Remove', async () => {
    listedApp('w15', 'not_started', 'screen', { code: 'terminal_left' });
    arriving('w15');
    await show();
    expect(await screen.findByText('the program', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(S.discards).toBe(0);
  });

  it('never started: its own words', async () => {
    listedApp('w10', 'not_started', 'screen', { code: 'not_found' });
    arriving('w10');
    await show();
    expect(await screen.findByRole('group', { name: fill('st.notStarted', { name: 'firefox' }) }, { timeout: 4000 })).toBeInTheDocument();
  });

  it('the mark goes with a Dismiss and with an account or realm switch', async () => {
    listedApp('w11', 'running', 'screen');
    arriving('w11');
    act(() => ops.forget('w11'));
    expect(arrivalOf('w11')).toBeUndefined();
    arriving('w12');
    act(() => ops.reset());
    expect(arrivalOf('w12')).toBeUndefined();
    // A second Open of the same row starts its time again; a terminal app's mark goes (no card ever shows for one).
    arriving('w16', 1);
    arriving('w16', 5);
    expect(arrivalOf('w16')).toBe(5);
    listed('w17', 'starting');
    arriving('w17');
    act(() => ops.patch('w17', { opensIn: 'terminal' }));
    expect(arrivalOf('w17')).toBeUndefined();
  });

  it('arrivalKind (pure): only screen and web apps with a mark, at their own place; wait, ended or nothing', () => {
    const D = { kind: 'display', session: 1 } as const;
    const T = { kind: 'terminal', session: 1 } as const;
    expect(arrivalKind({ state: 'running', opensIn: 'screen' }, 1, D)).toBe('wait');
    expect(arrivalKind({ state: 'running', opensIn: 'screen' }, undefined, D)).toBeNull();
    expect(arrivalKind({ state: 'running', opensIn: 'screen' }, 1, T)).toBeNull();
    expect(arrivalKind({ state: 'running', opensIn: 'web' }, 1, T)).toBeNull();
    expect(arrivalKind({ state: 'running', opensIn: 'web' }, 1, D)).toBeNull();
    expect(arrivalKind({ state: 'running', opensIn: 'web' }, 1, PORT)).toBe('wait');
    expect(arrivalKind({ state: 'running', opensIn: 'terminal' }, 1, T)).toBeNull();
    expect(arrivalKind({ state: 'running', opensIn: 'web', ipv6Only: true }, 1, PORT)).toBeNull();
    expect(arrivalKind({ state: 'ready', opensIn: 'web' }, 1, PORT)).toBeNull();
    expect(arrivalKind({ state: 'unknown', opensIn: 'web' }, 1, PORT)).toBeNull();
    expect(arrivalKind({ state: 'stopped', opensIn: 'screen' }, 1, D)).toBeNull();
    expect(arrivalKind({ state: 'exited', opensIn: 'screen' }, 1, D)).toBe('ended');
    expect(arrivalKind({ state: 'not_started', opensIn: 'web' }, 1, PORT)).toBe('ended');
    expect(arrivalKind({ state: 'not_started', opensIn: 'screen', code: 'terminal_left' }, 1, D)).toBeNull();
  });
});

describe('AppLauncher: the Open in flight says the machine\'s step', () => {
  it('follows the phase: finding, preparing a place, starting; a sent Open marks the launch for the tile\'s card', async () => {
    let step!: (e: RunProgress) => void;
    let answer!: (r: RunResult) => void;
    S.open = (o) => {
      step = (e) => o.onProgress?.(e);
      return new Promise((r) => (answer = r as never));
    };
    View = () => (
      <>
        <Launcher />
        <LaunchHold target={targetFor(CID)} at={{ kind: 'display', session: 15001 }}>
          <p>the program</p>
        </LaunchHold>
      </>
    );
    S.status = never;
    await renderPage(page, { path: '/apps' });
    await openInLauncher('htop');
    await waitFor(() => expect(S.reqs).toHaveLength(1));
    expect(await screen.findByText(strings['launcher.opening'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    // The time since the Open was sent, beside the line.
    expect(screen.getByText(/^[0-9] s$/)).toBeInTheDocument();
    act(() => step({ state: 'starting', phase: 'resolve' }));
    expect(await screen.findByText(strings['launcher.phase.resolve'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    act(() => step({ state: 'starting', phase: 'create' }));
    expect(await screen.findByText(strings['launcher.phase.create'])).toBeInTheDocument();
    act(() => step({ state: 'starting', phase: 'execute', handle: H('d'.repeat(16), CID, 15001, 'window' as never) } as unknown as RunProgress));
    expect(await screen.findByText(strings['launcher.phase.execute'].replace('{{name}}', 'htop'))).toBeInTheDocument();
    // Answered: started. The display tile shows the card, not an empty screen.
    await act(async () => answer({ ok: true, code: 'started', message: '', state: 'started', handle: H('d'.repeat(16), CID, 15001, 'window' as never) } as unknown as RunResult));
    await waitFor(() => expect(placed).toEqual([{ kind: 'display', session: 15001 }]));
    expect(await screen.findByText(strings['card.waitScreen'], {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText('the program')).toBeNull();
    expect(S.reqs).toHaveLength(1);
  });

  it('the time beside the line moves on by itself while the Open is out (the clock ticks each second)', async () => {
    S.open = () => new Promise(() => undefined);
    View = () => <Launcher />;
    // Only the interval and the date are faked: the page and the queries keep real timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      await renderPage(page, { path: '/apps' });
      await openInLauncher('htop');
      await waitFor(() => expect(S.reqs).toHaveLength(1));
      expect(await screen.findByText(strings['launcher.opening'].replace('{{name}}', 'htop'))).toBeInTheDocument();
      expect(screen.getByText('0 s')).toBeInTheDocument();
      await act(async () => void vi.advanceTimersByTime(3000));
      expect(screen.getByText('3 s')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useLaunchHeld (the Board mounts the hold only where the launcher would hold)', () => {
  const comp = { id: CID, project_id: PID, server_name: 'n1' };
  function Probe({ tile, live = true }: { tile: { program?: string; session?: number; protocol?: string; port?: number }; live?: boolean }) {
    return <p>{`held:${String(useLaunchHeld(comp, tile, live))}`}</p>;
  }

  it('is false for a tile with no launch at its place, and for tiles that cannot show one', async () => {
    listed('k8', 'unknown');
    View = () => (
      <>
        <Probe tile={{ program: 'terminal', session: 15009 }} />
        <Probe tile={{ program: 'agent' }} />
      </>
    );
    await renderPage(page, { path: '/apps' });
    expect(await screen.findAllByText('held:false')).toHaveLength(2);
  });

  it('is true for the place of a launch of this session, and false again once it is dismissed', async () => {
    listed('k9', 'unknown');
    View = () => <Probe tile={{ program: 'terminal', session: 15001 }} />;
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByText('held:true')).toBeInTheDocument();
    await act(async () => ops.forget('k9'));
    expect(await screen.findByText('held:false')).toBeInTheDocument();
  });

  it('counts a stored launch only where live reads list stored rows', async () => {
    let show!: () => void;
    function Later() {
      const [on, setOn] = useState(false);
      show = () => setOn(true);
      return on ? (
        <>
          <Probe tile={{ program: 'terminal', session: 15001 }} />
          <Probe tile={{ program: 'terminal', session: 15001 }} live={false} />
        </>
      ) : null;
    }
    View = () => <Later />;
    await renderPage(page, { path: '/apps' });
    saveRecent(addRecent(loadRecent(), fromHandle(H('3'.repeat(16)) as never, { name: 'htop' }, 1)!));
    await act(async () => show());
    expect(await screen.findByText('held:true')).toBeInTheDocument();
    expect(screen.getByText('held:false')).toBeInTheDocument();
  });

  it('follows another tab: its stored launch holds at once, and a storage clear lifts it', async () => {
    View = () => <Probe tile={{ program: 'terminal', session: 15001 }} />;
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByText('held:false')).toBeInTheDocument();
    saveRecent(addRecent(loadRecent(), fromHandle(H('9'.repeat(16)) as never, { name: 'htop' }, 1)!));
    await act(async () => void window.dispatchEvent(new StorageEvent('storage', { key: 'hub_apps_recent_v2' })));
    expect(await screen.findByText('held:true')).toBeInTheDocument();
    // Another key's event reads nothing new; a clear (key null) is read like a write.
    saveRecent({ v: 2, rows: [], ack: [] } as never);
    await act(async () => void window.dispatchEvent(new StorageEvent('storage', { key: 'some_other_key' })));
    expect(screen.getByText('held:true')).toBeInTheDocument();
    await act(async () => void window.dispatchEvent(new StorageEvent('storage', { key: null })));
    expect(await screen.findByText('held:false')).toBeInTheDocument();
  });

  it('hears a write landing after the first render and before the first match follows storage', async () => {
    // The first tile mounts with no listener yet; the other tab's write and event land in its layout effect, so
    // after the render read storage and before the subscription installs the listener.
    function Early() {
      const held = useLaunchHeld(comp, { program: 'terminal', session: 15001 }, true);
      useLayoutEffect(() => {
        saveRecent(addRecent(loadRecent(), fromHandle(H('a'.repeat(16)) as never, { name: 'htop' }, 1)!));
        window.dispatchEvent(new StorageEvent('storage', { key: 'hub_apps_recent_v2' }));
      }, []);
      return <p>{`held:${String(held)}`}</p>;
    }
    View = () => <Early />;
    await renderPage(page, { path: '/apps' });
    expect(await screen.findByText('held:true')).toBeInTheDocument();
  });
});

describe('two launchers on two computers', () => {
  it('keep their own watches: closing one never stops the other\'s', async () => {
    S.open = () => {
      const computerId = S.reqs.length === 1 ? CID : EID;
      return Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H(S.reqs.length === 1 ? '1'.repeat(16) : '2'.repeat(16), computerId) });
    };
    let hideE!: () => void;
    function Two() {
      const [showE, setShowE] = useState(true);
      hideE = () => setShowE(false);
      return (
        <>
          <Launcher target={targetFor(CID)} />
          {showE ? <Launcher target={targetFor(EID)} /> : null}
        </>
      );
    }
    View = () => <Two />;
    await renderPage(page, { path: '/apps' });
    await waitFor(() => expect(screen.getAllByRole('list', { name: strings['tab.find'] })).toHaveLength(2), { timeout: 4000 });
    for (const i of [0, 1]) {
      // The first list each time: once b's launch is placed, its panel shows the launch and e's list is first.
      const list = screen.getAllByRole('list', { name: strings['tab.find'] })[0] as HTMLElement;
      const row = (await within(list).findByText('htop')).closest('li') as HTMLElement;
      await userEvent.click(within(row).getByRole('button', { name: strings['act.open'] }));
      await waitFor(() => expect(S.reqs).toHaveLength(i + 1));
    }
    await waitFor(() => {
      expect(S.watches.some((w) => w.computer === CID)).toBe(true);
      expect(S.watches.some((w) => w.computer === EID)).toBe(true);
    });
    await act(async () => hideE());
    await waitFor(() => expect(S.watches.filter((w) => w.computer === EID).every((w) => w.signal.aborted)).toBe(true));
    expect(S.watches.filter((w) => w.computer === CID).some((w) => !w.signal.aborted)).toBe(true);
  });
});

describe('placement (pure)', () => {
  const run = fromHandle(H('1'.repeat(16)) as never, { name: 'x' }, 1)!;
  it('nothing while in flight or without a handle', () => {
    expect(placementOf({ state: 'started', opensIn: 'terminal' }, run, true)).toEqual({});
    expect(placementOf({ state: 'started', opensIn: 'terminal' }, undefined)).toEqual({});
  });
  it('a terminal app is its terminal, a screen app its display, a web app its port once read', () => {
    expect(placementOf({ state: 'running', opensIn: 'terminal' }, run).now).toEqual({ kind: 'terminal', session: 15001 });
    expect(placementOf({ state: 'running', opensIn: 'screen' }, run).now).toEqual({ kind: 'display', session: 15001 });
    expect(placementOf({ state: 'starting', opensIn: 'web' }, run).now).toBeUndefined();
    expect(placementOf({ state: 'running', opensIn: 'web' }, { ...run, web: { port: 8080, path: '/lab' } }).now).toEqual({ kind: 'port', port: 8080, path: '/lab' });
  });
  it('unknown is placed (a web app as its terminal); ended or not started is placed nowhere', () => {
    expect(placementOf({ state: 'unknown', opensIn: 'web' }, run).now).toEqual({ kind: 'terminal', session: 15001 });
    for (const state of ['stopped', 'exited', 'not_started'] as const) expect(placementOf({ state, opensIn: 'terminal' }, run)).toEqual({});
  });
});

describe('the old /apps links', () => {
  it('lead to the Apps tab of Programs, keeping what they pointed at', () => {
    expect(redirectFor({})).toBe('/programs?tab=apps');
    expect(redirectFor({ tab: 'open', q: 'lab' })).toBe('/programs?tab=apps&appq=lab');
    expect(redirectFor({ sel: 'a1b2c3' })).toBe('/programs?tab=apps&appsel=a1b2c3');
    expect(redirectFor({ tab: 'find', q: 'jupyter lab' })).toBe('/programs?tab=apps&launch=1&launchq=jupyter%20lab');
  });
});
