// Tests only (run.test.ts, run.rank.test.ts, ../github-pane.test.tsx): a manual clock and a scripted AgentIO. Pages
// cannot reach Ask's fixture agent, so each IO method is a recorded call whose answer the test decides.
import * as A from '@ask/io';
import type { AgentIO, StreamHandlers } from '@ask/io';
import { expect } from 'vitest';
import { attemptFor, attemptStored, capture, heldAttempts, type Target } from '@core';
import { BY, admitOn, heldHandle } from './held';
import type { Admit, Clock, RunHold, RunMeta } from './run';

/** The account the tests' runs belong to: the signed-in account of core's test environment (`bindCoreEnv` checks it). */
export const ACCT = '64f0c0ffee0000000000c0de';
/** Core's test environment, handed in by the test file (a page's non-test file imports @core only, never @core/test/env). */
let env: { boot: () => void; reload: () => void } | null = null;
export function bindCoreEnv(e: { UID: string; boot: () => void; resetAttempts: () => void }): void {
  if (e.UID !== ACCT) throw new Error('the test environment signs in another account than ACCT');
  env = { boot: e.boot, reload: e.resetAttempts };
}
const need = (): NonNullable<typeof env> => { if (!env) throw new Error('call bindCoreEnv() in the test file first'); return env; };
/** The account core shows now (a page test boots core on the fixture world, whose account is another). */
const shown = (): string => { try { const a = capture().account; return a == null ? '' : String(a); } catch { return ''; } };

export const SID = 's1';
export const INC = 'inc1';
/** The computer the scripted agent plays (guardIO binds the run's io to it). */
export const COMPUTER = 'c1';

export function manual() {
  let now = 0, n = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    set: (fn, ms) => { const id = ++n; timers.set(id, { at: now + ms, fn }); return id; },
    clear: (id) => void timers.delete(id as number),
    random: (k) => { const b = new Uint8Array(k); b.fill(++n % 251); return b; },
  };
  const run = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
    }
    now = end;
  };
  return { clock, run, pending: () => timers.size };
}

export type Call = { m: string; args: unknown[] };
export type Answer = { ok: unknown } | { err: unknown } | 'hold';
export const flush = () => new Promise((r) => setTimeout(r, 0));

export function scripted(over: Partial<Record<keyof AgentIO, Answer[]>> = {}) {
  const calls: Call[] = [];
  const queue: Partial<Record<string, Answer[]>> = { ...over };
  let alive = true;
  const held: { m: string; res: (v: unknown) => void; rej: (e: unknown) => void }[] = [];
  const defaults: Record<string, unknown> = {
    health: { ok: true },
    version: { session_protocol_version: A.MIN_SESSION_PROTOCOL, capabilities: A.REQUIRED_CAPS.map((name) => ({ name, supported: true, available: true })) },
    authStatus: { account_id: shown() || ACCT, auth_active: true, owner_fingerprint: 'fp', restriction: 'none' },
    computer: { data: { id: 'c1', realm_ids: [] } },
    create: { session_id: SID, started: { realm_selector: 'global', computer_id: 'c1', owner_fingerprint: 'fp' } },
    turn: { turn_id: 't1', state: 'accepted', stream_url: `/api/v1/agent/sessions/${SID}/stream?since=0&incarnation=${INC}` },
    receipt: { turn_id: 't1', state: 'completed' },
    stop: { command_id: 'cmd9', kind: 'stop', state: 'committed', stopped: [{ kind: 'session', id: SID, outcome: 'stopped' }] },
    confirm: { status: 'ok' },
    answer: { status: 'ok' },
    state: { incarnation: INC, seq: 0 },
    replay: { incarnation: INC, min_seq: 1, max_seq: 0, events: [] },
    transcript: { messages: [] },
  };
  let h: StreamHandlers | null = null;
  let streams = 0;
  const answer = (m: string, args: unknown[]): Promise<unknown> => {
    calls.push({ m, args });
    const a = queue[m]?.shift() ?? { ok: defaults[m] ?? {} };
    if (a === 'hold') return new Promise((res, rej) => void held.push({ m, res, rej }));
    return 'err' in a ? Promise.reject(a.err) : Promise.resolve(a.ok);
  };
  const raw = new Proxy({} as AgentIO, {
    get: (_t, m: string) => {
      if (m === 'alive') return () => alive;
      if (m === 'stream') return (sid: string, cur: unknown, realm: string, hh: StreamHandlers) => { calls.push({ m, args: [sid, cur, realm] }); h = hh; streams++; return { close: () => { if (h === hh) h = null; } }; };
      return (...args: unknown[]) => answer(m, args);
    },
  });
  // What liveIO does for a real io: the computer it sends to.
  const io = A.withFixtureDest(raw, COMPUTER);
  let seq = 0;
  const frame = (type: string, data: unknown, o: { gate?: unknown; turn?: string } = {}) => {
    const env = { seq: ++seq, incarnation: INC, turn_id: o.turn ?? 't1', event: { type: 'event.' + type, data }, ...(o.gate ? { gate: o.gate } : {}) };
    h?.frame(type, JSON.stringify(env));
  };
  return {
    io, calls, held, frame,
    of: (m: string) => calls.filter((c) => c.m === m),
    kill: () => void (alive = false),
    streams: () => streams,
    open: () => h !== null,
    drop: () => h?.error(),
    /** A frame as the transport hands it, unwrapped (Ask's live IO sends a replay gap as lagged {"code":"replay_gap"}). */
    raw: (name: string, data: string) => h?.frame(name, data),
  };
}


