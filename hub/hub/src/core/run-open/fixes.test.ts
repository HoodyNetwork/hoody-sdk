// core/run-open fixes: a stop reads back as Stopped, the handle is known before the
// first execute leaves, an unconfirmed OCI stop stays unknown until two clean Docker reads, the record's
// track label wins over a stored handle's, and an ambiguous execute keeps the server's Retry-After.
import { describe, expect, it } from 'vitest';
import { boot, onFetch, PROXY, TARGET, type Reply } from '../test/env';
import { FakeKits, type Sent } from './fakeKits';
import { createRunOpen, route, type RunHandle, type RunProgress, type RunSend } from './index';
import { runOpenSend } from './send';

const COMPUTER = { project: 'p1', computer_id: 'c0ffee' };

function send(k: FakeKits): RunSend {
  return (target, method, path, query, body) => {
    if (route(target.kit, target.index, method, path, query ?? {}, body) !== null) return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
    return k.send(target, method, path, query as Record<string, string>, body) as ReturnType<RunSend>;
  };
}
/** A machine over the fake kits; a second call is a reload (a new machine, the handle from storage). */
const machine = (k: FakeKits) => createRunOpen({ send: send(k), now: k.now, sleep: k.sleep, random: k.random, computer: COMPUTER });
const stored = (h: RunHandle): RunHandle => JSON.parse(JSON.stringify(h)) as RunHandle;

describe('a stop the user made reads back as Stopped', () => {
  it('after close (SIGINT), a reload\'s status and watch read stopped, never an error', async () => {
    const k = new FakeKits();
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    const c = await machine(k).close(r.handle!);
    expect(c.state).toBe('stopped');
    expect(k.workloads[0]!.signal).toBe('SIGINT');
    const s = await machine(k).status(stored(r.handle!));
    expect([s.state, s.code, s.ok]).toEqual(['stopped', 'stopped', true]);
    const seen: string[] = [];
    const w = await machine(k).watch(stored(r.handle!), { onProgress: (e) => seen.push(`${e.state}/${e.code}`) });
    expect([w.state, w.code]).toEqual(['stopped', 'stopped']);
    expect(seen).toEqual(['stopped/stopped']);
  });

  it('an app that ignored INT and ended on TERM reads stopped too', async () => {
    const k = new FakeKits();
    k.behaviour = { ignores: ['INT'] };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    await machine(k).close(r.handle!);
    expect(k.workloads[0]!.signal).toBe('SIGTERM');
    expect((await machine(k).status(stored(r.handle!))).state).toBe('stopped');
  });

  it('a non-zero exit with no signal stays an error; a clean exit stays done', async () => {
    const k = new FakeKits();
    k.behaviour = { exitAfterReads: 1, exitCode: 2 };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    const s = await machine(k).status(r.handle!);
    expect([s.state, s.code, s.ok, s.exit_code]).toEqual(['exited', 'exited_error', false, 2]);

    const k2 = new FakeKits();
    k2.behaviour = { exitAfterReads: 1, exitCode: 0 };
    const r2 = await machine(k2).open({ app: 'htop' });
    await machine(k2).status(r2.handle!);
    expect((await machine(k2).status(r2.handle!)).code).toBe('done');
  });

  it('a KILL (the close\'s last step, or the system ending it) is not read as a user stop', async () => {
    const k = new FakeKits();
    k.behaviour = { ignores: ['INT', 'TERM'] };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    await machine(k).close(r.handle!);
    expect(k.workloads[0]!.signal).toBe('SIGKILL');
    expect((await machine(k).status(stored(r.handle!))).code).toBe('exited_error');
  });
});

describe('the handle is known before the first execute leaves', () => {
  it('a progress event carries the full handle (N, I, C, launch tag, kind) before execute is sent', async () => {
    const k = new FakeKits();
    const events: RunProgress[] = [];
    const atSend: number[] = [];
    k.faults.push((s: Sent) => {
      if (s.path === '/api/v1/terminal/execute' && s.query?.ephemeral !== 'true') atSend.push(events.filter((e) => e.handle).length);
      return undefined;
    });
    const r = await machine(k).open({ app: 'htop' }, { onProgress: (e) => events.push(e) });
    expect(r.ok).toBe(true);
    expect(atSend).toEqual([1]);
    const early = events.find((e) => e.handle)!;
    const ex = k.of('/api/v1/terminal/execute')[0]!;
    expect(early.phase).toBe('execute');
    expect(early.handle).toMatchObject({ terminal_id: 8001, incarnation: ex.body.incarnation, command_id: Number(ex.body.id), kind: 'app', computer: COMPUTER });
    expect(ex.body.track_label).toBe(`run:app:${early.handle!.launch_tag}`);
    expect(early.handle).toEqual(r.handle);
  });

  it('a command id the kit already holds: the next attempt announces its own handle before it is sent', async () => {
    const k = new FakeKits();
    const events: RunProgress[] = [];
    let first = true;
    k.faults.push((s: Sent) => {
      if (s.path !== '/api/v1/terminal/execute' || !first) return undefined;
      first = false;
      return { status: 409, body: { error: 'command_id_exists', code: 'COMMAND_ID_EXISTS' } };
    });
    const r = await machine(k).open({ app: 'htop' }, { onProgress: (e) => events.push(e) });
    const handles = events.filter((e) => e.handle && e.state === 'starting').map((e) => e.handle!.command_id);
    const ids = k.of('/api/v1/terminal/execute').map((s) => Number(s.body.id));
    expect(handles).toEqual(ids);
    expect(r.handle!.command_id).toBe(ids[1]);
  });
});

