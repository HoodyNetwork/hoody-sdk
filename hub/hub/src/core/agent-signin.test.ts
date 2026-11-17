// agent-signin.test.ts: the core side. One sign-in sends one bootstrap with the key, then proves it by the
// agent's status; an unknown answer is never shown as done or failed (C9); the key never leaves the request.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOtpPrompt } from './api';
import { agentLoginOf, agentSignInRoutes, checkAgentLogin, noteAgentStatus, PROOF_TRIES, resetAgentSignIn, signInAgent, signInOffered, signInUnsure, subscribeSignInUnsure, UNSURE_HOLD_MS, watchComputer } from './agent-signin';
import { PRESS_WAIT_MS, resetBootToken } from './boot-token';
import { bump, capture, setIdentity, setTarget, type Target } from './ctx';
import producerSource from '../../../public/auth/hub-boot-token.js?raw';
import { AGENT, boot, calls, deferred, loadShared, onFetch, OTHER, settle, TARGET, UID, type Call, type Reply } from './test/env';
// The computers.* leaves a stale-rev cached token must still hold for the Hub to reuse it (hub-boot-token.js NEEDED_LEAVES): what the
// server's token answer carries for a bearer whose tree was migrated.
const NEEDED_TREE = { computers: { read: true, create: true, update: true, delete: true, actions: { start: true, stop: true, restart: true, exec: true, logs: true } } };

type G = { HubBootToken?: unknown };
const KEY = 'hdy_' + 'k'.repeat(40);
const READY = { auth_active: true, account_id: UID, owner_fingerprint: 'fp1', restriction: 'none' };
const OUT = { auth_active: false };
const BOOT = `${AGENT}/hoody/auth/bootstrap`;
const STATUS = `${AGENT}/hoody/auth/status`;
const isBoot = (c: Call) => c.url.startsWith(BOOT);
const isStatus = (c: Call) => c.url.startsWith(STATUS);
const agentCalls = () => calls.filter((c) => isBoot(c) || isStatus(c)).map((c) => (isBoot(c) ? 'boot' : 'status'));

const B: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv1' } };
type Mint = (m: string, p: string, b: unknown, o: { owner: string }) => Promise<unknown>;
function producer(ensure: (uid: string, o?: { mint?: Mint }) => Promise<unknown> = async () => ({ token: KEY, state: 'ok' })): void {
  (globalThis as G).HubBootToken = { ensure };
}
function agent(boot: () => Reply, statuses: unknown[]): void {
  let n = 0;
  onFetch((c) => {
    if (isBoot(c)) return boot();
    if (isStatus(c)) { const b = statuses[Math.min(n++, statuses.length - 1)]; return b === 'lost' ? { status: 0, network: true } : { status: 200, body: b }; }
    return { status: 200, body: { data: {} } };
  });
}
const noKey = (x: unknown) => expect(JSON.stringify(x ?? null)).not.toContain(KEY);

beforeEach(() => { resetAgentSignIn(5); });
afterEach(() => { delete (globalThis as G).HubBootToken; resetBootToken(); resetAgentSignIn(); setOtpPrompt(null); });

describe('agentLoginOf: one projection of the agent status', () => {
  it('ready only when signed in as this account with identity and restriction known', () => {
    expect(agentLoginOf(READY, UID)).toBe('ready');
    expect(agentLoginOf({ ...READY, restriction: 'realms' }, UID)).toBe('ready');
    expect(agentLoginOf(OUT, UID)).toBe('login');
    expect(agentLoginOf({ ...READY, last_error: { credential_rejected: true } }, UID)).toBe('login');
    expect(agentLoginOf({ ...READY, account_id: OTHER }, UID)).toBe('account');
    expect(agentLoginOf({ ...READY, owner_fingerprint: '' }, UID)).toBe('identity');
    expect(agentLoginOf({ ...READY, identity_unavailable: true }, UID)).toBe('identity');
    expect(agentLoginOf({ ...READY, restriction: 'unknown' }, UID)).toBe('identity');
    expect(agentLoginOf(null, UID)).toBe('identity');
    expect(agentLoginOf(READY, '')).toBe('identity');
  });
});

