// Vitest: shared launch safety for Files launches, over
// the launcher as pages mount it, in live mode with the core's run-open machine scripted per test. Core holds
// (attempts) are the real ones.
//   - a started launch holds a second Open; a Files launch is never re-run by itself, nor sent unless openWith built it;
//   - a Files launch without its plan never stops or sends anything to start again (Open again from Files);
//   - no exec permission: Restart stops nothing; a Restart that stops nothing frees what it claimed (unsent cleanup);
//   - a Board tile at an Open-with hold's place shows the launch's card, never the frame, until that launch is
//     proven, whatever a newer row at that reused number says; its Check reads that launch with its own tag.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RunHandle, RunOpen, Target } from '@core';
import type { LiveCtx } from './parts/live';
import { useCurrentComputer } from '@core';
import { useSyncExternalStore, type ReactNode } from 'react';
import type { PageManifest } from '@kit';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';

type Opts = { expectTag?: string };
const S = vi.hoisted(() => ({
  can: true,
  opens: 0,
  reqs: [] as unknown[],
  open: (_o?: { onProgress?: (e: unknown) => void }): Promise<unknown> => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' }),
  /** Every read: its handle and options. */
  reads: [] as { h: { launch_tag: string }; o: unknown }[],
  status: (_h: { launch_tag: string }, _o?: unknown): Promise<unknown> => Promise.resolve({ ok: false, code: 'unreachable', message: '', state: 'unknown', transient: true }),
  closes: [] as { h: { launch_tag: string }; o: unknown }[],
  close: (): Promise<unknown> => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' }),
  /** Every discard (a leftover terminal's Remove): the leftover it was given. */
  discards: [] as unknown[],
  discard: (): Promise<unknown> => Promise.resolve({ ok: true, code: 'removed', message: '' }),
  /** The account the page's capture() names, when a test switches it (undefined: the real one). */
  acct: undefined as string | undefined,
}));
const CID = 'b'.repeat(24);
const PID = 'a'.repeat(24);
const never = () => new Promise<never>(() => {});

vi.mock('./data', async (orig) => ({ ...(await orig<typeof Data>()), LIVE: true }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const { useEffect, useState } = await import('react');
  const t = { project: { id: 'a'.repeat(24) }, container: { id: 'b'.repeat(24), server_name: 'n1' } };
  const machine = {
    open: (req: unknown, o?: { onProgress?: (e: unknown) => void }) => {
      S.opens++;
      S.reqs.push(req);
      return S.open(o);
    },
    discard: (lo: unknown) => {
      S.discards.push(lo);
      return S.discard();
    },
    status: (h: { launch_tag: string }, o?: unknown) => {
      S.reads.push({ h, o });
      return S.status(h, o);
    },
    close: (h: { launch_tag: string }, o?: unknown) => {
      S.closes.push({ h, o });
      return S.close();
    },
    watch: (_h: unknown, o: { signal: AbortSignal }) => new Promise((resolve) => o.signal.addEventListener('abort', () => resolve({ ok: false, code: 'aborted', message: '', state: 'unknown' }))),
  } as unknown as RunOpen;
  return {
    ...real,
    can: (cap: string) => (cap === 'computers.actions.exec' ? S.can : real.can(cap)),
    capture: (...a: Parameters<typeof real.capture>) => {
      const c = real.capture(...a);
      return S.acct === undefined ? c : { ...c, account: S.acct };
    },
    useCurrentComputer: () => t,
    useRunOpen: () => {
      const [m, setM] = useState<RunOpen | null>(null);
      useEffect(() => setM(machine), []);
      return m;
    },
  };
});

const { harness } = await import('./launch/harness');
const { default: strings } = await import('./strings.en.json');
const { ops } = await import('./parts/ops');
const { addRecent, fromHandle, leftRow, loadRecent, readRecent, saveRecent } = await import('./parts/recent');
const live = await import('./parts/live');
const { heldOpen, rowView, unresolved } = await import('./logic');
const { LaunchHold } = await import('./launch');
const { useApps } = await import('./launch/useApps');
const { heldAttempts, holdAttempt } = await import('@core');
const { CHANGE_STORE_KEY, readChanges, writeChanges } = await import('@core/change-store');
const { default: owStrings } = await import('./launch/openWith/strings.en.json');
const argv = await import('./launch/openWith/argv');
/** A marked item sealed with options toLaunch can build (the dispatch guard checks the sealed options). */
const sealedAs = (p: 'tpl' | 'cmd', it: typeof item = item) => {
  const o = {
    args: p === 'cmd' ? ['-c', `${argv.PRE_CMD_FILE}nano "$1"`, argv.ARG0] : ['-c', argv.SCRIPT_FILE, argv.ARG0, '/usr/bin/nano'],
    env: { [argv.FILE_VAR]: '/x/a.txt' }, opensIn: 'terminal' as const, shell: 'bash' as const, beforeExecute: () => Promise.resolve(true),
  };
  return live.sealLaunch({ ...it, p }, o);
};
/** A marked row's card words when it reads unknown (wordsFor). */
const owUnknown = (p: string) => owStrings['w.unknown'].replace('{{p}}', p);

type Apps = ReturnType<typeof useApps>;
const targetFor = (id: string): Target => ({ project: { id: PID }, container: { id, server_name: 'n1' } }) as Target;
const INC = 'c'.repeat(32);
const H = (tag: string, terminal = 8003, opens: 'terminal' | 'window' = 'terminal'): RunHandle =>
  ({ v: 1, terminal_id: terminal, incarnation: INC, command_id: 7, display: terminal, launch_tag: tag, opens_in: opens, computer: { project: PID, computer_id: CID } }) as RunHandle;

/** A launch row already listed and bound (an earlier Open, or one read back after a reload). */
function listed(key: string, state: string, o: { p?: string; tag?: string; terminal?: number; app?: string; code?: string; startedAt?: number } = {}) {
  const tag = o.tag ?? 'd'.repeat(16);
  const app = o.app ?? 'htop';
  const row = fromHandle(H(tag, o.terminal ?? 8003), { name: app, app, ...(o.p ? { p: o.p } : {}) }, o.startedAt ?? 1)!;
  ops.addLaunch({
    key, name: app, app, opensIn: 'terminal', state: state as 'unknown', code: o.code ?? '', terminal: o.terminal ?? 8003, handle: tag, source: '', command: '', settings: [], urls: {},
    startedAt: o.startedAt ?? 1, computer: CID, ...(o.p ? { p: o.p } : {}),
  });
  ops.bind(key, row);
  return row;
}
const patched = (key: string) => ({ ...ops.get().launches.find((l) => l.key === key)!, ...ops.get().patches.get(key) });

let View: () => ReactNode = () => null;
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: () => <>{View()}</> }) };
let A!: Apps;
const files: string[] = [];
function Hook() {
  A = useApps({ target: useCurrentComputer() as Target, nav: { select: () => undefined, openFiles: (r) => void files.push(r.key) } });
  return <p>hook</p>;
}
async function mountHook() {
  View = () => <Hook />;
  await renderPage(page, { path: '/apps' });
  await screen.findByText('hook');
  await waitFor(() => expect(A.live.m).not.toBeNull());
}

/** An Open-with hold for a launch at terminal N of the computer, as the launch barrier writes it. */
async function owHold(tag: string, n = 8003, program = 'Nano') {
  const r = await holdAttempt(`ow:${CID}:${tag.repeat(2)}`, {
    by: 'apps:openwith',
    meta: { v: 2, p: 'tpl', program, opens: 'terminal', tag, handle: { terminal_id: n, incarnation: INC, command_id: 7 } },
  });
  if (!r.ok) throw new Error('not held: ' + r.code);
  return r.hold;
}

