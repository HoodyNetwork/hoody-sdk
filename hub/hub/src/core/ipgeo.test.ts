// ipgeo.test.ts: the visitor-country cache (core/ipgeo.ts) and the eligibility rule it sends by (core/ipv4.ts geoLookupIp).
import { describe, expect, it } from 'vitest';
import { BACKOFF_FIRST_MS, BACKOFF_MAX_MS, MAX_BYTES, MAX_ENTRIES, NEGATIVE_MS, POSITIVE_MS, createIpGeo, parseLookup, type GeoDeps } from './ipgeo';
import { IP_LOOKUP_MAX, geoLookupIp } from './ipv4';

const HOUR = 3_600_000;

describe('geoLookupIp: the API geo rule, range by range', () => {
  it('answers the canonical dotted quad for a public address, trimmed, and collapses an IPv4-mapped IPv6', () => {
    expect(geoLookupIp('8.8.8.8')).toBe('8.8.8.8');
    expect(geoLookupIp('  8.8.8.8 ')).toBe('8.8.8.8');
    expect(geoLookupIp('::ffff:1.1.1.1')).toBe('1.1.1.1');
    expect(geoLookupIp('::FFFF:1.1.1.1')).toBe('1.1.1.1');
    expect(geoLookupIp('1.0.0.1')).toBe('1.0.0.1');
    expect(geoLookupIp('223.255.255.254')).toBe('223.255.255.254');
  });
  it('refuses every non-public range at both of its edges', () => {
    const refused = [
      '0.0.0.0', '0.255.255.255', '10.0.0.0', '10.255.255.255', '100.64.0.0', '100.127.255.255', '127.0.0.1', '127.255.255.255',
      '169.254.0.0', '169.254.255.255', '172.16.0.0', '172.31.255.255', '192.0.0.0', '192.0.0.255', '192.0.2.0', '192.0.2.255',
      '192.88.99.0', '192.88.99.255', '192.168.0.0', '192.168.255.255', '198.18.0.0', '198.19.255.255', '198.51.100.0', '198.51.100.255',
      '203.0.113.0', '203.0.113.255', '224.0.0.0', '239.255.255.255', '240.0.0.0', '255.255.255.255',
    ];
    for (const ip of refused) expect(geoLookupIp(ip), ip).toBeNull();
  });
  it('accepts the address just outside each range', () => {
    for (const ip of ['9.255.255.255', '11.0.0.0', '100.63.255.255', '100.128.0.0', '126.255.255.255', '128.0.0.0', '169.253.255.255', '169.255.0.0', '172.15.255.255', '172.32.0.0', '192.0.1.0', '192.0.3.0', '192.88.98.255', '192.88.100.0', '192.167.255.255', '192.169.0.0', '198.17.255.255', '198.20.0.0', '198.51.99.255', '198.51.101.0', '203.0.112.255', '203.0.114.0']) {
      expect(geoLookupIp(ip), ip).toBe(ip);
    }
  });
  it('refuses a CIDR, a host:port, native IPv6, malformed octets, empty and non-strings', () => {
    for (const bad of ['8.8.8.0/24', '8.8.8.8/32', '8.8.8.8:80', '2001:4860:4860::8888', '::1', '::ffff:10.0.0.1', '::ffff:8.8.8.8:80', '8.8.8', '8.8.8.8.8', '08.8.8.8', '8.8.8.08', '8.8.8.256', '8.8.8.-1', '8.8.8.x', '8.8.8.', '.8.8.8', '', '   ', '8 .8.8.8', '0x8.8.8.8', '8.8.8.8,1.1.1.1']) {
      expect(geoLookupIp(bad), JSON.stringify(bad)).toBeNull();
    }
    for (const nope of [null, undefined, 8, {}, [], ['8.8.8.8']]) expect(geoLookupIp(nope)).toBeNull();
  });
});