describe('signInAgent', () => {
  it('one press: one bootstrap carrying the key, then the status read proves it; the key is in no result', async () => {
    boot(); producer(); agent(() => ({ status: 201, body: { outcome: 'installed' } }), [READY]);
    const r = await signInAgent(capture(), TARGET);
    expect(r).toEqual({ kind: 'signedIn' });
    expect(agentCalls()).toEqual(['boot', 'status']);
    expect(calls.find(isBoot)!.body).toEqual({ token: KEY });
    expect(calls.find(isBoot)!.url).not.toContain(KEY);
    noKey(r);
  });
  it('a fresh install that has no identity yet is read again; ready on a later read proves it', async () => {
    boot(); producer(); agent(() => ({ status: 201, body: {} }), [{ ...READY, identity_unavailable: true }, READY]);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'signedIn' });
    expect(agentCalls()).toEqual(['boot', 'status', 'status']);
  });
  it('a 2xx the status never confirms is unknown, never signed in', async () => {
    boot(); producer(); agent(() => ({ status: 200, body: {} }), [OUT]);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(agentCalls().filter((x) => x === 'status').length).toBe(PROOF_TRIES);
  });
  it('a lost answer: the status decides; still signed out after every read is unknown, never failed', async () => {
    boot(); producer(); agent(() => ({ status: 0, network: true }), [OUT]);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    boot(); resetAgentSignIn(5); producer(); agent(() => ({ status: 0, network: true }), [OUT, READY]);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'signedIn' });
  });
  it('409 bootstrap_in_progress and a 5xx are under way: status reads, unknown when unproven', async () => {
    for (const reply of [{ status: 409, body: { code: 'bootstrap_in_progress', message: 'a bootstrap install is already in progress' } }, { status: 409, body: { error: 'bootstrap_in_progress' } }, { status: 502, body: { error: 'commit_failed' } }, { status: 503, body: { error: 'platform_starting' } }]) {
      boot(); resetAgentSignIn(5); producer(); agent(() => reply, [OUT]);
      const r = await signInAgent(capture(), TARGET);
      expect(r, JSON.stringify(reply)).toEqual({ kind: 'unknown' });
      expect(agentCalls()[0]).toBe('boot');
      expect(agentCalls().length).toBe(1 + PROOF_TRIES);
    }
  });
  it('status reads that never answer leave it unknown', async () => {
    boot(); producer(); agent(() => ({ status: 0, network: true }), ['lost']);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
  });
  it('a definite refusal maps to its reason and reads nothing', async () => {
    const cases: [Reply, unknown][] = [
      [{ status: 404, body: { error: 'not_found' } }, { kind: 'refused', reason: 'disabled' }],
      [{ status: 403, body: { code: 'login_not_for_this_box', message: 'the token cannot see this box' } }, { kind: 'refused', reason: 'notThisBox' }],
      [{ status: 409, body: { error: 'credential_present' } }, { kind: 'refused', reason: 'computerLogin' }],
      [{ status: 409, body: { error: 'agent_login_conflict' } }, { kind: 'notAllowed', reason: 'otherAccount' }],
      [{ status: 403, body: { error: 'admin_login_refused' } }, { kind: 'notAllowed', reason: 'admin' }],
      [{ status: 401, body: { error: 'token_rejected' } }, { kind: 'refused', reason: 'key' }],
      [{ status: 403, body: { error: 'login_grant_insufficient' } }, { kind: 'refused', reason: 'key' }],
      [{ status: 400, body: { error: 'bad_request' } }, { kind: 'refused', reason: 'refused' }],
    ];
    for (const [reply, want] of cases) {
      boot(); resetAgentSignIn(5); producer(); agent(() => reply, [READY]);
      const r = await signInAgent(capture(), TARGET);
      expect(r, JSON.stringify(reply)).toEqual(want);
      expect(agentCalls()).toEqual(['boot']);
    }
  });
  it('a status read showing another account says so (a fact the read shows)', async () => {
    boot(); producer(); agent(() => ({ status: 0, network: true }), [{ ...READY, account_id: OTHER }]);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'notAllowed', reason: 'otherAccount' });
  });
  it('no key: nothing is sent to the agent (failed key, cancelled 2FA prompt)', async () => {
    boot(); producer(async () => { throw { token: '', state: 'failed', message: KEY }; }); agent(() => ({ status: 201 }), [READY]);
    const r = await signInAgent(capture(), TARGET);
    expect(r).toEqual({ kind: 'refused', reason: 'key' });
    noKey(r);
    expect(agentCalls()).toEqual([]);
  });
  it('a key the producer skips (a shared-access session) is not allowed and sends nothing', async () => {
    boot(); producer(async () => ({ token: '', state: 'skipped' })); agent(() => ({ status: 201 }), [READY]);
    const r = await signInAgent(capture(), TARGET);
    expect(r).toEqual({ kind: 'notAllowed', reason: 'shared' });
    expect(agentCalls()).toEqual([]);
  });
  it('a second press while one runs shares it: one bootstrap', async () => {
    boot(); producer();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let n = 0;
    onFetch(async (c) => {
      if (isBoot(c)) { await gate; return { status: 201, body: {} }; }
      if (isStatus(c)) { n++; return { status: 200, body: READY }; }
      return { status: 200, body: {} };
    });
    const a = signInAgent(capture(), TARGET);
    const b = signInAgent(capture(), TARGET);
    expect(b).toBe(a);
    release();
    expect(await a).toEqual({ kind: 'signedIn' });
    expect(calls.filter(isBoot).length).toBe(1);
    expect(n).toBe(1);
  });
  it('the account changes mid-flight: stale, and no status read is sent after', async () => {
    boot(); producer();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    onFetch(async (c) => {
      if (isBoot(c)) { await gate; return { status: 201, body: {} }; }
      return { status: 200, body: READY };
    });
    const p = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some(isBoot); i++) await new Promise((r) => setTimeout(r, 0));
    setIdentity({ id: OTHER, banned: false });
    release();
    expect(await p).toEqual({ kind: 'stale' });
    expect(calls.filter(isStatus).length).toBe(0);
  });
});

