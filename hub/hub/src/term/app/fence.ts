// The live mount's request fence (boot.live.ts), with its late-answer rule: once the mount ends
// (trip), every call still out settles at once as stale for its consumer, and an answer that arrives after that is
// WIPED at the response boundary before it is dropped. Core's scrub only ever sees answers it receives; a dropped late
// success (a minted key, a reissued session) would otherwise sit in memory with nobody to clear it.
//   JSON answers (objects, arrays): every own key removed, depth first (bounded); strings cannot be cleared in JS, but
//     no reference to them stays reachable from the answer.
//   Responses (kit/agent fetch): the body is cancelled unread.
//   Late refusals get the same treatment (an error body may echo what was sent).
// Whichever comes first decides, exactly once: an answer that arrived before the trip goes to its consumer (core
// scrubs it there); one after the trip is wiped and never delivered.
// A call's own deadline is a trip of that call alone: `fenced(p, {deadlineMs})` settles the
// consumer with TIMEOUT at the deadline, and an answer after it is wiped the same way. boot.live.ts sets it to the
// call's timeoutMs, which is shorter than core's own bound (timeoutMs + slack, api.ts boundedCall): the fence always
// decides first, so no answer reaches a consumer that already gave up on it (core's settled timeout would drop it
// unscrubbed).
// What a wipe can and cannot do (supported shapes: JSON objects and arrays, Map, Set, every typed array (BigInt ones with
// 0n), DataView (its bytes), Response). A late answer whose wipe left something is counted (`incomplete()`), and the
// live boot reports that count as TERM_WIPE_INCOMPLETE at dispose (counts only):
//   - it removes references, it does not erase memory: strings and numbers already copied elsewhere stay until GC;
//   - a frozen or sealed container keeps its own fields (they cannot be removed), but its mutable children are wiped;
//   - a non-configurable field that is writable is set to undefined; one that is neither is counted in `kept`.
// The caller's own cancellation is part of the fence: `run(start, {signal})` joins the
// caller's signal (kit timeout, upload cancel, stream-open timeout all abort it) into the call's ended signal, so the
// client's controls abort and its wire check fails the moment the caller gives up; the consumer settles with the
// signal's reason (as native fetch does) and a later answer is wiped. `guardBody` keeps that cancellation through the
// body: a Response handed on errors its reads and cancels the client's body once the call's signal aborts.
// Late reporting is bounded: `drain(ms)` waits, at most ms, for the answers of calls already given up on; what
// it returns is final for this mount: `incomplete` wipes so far and `unresolved` calls still out at the end. An answer to
// an unresolved call that comes later is still wiped, but nobody can hear about it: the mount reports the unresolved
// count instead of promising to report every future wipe.
import type { HubErrorBase } from '../../core/session';

// The fence's monotonic clock (ms). A call's deadline is an ELAPSED time on it, taken before the client starts:
// `live()` is false from that instant on, even when the timer callback that ends the call runs late.
let clock: () => number = () => performance.now();
/** Tests only: replace the fence's clock (null: performance.now). */
export function setFenceClockForTests(now: (() => number) | null): void { clock = now ?? (() => performance.now()); }

export interface Fence {
  /** Wraps one call; with `deadlineMs` the call settles TIMEOUT at that deadline and a later answer is wiped. */
  fenced<T>(p: Promise<T>, o?: CallOpts): Promise<T>;
  /** Starts one call with its OWN ended signal: the signal is aborted, irrevocably, BEFORE the
   *  consumer is rejected (deadline, trip), so a send the client still holds (first attempt or retry) sees it at its
   *  wire check and never leaves. The caller wires it into the call's liveness and the client's signal. */
  run<T>(start: (ended: AbortSignal, live: () => boolean) => Promise<T>, o?: CallOpts): Promise<T>;
  /** Ends the mount's calls: each one still out rejects stale now; its answer, when it comes, is wiped. */
  trip(): void;
  tripped(): boolean;
  /** Late answers wiped so far (tests, diagnostics). */
  wiped(): number;
  /** Late answers whose wipe left something (`kept` fields, or larger than the bound): never zero silently. */
  incomplete(): number;
  /** Waits at most `ms` for the answers of calls already given up on (each is wiped as it comes), then reports: the
   *  incomplete wipes so far and the calls still unresolved. Call it after trip. */
  drain(ms: number): Promise<{ incomplete: number; unresolved: number }>;
  /** The fence's abort signal: aborted at trip (passed to the client so it stops its own work too). */
  readonly signal: AbortSignal;
}

const MAX_NODES = 100_000;

