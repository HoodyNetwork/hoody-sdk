// The app's idle signal: a frame is final only once nothing that could change it is still on its way.
//   - no query fetching (or paused) and no mutation pending in the query client (a disabled query waiting for input
//     is idle: it never fetches on its own);
//   - no page view still importing (the router's lazy views; their Suspense fallback is up while they load);
//   - no short timer (<= SHORT_TIMER_MS) set by Hub code (debounces, kit animations, fixture answer delays) and no
//     immediate (React's scheduler posts its work with setImmediate under Bun) still pending, when the ledger is on.
//     Timers no hub/src frame set (the renderer's frame loop, library housekeeping) are not the app's work.
// Then, and only then, a few still frames: React commits what the last answer started.
//
// Fixture runs (goldens, the gallery) also HOLD long fixture answers (trackTimers({ holdLong: true })): a fixture
// answer delay over SHORT_TIMER_MS (HELD_SITES) never fires until releaseHeldTimers(). A 'slow' answer or a 60 s
// "loading" answer then cannot race the frame: the frame shows the in-flight state on every host, however loaded. In that mode a query still fetching once no short timer, immediate or view import is left is HELD
// (its answer waits on a held timer or on a fixture that never answers): reported in `held`, not waited on. A live
// mount (real I/O) never holds: every fetching query counts.
// Nothing here reads React internals: a Suspense boundary of a page view is counted by the router (viewsLoading); a
// boundary waiting on a query is counted by that query.
//
// The timer ledger wraps setTimeout / setImmediate, so it must be on BEFORE react (scheduler keeps the setImmediate it
// found at import): runners call trackTimers() first thing (scripts/term/render.ts does at module load).
import fs from 'node:fs';
import type { QueryClient } from '@tanstack/react-query';
import { measurementsPending } from '../prim/measuring';

/** Timers at or under this delay are "work about to happen"; longer ones (a toast's 5 s, a poll) are not waited on. */
export const SHORT_TIMER_MS = 1000;

export interface IdleState {
  idle: boolean;
  /** Query keys fetching or paused (JSON, each cut to 120 characters). */
  queries: string[];
  mutations: number;
  views: number;
  /** Short timers pending, with the first app frame of the stack that set each (ledger on only). */
  timers: string[];
  immediates: number;
  /** Queries fetching that wait on held work only (holdLong mode): the frame shows them in flight, by design. */
  held: string[];
  /** Box sizes the engine reported and React has not drawn yet (prim/measuring.ts): the frame is a transient. */
  measuring: number;
}

type Timers = {
  setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout;
  setImmediate: typeof setImmediate; clearImmediate: typeof clearImmediate;
};

let real: Timers | null = null;
let holdLong = false;
/** The fixture answer delays: the only long timers held (a slow or "loading" fixture answer). Holding every long Hub
 *  timer stalled the live lifecycle (the crypt store's ready timeout), so the rule is the fixtures' own sleep. */
export const HELD_SITES = [/src\/app\/fixtures\.ts/, /src\/core\/transport\.ts/];
const shortTimers = new Map<unknown, string>();
const immediates = new Set<unknown>();
/** Long timers held (holdLong): token -> the call to make on release. */
const heldTimers = new Map<object, () => void>();
/** Dev checks that set timers but are not the app's work (Box's clipped-popup check runs 50 ms after each render). */
const NOT_APP_WORK = [/src\/term\/prim\/Box\.ts/];

/** Where a timer was set, when Hub code (hub/src) set it ITSELF: the caller of setTimeout is a Hub frame. Null for a
 *  timer a library set, even on the Hub's behalf (React's scheduler delaying a transition, TanStack's garbage collection,
 *  the renderer's frame loop): holding those would stall React itself, and they are not the app's own work. */