beforeEach(() => {
  mount.set(true);
  ops.reset();
  saveRecent(readRecent(null));
  S.can = true;
  S.opens = 0;
  S.reqs.length = 0;
  S.reads.length = 0;
  S.closes.length = 0;
  S.discards.length = 0;
  S.acct = undefined;
  files.length = 0;
  S.open = () => Promise.resolve({ ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' });
  S.status = () => Promise.resolve({ ok: false, code: 'unreachable', message: '', state: 'unknown', transient: true });
  S.close = () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped' });
  S.discard = () => Promise.resolve({ ok: true, code: 'removed', message: '' });
});
afterEach(async () => {
  vi.useRealTimers();
  // Free every hold a test left, so the next starts with none.
  for (const h of heldAttempts()) {
    const { attemptFor } = await import('@core');
    attemptFor(h.id, h.by)?.dismiss(true);
  }
});

const item = { type: 'row' as const, name: 'Nano · a.txt', id: 'bashcand', description: '', opensIn: 'terminal' as const, by: 'server' as const, provider: 'system' as const, version: '', attr: '', path: '', sourceId: '', setId: '', app: 'bash', shares: false, runnable: true, unsure: false, installed: false, also: [], ready: true, tier: 0, ord: 0, group: 0 as const, detail: '' };

describe('a launch admitted but not proven holds a second one', () => {
  it('ow_pending_blocks_second_launch: a started copy is held (heldOpen), so an Open of the same app sends nothing', async () => {
    expect(heldOpen({ state: 'started' })).toBe(true);
    const rows = [{ ...patched0('k'), state: 'started' as const }];
    expect(unresolved(rows, { app: 'htop' })).toHaveLength(1);
    S.status = never;
    listed('k1', 'started');
    await mountHook();
    await act(async () => void (await A.launch({ ...item, app: 'htop', name: 'htop', type: 'row', id: 'x' }, { opensIn: 'terminal' }, true)));
    expect(S.opens).toBe(0);
    expect(ops.get().patches.get('k1')?.note).toBe('held');
  });
});

function patched0(key: string) {
  return { key, name: 'htop', app: 'htop', opensIn: 'terminal' as const, state: 'unknown' as const, terminal: 8003, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID };
}

describe('a Files launch is sent only as built, and never again by itself', () => {
  const ctx = (): LiveCtx => ({
    m: { open: () => (S.opens++, Promise.resolve({ ok: false, code: 'source_warming', message: '', notSent: true })) } as unknown as RunOpen,
    target: targetFor(CID),
  });

  it('ow_warming_never_autorelaunches: a source still warming leaves the Files launch for the person (one resolve, Try again)', async () => {
    vi.useFakeTimers();
    ops.addLaunch({ ...patched0('w1'), state: 'starting', p: 'tpl' });
    await live.liveOpen(ctx(), 'w1', sealedAs('tpl'), {});
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(S.opens).toBe(1);
    expect(patched('w1')).toMatchObject({ state: 'not_started', code: 'warming_manual' });
    expect(rowView(patched('w1') as never).primary).toBe('files'); // no plan registered: only from Files
    // An ordinary launch still waits it out by itself.
    ops.addLaunch({ ...patched0('w2'), state: 'starting' });
    await live.liveOpen(ctx(), 'w2', { ...item }, {});
    await vi.advanceTimersByTimeAsync(11_000);
    expect(S.opens).toBe(3);
  });

  it('a marked launch openWith did not build is refused unsent (dispatch guard)', async () => {
    ops.addLaunch({ ...patched0('g1'), state: 'starting', p: 'tpl' });
    let opened = 0;
    await live.liveOpen({ m: { open: () => (opened++, Promise.resolve({ ok: true })) } as unknown as RunOpen, target: targetFor(CID) }, 'g1', { ...item, p: 'tpl' }, {});
    expect(opened).toBe(0);
    expect(patched('g1')).toMatchObject({ state: 'not_started', code: 'invalid_options' });
  });

  it('no exec permission at the entry: nothing is sent, the row says why', async () => {
    S.can = false;
    ops.addLaunch({ ...patched0('e1'), state: 'starting' });
    let opened = 0;
    await live.liveOpen({ m: { open: () => (opened++, Promise.resolve({ ok: true })) } as unknown as RunOpen, target: targetFor(CID) }, 'e1', { ...item }, {});
    expect(opened).toBe(0);
    expect(patched('e1')).toMatchObject({ state: 'not_started', code: 'exec_off' });
  });

  it('a Files launch lists no settings and its row keeps its marker in the recent list', async () => {
    await mountHook();
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H('e'.repeat(16)) });
    await act(async () => void (await A.launch(sealedAs('cmd'), { opensIn: 'terminal', env: { HUB_OPEN_FILE: '/x/a.txt' } })));
    const row = A.rows.find((r) => r.p === 'cmd')!;
    expect(row.settings).toEqual([]);
    expect(loadRecent().rows[0]).toMatchObject({ p: 'cmd' });
    expect(JSON.stringify(loadRecent())).not.toContain('/x/a.txt');
  });
});

describe('the purpose marker in the recent list', () => {
  const base = { computer: { project: PID, computer_id: CID }, terminal_id: 8003, incarnation: INC, command_id: 7, launch_tag: 'f'.repeat(16), display: 8003, name: 'x', opens_in: 'terminal', started_at: 1 };
  it('a row with no marker still reads, unmarked', () => {
    expect(readRecent({ v: 2, rows: [base], ack: [] }).rows[0]).not.toHaveProperty('p');
  });
  it('a marker this Hub does not know counts as marked (it fails closed)', () => {
    const r = readRecent({ v: 2, rows: [{ ...base, p: 'future' }, { ...base, command_id: 8, p: 3 }, { ...base, command_id: 9, p: 'here' }], ack: [] }).rows;
    expect(r.map((x) => x.p)).toEqual(['?', '?', 'here']);
    const v = rowView({ ...patched0('m'), state: 'exited', exitCode: 0, p: '?' });
    expect(v.more).toEqual(['files']);
    expect(rowView({ ...patched0('m'), state: 'stopped', p: '?' }).primary).toBe('files');
  });
});

describe('starting a Files launch again', () => {
  it('restart_missing_plan_never_stops: after a reload a marked row\'s Restart, Open again, Retry, Options, pick and plain stop nothing, send nothing, and lead to Files', async () => {
    S.status = never;
    listed('r1', 'running', { p: 'tpl', app: 'Nano · a.txt' });
    await mountHook();
    const r = () => A.rows.find((x) => x.key === 'r1')!;
    await act(async () => void (await A.restart(r())));
    for (const a of ['openAgain', 'retry', 'options', 'pick', 'plain'] as const) await act(async () => A.act(r(), a));
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(0);
    expect(A.options).toBeNull();
    expect(files).toEqual(['r1', 'r1', 'r1', 'r1', 'r1', 'r1']);
    expect(patched('r1').state).toBe('running');
    // Its view offers Open again from Files instead.
    expect(rowView({ ...r(), state: 'stopped' }).primary).toBe('files');
    expect(rowView({ ...r(), state: 'exited', exitCode: 1 }).more).toEqual(['files']);
    expect(strings['act.files']).toBe('Open again from Files');
  });

  it('restart_without_exec_never_stops: without the exec permission a Restart stops nothing and claims nothing', async () => {
    S.status = never;
    listed('x1', 'running');
    listed('x2', 'running', { p: 'tpl', tag: '9'.repeat(16), terminal: 8004 });
    await mountHook();
    let prepared = 0;
    live.registerRecovery('x2', { prepare: async () => (prepared++, { ok: false }) });
    S.can = false;
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'x1')!)));
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'x2')!)));
    expect(S.closes).toHaveLength(0);
    expect(prepared).toBe(0);
    expect(patched('x1').note).toBe('execOff');
    expect(patched('x2').note).toBe('execOff');
  });

  it('a held Files launch is never restarted (Check first): nothing stopped or claimed', async () => {
    S.status = never;
    listed('h1', 'unknown', { p: 'tpl', code: 'foreign_record' });
    await mountHook();
    let prepared = 0;
    live.registerRecovery('h1', { prepare: async () => (prepared++, { ok: false }) });
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'h1')!)));
    expect(S.closes).toHaveLength(0);
    expect(prepared).toBe(0);
    expect(patched('h1').note).toBe('restartHeld');
  });

  it('restart_stop_failure_releases_unsent_hold: a Stop answered still running, or unconfirmed: no new launch, the new hold is freed, the original row keeps its outcome', async () => {
    S.status = never;
    listed('s1', 'running', { p: 'tpl', tag: '1'.repeat(16), terminal: 8005 });
    listed('s2', 'running', { p: 'tpl', tag: '2'.repeat(16), terminal: 8006 });
    await mountHook();
    for (const [key, close, state, note] of [
      ['s1', { ok: false, code: 'still_running', message: '', state: 'running' }, 'running', 'restartFailed'],
      ['s2', { ok: false, code: 'unreachable', message: '' }, 'unknown', 'restartUnconfirmed'],
    ] as const) {
      const lock = `ow:${CID}:${key.repeat(16)}`;
      const answers: string[] = [];
      let went = 0;
      live.registerRecovery(key, {
        prepare: async () => {
          const r = await holdAttempt(lock, { by: 'apps:openwith', meta: { v: 2, p: 'tpl', program: 'Nano', opens: 'terminal', tag: null, handle: null } });
          if (!r.ok) return { ok: false };
          return { ok: true, go: () => void went++, unsent: async () => { const a = await live.unsentCleanup(r.hold, 0); answers.push(a); return a; } };
        },
      });
      S.close = () => Promise.resolve(close);
      await act(async () => void (await A.restart(A.rows.find((x) => x.key === key)!)));
      expect(went).toBe(0);
      expect(S.opens).toBe(0);
      expect(answers).toEqual(['freed']);
      expect(heldAttempts(lock)).toHaveLength(0);
      // Nothing is left reserved on the subject: a new claim of it is admitted.
      const again = await holdAttempt(lock, { by: 'apps:openwith', meta: null });
      expect(again.ok).toBe(true);
      if (again.ok) again.hold.dismiss(true);
      expect(patched(key)).toMatchObject({ state, note });
    }
  });
});

