// Keep-alive leases for conversations this tab is not streaming.
//
// The agent closes a live conversation with no subscriber, no hold and no live work about 5 minutes after it went idle,
// a parked gate counts as idle, and the close cancels the turn. An attachment lease is a hold. This module decides when
// the tab needs one and keeps it:
//
//   - need: a session needs a lease when any handle on it is `pinned` (a workflow run started from the Hub, the gap
//     between create and the first turn, a settings session), or when any handle says it is `busy` (a turn in flight,
//     a gate or question parked, queued turns) and no handle says it is `streaming` (a live stream is itself a hold).
//     Idle sessions take none.
//   - One lease per tab per session, shared by every handle on it (aggregate demand). The handles are the views
//     of the conversation: the dock, a tile, a list row, a run detail. A view that is gone leaves its busy flag behind
//     only through its handle, so close() every handle you track.
//   - acquire when needed; renew at half the time left; release when no longer needed (the session settled, the person
//     closed the chat in this tab: no handles left) and on pagehide (releaseAll).
//   - 410 or 404 on a renew while still needed: acquire again (an expired lease, or an agent restart that forgot it). A
//     404 on the acquire itself means the conversation is closing or gone: phase `gone`, nothing more is tried until
//     forget(). Any other failure retries with backoff (1, 2, 5, 10 s) for as long as it is needed.
//   - The lease id is kept in the session's journal record (LeaseStore) so a reload renews instead of minting; an
//     orphan simply expires. A lease the agent no longer knows (410/404) is dropped from the store.
//   - ensure(ref) is the stream budget's beforeCut hook: it takes the lease now, while the stream is still open, and
//     counts the stream as already gone until a handle next reports `streaming`.
//   - The computer is the ref's own: every request of a session goes to `ref.target` (the conversation's Target, never
//     the selected computer), and a ref with none is `gone` without a request.
//   - Leaving the page: releaseAll() does all its bookkeeping first (leases taken, releases registered, waits cancelled)
//     and only then tells subscribers, so a subscriber that calls resume() or track() meets a consistent manager. It
//     bumps the manager's one generation: every request on its way is then stale (a grant that arrives afterwards is
//     released at once; a renew's answer changes nothing). The manager stays still until resume() (pageshow from the
//     back/forward cache), so demand that is still there does not take a lease again while the page is going.
//   - Outcomes: a lease only keeps a conversation open, nothing of the person's is sent through it, so a lost answer is
//     just a retry; an orphan lease expires by itself.
import { agent, streamBudget, type Level, type Rank, type StreamBudget, type StreamKind, type Target, type WatchSpec } from '@core';
import { wireLeases } from './lease-live';

export interface SessionRef {
  /** The computer, as the stream budget names it. */
  computer: string;
  realm: string;
  sid: string;
  /** The conversation's own computer: where every request goes. */
  target: Target;
}
export const refKey = (r: SessionRef): string => `${r.computer}|${r.realm}|${r.sid}`;

export interface LeaseStore {
  read(ref: SessionRef): string | undefined;
  write(ref: SessionRef, leaseId: string | undefined): void;
}
export interface Need { busy: boolean; streaming: boolean; pinned: boolean }
export type LeasePhase = 'none' | 'acquiring' | 'held' | 'failing' | 'gone';
export interface LeaseState { phase: LeasePhase; leaseId?: string; expiresAt?: number }