describe('an unconfirmed OCI stop stays unknown until clean Docker reads', () => {
  it('a failed sweep, then Check: unknown while the read fails or a container is left; stopped once none is', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    k.dockerFault = 'exit1';
    const c = await machine(k).close(r.handle!);
    expect([c.state, c.code]).toEqual(['unknown', 'stop_unconfirmed']);
    const failedRead = await machine(k).status(stored(r.handle!));
    expect([failedRead.state, failedRead.code]).toEqual(['unknown', 'stop_unconfirmed']);
    k.dockerFault = undefined;
    expect(k.containers.size).toBe(1);
    const left = await machine(k).status(stored(r.handle!));
    expect([left.state, left.code]).toEqual(['unknown', 'stop_unconfirmed']);
    k.containers.clear();
    const clean = await machine(k).status(stored(r.handle!));
    expect(clean.state).toBe('stopped');
  });

  it('a plain app that exited sends no Docker read', async () => {
    const k = new FakeKits();
    k.behaviour = { exitAfterReads: 1, exitCode: 0 };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    const before = k.sent.filter((s) => s.target.index === 0 && s.method === 'POST').length;
    expect((await machine(k).status(r.handle!)).code).toBe('done');
    expect(k.sent.filter((s) => s.target.index === 0 && s.method === 'POST').length).toBe(before);
  });
});

describe('the record\'s track label wins over a stored handle', () => {
  it('a stored handle naming another launch\'s tag and kind app: close sweeps its own containers, never the other\'s', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const a = await machine(k).open({ app: 'alpine' });
    const b = await machine(k).open({ app: 'alpine' });
    await machine(k).status(a.handle!);
    await machine(k).status(b.handle!);
    expect(k.containers.size).toBe(2);
    const forged = { ...stored(a.handle!), kind: 'app' as const, launch_tag: b.handle!.launch_tag! };
    const c = await machine(k).close(forged);
    expect(c.state).toBe('stopped');
    expect([...k.containers.values()]).toEqual([b.handle!.launch_tag]);
  });
});

describe('an ambiguous execute keeps the server\'s Retry-After', () => {
  const HOST = new RegExp(`^https://p1-c1-(run|terminal|display)-(\\d+)\\.sv1\\.${PROXY.replace(/\./g, '\\.')}(/[^?]*)(?:\\?(.*))?$`);

  it('execute answered 503 Retry-After 2 s: the replay waits 2 s (not 250 ms), same request, run once', async () => {
    boot();
    const k = new FakeKits();
    const at: number[] = [];
    let busy = true;
    onFetch(async (c): Promise<Reply> => {
      const m = HOST.exec(c.url);
      if (!m) return { status: 599 };
      const query = m[4] ? Object.fromEntries(new URLSearchParams(m[4])) : undefined;
      if (m[3] === '/api/v1/terminal/execute' && m[1] === 'terminal' && m[2] !== '0') {
        at.push(k.clock);
        if (busy) {
          busy = false;
          return { status: 503, body: { code: 'BUSY' }, headers: { 'retry-after': '2' } };
        }
      }
      const a = await k.send({ kit: m[1] as 'run', index: Number(m[2]) }, c.method, m[3]!, query, c.body ?? undefined);
      return { status: a.status, body: a.body };
    });
    const r = await createRunOpen({ send: runOpenSend({ target: TARGET }), now: k.now, sleep: k.sleep, random: k.random }).open({ app: 'htop' });
    expect(r.ok).toBe(true);
    expect(at).toHaveLength(2);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(2000);
    expect(k.executions).toBe(1);
  });

  it('an execute answered 5xx (pending in core) reaches the machine as that answer, with retryAfterMs', async () => {
    boot();
    onFetch(() => ({ status: 503, body: { code: 'BUSY' }, headers: { 'retry-after': '3' } }));
    const s = runOpenSend({ target: TARGET });
    const I = '0123456789abcdef0123456789abcdef';
    const a = await s({ kit: 'terminal', index: 8001 }, 'POST', '/api/v1/terminal/execute', { terminal_id: '8001', skip_display_wait: 'true' },
      { command: 'x', wait: false, id: '7', require_staged: true, track: true, incarnation: I, track_label: 'run:app:0123456789abcdef', env: {} });
    expect([a.status, a.retryAfterMs]).toEqual([503, 3000]);
  });
});

