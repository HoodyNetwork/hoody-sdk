// stream-budget.ts: how many agent streams a browser may hold per computer, and who gets them.
// The gateway caps connections per IP and answers 503 past it, so the Hub keeps itself under
// 8 per computer, counting every kind: session streams, the change feed, Bot log streams, Bot session streams and Bot
// voice WebSockets (socket.ts: one slot per live voice session, taken before it opens).
//
// Contract:
//   - watch(spec): one stream is one entry, named by (computer, kind, key). Every watch on the same entry shares it: the
//     first spec's open() is the opener, and the entry's level is the strongest of its watches (stream > state > off),
//     its rank the best rank among the watches that want a stream. A tile going passive therefore never downgrades a
//     conversation the dock still watches.
//   - Slots: a stream runs only while it holds a Web Lock `hoody-agent-stream:<computer>:<n>`, taken with
//     hostEnv().locks.request(name, {ifAvailable: true}) (web: navigator.locks) for n = 1..8 and held for the stream's life,
//     so the cap holds across this browser's tabs. Without locks the tab counts for itself.
//   - Ranks, best first: changes, open, voice, focused, dock, visible, bot (default: changes for the change feed, voice
//     for a Bot voice socket, bot for the other Bot kinds, visible otherwise). A full budget cuts the worst-ranked stream (the newest of that rank) for a better
//     one; an equal rank never preempts. The change feed ranks first, so it is never cut.
//   - The reserved slot (one change-feed slot per computer is never preempted): the last lock (`limit`, 8) is
//     the feed's alone. Every other kind takes only locks 1..limit-reserve (reserve 1, so at most 7 of them), in every
//     tab, so the feed's lock is free whatever the other tabs run; the feed tries it first, then the rest downwards.
//     The feed ranks first, so every pass serves it first and nothing ranks above it to cut it. The limit of Web
//     Locks: a held lock cannot be taken back from another tab, so only ONE feed per computer and browser is
//     guaranteed (the first to take lock 8); a second tab's feed takes any free lock below it, or waits (degraded:
//     locks, retried every retryMs).
//   - Lock pressure: a wanted entry that finds every lock it may take held cuts this tab's worst-ranked holder that
//     ranks STRICTLY below it (newest of that rank), whatever the count of local entries: other tabs' holds are not
//     in the count.
//   - A cut is decided twice: when the pass chooses it and again after the owner's beforeCut finished (also when a
//     hook threw); if the demand that asked for it is gone by then, or the victim is no longer the worst eligible
//     one, or a lock came free meanwhile, the stream stays.
//   - Mode (what the owner of the entry should show or do): `stream` (a slot is held and the opener says it is live),
//     `degraded` (a stream is wanted and not live; why = budget | locks | pending | reconnecting | closed: read state
//     and keep a lease), `state` (reads only), `off`. A locks refusal (another tab holds the slots) is retried
//     every retryMs; a budget refusal waits for a slot to be freed.
//   - The opener returns {close} (or null when it refuses) and gets a Grant: live(false) while it is down for a
//     moment (a reconnect gap, a 503 wait) keeps the slot and reports degraded; live(true) when it is back; ended()
//     when it is over for good: the slot is freed and nothing reopens until retry(). A Grant of an earlier open is
//     ignored.

import { hostEnv } from './host-env';

export type StreamKind = 'changes' | 'session' | 'bot-log' | 'bot-session' | 'bot-voice';
export type Rank = 'changes' | 'open' | 'voice' | 'focused' | 'dock' | 'visible' | 'bot';
export type Level = 'stream' | 'state' | 'off';
export type Mode = 'stream' | 'degraded' | 'state' | 'off';
export type WhyNot = 'budget' | 'locks' | 'pending' | 'reconnecting' | 'closed';
export interface ModeInfo { mode: Mode; why?: WhyNot }

