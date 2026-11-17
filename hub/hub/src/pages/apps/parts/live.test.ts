// Vitest: live Apps over a scripted run-open machine. What a result means for the row (C9: unknown is never
// "didn't start"), what the recent list keeps (handles and names, never a code), and that a Restart starts
// nothing while the old copy may still run.
import type { RunHandle, RunOpen, RunResult, Target } from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item, OpenApp } from '../logic';
import { closePatch, itemFor, liveCheck, liveForget, liveOpen, liveRestart, openPatch, openRequest, statusPatch, type LiveCtx } from './live';
import { ops } from './ops';
import { addRecent, fromHandle, loadRecent, readRecent, recentKey, saveRecent, toHandle } from './recent';

const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const TARGET: Target = { project: { id: P }, container: { id: C } };
const HANDLE: RunHandle = { v: 1, terminal_id: 15001, incarnation: 'c'.repeat(32), command_id: 7, display: 15001, launch_tag: 'd'.repeat(16), opens_in: 'web', web: { port: 18888, path: '/lab' }, computer: { project: P, computer_id: C } };

const starter: Item = {
  type: 'starter', name: 'JupyterLab', id: 'jupyterlab', description: '', opensIn: 'web', by: 'server', provider: null, version: '', attr: '', path: '', sourceId: '', setId: '', app: 'jupyterlab',
  shares: false, runnable: true, unsure: false, installed: false, also: [], ready: true, tier: 0, ord: 0, group: 0, detail: '',
};
const searchRow: Item = { ...starter, type: 'row', name: 'htop', id: 'cand1', opensIn: 'terminal', provider: 'nix', setId: 'set1', app: 'htop' };

const ok = (r: Partial<RunResult>): RunResult => ({ ok: true, code: 'ok', message: '', ...r });

/** A machine whose every call answers from a script; calls are recorded. */
function machine(s: Partial<Record<'open' | 'status' | 'close' | 'watch', () => RunResult>>) {
  const calls: string[] = [];
  const m = {
    capabilities: async () => ok({}),
    catalog: async () => ok({}),
    find: async () => ok({}),
    open: async () => (calls.push('open'), s.open ? s.open() : ok({ state: 'starting', handle: HANDLE })),
    status: async () => (calls.push('status'), s.status ? s.status() : ok({ state: 'running' })),
    close: async () => (calls.push('close'), s.close ? s.close() : ok({ state: 'stopped', code: 'stopped' })),
    watch: async () => (calls.push('watch'), s.watch ? s.watch() : ok({ state: 'ready', code: 'ready' })),
  } as unknown as RunOpen;
  return { m, calls };
}

function row(key: string): OpenApp {
  return { key, name: 'JupyterLab', catalogId: 'jupyterlab', app: 'jupyterlab', opensIn: 'web', state: 'starting', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 0, computer: C };
}
const patched = (key: string) => ({ ...ops.get().launches.find((l) => l.key === key), ...ops.get().patches.get(key) });
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  ops.reset();
  saveRecent(readRecent(null));
});

describe('what a result means for the row', () => {
  it('an Open without a state that may have been sent is unknown (start unconfirmed), never "didn\'t start"', () => {
    expect(openPatch(ok({ ok: false, code: 'couldnt_start' }))).toEqual({ state: 'unknown', code: 'start_unconfirmed' });
    expect(openPatch(ok({ ok: false, code: 'busy', notSent: true }))).toEqual({ state: 'not_started', code: 'busy' });
    expect(openPatch(ok({ state: 'running', code: 'running' }))).toEqual({ state: 'running', code: '' });
    expect(openPatch(ok({ state: 'exited', code: 'exited_error', exit_code: 2 }))).toEqual({ state: 'exited', code: '', exitCode: 2 });
  });

  it('a Stop that was never sent changes nothing; one without a state is unconfirmed', () => {
    expect(closePatch(ok({ ok: false, code: 'unreachable', notSent: true }))).toBeNull();
    expect(closePatch(ok({ ok: false, code: 'unreachable' }))).toEqual({ state: 'unknown', code: 'stop_unconfirmed' });
    expect(closePatch(ok({ state: 'stopped', code: 'terminal_replaced' }))).toEqual({ state: 'stopped', code: 'terminal_replaced' });
  });

  it('a read with no answer leaves a known row alone, unless Check asked', () => {
    const noAnswer = ok({ ok: false, state: 'unknown', code: 'unreachable', transient: true });
    const running = { ...row('k'), state: 'running' as const };
    expect(statusPatch(noAnswer, running, false)).toBeNull();
    expect(statusPatch(noAnswer, running, true)).toEqual({ state: 'unknown', code: 'unreachable' });
    expect(statusPatch(noAnswer, { ...row('k'), state: 'unknown', code: 'checking' }, false)).toEqual({ state: 'unknown', code: 'unreachable' });
  });
});