// #1 execute refusal codes over the real transport, #3 open() admission
// `gone` for an OCI app, #5 (a signal is re-sent only when it never left), #6 no Docker read after an abort, #7 an ambiguous rejection
// keeps Retry-After, #2 open()'s progress maps a stop like its result.
describe('execute refusals keep their code over the real transport (secret route)', () => {
  const HOST = new RegExp(`^https://p1-c1-(run|terminal|display)-(\\d+)\\.sv1\\.${PROXY.replace(/\./g, '\\.')}(/[^?]*)(?:\\?(.*))?$`);
  /** fetch → FakeKits; `refuse` answers the first band execute itself (status, code, headers) without running it. */
  function wire(k: FakeKits, refuse?: { status: number; code: string; headers?: Record<string, string> }): void {
    let once = !!refuse;
    onFetch(async (c): Promise<Reply> => {
      const m = HOST.exec(c.url);
      if (!m) return { status: 599 };
      const query = m[4] ? Object.fromEntries(new URLSearchParams(m[4])) : undefined;
      if (once && refuse && m[3] === '/api/v1/terminal/execute' && m[2] !== '0') {
        once = false;
        return { status: refuse.status, body: { error: refuse.code.toLowerCase(), code: refuse.code }, ...(refuse.headers ? { headers: refuse.headers } : {}) };
      }
      const a = await k.send({ kit: m[1] as 'run', index: Number(m[2]) }, c.method, m[3]!, query, c.body ?? undefined);
      return { status: a.status, body: a.body };
    });
  }
  const live = (k: FakeKits) => createRunOpen({ send: runOpenSend({ target: TARGET }), now: k.now, sleep: k.sleep, random: k.random });

  it('409 COMMAND_ID_EXISTS: a new command id, and the app opens', async () => {
    boot();
    const k = new FakeKits();
    wire(k, { status: 409, code: 'COMMAND_ID_EXISTS' });
    const r = await live(k).open({ app: 'htop' });
    expect(r.ok).toBe(true);
    const ids = k.of('/api/v1/terminal/execute').map((s) => s.body.id);
    expect(new Set(ids).size).toBe(1); // the refused one never reached the kit
    expect(k.executions).toBe(1);
  });

  it.each([
    [429, 'EXECUTE_BACKLOG_FULL', 'busy'],
    [409, 'INCARNATION_MISMATCH', 'terminal_replaced'],
    [409, 'STAGING_UNAVAILABLE', 'staging_unavailable'],
    [409, 'TRACK_LIMIT', 'too_many_apps'],
    // A cwd the computer's user can't enter, a shell that can't run the command.
    [403, 'CWD_PERMISSION_DENIED', 'folder_refused'],
    [409, 'SHELL_UNSUPPORTED', 'shell_unsupported'],
  ])('%i %s reads as %s (not couldnt_start)', async (status, code, want) => {
    boot();
    const k = new FakeKits();
    wire(k, { status, code, ...(status === 429 ? { headers: { 'retry-after': '5' } } : {}) });
    const r = await live(k).open({ app: 'htop' });
    expect([r.code, r.notSent]).toEqual([want, true]);
    if (status === 429) expect((r as { retryAfterMs?: number }).retryAfterMs).toBe(5000);
  });
});

/** An execute answer whose admission record already says gone (exit code, signal) for the request's own I and C. */
const goneAdmission = (exit: number | null, signal: string | null) => (s: Sent) => {
  if (s.path !== '/api/v1/terminal/execute' || s.query?.ephemeral === 'true') return undefined;
  return {
    status: 200,
    body: {
      terminal_id: s.query?.terminal_id, command_id: s.body.id, incarnation: s.body.incarnation, replayed: false,
      workload: { terminal_id: s.query?.terminal_id, incarnation: s.body.incarnation, command_id: s.body.id, track_label: s.body.track_label, state: 'gone', exit_code: exit, signal, reason: null, members: [] },
    },
  };
};

describe('open() admission `gone` for an OCI app needs clean Docker reads', () => {
  it('a container still listed: started (status decides), never exited', async () => {
    const k = new FakeKits();
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    // The container is listed before the admission answer is made (a fault that only watches, then the answer).
    k.faults.push((s: Sent) => {
      const tag = /^run:oci:([0-9a-f]{16})$/.exec(String(s.body?.track_label ?? ''))?.[1];
      if (tag) k.containers.set('c'.repeat(64), tag);
      return undefined;
    });
    k.faults.push(goneAdmission(0, null));
    const r = await machine(k).open({ app: 'alpine' });
    expect([r.state, r.code]).toEqual(['started', 'started']);
  });

  it('no container left: the record stands (done)', async () => {
    const k = new FakeKits();
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    k.faults.push(goneAdmission(0, null));
    const r = await machine(k).open({ app: 'alpine' });
    expect([r.state, r.code]).toEqual(['exited', 'done']);
  });
});

describe('a signal is never sent twice unless it provably never left (C9)', () => {
  const signals = (k: FakeKits) => k.sent.filter((s) => /\/signal$/.test(s.path)).map((s) => s.body.signal);
  const once = (verdict: 'drop-reply' | 'drop-request' | 'not-sent' | { status: number; body: unknown }) => {
    let first = true;
    return (s: Sent) => {
      if (!/\/signal$/.test(s.path) || !first) return undefined;
      first = false;
      return verdict;
    };
  };

  it('INT delivered, reply lost: no second INT; a fresh read, then TERM as authorised', async () => {
    const k = new FakeKits();
    k.behaviour = { ignores: ['INT'] }; // the app is cleaning up after the first INT
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    k.faults.push(once('drop-reply'));
    const c = await machine(k).close(r.handle!);
    expect(c.state).toBe('stopped');
    expect(signals(k)).toEqual(['INT', 'TERM']);
    const firstSig = k.sent.findIndex((s) => /\/signal$/.test(s.path));
    const term = k.sent.findIndex((s, i) => i > firstSig && /\/signal$/.test(s.path));
    expect(k.sent.slice(firstSig + 1, term).some((s) => s.method === 'GET' && /\/workloads$/.test(s.path))).toBe(true);
    expect(k.workloads[0]!.signal).toBe('SIGTERM');
  });

  it('INT answered 502: no second INT; TERM follows the read-back', async () => {
    const k = new FakeKits();
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    k.faults.push(once({ status: 502, body: { error: 'bad_gateway', code: 'BAD_GATEWAY' } }));
    const c = await machine(k).close(r.handle!);
    expect(c.state).toBe('stopped');
    expect(signals(k)).toEqual(['INT', 'TERM']);
    expect(k.workloads[0]!.signal).toBe('SIGTERM');
  });

  it('INT with no answer at all (request may have left): no second INT', async () => {
    const k = new FakeKits();
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    k.faults.push(once('drop-request'));
    await machine(k).close(r.handle!);
    expect(signals(k)[0]).toBe('INT');
    expect(signals(k)[1]).not.toBe('INT');
  });

  it('INT provably never left (not_sent): the same INT again, the app ends on SIGINT', async () => {
    const k = new FakeKits();
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    k.faults.push(once('not-sent'));
    const c = await machine(k).close(r.handle!);
    expect(c.state).toBe('stopped');
    expect(signals(k)).toEqual(['INT', 'INT']);
    expect(k.workloads[0]!.signal).toBe('SIGINT');
  });
});