describe('parseLookup: one reader of an answer', () => {
  const ok = (ip: string, country: unknown = 'DE', extra: object = {}) => ({ ip, country, city: 'x', ...extra });
  it('is positive only for the requested address, under its own key, with a two-letter country', () => {
    const r = parseLookup(['1.1.1.1'], { data: { '1.1.1.1': ok('1.1.1.1', 'au') } });
    expect(r.get('1.1.1.1')).toBe('AU');
  });
  it('is negative for null, no country, a bad country, a mismatched ip, a missing entry and a non-object entry', () => {
    const req = ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4', '5.5.5.5', '6.6.6.6', '7.7.7.7', '9.9.9.9'];
    const r = parseLookup(req, {
      data: {
        '1.1.1.1': null,
        '2.2.2.2': { ip: '2.2.2.2' },
        '3.3.3.3': ok('3.3.3.3', 'DEU'),
        '4.4.4.4': ok('4.4.4.5'),
        '5.5.5.5': 'DE',
        '6.6.6.6': ok('6.6.6.6', 7),
        '7.7.7.7': ok('7.7.7.7', ''),
      },
    });
    for (const ip of req) expect(r.get(ip), ip).toBeNull();
    expect(r.size).toBe(req.length);
  });
  it('a mapped-form ip inside an entry is a mismatch (the key and the ip must both be the canonical address)', () => {
    expect(parseLookup(['1.1.1.1'], { data: { '1.1.1.1': ok('::ffff:1.1.1.1') } }).get('1.1.1.1')).toBeNull();
  });
  it('is all negative for a body that is not an object with a data object', () => {
    for (const body of [null, undefined, 'x', 7, [], { data: null }, { data: [] }, { data: 'x' }, {}]) {
      expect(parseLookup(['1.1.1.1'], body).get('1.1.1.1'), JSON.stringify(body)).toBeNull();
    }
  });
  it('reads only own properties of the answer', () => {
    const data = Object.create({ '1.1.1.1': ok('1.1.1.1') }) as Record<string, unknown>;
    expect(parseLookup(['1.1.1.1'], { data }).get('1.1.1.1')).toBeNull();
  });
});

// A harness: a clock, a deferred queue, timers, an account, a store and a fetch the test answers by hand.
function harness(over: Partial<GeoDeps> & { stored?: unknown; storeThrows?: boolean; setFails?: boolean } = {}) {
  let reads = 0;
  let t = 1_700_000_000_000;
  let account: string | null = 'u1';
  const later: Array<{ fn: () => void; at: number; live: boolean }> = [];
  const deferred: Array<() => void> = [];
  const calls: string[][] = [];
  const pending: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  const writes: unknown[] = [];
  let stored: unknown = over.stored ?? null;
  const purge: Array<() => void> = [];
  const geo = createIpGeo({
    fetch: (ips) => { calls.push([...ips]); return new Promise((resolve, reject) => { pending.push({ resolve, reject }); }); },
    account: () => account,
    store: () => {
      if (over.storeThrows) throw new Error('no storage');
      return { get: () => { reads++; return stored; }, set: (v) => { writes.push(v); if (over.setFails) return false; stored = v; return true; } };
    },
    now: () => t,
    defer: (fn) => { deferred.push(fn); },
    later: (fn, ms) => { const e = { fn, at: t + ms, live: true }; later.push(e); return () => { e.live = false; }; },
    onPurge: (fn) => { purge.push(fn); },
    ...over,
  });
  const run = (): void => { while (deferred.length) deferred.shift()!(); };
  // Drains promise turns and deferred work until nothing is left (one call settles over a few turns).
  const tick = async (): Promise<void> => { for (let i = 0; i < 8; i++) { for (let j = 0; j < 6; j++) await Promise.resolve(); run(); } };
  const answer = async (i: number, body: unknown): Promise<void> => { pending[i]!.resolve(body); await tick(); };
  const fail = async (i: number, status = 429): Promise<void> => { pending[i]!.reject(status === 0 ? new Error('network') : Object.assign(new Error('x'), { status })); await tick(); };
  const advance = async (ms: number): Promise<void> => { t += ms; for (const e of later.filter((x) => x.live && x.at <= t)) { e.live = false; e.fn(); } await tick(); };
  return { geo, calls, pending, writes, reads: () => reads, purge, later, run, tick, answer, fail, advance, now: () => t, setAccount: (a: string | null) => { account = a; }, stored: () => stored, setStored: (v: unknown) => { stored = v; } };
}
const body = (m: Record<string, string | null>) => ({ data: Object.fromEntries(Object.entries(m).map(([ip, c]) => [ip, c === null ? null : { ip, country: c }])) });