export interface LeaseHandle {
  set(n: Partial<Need>): void;
  /** The view is gone (the person closed the chat here). */
  close(): void;
}
export interface LeaseDeps {
  api?: (ref: SessionRef) => agent.AttachApi;
  store?: LeaseStore;
  now?: () => number;
  /** Retry waits after a failed call, in ms (the last repeats). */
  backoffMs?: readonly number[];
  /** How long a busy chat may go unstreamed before it takes a lease (a stream opening is not a gap). Pinned chats and
   *  streams about to be cut do not wait. Default 1500 ms. */
  graceMs?: number;
}
export interface LeaseManager {
  track(ref: SessionRef, need?: Partial<Need>): LeaseHandle;
  /** beforeCut: the lease is held (or failed) when this settles. */
  ensure(ref: SessionRef): Promise<void>;
  state(ref: SessionRef): LeaseState;
  subscribe(fn: (key: string, s: LeaseState) => void): () => void;
  /** After `gone`: try again for this session. */
  forget(ref: SessionRef): void;
  /** pagehide: release every lease held and stop taking any until resume(). */
  releaseAll(): void;
  /** pageshow (the page came back): take leases again for the demand that is still there. */
  resume(): void;
  /** Tests: drop everything without calling the agent; every pending ensure() settles, every old handle goes dead. */
  reset(): void;
}

const BACKOFF = [1000, 2000, 5000, 10000] as const;

interface H { need: Need; gone: boolean }
interface S {
  ref: SessionRef; key: string;
  hs: Set<H>;
  lease: { id: string; expiresAt: number } | null;
  phase: LeasePhase;
  inflight: Promise<void> | null;
  /** A wait is pending: `renew` (the lease is due) or `retry` (a call failed). */
  timer: ReturnType<typeof setTimeout> | null;
  fails: number;
  cutting: boolean;
  renewDue: boolean;
  /** When the chat first needed a lease without urgency (the grace clock). */
  graceAt: number | null;
  timerKind: 'renew' | 'retry' | 'grace' | null;
  waiters: Array<() => void>;
}

const statusOf = (r: { ok: boolean; err?: { status: number; kind: string } }): number => (r.ok ? 200 : r.err ? r.err.status : 0);
const staleOf = (r: { ok: boolean; err?: { status: number; kind: string } }): boolean => !r.ok && r.err?.kind === 'stale';