/** One call's options: its own deadline, and the caller's cancellation (joined into the call's ended signal). */
export interface CallOpts { deadlineMs?: number; signal?: AbortSignal | null }

const abortReason = (sig: AbortSignal): unknown => sig.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' });

/** The Response `res` with a body that ends when `signal` aborts: reads reject with the signal's
 *  reason and the client's body is cancelled, whoever holds the reader. A Response with no body passes as it is.
 *  Exceptional statuses (an opaque redirect, a 3xx, 204/205/304, a status outside 200-599): the body is
 *  never handed on. It is cancelled at once, before anyone can hold a reader, and the answer goes on with no body
 *  (rebuilt when its status allows, else the original with its stream already cancelled, which reads as empty). A
 *  body the client handed over already locked is refused (TERM_BODY_LOCKED): nobody else may hold its reader. */
export function guardBody(res: Response, signal: AbortSignal): Response {
  const src = res.body;
  if (!src) return res;
  if (src.locked) throw new Error('TERM_BODY_LOCKED: the client handed over a body someone already reads');
  const s = res.status;
  if (res.type === 'opaqueredirect' || s < 200 || s > 599 || (s >= 300 && s < 400) || s === 204 || s === 205 || s === 304) {
    void src.cancel(signal.aborted ? abortReason(signal) : undefined).catch(() => {});
    if (res.type === 'opaqueredirect' || s < 200 || s > 599) return res;
    return new Response(null, { status: s, statusText: res.statusText, headers: res.headers });
  }
  const reader = src.getReader();
  let ctl!: ReadableStreamDefaultController<Uint8Array>;
  let over = false;
  const stop = () => {
    if (over) return;
    over = true;
    const why = abortReason(signal);
    try { ctl.error(why); } catch { /* already closed */ }
    void reader.cancel(why).catch(() => {});
  };
  const body = new ReadableStream<Uint8Array>({
    start(c) { ctl = c; if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); },
    async pull(c) {
      if (over) return;
      try {
        const r = await reader.read();
        if (over) return;
        if (r.done) { over = true; signal.removeEventListener('abort', stop); c.close(); return; }
        c.enqueue(r.value);
      } catch (e) { if (!over) { over = true; signal.removeEventListener('abort', stop); c.error(e); } }
    },
    cancel(why) { over = true; signal.removeEventListener('abort', stop); return reader.cancel(why).catch(() => {}); },
  });
  return new Response(body, { status: s, statusText: res.statusText, headers: res.headers });
}

/** What a wipe left: `kept` fields it could neither remove nor overwrite (frozen/sealed containers, read-only
 *  non-configurable fields); `truncated` when the answer was larger than the bound. */
export interface WipeResult { kept: number; truncated: boolean }

/** Removes every reference a JSON-ish answer holds, depth first (frozen parents included: their mutable children are
 *  wiped); cancels a Response body. Never throws. */
export function wipeAnswer(v: unknown): WipeResult {
  const res: WipeResult = { kept: 0, truncated: false };
  if (v instanceof Response) { try { void v.body?.cancel().catch(() => {}); } catch { /* already used */ } return res; }
  if (!v || typeof v !== 'object') return res;
  const seen = new Set<object>();
  const stack: object[] = [v as object];
  let n = 0;
  const child = (c: unknown) => { if (c instanceof Response) wipeAnswer(c); else if (c && typeof c === 'object') stack.push(c as object); };
  while (stack.length) {
    if (n++ >= MAX_NODES) { res.truncated = true; break; }
    const o = stack.pop()!;
    if (seen.has(o)) continue;
    seen.add(o);
    try {
      if (o instanceof Map) { for (const [k, x] of o) { child(k); child(x); } o.clear(); continue; }
      if (o instanceof Set) { for (const x of o) child(x); o.clear(); continue; }
      // Each typed-array family takes its own zero (fill(0) throws on the BigInt arrays); DataView has no fill.
      if (ArrayBuffer.isView(o)) {
        if (o instanceof BigInt64Array || o instanceof BigUint64Array) o.fill(0n);
        else if (o instanceof DataView) new Uint8Array(o.buffer, o.byteOffset, o.byteLength).fill(0);
        else (o as unknown as { fill(x: number): void }).fill(0);
        continue;
      }
      const keys = Reflect.ownKeys(o);
      for (const k of keys) {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (d && 'value' in d) child(d.value);
      }
      if (Array.isArray(o) && !Object.isFrozen(o) && !Object.isSealed(o)) { o.length = 0; if (o.length === 0) continue; }
      for (const k of keys) {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d) continue;
        if (d.configurable && Reflect.deleteProperty(o, k)) continue;
        if ('value' in d && d.writable && Reflect.set(o, k, undefined)) continue;
        res.kept++;
      }
    } catch { res.kept++; }
  }
  return res;
}

