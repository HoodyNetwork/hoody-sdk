// Vitest: a Files launch end to end: useOpenWith's startPlan → the real core
// hold (attempts, change store) → live.ts → the shared run-open machine → runOpenSend → FakeKits. Only the exec
// permission is scripted.
//   - one claim per launch, a barrier before every command id, release only on evidence naming the launch;
//   - a refusal (claim, barrier, shell) sends nothing and drops what it claimed;
//   - the path rides only in execute's staged env.
/* eslint-disable no-restricted-globals -- the test plays a browser refusing writes (as pages/ai/holds.test.tsx) */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type { RunOpen, Target } from '@core';
import type { ScriptPlan } from './plan';
import type { StartOpts } from './useOpenWith';

const S = vi.hoisted(() => ({ can: true }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  return { ...real, can: (cap: string) => (cap === 'computers.actions.exec' ? S.can : real.can(cap)) };
});

const { boot, onFetch, PROXY, settle } = await import('@core/test/env');
const { FakeKits } = await import('@core/run-open/fakeKits');
const { createRunOpen } = await import('@core/run-open/index');
const { runOpenSend } = await import('@core/run-open/send');
const { attemptFor, heldAttempts, resetAttempts } = await import('@core/attempts');
const { CHANGE_STORE_KEY, readChanges, writeChanges } = await import('@core/change-store');
const { ops } = await import('../../parts/ops');
const live = await import('../../parts/live');
const { loadRecent, readRecent, saveRecent } = await import('../../parts/recent');
const { capture } = await import('@core');
const { rowView } = await import('../../logic');
const { planFor, toLaunch } = await import('./plan');
const { startPlan, prepareLaunch } = await import('./useOpenWith');
const { claim, subjectOf } = await import('./ledger');
const { owText } = await import('./facts');
type Kits = InstanceType<typeof FakeKits>;
type Plan = ScriptPlan;

const HOST = new RegExp(`^https://[^/]*?-(run|terminal|display)-(\\d+)\\.sv1\\.${PROXY.replace(/\./g, '\\.')}(/[^?]*)(?:\\?(.*))?$`);
// Real ids (stored launch rows take 24-hex ids only).
const PID = 'a'.repeat(24);
const CID = 'b'.repeat(24);
const TGT = { project: { id: PID }, container: { id: CID, server_name: 'sv1' } } as Target;
function wire(k: Kits): void {
  onFetch(async (c) => {
    const m = HOST.exec(c.url);
    if (!m) return { status: 599, body: { code: 'UNEXPECTED_HOST' } };
    const query = m[4] ? Object.fromEntries(new URLSearchParams(m[4])) : undefined;
    try {
      const a = await k.send({ kit: m[1] as 'run', index: Number(m[2]) }, c.method, m[3]!, query, c.body ?? undefined);
      return { status: a.status, body: a.body };
    } catch {
      return { status: 0, network: true };
    }
  });
}

const LAUNCHER = { candidateId: 'c1', setId: 'set1', path: '/usr/bin/bash' };
const PATH = `/home/u/it's "q" $x.txt`;
let k!: Kits;
let m!: RunOpen;
const ctx = () => ({ m, target: TGT });
const env = () => ({ live: ctx(), source: 'Started from Files' });
const tpl = (path = PATH): Plan => {
  const p = planFor({ p: 'tpl', tpl: 'nano', entry: { path, type: 'file' }, exe: '/usr/bin/nano' });
  if (!p.ok) throw new Error(p.reason);
  return p.plan as ScriptPlan;
};
const opts = (label = 'Nano · x.txt', more: object = {}): StartOpts => ({ launcher: LAUNCHER, program: 'Nano', label, ...more });
const bandExecutes = () => k.of('/api/v1/terminal/execute').filter((s) => s.target.index !== 0);
const resolves = () => k.of('/api/v1/run/resolve');
const owHolds = () => heldAttempts().filter((h) => h.by === 'apps:openwith');
/** A spy on this browser's storage writes, undone after each test. */
let spies: { mockRestore: () => void }[] = [];
const spyStore = () => {
  const s = vi.spyOn(localStorage, 'setItem');
  spies.push(s);
  return s;
};
const row = (key: string) => ({ ...ops.get().launches.find((l) => l.key === key)!, ...ops.get().patches.get(key) });
async function start(plan: Plan = tpl(), o = opts()) {
  const out = await startPlan(env(), plan, o);
  if (out.kind === 'listed') await out.done;
  await settle();
  return out;
}

