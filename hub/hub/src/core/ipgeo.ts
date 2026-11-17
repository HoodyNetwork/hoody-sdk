// ipgeo.ts: the country of a visitor address, from what the platform already holds (GET /ip/lookup), cached for this tab.
//
// Contract, in plain words:
//   - An address is looked up only when geoLookupIp(raw) names it (a public IPv4, see ipv4.ts). Any other string is
//     'skip': it is never queued, never cached and never sent. The check runs before any cache access.
//   - peek(raw) is a read for rendering: 'skip', 'known' (with the two-letter country), 'unknown' (the platform holds
//     nothing, or the lookup failed) or 'pending' (not held, expired, or the reader has not yet asked version() or want()
//     for this account). It is a pure read: it queues nothing, tells nobody, reconciles nothing, hydrates nothing and
//     never moves the version, even when the account changed under it. want(raws)
//     queues the eligible ones not held, at most the cache capacity of distinct addresses per call, in order (a longer list
//     could not be held at once: each answer would evict the one before it and be asked for again, for ever; the rest
//     stay pending); one call on the wire takes at most IP_LOOKUP_MAX addresses, one call at a time
//     (an account change does not start a second one while the first is out), each address once while it is in flight.
//     want with nothing eligible touches nothing: no account read, no cache, no storage.
//   - version() + subscribe() make the cache a store for useSyncExternalStore: a reader asks version() first (it
//     reconciles the account and reads the stored cache), then peeks; a peek never moves the version.
//     Every cache change (an answer, an expiry, a purge or account change) moves the version at once and tells the
//     subscribers on the next turn, never from inside a read. One timer holds the soonest expiry: when it fires the
//     expired entries go and the subscribers hear of it (a mounted reader then asks again with want).
//   - parseLookup is the one reader of an answer. An address is positive only when the answer holds it under its own
//     canonical key, with an ip that equals it and a country of two letters. Null, no country, a malformed or
//     mismatched entry, a missing entry (a 200 that omits it) and a failed call are all negative.
//   - A positive entry lives 24 h, a negative one 10 min, and each carries its expiry; an expired entry reads as not held.
//   - A failed call (400, 429, a network or server error, a malformed body) marks its whole batch negative and holds back
//     every further call for a growing wait (30 s, doubling to 10 min; a good answer resets it). There is no retry: an
//     address is asked again only after its negative entry expires.
//   - The cache is this account's, in session storage under one registered key (hub_ip_geo_v1): at most 256 entries and
//     16 KB, the longest-held answer dropped first; entries are plain objects. A stored value is trusted only after every
//     entry is checked (a canonical eligible address, a country or null, an expiry inside its kind's lifetime); the rest
//     is dropped. Every storage read and write is guarded, and a refused write leaves the memory cache in force.
//   - The account ending (a purge) or changing empties the memory, the queue and the wait, and an answer that arrives
//     after it is dropped. Signed out, every address is 'skip'.
//   - Nothing here logs an address.
import { api } from './api';
import { partitioned } from './kit-io';
import { alive, capture } from './ctx';
import { onBeforeAuthPurge } from './session';
import { geoLookupIp, ipLookupRoute, IP_LOOKUP_MAX } from './ipv4';

export type GeoState =
  | { readonly s: 'skip' }
  | { readonly s: 'pending' }
  | { readonly s: 'unknown' }
  | { readonly s: 'known'; readonly ip: string; readonly country: string };

/** [country, or null for a negative entry] and the time it stops being true, ms. */
interface Entry { readonly c: string | null; readonly x: number }