export interface Grant {
  readonly slot: number;
  /** false while the stream is down for a moment (the slot is kept), true when it is back. */
  live(ok: boolean): void;
  /** The stream is over for good: the slot is freed and nothing reopens until retry(). */
  ended(): void;
}
export interface WatchSpec {
  computer: string;
  key: string;
  kind: StreamKind;
  level: Level;
  rank?: Rank;
  open(g: Grant): { close(): void } | null;
  onMode?(m: ModeInfo): void;
  /** Called, and awaited for at most cutWaitMs, before a preempting cut closes this stream: the owner takes what it
   *  needs first (the keep-alive lease of a chat with a parked gate). */
  beforeCut?(): Promise<unknown> | void;
}
export interface Watch {
  set(level: Level, rank?: Rank): void;
  /** After ended(): ask for a stream again. */
  retry(): void;
  mode(): ModeInfo;
  release(): void;
}
export interface StreamBudget {
  watch(spec: WatchSpec): Watch;
  /** Tests: the slots this tab holds on a computer. */
  slotsInUse(computer: string): number;
  /** Tests: close everything and forget it. */
  reset(): void;
}

/** The ranks, best first (the one list: stream-mux.ts compares by it too). */
export const RANKS: readonly Rank[] = Object.freeze(['changes', 'open', 'voice', 'focused', 'dock', 'visible', 'bot']);
const LOCK = (computer: string, n: number) => `hoody-agent-stream:${computer}:${n}`;
const defaultRank = (k: StreamKind): Rank => (k === 'changes' ? 'changes' : k === 'session' ? 'visible' : k === 'bot-voice' ? 'voice' : 'bot');

interface Slot { n: number; release(): Promise<void> }
interface Rec { level: Level; rank: Rank; onMode?: (m: ModeInfo) => void; beforeCut?: () => Promise<unknown> | void; entry: Entry; gone: boolean }
interface Entry {
  id: number; computer: string; key: string; kind: StreamKind;
  open: WatchSpec['open'];
  recs: Set<Rec>;
  slot: Slot | null; handle: { close(): void } | null; gen: number; live: boolean; dead: boolean; claiming: boolean;
  mode: ModeInfo;
}
interface Comp { entries: Set<Entry>; used: Set<number>; releasing: Set<Promise<void>> }

type LocksApi = { request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => unknown) => Promise<unknown> };
function locksApi(): LocksApi | null {
  try {
    const l = hostEnv().locks as LocksApi | null;
    return l && typeof l.request === 'function' ? l : null;
  } catch { return null; }
}
/** A held lock's release, null when another holder has it, 'unsupported' when the browser would not say. */
function tryLock(locks: LocksApi, name: string): Promise<(() => Promise<void>) | null | 'unsupported'> {
  return new Promise((resolve) => {
    try {
      const p = locks.request(name, { ifAvailable: true }, (lock) => {
        if (!lock) { resolve(null); return undefined; }
        return new Promise<void>((through) => {
          resolve(() => { through(); return p.then(() => undefined, () => undefined); });
        });
      });
      p.catch(() => resolve('unsupported'));
    } catch { resolve('unsupported'); }
  });
}

const sameMode = (a: ModeInfo, b: ModeInfo) => a.mode === b.mode && a.why === b.why;