/** core's real held changes (holdAttempt / attemptFor, on the test's storage) behind the run's RunHold, with the stand-in's old
 *  surface kept for the tests: `rows` (by the names h1, h2, ... in admission order), `log`, `saves`, `o.refuse`, `o.failSave`,
 *  `o.failFree`, `o.gate`, `o.badVersion`, `meta()` and `reload()`. A test that forces `rows.get('h1').sending` makes Dismiss refuse, as a send
 *  of another tab would. */
let lastTest: string | null = null;
export function holds() {
  const name = expect.getState().currentTestName ?? '';
  if (name !== lastTest) { A.resetPageForTests(); need().boot(); lastTest = name; }
  // One store per call: a hold an earlier call of this test left is let go (the run tests build several stores in one test).
  for (const h of heldAttempts()) if (h.by === BY) attemptFor(h.id, BY)?.release();
  const target = { project: { id: 'p1' }, container: { id: COMPUTER, server_name: 'sv1' } } as unknown as Target;
  let n = 0;
  const ids = new Map<string, string>();
  const forced = new Set<string>();
  const log: string[] = [];
  /** Each landed save's step and whether it stamped the send as out. */
  const saves: { step: string; sending: boolean; k4?: string }[] = [];
  // gate: saves wait for it (a save queued behind core's store lock) and land when it opens.
  const o = { refuse: null as 'held' | 'storage' | null, failSave: false, failFree: false, gate: null as Promise<void> | null, badVersion: false };
  const wrap = (real: RunHold): RunHold => ({
    id: real.id,
    key: real.key,
    // badVersion: the version the run offers the held door is not the stored one (a hold that cannot be authorized): admission refuses.
    version: () => (o.badVersion ? real.version() + 1000 : real.version()),
    lease: () => real.lease(),
    save: (meta, sending) => {
      const land = (): Promise<boolean> => {
        if (o.failSave) return Promise.resolve(false);
        return real.save(meta, sending).then((ok) => {
          if (ok) { log.push('save:' + meta.step); saves.push({ step: meta.step, sending, ...((meta as { k4?: string }).k4 ? { k4: (meta as { k4?: string }).k4 } : {}) }); }
          return ok;
        });
      };
      return o.gate ? o.gate.then(land) : land();
    },
    release: () => { log.push('release'); real.release(); },
    // As core's free('dismissed', {metaVersion}): refused while another version is stored or a send of it is out.
    dismiss: (shown) => {
      log.push('dismiss');
      if (o.failFree) return Promise.resolve('unresolved' as const);
      if (forced.has(real.id)) return Promise.resolve('refused' as const);
      return real.dismiss(shown);
    },
  });
  const admit: Admit = (meta, realm) => {
    if (o.refuse) return Promise.resolve({ refused: o.refuse });
    return admitOn(target)(meta, realm).then((a) => {
      if (!('hold' in a)) return a;
      ids.set('h' + ++n, a.hold.id);
      log.push('admit:' + meta.step);
      return { hold: wrap(a.hold) };
    });
  };
  const mine = () => heldAttempts().filter((h) => h.by === BY);
  const rows = {
    get size() { return mine().length; },
    get(h: string) {
      const id = ids.get(h);
      const row = id ? mine().find((x) => x.id === id) : undefined;
      if (!id || !row) return undefined;
      return {
        key: row.key,
        get v() { return row.metaVersion; },
        get sending() { return forced.has(id) || row.inFlight !== false; },
        set sending(b: boolean) { if (b) forced.add(id); else forced.delete(id); },
      };
    },
  };
  const first = () => mine()[0];
  return {
    admit, rows, log, saves, o,
    /** The key of hold `h` (h1, h2, ...): the create's idempotency key. */
    keyOf: (h: string): string | undefined => rows.get(h)?.key,
    meta: (): RunMeta | null => { const r = first(); if (!r) return null; const v = attemptStored(r.id, BY); return v.s === 'ok' ? (JSON.parse(JSON.stringify(v.v.meta)) as RunMeta) : null; },
    /** After a reload: this tab's memory of its holds and beats is gone; the stored hold's handle and its meta as stored. */
    reload: (): { hold: RunHold; meta: unknown } => {
      need().reload();
      const r = first();
      const h = r ? heldHandle(r.id, r.metaVersion) : null;
      if (!r || !h) throw new Error('no stored hold');
      return { hold: wrap(h), meta: JSON.parse(JSON.stringify(r.meta)) as unknown };
    },
  };
}