export function createFence(): Fence {
  const ac = new AbortController();
  const waiting = new Set<() => void>();
  let wiped = 0;
  let incomplete = 0;
  // Calls given up on whose answer has not come yet (drain's unresolved), and who waits for them to come.
  let outstanding = 0;
  const drained = new Set<() => void>();
  const wipeLate = (x: unknown): void => { const r = wipeAnswer(x); wiped++; if (r.kept > 0 || r.truncated) incomplete++; };
  const lateDone = (): void => { outstanding--; if (outstanding === 0) for (const d of [...drained]) d(); };
  return {
    signal: ac.signal,
    tripped: () => ac.signal.aborted,
    wiped: () => wiped,
    incomplete: () => incomplete,
    trip() {
      if (ac.signal.aborted) return;
      ac.abort();
      for (const w of [...waiting]) w();
      waiting.clear();
    },
    fenced<T>(p: Promise<T>, o: CallOpts = {}): Promise<T> {
      return run(() => p, o);
    },
    run: <T,>(start: (ended: AbortSignal, live: () => boolean) => Promise<T>, o: CallOpts = {}): Promise<T> => run(start, o),
    drain(ms: number) {
      const report = () => ({ incomplete, unresolved: outstanding });
      if (outstanding === 0 || !(ms > 0)) return Promise.resolve(report());
      return new Promise((resolve) => {
        const fin = () => { drained.delete(fin); clearTimeout(t); resolve(report()); };
        const t = setTimeout(fin, ms);
        drained.add(fin);
      });
    },
  };
  function run<T>(start: (ended: AbortSignal, live: () => boolean) => Promise<T>, o: CallOpts = {}): Promise<T> {
      const call = new AbortController();
      const caller = o.signal ?? null;
      const ended = AbortSignal.any(caller ? [ac.signal, call.signal, caller] : [ac.signal, call.signal]);
      // The deadline is fixed BEFORE the client starts, on the monotonic clock.
      const ms = o.deadlineMs;
      const deadlineAt = typeof ms === 'number' && ms > 0 && isFinite(ms) ? clock() + ms : Infinity;
      let done = false;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let rejectOut: (e: unknown) => void = () => {};
      let resolveOut: (v: T) => void = () => {};
      const out = new Promise<T>((resolve, reject) => { rejectOut = reject; resolveOut = resolve; });
      // Ended first, then rejected: by the time the consumer hears it, no later wire check can pass.
      const giveUp = (why: unknown) => {
        if (done) return;
        done = true; call.abort(); waiting.delete(stale); clearTimeout(timer); caller?.removeEventListener('abort', onCaller);
        if (!settled) outstanding++;
        rejectOut(why);
      };
      const timedOut = () => { giveUp({ status: 0, code: 'TIMEOUT' } as HubErrorBase); };
      const stale = () => { giveUp({ status: 0, stale: true } as HubErrorBase); };
      const onCaller = () => { giveUp(abortReason(caller!)); };
      // The call's wire liveness, run at EVERY wire attempt (first send and retries): ended, or past its deadline even
      // if the timer has not run yet (then the call ends here, as the timer would).
      const live = (): boolean => {
        if (ended.aborted) return false;
        if (clock() >= deadlineAt) { timedOut(); return false; }
        return true;
      };
      if (ac.signal.aborted) stale();
      else if (caller?.aborted) onCaller();
      else {
        waiting.add(stale);
        caller?.addEventListener('abort', onCaller, { once: true });
        if (deadlineAt !== Infinity) {
          timer = setTimeout(timedOut, Math.max(0, deadlineAt - clock()));
          (timer as { unref?: () => void }).unref?.();
        }
      }
      let p: Promise<T>;
      // A caller that already gave up starts nothing (native fetch rejects the same way, with the signal's reason).
      try { p = done ? Promise.reject({ status: 0, stale: true, notSent: true }) : start(ended, live); } catch (e) { p = Promise.reject(e); }
      const own = () => { done = true; waiting.delete(stale); clearTimeout(timer); caller?.removeEventListener('abort', onCaller); };
      p.then(
        (v) => { settled = true; if (done) { wipeLate(v); lateDone(); return; } own(); resolveOut(v); },
        (e) => { settled = true; if (done) { wipeLate(e); lateDone(); return; } own(); rejectOut(e); },
      );
      return out;
  }
}