/** Tiles shown or taken away inside the same page (a reload of the Board without a new core). */
const mount = (() => {
  let on = true;
  const subs = new Set<() => void>();
  return { get: () => on, set: (v: boolean) => { on = v; for (const f of subs) f(); }, sub: (f: () => void) => (subs.add(f), () => void subs.delete(f)) };
})();
function Mounted({ children }: { children: ReactNode }) {
  return useSyncExternalStore(mount.sub, mount.get) ? <>{children}</> : null;
}

describe('a Board tile at an Open-with launch\'s place', () => {
  const frame = <p>the program</p>;
  const tile = (session: number, kind: 'terminal' | 'display' = 'terminal') => (
    <LaunchHold target={targetFor(CID)} at={{ kind, session }}>
      {frame}
    </LaunchHold>
  );

  it('ledger_only_hold_holds_board_tile: with no recent row (evicted, or its save refused), the hold keeps a terminal-N and a display-N tile on its card, after a reload too', async () => {
    S.status = never;
    View = () => (
      <Mounted>
        {tile(8003)}
        {tile(8003, 'display')}
      </Mounted>
    );
    await renderPage(page, { path: '/apps' });
    // The hold's account is the one the page shows (holds are filed per account).
    await act(async () => void (await owHold('7'.repeat(16))));
    await waitFor(() => expect(screen.getAllByRole('group', { name: strings['hold.title'].replace('{{name}}', 'Nano') })).toHaveLength(2), { timeout: 4000 });
    expect(screen.queryByText('the program')).toBeNull();
    expect(loadRecent().rows).toHaveLength(0);
    // A reload: the page and this tab's launch list are gone; the stored hold still holds both tiles.
    ops.reset();
    await act(async () => mount.set(false));
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    ops.reset();
    expect(ops.get().launches).toHaveLength(0);
    expect(heldAttempts()).toHaveLength(1);
    await act(async () => mount.set(true));
    await waitFor(() => expect(screen.getAllByRole('group', { name: strings['hold.title'].replace('{{name}}', 'Nano') })).toHaveLength(2), { timeout: 4000 });
    expect(screen.queryByText('the program')).toBeNull();
  });

  it('ledger_hold_blocks_newer_timestamp_row_at_reused_number: launch A unresolved, launch B newer and ended: both tiles show A\'s card; Check reads A with A\'s tag; the frame shows once A is proven', async () => {
    const TA = 'a1'.repeat(8);
    const TB = 'b2'.repeat(8);
    let aRunning = false;
    S.status = (h) =>
      Promise.resolve(
        h.launch_tag === TB
          ? { ok: true, code: 'exited', message: '', state: 'exited', exit_code: 0 }
          : aRunning
            ? { ok: true, code: 'running', message: '', state: 'running' }
            : { ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' },
      );
    // The Board is opened after both launches were stored (a reload): tiles mount once the page's core is up.
    mount.set(false);
    View = () => (
      <Mounted>
        {tile(8003)}
        {tile(8003, 'display')}
      </Mounted>
    );
    await renderPage(page, { path: '/apps' });
    await act(async () => void (await owHold(TA)));
    // B: a later launch that took number 8003 first (its time is newer) and ended; stored in the recent list.
    // A reused number: the terminal was made again (its own incarnation).
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle({ ...H(TB), incarnation: 'e'.repeat(32), command_id: 9 } as RunHandle, { name: 'htop', app: 'htop' }, Date.now() + 60_000)!)));
    await act(async () => mount.set(true));

    const checks = await screen.findAllByRole('button', { name: strings['act.check'] }, { timeout: 4000 });
    expect(checks).toHaveLength(2);
    expect(screen.getAllByText(owUnknown('Nano'))).toHaveLength(2);
    // B is listed and read (it ended) and is the newer row at 8003: only the blocking rule keeps A's card.
    await waitFor(() => expect(S.reads.some((r) => r.h.launch_tag === TB)).toBe(true));
    expect(screen.getAllByText(owUnknown('Nano'))).toHaveLength(2);
    expect(screen.queryByText('the program')).toBeNull();
    S.reads.length = 0;
    await userEvent.click(checks[0]!);
    await waitFor(() => expect(S.reads.length).toBeGreaterThan(0));
    for (const r of S.reads) {
      expect(r.h.launch_tag).toBe(TA);
      expect((r.o as Opts).expectTag).toBe(TA);
    }
    expect(screen.queryByText('the program')).toBeNull();
    aRunning = true;
    await userEvent.click(screen.getAllByRole('button', { name: strings['act.check'] })[0]!);
    await waitFor(() => expect(screen.getAllByText('the program')).toHaveLength(2), { timeout: 4000 });
    expect(S.opens).toBe(0);
    expect(S.closes).toHaveLength(0);
  });
});

// ── A hold's whole identity, rows that follow their hold, Remove and Restart answers ──

/** A hold whose launch was answered (its sending stamp ended), as the barrier leaves it once execute answered. */
async function answered(tag: string, n = 8003, command = 7) {
  const r = await holdAttempt(`ow:${CID}:${tag.repeat(2)}`, {
    by: 'apps:openwith',
    meta: { v: 2, p: 'tpl', program: 'Nano', opens: 'terminal', tag, handle: { terminal_id: n, incarnation: INC, command_id: command } },
  });
  if (!r.ok) throw new Error('not held: ' + r.code);
  r.hold.sent();
  await waitFor(() => expect(heldAttempts()[0]?.inFlight).not.toBe('here'));
  return r.hold;
}
const rowsOf = (tag: string) => A.rows.filter((r) => r.handle === tag);
/** Another tab's write to the stored holds (its own update or free, through its own handle), then the storage event this tab hears. */
const announce = () => window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
function otherTabRewrites(id: string, meta: unknown): void {
  const list = readChanges() ?? [];
  const t = Math.max(0, ...list.map((r) => r.t)) + 1;
  writeChanges(list.map((r) => (r.id === id ? { ...r, attempt: meta, metaVersion: (r.metaVersion ?? 0) + 1, t } : r)));
  announce();
}
function otherTabFrees(id: string): void {
  writeChanges((readChanges() ?? []).filter((r) => r.id !== id));
  announce();
}

describe('a hold is matched only by its whole identity, and its marker wins', () => {
  it('ledger_marker_survives_old_hub_rewrite: a recent row an older Hub rewrote without the marker, same launch as a hold: the row is a Files launch (Restart stops nothing; reads carry its tag)', async () => {
    S.status = never;
    await mountHook();
    const T = '5'.repeat(16);
    // The recent row first (no p), then the hold: the dangerous order.
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle(H(T), { name: 'Nano', app: 'Nano' }, 5)!)));
    await act(async () => live.relistStored(A.live));
    expect(rowsOf(T)).toHaveLength(1);
    await act(async () => void (await answered(T)));
    await waitFor(() => expect(rowsOf(T)[0]?.p).toBe('tpl'));
    expect(rowsOf(T)).toHaveLength(1);
    const row = rowsOf(T)[0]!;
    await act(async () => void (await A.restart(row)));
    expect(S.closes).toHaveLength(0);
    expect(files).toEqual([row.key]);
    S.reads.length = 0;
    void A.check(row);
    await waitFor(() => expect(S.reads.length).toBeGreaterThan(0));
    expect((S.reads[0]!.o as Opts).expectTag).toBe(T);
  });

  it('ledger_hold_not_merged_into_other_tag: a recent row at the same place and command with another tag (ended) is another launch: the hold lists its own row, the tile keeps its card, Check reads the hold\'s tag', async () => {
    const TA = 'c3'.repeat(8);
    const TB = 'd4'.repeat(8);
    S.status = (h) => Promise.resolve(h.launch_tag === TB ? { ok: true, code: 'exited', message: '', state: 'exited', exit_code: 0 } : { ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' });
    mount.set(false);
    View = () => (
      <Mounted>
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 8003 }}>
          <p>the program</p>
        </LaunchHold>
      </Mounted>
    );
    await renderPage(page, { path: '/apps' });
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle(H(TB), { name: 'htop', app: 'htop' }, Date.now() + 60_000)!)));
    await act(async () => void (await answered(TA)));
    await act(async () => mount.set(true));
    const check = await screen.findByRole('button', { name: strings['act.check'] }, { timeout: 4000 });
    expect(screen.getByText(owUnknown('Nano'))).toBeInTheDocument();
    await waitFor(() => expect(S.reads.some((r) => r.h.launch_tag === TB)).toBe(true));
    expect(screen.queryByText('the program')).toBeNull();
    S.reads.length = 0;
    await userEvent.click(check);
    await waitFor(() => expect(S.reads.length).toBeGreaterThan(0));
    for (const r of S.reads) expect([r.h.launch_tag, (r.o as Opts).expectTag]).toEqual([TA, TA]);
    expect(screen.queryByText('the program')).toBeNull();
  });
});