describe('another computer shown (computer.ts changes the target without a new generation)', () => {
  it('while the key is made: stale, nothing sent to either agent', async () => {
    boot();
    const d = deferred();
    producer(async () => { await d.p; return { token: KEY, state: 'ok' }; });
    agent(() => ({ status: 201 }), [READY]);
    const p = signInAgent(capture(), TARGET);
    await settle();
    setTarget(B);
    d.res();
    expect(await p).toEqual({ kind: 'stale' });
    expect(agentCalls()).toEqual([]);
    expect(calls.some((c) => c.url.includes('/hoody/auth/'))).toBe(false);
  });
  it('while the bootstrap is out: stale, no status read', async () => {
    boot(); producer();
    const d = deferred();
    onFetch(async (c) => {
      if (isBoot(c)) { await d.p; return { status: 201, body: {} }; }
      return { status: 200, body: READY };
    });
    const p = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some(isBoot); i++) await settle(1);
    setTarget(B);
    d.res();
    expect(await p).toEqual({ kind: 'stale' });
    expect(calls.filter(isStatus).length).toBe(0);
  });
  it('during a proof read: stale, no further read', async () => {
    boot(); producer();
    onFetch((c) => {
      if (isBoot(c)) return { status: 0, network: true };
      if (isStatus(c)) { setTarget(B); return { status: 200, body: READY }; }
      return { status: 200, body: {} };
    });
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'stale' });
    expect(calls.filter(isStatus).length).toBe(1);
  });
  it('Check again for a computer no longer shown: stale, nothing read', async () => {
    boot(); agent(() => ({ status: 201 }), [READY]);
    const ctx = capture();
    setTarget(B);
    expect(await checkAgentLogin(ctx, TARGET)).toBe('stale');
    expect(agentCalls()).toEqual([]);
  });
});

