// The Logs live tail: the stream query, the client-side rest of the
// predicate (streamPath, matches), the stream's state machine (createLive) and the adapter that
// puts a core stream behind it (hubStream). The predicate, the read paths and the error classes
// stay in rules.ts. live.test.ts runs it against a fake stream and a manual clock.
import { LIMITS, basePairs, defaultClock, isId, isNat, kitPath, norm, outcome, problem } from './rules';
import type { Clock, Predicate, Row } from './rules';

const RETRY_DELAYS = [1000, 3000, 9000];
const IDLE_MS = 10 * 60000;
const BATCH_BYTES = 4 * 1024 * 1024;
const ENTRY_BYTES = 512 * 1024;

function utf8Len(s: string): number {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x80) n += c < 0x800 || (c >= 0xd800 && c <= 0xdfff) ? 1 : 2;
  }
  return n;
}
function parse(d: string): unknown { try { return JSON.parse(d); } catch { return null; } }
function lowerAscii(s: unknown): string { return String(s == null ? '' : s).replace(/[A-Z]/g, (c) => c.toLowerCase()); }

/** The stream query carries what the server filters (basePairs); `matches` applies the rest. */
export function streamPath(P: Predicate, afterId: number): string | null {
  const pairs = basePairs(P);
  if (!pairs) return null;
  if (afterId) pairs.push(['afterId', afterId]);
  return '/_logs/stream' + (pairs.length ? '?' + pairs.map((p) => encodeURIComponent(p[0]) + '=' + encodeURIComponent(String(p[1]))).join('&') : '');
}

/**
 * The rest of P (window, severity, search, method, Bot URL) and the source keys, applied to a live
 * row as it arrived. A truncated stub carries only id, time, kind, level, source, serviceName and
 * traceId: a test on a field it lacks cannot rule it out, so the row stays.
 */
export function matches(P: Predicate, e: Row | null | undefined): boolean {
  const pairs = basePairs(P);
  const s = P.search;
  const t = e?.tsMs;
  const cut = !!e && e.truncated === true;
  const lacks = (f: string) => cut && (e as Row)[f] === undefined;
  if (!e || !pairs || typeof t !== 'number' || t < P.sinceMs || (P.untilMs !== null && t > P.untilMs)) return false;
  for (const [n, v] of pairs) {
    if (n === 'excludeService' ? e.serviceName === v : n !== 'level' && e[n] !== v) return false;
  }
  const o = outcome(e, P.source);
  if (P.severity !== 'all' && !(o === 'failed' || (P.severity === 'problems' && o === 'problem')) && !(o === 'neutral' && lacks('status'))) return false;
  if (s && !lacks(s.kind === 'path' ? 'url' : s.kind)) {
    if (s.kind === 'path' ? lowerAscii(e.url).indexOf(lowerAscii(s.value)) === -1 : s.kind === 'status' ? e.status !== s.value : lowerAscii(e.traceId) !== s.value) return false;
  }
  return (!P.method || lacks('method') || e.method === P.method) && (!P.botUrl || lacks('data') || (!!e.data && e.data.bot_exposure === P.botUrl));
}

// ── the stream adapter ─────────────────────────────────────────────────────

export interface Frame { event?: string; id?: string | null; data?: string }
export interface Handle { close(): void }
export interface FrameSink { frame(f: Frame): void; close(err?: unknown): void }
export type OpenStream = (path: string, h: FrameSink) => Handle;

/** What a core stream call looks like to the adapter: `core.stream` bound to the logs stream route. */
export interface CoreStreamCall {
  onEvent: (name: string, data: string, id: string | undefined) => void;
  onState: (s: { state: string; [k: string]: unknown }) => void;
}
export type CoreStream = (path: string, call: CoreStreamCall) => { refused?: string; close: () => void };

/**
 * A core stream as createLive's `stream`. It never reconnects and sends no Last-Event-ID, so the
 * controller resumes through afterId. Events become frames; a gap state (an over-bound frame the
 * core dropped) becomes a gap frame; the first error or closed state ends the stream, once, on a
 * later tick, so the controller always holds the handle first. A refusal ends it the same way.
 */
export function hubStream(open: CoreStream | null): OpenStream {
  return (path, h) => {
    let done = false;
    let s: { refused?: string; close: () => void } | null = null;
    const end = (err: unknown) => {
      if (done) return;
      done = true;
      void Promise.resolve().then(() => h.close(err));
    };
    if (!open) end({ code: 'NO_SHELL', notSent: true });
    else {
      s = open(path, {
        onEvent: (name, data, id) => { if (!done) h.frame({ event: name, id, data }); },
        onState: (st) => {
          if (!st || done) return;
          if (st.state === 'gap') h.frame({ event: 'gap' });
          else if (st.state === 'error' || st.state === 'closed') end(st);
        },
      });
      if (s.refused) end({ code: s.refused, notSent: true });
    }
    return { close: () => { done = true; if (s) s.close(); } };
  };
}

// ── the controller ─────────────────────────────────────────────────────────

export type LiveEvent = 'open' | 'gap' | 'reset' | 'overflow' | 'paused' | 'private' | 'idle' | 'hidden';

export interface LiveOptions {
  P: Predicate;
  dbId?: number;
  /** A scheduled read of one kit path. */
  get(path: string): Promise<{ entries?: unknown } | null | undefined>;
  stream: OpenStream;
  rows(rows: Row[]): void;
  event(name: LiveEvent): void;
  lost?(): boolean;
  visible?(): boolean;
  clock?: Clock;
}