beforeEach(() => {
  boot();
  ops.reset();
  saveRecent(readRecent(null));
  S.can = true;
  k = new FakeKits();
  k.behaviour = { neverGo: true };
  wire(k);
  m = createRunOpen({ send: runOpenSend({ target: TGT, mayLaunch: () => S.can }), now: k.now, sleep: k.sleep, random: k.random, computer: { project: PID, computer_id: CID } });
});
afterEach(() => {
  for (const s of spies) s.mockRestore();
  spies = [];
  for (const h of heldAttempts()) attemptFor(h.id, h.by)?.dismiss(true);
});

describe('the path rides only in the staged env', () => {
  it('ow_path_stays_in_staged_env: no request but the execute carries the path, and the execute only in its env', async () => {
    const out = await start();
    expect(out.kind).toBe('listed');
    expect(resolves()).toHaveLength(1);
    expect(resolves()[0]!.body).toMatchObject({ app: 'bash', pick: 'id', candidate_id: 'c1', pass_env: ['HUB_OPEN_FILE'] });
    for (const s of k.sent) {
      const { env: staged, ...rest } = (s.body ?? {}) as { env?: Record<string, string> };
      expect(JSON.stringify([s.path, s.query, rest])).not.toContain(PATH);
      if (s.path === '/api/v1/terminal/execute' && s.target.index !== 0) expect(staged?.HUB_OPEN_FILE).toBe(PATH);
    }
    const create = k.of('/api/v1/terminal/create').find((s) => s.target.index !== 0)!;
    expect(create.body).toMatchObject({ shell: '/bin/bash' });
    // The row and the recent list keep the safe label, never the path.
    expect(JSON.stringify(loadRecent())).not.toContain(PATH);
    expect(JSON.stringify(heldAttempts())).not.toContain(PATH);
  });
});