describe('another computer shown at any moment, then the first again: still stale (no revival)', () => {
  const away = () => { setTarget(B); setTarget(TARGET); };
  it('while the key is made', async () => {
    boot();
    const d = deferred();
    producer(async () => { await d.p; return { token: KEY, state: 'ok' }; });
    agent(() => ({ status: 201 }), [READY]);
    const p = signInAgent(capture(), TARGET);
    await settle();
    away();
    d.res();
    expect(await p).toEqual({ kind: 'stale' });
    expect(agentCalls()).toEqual([]);
  });
  it('while the bootstrap is out', async () => {
    boot(); producer();
    const d = deferred();
    onFetch(async (c) => {
      if (isBoot(c)) { await d.p; return { status: 201, body: {} }; }
      return { status: 200, body: READY };
    });
    const p = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some(isBoot); i++) await settle(1);
    away();
    d.res();
    expect(await p).toEqual({ kind: 'stale' });
    expect(calls.filter(isStatus).length).toBe(0);
  });
  it('during a proof read', async () => {
    boot(); producer();
    onFetch((c) => {
      if (isBoot(c)) return { status: 0, network: true };
      if (isStatus(c)) { away(); return { status: 200, body: READY }; }
      return { status: 200, body: {} };
    });
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'stale' });
    expect(calls.filter(isStatus).length).toBe(1);
  });
  it('during Check again', async () => {
    boot();
    onFetch((c) => { if (isStatus(c)) { away(); return { status: 200, body: READY }; } return { status: 200, body: {} }; });
    expect(await checkAgentLogin(capture(), TARGET)).toBe('stale');
  });
});

describe('two presses on two computers sharing one key ask (the real producer)', () => {
  it('a cancel of the one prompt ends both: no bootstrap is sent to either agent', async () => {
    boot({ storage: { ['hub_boot_token:' + UID]: JSON.stringify({ token: KEY, tokenId: 't0', permsRev: 2, expiresAt: new Date(Date.now() + 80 * 86_400_000).toISOString(), epoch: '' }) } });
    const sh = loadShared() as unknown as Record<string, unknown>;
    new Function('apiCall', 'sessionTokenUid', 'supersededAuthError', producerSource)(sh.apiCall, sh.sessionTokenUid, sh.supersededAuthError);
    let asked = 0;
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    const tpl = deferred();
    onFetch(async (c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) { await tpl.p; return { status: 200, body: { data: [{ name: 'full_access', permissions: { computers: { read: true } } }] } }; }
      if (/\/auth\/tokens\/me$/.test(c.url)) return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } };
      if (/\/auth\/tokens$/.test(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      if (c.url.includes('/hoody/auth/')) return isBoot(c) ? { status: 201, body: {} } : { status: 200, body: READY };
      return { status: 200, body: {} };
    });
    const a = signInAgent(capture(), TARGET);
    await settle();
    setTarget(B);
    const b = signInAgent(capture(), B);
    await settle();
    tpl.res();
    expect(await a).toEqual({ kind: 'stale' });
    expect(await b).toEqual({ kind: 'refused', reason: 'cancelled' });
    expect(asked).toBe(1);
    expect(calls.filter((c) => c.url.includes('/hoody/auth/bootstrap'))).toEqual([]);
  });
});