describe('the open request', () => {
  it('a starter opens only as that starter; a search row as its candidate, in a window or terminal', () => {
    expect(openRequest(starter, { args: ['--x'] })).toEqual({ app: 'jupyterlab', catalog: true, args: ['--x'] });
    expect(openRequest(searchRow, {})).toEqual({ app: 'htop', pick: { candidate_id: 'cand1', set_id: 'set1' }, opensIn: 'terminal', selector: { source: ['nix'] } });
    expect(openRequest({ ...searchRow, opensIn: 'screen' }, {}).opensIn).toBe('window');
    expect(openRequest({ ...searchRow, opensIn: 'web' }, {})).not.toHaveProperty('opensIn');
    expect(openRequest(searchRow, {}, true)).toEqual({ app: 'htop', opensIn: 'terminal' }); // a reopen keeps its row's mode
  });
});

describe('live Open, Stop, Check, Restart', () => {
  it('an admitted launch joins the recent list (handle and names only); its access code stays in memory', async () => {
    const access = { name: 'JUPYTER_TOKEN', value: 'secret-code-123' };
    const { m } = machine({ open: () => ok({ state: 'starting', handle: HANDLE, access }) });
    ops.addLaunch(row('k1'));
    const env = { JUPYTER_PORT: 'v' };
    await liveOpen({ m, target: TARGET }, 'k1', starter, { env });
    expect(access.value).toBe('');
    expect(ops.get().patches.get('k1')?.accessCode).toBe('secret-code-123');
    const stored = loadRecent().rows;
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(loadRecent())).not.toContain('secret-code-123');
    expect(stored[0]).toMatchObject({ name: 'JupyterLab', catalog_id: 'jupyterlab', terminal_id: 15001, asks_code: true, opens_in: 'web' });
    expect(ops.get().runs.get('k1')).toEqual(stored[0]);
    expect(patched('k1')).toMatchObject({ terminal: 15001, handle: 'd'.repeat(16), opensIn: 'web' });
    expect(env.JUPYTER_PORT).toBe('v');
  });

  it('no machine (no computer yet): nothing is sent and the row says it didn\'t start', async () => {
    ops.addLaunch(row('k2'));
    await liveOpen({ m: null, target: null }, 'k2', starter, {});
    expect(patched('k2')).toMatchObject({ state: 'not_started', code: 'unreachable' });
    expect(loadRecent().rows).toHaveLength(0);
  });

  it('an account switch while an Open runs: its answer writes nothing (no row, no recent entry)', async () => {
    let release: (r: RunResult) => void = () => {};
    const m = { open: () => new Promise<RunResult>((r) => (release = r)) } as unknown as RunOpen;
    ops.addLaunch(row('k3'));
    const p = liveOpen({ m, target: TARGET }, 'k3', starter, {});
    ops.reset();
    release(ok({ state: 'starting', handle: HANDLE, access: { name: 'JUPYTER_TOKEN', value: 'gone' } }));
    await p;
    expect(ops.get().launches).toHaveLength(0);
    expect(ops.get().patches.size).toBe(0);
    expect(loadRecent().rows).toHaveLength(0);
  });

  it('a Restart whose stop is unconfirmed starts nothing', async () => {
    const { m, calls } = machine({ close: () => ok({ ok: false, code: 'unreachable' }) });
    const c: LiveCtx = { m, target: TARGET };
    ops.addLaunch(row('k4'));
    ops.bind('k4', fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!);
    let relaunched = 0;
    expect(await liveRestart(c, 'k4', () => relaunched++)).toBe('unconfirmed');
    expect(relaunched).toBe(0);
    expect(calls).toEqual(['close']);
    expect(patched('k4')).toMatchObject({ state: 'unknown', code: 'stop_unconfirmed' });
  });

  it('a Restart whose stop was not sent, or answered still running, failed (not unconfirmed)', async () => {
    for (const [k, res] of [['k6', { ok: false, code: 'unreachable', notSent: true }], ['k7', { ok: false, code: 'still_running', state: 'running' }]] as const) {
      const { m } = machine({ close: () => ok(res) });
      ops.addLaunch(row(k));
      ops.bind(k, fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!);
      let relaunched = 0;
      expect(await liveRestart({ m, target: TARGET }, k, () => relaunched++)).toBe('failed');
      expect(relaunched).toBe(0);
    }
    ops.addLaunch(row('k8'));
    expect(await liveRestart({ m: null, target: TARGET }, 'k8', () => {})).toBe('failed');
  });

  it('a Restart whose stop ended the copy forgets the old row and starts once', async () => {
    const { m } = machine({});
    const stored = fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!;
    saveRecent(addRecent(loadRecent(), stored));
    ops.addLaunch(row('k5'));
    ops.bind('k5', stored);
    let relaunched = 0;
    expect(await liveRestart({ m, target: TARGET }, 'k5', () => relaunched++)).toBe('done');
    expect(relaunched).toBe(1);
    expect(ops.get().forgotten.has('k5')).toBe(true);
    expect(loadRecent().rows).toHaveLength(0);
  });

  it('Check reads once; a read made stale by a later one writes nothing', async () => {
    const answers = [ok({ state: 'exited', exit_code: 0 }), ok({ state: 'running' })];
    let n = 0;
    const m = {
      status: () => {
        const i = n++;
        return new Promise<RunResult>((r) => setTimeout(() => r(answers[i]!), i === 0 ? 20 : 0));
      },
    } as unknown as RunOpen;
    ops.addLaunch(row('k6'));
    ops.bind('k6', fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!);
    const first = liveCheck({ m, target: TARGET }, 'k6');
    await tick();
    await liveCheck({ m, target: TARGET }, 'k6');
    await first;
    expect(patched('k6').state).toBe('running');
  });

  it('Forget takes the row off both lists; Undo brings it back', () => {
    const stored = fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!;
    saveRecent(addRecent(loadRecent(), stored));
    ops.addLaunch(row('k7'));
    ops.bind('k7', stored);
    const undo = liveForget('k7');
    expect(loadRecent().rows).toHaveLength(0);
    undo();
    expect(loadRecent().rows.map(recentKey)).toEqual([recentKey(stored)]);
    expect(ops.get().forgotten.has('k7')).toBe(false);
  });
});