describe('a row listed for a hold follows it', () => {
  it('ledger_rows_follow_hold: a hold that moves to its next command lists only the new one; a hold freed in another tab takes its row off', async () => {
    S.status = never;
    await mountHook();
    const T = '6'.repeat(16);
    const hold = await act(async () => answered(T));
    await waitFor(() => expect(rowsOf(T).map((r) => r.key)).toEqual([`r-${T}-7`]));
    // The barrier's next execute (a new command id) replaces the handle.
    act(() => otherTabRewrites(hold.id, { v: 2, p: 'tpl', program: 'Nano', opens: 'terminal', tag: T, handle: { terminal_id: 8003, incarnation: INC, command_id: 8 } }));
    await waitFor(() => expect(rowsOf(T).map((r) => r.key)).toEqual([`r-${T}-8`]));
    // Freed elsewhere (another tab's proof): the row listed only for it goes too.
    act(() => otherTabFrees(hold.id));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(0));
  });

  it('ledger_alias_dropped_on_bind: the hold lists its handle before this tab\'s Open binds the same one: one row stays (this tab\'s)', async () => {
    S.status = never;
    await mountHook();
    const T = '8'.repeat(16);
    await act(async () => void (await answered(T)));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(1));
    S.open = () => Promise.resolve({ ok: true, code: 'started', message: '', state: 'started', handle: H(T) });
    await act(async () => void (await A.launch(sealedAs('tpl'), { opensIn: 'terminal' })));
    await waitFor(() => expect(rowsOf(T).map((r) => r.key.startsWith('local-'))).toEqual([true]));
  });
});

describe('Remove of a hold-backed row', () => {
  it('failed_dismiss_keeps_row_and_controls: a Remove the real free refuses (its launch is still sending) keeps the row, the hold, the tile\'s card and its Dismiss, with a note; once the send answered, Remove takes it off', async () => {
    const T = '9a'.repeat(8);
    S.status = never;
    View = () => (
      <>
        <Hook />
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 8003 }}>
          <p>the program</p>
        </LaunchHold>
      </>
    );
    await renderPage(page, { path: '/apps' });
    await waitFor(() => expect(A.live.m).not.toBeNull());
    const hold = await act(async () => owHold(T));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(1));
    await act(async () => A.forget(rowsOf(T)[0]!));
    await waitFor(() => expect(patched(rowsOf(T)[0]!.key).note).toBe('notForgotten'));
    expect(heldAttempts()).toHaveLength(1);
    await screen.findByRole('group', { name: strings['hold.title'].replace('{{name}}', 'Nano') }, { timeout: 4000 });
    expect(screen.getByRole('button', { name: strings['act.dismiss'] })).toBeInTheDocument();
    expect(screen.queryByText('the program')).toBeNull();
    hold.sent();
    await waitFor(() => expect(heldAttempts()[0]?.inFlight).not.toBe('here'));
    await act(async () => A.forget(rowsOf(T)[0]!));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(0));
    expect(heldAttempts()).toHaveLength(0);
  });
});

describe('Restart after its claim', () => {
  const claim = (key: string, before?: () => void) => {
    const lock = `ow:${CID}:${key.repeat(16)}`;
    const answers: string[] = [];
    live.registerRecovery(key, {
      prepare: async () => {
        const r = await holdAttempt(lock, { by: 'apps:openwith', meta: { v: 2, p: 'tpl', program: 'Nano', opens: 'terminal', tag: null, handle: null } });
        if (!r.ok) return { ok: false };
        before?.();
        return { ok: true, go: () => undefined, unsent: async () => { const a = await live.unsentCleanup(r.hold, 0); answers.push(a); return a; } };
      },
    });
    return { lock, answers };
  };

  it('restart_rechecks_after_prepare: the exec permission or the row\'s state changing while the claim waited stops nothing; the claim is freed', async () => {
    S.status = never;
    listed('p1', 'running', { p: 'tpl', tag: '3a'.repeat(8), terminal: 8007 });
    listed('p2', 'running', { p: 'tpl', tag: '3b'.repeat(8), terminal: 8008 });
    await mountHook();
    const a = claim('p1', () => void (S.can = false));
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'p1')!)));
    expect(S.closes).toHaveLength(0);
    expect(a.answers).toEqual(['freed']);
    expect(heldAttempts(a.lock)).toHaveLength(0);
    expect(patched('p1').note).toBe('execOff');
    S.can = true;
    const b = claim('p2', () => ops.patch('p2', { state: 'unknown', code: 'unreachable' }));
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'p2')!)));
    expect(S.closes).toHaveLength(0);
    expect(b.answers).toEqual(['freed']);
    expect(patched('p2').note).toBe('restartHeld');
  });

  it('restart_unsent_cleanup_result_checked: a cleanup refused, or one that throws, leaves the row saying its new start is still reserved', async () => {
    S.status = never;
    listed('u1', 'running', { p: 'tpl', tag: '4a'.repeat(8), terminal: 8009 });
    listed('u2', 'running', { p: 'tpl', tag: '4b'.repeat(8), terminal: 8010 });
    await mountHook();
    S.close = () => Promise.resolve({ ok: false, code: 'still_running', message: '', state: 'running' });
    live.registerRecovery('u1', { prepare: async () => ({ ok: true, go: () => undefined, unsent: async () => 'refused' as const }) });
    live.registerRecovery('u2', { prepare: async () => ({ ok: true, go: () => undefined, unsent: () => Promise.reject(new Error('x')) }) });
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'u1')!)));
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'u2')!)));
    expect(S.opens).toBe(0);
    expect(patched('u1')).toMatchObject({ state: 'running', note: 'restartKept' });
    expect(patched('u2')).toMatchObject({ state: 'running', note: 'restartKept' });
    expect(strings['note.restartKept']).toMatch(/Files/);
  });
});

describe('a hidden row of a hold still kept', () => {
  // Store level: the row is hidden directly (ops.forget), as a Restart's proved free hides it before its free answers.
  it('launchhold_ignores_hidden_row_of_kept_hold: a row hidden while its hold is still stored, with an ended row at the place: the tile never shows the frame', async () => {
    const TA = 'e5'.repeat(8);
    const TB = 'f6'.repeat(8);
    S.status = (h) => Promise.resolve(h.launch_tag === TB ? { ok: true, code: 'exited', message: '', state: 'exited', exit_code: 0 } : { ok: false, code: 'start_unconfirmed', message: '', state: 'unknown' });
    mount.set(false);
    View = () => (
      <Mounted>
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 8003 }}>
          <p>the program</p>
        </LaunchHold>
      </Mounted>
    );
    await renderPage(page, { path: '/apps' });
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle({ ...H(TB), command_id: 9 } as RunHandle, { name: 'htop', app: 'htop' }, Date.now() + 60_000)!)));
    await act(async () => void (await answered(TA)));
    await act(async () => mount.set(true));
    await screen.findByRole('button', { name: strings['act.check'] }, { timeout: 4000 });
    await waitFor(() => expect(S.reads.some((r) => r.h.launch_tag === TB)).toBe(true));
    // Hidden with no change to the hold (nothing relists it yet).
    await act(async () => ops.forget(`r-${TA}-7`));
    expect(heldAttempts()).toHaveLength(1);
    expect(screen.queryByText('the program')).toBeNull();
  });

  it('proved_free_refused_relists_row: a Restart whose old hold\'s free is refused lists the old row again (it is still held)', async () => {
    S.status = never;
    await mountHook();
    const T = 'a7'.repeat(8);
    // Its send still out: the real free refuses the proved free.
    await act(async () => void (await owHold(T)));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(1));
    const key = rowsOf(T)[0]!.key;
    await act(async () => ops.patch(key, { state: 'running', code: '' }));
    let went = 0;
    live.registerRecovery(key, { prepare: async () => ({ ok: true, go: () => void went++, unsent: async () => 'none' as const }) });
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === key)!)));
    expect(went).toBe(1);
    // The refusal shows the hold again, and that lists the row again.
    await waitFor(() => expect(rowsOf(T).map((r) => r.key)).toEqual([key]));
    expect(heldAttempts()).toHaveLength(1);
  });
});