export function createLeaseManager(deps: LeaseDeps = {}): LeaseManager {
  const now = deps.now ?? (() => Date.now());
  const apiOf = deps.api ?? ((ref: SessionRef) => agent.attachApi(ref.target));
  const store = deps.store;
  const grace = deps.graceMs ?? 1500;
  const backoff = deps.backoffMs && deps.backoffMs.length ? deps.backoffMs : BACKOFF;
  const sessions = new Map<string, S>();
  const subs = new Set<(key: string, s: LeaseState) => void>();
  let epoch = 0, gen = 0, leaving = false; // gen moves with releaseAll(): a request started under an older value answers into nothing
  /** Lease ids whose release is on its way: a renew of one could be answered before the release and then be undone by it. */
  const releasing = new Set<string>();

  const snapshot = (s: S): LeaseState => ({ phase: s.phase, ...(s.lease ? { leaseId: s.lease.id, expiresAt: s.lease.expiresAt } : {}) });
  function emit(s: S) { const st = snapshot(s); for (const f of [...subs]) { try { f(s.key, st); } catch { /* the caller's */ } } }
  function setPhase(s: S, p: LeasePhase) { if (s.phase !== p) { s.phase = p; emit(s); } }

  function needed(s: S): boolean {
    let busy = false, streaming = false;
    for (const h of s.hs) {
      if (h.need.pinned) return true;
      if (h.need.busy) busy = true;
      if (h.need.streaming) streaming = true;
    }
    return busy && (!streaming || s.cutting);
  }
  function get(ref: SessionRef): S {
    const key = refKey(ref);
    let s = sessions.get(key);
    if (!s) { s = { ref, key, hs: new Set(), lease: null, phase: 'none', inflight: null, timer: null, fails: 0, cutting: false, renewDue: false, graceAt: null, timerKind: null, waiters: [] }; sessions.set(key, s); }
    return s;
  }
  function clearTimer(s: S) { if (s.timer) clearTimeout(s.timer); s.timer = null; s.timerKind = null; }
  function wake(s: S) { const w = s.waiters; s.waiters = []; for (const f of w) f(); }
  function wait(s: S, ms: number, kind: 'renew' | 'retry' | 'grace') {
    clearTimer(s);
    const mine = epoch;
    s.timerKind = kind;
    s.timer = setTimeout(() => { s.timer = null; s.timerKind = null; if (mine === epoch) tick(s); }, Math.max(0, ms));
  }
  /** Pinned, or about to lose its stream: no grace. */
  const urgent = (s: S) => s.cutting || [...s.hs].some((h) => h.need.pinned);
  /** Wait after a failed call: the backoff, and never past the lease's own expiry. */
  function retryWait(s: S) {
    s.fails++;
    let ms = backoff[Math.min(s.fails, backoff.length) - 1] as number;
    if (s.lease) ms = Math.min(ms, Math.max(0, s.lease.expiresAt - now()));
    wait(s, ms, 'retry');
  }

  /** Runs one call; the guard is in place before the work starts, so a subscriber the work notifies cannot start a second. */
  function begin(s: S, work: () => Promise<void>) {
    const mine = epoch;
    s.inflight = Promise.resolve();
    s.inflight = work().catch(() => undefined).then(() => {
      if (mine !== epoch) return;
      s.inflight = null;
      tick(s);
    });
  }
  /** Releases a lease nobody holds a record of any more (a grant that arrived after releaseAll). */
  function lateRelease(ref: SessionRef, id: string) {
    releasing.add(id);
    const done = () => { releasing.delete(id); };
    void apiOf(ref).release(ref.sid, id, ref.realm, true).then((r) => { done(); if (r.ok || statusOf(r) === 404 || statusOf(r) === 410) clearStored(ref, id); }, done);
  }
  /** Forgets the session, if it is still the one under its key (a callback may have made a new one). */
  function drop(s: S) { if (sessions.get(s.key) === s) sessions.delete(s.key); }
  function clearStored(ref: SessionRef, id: string) { if (store && store.read(ref) === id) store.write(ref, undefined); }

  /** Looks at what is needed and does the one next thing; called on every change and when a wait or call ends. */
  function tick(s: S) {
    if (s.inflight) return;
    if (leaving) { wake(s); if (!s.hs.size) drop(s); return; }
    if (!needed(s)) {
      s.graceAt = null;
      clearTimer(s);
      if (s.lease) { begin(s, () => release(s)); return; }
      s.fails = 0;
      if (s.phase !== 'gone' || s.hs.size === 0) setPhase(s, 'none');
      wake(s);
      if (!s.hs.size) drop(s);
      return;
    }
    if (s.phase === 'gone') { wake(s); return; }
    // A lease that ran out is not a hold, whatever timer is still pending: a new one, not a renew of this id.
    if (s.lease && s.lease.expiresAt - now() <= 0) {
      s.lease = null; s.renewDue = false; clearTimer(s); store?.write(s.ref, undefined);
      setPhase(s, 'none');
      tick(s); // a subscriber may have changed anything: look again from the top
      return;
    }
    if (s.timer && s.timerKind === 'grace' && urgent(s)) clearTimer(s);
    if (s.timer) { wake(s); return; } // a wait is running: renew when it ends, retry when it ends
    if (!s.lease) {
      if (grace > 0 && !urgent(s) && s.fails === 0) {
        if (s.graceAt === null) s.graceAt = now();
        const left = s.graceAt + grace - now();
        if (left > 0) { wait(s, left, 'grace'); wake(s); return; }
      }
      begin(s, () => acquire(s));
      return;
    }
    const left = s.lease.expiresAt - now();
    if (s.phase === 'failing' || s.fails > 0) { begin(s, () => renew(s)); return; } // the retry wait ended
    if (s.renewDue) { s.renewDue = false; begin(s, () => renew(s)); return; }
    wait(s, left / 2, 'renew');
    s.renewDue = true;
    wake(s);
  }

  async function acquire(s: S): Promise<void> {
    const mine = epoch, ref = s.ref, api = apiOf(ref), g0 = gen;
    if (!ref.target) { setPhase(s, 'gone'); return; } // no computer to ask: nothing is sent
    setPhase(s, 'acquiring');
    const kept = store?.read(ref);
    const stored = kept && !releasing.has(kept) ? kept : undefined;
    if (stored) {
      const r = await api.renew(ref.sid, stored, ref.realm);
      if (mine !== epoch) return;
      if (g0 !== gen) { if (r.ok) lateRelease(ref, stored); return; } // releaseAll ran meanwhile
      const g = r.ok ? agent.leaseOf(r.body, now()) : null;
      if (r.ok) { adopt(s, g ? g : { id: stored, expiresAt: now() + 120000 }); return; }
      if (staleOf(r)) { setPhase(s, 'gone'); return; }
      const st = statusOf(r);
      if (st === 410 || st === 404) store?.write(ref, undefined);
      else { setPhase(s, 'failing'); retryWait(s); return; }
    }
    const r = await api.acquire(ref.sid, ref.realm);
    if (mine !== epoch) return;
    if (g0 !== gen) { const late = r.ok ? agent.leaseOf(r.body, now()) : null; if (late) lateRelease(ref, late.id); return; }
    if (r.ok) {
      const g = agent.leaseOf(r.body, now());
      if (g) { adopt(s, g); store?.write(ref, g.id); return; }
      setPhase(s, 'failing'); retryWait(s); return;
    }
    if (staleOf(r) || statusOf(r) === 404) { setPhase(s, 'gone'); return; }
    setPhase(s, 'failing');
    retryWait(s);
  }
  function adopt(s: S, g: { id: string; expiresAt: number }) {
    s.lease = { id: g.id, expiresAt: g.expiresAt };
    s.fails = 0;
    s.renewDue = false;
    setPhase(s, 'held');
    emit(s);
  }

  async function renew(s: S): Promise<void> {
    const mine = epoch, ref = s.ref, lease = s.lease, g0 = gen;
    if (!lease) return;
    const r = await apiOf(ref).renew(ref.sid, lease.id, ref.realm);
    if (mine !== epoch || g0 !== gen) return; // reset, or releaseAll sent the release meanwhile: nothing to restore
    if (r.ok) {
      const g = agent.leaseOf(r.body, now());
      s.lease = { id: lease.id, expiresAt: g ? g.expiresAt : now() + 120000 };
      s.fails = 0;
      s.renewDue = false;
      setPhase(s, 'held');
      emit(s);
      return;
    }
    if (staleOf(r)) { s.lease = null; setPhase(s, 'gone'); return; }
    const st = statusOf(r);
    if (st === 410 || st === 404) { s.lease = null; s.fails = 0; store?.write(ref, undefined); setPhase(s, 'none'); return; }
    setPhase(s, 'failing');
    retryWait(s);
  }

  async function release(s: S): Promise<void> {
    const mine = epoch, ref = s.ref, lease = s.lease;
    if (!lease) return;
    s.lease = null;
    s.fails = 0;
    s.renewDue = false;
    clearTimer(s);
    setPhase(s, 'none');
    emit(s);
    const r = await apiOf(ref).release(ref.sid, lease.id, ref.realm);
    if (mine !== epoch) return;
    const st = statusOf(r);
    // Gone for the agent too (released, expired, restarted): nothing to renew after a reload.
    if (r.ok || st === 404 || st === 410) clearStored(ref, lease.id);
  }

  return {
    track(ref, need) {
      const s = get(ref);
      const h: H = { need: { busy: false, streaming: false, pinned: false, ...need }, gone: false };
      s.hs.add(h);
      tick(s);
      return {
        set(n) {
          if (h.gone) return;
          Object.assign(h.need, n);
          if (n.streaming !== undefined) s.cutting = false;
          tick(s);
        },
        close() {
          if (h.gone) return;
          h.gone = true;
          s.hs.delete(h);
          tick(s);
        },
      };
    },
    ensure(ref) {
      const s = sessions.get(refKey(ref));
      if (!s || !s.hs.size) return Promise.resolve();
      s.cutting = true;
      return new Promise<void>((done) => {
        s.waiters.push(done);
        tick(s);
        // already settled (a lease is held, or nothing is needed): tick woke it
      });
    },
    state: (ref) => { const s = sessions.get(refKey(ref)); return s ? snapshot(s) : { phase: 'none' }; },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    forget(ref) {
      const s = sessions.get(refKey(ref));
      if (s && s.phase === 'gone') { setPhase(s, 'none'); tick(s); }
    },
    releaseAll() {
      leaving = true;
      gen++;
      // All bookkeeping first, so that whatever a subscriber does next (resume, track, close) meets a consistent manager.
      const told: S[] = [];
      for (const s of sessions.values()) {
        clearTimer(s);
        s.graceAt = null; s.renewDue = false; s.fails = 0; s.cutting = false;
        const lease = s.lease;
        s.lease = null;
        if (lease) lateRelease(s.ref, lease.id);
        if (lease || (s.phase !== 'gone' && s.phase !== 'none')) { if (s.phase !== 'gone') s.phase = 'none'; told.push(s); }
      }
      for (const s of [...sessions.values()]) {
        if (told.includes(s)) emit(s);
        wake(s);
        if (!s.hs.size && !s.inflight) drop(s);
      }
    },
    resume() {
      if (!leaving) return;
      leaving = false;
      for (const s of [...sessions.values()]) tick(s);
    },
    reset() {
      epoch++;
      leaving = false;
      for (const s of [...sessions.values()]) {
        clearTimer(s);
        for (const h of s.hs) h.gone = true;
        s.hs.clear();
        wake(s);
      }
      sessions.clear();
    },
  };
}

