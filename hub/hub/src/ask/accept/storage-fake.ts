// A production-faithful localStorage for the journal's acceptance tests.
//
// What a real browser does that a Map-backed stub does not, and that the journal must survive:
//   - EVERY call can throw (SecurityError with site data blocked, a storage failure mid-session); a read that threw leaves the
//     stored bytes untouched. core's partitioned() swallows such a throw into "nothing stored", so one logical read of the
//     journal can be several browser reads, and ANY of them can be the one that fails (read-fault sweeps below).
//   - setItem can throw QuotaExceededError (a DOMException, code 22) when key+value units would pass the quota; the old value
//     stays. removeItem and clear never need quota.
//   - Values are strings; getItem(absent) is null; setItem(k, v) stores String(v); order is insertion order; length/key(i).
//   - Other tabs of the same origin change the same bytes at any time; this tab hears about it through an ASYNCHRONOUS
//     `storage` event (never for its own writes, never when the value did not change, key null for clear()).
//
// Usage:
//   const fs = new FakeLocalStorage(); const un = installFakeStorage(fs);       // globalThis.localStorage = fs
//   fs.failRead({ key: 'hub_ai_req_v1', nth: 2 });                              // the 2nd read of that key from now throws
//   fs.asTab('B', () => fs.setItem(k, v));                                      // another tab writes; this tab gets an event
//   fs.quota = 200;                                                             // units (key + value lengths) for the whole store
/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest';

export type Op = 'get' | 'set' | 'remove' | 'clear' | 'any';
export interface FaultRule {
  op: Op;
  /** Only this key (omit: every key). clear() matches only a rule without a key. */
  key?: string;
  /** The first `skip` matching calls succeed (default 0). */
  skip: number;
  /** Then this many matching calls fail (default 1; Infinity = until cleared). */
  times: number;
  error: unknown;
  /** How many matching calls this rule has seen / failed (tests read them). */
  seen: number;
  failed: number;
}
export interface FaultSpec { op?: Op; key?: string; skip?: number; times?: number; error?: unknown }
export interface Call { op: Exclude<Op, 'any'>; key: string | null; tab: string; threw: boolean; ok: boolean }

export function domError(name: string, message = name, code = 0): Error {
  const D = (globalThis as any).DOMException;
  if (typeof D === 'function') {
    try { const e = new D(message, name); if (code && e.code !== code) Object.defineProperty(e, 'code', { value: code }); return e; } catch { /* fall through */ }
  }
  return Object.assign(new Error(message), { name, code });
}
export const quotaError = () => domError('QuotaExceededError', 'The quota has been exceeded.', 22);
export const securityError = () => domError('SecurityError', 'The operation is insecure.', 18);

/** Fixed units of a stored entry: a key's and a value's UTF-16 length (browsers count code units; the exact factor is not
 *  the point, the shared total is). */
const units = (k: string, v: string) => k.length + v.length;

export class FakeLocalStorage {
  private data = new Map<string, string>();
  private rules: FaultRule[] = [];
  private held: StorageEventInit[] = [];
  private actor = 'A';
  /** The tab this process plays (events are delivered for every OTHER tab's writes). */
  self = 'A';
  /** Whole-store budget in units; Infinity = unlimited. */
  quota = Infinity;
  /** 'async' (default): an event is queued as a task; 'manual': held until flushEvents(). */
  eventMode: 'async' | 'manual' = 'async';
  /** Every call, in order (what a faithful reader of the journal did to the browser). */
  readonly calls: Call[] = [];
  /** Storage events dispatched to this tab (key, old, new). */
  readonly events: { key: string | null; oldValue: string | null; newValue: string | null }[] = [];
  /** All access throws SecurityError (site data blocked) while true. */
  denied = false;

  // ---- the Storage interface ----
  get length(): number { this.gate('get', null); return this.data.size; }
  key(i: number): string | null { this.gate('get', null); return [...this.data.keys()][i] ?? null; }
  getItem(key: string): string | null {
    const k = String(key);
    this.gate('get', k);
    const v = this.data.get(k);
    this.calls.push({ op: 'get', key: k, tab: this.actor, threw: false, ok: true });
    return v === undefined ? null : v;
  }
  setItem(key: string, value: string): void {
    const k = String(key), v = String(value);
    this.gate('set', k);
    const old = this.data.get(k);
    const used = this.used() - (old === undefined ? 0 : units(k, old)) + units(k, v);
    if (used > this.quota) { this.record('set', k, true); throw quotaError(); }
    this.data.set(k, v);
    this.record('set', k, false);
    if (old !== v) this.notify({ key: k, oldValue: old ?? null, newValue: v });
  }
  removeItem(key: string): void {
    const k = String(key);
    this.gate('remove', k);
    const old = this.data.get(k);
    this.data.delete(k);
    this.record('remove', k, false);
    if (old !== undefined) this.notify({ key: k, oldValue: old, newValue: null });
  }
  clear(): void {
    this.gate('clear', null);
    const had = this.data.size > 0;
    this.data.clear();
    this.record('clear', null, false);
    if (had) this.notify({ key: null, oldValue: null, newValue: null });
  }