const whereFrom = (): string | null => {
  const st = new Error().stack?.split('\n').slice(1) ?? [];
  // Native frames (`new Promise (native)`: Bun elides a promise executor's own frame) are skipped.
  const caller = st.find((l) => !/term\/app\/idle\.ts/.test(l) && !/\(native[:)]/.test(l));
  if (!caller || !/\/hub\/src\//.test(caller) || NOT_APP_WORK.some((re) => re.test(caller))) return null;
  const short = (l: string): string => l.trim().replace(/^at /, '').replace(/\/[^ (]*\/hub\/src\//, 'src/').replace(/\/[^ (]*\/node_modules\//, '');
  // TERM_IDLE_DEBUG=1: the next frames too (who called the caller), for an unsettled case that names a helper.
  if (process.env.TERM_IDLE_DEBUG === '1') return st.slice(st.indexOf(caller), st.indexOf(caller) + 6).map(short).join(' < ').slice(0, 600);
  return short(caller).slice(0, 120);
};

/** Turns the timer ledger on (idempotent) and returns the real timer functions (a runner's own waits use these, so
 *  they never count as app work). */
export function trackTimers(o: { holdLong?: boolean } = {}): Timers {
  if (o.holdLong) holdLong = true;
  if (real) return real;
  const g = globalThis as unknown as Timers;
  real = { setTimeout: g.setTimeout, clearTimeout: g.clearTimeout, setImmediate: g.setImmediate, clearImmediate: g.clearImmediate };
  const r = real;
  const st = ((fn: (...a: unknown[]) => void, ms?: number, ...a: unknown[]) => {
    const delay = Number(ms) || 0;
    if (typeof fn !== 'function') return r.setTimeout(fn as never, ms, ...a);
    if (delay > SHORT_TIMER_MS) {
      const w = holdLong ? whereFrom() : null;
      if (w === null || !HELD_SITES.some((re) => re.test(w))) return r.setTimeout(fn as never, ms, ...a);
      // Held: a token that clearTimeout accepts and that answers the Timer methods callers use.
      const token = { ref() { return token; }, unref() { return token; }, hasRef() { return false; }, refresh() { return token; }, [Symbol.toPrimitive]() { return 0; } };
      heldTimers.set(token, () => { fn(...a); });
      return token as unknown as ReturnType<typeof setTimeout>;
    }
    const where = whereFrom();
    if (where === null) return r.setTimeout(fn as never, ms, ...a);
    const id: unknown = r.setTimeout(((...b: unknown[]) => { shortTimers.delete(id); fn(...b); }) as never, ms, ...a);
    shortTimers.set(id, where);
    return id;
  }) as unknown as typeof setTimeout;
  const ct = ((id: unknown) => {
    if (typeof id === 'object' && id !== null && heldTimers.delete(id)) return;
    shortTimers.delete(id); r.clearTimeout(id as never);
  }) as typeof clearTimeout;
  const si = ((fn: (...a: unknown[]) => void, ...a: unknown[]) => {
    const id: unknown = r.setImmediate(((...b: unknown[]) => { immediates.delete(id); fn(...b); }) as never, ...a);
    immediates.add(id);
    return id;
  }) as unknown as typeof setImmediate;
  const ci = ((id: unknown) => { immediates.delete(id); r.clearImmediate(id as never); }) as typeof clearImmediate;
  Object.assign(st, { __promisify__: (setTimeout as { __promisify__?: unknown }).__promisify__ });
  g.setTimeout = st; g.clearTimeout = ct; g.setImmediate = si; g.clearImmediate = ci;
  return real;
}

/** Turns the ledger off and puts the real timers back (tests; a runner keeps it on). */
export function untrackTimers(): void {
  if (!real) return;
  Object.assign(globalThis, real);
  real = null;
  holdLong = false;
  resetTimerLedger();
}

/** Whether the ledger is on and holds fixture delays (tests restore the state they found). */
export const timerLedgerState = (): { on: boolean; holdLong: boolean } => ({ on: real !== null, holdLong });

/** The real timers when the ledger is on, else the current globals. */
export const timersOf = (): Timers => real ?? (globalThis as unknown as Timers);

/** Forget pending entries (a new mount in the same process: the last one's leftovers are not this one's work). */
export function resetTimerLedger(): void { shortTimers.clear(); immediates.clear(); heldTimers.clear(); }

/** Long timers held so far (holdLong mode). */
export const heldTimerCount = (): number => heldTimers.size;

/** Fires every held long timer now (a scenario that wants the slow answer, a toast's dismissal). */
export function releaseHeldTimers(): number {
  const all = [...heldTimers.values()];
  heldTimers.clear();
  const t = timersOf();
  for (const f of all) t.setTimeout(f, 0);
  return all.length;
}

const keyText = (k: unknown): string => { try { return JSON.stringify(k).slice(0, 120); } catch { return String(k).slice(0, 120); } };

export function idleState(qc: QueryClient, views = 0): IdleState {
  const fetching = qc.getQueryCache().findAll().filter((q) => q.state.fetchStatus !== 'idle').map((q) => keyText(q.queryKey));
  const mutations = qc.isMutating();
  const timers = [...shortTimers.values()];
  const measuring = measurementsPending();
  const work = views === 0 && timers.length === 0 && immediates.size === 0 && measuring === 0;
  // Held mode: nothing short is left, so what still fetches waits on a held timer or a fixture that never answers.
  const heldNow = holdLong && work;
  const queries = heldNow ? [] : fetching;
  const held = heldNow ? fetching : [];
  const idle = work && queries.length === 0 && (mutations === 0 || heldNow);
  return { idle, queries, mutations, views, timers, immediates: immediates.size, held, measuring };
}

/** One line naming what is still under way (for an `unsettled` failure). */
export function pendingText(s: IdleState): string {
  const parts: string[] = [];
  if (s.queries.length) parts.push(`queries ${s.queries.join(', ')}`);
  if (s.mutations) parts.push(`${s.mutations} mutation(s)`);
  if (s.views) parts.push(`${s.views} page view(s) importing`);
  if (s.timers.length) parts.push(`timers ${[...new Set(s.timers)].slice(0, 4).join('; ')}`);
  if (s.immediates) parts.push(`${s.immediates} immediate(s)`);
  if (s.measuring) parts.push(`${s.measuring} box size(s) measured, not yet drawn`);
  return parts.join(' | ') || 'nothing pending (the frame kept changing)';
}

export interface WhenIdleOptions {
  queryClient: QueryClient;
  /** Page views still importing (router viewsLoading). */
  views?: () => number;
  /** Draws one frame and returns something equal when nothing changed (a captured char frame, a frame hash). */
  frame: () => Promise<string>;
  /** Still frames after idle. Default 3. */
  still?: number;
  deadlineMs?: number;
  /** Wait between frames (ms). */
  stepMs?: number;
  /** Other work under way that the app does not see (the renderer's input parser holding a lone ESC until its
   *  timeout decides it is the Escape key): a name while busy, else null. */
  busy?: () => string | null;
}

export interface WhenIdleResult { settled: boolean; frame: string; frames: number; pending: IdleState }

/** Draws until the app is idle and then `still` frames in a row came out the same; or the deadline passes
 *  (settled false, `pending` names what was still under way). Any change, or any return of work, restarts the count. */
export async function whenIdle(o: WhenIdleOptions): Promise<WhenIdleResult> {
  const t = timersOf();
  const until = performance.now() + (o.deadlineMs ?? 8000);
  const still = Math.max(1, o.still ?? 3);
  let last: string | null = null;
  let same = 0;
  let frames = 0;
  let st = idleState(o.queryClient, o.views?.() ?? 0);
  while (performance.now() < until) {
    frames++;
    const f = await o.frame();
    st = idleState(o.queryClient, o.views?.() ?? 0);
    const b = o.busy?.() ?? null;
    if (b) st = { ...st, idle: false, timers: [...st.timers, b] };
    same = st.idle && f === last ? same + 1 : 0;
    last = f;
    if (same >= still) return { settled: true, frame: f, frames, pending: st };
    await new Promise((r) => t.setTimeout(r, st.idle ? 5 : 20));
  }
  return { settled: false, frame: last ?? '', frames, pending: st };
}

export interface IdleReport { gen: number; idle: boolean; pending: string }

/**
 * For a runner in another process (termshot drives dev.ts in a pty): writes the idle state to `file` as JSON
 * ({gen, idle, pending}). `gen` goes up each time the app becomes settled: idle (idleState) AND either no terminal
 * write for `quietMs` or idle for `animateMs` while an animation keeps drawing. After `poke()` (an input or a resize)
 * it first waits for a redraw (or `noDrawMs`). A driver reads gen before an action and waits for a higher gen after
 * it. Call `wrote()` on every terminal write. Written atomically (temp file + rename).
 */
export function startIdleReporter(o: { queryClient: QueryClient; views?: () => number; file: string; quietMs?: number; animateMs?: number; noDrawMs?: number; stepMs?: number }): { wrote(): void; poke(): void; stop(): void } {
  const quiet = o.quietMs ?? 150;
  const animate = o.animateMs ?? 1000;
  let idleSince: number | null = null;
  const noDraw = o.noDrawMs ?? 3000;
  let pokedAt: number | null = null;
  let lastWrite = performance.now();
  let drawn = false;
  let gen = 0;
  let settled = false;
  let lastText = '';
  const put = (r: IdleReport): void => {
    const s = JSON.stringify(r);
    if (s === lastText) return;
    lastText = s;
    try { fs.writeFileSync(o.file + '.tmp', s); fs.renameSync(o.file + '.tmp', o.file); } catch { /* a report is best effort */ }
  };
  put({ gen, idle: false, pending: 'starting' });
  const tick = (): void => {
    const st = idleState(o.queryClient, o.views?.() ?? 0);
    // Nothing is settled before the first frame was written (boot and mount run with no query in flight). An app idle
    // for `animateMs` while still writing is settled too: what still draws is an animation (a spinner on a held
    // answer, a blinking caret), not work.
    const t = performance.now();
    if (!st.idle) idleSince = null; else idleSince ??= t;
    // After an input or a resize, wait for its redraw (a loaded host takes a while to lay out again); an action that
    // draws nothing is settled once `noDrawMs` passed.
    const answered = pokedAt === null || t - pokedAt >= noDraw;
    const now = drawn && answered && st.idle && (t - lastWrite >= quiet || t - (idleSince ?? t) >= animate);
    if (now && !settled) gen++;
    settled = now;
    put({ gen, idle: now, pending: now ? '' : !drawn ? 'starting' : st.idle ? 'drawing' : pendingText(st) });
  };
  const h = setInterval(tick, o.stepMs ?? 25);
  return {
    // A write after a quiet spell starts a new episode; writes in a steady stream (an animation) do not.
    wrote() { const t = performance.now(); if (t - lastWrite >= quiet) { settled = false; idleSince = null; } lastWrite = t; drawn = true; pokedAt = null; },
    // An input or a resize: whatever the screen did before, the next settle is a new one.
    poke() { settled = false; idleSince = null; pokedAt = performance.now(); },
    stop() { clearInterval(h); },
  };
}

/** Reads a reporter's file (null while absent or half written). */
export function readIdleReport(file: string): IdleReport | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as IdleReport; } catch { return null; }
}
