// boot-token.mint.test.ts: the key mint with 2FA. Only an ask a person's press started (codePrompt)
// hands the producer a mint, for that ensure only; nothing is published. The mint is bound to the ask (its context,
// its account, the boot token's body, two sends, until the ask settles) and its 2FA step is core's prompt. A cancelled
// prompt ends the ask CANCELLED, even when the producer recovers an older cached token.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import producerSource from '../../../public/auth/hub-boot-token.js?raw';
import { setOtpPrompt } from './api';
import { agentBootToken, MINT_ATTEMPTS, resetBootToken } from './boot-token';
import { bump, capture } from './ctx';
import { boot, calls, deferred, loadShared, onFetch, OTHER, settle, UID } from './test/env';
// The computers.* leaves a stale-rev cached token must still hold for the Hub to reuse it (hub-boot-token.js NEEDED_LEAVES): what the
// server's token answer carries for a bearer whose tree was migrated.
const NEEDED_TREE = { computers: { read: true, create: true, update: true, delete: true, actions: { start: true, stop: true, restart: true, exec: true, logs: true } } };

type Mint = (m: unknown, p: unknown, b: unknown, o?: { owner?: unknown } | null) => Promise<unknown>;
type G = { HubBootToken?: unknown; Hub?: Record<string, unknown> };
const g = globalThis as G;
const KEY = 'hdy_' + 'm'.repeat(40);
const OLD = 'hdy_' + 'o'.repeat(40);
const DAY = 86_400_000;
const exp = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const PERMS = { computers: { read: true }, financial: { wallet: { read: true }, billing: { read: true }, server_rental: { view_marketplace: true } }, admin: { users: false } };
const BODY = { alias: 'hoody-agent auto hub abc123', permissions: PERMS, vault_access: true, event_access: true, allow_no_realm: true, expires_at: exp(90) };
const isMint = (u: string) => /\/auth\/tokens$/.test(u);
const mints = () => calls.filter((c) => isMint(c.url) && c.method === 'POST');
const codeOf = (p: Promise<unknown>): Promise<string> => p.then(() => 'sent', (e: { code?: string }) => e.code ?? '');

// A producer shaped like hub-boot-token.js: it mints through the ask's mint when one came, keeps it (to prove a kept
// reference is dead), and may wait (templates) or fall back to a cached token after a failed mint.
interface Fake { kept: Mint | null; got: unknown[]; errs: string[]; hold?: Promise<void>; fallback?: string; body?: Record<string, unknown> }
function producer(f: Partial<Fake> = {}): Fake {
  const st: Fake = { kept: null, got: [], errs: [], ...f };
  g.HubBootToken = {
    ensure: async (uid: string, o?: { mint?: Mint }) => {
      st.got.push(o);
      const mint = o && o.mint;
      if (typeof mint !== 'function') throw { token: '', state: 'failed', message: 'no otp-aware mint' };
      st.kept = mint;
      if (st.hold) await st.hold;
      try {
        const resp = await mint('POST', '/auth/tokens', st.body ?? BODY, { owner: uid }) as { data?: { token?: string } };
        return { token: resp?.data?.token ?? '', state: 'ok', message: '' };
      } catch (e) {
        st.errs.push(String((e as { code?: unknown })?.code ?? ''));
        if (st.fallback) return { token: st.fallback, state: 'ok', message: '' };
        throw e;
      }
    },
  };
  return st;
}
let asked = 0;
beforeEach(() => { asked = 0; delete g.Hub; });
afterEach(() => { delete g.HubBootToken; delete g.Hub; resetBootToken(); setOtpPrompt(null); });
const okMintReply = (c: { url: string }) => (isMint(c.url) ? { status: 201, body: { data: { id: 't1', token: KEY } } } : { status: 200, body: {} });
const okMint = () => onFetch(okMintReply);