  // ---- fidelity helpers for tests ----
  used(): number { let n = 0; for (const [k, v] of this.data) n += units(k, v); return n; }
  /** The stored string without going through a rule or a call record (what the next honest read would see). */
  peek(key: string): string | null { return this.data.get(key) ?? null; }
  /** Put bytes in as if another page (or an older build) had written them, firing no event. */
  seed(key: string, value: string): void { this.data.set(key, value); }
  snapshot(): Record<string, string> { return Object.fromEntries(this.data); }
  readsOf(key: string): number { return this.calls.filter((c) => c.op === 'get' && c.key === key).length; }

  /** Run `fn` as another tab: its writes reach this tab as storage events (and are not this tab's own writes). */
  asTab<T>(tab: string, fn: () => T): T {
    const was = this.actor;
    this.actor = tab;
    try { return fn(); } finally { this.actor = was; }
  }

  // ---- faults ----
  /** Add a fault rule. Returns the rule (its `seen` / `failed` counters are live). */
  fail(spec: FaultSpec): FaultRule {
    const r: FaultRule = { op: spec.op ?? 'any', ...(spec.key !== undefined ? { key: spec.key } : {}), skip: spec.skip ?? 0, times: spec.times ?? 1, error: spec.error ?? securityError(), seen: 0, failed: 0 };
    this.rules.push(r);
    return r;
  }
  /** The `nth` (1-based) read of `key` from now throws, once (other reads succeed). */
  failRead(o: { key: string; nth?: number; times?: number; error?: unknown }): FaultRule {
    return this.fail({ op: 'get', key: o.key, skip: (o.nth ?? 1) - 1, times: o.times ?? 1, ...(o.error !== undefined ? { error: o.error } : {}) });
  }
  /** Every read of `key` throws until clearFaults(). */
  blockReads(key: string, error?: unknown): FaultRule { return this.fail({ op: 'get', key, times: Infinity, ...(error !== undefined ? { error } : {}) }); }
  /** Every write (set/remove) of `key` throws until clearFaults(): the store refuses mutations. */
  blockWrites(key: string, error: unknown = quotaError()): FaultRule {
    this.fail({ op: 'remove', key, times: Infinity, error });
    return this.fail({ op: 'set', key, times: Infinity, error });
  }
  clearFaults(): void { this.rules = []; }

  // ---- events ----
  /** Deliver every held event now (eventMode 'manual'). */
  flushEvents(): void {
    const h = this.held;
    this.held = [];
    for (const e of h) this.dispatch(e);
  }
  pendingEvents(): number { return this.held.length; }

  // ---- internals ----
  private record(op: Exclude<Op, 'any'>, key: string | null, threw: boolean): void {
    this.calls.push({ op, key, tab: this.actor, threw, ok: !threw });
  }
  private gate(op: Exclude<Op, 'any'>, key: string | null): void {
    if (this.denied) { this.record(op, key, true); throw securityError(); }
    for (const r of this.rules) {
      if (r.op !== 'any' && r.op !== op) continue;
      if (r.key !== undefined && r.key !== key) continue;
      r.seen++;
      if (r.seen > r.skip && r.failed < r.times) { r.failed++; this.record(op, key, true); throw r.error; }
    }
  }
  private notify(e: { key: string | null; oldValue: string | null; newValue: string | null }): void {
    if (this.actor === this.self) return;                       // a tab never hears its own writes
    const init: StorageEventInit = { key: e.key, oldValue: e.oldValue, newValue: e.newValue, storageArea: this as unknown as Storage, url: 'https://hub.test/' };
    if (this.eventMode === 'manual') { this.held.push(init); return; }
    queueMicrotask(() => setTimeout(() => this.dispatch(init), 0));
  }
  private dispatch(init: StorageEventInit): void {
    this.events.push({ key: init.key ?? null, oldValue: init.oldValue ?? null, newValue: init.newValue ?? null });
    const W = (globalThis as any).StorageEvent;
    const ev = typeof W === 'function' ? new W('storage', init) : Object.assign(new Event('storage'), init);
    globalThis.dispatchEvent(ev);
  }
}

/** Make `fs` this page's localStorage (core reads globalThis.localStorage at every call). Returns the restore function. */
export function installFakeStorage(fs: FakeLocalStorage): () => void {
  vi.stubGlobal('localStorage', fs);
  return () => { vi.unstubAllGlobals(); };
}

/** Run `scenario(k)` once for each read position k = 1..max of `key` (a fresh scenario each time arms
 *  `fs.failRead({ key, nth: k })` itself and reports whether that k existed: the read counter went past k). Stops at the
 *  first k that the operation never reached. Returns the k's that were exercised. */
export async function sweepReadFaults(max: number, scenario: (k: number) => Promise<{ reached: boolean }> | { reached: boolean }): Promise<number[]> {
  const ks: number[] = [];
  for (let k = 1; k <= max; k++) {
    const r = await scenario(k);
    if (!r.reached) break;
    ks.push(k);
  }
  return ks;
}