describe('a realm change while the cancelled ask still runs (the real producer)', () => {
  // The producer's work is per account and outlives the ask's context: a press in the new realm must not ride it fresh.
  const OLD_REV = () => JSON.stringify({ token: KEY, tokenId: 't0', permsRev: 2, expiresAt: new Date(Date.now() + 80 * 86_400_000).toISOString(), epoch: '' });
  function realProducer(): void {
    const sh = loadShared() as unknown as Record<string, unknown>;
    new Function('apiCall', 'sessionTokenUid', 'supersededAuthError', producerSource)(sh.apiCall, sh.sessionTokenUid, sh.supersededAuthError);
  }
  it('cancel, then a realm change, then a press on another computer before the fallback settles: cancelled, nothing sent', async () => {
    boot({ storage: { ['hub_boot_token:' + UID]: OLD_REV() } });
    realProducer();
    let asked = 0;
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    const me = deferred();
    onFetch(async (c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) return { status: 200, body: { data: [{ name: 'full_access', permissions: { computers: { read: true } } }] } };
      if (/\/auth\/tokens\/me$/.test(c.url)) { await me.p; return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } }; }
      if (/\/auth\/tokens$/.test(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      if (c.url.includes('/hoody/auth/')) return c.url.includes('/hoody/auth/bootstrap') ? { status: 201, body: {} } : { status: 200, body: READY };
      return { status: 200, body: {} };
    });
    const a = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some((c) => /\/auth\/tokens\/me$/.test(c.url)); i++) await settle();
    expect(asked).toBe(1);
    bump('switch');
    setTarget(B);
    const b = signInAgent(capture(), B);
    await settle();
    me.res();
    expect(await a).toEqual({ kind: 'stale' });
    expect(await b).toEqual({ kind: 'refused', reason: 'cancelled' });
    expect(asked).toBe(1);
    expect(calls.filter((c) => c.url.includes('/hoody/auth/bootstrap'))).toEqual([]);
  });
  // The wait is bounded: the producer's reads carry no timeout of their own.
  function stalledFallback(): { me: { res: () => void }; asked: () => number } {
    boot({ storage: { ['hub_boot_token:' + UID]: OLD_REV() } });
    realProducer();
    let n = 0;
    setOtpPrompt({ ask: async () => { n++; return null; }, cancel: () => {} });
    const me = deferred();
    onFetch(async (c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) return { status: 200, body: { data: [{ name: 'full_access', permissions: { computers: { read: true } } }] } };
      if (/\/auth\/tokens\/me$/.test(c.url)) { await me.p; return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } }; }
      if (/\/auth\/tokens$/.test(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      if (c.url.includes('/hoody/auth/')) return c.url.includes('/hoody/auth/bootstrap') ? { status: 201, body: {} } : { status: 200, body: READY };
      return { status: 200, body: {} };
    });
    return { me, asked: () => n };
  }
  const boots = () => calls.filter((c) => c.url.includes('/hoody/auth/bootstrap'));
  it('the old work never settles: the new press gives up in bounded time, no key, nothing sent; a second press waits again', async () => {
    const { me, asked } = stalledFallback();
    resetBootToken(60); // after boot(), which resets the press wait with the rest of core
    const a = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some((c) => /\/auth\/tokens\/me$/.test(c.url)); i++) await settle();
    bump('switch');
    setTarget(B);
    const t0 = Date.now();
    // Nothing was sent: "still finishing elsewhere", never "couldn't get a key".
    expect(await signInAgent(capture(), B)).toEqual({ kind: 'refused', reason: 'busy' });
    expect(Date.now() - t0).toBeLessThan(2000);
    // The old ask keeps its place: another press still waits on it (and gives up again), never rides its work fresh.
    expect(await signInAgent(capture(), B)).toEqual({ kind: 'refused', reason: 'busy' });
    expect(boots()).toEqual([]);
    expect(asked()).toBe(1);
    me.res();
    expect(await a).toEqual({ kind: 'stale' });
    expect(boots()).toEqual([]);
  });
  it('the wait is bounded at 20 s', () => {
    expect(PRESS_WAIT_MS).toBe(20_000);
  });
  it('signing out while a press waits ends it stale at once, nothing sent', async () => {
    const { me } = stalledFallback();
    const a = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some((c) => /\/auth\/tokens\/me$/.test(c.url)); i++) await settle();
    bump('switch');
    setTarget(B);
    const b = signInAgent(capture(), B);
    await settle();
    bump('signout');
    const t0 = Date.now();
    expect(await b).toEqual({ kind: 'stale' });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(boots()).toEqual([]);
    me.res();
    expect(await a).toEqual({ kind: 'stale' });
    expect(boots()).toEqual([]);
  });
  it('a waiting press that is left (another computer shown) ends stale at once, nothing sent', async () => {
    const { me } = stalledFallback();
    const a = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some((c) => /\/auth\/tokens\/me$/.test(c.url)); i++) await settle();
    bump('switch');
    setTarget(B);
    const b = signInAgent(capture(), B);
    await settle();
    setTarget(TARGET);
    const t0 = Date.now();
    expect(await b).toEqual({ kind: 'stale' });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(boots()).toEqual([]);
    me.res();
    expect(await a).toEqual({ kind: 'stale' });
    expect(boots()).toEqual([]);
  });
  it('no cancel: the new press waits for the old work, then asks anew and signs in its own computer only', async () => {
    boot({ storage: { ['hub_boot_token:' + UID]: OLD_REV() } });
    realProducer();
    let asked = 0;
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    const tpl = deferred();
    onFetch(async (c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) { await tpl.p; return { status: 200, body: { data: [{ name: 'full_access', permissions: { computers: { read: true } } }] } }; }
      if (/\/auth\/tokens\/me$/.test(c.url)) return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } };
      if (/\/auth\/tokens$/.test(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      if (c.url.includes('/hoody/auth/')) return c.url.includes('/hoody/auth/bootstrap') ? { status: 201, body: {} } : { status: 200, body: READY };
      return { status: 200, body: {} };
    });
    const a = signInAgent(capture(), TARGET);
    await settle();
    bump('switch');
    setTarget(B);
    const b = signInAgent(capture(), B);
    await settle();
    tpl.res();
    expect(await a).toEqual({ kind: 'stale' });
    expect(await b).toEqual({ kind: 'signedIn' });
    // The old ask's mint was refused unsent (its context died): no prompt for it.
    expect(asked).toBe(0);
    // One bootstrap, to B's agent (not A's).
    const boots = calls.filter((c) => c.url.includes('/hoody/auth/bootstrap'));
    expect(boots.length).toBe(1);
    expect(boots[0]?.url.startsWith(BOOT)).toBe(false);
  });
});