export interface GeoDeps {
  /** The answer of one lookup of up to IP_LOOKUP_MAX canonical addresses; throws when the call fails. */
  readonly fetch: (ips: readonly string[]) => Promise<unknown>;
  /** The signed-in account, null when none. */
  readonly account: () => string | null;
  /** The account's stored cache: null when storage is unavailable. */
  readonly store: () => { get(): unknown; set(value: unknown): boolean } | null;
  readonly now?: () => number;
  /** Runs fn soon, after the caller's synchronous work (batches what one render asks for). */
  readonly defer?: (fn: () => void) => void;
  /** Runs fn after ms; returns a cancel. */
  readonly later?: (fn: () => void, ms: number) => () => void;
  /** Registers fn to run before every auth purge. */
  readonly onPurge?: (fn: () => void) => void;
  /** Smaller caps than the shipped ones (tests). */
  readonly limits?: { readonly entries?: number; readonly bytes?: number };
}

export interface IpGeo {
  peek(raw: unknown): GeoState;
  want(raws: readonly unknown[]): void;
  /** Changes with every cache change (useSyncExternalStore). */
  version(): number;
  subscribe(fn: () => void): () => void;
}

export const POSITIVE_MS = 24 * 3_600_000;
export const NEGATIVE_MS = 10 * 60_000;
export const BACKOFF_FIRST_MS = 30_000;
export const BACKOFF_MAX_MS = 10 * 60_000;
export const MAX_ENTRIES = 256;
export const MAX_BYTES = 16_384;
/** Addresses waiting for a call, at most; more are not queued (they stay pending until asked for again). */
export const MAX_QUEUE = 512;

const COUNTRY = /^[A-Za-z]{2}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

/** The one reader of a lookup answer: per requested canonical address, its country, or null when it is not a positive. */
export function parseLookup(requested: readonly string[], body: unknown): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  for (const ip of requested) {
    let country: string | null = null;
    const v = data && Object.prototype.hasOwnProperty.call(data, ip) ? data[ip] : null;
    if (isRecord(v) && typeof v.ip === 'string' && geoLookupIp(v.ip) === ip && v.ip === ip && typeof v.country === 'string' && COUNTRY.test(v.country)) {
      country = v.country.toUpperCase();
    }
    out.set(ip, country);
  }
  return out;
}