describe('one claim, a barrier before every command id, release only on proof', () => {
  it('ow_started_keeps_hold: admitted, not proven running: the hold stays, naming the execute that left', async () => {
    const out = await start();
    expect(out.kind === 'listed' && row(out.key).state).toBe('started');
    const [h] = owHolds();
    expect(h).toBeDefined();
    const exec = bandExecutes()[0]!.body as { id: string; incarnation: string };
    expect(h!.meta).toMatchObject({ v: 2, p: 'tpl', program: 'Nano', opens: 'terminal', handle: { command_id: Number(exec.id), incarnation: exec.incarnation } });
    expect((h!.meta as { tag: string }).tag).toMatch(/^[0-9a-f]{16}$/);
    expect(h!.metaVersion).toBe(1);
    expect(h!.inFlight).toBe(false);
  });

  it('a read of this launch running (its own tag) frees the hold as proved; the row stays listed', async () => {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    expect(row(out.key).state).toBe('running');
    expect(owHolds()).toHaveLength(0);
    expect(loadRecent().rows).toHaveLength(1);
  });

  it('ow_collision_update_failure_never_dispatches_next_id: id A taken, the hold refuses the write naming B: B never leaves', async () => {
    let refuse = false;
    const real = localStorage.setItem.bind(localStorage);
    spyStore().mockImplementation((key: string, value: string) => {
      if (refuse && key === CHANGE_STORE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return real(key, value);
    });
    k.faults.push((s) => {
      if (s.path !== '/api/v1/terminal/execute' || s.target.index === 0) return undefined;
      refuse = true; // the second barrier's write is refused by storage
      return { status: 409, body: { error: 'taken', code: 'COMMAND_ID_EXISTS' } };
    });
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    expect(bandExecutes()).toHaveLength(1);
    expect(k.executions).toBe(0);
    expect(row(out.key)).toMatchObject({ state: 'not_started', code: 'not_durable' });
    expect(owText({ key: 'w.notDurable', vars: {} })).toMatch(/nothing was started/);
    expect(k.deletes.length).toBeGreaterThan(0);
  });

  it('ow_foreign_handle_never_releases_hold: a record at the handle that names another launch keeps the hold; Stop signals nothing', async () => {
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    // The record at (I, C) now names another launch (another tag), and it runs.
    for (const w of k.workloads) w.track_label = 'run:shell:' + 'f'.repeat(16);
    k.behaviour = {};
    await live.liveCheck(ctx(), out.key);
    await settle();
    expect(row(out.key)).toMatchObject({ state: 'unknown', code: 'foreign_record' });
    expect(owHolds()).toHaveLength(1);
    const signals = () => k.sent.filter((s) => s.path.includes('/signal')).length;
    const before = signals();
    const deletes = k.deletes.length;
    await live.liveStop(ctx(), out.key);
    await settle();
    expect(signals()).toBe(before);
    expect(k.deletes.length).toBe(deletes);
    expect(owHolds()).toHaveLength(1);
  });

  it('ow_reload_old_handle_new_execute_unanswered_stays_held: A stored, B never sent, reload: A reads another launch: held, no Stop', async () => {
    let refuse = false;
    const real = localStorage.setItem.bind(localStorage);
    spyStore().mockImplementation((key: string, value: string) => {
      if (refuse && key === CHANGE_STORE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return real(key, value);
    });
    k.behaviour = {};
    k.faults.push((s) => {
      if (s.path !== '/api/v1/terminal/execute' || s.target.index === 0) return undefined;
      // Id A is another caller's workload (another tag): A is answered taken, then B's write is refused.
      const b = s.body as { id: string; incarnation: string };
      k.workloads.push({ terminal_id: '8001', incarnation: b.incarnation, command_id: b.id, track_label: 'run:shell:' + 'e'.repeat(16), state: 'running', exit_code: null, signal: null, reason: null, user: 'user', uid: 1000, members: [1, 2], digest: 'x', env: {}, command: 'x' });
      refuse = true;
      return { status: 409, body: { error: 'taken', code: 'COMMAND_ID_EXISTS' } };
    });
    // Keep the terminal (its incarnation stays readable after the failed start).
    k.faults.push((s) => (s.method === 'DELETE' ? { status: 500, body: { error: 'x', code: 'INTERNAL' } } : undefined));
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    expect(bandExecutes()).toHaveLength(1);
    expect(k.executions).toBe(0);
    for (const s of spies) s.mockRestore();
    spies = [];
    // A reload: this tab's list and its memory of holds are gone; the stored hold (handle A) is not.
    ops.reset();
    resetAttempts();
    const held = owHolds();
    expect(held).toHaveLength(1);
    live.relistStored(ctx());
    await settle();
    // The failed start's terminal (its DELETE refused) is listed too, as a leftover: the hold's own row is the other one.
    expect(merge().some((x) => x.p === 'tpl' && x.code === 'terminal_left')).toBe(true);
    const r = merge().find((x) => x.p === 'tpl' && x.code !== 'terminal_left')!;
    expect(r).toBeDefined();
    await live.liveCheck(ctx(), r.key);
    await settle();
    const now = merge().find((x) => x.key === r.key)!;
    expect(now).toMatchObject({ state: 'unknown', code: 'foreign_record' });
    expect(owHolds()).toHaveLength(1);
    const v = rowView(now);
    expect([v.primary, ...v.more]).not.toContain('stop');
  });

  it('two tabs press at once: one claim, one resolve', async () => {
    const first = await startPlan(env(), tpl(), opts());
    // The other tab: its own (empty) list, the same stored holds.
    ops.reset();
    const second = await startPlan(env(), tpl(), opts());
    if (first.kind === 'listed') await first.done;
    await settle();
    expect(first.kind).toBe('listed');
    expect(second.kind).toBe('held');
    expect(resolves()).toHaveLength(1);
  });

  it('a claim the browser cannot store sends nothing', async () => {
    spyStore().mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const out = await start();
    expect(out).toMatchObject({ kind: 'refused', words: { key: 'w.notDurable' } });
    expect(k.sent).toHaveLength(0);
    expect(ops.get().launches).toHaveLength(0);
  });

  it('25 launches: the first hold survives the recent list keeping only 20', async () => {
    for (let i = 0; i < 25; i++) await start(tpl(`/home/u/f${i}.txt`), opts(`Nano · f${i}.txt`));
    expect(owHolds()).toHaveLength(25);
    expect(loadRecent().rows.length).toBeLessThanOrEqual(20);
    // Pressed again in another tab: held by the ledger, not by a recent row.
    ops.reset();
    const again = await start(tpl('/home/u/f0.txt'), opts('Nano · f0.txt'));
    expect(again.kind).toBe('held');
    expect(resolves()).toHaveLength(25);
  });

  it("the launcher's candidate id changes between presses: still the same launch, still held", async () => {
    await start();
    ops.reset();
    const again = await start(tpl(), { ...opts(), launcher: { ...LAUNCHER, candidateId: 'c9' } });
    expect(again.kind).toBe('held');
    expect(resolves()).toHaveLength(1);
  });

  it("another tab's write to the hold (its Remove) makes the next barrier refuse: no execute", async () => {
    const plan = tpl();
    const p = await prepareLaunch(env(), plan, opts());
    if (!p.ok) throw new Error(p.out.kind);
    // The other tab removes the hold before this one's execute.
    const [h] = owHolds();
    writeChanges((readChanges() ?? []).filter((c) => c.id !== h!.id));
    window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY }));
    const out = p.go();
    await out.done;
    await settle();
    expect(bandExecutes()).toHaveLength(0);
    expect(row(out.key)).toMatchObject({ state: 'not_started', code: 'not_durable' });
  });

  it('no bash shell on the computer: refused before any execute, the claim dropped', async () => {
    k.createShellEcho = 'none';
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    expect(bandExecutes()).toHaveLength(0);
    expect(row(out.key)).toMatchObject({ state: 'not_started', code: 'shell_unavailable' });
    expect(owHolds()).toHaveLength(0);
  });

  it('no exec permission at the press: nothing claimed, nothing sent', async () => {
    S.can = false;
    const out = await start();
    expect(out).toMatchObject({ kind: 'refused', words: { key: 'w.execOff' } });
    expect(owHolds()).toHaveLength(0);
    expect(k.sent).toHaveLength(0);
  });

  it('the place no longer shows the computer once the identity is hashed: dropped, nothing claimed or sent', async () => {
    let shown = true;
    const writes = spyStore();
    const p = prepareLaunch({ ...env(), shows: () => shown }, tpl(), opts());
    shown = false; // the person switched computer (or account) while the hash ran
    const out = await p;
    expect(out).toMatchObject({ ok: false, out: { kind: 'dropped' } });
    // Nothing was claimed, not even for a moment: the change store was never written.
    expect(writes.mock.calls.filter(([key]) => key === CHANGE_STORE_KEY)).toHaveLength(0);
    expect(owHolds()).toHaveLength(0);
    expect(k.sent).toHaveLength(0);
  });

  it('no launcher row: nothing claimed (no bash for Files)', async () => {
    const out = await start(tpl(), { ...opts(), launcher: null });
    expect(out).toMatchObject({ kind: 'refused', words: { key: 'w.noBash' } });
    expect(owHolds()).toHaveLength(0);
  });

  it('pressed again while it runs: offered, not started; Open another is a new claim', async () => {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    const again = await start();
    expect(again).toMatchObject({ kind: 'running', key: out.key, words: { key: 'r.running' } });
    expect(owText((again as { words: { key: string; vars: Record<string, string> } }).words)).toBe('Nano is already running, started with x.txt.');
    const another = await start(tpl(), opts('Nano · x.txt', { another: true }));
    expect(another.kind).toBe('listed');
    expect(resolves()).toHaveLength(2);
  });

  it('Restart with the plan in memory: a new claim, the same request; Check only reads', async () => {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    expect(row(out.key).planned).toBe(true);
    const n = resolves().length;
    await live.liveCheck(ctx(), out.key);
    expect(resolves()).toHaveLength(n);
    const how = live.recoveryFor(row(out.key));
    if (how.kind !== 'plan') throw new Error(how.kind);
    const ready = await how.rec.prepare({ live: ctx(), launch: () => undefined, shows: () => true });
    expect(ready.ok).toBe(true);
    if (!ready.ok) return;
    ready.go();
    await settle(60);
    expect(resolves()).toHaveLength(n + 1);
    const execs = bandExecutes();
    expect((execs[execs.length - 1]!.body as { env: Record<string, string> }).env.HUB_OPEN_FILE).toBe(PATH);
  });

  it('Restart after the place that started it is gone: the plan runs through the machine of the place pressing it, on that computer only', async () => {
    k.behaviour = {};
    // The press's place: its machine ends with it (unmount aborts it, as useRunOpen does).
    const gone = new AbortController();
    const send = runOpenSend({ target: TGT, mayLaunch: () => S.can, signal: gone.signal, alive: () => !gone.signal.aborted });
    m = createRunOpen({ send: (t, me, p, q, b) => (gone.signal.aborted ? Promise.reject({ notSent: true, code: 'stale' }) : send(t, me, p, q, b)), now: k.now, sleep: k.sleep, random: k.random, computer: { project: PID, computer_id: CID } });
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    gone.abort();
    const how = live.recoveryFor(row(out.key));
    if (how.kind !== 'plan') throw new Error(how.kind);
    const holds = owHolds().length;
    const other = { project: { id: PID }, container: { id: 'd'.repeat(24), server_name: 'sv1' } } as Target;
    const fresh = createRunOpen({ send: runOpenSend({ target: TGT, mayLaunch: () => S.can }), now: k.now, sleep: k.sleep, random: k.random, computer: { project: PID, computer_id: CID } });
    // Another computer, or no machine: refused before any claim.
    expect(await how.rec.prepare({ live: { m: fresh, target: other }, launch: () => undefined, shows: () => true })).toEqual({ ok: false });
    expect(await how.rec.prepare({ live: { m: null, target: TGT }, launch: () => undefined, shows: () => true })).toEqual({ ok: false });
    expect(owHolds()).toHaveLength(holds);
    const n = bandExecutes().length;
    const ready = await how.rec.prepare({ live: { m: fresh, target: TGT }, launch: () => undefined, shows: () => true });
    if (!ready.ok) throw new Error('refused');
    ready.go();
    await settle(60);
    expect(bandExecutes()).toHaveLength(n + 1);
    expect((bandExecutes()[n]!.body as { env: Record<string, string> }).env.HUB_OPEN_FILE).toBe(PATH);
  });

  it('a computer switch while Restart hashes the identity: nothing is claimed and nothing is sent', async () => {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    const how = live.recoveryFor(row(out.key));
    if (how.kind !== 'plan') throw new Error(how.kind);
    const holds = owHolds().length;
    const sent = k.sent.length;
    let shown = true;
    // The place shows this computer at the press; it switches before the identity's hash answers.
    const pending = how.rec.prepare({ live: ctx(), launch: () => undefined, shows: () => shown });
    shown = false;
    expect(await pending).toEqual({ ok: false });
    await settle(60);
    expect(owHolds()).toHaveLength(holds);
    expect(k.sent).toHaveLength(sent);
  });

  it.each([
    ['cleared', false],
    ['refused by storage', true],
  ])('a computer switch while Restart claims: nothing is sent, and a claim whose cleanup is %s says whether the start stays reserved', async (_n, refuse) => {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    const how = live.recoveryFor(row(out.key));
    if (how.kind !== 'plan') throw new Error(how.kind);
    const sent = k.sent.length;
    let blocked = false;
    const real = localStorage.setItem.bind(localStorage);
    spyStore().mockImplementation((key: string, value: string) => {
      if (blocked && key === CHANGE_STORE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      return real(key, value);
    });
    // Shown at the press and after hashing; switched by the time the claim answers (the third look).
    let looks = 0;
    const shows = () => {
      looks += 1;
      if (looks < 3) return true;
      blocked = refuse;
      return false;
    };
    const res = await how.rec.prepare({ live: ctx(), launch: () => undefined, shows });
    expect(looks).toBeGreaterThanOrEqual(3);
    expect(res).toEqual(refuse ? { ok: false, kept: true } : { ok: false });
    await settle(60);
    expect(k.sent).toHaveLength(sent);
    expect(owHolds()).toHaveLength(refuse ? 1 : 0);
  });

  it('a hold read back without this tab (recent list evicted) keeps the launch identity: once proven running, a second press of the same file offers the running one', async () => {
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    expect(row(out.key).state).toBe('started');
    const cand = row(out.key).candidate;
    expect(cand).toMatch(/^other:ow-nano-[0-9a-f]{32}$/);
    // The recent list lost the row and this tab forgot it: only the hold lists it again.
    saveRecent(readRecent(null));
    ops.reset();
    live.relistStored(ctx());
    await settle(60);
    const back = ops.get().launches.find((l) => l.candidate === cand);
    expect(back).toBeTruthy();
    // A read proves it running: the hold is freed, the row (and its identity) stays.
    k.behaviour = {};
    await live.liveCheck(ctx(), back!.key);
    await settle(60);
    expect(owHolds()).toHaveLength(0);
    expect(row(back!.key)).toMatchObject({ state: 'running', candidate: cand });
    const n = resolves().length;
    const again = await startPlan(env(), tpl(), opts());
    expect(again.kind).toBe('running');
    expect(resolves()).toHaveLength(n);
  });

  it('the identity is independent of the launcher and stable for one account, computer, program, path and place', async () => {
    const a = await subjectOf({ account: 'u', project: 'p1', computer: 'c1', plan: tpl() });
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await subjectOf({ account: 'u', project: 'p1', computer: 'c1', plan: tpl() })).toBe(a);
    expect(await subjectOf({ account: 'u', project: 'p1', computer: 'c1', plan: tpl('/home/u/other.txt') })).not.toBe(a);
    expect(await subjectOf({ account: 'v', project: 'p1', computer: 'c1', plan: tpl() })).not.toBe(a);
    const c = await claim({ cid: CID, subject: a, realm: null, plan: tpl(), program: 'Nano', project: PID });
    expect(c.ok && c.ledger.hold).toBeTruthy();
    expect(owHolds()[0]!.lock).toBe(`ow:${CID}:${a}`);
  });
});