describe('ipGeo: lookups', () => {
  it('queues only eligible, not-held addresses, batches them, and reads the answer into peek', async () => {
    const h = harness();
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    h.geo.want(['8.8.8.8', '10.0.0.1', '8.8.8.8', '::ffff:1.1.1.1', 'nope', '8.8.8.0/24', null]);
    await h.tick();
    expect(h.calls).toEqual([['8.8.8.8', '1.1.1.1']]);
    expect(h.geo.peek('10.0.0.1')).toEqual({ s: 'skip' });
    await h.answer(0, body({ '8.8.8.8': 'US', '1.1.1.1': null }));
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    expect(h.geo.peek('::ffff:8.8.8.8')).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'unknown' });
    expect(h.geo.peek('10.0.0.1')).toEqual({ s: 'skip' });
  });
  it('an ineligible address never reaches the fetch, the queue or the store', async () => {
    const h = harness();
    h.geo.want(['10.0.0.1', '192.168.1.1', '127.0.0.1', '::1', '100.64.0.1', '198.18.0.1', '224.0.0.1']);
    for (const ip of ['10.0.0.1', '::1', '224.0.0.1']) expect(h.geo.peek(ip)).toEqual({ s: 'skip' });
    await h.tick();
    expect(h.calls).toEqual([]);
    expect(h.writes).toEqual([]);
    h.geo.want([]);
    expect(h.geo.peek('10.0.0.1')).toEqual({ s: 'skip' });
    expect(h.reads(), 'the stored cache is not even read for an ineligible address').toBe(0);
  });
  it('takes at most IP_LOOKUP_MAX per call, one call at a time, and asks the rest after the first answers', async () => {
    const h = harness();
    const ips = Array.from({ length: IP_LOOKUP_MAX + 5 }, (_, i) => `8.8.${Math.floor(i / 200)}.${(i % 200) + 1}`);
    h.geo.want(ips);
    await h.tick();
    expect(h.calls.length).toBe(1);
    expect(h.calls[0]!.length).toBe(IP_LOOKUP_MAX);
    h.geo.want(ips); // asking again while in flight or queued adds nothing
    await h.tick();
    expect(h.calls.length).toBe(1);
    await h.answer(0, body({}));
    expect(h.calls.length).toBe(2);
    expect(h.calls[1]!.length).toBe(5);
    expect(new Set([...h.calls[0]!, ...h.calls[1]!]).size).toBe(IP_LOOKUP_MAX + 5);
  });
  it('a held address is not asked again until its entry expires (24 h positive, 10 min negative)', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8', '1.1.1.1']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US', '1.1.1.1': null }));
    h.geo.want(['8.8.8.8', '1.1.1.1']);
    await h.tick();
    expect(h.calls.length).toBe(1);
    await h.advance(NEGATIVE_MS - 1);
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'unknown' });
    await h.advance(2);
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'pending' });
    expect(h.geo.peek('8.8.8.8').s).toBe('known');
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.calls.length).toBe(2);
    expect(h.calls[1]).toEqual(['1.1.1.1']);
    await h.advance(POSITIVE_MS);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
  });
  it('an HTTP 200 that omits or mismatches an address makes it a negative entry, not a failure', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8', '1.1.1.1', '9.9.9.9']);
    await h.tick();
    await h.answer(0, { data: { '8.8.8.8': { ip: '8.8.8.9', country: 'US' }, '1.1.1.1': { ip: '1.1.1.1' } } });
    for (const ip of ['8.8.8.8', '1.1.1.1', '9.9.9.9']) expect(h.geo.peek(ip), ip).toEqual({ s: 'unknown' });
    h.geo.want(['4.4.4.4']);
    await h.tick();
    expect(h.calls.length).toBe(2); // no back-off after a good answer
  });
  it('notifies subscribers and moves its version when an answer lands', async () => {
    const h = harness();
    let n = 0;
    const off = h.geo.subscribe(() => { n++; });
    const v0 = h.geo.version();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    expect(n).toBe(1);
    expect(h.geo.version()).toBeGreaterThan(v0);
    off();
    h.geo.want(['1.1.1.1']);
    await h.tick();
    await h.answer(1, body({ '1.1.1.1': 'AU' }));
    expect(n).toBe(1);
  });
});