describe('the recent list', () => {
  it('reads a stored document and drops rows that do not check', () => {
    const good = { name: 'htop', opens_in: 'terminal', computer: { project: P, computer_id: C }, terminal_id: 15002, incarnation: 'e'.repeat(32), command_id: 1, launch_tag: 'f'.repeat(16), display: 15002, started_at: 5 };
    const d = readRecent({ v: 2, rows: [good, { ...good, terminal_id: 80 }, { ...good, display: 15003 }, { ...good, name: '' }, good], ack: ['miniserve', 'nope'] });
    expect(d.rows).toHaveLength(1);
    expect(d.ack).toEqual(['miniserve']);
    expect(readRecent({ v: 1, rows: [good] }).rows).toHaveLength(0);
    expect(toHandle(d.rows[0]!)).toMatchObject({ terminal_id: 15002, opens_in: 'terminal', computer: { project: P, computer_id: C } });
  });
});

describe('double presses and dropped options', () => {
  afterEach(() => void vi.useRealTimers());

  it('the source-warming rerun starts nothing once another Open of the same app is under way', async () => {
    vi.useFakeTimers();
    let opens = 0;
    const m = { open: async () => (opens++, ok({ ok: false, code: 'source_warming', notSent: true })) } as unknown as RunOpen;
    ops.addLaunch(row('w1'));
    await liveOpen({ m, target: TARGET }, 'w1', starter, {});
    expect(patched('w1')).toMatchObject({ state: 'not_started', code: 'source_warming' });
    // The person opens it again meanwhile: a new row of the same app is starting.
    ops.addLaunch(row('w2'));
    await vi.advanceTimersByTimeAsync(15000);
    expect(opens).toBe(1);
  });

  it('an access code shown after the handle came by progress is still recorded as asked (asks_code)', async () => {
    const m = {
      open: async (_req: unknown, o: { onProgress: (e: unknown) => void }) => {
        o.onProgress({ state: 'starting', handle: HANDLE });
        return ok({ state: 'starting', handle: HANDLE, access: { name: 'JUPYTER_TOKEN', value: 'code-1' } });
      },
      watch: async () => ok({ state: 'ready' }),
    } as unknown as RunOpen;
    ops.addLaunch(row('a1'));
    await liveOpen({ m, target: TARGET }, 'a1', starter, {});
    expect(loadRecent().rows[0]?.asks_code).toBe(true);
    expect(JSON.stringify(loadRecent())).not.toContain('code-1');
  });

  it('a reopen keeps its plain request for Retry (never a made-up candidate id)', async () => {
    ops.addLaunch(row('r1'));
    await liveOpen({ m: null, target: null }, 'r1', searchRow, {}, true);
    expect(itemFor('r1')?.reopen).toBe(true);
  });

  it('Forget\'s Undo after an account switch writes nothing to the new account\'s list', () => {
    const stored = fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!;
    saveRecent(addRecent(loadRecent(), stored));
    ops.addLaunch(row('f1'));
    ops.bind('f1', stored);
    const undo = liveForget('f1');
    ops.reset();
    undo();
    expect(loadRecent().rows).toHaveLength(0);
    expect(ops.get().launches).toHaveLength(0);
  });
});