describe('status() trusts an OCI launch tag only when the record names it', () => {
  it('an ended OCI app whose record has no run: label reads stop_unconfirmed, with no Docker read by the handle\'s tag', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true, exitAfterReads: 1, exitCode: 0 };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    k.containers.clear();
    k.workloads[0]!.track_label = 'other';
    const before = k.sent.filter((s) => s.target.index === 0 && s.method === 'POST').length;
    const s = await machine(k).status(stored(r.handle!));
    expect([s.state, s.code]).toEqual(['unknown', 'stop_unconfirmed']);
    expect(k.sent.filter((x) => x.target.index === 0 && x.method === 'POST').length).toBe(before);
  });
});

describe('a watch aborted before the Docker read sends none and reports no stop_unconfirmed', () => {
  it('abort during the record read of an ended OCI app', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    k.dockerFault = 'exit1';
    await machine(k).close(r.handle!);
    k.dockerFault = undefined;
    const ac = new AbortController();
    k.faults.push((s: Sent) => {
      if (s.path === '/api/v1/terminal/workloads') ac.abort();
      return undefined;
    });
    const before = k.sent.filter((s) => s.target.index === 0 && s.method === 'POST').length;
    const seen: string[] = [];
    await machine(k).watch(stored(r.handle!), { signal: ac.signal, onProgress: (e) => seen.push(String(e.code)) });
    expect(k.sent.filter((s) => s.target.index === 0 && s.method === 'POST').length).toBe(before);
    expect(seen).not.toContain('stop_unconfirmed');
  });
});

describe('an ambiguous rejection keeps Retry-After for the replay', () => {
  it('execute rejected {retryAfterMs: 2000} (no answer): the replay waits 2 s', async () => {
    const k = new FakeKits();
    const at: number[] = [];
    let once = true;
    const s: RunSend = (target, method, path, query, body) => {
      if (path === '/api/v1/terminal/execute' && target.index !== 0) {
        at.push(k.clock);
        if (once) { once = false; return Promise.reject({ ambiguous: true, retryAfterMs: 2000 }); }
      }
      return send(k)(target, method, path, query, body);
    };
    const r = await createRunOpen({ send: s, now: k.now, sleep: k.sleep, random: k.random, computer: COMPUTER }).open({ app: 'htop' });
    expect(r.ok).toBe(true);
    expect(at[1]! - at[0]!).toBeGreaterThanOrEqual(2000);
  });
});

describe('open()\'s progress maps a stop like its result', () => {
  it('admission gone on SIGTERM: the last progress and the result both read stopped', async () => {
    const k = new FakeKits();
    k.faults.push(goneAdmission(null, 'SIGTERM'));
    const events: RunProgress[] = [];
    const r = await machine(k).open({ app: 'htop' }, { onProgress: (e) => events.push(e) });
    expect(r.state).toBe('stopped');
    expect(events.at(-1)?.state).toBe('stopped');
  });
});

describe('an OCI app is gone only after two clean Docker reads 3 s apart, as the sweep requires', () => {
  /** The next Docker read answers a clean, empty listing (a racy read that misses a container in creation). */
  const oneEmptyRead = (k: FakeKits) => {
    let used = false;
    k.faults.push((s: Sent) => {
      if (used || s.target.index !== 0 || s.method !== 'POST' || !/docker ps/.test(String(s.body?.command))) return undefined;
      used = true;
      return { status: 200, body: { mode: 'raw', exit_code: 0, user: s.body.user, uid: 1000, stdout_b64: '', stdout_truncated: false, stderr_b64: '' } };
    });
  };
  const dockerReads = (k: FakeKits) => k.sent.filter((s) => s.target.index === 0 && /docker ps/.test(String(s.body?.command))).length;

  it('status(): one empty listing while a container is left reads stop_unconfirmed, never exited', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true, exitAfterReads: 1, exitCode: 0 };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    expect(k.containers.size).toBe(1);
    oneEmptyRead(k);
    const s = await machine(k).status(stored(r.handle!));
    expect([s.state, s.code]).toEqual(['unknown', 'stop_unconfirmed']);
  });

  it('status(): no container left: two reads at least 3 s apart, then the record stands', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true, exitAfterReads: 1, exitCode: 0 };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    k.containers.clear();
    const before = dockerReads(k);
    const t0 = k.clock;
    const s = await machine(k).status(stored(r.handle!));
    expect([s.state, s.code]).toEqual(['exited', 'done']);
    expect(dockerReads(k) - before).toBe(2);
    expect(k.clock - t0).toBeGreaterThanOrEqual(3000);
  });

  it('open(): admission gone with one empty listing while a container is left stays started', async () => {
    const k = new FakeKits();
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    k.faults.push(goneAdmission(0, null));
    let planted = false;
    k.faults.push((s: Sent) => {
      if (planted || s.target.index !== 0 || !/docker ps/.test(String(s.body?.command))) return undefined;
      planted = true;
      k.containers.set('b'.repeat(64), /hoody\.run\.tag=([0-9a-f]{16})/.exec(String(s.body.command))![1]!); // created right after this read
      return { status: 200, body: { mode: 'raw', exit_code: 0, user: s.body.user, uid: 1000, stdout_b64: '', stdout_truncated: false, stderr_b64: '' } };
    });
    const r = await machine(k).open({ app: 'alpine' });
    expect([r.state, r.code]).toEqual(['started', 'started']);
  });
});