// ── An earlier untagged read, a pending free, rows first listed from recents, a hidden owner ──

describe('untagged reads and pending frees', () => {
  it('untagged_read_before_marker_is_redone: a recent row read without a tag (another launch\'s ended record) before its hold showed is unknown again at once and read with its tag; the earlier answer does not stand, even while that read is out', async () => {
    const T = 'b8'.repeat(8);
    // Without the tag the record at the place reads ended (another launch's); with it, this launch is unresolved.
    // A tagged read that never answers: until one does, the row must not keep the untagged answer.
    S.status = (_h, o) => ((o as Opts | undefined)?.expectTag ? never() : Promise.resolve({ ok: true, code: 'exited', message: '', state: 'exited', exit_code: 0 }));
    await mountHook();
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle(H(T), { name: 'Nano', app: 'Nano' }, 5)!)));
    await act(async () => live.relistStored(A.live));
    await waitFor(() => expect(rowsOf(T)[0]?.state).toBe('exited'));
    await act(async () => void (await answered(T)));
    await waitFor(() => expect(S.reads.at(-1)?.o).toMatchObject({ expectTag: T }));
    expect(rowsOf(T)[0]).toMatchObject({ p: 'tpl', state: 'unknown' });
    expect(rowView(rowsOf(T)[0]!).tone).not.toBe('off');
  });

  it('pending_free_keeps_row_and_tile: while a Remove\'s free is out the row and the tile keep holding; refused (its launch still sending) it stays with a note; answered later it goes', async () => {
    const T = 'c9'.repeat(8);
    S.status = never;
    mount.set(true);
    View = () => (
      <>
        <Hook />
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 8003 }}>
          <p>the program</p>
        </LaunchHold>
      </>
    );
    await renderPage(page, { path: '/apps' });
    await waitFor(() => expect(A.live.m).not.toBeNull());
    // A hold whose send is still out: the real free refuses it, after it was hidden while pending.
    const hold = await act(async () => owHold(T));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(1));
    await screen.findByRole('group', { name: strings['hold.title'].replace('{{name}}', 'Nano') }, { timeout: 4000 });
    const row = rowsOf(T)[0]!;
    act(() => A.forget(row));
    // Pending: hidden from heldAttempts, yet the row, the tile and the card's controls stay.
    expect(heldAttempts()).toHaveLength(0);
    expect(ops.get().forgotten.has(row.key)).toBe(false);
    expect(rowsOf(T)).toHaveLength(1);
    expect(screen.getByRole('group', { name: strings['hold.title'].replace('{{name}}', 'Nano') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['act.dismiss'] })).toBeInTheDocument();
    expect(screen.queryByText('the program')).toBeNull();
    // A second Remove while the first is out is still a hold's Remove: it never drops the row.
    act(() => A.forget(rowsOf(T)[0]!));
    expect(ops.get().forgotten.has(row.key)).toBe(false);
    expect(rowsOf(T)).toHaveLength(1);
    await waitFor(() => expect(patched(row.key).note).toBe('notForgotten'));
    expect(heldAttempts()).toHaveLength(1);
    expect(rowsOf(T)).toHaveLength(1);
    expect(screen.queryByText('the program')).toBeNull();
    // Answered now: the next Remove lands and the row goes.
    hold.sent();
    await waitFor(() => expect(heldAttempts()[0]?.inFlight).not.toBe('here'));
    await act(async () => A.forget(rowsOf(T)[0]!));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(0));
    expect(heldAttempts()).toHaveLength(0);
  });

  it('stored_row_follows_hold: a row first listed from the recent list follows its hold: superseded by the next command it goes (and off the recent list); the next command\'s row goes once the hold is freed', async () => {
    const T = 'da'.repeat(8);
    S.status = never;
    await mountHook();
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle(H(T), { name: 'Nano', app: 'Nano', p: 'tpl' }, 5)!)));
    await act(async () => live.relistStored(A.live));
    await waitFor(() => expect(rowsOf(T).map((r) => r.key)).toEqual([`r-${T}-7`]));
    const hold = await act(async () => answered(T));
    act(() => otherTabRewrites(hold.id, { v: 2, p: 'tpl', program: 'Nano', opens: 'terminal', tag: T, handle: { terminal_id: 8003, incarnation: INC, command_id: 8 } }));
    await waitFor(() => expect(rowsOf(T).map((r) => r.key)).toEqual([`r-${T}-8`]));
    expect(loadRecent().rows.some((r) => r.launch_tag === T && r.command_id === 7)).toBe(false);
    act(() => otherTabFrees(hold.id));
    await waitFor(() => expect(rowsOf(T)).toHaveLength(0));
  });

  it('alias_kept_while_owner_hidden: this tab\'s launch row is hidden before its handle came; the hold\'s row stays the shown one when the handle binds', async () => {
    const T = 'eb'.repeat(8);
    S.status = never;
    await mountHook();
    let answer!: (v: unknown) => void;
    S.open = () => new Promise((r) => (answer = r));
    let done!: Promise<unknown>;
    act(() => void (done = A.launch(sealedAs('tpl'), { opensIn: 'terminal' })));
    await waitFor(() => expect(S.opens).toBe(1));
    const local = A.rows.find((r) => r.key.startsWith('local-'))!;
    await act(async () => A.forget(local));
    await act(async () => void (await answered(T)));
    await waitFor(() => expect(rowsOf(T).map((r) => r.key)).toEqual([`r-${T}-7`]));
    await act(async () => {
      answer({ ok: true, code: 'started', message: '', state: 'started', handle: H(T) });
      await done;
    });
    expect(rowsOf(T).map((r) => r.key)).toEqual([`r-${T}-7`]);
  });
});

// ── an untagged read that answers after the marker ──

describe('untagged reads answering after the hold', () => {
  it('untagged_read_answering_after_marker_is_dropped: an untagged read still out when the hold shows up, answering (another launch\'s ended record) only afterwards, changes nothing: the row stays unknown and is read with its tag', async () => {
    const T = 'fc'.repeat(8);
    let late: ((v: unknown) => void) | null = null;
    S.status = (_h, o) => ((o as Opts | undefined)?.expectTag ? never() : new Promise((r) => (late = r)));
    await mountHook();
    await act(async () => saveRecent(addRecent(loadRecent(), fromHandle(H(T), { name: 'Nano', app: 'Nano' }, 5)!)));
    await act(async () => live.relistStored(A.live));
    await waitFor(() => expect(late).not.toBeNull());
    // The untagged read answers the moment the row takes the hold's marker, before any tagged read starts.
    const unwatch = ops.subscribe(() => {
      if (ops.get().patches.get(`r-${T}-7`)?.p !== 'tpl' || !late) return;
      late({ ok: true, code: 'exited', message: '', state: 'exited', exit_code: 0 });
      late = null;
    });
    await act(async () => void (await answered(T)));
    unwatch();
    expect(late).toBeNull();
    await waitFor(() => expect(S.reads.some((r) => (r.o as Opts | undefined)?.expectTag === T)).toBe(true));
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(rowsOf(T)).toHaveLength(1);
    expect(rowsOf(T)[0]).toMatchObject({ p: 'tpl', state: 'unknown' });
  });
});

// ── Open with: the tile says what the row says; Launch an app here keeps its folder ──

const { useHere } = await import('./launch/AppLauncher');
const { owText, wordsFor } = await import('./launch/openWith/facts');