let shared: LeaseManager | null = null;
/** The page's one lease manager, wired to the page (lease-live.ts: pagehide/freeze give the leases back, pageshow/resume take
 *  them again, an account change drops them). Its store is the journal's. */
export function leases(): LeaseManager {
  if (shared) return shared;
  const m = createLeaseManager();
  shared = m;
  wireLeases(m);
  return m;
}

// ---- one chat's watch: the stream budget and the lease together ----

export interface LeasedWatchInput {
  ref: SessionRef;
  kind?: StreamKind;
  level: Level;
  rank?: Rank;
  open: WatchSpec['open'];
  /** The chat has work or a gate: a turn in flight, a parked gate or question, queued turns. */
  busy?: boolean;
  pinned?: boolean;
  budget?: StreamBudget;
  leases?: LeaseManager;
}
export interface LeasedWatch {
  set(level: Level, rank?: Rank): void;
  setBusy(busy: boolean): void;
  setPinned(pinned: boolean): void;
  /** The stream budget's mode for the chat (stream | degraded | state | off). */
  mode(): ModeOf;
  release(): void;
}
type ModeOf = ReturnType<ReturnType<StreamBudget['watch']>['mode']>;

/**
 * A watch on a chat's stream that cannot lose the chat: while the stream is live no lease is held, the moment it is
 * not (a budget cut, a reconnect gap, a 503 wait, a state-only view) a busy chat holds one, and a stream about to be cut
 * for a better one takes the lease first (beforeCut -> ensure).
 */
export function leasedWatch(o: LeasedWatchInput): LeasedWatch {
  const mgr = o.leases ?? leases();
  const handle = mgr.track(o.ref, { busy: o.busy ?? false, pinned: o.pinned ?? false, streaming: false });
  const w = (o.budget ?? streamBudget()).watch({
    computer: o.ref.computer, key: o.ref.sid, kind: o.kind ?? 'session', level: o.level, rank: o.rank, open: o.open,
    onMode: (m) => handle.set({ streaming: m.mode === 'stream' }),
    beforeCut: () => mgr.ensure(o.ref),
  });
  handle.set({ streaming: w.mode().mode === 'stream' });
  return {
    set: (level, rank) => w.set(level, rank),
    setBusy: (busy) => handle.set({ busy }),
    setPinned: (pinned) => handle.set({ pinned }),
    mode: () => w.mode(),
    release: () => { w.release(); handle.close(); },
  };
}