describe('close escalates only on a read that shows the workload still alive', () => {
  const signals = (k: FakeKits) => k.sent.filter((s) => /\/signal$/.test(s.path)).map((s) => s.body.signal);
  const lostInt = (k: FakeKits) => {
    let used = false;
    k.faults.push((s: Sent) => (used || !/\/signal$/.test(s.path) ? undefined : ((used = true), 'drop-reply')));
  };
  const reads = (k: FakeKits, verdict: 'drop-request' | { status: number; body: unknown }) => {
    // Only the reads after the first signal (close's opening read still sees the running record).
    const afterSignal = (s: Sent) => s.method === 'GET' && s.path === '/api/v1/terminal/workloads' && k.sent.some((x) => /\/signal$/.test(x.path));
    for (let i = 0; i < 40; i++) k.faults.push((s: Sent) => (afterSignal(s) ? verdict : undefined));
  };

  it('INT reply lost and no read answers: no TERM or KILL, stop_unconfirmed', async () => {
    const k = new FakeKits();
    k.behaviour = { ignores: ['INT'] };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    lostInt(k);
    reads(k, 'drop-request');
    const c = await machine(k).close(r.handle!);
    expect([c.state, c.code]).toEqual(['unknown', 'stop_unconfirmed']);
    expect(signals(k)).toEqual(['INT']);
    expect(k.workloads[0]!.state).toBe('running');
  });

  it('INT reply lost and the record is missing from every read: no harder signal, stop_unconfirmed', async () => {
    const k = new FakeKits();
    k.behaviour = { ignores: ['INT'] };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    lostInt(k);
    reads(k, { status: 200, body: { workloads: [] } });
    const c = await machine(k).close(r.handle!);
    expect([c.state, c.code]).toEqual(['unknown', 'stop_unconfirmed']);
    expect(signals(k)).toEqual(['INT']);
  });

  it('an app that survives INT on a clean read: TERM follows (the read proved it alive)', async () => {
    const k = new FakeKits();
    k.behaviour = { ignores: ['INT'] };
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    const c = await machine(k).close(r.handle!);
    expect(c.state).toBe('stopped');
    expect(signals(k)).toEqual(['INT', 'TERM']);
  });
});

describe('a compact N:I:C handle (no kind) never skips the OCI guard', () => {
  it('status() of an ended app whose record has no run: label, by compact handle: stop_unconfirmed, never exited', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true, exitAfterReads: 1, exitCode: 0 };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    expect(k.containers.size).toBe(1);
    k.workloads[0]!.track_label = 'other';
    const h = r.handle!;
    const compact = `${h.terminal_id}:${h.incarnation}:${h.command_id}`;
    const s = await machine(k).status(compact);
    expect([s.state, s.code]).toEqual(['unknown', 'stop_unconfirmed']);
    const c = await machine(k).close(compact);
    expect([c.state, c.code]).toEqual(['unknown', 'stop_unconfirmed']);
    expect(k.containers.size).toBe(1);
  });
});

describe('a watch aborted between the two Docker reads sends no second read', () => {
  it('abort during the first read of an ended OCI app: one read, no done/stop_unconfirmed claimed', async () => {
    const k = new FakeKits();
    k.behaviour = { oci: true, exitAfterReads: 1, exitCode: 0 };
    k.resolve = FakeKits.resolveAnswer({ provider: 'oci' });
    const r = await machine(k).open({ app: 'alpine' });
    await machine(k).status(r.handle!);
    k.containers.clear();
    const ac = new AbortController();
    const isDocker = (s: Sent) => s.target.index === 0 && /docker ps/.test(String(s.body?.command));
    let fired = false;
    k.faults.push((s: Sent) => {
      if (!fired && isDocker(s)) { fired = true; ac.abort(); }
      return undefined;
    });
    const before = k.sent.filter(isDocker).length;
    const seen: string[] = [];
    const w = await machine(k).watch(stored(r.handle!), { signal: ac.signal, onProgress: (e) => seen.push(String(e.code)) });
    expect(k.sent.filter(isDocker).length - before).toBe(1);
    expect(seen).toEqual([]);
    expect(w.code).not.toBe('stop_unconfirmed');
    expect(w.state).toBe('unknown');
  });
});

// Open with core carries: a screen app keeps the kit's bounded display wait, the
// execute carries the cwd, a barrier before every new command id, reads act only on the expected launch tag,
// the terminal's shell is pinned to bash and proven from the create answer. Without those options the
// machine sends the plain open.
const EXEC = '/api/v1/terminal/execute';
const tracked = (k: FakeKits): Sent[] => k.of(EXEC).filter((s) => s.query?.ephemeral !== 'true');
const OTHER_TAG = 'feedfacefeedface';