describe('the dispatch guard: a marked launch leaves only as toLaunch built it', () => {
  const base = { type: 'row' as const, name: 'Nano · x', id: 'c1', description: '', opensIn: 'terminal' as const, by: 'server' as const, provider: 'system' as const, version: '', attr: '', path: '', sourceId: '', setId: '', app: 'bash', shares: false, runnable: true, unsure: false, installed: true, also: [], ready: true, tier: 0, ord: 0, group: 0 as const, detail: '' };
  const good = { args: ['-c', 'f=$HUB_OPEN_FILE; unset HUB_OPEN_FILE\ncd -- "${f%/*}/" || exit 125\nexec -- "$@" "$f"', 'open-with', '/usr/bin/nano'], env: { HUB_OPEN_FILE: '/a/b' }, opensIn: 'terminal' as const, shell: 'bash' as const, beforeExecute: () => Promise.resolve(true) };
  const DIR_SCRIPT = 'f=$HUB_OPEN_DIR; unset HUB_OPEN_DIR\ncd -- "$f/" || exit 125\nexec -- "$@" "$f"';
  const RUN_SCRIPT = 'f=$HUB_OPEN_FILE; unset HUB_OPEN_FILE\ncd -- "${f%/*}/" || exit 125\nexec -- "$f"';
  it('the same options sealed as built: sent', async () => {
    k.behaviour = {};
    ops.addLaunch({ key: 'g', name: 'x', opensIn: 'terminal', state: 'starting', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID, p: 'tpl' });
    await live.liveOpen(ctx(), 'g', live.sealLaunch({ ...base, p: 'tpl' }, good), {});
    expect(k.sent.length).toBeGreaterThan(0);
  });
  it.each([
    ['another script', { ...good, args: ['-c', 'rm -rf ~', 'open-with'] }, 'tpl'],
    ['no -c', { ...good, args: good.args.slice(1) }, 'tpl'],
    ['no staged path', { ...good, env: {} }, 'tpl'],
    ['a second variable', { ...good, env: { HUB_OPEN_FILE: '/a/b', LD_PRELOAD: '/x.so' } }, 'tpl'],
    ['another variable', { ...good, env: { PATH: '/x' } }, 'tpl'],
    ['no bash pin', { ...good, shell: undefined }, 'tpl'],
    ['a command preamble on a template', { ...good, args: ['-c', 'f=$HUB_OPEN_FILE; unset HUB_OPEN_FILE\ncd -- "${f%/*}/" || exit 125\nset -- "$f"; unset f\nrm -rf ~', 'open-with'] }, 'tpl'],
    ['a folder launch without its folder', {}, 'apphere'],
    ['no barrier', { ...good, beforeExecute: undefined }, 'tpl'],
    ['a folder script reading the file variable', { ...good, args: ['-c', DIR_SCRIPT, 'open-with', '/usr/bin/mc'] }, 'tpl'],
    ['the Run script on a template', { ...good, args: ['-c', RUN_SCRIPT, 'open-with'] }, 'tpl'],
    ["a template's script on Run", good, 'run'],
  ])('%s: refused unsent', async (_name, o, p) => {
    ops.addLaunch({ key: 'g', name: 'x', opensIn: 'terminal', state: 'starting', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID, p });
    await live.liveOpen(ctx(), 'g', live.sealLaunch({ ...base, p }, o as never), {});
    expect(k.sent).toHaveLength(0);
    expect(row('g')).toMatchObject({ state: 'not_started', code: 'invalid_options' });
  });
});