describe('a cancelled 2FA prompt', () => {
  it('stops the press even when the producer falls back to a cached token: refused cancelled, nothing sent to the agent', async () => {
    boot();
    producer(async (uid, o) => {
      const body = { alias: 'hoody-agent auto hub x', permissions: {}, vault_access: true, event_access: true, allow_no_realm: true, expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() };
      try { await o!.mint!('POST', '/auth/tokens', body, { owner: uid }); } catch { /* the producer's B-fallback */ }
      return { token: 'hdy_' + 'o'.repeat(40), state: 'ok' };
    });
    setOtpPrompt({ ask: async () => null, cancel: () => {} });
    onFetch((c) => (/\/auth\/tokens$/.test(c.url) ? { status: 400, body: { error: 'OTP_REQUIRED' } } : isBoot(c) ? { status: 201, body: {} } : { status: 200, body: READY }));
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'refused', reason: 'cancelled' });
    expect(agentCalls()).toEqual([]);
  });
});

describe('the proof reads', () => {
  it('each proof read is cut at its own bound: unread, then unknown', async () => {
    boot(); resetAgentSignIn(5, 30); producer();
    onFetch((c) => {
      if (isBoot(c)) return { status: 0, network: true };
      if (isStatus(c)) return { status: 200, body: READY, delayMs: 5000 };
      return { status: 200, body: {} };
    });
    const t0 = Date.now();
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(calls.filter(isStatus).length).toBe(PROOF_TRIES);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it("the status route keeps the agent transport's own timeout (same spec as before the move)", () => {
    expect(agentSignInRoutes.status.timeoutMs).toBeUndefined();
  });
  it('the account changes during a proof read: stale, and no further read is sent', async () => {
    boot(); producer();
    onFetch((c) => {
      if (isBoot(c)) return { status: 0, network: true };
      if (isStatus(c)) { setIdentity({ id: OTHER, banned: false }); return { status: 200, body: OUT }; }
      return { status: 200, body: {} };
    });
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'stale' });
    expect(calls.filter(isStatus).length).toBe(1);
  });
});

describe('checkAgentLogin and signInOffered', () => {
  it('Check again sends one status read only', async () => {
    boot(); agent(() => ({ status: 201 }), [READY]);
    expect(await checkAgentLogin(capture(), TARGET)).toBe('ready');
    expect(agentCalls()).toEqual(['status']);
    boot(); agent(() => ({ status: 201 }), ['lost']);
    expect(await checkAgentLogin(capture(), TARGET)).toBe('unread');
  });
  it('offered in a live account session only', () => {
    boot();
    expect(signInOffered(capture())).toBe(true);
    const ctx = capture();
    setIdentity({ id: OTHER, banned: false });
    expect(signInOffered(ctx)).toBe(false);
  });
  it('the bootstrap route is declared secret with its codes, and the under-way code', () => {
    expect(agentSignInRoutes.bootstrap.secret).toBe(true);
    expect(agentSignInRoutes.bootstrap.secretKeys).toEqual(['token']);
    expect(agentSignInRoutes.bootstrap.unknownCodes).toEqual(['bootstrap_in_progress']);
    expect(agentSignInRoutes.bootstrap.codes).toContain('credential_present');
  });
});