describe('Open with: a screen app keeps the kit\'s bounded display wait', () => {
  it('a window open omits skip_display_wait; a terminal open keeps it', async () => {
    const k = new FakeKits();
    k.resolve = FakeKits.resolveAnswer({ title: 'Mousepad', starter: { catalog_id: 'x', opens_in: 'window' } });
    await machine(k).open({ app: 'mousepad' });
    expect(tracked(k)[0]!.query).toEqual({ terminal_id: '8001' });

    const k2 = new FakeKits();
    await machine(k2).open({ app: 'mousepad', opensIn: 'window' });
    expect(tracked(k2)[0]!.query).toEqual({ terminal_id: '8001' });

    const k3 = new FakeKits();
    await machine(k3).open({ app: 'htop' });
    expect(tracked(k3)[0]!.query).toEqual({ terminal_id: '8001', skip_display_wait: 'true' });
  });

  it('a replay of a window open is the identical request (no display wait key added)', async () => {
    const k = new FakeKits();
    k.faults.push((s) => (s.path === EXEC ? 'drop-reply' : undefined));
    const r = await machine(k).open({ app: 'mousepad', opensIn: 'window' });
    const sends = tracked(k);
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(r.replayed).toBe(true);
  });
});

describe('Open with: the execute carries the cwd', () => {
  it('execute body cwd iff req.cwd (create carries it as before)', async () => {
    const k = new FakeKits();
    await machine(k).open({ app: 'htop', cwd: '/home/user/my dir' });
    expect(k.of('/api/v1/terminal/create')[0]!.body.cwd).toBe('/home/user/my dir');
    expect(tracked(k)[0]!.body.cwd).toBe('/home/user/my dir');

    const k2 = new FakeKits();
    await machine(k2).open({ app: 'htop' });
    expect('cwd' in tracked(k2)[0]!.body).toBe(false);
  });

  it('apphere_execute_cwd_survives_shell_startup_cd', async () => {
    // The session starts in the home folder after create's own directory change (a startup `cd ~`): only the
    // execute's cwd puts the command in the folder.
    const k = new FakeKits();
    k.startupCwd = '/home/user';
    const r = await machine(k).open({ app: 'htop', cwd: '/srv/project' });
    expect(r.ok).toBe(true);
    expect(k.workloads[0]!.ranIn).toBe('/srv/project');
  });

  it('a lost execute reply is replayed with the same cwd', async () => {
    const k = new FakeKits();
    k.faults.push((s) => (s.path === EXEC ? 'drop-reply' : undefined));
    await machine(k).open({ app: 'htop', cwd: '/srv/project' });
    const sends = tracked(k);
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(k.executions).toBe(1);
  });
});

describe('Open with: a barrier before every new command id', () => {
  it('ow_collision_update_failure_never_dispatches_next_id', async () => {
    // id A answered COMMAND_ID_EXISTS (not admitted), then the barrier for B refuses: B never leaves.
    const k = new FakeKits();
    k.faults.push((s) => (s.path === EXEC ? { status: 409, body: { error: 'command_id_exists', code: 'COMMAND_ID_EXISTS' } } : undefined));
    const seen: RunHandle[] = [];
    const r = await machine(k).open({ app: 'htop' }, { beforeExecute: async (h) => { seen.push(h); return seen.length === 1; } });
    expect(tracked(k)).toHaveLength(1);
    expect([r.ok, r.code, r.notSent, r.state]).toEqual([false, 'not_durable', true, undefined]);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.command_id).not.toBe(seen[0]!.command_id);
    expect(seen[0]!.command_id).toBe(Number(tracked(k)[0]!.body.id));
    expect(k.executions).toBe(0);
    expect(k.deletes).toEqual([{ n: 8001, incarnation: seen[0]!.incarnation }]);
  });

  it('barrier_precedes_progress_and_send', async () => {
    const k = new FakeKits();
    const events: RunProgress[] = [];
    let release: (v: boolean) => void = () => undefined;
    let calls = 0;
    let atBarrier = { sends: -1, handles: -1 };
    k.faults.push((s) => (s.path === EXEC ? 'drop-reply' : undefined));
    const p = machine(k).open({ app: 'htop' }, {
      onProgress: (e) => events.push(e),
      beforeExecute: (h) => {
        calls++;
        atBarrier = { sends: tracked(k).length, handles: events.filter((e) => e.phase === 'execute' && e.handle?.command_id === h.command_id).length };
        return new Promise<boolean>((res) => { release = res; });
      },
    });
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => setTimeout(res, 0));
    expect(calls).toBe(1);
    expect(tracked(k)).toHaveLength(0); // a pending barrier holds the send
    release(true);
    const r = await p;
    expect(atBarrier).toEqual({ sends: 0, handles: 0 });
    // the reply was lost: an identical replay followed, and it got no barrier
    expect(tracked(k)).toHaveLength(2);
    expect(calls).toBe(1);
    expect(r.ok).toBe(true);
  });

  it('the barrier gets the handle the launch then reports (N, I, C, launch tag)', async () => {
    const k = new FakeKits();
    let got: RunHandle | undefined;
    const r = await machine(k).open({ app: 'htop' }, { beforeExecute: (h) => { got = h; return true; } });
    expect(got).toMatchObject({ terminal_id: r.handle!.terminal_id, incarnation: r.handle!.incarnation, command_id: r.handle!.command_id, launch_tag: r.handle!.launch_tag });
  });

  it.each([
    ['false', () => false],
    ['a throw', () => { throw new Error('store'); }],
    ['a rejection', () => Promise.reject(new Error('store'))],
    ['a truthy non-true', () => 'yes' as unknown as boolean],
  ])('a barrier answering %s: no execute, not_durable, the terminal deleted', async (_w, fn) => {
    const k = new FakeKits();
    const r = await machine(k).open({ app: 'htop' }, { beforeExecute: fn as () => boolean });
    expect([r.code, r.notSent]).toEqual(['not_durable', true]);
    expect(tracked(k)).toHaveLength(0);
    expect(k.deletes).toHaveLength(1);
  });

  it('an abort seen after the barrier: cancelled, nothing sent, the terminal deleted', async () => {
    const k = new FakeKits();
    const ac = new AbortController();
    const r = await machine(k).open({ app: 'htop' }, { signal: ac.signal, beforeExecute: () => { ac.abort(); return true; } });
    expect([r.code, r.notSent]).toEqual(['cancelled', true]);
    expect(tracked(k)).toHaveLength(0);
    expect(k.deletes).toHaveLength(1);
  });
});