describe('the seal keeps the request as built', () => {
  it('a change to the item or its options after toLaunch changes nothing that is sent', async () => {
    k.behaviour = {};
    const b = toLaunch(tpl(), { launcher: LAUNCHER, label: 'Nano · x.txt', subject: '0'.repeat(32), beforeExecute: () => Promise.resolve(true) });
    if (!b) throw new Error('not built');
    b.o.args![1] = 'touch /tmp/pwned';
    b.o.args!.push('--evil');
    b.o.env!.HUB_OPEN_FILE = '/etc/shadow';
    b.item.app = 'evil';
    b.item.id = 'evil-candidate';
    ops.addLaunch({ key: 'g', name: 'x', opensIn: 'terminal', state: 'starting', terminal: null, handle: '', source: '', command: '', settings: [], urls: {}, startedAt: 1, computer: CID, p: 'tpl' });
    await live.liveOpen(ctx(), 'g', b.item, b.o);
    await settle(60);
    const wire = JSON.stringify(k.sent);
    expect(wire).not.toContain('pwned');
    expect(wire).not.toContain('--evil');
    expect(wire).not.toContain('/etc/shadow');
    expect(wire).not.toContain('evil-candidate');
    expect((bandExecutes()[0]!.body as { env: Record<string, string> }).env.HUB_OPEN_FILE).toBe(PATH);
  });
});