describe('watchComputer', () => {
  it('fires as core shows another computer, before any render, and stops once dropped', () => {
    setTarget(TARGET);
    const id = String(TARGET.container?.id);
    let left = 0;
    const drop = watchComputer(id, () => { left++; });
    setTarget(B);
    expect(left).toBe(1);
    setTarget(TARGET);
    expect(left).toBe(1);
    drop();
    setTarget(B);
    expect(left).toBe(1);
  });
});

describe('an unknown sign-in holds its computer (C9)', () => {
  const boots = () => agentCalls().filter((x) => x === 'boot').length;
  /** One sign-in whose answer is lost and whose status reads all say signed out: unknown, one bootstrap. */
  async function unknownOnce(): Promise<void> {
    boot(); resetAgentSignIn(5); producer(); agent(() => ({ status: 0, network: true }), [OUT]);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(boots()).toBe(1);
  }

  it('every later call for the account and computer answers unknown and sends nothing, across a switch away and back', async () => {
    await unknownOnce();
    expect(signInUnsure(capture(), TARGET)).toBe(true);
    const sent = agentCalls().length;
    // Another place (a list drawn again, a second list, the Ask dock) calls core the same way.
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    setTarget(B); setTarget(TARGET); bump('switch');
    expect(signInUnsure(capture(), TARGET)).toBe(true);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(agentCalls().length).toBe(sent);
    // Held for that computer only.
    expect(signInUnsure(capture(), B)).toBe(false);
  });

  it('a status read right away keeps it; one started UNSURE_HOLD_MS later ends it, and only then does a press send again', async () => {
    await unknownOnce();
    expect(await checkAgentLogin(capture(), TARGET)).toBe('login');
    expect(signInUnsure(capture(), TARGET)).toBe(true);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(boots()).toBe(1);
    let told = 0;
    const drop = subscribeSignInUnsure(() => { told++; });
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + UNSURE_HOLD_MS);
    try {
      expect(await checkAgentLogin(capture(), TARGET)).toBe('login');
    } finally { now.mockRestore(); drop(); }
    expect(told).toBe(1);
    expect(signInUnsure(capture(), TARGET)).toBe(false);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(boots()).toBe(2);
  });

  it('a status read that says ready ends it at once', async () => {
    await unknownOnce();
    agent(() => ({ status: 201, body: {} }), [READY]);
    expect(await checkAgentLogin(capture(), TARGET)).toBe('ready');
    expect(signInUnsure(capture(), TARGET)).toBe(false);
  });

  it('a status read that does not answer keeps it', async () => {
    await unknownOnce();
    agent(() => ({ status: 201, body: {} }), ['lost']);
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + UNSURE_HOLD_MS);
    try {
      expect(await checkAgentLogin(capture(), TARGET)).toBe('unread');
    } finally { now.mockRestore(); }
    expect(signInUnsure(capture(), TARGET)).toBe(true);
  });

  /** Runs `f` while Date.now reads `t`. */
  function atTime<T>(t: number, f: () => T): T {
    const s = vi.spyOn(Date, 'now').mockReturnValue(t);
    try { return f(); } finally { s.mockRestore(); }
  }

  it('a read a place sends itself, noted with noteAgentStatus, counts as Check again: signed out at once keeps it, ready ends it, signed out UNSURE_HOLD_MS later ends it', async () => {
    await unknownOnce();
    noteAgentStatus(capture(), TARGET)(OUT);
    expect(signInUnsure(capture(), TARGET)).toBe(true);
    noteAgentStatus(capture(), TARGET)(READY);
    expect(signInUnsure(capture(), TARGET)).toBe(false);
    await unknownOnce();
    const late = atTime(Date.now() + UNSURE_HOLD_MS, () => noteAgentStatus(capture(), TARGET));
    late(OUT);
    expect(signInUnsure(capture(), TARGET)).toBe(false);
  });

  it('a read that started before the unknown came says nothing about it, even ready and in the same millisecond (noted or Check again)', async () => {
    boot(); resetAgentSignIn(5); producer();
    // The first status read (a Check again sent before the sign-in) is held open, then says ready; every later read says
    // signed out, so the sign-in ends unknown.
    const first = deferred();
    let reads = 0;
    onFetch(async (c) => {
      if (isBoot(c)) return { status: 0, network: true };
      if (isStatus(c)) {
        if (reads++ === 0) { await first.p; return { status: 200, body: READY }; }
        return { status: 200, body: OUT };
      }
      return { status: 200, body: { data: {} } };
    });
    // One millisecond for all of it: only the order of the reads and the unknown can tell them apart.
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    try {
      const check = checkAgentLogin(capture(), TARGET);
      const note = noteAgentStatus(capture(), TARGET);
      for (let i = 0; i < 50 && reads === 0; i++) await settle(1);
      expect(reads).toBe(1);
      expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
      expect(signInUnsure(capture(), TARGET)).toBe(true);
      note(READY);
      expect(signInUnsure(capture(), TARGET)).toBe(true);
      first.res();
      expect(await check).toBe('ready');
      expect(signInUnsure(capture(), TARGET)).toBe(true);
      // A read started after the unknown, in that same millisecond, that says ready ends it.
      noteAgentStatus(capture(), TARGET)(READY);
      expect(signInUnsure(capture(), TARGET)).toBe(false);
    } finally { now.mockRestore(); }
  });

  it('a noted answer that comes after its context ended counts for nothing', async () => {
    await unknownOnce();
    const note = noteAgentStatus(capture(), TARGET);
    bump('switch');
    note(READY);
    expect(signInUnsure(capture(), TARGET)).toBe(true);
  });

  it('the hold goes with the account (a bump that keeps no change), and with resetAgentSignIn', async () => {
    await unknownOnce();
    bump('account');
    expect(signInUnsure(capture(), TARGET)).toBe(false);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(boots()).toBe(2);
    resetAgentSignIn(5);
    expect(signInUnsure(capture(), TARGET)).toBe(false);
  });
});