describe('the ask-bound key mint', () => {
  it('codePrompt hands the producer a mint for that ensure; nothing is published', async () => {
    boot();
    const p = producer();
    okMint();
    expect(await agentBootToken(capture(), { codePrompt: true })).toBe(KEY);
    expect(typeof p.kept).toBe('function');
    expect(mints().length).toBe(1);
    expect(g.Hub === undefined || !('tokenApiCall' in g.Hub)).toBe(true);
  });
  it('a background ask (no codePrompt) brings no mint', async () => {
    boot();
    const p = producer();
    expect(await codeOf(agentBootToken(capture()))).toBe('BOOT_TOKEN_FAILED');
    expect(p.got).toEqual([undefined]);
    expect(mints()).toEqual([]);
  });
  it("a 2FA challenge asks core's prompt and sends the code with the same mint", async () => {
    boot();
    producer();
    setOtpPrompt({ ask: async () => { asked++; return '123456'; }, cancel: () => {} });
    onFetch((c) => {
      if (!isMint(c.url)) return { status: 200, body: {} };
      return c.body.otp_code === '123456' ? { status: 201, body: { data: { id: 't1', token: KEY } } } : { status: 400, body: { error: 'OTP_REQUIRED' } };
    });
    expect(await agentBootToken(capture(), { codePrompt: true })).toBe(KEY);
    expect(asked).toBe(1);
    expect(mints().length).toBe(2);
    expect(mints()[1]?.body).toEqual({ ...BODY, otp_code: '123456' });
  });
  it('a cancelled prompt mints nothing: CANCELLED, and the next ask starts clean', async () => {
    boot();
    producer();
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    onFetch((c) => (isMint(c.url) ? { status: 400, body: { error: 'OTP_REQUIRED' } } : { status: 200, body: {} }));
    expect(await codeOf(agentBootToken(capture(), { codePrompt: true }))).toBe('CANCELLED');
    expect(asked).toBe(1);
    expect(mints().length).toBe(1);
    onFetch((c) => (isMint(c.url) ? { status: 500, body: { error: 'X' } } : { status: 200, body: {} }));
    expect(await codeOf(agentBootToken(capture(), { codePrompt: true }))).toBe('BOOT_TOKEN_FAILED');
  });
  it('a cancelled prompt stays CANCELLED when the producer falls back to a cached token', async () => {
    boot();
    producer({ fallback: OLD });
    setOtpPrompt({ ask: async () => null, cancel: () => {} });
    onFetch((c) => (isMint(c.url) ? { status: 400, body: { error: 'OTP_REQUIRED' } } : { status: 200, body: {} }));
    expect(await codeOf(agentBootToken(capture(), { codePrompt: true }))).toBe('CANCELLED');
  });
  it('a plain mint failure with a cached fallback still gives the cached token (only a cancel stops the press)', async () => {
    boot();
    producer({ fallback: OLD });
    onFetch((c) => (isMint(c.url) ? { status: 500, body: { error: 'X' } } : { status: 200, body: {} }));
    expect(await agentBootToken(capture(), { codePrompt: true })).toBe(OLD);
  });
  it('a kept reference is dead once the ask settled: refused unsent', async () => {
    boot();
    const p = producer();
    okMint();
    await agentBootToken(capture(), { codePrompt: true });
    const before = mints().length;
    expect(await codeOf(p.kept!('POST', '/auth/tokens', BODY, { owner: UID }))).toBe('NOT_ALLOWED');
    expect(mints().length).toBe(before);
  });
  it('at most MINT_ATTEMPTS sends per ask', async () => {
    boot();
    let extra: string[] = [];
    g.HubBootToken = {
      ensure: async (uid: string, o: { mint: Mint }) => {
        for (let i = 0; i <= MINT_ATTEMPTS; i++) {
          extra.push(await codeOf(o.mint('POST', '/auth/tokens', { ...BODY, alias: BODY.alias + i }, { owner: uid })));
        }
        return { token: KEY, state: 'ok' };
      },
    };
    onFetch((c) => (isMint(c.url) ? { status: 400, body: { error: 'DUPLICATE_ALIAS' } } : { status: 200, body: {} }));
    await agentBootToken(capture(), { codePrompt: true });
    expect(extra.slice(MINT_ATTEMPTS)).toEqual(['NOT_ALLOWED']);
    expect(mints().length).toBe(MINT_ATTEMPTS);
    extra = [];
  });
  it('an account or realm change while the producer waits (templates): the mint is refused unsent, the ask STALE', async () => {
    for (const change of ['switch', 'account']) {
      boot();
      const d = deferred();
      const p = producer({ hold: d.p });
      okMint();
      const out = codeOf(agentBootToken(capture(), { codePrompt: true }));
      await settle();
      bump(change);
      d.res();
      expect(await out).toBe('STALE');
      expect(mints()).toEqual([]);
      // Refused by the mint itself, bound to the ask's context (not by a later step).
      expect(p.errs).toEqual(['NOT_ALLOWED']);
    }
  });
  it('a press that was left (its still() false) leaves the mint refused unsent: no prompt, no mint', async () => {
    boot();
    const d = deferred();
    const p = producer({ hold: d.p });
    setOtpPrompt({ ask: async () => { asked++; return '123456'; }, cancel: () => {} });
    okMint();
    let here = true;
    const out = codeOf(agentBootToken(capture(), { codePrompt: true, still: () => here }));
    await settle();
    here = false;
    d.res();
    expect(await out).toBe('BOOT_TOKEN_FAILED');
    expect(p.errs).toEqual(['NOT_ALLOWED']);
    expect(mints()).toEqual([]);
    expect(asked).toBe(0);
  });
  it('a second press joins the running ask (one ensure); a cancel there ends both presses CANCELLED, even with a cached fallback', async () => {
    boot();
    const d = deferred();
    const p = producer({ hold: d.p, fallback: OLD });
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    onFetch((c) => (isMint(c.url) ? { status: 400, body: { error: 'OTP_REQUIRED' } } : { status: 200, body: {} }));
    let aHere = true;
    const a = codeOf(agentBootToken(capture(), { codePrompt: true, still: () => aHere }));
    await settle();
    const b = codeOf(agentBootToken(capture(), { codePrompt: true, still: () => true }));
    aHere = false; // the first press was left (another computer shown); the second still waits, so the mint goes
    d.res();
    expect(await a).toBe('CANCELLED');
    expect(await b).toBe('CANCELLED');
    expect(p.got.length).toBe(1);
    expect(asked).toBe(1);
    // A later press starts a new ask.
    onFetch(okMintReply);
    expect(await agentBootToken(capture(), { codePrompt: true })).toBe(KEY);
    expect(p.got.length).toBe(2);
  });
  it('the mint takes only the boot token: other routes, owners and bodies are refused unsent', async () => {
    boot();
    const got: string[] = [];
    const tries: [unknown, unknown, unknown, unknown][] = [
      ['DELETE', '/auth/tokens', BODY, { owner: UID }],
      ['POST', '/auth/tokens/x', BODY, { owner: UID }],
      ['POST', '/vault', BODY, { owner: UID }],
      ['POST', '/auth/tokens', BODY, { owner: OTHER }],
      ['POST', '/auth/tokens', BODY, {}],
      ['POST', '/auth/tokens', { ...BODY, admin: true }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, ip_whitelist: ['198.51.100.7'] }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, realm_ids: ['aaaaaaaaaaaaaaaaaaaaaaa1'] }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, vault_access: false }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, allow_no_realm: 'yes' }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, alias: 'my key' }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, expires_at: exp(-1) }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, expires_at: exp(401) }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, expires_at: 'soon' }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, permissions: 'full' }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, permissions: { ...PERMS, financial: { wallet: { read: true, withdraw: true } } } }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, permissions: { ...PERMS, financial: { rent_servers: true } } }, { owner: UID }],
      ['POST', '/auth/tokens', { ...BODY, permissions: { ...PERMS, admin: { users: true } } }, { owner: UID }],
    ];
    g.HubBootToken = {
      ensure: async (_uid: string, o: { mint: Mint }) => {
        for (const [m, p, b, w] of tries) got.push(await codeOf(o.mint(m, p, b, w as { owner?: unknown })));
        return { token: KEY, state: 'ok' };
      },
    };
    okMint();
    await agentBootToken(capture(), { codePrompt: true });
    expect(got).toEqual([
      'ROUTE_NOT_ALLOWED', 'ROUTE_NOT_ALLOWED', 'ROUTE_NOT_ALLOWED', 'NOT_ALLOWED', 'NOT_ALLOWED',
      ...Array(13).fill('ROUTE_BODY'),
    ]);
    expect(mints()).toEqual([]);
  });
});