describe('Open with: a read acts only on a record naming the expected launch tag', () => {
  async function opened(k: FakeKits): Promise<RunHandle> {
    const r = await machine(k).open({ app: 'htop' });
    await machine(k).status(r.handle!);
    return stored(r.handle!);
  }

  it('ow_foreign_handle_never_releases_hold', async () => {
    for (const label of ['run:app:' + OTHER_TAG, '', 'run:oci:' + OTHER_TAG]) {
      const k = new FakeKits();
      const h = await opened(k);
      const mine = h.launch_tag!;
      k.workloads[0]!.track_label = label;
      const s = await machine(k).status(h, { expectTag: mine });
      expect([s.state, s.reason, s.ok]).toEqual(['unknown', 'foreign_record', false]);
      expect(s.handle!.launch_tag).toBe(mine); // the record's tag is never adopted
      const w = await machine(k).watch(stored(h), { expectTag: mine });
      expect([w.state, w.reason]).toEqual(['unknown', 'foreign_record']);
      const before = k.sent.length;
      const c = await machine(k).close(stored(h), { expectTag: mine });
      expect([c.state, c.reason]).toEqual(['unknown', 'foreign_record']);
      const after = k.sent.slice(before);
      expect(after.filter((x) => x.method === 'POST' || x.method === 'DELETE')).toEqual([]);
      expect(k.workloads[0]!.state).toBe('running');
    }
  });

  it('an ended record with another tag: close sends no DELETE', async () => {
    const k = new FakeKits();
    k.behaviour = { exitAfterReads: 1, exitCode: 0 };
    const h = await opened(k);
    await machine(k).status(h);
    expect(k.workloads[0]!.state).toBe('gone');
    k.workloads[0]!.track_label = 'run:app:' + OTHER_TAG;
    const c = await machine(k).close(stored(h), { expectTag: h.launch_tag! });
    expect(c.reason).toBe('foreign_record');
    expect(k.deletes).toEqual([]);
  });

  it('the expected tag on the record: status, watch and close act as before', async () => {
    const k = new FakeKits();
    const h = await opened(k);
    expect((await machine(k).status(h, { expectTag: h.launch_tag! })).state).toBe('running');
    expect((await machine(k).watch(stored(h), { expectTag: h.launch_tag! })).state).toBe('running');
    const c = await machine(k).close(stored(h), { expectTag: h.launch_tag! });
    expect(c.state).toBe('stopped');
    expect(k.deletes).toEqual([{ n: 8001, incarnation: h.incarnation }]);
  });

  it('close_with_expect_tag_never_signals_after_failed_read', async () => {
    const k = new FakeKits();
    const h = await opened(k);
    k.faults.push((s) => (s.path === '/api/v1/terminal/workloads' ? 'drop-request' : undefined));
    const before = k.sent.length;
    const c = await machine(k).close(stored(h), { expectTag: h.launch_tag! });
    expect(c.state).toBe('unknown');
    expect(k.sent.slice(before).filter((x) => x.method !== 'GET')).toEqual([]);
    expect(k.workloads[0]!.state).toBe('running');
  });

  // Every later record of the close is held to the tag, not only the first read.
  it('close_foreign_signal_answer_never_confirms_or_deletes', async () => {
    const k = new FakeKits();
    const h = await opened(k);
    const mine = h.launch_tag!;
    const w = k.workloads[0]!;
    k.faults.push((s) => (s.path.endsWith('/signal') ? {
      status: 200,
      body: { delivered: 0, failed: [], workload: { terminal_id: w.terminal_id, incarnation: w.incarnation, command_id: w.command_id, track_label: 'run:app:' + OTHER_TAG, state: 'gone', exit_code: null, signal: 'SIGINT', reason: null, members: [] } },
    } : undefined));
    const c = await machine(k).close(stored(h), { expectTag: mine });
    expect([c.state, c.reason]).toEqual(['unknown', 'foreign_record']);
    expect(c.handle!.launch_tag).toBe(mine);
    expect(k.deletes).toEqual([]);
  });

  it.each([
    ['still running (no harder signal)', { ignores: ['INT'] }],
    ['ended (no DELETE)', { ignores: ['INT'], exitAfterReads: 2 }],
  ])('close_foreign_poll_after_signal_never_escalates_or_deletes: %s', async (_w, behaviour) => {
    const k = new FakeKits();
    k.behaviour = behaviour;
    const h = await opened(k);
    const mine = h.launch_tag!;
    let flipped = false;
    k.faults.push((s) => {
      if (!flipped && s.method === 'GET' && s.path === '/api/v1/terminal/workloads' && k.of('/api/v1/terminal/workloads/' + h.command_id + '/signal').length > 0) {
        flipped = true;
        k.workloads[0]!.track_label = 'run:app:' + OTHER_TAG;
      }
      return undefined;
    });
    const c = await machine(k).close(stored(h), { expectTag: mine });
    expect([c.state, c.reason]).toEqual(['unknown', 'foreign_record']);
    expect(c.handle!.launch_tag).toBe(mine);
    expect(k.sent.filter((x) => x.path.endsWith('/signal')).map((x) => x.body.signal)).toEqual(['INT']);
    expect(k.deletes).toEqual([]);
  });

  it('close_numeric_target_never_adopts_a_foreign_tag', async () => {
    const k = new FakeKits();
    const h = await opened(k);
    k.workloads[0]!.track_label = 'run:app:' + OTHER_TAG;
    const before = k.sent.length;
    const c = await machine(k).close(8001, { expectTag: h.launch_tag! });
    expect([c.state, c.reason]).toEqual(['unknown', 'foreign_record']);
    expect(c.handle!.launch_tag).not.toBe(OTHER_TAG);
    expect(c.handle!.kind).toBeUndefined();
    expect(k.sent.slice(before).filter((x) => x.method !== 'GET')).toEqual([]);
  });

  it('a malformed expectTag is refused before any read', async () => {
    const k = new FakeKits();
    const h = await opened(k);
    const before = k.sent.length;
    for (const bad of ['', 'ABCDEF0123456789', '123', 'x'.repeat(16)]) {
      expect((await machine(k).status(h, { expectTag: bad })).code).toBe('invalid_options');
      expect((await machine(k).watch(h, { expectTag: bad })).code).toBe('invalid_options');
      expect((await machine(k).close(h, { expectTag: bad })).code).toBe('invalid_options');
    }
    expect(k.sent.length).toBe(before);
  });
});