describe('ipGeo: a failed call', () => {
  it('marks the whole batch negative, then waits 30 s before the next call, doubling to a cap, with no retry of the batch', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8', '1.1.1.1']);
    await h.tick();
    await h.fail(0);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'unknown' });
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'unknown' });
    h.geo.want(['4.4.4.4']);
    await h.tick();
    expect(h.calls.length).toBe(1); // held back
    await h.advance(BACKOFF_FIRST_MS - 1);
    expect(h.calls.length).toBe(1);
    await h.advance(1);
    expect(h.calls.length).toBe(2);
    expect(h.calls[1]).toEqual(['4.4.4.4']);
    await h.fail(1);
    h.geo.want(['5.5.5.5']);
    await h.advance(BACKOFF_FIRST_MS * 2 - 1);
    expect(h.calls.length).toBe(2);
    await h.advance(1);
    expect(h.calls.length).toBe(3);
    // the wait doubles each time and stops at the cap
    let wait = BACKOFF_FIRST_MS * 2;
    for (let i = 2; i < 12; i++) {
      await h.fail(i);
      wait = Math.min(wait * 2, BACKOFF_MAX_MS);
      h.geo.want([`6.6.6.${i}`]);
      await h.advance(wait - 1);
      expect(h.calls.length, `before the wait ${i}`).toBe(i + 1);
      await h.advance(1);
      expect(h.calls.length, `after the wait ${i}`).toBe(i + 2);
    }
    expect(wait).toBe(BACKOFF_MAX_MS);
  });
  it('a good answer resets the wait', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.fail(0);
    h.geo.want(['1.1.1.1']);
    await h.advance(BACKOFF_FIRST_MS);
    await h.answer(1, body({ '1.1.1.1': 'AU' }));
    h.geo.want(['2.2.2.2']);
    await h.tick();
    expect(h.calls.length).toBe(3);
    await h.fail(2);
    h.geo.want(['3.3.3.3']);
    await h.advance(BACKOFF_FIRST_MS);
    expect(h.calls.length).toBe(4);
  });
  it('a 400, a 429, a 502 and a network error each hold the next call back the same way', async () => {
    for (const status of [400, 429, 502, 0]) {
      const h = harness();
      h.geo.want(['8.8.8.8']);
      await h.tick();
      await h.fail(0, status);
      expect(h.geo.peek('8.8.8.8'), String(status)).toEqual({ s: 'unknown' });
      h.geo.want(['1.1.1.1']);
      await h.tick();
      expect(h.calls.length).toBe(1);
      await h.advance(BACKOFF_FIRST_MS);
      expect(h.calls.length, String(status)).toBe(2);
    }
  });
  it('a malformed 200 body counts as a failure', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.answer(0, 'not json');
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'unknown' });
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.calls.length).toBe(1);
  });
  it('a fetch that throws at once is a failure too', async () => {
    const h = harness({ fetch: () => { throw new Error('boom'); } });
    h.geo.want(['8.8.8.8']);
    await h.tick();
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'unknown' });
  });
});

describe('ipGeo: the account', () => {
  it('signed out, every address is skipped and nothing is asked', async () => {
    const h = harness();
    h.setAccount(null);
    h.geo.want(['8.8.8.8']);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'skip' });
    await h.tick();
    expect(h.calls).toEqual([]);
  });
  it('a different account starts empty, and an answer for the first account is dropped when it arrives', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    h.setAccount('u2');
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    expect(h.writes).toEqual([]);
  });
  it('a purge empties memory and queue, and a late answer after it is dropped', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    h.geo.want(['1.1.1.1']); // queued behind the one in flight
    h.purge[0]!();
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    await h.tick();
    expect(h.calls.length).toBe(1); // the queue went with the purge
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.calls.length).toBe(2);
  });
  it('a purge cancels the armed wait timer, and nothing fires after it', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.fail(0);
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.later.some((e) => e.live)).toBe(true);
    h.purge[0]!();
    expect(h.later.every((e) => !e.live)).toBe(true);
    await h.advance(BACKOFF_MAX_MS);
    expect(h.calls.length).toBe(1);
  });
  it('a purge clears the wait after a failure', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.fail(0);
    h.purge[0]!();
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.calls.length).toBe(2);
  });
});