const merge = () => ops.get().launches.map((l) => ({ ...l, ...ops.get().patches.get(l.key) })).filter((l) => !ops.get().forgotten.has(l.key));

describe('another tab\'s launch counts at once, and a Files launch\'s leftover terminal stays listed', () => {
  /** Tab A starts the file and it is proven running (its hold freed); the recent list keeps its row. */
  async function tabA() {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    expect(owHolds()).toHaveLength(0);
    return loadRecent();
  }

  it('cross_tab_row_holds_before_claim: tab A\'s stored row, no storage event in tab B yet: B claims and sends nothing', async () => {
    await tabA();
    const n = resolves().length;
    // Tab B: its own (empty) list; the storage event has not arrived; the stored list already has A's row.
    ops.reset();
    const writes = spyStore();
    const again = await startPlan(env(), tpl(), opts());
    expect(['held', 'running']).toContain(again.kind);
    expect(resolves()).toHaveLength(n);
    expect(owHolds()).toHaveLength(0);
    // Decided before any claim: B wrote no hold at all.
    expect(writes.mock.calls.filter(([key]) => key === CHANGE_STORE_KEY)).toHaveLength(0);
  });

  it.each([
    ['cleared', false],
    ['refused by storage', true],
  ])('cross_tab_row_appears_during_claim: A\'s row is stored while B claims: B drops its claim unsent (cleanup %s) and sends nothing', async (_n, refuse) => {
    const doc = await tabA();
    const n = resolves().length;
    const sent = k.sent.length;
    saveRecent(readRecent(null));
    ops.reset();
    const real = localStorage.setItem.bind(localStorage);
    let claimed = false;
    let blocked = false;
    spyStore().mockImplementation((key: string, value: string) => {
      if (blocked && key === CHANGE_STORE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      real(key, value);
      // The claim's first write: A's row lands in the stored list at that moment (its event comes later).
      if (key === CHANGE_STORE_KEY && !claimed) {
        claimed = true;
        saveRecent(doc);
      }
    });
    // The place's second look comes once the claim answered: from then on the browser refuses writes (when asked).
    let looks = 0;
    const shows = () => {
      looks += 1;
      if (looks >= 2) blocked = refuse;
      return true;
    };
    const again = await startPlan({ ...env(), shows }, tpl(), opts());
    expect(claimed).toBe(true);
    expect(['held', 'running']).toContain(again.kind);
    expect((again as { kept?: boolean }).kept).toBe(refuse ? true : undefined);
    await settle(60);
    expect(resolves()).toHaveLength(n);
    // Only reads went out (A's row read back): nothing created, resolved or executed.
    expect(k.sent.slice(sent).every((x) => x.method === 'GET')).toBe(true);
    expect(owHolds()).toHaveLength(refuse ? 1 : 0);
  });

  it('ow_held_by_kept_start: a press refused by a start whose cleanup this tab saw fail says kept (openKept through Open again); a hold without that evidence (another tab\'s, or a suspended one) never does', async () => {
    k.behaviour = {};
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    await live.liveCheck(ctx(), out.key);
    await settle();
    expect(owHolds()).toHaveLength(0);
    const how = live.recoveryFor(row(out.key));
    if (how.kind !== 'plan') throw new Error(how.kind);
    const n = resolves().length;
    const again = opts('Nano · x.txt', { another: true });
    // A hold of this launch made elsewhere, its sending ended, no handle (another tab's, or one whose beat went stale).
    const subject = await subjectOf({ account: capture(TGT).account ?? '', project: PID, computer: CID, plan: tpl() });
    const other = await claim({ cid: CID, subject, realm: capture(TGT).realm ?? null, plan: tpl(), program: 'Nano', project: PID });
    if (!other.ok) throw new Error(other.code);
    other.ledger.hold.sent();
    const p1 = await prepareLaunch(env(), tpl(), again);
    expect(p1).toMatchObject({ ok: false, out: { kind: 'held' } });
    expect((p1 as { out: { kept?: boolean } }).out.kept).toBeUndefined();
    attemptFor(other.ledger.hold.id, 'apps:openwith')?.dismiss(true);
    expect(owHolds()).toHaveLength(0);
    // This tab's press: the place stops showing the computer once claimed, and the browser refuses the cleanup's write.
    const real = localStorage.setItem.bind(localStorage);
    let blocked = false;
    spyStore().mockImplementation((key: string, value: string) => {
      if (blocked && key === CHANGE_STORE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      real(key, value);
    });
    let looks = 0;
    const shows = () => (++looks < 2 ? true : ((blocked = true), false));
    expect(await startPlan({ ...env(), shows }, tpl(), again)).toEqual({ kind: 'dropped', kept: true });
    expect(owHolds()).toHaveLength(1);
    blocked = false;
    const p2 = await prepareLaunch(env(), tpl(), again);
    expect(p2).toMatchObject({ ok: false, out: { kind: 'held', kept: true } });
    expect(await how.rec.prepare({ live: ctx(), launch: () => undefined, shows: () => true })).toEqual({ ok: false, kept: true });
    expect(resolves()).toHaveLength(n);
  });

  it('ow_kept_through_row_refusal: a start this tab could not clear is still said when the next press is refused by a row (before any claim)', async () => {
    const doc = await tabA();
    saveRecent(readRecent(null));
    ops.reset();
    const real = localStorage.setItem.bind(localStorage);
    let claimed = false;
    let blocked = false;
    spyStore().mockImplementation((key: string, value: string) => {
      if (blocked && key === CHANGE_STORE_KEY) throw new DOMException('quota', 'QuotaExceededError');
      real(key, value);
      if (key === CHANGE_STORE_KEY && !claimed) {
        claimed = true;
        saveRecent(doc);
      }
    });
    let looks = 0;
    const shows = () => ((looks += 1), looks >= 2 && (blocked = true), true);
    const first = await startPlan({ ...env(), shows }, tpl(), opts());
    expect(['held', 'running']).toContain(first.kind);
    expect((first as { kept?: boolean }).kept).toBe(true);
    blocked = false;
    const n = resolves().length;
    // The next press: A's row refuses it before any claim; the start this tab could not clear is still said.
    const again = await startPlan(env(), tpl(), opts());
    expect(['held', 'running']).toContain(again.kind);
    expect((again as { kept?: boolean }).kept).toBe(true);
    // Decided by A's row, before any claim: the kept hold is this tab's only one.
    expect(owHolds()).toHaveLength(1);
    expect(resolves()).toHaveLength(n);
  });

  it('ow_leftover_row_frees_hold: a Files launch refused after its create, whose DELETE got no answer: the hold is freed (nothing ran), the row offers Remove, and Remove closes the terminal', async () => {
    k.faults.push((s) => (s.path === '/api/v1/terminal/execute' && s.target.index !== 0 ? { status: 409, body: { error: 'shell_unsupported', code: 'SHELL_UNSUPPORTED' } } : undefined));
    k.faults.push((s) => (s.method === 'DELETE' ? { status: 503, body: { error: 'unavailable', code: 'UNAVAILABLE' } } : undefined));
    const out = await start();
    if (out.kind !== 'listed') throw new Error(out.kind);
    expect(row(out.key)).toMatchObject({ state: 'not_started', code: 'terminal_left' });
    expect(owHolds()).toHaveLength(0);
    expect(loadRecent().rows).toEqual([expect.objectContaining({ left: true, command_id: 0 })]);
    const n = [...k.sessions.keys()].filter((x) => x !== 0).length;
    expect(n).toBe(1);
    expect(await live.liveRemove(ctx(), out.key)).toBe('removed');
    expect([...k.sessions.keys()].filter((x) => x !== 0)).toHaveLength(0);
    expect(loadRecent().rows).toHaveLength(0);
  });
});