describe('Open with: the shell is pinned to bash and proven before any execute', () => {
  it('ow_create_pins_bash_shell', async () => {
    const k = new FakeKits();
    const r = await machine(k).open({ app: 'htop', shell: 'bash' });
    expect(r.ok).toBe(true);
    expect(k.of('/api/v1/terminal/create')[0]!.body.shell).toBe('/bin/bash');
    const k2 = new FakeKits();
    await machine(k2).open({ app: 'htop' });
    expect('shell' in k2.of('/api/v1/terminal/create')[0]!.body).toBe(false);
  });

  it.each([
    ['no shell in the answer (an old kit)', 'none' as const],
    ['another shell', { shell: 'fish' }],
    ['the path, not the kit\'s name', { shell: '/bin/bash' }],
  ])('ow_create_without_bash_echo_never_executes: %s', async (_w, echo) => {
    const k = new FakeKits();
    k.createShellEcho = echo;
    let barrier = 0;
    const r = await machine(k).open({ app: 'htop', shell: 'bash' }, { beforeExecute: () => { barrier++; return true; } });
    expect([r.code, r.notSent, r.state]).toEqual(['shell_unavailable', true, undefined]);
    expect(tracked(k)).toHaveLength(0);
    expect(barrier).toBe(0);
    expect(k.deletes).toHaveLength(1);
  });

  it('a create the kit refuses (no executable /bin/bash): couldnt_start, nothing executed', async () => {
    const k = new FakeKits();
    k.createError = { status: 400, body: { error: 'invalid shell', code: 'INVALID_SHELL' } };
    const r = await machine(k).open({ app: 'htop', shell: 'bash' });
    expect([r.code, r.notSent]).toEqual(['couldnt_start', true]);
    expect(tracked(k)).toHaveLength(0);
  });

  it('a create refused 403 CWD_PERMISSION_DENIED reads folder_refused, nothing executed', async () => {
    const k = new FakeKits();
    k.createError = { status: 403, body: { error: 'cwd_permission_denied', code: 'CWD_PERMISSION_DENIED' } };
    const r = await machine(k).open({ app: 'htop', shell: 'bash', cwd: '/home/user/private' });
    expect([r.code, r.notSent]).toEqual(['folder_refused', true]);
    expect(tracked(k)).toHaveLength(0);
  });

  it('any other create 403 still reads access_refused', async () => {
    const k = new FakeKits();
    k.createError = { status: 403, body: { error: 'forbidden', code: 'FORBIDDEN' } };
    const r = await machine(k).open({ app: 'htop', shell: 'bash', cwd: '/home/user/private' });
    expect([r.code, r.notSent]).toEqual(['access_refused', true]);
    expect(tracked(k)).toHaveLength(0);
  });

  it('any other shell value is refused before anything is sent', async () => {
    const k = new FakeKits();
    for (const shell of ['fish', '/bin/bash', 'BASH', '']) {
      const r = await machine(k).open({ app: 'htop', shell: shell as 'bash' });
      expect(r.code).toBe('invalid_options');
    }
    expect(k.sent).toEqual([]);
  });
});