export interface Live {
  start(): Promise<void>;
  resume(): Promise<void>;
  touch(): void;
  stop(): void;
  readonly dbId: number;
}

/**
 * A live tail: a catch-up read (afterId = the largest id seen, limit 1000, P), then the stream from
 * there; rows are deduplicated by id (the stream ascends) and pass `norm` before `rows`. Over-bound
 * frames and `event: gap` give a gap. Every reopen (a close or error, `event: reset`, an over-bound
 * initial batch) waits 1, 3, 9 s from one budget, then pauses; only rows that move the cursor refill
 * it. A 401/403 is private. Stops on stop(), a lost ticket, a hidden page when a reopen is due, or
 * 10 min without touch(). start() and resume() are idempotent: one opening at a time, and a
 * replaced or stopped stream's callbacks are ignored.
 */
export function createLive(o: LiveOptions): Live {
  const clock = o.clock || defaultClock();
  const P = o.P;
  let dbId = isNat(o.dbId) ? o.dbId : 0;
  let s: Handle | null = null;
  let tries = 0;
  let timer: unknown = null;
  let idle: unknown = null;
  let stopped = false;
  let gen = 0;
  let opening: Promise<void> | null = null;

  const lost = () => stopped || (typeof o.lost === 'function' && o.lost() === true);

  function take(list: unknown[]) {
    const out: Row[] = [];
    const from = dbId;
    let hole = false;
    const rows = list.filter((e): e is Row => !!e && typeof e === 'object');
    rows.forEach((e) => { if (e.truncated === true && !isId(e.id)) hole = true; });
    rows.filter((e) => isId(e.id)).sort((a, b) => (a.id as number) - (b.id as number)).forEach((e) => {
      if ((e.id as number) <= dbId) return;
      dbId = e.id as number;
      if (matches(P, e)) out.push(norm(e));
    });
    if (dbId > from) tries = 0;
    if (hole) o.event('gap'); // a stub without an id cannot be placed
    if (out.length) o.rows(out);
  }

  /** Ends the current attempt: its stream closes and its pending opening and callbacks no longer count. */
  function close() {
    gen++;
    opening = null;
    if (s) { const x = s; s = null; x.close(); }
  }

  function start(): Promise<void> {
    if (lost()) return Promise.resolve();
    if (opening) return opening;
    if (s) return Promise.resolve();
    const my = ++gen;
    const path = dbId ? kitPath(P, { afterId: dbId }, LIMITS.kitMaxRows) : null;
    const up = path ? o.get(path) : Promise.resolve(null);
    const p: Promise<void> = up.then((r) => {
      if (opening === p) opening = null;
      if (lost()) return;
      const list = r && Array.isArray(r.entries) ? r.entries : [];
      const tail = list.length >= LIMITS.kitMaxRows;
      take(list);
      if (tail) { o.event('overflow'); o.event('gap'); }
      const sp = streamPath(P, tail ? 0 : dbId);
      if (sp === null) { closed({ code: 'source_invalid', notSent: true }); return; }
      s = o.stream(sp, {
        frame: (f) => { if (my === gen) frame(f); },
        close: (err) => { if (my === gen) closed(err); },
      });
      o.event('open');
    }, (err) => {
      if (opening === p) opening = null;
      closed(err);
    });
    opening = p;
    return p;
  }

  function again() {
    if (tries >= RETRY_DELAYS.length) { o.event('paused'); return; }
    timer = clock.setTimeout(() => {
      timer = null;
      if (lost()) return;
      // Said, as the idle stop is: the page then shows Live off with its note and Resume, never On over a stopped tail.
      if (typeof o.visible === 'function' && !o.visible()) { stop(); o.event('hidden'); return; }
      void start();
    }, RETRY_DELAYS[tries++] as number);
  }

  function reopen() { close(); again(); }

  function frame(f: Frame) {
    if (lost()) { stop(); return; }
    if (!f) return;
    const d = typeof f.data === 'string' ? f.data : '';
    if (f.event === 'gap') { o.event('gap'); return; }
    if (f.event === 'reset') { o.event('reset'); reopen(); return; }
    if (f.id == null || f.id === '') {
      if (d.charAt(0) !== '[') return;
      let e: unknown;
      if (utf8Len(d) > BATCH_BYTES || !Array.isArray((e = parse(d)))) { o.event('gap'); reopen(); return; }
      take(e as unknown[]);
      return;
    }
    let e: unknown;
    if (utf8Len(d) > ENTRY_BYTES || !(e = parse(d)) || typeof e !== 'object') { o.event('gap'); return; }
    take([e]);
  }

  function closed(err: unknown) {
    s = null;
    if (lost()) { stop(); return; }
    if (problem(err).code === 'private') { stop(); o.event('private'); return; }
    again();
  }

  function touch() {
    if (idle !== null) clock.clearTimeout(idle);
    idle = stopped ? null : clock.setTimeout(() => { idle = null; if (!lost()) { stop(); o.event('idle'); } }, IDLE_MS);
  }

  function stop() {
    stopped = true;
    close();
    if (timer !== null) clock.clearTimeout(timer);
    if (idle !== null) clock.clearTimeout(idle);
    timer = idle = null;
  }

  return {
    start: () => { touch(); return start(); },
    resume: () => {
      if (s || timer !== null) return Promise.resolve();
      tries = 0;
      touch();
      return start();
    },
    touch,
    stop,
    get dbId() { return dbId; },
  };
}
