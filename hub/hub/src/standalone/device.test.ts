// device.ts: the standalone Hub's browser sign-in over the API's device flow.
import { describe, expect, it } from 'vitest';
import { startDeviceSignIn, type DeviceDeps, type DeviceState } from './device';

const ORIGIN = 'https://hoody.test';
const CODE = 'c'.repeat(64);
type Reply = { status: number; body?: unknown } | 'network';

function harness(replies: Reply[], o: { origin?: string | null | (() => string | null); store?: boolean; onStore?: () => void; framed?: () => boolean } = {}) {
  const calls: Array<{ url: string; body: Record<string, unknown>; init: RequestInit }> = [];
  const stored: Array<Record<string, unknown>> = [];
  const dropped: Array<{ token: string; refreshToken: string }> = [];
  let clock = 1_000_000;
  const deps: DeviceDeps = {
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), init });
      const r = replies.shift() ?? { status: 400, body: { data: { error: 'authorization_pending' } } };
      if (r === 'network') throw new TypeError('offline');
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }) as typeof fetch,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    random: (n) => new Uint8Array(n).fill(7),
    sha256: async () => new Uint8Array(32).fill(9).buffer,
    store: (d) => { stored.push(d); o.onStore?.(); return o.store ?? true; },
    origin: () => (typeof o.origin === 'function' ? o.origin() : o.origin === undefined ? ORIGIN : o.origin),
    framed: o.framed ?? (() => false),
    dropOwn: (p) => { dropped.push({ ...p }); },
  };
  const states: DeviceState[] = [];
  const run = startDeviceSignIn((s) => states.push(s), deps);
  return { run, calls, stored, states, dropped };
}

const started = { status: 200, body: { statusCode: 200, data: { device_code: CODE, user_code: 'BCDF-GHJK', verification_uri: 'https://elsewhere.test/auth/device', interval: 5, expires_in: 900 } } };
const tokens = { status: 200, body: { statusCode: 200, data: { token: 'a.b.c', refreshToken: 'd.e.f', expires_at: 'x' } } };
const life = (error: string) => ({ status: 400, body: { statusCode: 400, data: { error } } });