describe('run-open edge cases: second presses and late answers', () => {
  afterEach(() => vi.useRealTimers());

  it('a launch forgotten while starting keeps its handle; Undo brings back a row that is read back, not stuck at starting', async () => {
    let release: (r: RunResult) => void = () => {};
    let progress: (e: unknown) => void = () => {};
    const { m, calls } = machine({ status: () => ok({ state: 'running' }) });
    (m as unknown as { open: unknown }).open = (_req: unknown, o: { onProgress: (e: unknown) => void }) => {
      progress = o.onProgress;
      return new Promise<RunResult>((res) => (release = res));
    };
    const c: LiveCtx = { m, target: TARGET };
    ops.addLaunch(row('f1'));
    const p = liveOpen(c, 'f1', starter, {});
    const undo = liveForget('f1', c);
    progress({ state: 'starting', handle: HANDLE });
    release(ok({ state: 'running', handle: HANDLE }));
    await p;
    expect(ops.get().runs.has('f1')).toBe(true);
    expect(loadRecent().rows).toHaveLength(0); // forgotten: not on the recent list
    undo();
    await tick();
    expect(loadRecent().rows).toHaveLength(1);
    expect(patched('f1').state).toBe('running');
    expect(calls).toContain('status');
  });

  it('a second handle with a new command id (COMMAND_ID_EXISTS retry) replaces the first on the row and the recent list', async () => {
    const second: RunHandle = { ...HANDLE, command_id: 8 };
    const m = {
      open: async (_req: unknown, o: { onProgress: (e: unknown) => void }) => {
        o.onProgress({ handle: HANDLE });
        o.onProgress({ handle: second });
        return ok({ state: 'starting', handle: second });
      },
      watch: async () => ok({ state: 'ready' }),
    } as unknown as RunOpen;
    ops.addLaunch(row('c1'));
    await liveOpen({ m, target: TARGET }, 'c1', starter, {});
    expect(ops.get().runs.get('c1')?.command_id).toBe(8);
    expect(loadRecent().rows.map((r) => r.command_id)).toEqual([8]);
  });

  it('a definite unsent failure after an early handle drops the stored row (no "Check" forever after a reload)', async () => {
    const m = {
      open: async (_req: unknown, o: { onProgress: (e: unknown) => void }) => {
        o.onProgress({ handle: HANDLE });
        return ok({ ok: false, code: 'couldnt_start', notSent: true });
      },
    } as unknown as RunOpen;
    ops.addLaunch(row('u1'));
    await liveOpen({ m, target: TARGET }, 'u1', starter, {});
    expect(loadRecent().rows).toHaveLength(0);
    expect(ops.get().runs.has('u1')).toBe(false);
    expect(patched('u1')).toMatchObject({ state: 'not_started', code: 'couldnt_start' });
  });

  it('a Check that waited reads nothing once a Restart has the row (any other busy action, not only Stop)', async () => {
    let gate: () => void = () => {};
    const { m, calls } = machine({});
    (m as unknown as { status: unknown }).status = () => (calls.push('status'), new Promise<RunResult>((res) => (gate = () => res(ok({ state: 'running' })))));
    ops.addLaunch(row('b1'));
    ops.bind('b1', fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!);
    ops.patch('b1', { state: 'stopped', code: '' });
    const p = liveCheck({ m, target: TARGET }, 'b1');
    await tick();
    ops.patch('b1', { busy: 'restart' });
    gate();
    await p;
    expect(patched('b1').state).toBe('stopped');
  });

  it('the warming rerun of another computer\'s row is not replaced by this computer\'s Open of the same app', async () => {
    vi.useFakeTimers();
    let opens = 0;
    const m = { open: async () => (opens++, ok({ ok: false, code: 'source_warming', notSent: true })) } as unknown as RunOpen;
    ops.addLaunch(row('x1'));
    await liveOpen({ m, target: TARGET }, 'x1', starter, {});
    ops.addLaunch({ ...row('x2'), computer: 'e'.repeat(24) });
    await vi.advanceTimersByTimeAsync(15000);
    expect(opens).toBe(2);
  });

  it('a superseded warming row says it was replaced, not cancelled', async () => {
    vi.useFakeTimers();
    const m = { open: async () => ok({ ok: false, code: 'source_warming', notSent: true }) } as unknown as RunOpen;
    ops.addLaunch(row('y1'));
    await liveOpen({ m, target: TARGET }, 'y1', starter, {});
    ops.addLaunch(row('y2'));
    await vi.advanceTimersByTimeAsync(15000);
    expect(patched('y1')).toMatchObject({ state: 'not_started', code: 'replaced' });
  });
});