export function createStreamBudget(o: { limit?: number; reserve?: number; retryMs?: number; cutWaitMs?: number } = {}): StreamBudget {
  const limit = o.limit ?? 8, reserve = Math.min(Math.max(o.reserve ?? 1, 0), limit), retryMs = o.retryMs ?? 5000, cutWaitMs = o.cutWaitMs ?? 3000;
  const comps = new Map<string, Comp>();
  const byKey = new Map<string, Entry>();
  let seq = 0, pumping = false, dirty = false, timer: ReturnType<typeof setTimeout> | null = null, epoch = 0;

  const comp = (c: string): Comp => { let v = comps.get(c); if (!v) { v = { entries: new Set(), used: new Set(), releasing: new Set() }; comps.set(c, v); } return v; };
  const level = (e: Entry): Level => { let l: Level = 'off'; for (const r of e.recs) { if (r.level === 'stream') return 'stream'; if (r.level === 'state') l = 'state'; } return l; };
  const rank = (e: Entry): Rank => {
    let best = RANKS.length;
    for (const r of e.recs) if (r.level === 'stream') best = Math.min(best, RANKS.indexOf(r.rank));
    return RANKS[Math.min(best, RANKS.length - 1)] as Rank;
  };
  const wants = (e: Entry) => level(e) === 'stream' && !e.dead;
  const idle = (e: Entry): ModeInfo => (e.dead && level(e) === 'stream' ? { mode: 'degraded', why: 'closed' } : level(e) === 'state' ? { mode: 'state' } : level(e) === 'off' ? { mode: 'off' } : { mode: 'degraded', why: 'pending' });

  function setMode(e: Entry, m: ModeInfo) {
    if (sameMode(e.mode, m)) return;
    e.mode = m;
    for (const r of [...e.recs]) if (r.onMode) { try { r.onMode(m); } catch { /* the caller's */ } }
  }
  /** Close the stream and free its slot; resolves once the lock is really free. */
  function stop(e: Entry): Promise<void> {
    const h = e.handle, s = e.slot;
    e.handle = null; e.slot = null; e.gen++; e.live = true;
    if (h) { try { h.close(); } catch { /* done */ } }
    if (!s) return Promise.resolve();
    const c = comp(e.computer);
    const p: Promise<void> = s.release().then(() => { c.releasing.delete(p); });
    c.releasing.add(p);
    return p;
  }
  /** The owners' beforeCut hooks, waited for at most cutWaitMs, then the stop unless `still()` no longer holds (the
   *  demand that asked for the cut is gone). `still` runs whenever a hook was called, one that threw included, since
   *  what a hook did is what it checks. True when it stopped. */
  async function cut(e: Entry, still: () => boolean | Promise<boolean>): Promise<boolean> {
    const hooks: Promise<unknown>[] = [];
    let called = 0;
    if (wants(e)) for (const r of e.recs) if (r.beforeCut) { called++; try { hooks.push(Promise.resolve(r.beforeCut()).catch(() => undefined)); } catch { /* the caller's */ } }
    if (hooks.length) {
      let t: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([Promise.all(hooks), new Promise<void>((done) => { t = setTimeout(done, cutWaitMs); })]);
      if (t) clearTimeout(t);
    }
    if (called && !(await still())) { dirty = true; return false; }
    await stop(e);
    return true;
  }
  function kick() {
    if (pumping) { dirty = true; return; }
    void pump();
  }
  function schedule() {
    if (timer) return;
    const mine = epoch;
    timer = setTimeout(() => { timer = null; if (mine === epoch) kick(); }, retryMs);
  }
  async function pump() {
    pumping = true;
    try {
      do { dirty = false; await step(); } while (dirty);
    } finally { pumping = false; }
  }

  /** The lock numbers an entry tries: the feed from the last down, the others from 1 up to the one before the reserved. */
  function numbers(feed: boolean): number[] {
    const out: number[] = [];
    if (feed) for (let n = limit; n >= 1; n--) out.push(n);
    else for (let n = 1; n <= limit - reserve; n++) out.push(n);
    return out;
  }
  async function acquire(c: Comp, computer: string, feed: boolean): Promise<Slot | null> {
    const locks = locksApi();
    for (const n of numbers(feed)) {
      if (c.used.has(n)) continue;
      if (!locks) { c.used.add(n); return { n, release: async () => { c.used.delete(n); } }; }
      const got = await tryLock(locks, LOCK(computer, n));
      if (got === null) continue;
      c.used.add(n);
      if (got === 'unsupported') return { n, release: async () => { c.used.delete(n); } };
      return { n, release: async () => { await got(); c.used.delete(n); } };
    }
    return null;
  }

  const isFeed = (e: Entry) => rank(e) === 'changes';
  /** The wanted entries best first, and the ones that get a stream: at most `limit`, at most `limit - reserve` of
   *  them other than the feed. */
  function pick(c: Comp) {
    const wanted = [...c.entries].filter(wants).sort((a, b) => RANKS.indexOf(rank(a)) - RANKS.indexOf(rank(b)) || (a.slot ? 0 : 1) - (b.slot ? 0 : 1) || a.id - b.id);
    const chosen = new Set<Entry>();
    let others = 0;
    for (const e of wanted) {
      if (chosen.size >= limit) break;
      if (!isFeed(e)) { if (others >= limit - reserve) continue; others++; }
      chosen.add(e);
    }
    return { wanted, chosen };
  }
  const restore = (e: Entry) => setMode(e, wants(e) ? (e.live ? { mode: 'stream' } : { mode: 'degraded', why: 'reconnecting' }) : idle(e));
  /** This tab's stream that yields to `e` when every lock `e` may take is held: the worst rank below `e`'s, the newest of it. */
  function worst(c: Comp, e: Entry): Entry | null {
    const re = RANKS.indexOf(rank(e));
    let victim: Entry | null = null;
    for (const v of c.entries) {
      if (v === e || !v.slot || RANKS.indexOf(rank(v)) <= re) continue;
      if (!victim || RANKS.indexOf(rank(v)) > RANKS.indexOf(rank(victim)) || (rank(v) === rank(victim) && v.id > victim.id)) victim = v;
    }
    return victim;
  }
  /** Every lock `e` may take is held: cut the stream that yields and take its lock. Null when nothing yields, or when
   *  the picture changed during the owner's hook (a lock came free: it is returned taken, nothing is cut). */
  async function preempt(c: Comp, computer: string, e: Entry): Promise<Slot | null> {
    const v = worst(c, e);
    if (!v) return null;
    const free: { slot: Slot | null } = { slot: null };
    const done = await cut(v, async () => {
      if (!v.slot || worst(c, e) !== v) return false;
      free.slot = await acquire(c, computer, isFeed(e));
      if (free.slot) return false;
      return !!v.slot && worst(c, e) === v; // the retry took a while: demand or ranks may have changed again (worst() is null once e stopped wanting)
    });
    if (free.slot) return free.slot;
    if (!done) { restore(v); return null; }
    setMode(v, wants(v) ? { mode: 'degraded', why: 'budget' } : idle(v));
    await Promise.all([...c.releasing]);
    return acquire(c, computer, isFeed(e));
  }

  async function step() {
    const mine = epoch;
    let needRetry = false;
    for (const [computer, c] of [...comps]) {
      const { wanted, chosen } = pick(c);
      const freed: Promise<unknown>[] = [];
      for (const e of c.entries) {
        if (chosen.has(e)) continue;
        if (e.slot || e.handle) freed.push(cut(e, () => !pick(c).chosen.has(e)).then((done) => { if (done) setMode(e, wants(e) ? { mode: 'degraded', why: 'budget' } : idle(e)); else restore(e); }));
        else setMode(e, wants(e) ? { mode: 'degraded', why: 'budget' } : idle(e));
      }
      await Promise.all([...freed, ...c.releasing]);
      if (mine !== epoch) return;
      for (const e of wanted) {
        if (!chosen.has(e) || e.slot || e.claiming || !c.entries.has(e)) continue;
        e.claiming = true;
        let slot: Slot | null = null;
        try {
          slot = await acquire(c, computer, isFeed(e));
          if (!slot && mine === epoch && wants(e)) slot = await preempt(c, computer, e);
        } finally { e.claiming = false; }
        if (mine !== epoch) { if (slot) await slot.release(); return; }
        if (!slot) { setMode(e, { mode: 'degraded', why: 'locks' }); needRetry = true; continue; }
        if (!c.entries.has(e) || !wants(e)) { await slot.release(); dirty = true; continue; }
        await start(e, slot);
      }
    }
    if (needRetry) schedule();
  }

  async function start(e: Entry, slot: Slot) {
    e.slot = slot;
    const gen = ++e.gen;
    e.live = true;
    const grant: Grant = {
      slot: slot.n,
      live(ok) {
        if (e.gen !== gen || !e.slot) return;
        e.live = ok;
        setMode(e, ok ? { mode: 'stream' } : { mode: 'degraded', why: 'reconnecting' });
      },
      ended() {
        if (e.gen !== gen) return;
        e.dead = true;
        void stop(e).then(() => { setMode(e, idle(e)); kick(); });
        setMode(e, idle(e));
      },
    };
    let h: { close(): void } | null = null;
    try { h = e.open(grant); } catch { h = null; }
    if (e.gen !== gen) { if (h) { try { h.close(); } catch { /* done */ } } return; }
    if (!h) { e.dead = true; await stop(e); setMode(e, idle(e)); dirty = true; return; } // others may now have a slot
    e.handle = h;
    setMode(e, e.live ? { mode: 'stream' } : { mode: 'degraded', why: 'reconnecting' });
  }

  /** The mode a level change gives at once; the pump settles the rest. */
  function refresh(e: Entry) {
    if (wants(e)) { if (e.mode.mode === 'off' || e.mode.mode === 'state' || (e.mode.mode === 'degraded' && e.mode.why === 'closed')) setMode(e, idle(e)); }
    else if (!e.slot && !e.handle) setMode(e, idle(e));
  }

  function dropRec(r: Rec) {
    if (r.gone) return;
    r.gone = true;
    const e = r.entry;
    e.recs.delete(r);
    if (e.recs.size) {
      if (!wants(e)) { if (e.slot || e.handle) void stop(e); setMode(e, idle(e)); }
      kick();
      return;
    }
    comp(e.computer).entries.delete(e);
    byKey.delete(`${e.computer}\u0000${e.kind}\u0000${e.key}`);
    void stop(e);
    kick();
  }

  return {
    watch(spec) {
      const k = `${spec.computer}\u0000${spec.kind}\u0000${spec.key}`;
      let e = byKey.get(k);
      if (!e) {
        e = { id: ++seq, computer: spec.computer, key: spec.key, kind: spec.kind, open: spec.open, recs: new Set(), slot: null, handle: null, gen: 0, live: true, dead: false, claiming: false, mode: { mode: 'off' } };
        byKey.set(k, e);
        comp(spec.computer).entries.add(e);
      }
      const entry = e;
      const rec: Rec = { level: spec.level, rank: spec.rank ?? defaultRank(spec.kind), onMode: spec.onMode, beforeCut: spec.beforeCut, entry, gone: false };
      entry.recs.add(rec);
      if (entry.recs.size === 1) entry.mode = idle(entry);
      else refresh(entry);
      kick();
      return {
        set(l, r) {
          if (rec.gone) return;
          rec.level = l;
          if (r) rec.rank = r;
          refresh(entry);
          kick();
        },
        retry() {
          if (rec.gone) return;
          entry.dead = false;
          refresh(entry);
          kick();
        },
        mode: () => entry.mode,
        release: () => dropRec(rec),
      };
    },
    slotsInUse: (c) => comps.get(c)?.used.size ?? 0,
    reset() {
      epoch++;
      if (timer) clearTimeout(timer);
      timer = null;
      for (const c of comps.values()) for (const e of c.entries) { for (const r of e.recs) r.gone = true; void stop(e); }
      comps.clear();
      byKey.clear();
    },
  };
}

let shared: StreamBudget | null = null;
/** The page's one budget. */
export function streamBudget(): StreamBudget { return shared || (shared = createStreamBudget()); }
/** watch() on the page's budget. */
export function watchStream(spec: WatchSpec): Watch { return streamBudget().watch(spec); }