describe('startDeviceSignIn', () => {
  it('starts with PKCE, shows the code with a link on the chosen Hoody, polls, stores the pair once', async () => {
    const h = harness([started, life('authorization_pending'), life('slow_down'), tokens]);
    expect(await h.run.done).toEqual({ kind: 'signed-in' });
    expect(h.calls.map((c) => c.url)).toEqual([`${ORIGIN}/api/v1/auth/device/code`, ...Array(3).fill(`${ORIGIN}/api/v1/auth/device/token`)]);
    expect(h.calls[0]?.body).toMatchObject({ client_name: expect.any(String), code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    for (const c of h.calls.slice(1)) expect(c.body).toEqual({ device_code: CODE, code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    for (const c of h.calls) expect(c.init).toMatchObject({ method: 'POST', credentials: 'omit' });
    expect(h.calls.every((c) => !new Headers(c.init.headers).has('authorization'))).toBe(true);
    expect(h.stored).toEqual([tokens.body.data]);
    // The link is built on the origin the person chose, never the one the answer names.
    expect(h.states).toContainEqual(expect.objectContaining({ kind: 'waiting', userCode: 'BCDF-GHJK', verifyUrl: `${ORIGIN}/auth/device?code=BCDF-GHJK` }));
    expect(h.states.at(-1)).toEqual({ kind: 'signed-in' });
  });

  it('ends on denied and expired, and when the code outlives its time', async () => {
    expect(await harness([started, life('access_denied')]).run.done).toEqual({ kind: 'failed', why: 'denied' });
    expect(await harness([started, life('expired_token')]).run.done).toEqual({ kind: 'failed', why: 'expired' });
    const short = { ...started, body: { data: { ...started.body.data, expires_in: 12 } } };
    expect(await harness([short]).run.done).toEqual({ kind: 'failed', why: 'expired' });
  });

  it('keeps polling through 5xx, 429 and no answer; a 200 that cannot be stored is a storage failure', async () => {
    const h = harness([started, { status: 503 }, { status: 429 }, 'network', tokens], { store: false });
    expect(await h.run.done).toEqual({ kind: 'failed', why: 'storage' });
    expect(h.calls).toHaveLength(5);
  });

  it('browser sign-in turned off, a malformed start, no answer, and no Hoody named', async () => {
    expect(await harness([{ status: 404 }]).run.done).toEqual({ kind: 'failed', why: 'off' });
    expect(await harness([{ status: 200, body: { data: { device_code: 'short', user_code: 'BCDF-GHJK' } } }]).run.done).toEqual({ kind: 'failed', why: 'refused' });
    expect(await harness(['network']).run.done).toEqual({ kind: 'failed', why: 'network' });
    const none = harness([], { origin: null });
    expect(await none.run.done).toEqual({ kind: 'failed', why: 'no-api' });
    expect(none.calls).toEqual([]);
  });

  it('stop() ends the polling and reports nothing more', async () => {
    const h = harness([started]);
    await Promise.resolve();
    h.run.stop();
    await h.run.done;
    expect(h.states.some((s) => s.kind === 'failed')).toBe(false);
    expect(h.stored).toEqual([]);
  });

  it('a 200 is stored only while this page still talks to the Hoody the flow started on', async () => {
    // Another tab chose another Hoody (or this page's Back cleared it) while a poll was out: the stored choice no
    // longer names the start origin, so the pair minted by it is never written where another Hoody's Hub reads it.
    // `sent` counts requests already answered; the third is the poll that brings the pair.
    let sent: { length: number } = [];
    const moved = harness([started, life('authorization_pending'), tokens], { origin: () => (sent.length >= 3 ? 'https://other.test' : ORIGIN) });
    sent = moved.calls;
    expect(await moved.run.done).toEqual({ kind: 'failed', why: 'no-api' });
    expect(moved.stored).toEqual([]);
    expect(moved.states.some((s) => s.kind === 'signed-in')).toBe(false);
    // Storage naming no Hoody at all (Back cleared it, or another tab is choosing) is the same.
    sent = [];
    const cleared = harness([started, tokens], { origin: () => (sent.length >= 2 ? null : ORIGIN) });
    sent = cleared.calls;
    expect(await cleared.run.done).toEqual({ kind: 'failed', why: 'no-api' });
    expect(cleared.stored).toEqual([]);
  });

  it('another Hoody named between the pre-check and the write: the pair this flow wrote is taken back, ends no-api', async () => {
    // The pre-check passes, then another tab names another Hoody while storeAccessTokens runs: the re-check after the
    // write sees it, removes only this flow's own pair (by its access token) and never reports signed-in.
    let written = false;
    const h = harness([started, tokens], { origin: () => (written ? 'https://other.test' : ORIGIN), onStore: () => { written = true; } });
    expect(await h.run.done).toEqual({ kind: 'failed', why: 'no-api' });
    expect(h.stored).toHaveLength(1);
    expect(h.dropped).toEqual([{ token: 'a.b.c', refreshToken: 'd.e.f' }]);
    expect(h.states.some((s) => s.kind === 'signed-in')).toBe(false);
  });

  it('a write that failed part way while another Hoody was named: what it wrote is taken back, storage', async () => {
    let written = false;
    const h = harness([started, tokens], { store: false, origin: () => (written ? 'https://other.test' : ORIGIN), onStore: () => { written = true; } });
    expect(await h.run.done).toEqual({ kind: 'failed', why: 'storage' });
    expect(h.dropped).toEqual([{ token: 'a.b.c', refreshToken: 'd.e.f' }]);
  });

  it('the Hoody still named after the write: nothing is taken back', async () => {
    const h = harness([started, tokens]);
    expect(await h.run.done).toEqual({ kind: 'signed-in' });
    expect(h.dropped).toEqual([]);
  });
});

describe('startDeviceSignIn in a page shown inside another page', () => {
  it('sends nothing and stores nothing: failed framed before the first request; a check that throws counts as framed', async () => {
    for (const framed of [() => true, (): boolean => { throw new Error('no shared.js'); }]) {
      const h = harness([started, tokens], { framed });
      expect(await h.run.done).toEqual({ kind: 'failed', why: 'framed' });
      expect(h.calls).toEqual([]);
      expect(h.stored).toEqual([]);
      expect(h.states).toEqual([{ kind: 'starting' }, { kind: 'failed', why: 'framed' }]);
    }
  });
});