describe('run-open edge cases: holds across a reload', () => {
  afterEach(() => vi.useRealTimers());

  it('forgetting a "Getting ready" row cancels its queued Open: nothing starts hidden', async () => {
    vi.useFakeTimers();
    let opens = 0;
    const m = { open: async () => (opens++, ok({ ok: false, code: 'source_warming', notSent: true })) } as unknown as RunOpen;
    ops.addLaunch(row('g1'));
    await liveOpen({ m, target: TARGET }, 'g1', starter, {});
    const undo = liveForget('g1');
    await vi.advanceTimersByTimeAsync(15000);
    expect(opens).toBe(1);
    undo();
    expect(patched('g1')).toMatchObject({ state: 'not_started', code: 'cancelled' });
  });

  it('a Check of the old command never writes over the replacement command (rebind fences reads)', async () => {
    let answer: (r: RunResult) => void = () => {};
    const { m } = machine({});
    (m as unknown as { status: unknown }).status = () => new Promise<RunResult>((res) => (answer = res));
    ops.addLaunch(row('h1'));
    ops.bind('h1', fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!);
    const c: LiveCtx = { m, target: TARGET };
    const p = liveCheck(c, 'h1');
    await tick();
    // The Open's retry announces command 8; its outcome is unknown.
    const m2 = { open: async () => ok({ state: 'unknown', handle: { ...HANDLE, command_id: 8 } }) } as unknown as RunOpen;
    await liveOpen({ m: m2, target: TARGET }, 'h1', starter, {});
    answer(ok({ state: 'running' }));
    await p;
    expect(patched('h1').state).toBe('unknown');
    expect(ops.get().runs.get('h1')?.command_id).toBe(8);
  });

  it('a newer Open the person made and stopped meanwhile still replaces the waiting one', async () => {
    vi.useFakeTimers();
    let opens = 0;
    const m = { open: async () => (opens++, ok({ ok: false, code: 'source_warming', notSent: true })) } as unknown as RunOpen;
    ops.addLaunch({ ...row('n1'), startedAt: 1 });
    await liveOpen({ m, target: TARGET }, 'n1', starter, {});
    ops.addLaunch({ ...row('n2'), startedAt: 2 });
    ops.patch('n2', { state: 'stopped', code: '' });
    await vi.advanceTimersByTimeAsync(15000);
    expect(opens).toBe(1);
    expect(patched('n1')).toMatchObject({ code: 'replaced' });
  });

  it('a Restart whose context ended while it stopped starts nothing ("gone")', async () => {
    let release: (r: RunResult) => void = () => {};
    const { m } = machine({});
    (m as unknown as { close: unknown }).close = () => new Promise<RunResult>((res) => (release = res));
    ops.addLaunch(row('s1'));
    ops.bind('s1', fromHandle(HANDLE, { name: 'JupyterLab' }, 1)!);
    let relaunched = 0;
    const p = liveRestart({ m, target: TARGET }, 's1', () => relaunched++);
    await tick();
    ops.reset();
    release(ok({ state: 'stopped', code: 'stopped' }));
    expect(await p).toBe('gone');
    expect(relaunched).toBe(0);
  });

  it('Open again by name keeps the opening mode chosen in Options', () => {
    expect(openRequest(searchRow, { opensIn: 'screen' }, true)).toMatchObject({ app: 'htop', opensIn: 'window' });
    expect(openRequest(searchRow, { opensIn: 'web' }, true)).not.toHaveProperty('opensIn');
  });
});