describe('ipGeo: storage', () => {
  const entry = (c: string | null, x: number) => ({ c, x });
  it('keeps answers in one plain object of canonical addresses, written after each answer', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8', '1.1.1.1']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US', '1.1.1.1': null }));
    expect(h.writes.length).toBe(1);
    expect(h.stored()).toEqual({ '8.8.8.8': entry('US', h.now() + POSITIVE_MS), '1.1.1.1': entry(null, h.now() + NEGATIVE_MS) });
  });
  it('hydrates valid entries and drops every other one', () => {
    const t = 1_700_000_000_000;
    const stored = {
      '8.8.8.8': entry('US', t + HOUR),
      '1.1.1.1': entry(null, t + 60_000),
      '9.9.9.9': entry('US', t - 1), // expired
      '4.4.4.4': entry('usa', t + HOUR),
      '5.5.5.5': entry('US', t + POSITIVE_MS + 10 * HOUR), // longer than a positive lives
      '6.6.6.6': entry(null, t + HOUR), // longer than a negative lives
      '7.7.7.7': { c: 'US' },
      '2.2.2.2': 'US',
      '3.3.3.3': null,
      '10.0.0.1': entry('US', t + HOUR), // not eligible
      '::ffff:8.8.4.4': entry('US', t + HOUR), // not canonical
      'x': entry('US', t + HOUR),
      '8.8.4.4': { c: 'US', x: 'soon' },
      '8.8.4.5': { c: 'US', x: Number.POSITIVE_INFINITY },
      '8.8.4.6': [],
    };
    const h = harness({ stored });
    h.geo.version(); // the reader's first step reads the stored cache
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'unknown' });
    for (const ip of ['9.9.9.9', '4.4.4.4', '5.5.5.5', '6.6.6.6', '7.7.7.7', '2.2.2.2', '3.3.3.3', '8.8.4.4', '8.8.4.5', '8.8.4.6']) expect(h.geo.peek(ip), ip).toEqual({ s: 'pending' });
  });
  it('a stored value that is not a plain object is ignored (array, string, number, null)', () => {
    const t = 1_700_000_000_000;
    const arrayWithKey = Object.assign([], { '8.8.8.8': { c: 'US', x: t + HOUR } });
    for (const stored of [[], arrayWithKey, 'x', 7, null, true]) {
      const h = harness({ stored });
      expect(h.geo.version(), 'nothing was read from it').toBe(0);
      expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    }
  });
  it('a stored hostile or non-canonical key never becomes an entry, whatever its value', () => {
    const t = 1_700_000_000_000;
    const good = { c: 'US', x: t + HOUR };
    const stored = JSON.parse(JSON.stringify({ '8.8.8.8': good, '__proto__': good, 'constructor': good, '10.0.0.1': good, '::ffff:8.8.4.4': good, '8.8.4.4/32': good, ' 8.8.4.5': good, 'x': good })) as unknown;
    Object.defineProperty(stored, '__proto__', { value: good, enumerable: true });
    const h = harness({ stored });
    h.geo.version();
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    for (const k of ['10.0.0.1', '8.8.4.4', '8.8.4.5']) expect(h.geo.peek(k), k).toEqual({ s: k === '10.0.0.1' ? 'skip' : 'pending' });
    h.geo.want(['8.8.8.8']);
    expect(({} as Record<string, unknown>).c).toBeUndefined();
    expect(h.writes).toEqual([]);
  });
  it('keeps at most 256 entries, the longest-held answer dropped first', async () => {
    const h = harness();
    const ips = Array.from({ length: MAX_ENTRIES + 20 }, (_, i) => `8.${Math.floor(i / 250)}.${i % 250}.9`);
    for (let i = 0; i < ips.length; i += IP_LOOKUP_MAX) {
      h.geo.want(ips.slice(i, i + IP_LOOKUP_MAX));
      await h.tick();
      await h.answer(h.pending.length - 1, body(Object.fromEntries(ips.slice(i, i + IP_LOOKUP_MAX).map((ip) => [ip, 'US']))));
      await h.advance(1000); // later answers expire later
    }
    const stored = h.stored() as Record<string, unknown>;
    expect(Object.keys(stored).length).toBe(MAX_ENTRIES);
    expect(JSON.stringify(stored).length).toBeLessThanOrEqual(MAX_BYTES);
    expect(stored[ips[0]!]).toBeUndefined();
    expect(stored[ips[ips.length - 1]!]).toBeDefined();
    expect(h.geo.peek(ips[0]!)).toEqual({ s: 'pending' });
    expect(h.geo.peek(ips[ips.length - 1]!).s).toBe('known');
  });
  it('drops by size too: with a small byte cap the stored text stays under it, longest-held first', async () => {
    const h = harness({ limits: { bytes: 300 } });
    const ips = Array.from({ length: 12 }, (_, i) => `8.8.8.${i + 1}`);
    for (let i = 0; i < ips.length; i += 4) {
      h.geo.want(ips.slice(i, i + 4));
      await h.tick();
      await h.answer(h.pending.length - 1, body(Object.fromEntries(ips.slice(i, i + 4).map((ip) => [ip, 'US']))));
      await h.advance(1000);
    }
    const text = JSON.stringify(h.stored());
    expect(text.length).toBeLessThanOrEqual(300);
    expect(Object.keys(h.stored() as object).length).toBeGreaterThan(0);
    expect(h.geo.peek(ips[0]!)).toEqual({ s: 'pending' });
    expect(h.geo.peek(ips[11]!).s).toBe('known');
  });
  it('with the shipped caps 256 compact entries fit well inside the byte cap', async () => {
    const h = harness();
    const ips = Array.from({ length: MAX_ENTRIES }, (_, i) => `223.${200 + (i % 50)}.${100 + Math.floor(i / 50)}.${200 + (i % 55)}`);
    for (let i = 0; i < ips.length; i += IP_LOOKUP_MAX) {
      h.geo.want(ips.slice(i, i + IP_LOOKUP_MAX));
      await h.tick();
      await h.answer(h.pending.length - 1, body(Object.fromEntries(ips.slice(i, i + IP_LOOKUP_MAX).map((ip) => [ip, 'US']))));
    }
    expect(Object.keys(h.stored() as object).length).toBe(MAX_ENTRIES);
    expect(JSON.stringify(h.stored()).length).toBeLessThan(MAX_BYTES);
  });
  it('a store that throws, or refuses the write, leaves the memory cache working', async () => {
    for (const o of [{ storeThrows: true }, { setFails: true }]) {
      const h = harness(o);
      h.geo.want(['8.8.8.8']);
      await h.tick();
      await h.answer(0, body({ '8.8.8.8': 'US' }));
      expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'known', ip: '8.8.8.8', country: 'US' });
    }
  });
  it('a store whose read throws is read as empty', () => {
    const h = harness({ store: () => ({ get: () => { throw new Error('x'); }, set: () => true }) });
    expect(h.geo.version()).toBe(0); // the read happens here, and its throw is swallowed
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    h.geo.want(['8.8.8.8']);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' }); // a throwing store does not stop the cache from working
  });
  it('a different account reads its own stored cache, not the first one’s memory', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    h.setAccount('u2');
    h.setStored(null);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
  });
});