describe('a Files launch on a tile and in a folder', () => {
  it('ow_tile_card_uses_row_words: a record that names another launch: the tile card and the row say the same sentence', async () => {
    const T = 'f3'.repeat(8);
    S.status = (h) => Promise.resolve({ ok: false, code: 'unknown', message: '', state: 'unknown', reason: 'foreign_record', handle: h });
    View = () => (
      <>
        <Hook />
        <LaunchHold target={targetFor(CID)} at={{ kind: 'terminal', session: 8003 }}>
          <p>the program</p>
        </LaunchHold>
      </>
    );
    await renderPage(page, { path: '/apps' });
    await act(async () => void (await owHold(T)));
    const sentence = owStrings['w.foreign'].replace('{{p}}', 'Nano');
    await screen.findByText(sentence, {}, { timeout: 4000 });
    const r = A.rows.find((x) => x.handle === T)!;
    expect(r).toMatchObject({ state: 'unknown', code: 'foreign_record' });
    expect(owText(wordsFor(r))).toBe(sentence);
    expect(screen.queryByText(owUnknown('Nano'))).toBeNull();
    expect(screen.queryByText('the program')).toBeNull();
  });

  it("ow_tile_card_uses_row_words: the row's details say the same sentence as its tile, and its menu offers Check only, no Stop", async () => {
    const T = 'f4'.repeat(8);
    S.status = (h) => Promise.resolve({ ok: false, code: 'unknown', message: '', state: 'unknown', reason: 'foreign_record', handle: h });
    await renderPage(harness, { path: `/apps?appsel=r-${T}-7` });
    await act(async () => void (await owHold(T)));
    const sentence = owStrings['w.foreign'].replace('{{p}}', 'Nano');
    // The details banner of the unknown row: the tile's sentence, never the generic "may not have changed".
    await screen.findByText(sentence, {}, { timeout: 4000 });
    expect(screen.queryByText(strings['outcome.act.title'].replace('{{name}}', 'Nano'))).toBeNull();
    const table = await screen.findByRole('table', { name: strings['tab.open'] });
    const row = await within(table).findByRole('row', { name: /Nano/ });
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    await screen.findByRole('menuitem', { name: strings['act.details'] });
    expect(screen.queryByRole('menuitem', { name: strings['menu.stop'] })).toBeNull();
    expect(S.closes).toHaveLength(0);
  });

  const CWD = '/home/u/proj dir';
  const app = { ...item, name: 'htop', id: 'nix:htop', app: 'htop', provider: 'nix' as const, installed: true };
  let Hr!: Apps;
  function HereHook() {
    const target = useCurrentComputer() as Target;
    Hr = useHere(useApps({ target, nav: { select: () => undefined, openFiles: (r) => void files.push(r.key) } }), CWD, target);
    return <p>here</p>;
  }
  async function mountHere() {
    View = () => <HereHook />;
    await renderPage(page, { path: '/apps' });
    await screen.findByText('here');
    await waitFor(() => expect(Hr.live.m).not.toBeNull());
  }

  it('launch an app here: the request carries the folder, the row keeps its marker and its plan; Restart starts it in the same folder', async () => {
    const T = 'a3'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    await mountHere();
    await act(async () => void (await Hr.open(app, { opensIn: 'terminal' })));
    expect(S.opens).toBe(1);
    expect(S.reqs[0]).toMatchObject({ app: 'htop', cwd: CWD });
    const r = Hr.rows.find((x) => x.p === 'apphere')!;
    expect(r).toMatchObject({ planned: true, app: 'htop' });
    expect(loadRecent().rows[0]).toMatchObject({ p: 'apphere', app: 'htop' });
    expect(JSON.stringify(loadRecent())).not.toContain(CWD);
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: { ...H('b3'.repeat(8)), command_id: 8 } });
    await act(async () => void (await Hr.restart(Hr.rows.find((x) => x.key === r.key)!)));
    await waitFor(() => expect(S.opens).toBe(2));
    expect(S.closes).toHaveLength(1);
    expect(S.reqs[1]).toMatchObject({ app: 'htop', cwd: CWD });
  });

  it('launch an app here: Restart and Open again run only through a place on the computer the folder was chosen on, never another one or a gone machine', async () => {
    const T = 'a4'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    await mountHere();
    await act(async () => void (await Hr.open(app, { opensIn: 'terminal' })));
    expect(S.opens).toBe(1);
    const r = Hr.rows.find((x) => x.p === 'apphere')!;
    const how = live.recoveryFor(r);
    if (how.kind !== 'plan') throw new Error(how.kind);
    const sent: unknown[] = [];
    const launch = (i: unknown) => void sent.push(i);
    // Another computer, or no machine: refused, nothing launched.
    expect(await how.rec.prepare({ live: { m: Hr.live.m, target: targetFor('d'.repeat(24)) }, launch, shows: () => true })).toEqual({ ok: false });
    expect(await how.rec.prepare({ live: { m: null, target: Hr.live.target }, launch, shows: () => true })).toEqual({ ok: false });
    expect(sent).toHaveLength(0);
    // The place pressing it now, on the same computer: its own Open starts it, sealed with the same folder.
    expect(await how.rec.prepare({ live: Hr.live, launch, shows: () => false })).toEqual({ ok: false });
    const ok = await how.rec.prepare({ live: Hr.live, launch, shows: () => true });
    if (!ok.ok) throw new Error('refused');
    ok.go();
    expect(sent).toHaveLength(1);
    await act(async () => void (await Hr.launch(sent[0] as typeof app, { opensIn: 'terminal' })));
    await waitFor(() => expect(S.opens).toBe(2));
    expect(S.reqs[1]).toMatchObject({ app: 'htop', cwd: CWD });
  });

  it('a refused recovery (made for another computer) stops nothing and sends nothing: Restart and Open again say so, the row keeps its own state', async () => {
    const T = 'a5'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    // The folder was chosen on another computer than this place shows: its recovery belongs there.
    View = () => {
      Hr = useHere(useApps({ target: useCurrentComputer() as Target, nav: { select: () => undefined, openFiles: (r) => void files.push(r.key) } }), CWD, targetFor('d'.repeat(24)));
      return <p>here</p>;
    };
    await renderPage(page, { path: '/apps' });
    await screen.findByText('here');
    await waitFor(() => expect(Hr.live.m).not.toBeNull());
    await act(async () => void (await Hr.open(app, { opensIn: 'terminal' })));
    expect(S.opens).toBe(1);
    const r = () => Hr.rows.find((x) => x.p === 'apphere')!;
    expect(r()).toMatchObject({ planned: true, state: 'running' });
    await act(async () => void (await Hr.restart(r())));
    const note = () => ops.get().patches.get(r().key)?.note;
    expect(note()).toBe('restartRefused');
    expect(r().state).toBe('running');
    await act(async () => Hr.act(r(), 'openAgain'));
    await waitFor(() => expect(note()).toBe('openRefused'));
    expect(r().state).toBe('running');
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(1);
    expect(strings['note.openRefused']).toMatch(/nothing was sent/);
  });

  it('Restart of a Files launch: the place leaving while its plan is prepared stops nothing and sends nothing', async () => {
    const T = 'a6'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    View = () => (
      <Mounted>
        <Hook />
      </Mounted>
    );
    await renderPage(page, { path: '/apps' });
    await screen.findByText('hook');
    await waitFor(() => expect(A.live.m).not.toBeNull());
    await act(async () => void (await A.launch(sealedAs('tpl'), { opensIn: 'terminal' })));
    const r = A.rows.find((x) => x.handle === T)!;
    const restart = A.restart;
    let freed = 0;
    // A plan whose preparation outlasts the place: the page is left before it answers.
    live.registerRecovery(r.key, {
      prepare: async () => {
        mount.set(false);
        await new Promise((res) => setTimeout(res, 50));
        return { ok: true, go: () => void S.opens++, unsent: async () => (freed++, 'none' as const) };
      },
    });
    await act(async () => void (await restart({ ...r, planned: true })));
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(1);
    expect(freed).toBe(1);
    expect(ops.get().patches.get(r.key)?.note).toBe('restartRefused');
  });

  it('Restart of a Files launch: the place switching to another computer while its plan is prepared stops nothing and sends nothing', async () => {
    const T = 'a7'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    const shown = (() => {
      let id = CID;
      const subs = new Set<() => void>();
      return { get: () => id, set: (v: string) => { id = v; for (const f of subs) f(); }, sub: (f: () => void) => (subs.add(f), () => void subs.delete(f)) };
    })();
    let B!: Apps;
    function Switching() {
      B = useApps({ target: targetFor(useSyncExternalStore(shown.sub, shown.get)), nav: { select: () => undefined } });
      return <p>switching</p>;
    }
    View = () => <Switching />;
    await renderPage(page, { path: '/apps' });
    await screen.findByText('switching');
    await waitFor(() => expect(B.live.m).not.toBeNull());
    await act(async () => void (await B.launch(sealedAs('tpl'), { opensIn: 'terminal' })));
    const r = B.rows.find((x) => x.handle === T)!;
    const restart = B.restart;
    let freed = 0;
    live.registerRecovery(r.key, {
      prepare: async () => {
        shown.set('d'.repeat(24));
        await new Promise((res) => setTimeout(res, 50));
        return { ok: true, go: () => void S.opens++, unsent: async () => (freed++, 'none' as const) };
      },
    });
    await act(async () => void (await restart({ ...r, planned: true })));
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(1);
    expect(freed).toBe(1);
    expect(ops.get().patches.get(r.key)?.note).toBe('restartRefused');
  });

  it('Restart refused with a start it reserved and could not clear: the row says the start stays reserved, never that nothing is held', async () => {
    const T = 'a8'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    await mountHook();
    await act(async () => void (await A.launch(sealedAs('tpl'), { opensIn: 'terminal' })));
    const r = A.rows.find((x) => x.handle === T)!;
    live.registerRecovery(r.key, { prepare: async () => ({ ok: false, kept: true }) });
    await act(async () => void (await A.restart({ ...r, planned: true })));
    expect(ops.get().patches.get(r.key)?.note).toBe('restartKept');
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(1);
  });

  it('folder_launch_reload_requires_reselection: after a reload an app started in a folder stops nothing and sends nothing again: Open again from Files', async () => {
    const T = 'c3'.repeat(8);
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    await mountHere();
    await act(async () => void (await Hr.open(app, { opensIn: 'terminal' })));
    expect(S.opens).toBe(1);
    // A reload: this tab's list and plans are gone; the recent list keeps the row with its marker.
    ops.reset();
    await act(async () => live.relistStored(Hr.live));
    await waitFor(() => expect(Hr.rows.some((x) => x.handle === T)).toBe(true));
    const r = () => Hr.rows.find((x) => x.handle === T)!;
    expect(r()).toMatchObject({ p: 'apphere' });
    expect(r().planned).toBeUndefined();
    await act(async () => void (await Hr.restart(r())));
    for (const a of ['openAgain', 'retry', 'options', 'pick', 'plain'] as const) await act(async () => Hr.act(r(), a));
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(1);
    expect(files).toHaveLength(6);
    expect(rowView({ ...r(), state: 'stopped' }).primary).toBe('files');
  });

  it('a folder the plan refuses (not launchable) opens nothing: the row says it did not start', async () => {
    S.status = never;
    View = () => <HereRel />;
    await renderPage(page, { path: '/apps' });
    await screen.findByText('rel');
    await waitFor(() => expect(Hr.live.m).not.toBeNull());
    await act(async () => void (await Hr.open(app, { opensIn: 'terminal' })));
    expect(S.opens).toBe(0);
    expect(Hr.rows.find((x) => x.p === 'apphere')).toMatchObject({ state: 'not_started', code: 'invalid_options' });
  });
  function HereRel() {
    const target = useCurrentComputer() as Target;
    Hr = useHere(useApps({ target, nav: { select: () => undefined } }), 'proj/../x', target);
    return <p>rel</p>;
  }
});