export function createIpGeo(d: GeoDeps): IpGeo {
  const now = d.now ?? (() => Date.now());
  const defer = d.defer ?? ((fn) => { queueMicrotask(fn); });
  const later = d.later ?? ((fn, ms) => { const t = setTimeout(fn, ms); return () => clearTimeout(t); });
  const maxEntries = d.limits?.entries ?? MAX_ENTRIES;
  const maxBytes = d.limits?.bytes ?? MAX_BYTES;
  const entries = new Map<string, Entry>();
  const queue = new Set<string>();
  const inflight = new Set<string>();
  const listeners = new Set<() => void>();
  let ver = 0;
  let acct: string | null = null;
  let gen = 0;
  let hydrated = false;
  let live = 0; // calls on the wire, a reset included: one call at a time is a transport rule, not a cache one
  let scheduled = false;
  let notifying = false;
  let blockedUntil = 0;
  let backoff = 0;
  let cancelWait: (() => void) | null = null;
  let cancelExpiry: (() => void) | null = null;
  let expiryAt = 0;

  /** The cache changed: the version moves now (a read in progress sees one consistent value), subscribers hear later,
   *  never from inside a read. */
  const bump = (): void => {
    ver++;
    if (notifying) return;
    notifying = true;
    defer(() => { notifying = false; for (const fn of [...listeners]) { try { fn(); } catch { /* a listener's failure is its own */ } } });
  };

  const stopExpiry = (): void => { if (cancelExpiry) { cancelExpiry(); cancelExpiry = null; } expiryAt = 0; };

  /** One timer for the soonest expiry: when it fires the expired entries go and subscribers hear of it. */
  const armExpiry = (): void => {
    let min = Infinity;
    for (const e of entries.values()) if (e.x < min) min = e.x;
    if (min === Infinity) { stopExpiry(); return; }
    if (cancelExpiry && expiryAt === min) return;
    stopExpiry();
    expiryAt = min;
    const g = gen;
    cancelExpiry = later(() => {
      cancelExpiry = null;
      expiryAt = 0;
      if (g !== gen) return;
      const at = now();
      for (const [k, e] of entries) if (e.x <= at) entries.delete(k);
      bump();
      armExpiry();
    }, Math.max(0, min - now()) + 1);
  };

  const reset = (): void => {
    entries.clear();
    queue.clear();
    inflight.clear();
    hydrated = false;
    scheduled = false;
    blockedUntil = 0;
    backoff = 0;
    if (cancelWait) { cancelWait(); cancelWait = null; }
    stopExpiry();
    gen++;
  };

  /** The signed-in account now, read and nothing else. */
  const accountNow = (): string | null => {
    try { return d.account(); } catch { return null; }
  };

  /** The signed-in account now; a different one than the last call empties everything first. */
  const current = (): string | null => {
    const a = accountNow();
    if (a !== acct) { const had = entries.size > 0 || queue.size > 0 || inflight.size > 0; acct = a; reset(); if (had) bump(); }
    return a;
  };

  const valid = (v: unknown, at: number): Entry | null => {
    if (!isRecord(v)) return null;
    const { c, x } = v;
    if (typeof x !== 'number' || !Number.isFinite(x) || x <= at) return null;
    if (c === null) return x <= at + NEGATIVE_MS ? { c: null, x } : null;
    return typeof c === 'string' && /^[A-Z]{2}$/.test(c) && x <= at + POSITIVE_MS ? { c, x } : null;
  };

  /** Drops the expired entries, then the longest-held answers (the map is in answer order) until both caps hold; returns
   *  the stored form. Not the soonest to expire: a fresh no-country answer lives 10 minutes and would be the first to go,
   *  so a full cache would drop what it had just been told and ask again, for ever. */
  const trim = (): Record<string, Entry> => {
    const at = now();
    for (const [k, e] of entries) if (e.x <= at) entries.delete(k);
    const order = [...entries.keys()];
    while (order.length > maxEntries) entries.delete(order.shift() as string);
    const doc = (): Record<string, Entry> => { const o: Record<string, Entry> = {}; for (const [k, e] of entries) o[k] = { c: e.c, x: e.x }; return o; };
    let o = doc();
    while (entries.size > 0 && JSON.stringify(o).length > maxBytes) { entries.delete(order.shift() as string); o = doc(); }
    return o;
  };

  /** Reads the stored cache once per account. Hydrating moves the version without a notice: a reader asks version()
   *  first, so it never sees the version change under it. */
  const hydrate = (): void => {
    if (hydrated) return;
    hydrated = true;
    let raw: unknown = null;
    try { raw = d.store()?.get() ?? null; } catch { raw = null; }
    if (!isRecord(raw)) return;
    const at = now();
    let seen = 0;
    for (const k of Object.keys(raw)) {
      if (++seen > maxEntries * 4) break;
      if (geoLookupIp(k) !== k) continue;
      const e = valid(raw[k], at);
      if (e) entries.set(k, e);
    }
    trim();
    if (entries.size > 0) { ver++; armExpiry(); }
  };

  const persist = (): void => {
    const o = trim();
    try { d.store()?.set(o); } catch { /* the memory cache stays in force */ }
  };

  /** A pure read: an expired entry is not held (the timer removes it). */
  const fresh = (ip: string): Entry | null => {
    const e = entries.get(ip);
    return e && e.x > now() ? e : null;
  };

  const flush = (): void => {
    scheduled = false;
    if (live > 0 || queue.size === 0) return;
    const a = current();
    if (a === null || queue.size === 0) return; // an account change emptied the queue: never a call with no address
    const wait = blockedUntil - now();
    if (wait > 0) {
      if (!cancelWait) { const g = gen; cancelWait = later(() => { cancelWait = null; if (g === gen) flush(); }, wait); }
      return;
    }
    const batch: string[] = [];
    for (const ip of queue) { if (batch.length >= IP_LOOKUP_MAX) break; batch.push(ip); }
    for (const ip of batch) { queue.delete(ip); inflight.add(ip); }
    live++;
    const g = gen;
    const settle = (answer: Map<string, string | null> | null): void => {
      live--;
      if (g !== gen || current() !== a) { schedule(); return; } // the account ended or changed: nothing of this answer is kept
      const at = now();
      for (const ip of batch) {
        inflight.delete(ip);
        const c = answer ? answer.get(ip) ?? null : null;
        entries.delete(ip); // an answer is the newest entry: the map stays in answer order
        entries.set(ip, { c, x: at + (c === null ? NEGATIVE_MS : POSITIVE_MS) });
      }
      if (answer) backoff = 0;
      else { backoff = backoff === 0 ? BACKOFF_FIRST_MS : Math.min(backoff * 2, BACKOFF_MAX_MS); blockedUntil = at + backoff; }
      persist();
      armExpiry();
      bump();
      schedule();
    };
    let p: Promise<unknown>;
    try { p = Promise.resolve(d.fetch(batch)); } catch (e) { p = Promise.reject(e); }
    p.then((body) => settle(isRecord(body) && isRecord(body.data) ? parseLookup(batch, body) : null), () => settle(null));
  };

  const schedule = (): void => { if (!scheduled && live === 0 && queue.size > 0) { scheduled = true; defer(flush); } };

  if (d.onPurge) d.onPurge(() => { const had = entries.size > 0 || queue.size > 0 || inflight.size > 0; reset(); acct = null; if (had) bump(); });

  return {
    peek(raw) {
      const ip = geoLookupIp(raw);
      if (ip === null) return { s: 'skip' };
      // A pure read: it reconciles nothing and hydrates nothing, so it can never move the version. Until version() (or
      // want()) has taken the signed-in account and read its stored cache, there is nothing to show: pending.
      const a = accountNow();
      if (a === null) return { s: 'skip' };
      if (a !== acct || !hydrated) return { s: 'pending' };
      const e = fresh(ip);
      if (!e) return { s: 'pending' };
      return e.c === null ? { s: 'unknown' } : { s: 'known', ip, country: e.c };
    },
    want(raws) {
      // At most the cache capacity of distinct eligible addresses, in order. More than the cache can hold would evict each
      // answer as the next arrives and ask for it again, for ever; the rest stay pending and are never queued.
      const ips: string[] = [];
      const seen = new Set<string>();
      for (const raw of raws) {
        const ip = geoLookupIp(raw);
        if (ip === null || seen.has(ip)) continue;
        seen.add(ip);
        ips.push(ip);
        if (ips.length >= maxEntries) break;
      }
      if (ips.length === 0) return; // nothing eligible: no account read, no cache, no storage
      if (current() === null) return;
      hydrate();
      for (const ip of ips) {
        if (fresh(ip) || inflight.has(ip) || queue.has(ip)) continue;
        if (queue.size >= MAX_QUEUE) break;
        queue.add(ip);
      }
      schedule();
    },
    version() { if (current() !== null) hydrate(); return ver; },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

/** This tab's cache: built on first use (importing it touches no storage and registers nothing). */
let shared: IpGeo | null = null;
const instance = (): IpGeo => shared ??= createIpGeo({
  fetch: (ips) => api(ipLookupRoute, { query: { ip: ips.join(',') } }),
  // The store partitions by capture().account, so the account is read from the same place, and only while that context is alive.
  account: () => { const c = capture(); return c.account && alive(c) ? String(c.account) : null; },
  store: () => { try { return partitioned('hub_ip_geo_v1', { scope: 'account', area: 'session', purge: true }); } catch { return null; } },
  onPurge: (fn) => { try { onBeforeAuthPurge(fn); } catch { /* no auth layer: the account check still empties the cache */ } },
});

export const ipGeo: IpGeo = Object.freeze({
  peek: (raw: unknown) => instance().peek(raw),
  want: (raws: readonly unknown[]) => instance().want(raws),
  version: () => instance().version(),
  subscribe: (fn: () => void) => instance().subscribe(fn),
});