describe('ipGeo: races and notices', () => {
  it('an account change between want and the deferred flush sends nothing, and the new account is not held back', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    h.setAccount('u2');
    await h.tick();
    expect(h.calls, 'no call, above all no call with no address').toEqual([]);
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.calls).toEqual([['1.1.1.1']]);
  });
  it('an account change first seen when the old answer arrives drops that answer and writes nothing', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    h.setAccount('u2'); // nobody has read the cache since
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    expect(h.writes).toEqual([]);
    h.setStored(null);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
  });
  it('a failure of the old account’s call does not hold back the new account', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    h.setAccount('u2');
    h.setStored(null);
    h.geo.want(['1.1.1.1']);
    await h.fail(0);
    expect(h.calls.length).toBe(2); // the old call ended, the new account's call goes at once
  });
  it('a reset does not start a second call while the first is still on the wire', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    h.purge[0]!();
    h.geo.want(['1.1.1.1']);
    await h.tick();
    expect(h.calls.length).toBe(1);
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    expect(h.calls).toEqual([['8.8.8.8'], ['1.1.1.1']]);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' }); // the first answer was the old account's
    await h.answer(1, body({ '1.1.1.1': 'AU' }));
    expect(h.geo.peek('1.1.1.1').s).toBe('known');
    // repeated resets never stack calls
    for (let i = 0; i < 3; i++) { h.purge[0]!(); h.geo.want([`4.4.4.${i + 1}`]); await h.tick(); }
    expect(h.calls.length).toBe(3);
  });
  it('peek is a pure read: an account that changed under it moves nothing and tells nobody, and shows the old account no answer', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    await h.tick();
    let heard = 0;
    h.geo.subscribe(() => { heard++; });
    const v = h.geo.version();
    h.setAccount('u2');
    h.setStored(null);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' }); // the first account's answer is not shown to the second
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'pending' });
    await h.tick();
    expect(heard, 'a read tells nobody').toBe(0);
    expect(h.geo.version(), 'the change is counted when the reader asks version()').toBeGreaterThan(v);
    await h.tick();
    expect(heard).toBe(1);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
  });
  it('an account change that a flush reconciled leaves the new account unread: peek stays pending and moves nothing until version()', async () => {
    const t = 1_700_000_000_000;
    const h = harness();
    h.geo.want(['8.8.8.8']);
    h.setAccount('u2');
    h.setStored({ '1.1.1.1': { c: 'US', x: t + HOUR } });
    await h.tick(); // the deferred flush takes the new account and empties the old queue
    let heard = 0;
    h.geo.subscribe(() => { heard++; });
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'pending' });
    await h.tick();
    expect(heard).toBe(0);
    h.geo.version();
    expect(h.geo.peek('1.1.1.1').s).toBe('known');
  });
  it('peek signed out is skip, and reads nothing else', () => {
    const h = harness();
    h.setAccount(null);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'skip' });
    expect(h.reads()).toBe(0);
  });
  it('peek before version() or want() has not read the stored cache: it reads pending, moves nothing, and touches no storage', async () => {
    const t = 1_700_000_000_000;
    const h = harness({ stored: { '8.8.8.8': { c: 'US', x: t + HOUR } } });
    let heard = 0;
    h.geo.subscribe(() => { heard++; });
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    await h.tick();
    expect(h.reads()).toBe(0);
    expect(heard).toBe(0);
    const v = h.geo.version(); // the reader's first step reads the stored cache
    expect(h.geo.peek('8.8.8.8').s).toBe('known');
    expect(h.geo.version()).toBe(v);
  });
  it('version() has already reconciled and hydrated, so peeks after it never move it', () => {
    const t = 1_700_000_000_000;
    const h = harness({ stored: { '8.8.8.8': { c: 'US', x: t + HOUR } } });
    const v = h.geo.version();
    expect(h.geo.peek('8.8.8.8').s).toBe('known');
    expect(h.geo.peek('1.1.1.1').s).toBe('pending');
    expect(h.geo.version()).toBe(v);
    expect(v).toBeGreaterThan(0); // hydrating counted as a change
  });
  it('an entry expiring while mounted tells the subscribers and moves the version, then reads as not held', async () => {
    const h = harness();
    h.geo.want(['8.8.8.8', '1.1.1.1']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US', '1.1.1.1': null }));
    let heard = 0;
    h.geo.subscribe(() => { heard++; });
    const v = h.geo.version();
    await h.advance(NEGATIVE_MS + 5);
    expect(heard).toBe(1);
    expect(h.geo.version()).toBeGreaterThan(v);
    expect(h.geo.peek('1.1.1.1')).toEqual({ s: 'pending' });
    expect(h.geo.peek('8.8.8.8').s).toBe('known');
    await h.advance(POSITIVE_MS);
    expect(heard).toBe(2);
    expect(h.geo.peek('8.8.8.8')).toEqual({ s: 'pending' });
    expect(h.later.every((e) => !e.live)).toBe(true); // nothing left to wait for
  });
  it('queues at most 512 addresses across calls and asks for exactly those', async () => {
    const h = harness();
    const block = (b: number) => Array.from({ length: MAX_ENTRIES }, (_, i) => `8.${b}.${i % 250}.${1 + Math.floor(i / 250)}`);
    h.geo.want(block(1));
    h.geo.want(block(2));
    h.geo.want(block(3));
    await h.tick();
    let asked = 0;
    for (let i = 0; i < 40 && h.pending.length > i; i++) { asked += h.calls[i]!.length; await h.answer(i, body({})); }
    expect(asked).toBe(512);
  });
  it('one want() takes at most the cache capacity of distinct eligible addresses, in order; the rest are never queued', async () => {
    const h = harness();
    const ips = Array.from({ length: 400 }, (_, i) => `8.${Math.floor(i / 250)}.${i % 250}.9`);
    h.geo.want(['10.0.0.1', ...ips.slice(0, 5), ...ips]); // an ineligible address and repeats take no place
    await h.tick();
    const asked: string[] = [];
    for (let i = 0; i < 40 && h.pending.length > i; i++) { asked.push(...h.calls[i]!); await h.answer(i, body(Object.fromEntries(h.calls[i]!.map((ip) => [ip, 'US'])))); }
    expect(asked).toEqual(ips.slice(0, MAX_ENTRIES));
    expect(h.geo.peek(ips[MAX_ENTRIES]!)).toEqual({ s: 'pending' });
    expect(h.geo.peek(ips[MAX_ENTRIES - 1]!).s).toBe('known');
  });
  it('asking again for the same long list settles: nothing is asked and the version stands still', async () => {
    const h = harness();
    const ips = Array.from({ length: 400 }, (_, i) => `8.${Math.floor(i / 250)}.${i % 250}.9`);
    h.geo.want(ips);
    await h.tick();
    for (let i = 0; i < 40 && h.pending.length > i; i++) await h.answer(i, body(Object.fromEntries(h.calls[i]!.map((ip, n) => [ip, n % 3 === 2 ? null : 'US']))));
    const v = h.geo.version();
    const n = h.calls.length;
    h.geo.want(ips);
    await h.tick();
    expect(h.calls.length).toBe(n);
    expect(h.geo.version()).toBe(v);
  });
  it('a full cache drops the longest-held answers, never the newest: a fresh no-country answer (10 min) stays', async () => {
    const h = harness({ limits: { entries: 4 } });
    const old = ['8.8.8.1', '8.8.8.2', '8.8.8.3', '8.8.8.4'];
    h.geo.want(old);
    await h.tick();
    await h.answer(0, body(Object.fromEntries(old.map((ip) => [ip, 'US']))));
    await h.advance(1000);
    h.geo.want(['9.9.9.1', '9.9.9.2']);
    await h.tick();
    await h.answer(1, body({ '9.9.9.1': null, '9.9.9.2': null }));
    expect(h.geo.peek('9.9.9.1')).toEqual({ s: 'unknown' });
    expect(h.geo.peek('9.9.9.2')).toEqual({ s: 'unknown' });
    expect(h.geo.peek('8.8.8.1')).toEqual({ s: 'pending' });
    expect(h.geo.peek('8.8.8.2')).toEqual({ s: 'pending' });
    expect(h.geo.peek('8.8.8.3').s).toBe('known');
    expect(h.geo.peek('8.8.8.4').s).toBe('known');
    expect(Object.keys(h.stored() as object).length).toBe(4);
  });
  it('an entry that expired but is still in the map, asked again, is as new as any other answer', async () => {
    const h = harness({ limits: { entries: 3 }, later: () => () => {} }); // no expiry timer: the expired entry stays in the map
    h.geo.want(['8.8.8.1', '8.8.8.2', '8.8.8.3']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.1': null, '8.8.8.2': 'US', '8.8.8.3': 'US' }));
    await h.advance(11 * 60_000); // the first, a no-country answer, has run out
    expect(h.geo.peek('8.8.8.1')).toEqual({ s: 'pending' });
    h.geo.want(['8.8.8.1']);
    await h.tick();
    await h.answer(1, body({ '8.8.8.1': 'DE' }));
    h.geo.want(['8.8.8.4']);
    await h.tick();
    await h.answer(2, body({ '8.8.8.4': 'FR' }));
    expect(h.geo.peek('8.8.8.1').s).toBe('known');
    expect(h.geo.peek('8.8.8.2')).toEqual({ s: 'pending' });
  });
  it('a throwing subscriber does not stop the others', async () => {
    const h = harness();
    let ok = 0;
    h.geo.subscribe(() => { throw new Error('mine'); });
    h.geo.subscribe(() => { ok++; });
    h.geo.want(['8.8.8.8']);
    await h.tick();
    await h.answer(0, body({ '8.8.8.8': 'US' }));
    expect(ok).toBe(1);
  });
});