describe('a terminal the machine could not prove closed stays listed with Remove (C9)', () => {
  const T = 'e1'.repeat(8);
  const LO = { terminal_id: 8004, incarnation: INC, launch_tag: T, computer: { project: PID, computer_id: CID } };
  const htop = { ...item, app: 'htop', name: 'htop', type: 'row' as const, id: 'x' };
  const leftResult = { ok: false, code: 'not_durable', message: '', notSent: true, leftover: LO };
  const rowOfTerm = (n: number) => A.rows.find((x) => x.terminal === n);
  const storedRows = () => loadRecent().rows;

  it('leftover_row_kept: a refusal with a leftover: the row says its terminal may be open, offers Remove (never Stop or Restart), is stored, never read, and comes back after a reload', async () => {
    S.status = never;
    S.open = () => Promise.resolve(leftResult);
    await mountHook();
    await act(async () => void (await A.launch(htop, { opensIn: 'terminal' })));
    const r = rowOfTerm(8004)!;
    expect(r).toMatchObject({ state: 'not_started', code: 'terminal_left', terminal: 8004 });
    const v = rowView(r);
    expect([v.tone, v.primary]).toEqual(['warn', 'remove']);
    expect(v.more).not.toContain('stop');
    expect(v.more).not.toContain('stopAgain');
    expect(strings[v.key as 'fail.terminalLeft']).toMatch(/terminal may still be open/);
    expect(strings['act.remove']).toBeTruthy();
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, incarnation: INC, command_id: 0, left: true, launch_tag: T })]);
    // A reload (another tab reads the same list): the row comes back as it was, and is never read.
    ops.reset();
    await act(async () => live.relistStored(A.live));
    await waitFor(() => expect(rowOfTerm(8004)).toBeTruthy());
    expect(rowOfTerm(8004)).toMatchObject({ state: 'not_started', code: 'terminal_left' });
    await act(async () => live.refresh(A.live, false));
    expect(S.reads).toHaveLength(0);
  });

  it('leftover_replaces_progress_row: a handle given by progress, then a refusal with a leftover: the stored row becomes the leftover (no command row stays to be read)', async () => {
    S.status = never;
    S.open = (o) => {
      o?.onProgress?.({ state: 'starting', handle: H(T, 8004) });
      return Promise.resolve(leftResult);
    };
    await mountHook();
    await act(async () => void (await A.launch(htop, { opensIn: 'terminal' })));
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, command_id: 0, left: true })]);
    expect(rowOfTerm(8004)).toMatchObject({ code: 'terminal_left' });
  });

  it('remove_unconfirmed_keeps_row: Remove sends only the discard; unconfirmed, the row and its stored row stay with a note; confirmed, both go', async () => {
    S.status = never;
    S.open = () => Promise.resolve(leftResult);
    await mountHook();
    await act(async () => void (await A.launch(htop, { opensIn: 'terminal' })));
    S.discard = () => Promise.resolve({ ok: false, code: 'remove_unconfirmed', message: '' });
    await act(async () => void (await A.act(rowOfTerm(8004)!, 'remove')));
    expect(S.discards).toEqual([expect.objectContaining({ terminal_id: 8004, incarnation: INC })]);
    expect(rowOfTerm(8004)).toMatchObject({ code: 'terminal_left' });
    expect(ops.get().patches.get(rowOfTerm(8004)!.key)?.note).toBe('removeUnconfirmed');
    expect(strings['note.removeUnconfirmed']).toMatch(/Try again/);
    expect(storedRows()).toHaveLength(1);
    S.discard = () => Promise.resolve({ ok: true, code: 'removed', message: '' });
    await act(async () => void (await A.act(rowOfTerm(8004)!, 'remove')));
    await waitFor(() => expect(rowOfTerm(8004)).toBeUndefined());
    expect(storedRows()).toHaveLength(0);
    expect(S.closes).toHaveLength(0);
    expect(S.opens).toBe(1);
  });

  it('remove_threw_keeps_row: a discard that throws keeps the row (unconfirmed, never removed)', async () => {
    S.status = never;
    S.open = () => Promise.resolve(leftResult);
    await mountHook();
    await act(async () => void (await A.launch(htop, { opensIn: 'terminal' })));
    S.discard = () => Promise.reject(new Error('boom'));
    await act(async () => void (await A.act(rowOfTerm(8004)!, 'remove')));
    expect(rowOfTerm(8004)).toMatchObject({ code: 'terminal_left' });
    expect(storedRows()).toHaveLength(1);
  });

  it('forget_of_leftover_is_remove: the row menu\'s Remove from this list on a leftover row goes through the discard, never a silent drop', async () => {
    S.status = never;
    S.open = () => Promise.resolve(leftResult);
    await mountHook();
    await act(async () => void (await A.launch(htop, { opensIn: 'terminal' })));
    S.discard = () => Promise.resolve({ ok: false, code: 'remove_unconfirmed', message: '' });
    await act(async () => void A.askForget(rowOfTerm(8004)!));
    await waitFor(() => expect(S.discards).toHaveLength(1));
    expect(rowOfTerm(8004)).toBeTruthy();
    expect(storedRows()).toHaveLength(1);
  });

  it('close_leftover_row: a Stop that ended the app but could not prove its terminal closed: the row keeps a leftover with Remove, stored in place of the command row', async () => {
    S.status = never;
    const row = listed('k1', 'running', { tag: T, terminal: 8004 });
    saveRecent(addRecent(loadRecent(), row));
    await mountHook();
    S.close = () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped', leftover: LO });
    await act(async () => void (await A.stop(A.rows.find((x) => x.key === 'k1')!)));
    expect(patched('k1')).toMatchObject({ code: 'terminal_left' });
    expect(rowView(A.rows.find((x) => x.key === 'k1')!).primary).toBe('remove');
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, command_id: 0, left: true })]);
  });

  it('restart_keeps_leftover_row: a Restart whose Stop left the terminal: the new copy starts, and the old row stays listed with Remove', async () => {
    S.status = never;
    const row = listed('k1', 'running', { tag: T, terminal: 8004 });
    saveRecent(addRecent(loadRecent(), row));
    await mountHook();
    S.close = () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped', leftover: LO });
    await act(async () => void (await A.restart(A.rows.find((x) => x.key === 'k1')!)));
    expect(S.opens).toBe(1);
    expect(A.rows.find((x) => x.key === 'k1')).toMatchObject({ code: 'terminal_left' });
    expect(storedRows().some((x) => x.left === true && x.terminal_id === 8004)).toBe(true);
  });

  it('open_kept_note: Open again refused with a start it reserved and could not clear: the row says the next try waits for it', async () => {
    S.status = never;
    S.open = () => Promise.resolve({ ok: true, code: 'running', message: '', state: 'running', handle: H(T) });
    await mountHook();
    await act(async () => void (await A.launch(sealedAs('tpl'), { opensIn: 'terminal' })));
    const r = A.rows.find((x) => x.handle === T)!;
    live.registerRecovery(r.key, { prepare: async () => ({ ok: false, kept: true }) });
    await act(async () => A.act({ ...r, planned: true }, 'openAgain'));
    await waitFor(() => expect(ops.get().patches.get(r.key)?.note).toBe('openKept'));
    expect(strings['note.openKept']).toMatch(/Files/);
    expect(strings['note.openKept']).toMatch(/wait/);
    expect(S.opens).toBe(1);
  });

  /** An Open whose answer the test gives later: the launch's promise and its row's key. */
  async function openHeld() {
    let answer!: (v: unknown) => void;
    S.status = never;
    S.open = () => new Promise((r) => (answer = r));
    await mountHook();
    let p!: Promise<unknown>;
    await act(async () => void (p = A.launch(htop, { opensIn: 'terminal' })));
    const key = A.rows.find((x) => x.state === 'starting')!.key;
    return { key, answer: async (v: unknown) => act(async () => void (answer(v), await p)) };
  }

  it('forget_during_open_shows_leftover: the row is forgotten while its Open is out, and the answer leaves a terminal: the row comes back with Remove, stored', async () => {
    const o = await openHeld();
    act(() => void live.liveForget(o.key));
    expect(A.rows.find((x) => x.key === o.key)).toBeUndefined();
    await o.answer(leftResult);
    await waitFor(() => expect(A.rows.find((x) => x.key === o.key)).toMatchObject({ code: 'terminal_left', terminal: 8004 }));
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, left: true })]);
  });

  it('switch_during_open_stores_leftover: an account or realm switch while the Open is out (the page resets): the leftover is still stored, and lists when the computer is shown again', async () => {
    const o = await openHeld();
    act(() => ops.reset());
    await o.answer(leftResult);
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, left: true, command_id: 0 })]);
    await act(async () => live.relistStored(A.live));
    await waitFor(() => expect(rowOfTerm(8004)).toMatchObject({ code: 'terminal_left' }));
  });

  it('account_switch_during_open_waits: another account shown when the leftover comes: nothing is written into its list; it is stored once the launch\'s account is shown again', async () => {
    const o = await openHeld();
    S.acct = 'someone-else';
    await o.answer(leftResult);
    expect(storedRows()).toHaveLength(0);
    S.acct = undefined;
    await act(async () => live.relistStored(A.live));
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, left: true })]);
    await waitFor(() => expect(rowOfTerm(8004)).toMatchObject({ code: 'terminal_left' }));
  });

  it('forget_during_stop_keeps_leftover: the row is forgotten while its Stop is out, and the app ended leaving its terminal: the row comes back with Remove, stored', async () => {
    S.status = never;
    const row = listed('k1', 'running', { tag: T, terminal: 8004 });
    saveRecent(addRecent(loadRecent(), row));
    await mountHook();
    let answer!: (v: unknown) => void;
    S.close = () => new Promise((r) => (answer = r));
    let p!: Promise<unknown>;
    await act(async () => void (p = A.stop(A.rows.find((x) => x.key === 'k1')!)));
    act(() => void live.liveForget('k1'));
    expect(A.rows.find((x) => x.key === 'k1')).toBeUndefined();
    expect(storedRows()).toHaveLength(0);
    await act(async () => void (answer({ ok: true, code: 'stopped', message: '', state: 'stopped', leftover: LO }), await p));
    await waitFor(() => expect(A.rows.find((x) => x.key === 'k1')).toMatchObject({ code: 'terminal_left' }));
    expect(rowView(A.rows.find((x) => x.key === 'k1')!).primary).toBe('remove');
    expect(storedRows()).toEqual([expect.objectContaining({ terminal_id: 8004, command_id: 0, left: true })]);
  });

  it('leftover_keeps_other_commands: a Stop\'s leftover replaces only that launch\'s own stored row; another command of the same terminal stays stored', async () => {
    S.status = never;
    const row = listed('k1', 'running', { tag: T, terminal: 8004 });
    const other = fromHandle({ ...H('f0'.repeat(8), 8004), command_id: 9 }, { name: 'top' }, 2)!;
    await mountHook();
    saveRecent(addRecent(addRecent(loadRecent(), row), other));
    expect(storedRows().map((x) => x.command_id).sort()).toEqual([7, 9]);
    S.close = () => Promise.resolve({ ok: true, code: 'stopped', message: '', state: 'stopped', leftover: LO });
    await act(async () => void (await A.stop(A.rows.find((x) => x.key === 'k1')!)));
    expect(storedRows().map((x) => [x.command_id, x.left ?? false]).sort()).toEqual([[0, true], [9, false]]);
  });

  it('waiting_leftovers_replace_each_launch_row: two commands of one terminal stop with leftovers while another account is shown: once it is shown again, both commands\' rows are replaced (one leftover stays)', async () => {
    S.status = never;
    const a = listed('k1', 'running', { tag: T, terminal: 8004 });
    const b = fromHandle({ ...H(T, 8004), command_id: 9 }, { name: 'htop' }, 2)!;
    ops.addLaunch({ key: 'k2', name: 'htop', app: 'htop', opensIn: 'terminal', state: 'running', code: '', terminal: 8004, handle: T, source: '', command: '', settings: [], urls: {}, startedAt: 2, computer: CID });
    ops.bind('k2', b);
    await mountHook();
    saveRecent(addRecent(addRecent(loadRecent(), a), b));
    let answer: (v: unknown) => void = () => undefined;
    S.close = () => new Promise((r) => (answer = r));
    let p1!: Promise<unknown>, p2!: Promise<unknown>;
    await act(async () => void (p1 = A.stop(A.rows.find((x) => x.key === 'k1')!)));
    const first = answer;
    await act(async () => void (p2 = A.stop(A.rows.find((x) => x.key === 'k2')!)));
    S.acct = 'someone-else';
    const done = { ok: true, code: 'stopped', message: '', state: 'stopped', leftover: LO };
    await act(async () => void (first(done), answer(done), await p1, await p2));
    expect(storedRows().map((x) => x.command_id).sort()).toEqual([7, 9]);
    S.acct = undefined;
    await act(async () => live.relistStored(A.live));
    expect(storedRows().map((x) => [x.command_id, x.left ?? false])).toEqual([[0, true]]);
  });

  it('switch_after_progress_replaces_the_stored_row: progress stored command 7, the page moved on, a later handle (command 8) came, then a refusal leaving the terminal: the stored command 7 row is the one replaced', async () => {
    S.status = never;
    let answer!: (v: unknown) => void;
    S.open = (o) => {
      o?.onProgress?.({ state: 'starting', handle: H(T, 8004) });
      return new Promise((r) => (answer = (v) => {
        ops.reset();
        o?.onProgress?.({ state: 'starting', handle: { ...H(T, 8004), command_id: 8 } });
        r(v);
      }));
    };
    await mountHook();
    let p!: Promise<unknown>;
    await act(async () => void (p = A.launch(htop, { opensIn: 'terminal' })));
    expect(storedRows().map((x) => x.command_id)).toEqual([7]);
    await act(async () => void (answer(leftResult), await p));
    expect(storedRows().map((x) => [x.command_id, x.left ?? false])).toEqual([[0, true]]);
  });

  it('leftover_survives_history: 25 newer launches stored after a leftover: the leftover stays stored (only ordinary rows are capped at 20)', () => {
    let d = addRecent(readRecent(null), leftRow(LO, undefined, { name: 'htop' }, 1)!);
    for (let i = 0; i < 25; i++) d = addRecent(d, fromHandle({ ...H((i + 1).toString(16).padStart(16, '0'), 8100 + i), command_id: i + 1 }, { name: `app${i}` }, 2 + i)!);
    saveRecent(d);
    expect(loadRecent().rows.filter((x) => !x.left)).toHaveLength(20);
    expect(loadRecent().rows.filter((x) => x.left)).toEqual([expect.objectContaining({ terminal_id: 8004, command_id: 0 })]);
  });
});