describe('a sign-in that went out and then ended stale holds its computer too (C9)', () => {
  const boots = () => agentCalls().filter((x) => x === 'boot').length;
  /** The bootstrap goes out and is held open; `leave` runs while it is out, then it answers. */
  async function sentThen(leave: () => void): Promise<void> {
    boot(); resetAgentSignIn(5); producer();
    const d = deferred();
    onFetch(async (c) => {
      if (isBoot(c)) { await d.p; return { status: 201, body: {} }; }
      if (isStatus(c)) return { status: 200, body: OUT };
      return { status: 200, body: { data: {} } };
    });
    const p = signInAgent(capture(), TARGET);
    for (let i = 0; i < 50 && !calls.some(isBoot); i++) await settle(1);
    leave();
    d.res();
    expect(await p).toEqual({ kind: 'stale' });
    expect(boots()).toBe(1);
  }

  it('the Hub showed another computer while it was out: back on the first, held, and nothing is sent again', async () => {
    await sentThen(() => setTarget(B));
    setTarget(TARGET);
    expect(signInUnsure(capture(), TARGET)).toBe(true);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(boots()).toBe(1);
  });

  it('a realm switch while it was out (a new context, same account): held', async () => {
    await sentThen(() => bump('switch'));
    expect(signInUnsure(capture(), TARGET)).toBe(true);
    expect(await signInAgent(capture(), TARGET)).toEqual({ kind: 'unknown' });
    expect(boots()).toBe(1);
  });

  it('another account while it was out: nothing held for the new one', async () => {
    await sentThen(() => setIdentity({ id: OTHER, banned: false }));
    expect(signInUnsure(capture(), TARGET)).toBe(false);
  });

  it('stale before anything went out (the key still being made): nothing held', async () => {
    boot(); resetAgentSignIn(5);
    const d = deferred();
    producer(async () => { await d.p; return { token: KEY, state: 'ok' }; });
    agent(() => ({ status: 201 }), [READY]);
    const p = signInAgent(capture(), TARGET);
    await settle();
    setTarget(B);
    d.res();
    expect(await p).toEqual({ kind: 'stale' });
    setTarget(TARGET);
    expect(signInUnsure(capture(), TARGET)).toBe(false);
    expect(boots()).toBe(0);
  });
});