// The real producer (public/auth/hub-boot-token.js) over the real shared.js and a recorded fetch.
function realProducer(): void {
  const sh = loadShared() as unknown as Record<string, unknown>;
  const make = new Function('apiCall', 'sessionTokenUid', 'supersededAuthError', producerSource);
  make(sh.apiCall, sh.sessionTokenUid, sh.supersededAuthError);
}
const TEMPLATES = { status: 200, body: { data: [{ name: 'full_access', permissions: { computers: { read: true }, financial: { wallet: { withdraw: true } }, admin: { users: false } } }] } };

describe('with the real producer', () => {
  it('a fresh account behind 2FA: the prompt, then the boot token, its body passing the ask-bound mint', async () => {
    boot();
    realProducer();
    setOtpPrompt({ ask: async () => { asked++; return '123456'; }, cancel: () => {} });
    onFetch((c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) return TEMPLATES;
      if (!isMint(c.url)) return { status: 200, body: {} };
      return c.body.otp_code === '123456' ? { status: 201, body: { data: { id: 't1', token: KEY, expires_at: exp(90) } } } : { status: 400, body: { error: 'OTP_REQUIRED' } };
    });
    expect(await agentBootToken(capture(), { codePrompt: true })).toBe(KEY);
    expect(asked).toBe(1);
    expect(mints().length).toBe(2);
  });
  it('a cancelled upgrade prompt with a cached older token the server vouches for: CANCELLED, no token', async () => {
    boot({ storage: { ['hub_boot_token:' + UID]: JSON.stringify({ token: OLD, tokenId: 't0', permsRev: 2, expiresAt: exp(80), epoch: '' }) } });
    realProducer();
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    onFetch((c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) return TEMPLATES;
      if (/\/auth\/tokens\/me$/.test(c.url)) return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } };
      if (isMint(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      return { status: 200, body: {} };
    });
    expect(await codeOf(agentBootToken(capture(), { codePrompt: true }))).toBe('CANCELLED');
    expect(asked).toBe(1);
    expect(calls.some((c) => /\/auth\/tokens\/me$/.test(c.url))).toBe(true); // the producer did fall back
    // A background ask still gets that cached token: the cancel stopped the press, not the Board.
    expect(await agentBootToken(capture())).toBe(OLD);
  });
  it('a Board ask during a press that is cancelled still gets the cached token; the press does not', async () => {
    boot({ storage: { ['hub_boot_token:' + UID]: JSON.stringify({ token: OLD, tokenId: 't0', permsRev: 2, expiresAt: exp(80), epoch: '' }) } });
    realProducer();
    setOtpPrompt({ ask: async () => null, cancel: () => {} });
    const tpl = deferred();
    onFetch(async (c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) { await tpl.p; return TEMPLATES; }
      if (/\/auth\/tokens\/me$/.test(c.url)) return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } };
      if (isMint(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      return { status: 200, body: {} };
    });
    const press = codeOf(agentBootToken(capture(), { codePrompt: true }));
    await settle();
    const board = agentBootToken(capture());
    tpl.res();
    expect(await press).toBe('CANCELLED');
    expect(await board).toBe(OLD);
  });
  it('two presses (two computers) on one held template read: one prompt, its cancel ends both, no token', async () => {
    boot({ storage: { ['hub_boot_token:' + UID]: JSON.stringify({ token: OLD, tokenId: 't0', permsRev: 2, expiresAt: exp(80), epoch: '' }) } });
    realProducer();
    setOtpPrompt({ ask: async () => { asked++; return null; }, cancel: () => {} });
    const tpl = deferred();
    onFetch(async (c) => {
      if (/\/auth\/tokens\/templates$/.test(c.url)) { await tpl.p; return TEMPLATES; }
      if (/\/auth\/tokens\/me$/.test(c.url)) return { status: 200, body: { data: { token: { id: 't0', permissions: NEEDED_TREE } } } };
      if (isMint(c.url)) return { status: 400, body: { error: 'OTP_REQUIRED' } };
      return { status: 200, body: {} };
    });
    let aHere = true;
    const a = codeOf(agentBootToken(capture(), { codePrompt: true, still: () => aHere }));
    await settle();
    aHere = false;
    const b = codeOf(agentBootToken(capture(), { codePrompt: true, still: () => true }));
    tpl.res();
    expect(await a).toBe('CANCELLED');
    expect(await b).toBe('CANCELLED');
    expect(asked).toBe(1);
    expect(calls.filter((c) => /\/auth\/tokens\/templates$/.test(c.url)).length).toBe(1);
  });
});
