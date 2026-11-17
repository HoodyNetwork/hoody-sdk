// token.ts: the access-key sign-in rules (the login page's token-login.js rules on the chosen Hoody).
import { describe, expect, it } from 'vitest';
import { checkToken, errorFor, openToken, parseShareText, resolveRealm, type Intro, type TokenGlobals } from './token';

const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
const R1 = '1'.repeat(24), R2 = '2'.repeat(24);
const UID = '64f0c0ffee0000000000aaaa';
const intro = (o: Partial<Intro> = {}): Intro => ({
  id: 't1', alias: 'shared', perms: { computers: { read: true }, projects: { read: true } }, expiresAt: null, realmIds: [R1], allowNoRealm: false, isEnabled: true, ...o,
});

function globals(o: { intro?: Intro | null; me?: unknown; fail?: unknown; auth?: string; revs?: Array<string | null>; install?: { ok: boolean; why?: string }; domain?: string; held?: boolean; framed?: boolean | (() => boolean) } = {}) {
  const calls: Array<{ path: string; bearer: string; base?: string }> = [];
  const installs: unknown[] = [];
  const revs = [...(o.revs ?? [])];
  let rev: string | null = 'r0';
  const g: TokenGlobals = {
    apiCall: async (_m, path, _b, bearer, _r, opts) => {
      calls.push({ path, bearer, ...(opts.base ? { base: opts.base } : {}) });
      if (o.fail) throw o.fail;
      return path === '/auth/tokens/me' ? { data: 'intro' } : (o.me ?? { data: { id: UID, username: 'owner' } });
    },
    parseTokenIntrospection: () => (o.intro === undefined ? intro() : o.intro),
    installTokenSession: (rec, rev0) => { installs.push({ rec, rev0 }); return o.install ?? { ok: true }; },
    readAuthRev: () => { if (revs.length) rev = revs.shift() ?? null; return rev; },
    classifyStoredAuth: () => o.auth ?? 'none',
    realmApiDomain: () => o.domain ?? 'api.hoody.test',
    standaloneApiHeld: () => o.held ?? true,
    isFramedPage: () => (typeof o.framed === 'function' ? o.framed() : o.framed ?? false),
  };
  return { g, calls, installs };
}

describe('parseShareText', () => {
  it('finds one key and at most one realm in a pasted message', () => {
    expect(parseShareText(`Open with ${TOKEN.toUpperCase().replace('HDY_', 'hdy_')} in realm ${R1}`)).toEqual({ token: TOKEN, realm: R1 });
    expect(parseShareText(TOKEN)).toEqual({ token: TOKEN, realm: '' });
    expect(parseShareText(`${TOKEN} ${R1} ${R2}`)).toEqual({ token: TOKEN, realm: '' });
    expect(parseShareText('  ')).toEqual({ error: 'empty' });
    expect(parseShareText('eyJhbGciOiJI.eyJpZCI6IjEi.sig')).toEqual({ error: 'jwt' });
    expect(parseShareText('hello')).toEqual({ error: 'shape' });
    expect(parseShareText(`${TOKEN} hdy_${'c'.repeat(24)}_${'d'.repeat(48)}`)).toEqual({ error: 'two' });
  });
});

describe('resolveRealm', () => {
  it('one realm, several, none with and without account-wide access', () => {
    expect(resolveRealm(intro(), '')).toEqual({ pin: R1 });
    expect(resolveRealm(intro(), R2)).toEqual({ error: 'realmMismatch' });
    expect(resolveRealm(intro({ realmIds: [R1, R2] }), '')).toEqual({ choose: 'multi', realms: [R1, R2] });
    expect(resolveRealm(intro({ realmIds: [R1, R2] }), R2)).toEqual({ pin: R2 });
    expect(resolveRealm(intro({ realmIds: [] }), '')).toEqual({ error: 'realmNeeded' });
    expect(resolveRealm(intro({ realmIds: [], allowNoRealm: true }), '')).toEqual({ choose: 'dest' });
    expect(resolveRealm(intro({ realmIds: [], allowNoRealm: true }), R2)).toEqual({ pin: R2 });
  });
});

describe('checkToken and openToken', () => {
  it('checks the key, reads the owner on the pinned realm host, and installs only on Open', async () => {
    const h = globals();
    const r = await checkToken(h.g, { text: TOKEN });
    expect(r).toMatchObject({ ok: true, checked: { token: TOKEN, rev0: 'r0', pin: R1, owner: { id: UID, username: 'owner' } } });
    expect(h.calls).toEqual([{ path: '/auth/tokens/me', bearer: TOKEN }, { path: '/users/auth/me', bearer: TOKEN, base: `https://${R1}.api.hoody.test/api/v1` }]);
    expect(h.installs).toEqual([]);
    if (!r.ok) throw new Error('not ok');
    expect(openToken(h.g, r.checked)).toBe('ok');
    expect(h.installs).toEqual([{ rec: { token: TOKEN, realm: R1, owner: { id: UID, username: 'owner' } }, rev0: 'r0' }]);
  });

  it('an account-wide key opened for everything talks to the base host', async () => {
    const h = globals({ intro: intro({ realmIds: [], allowNoRealm: true }) });
    const first = await checkToken(h.g, { text: TOKEN });
    expect(first).toMatchObject({ ok: false, choose: { choose: 'dest' } });
    if (first.ok || !('choose' in first)) throw new Error('no choice');
    const r = await checkToken(h.g, { token: first.token, rev0: first.rev0, intro: first.intro, pin: 'all' });
    expect(r).toMatchObject({ ok: true, checked: { pin: 'all' } });
    expect(h.calls.at(-1)).toEqual({ path: '/users/auth/me', bearer: TOKEN });
  });

  it('a pick outside the key\'s realms is refused unsent', async () => {
    const h = globals();
    expect(await checkToken(h.g, { token: TOKEN, rev0: 'r0', intro: intro({ realmIds: [R1, R2] }), pin: '3'.repeat(24) })).toEqual({ ok: false, error: 'realmMismatch' });
    expect(await checkToken(h.g, { token: TOKEN, rev0: 'r0', intro: intro(), pin: 'all' })).toEqual({ ok: false, error: 'invalid' });
    expect(h.calls).toEqual([]);
  });

  it('refuses before sending: a session held, unreadable storage, a malformed realm', async () => {
    for (const [auth, error] of [['account', 'signedIn'], ['token', 'signedIn'], ['unreadable', 'storage']] as const) {
      const h = globals({ auth });
      expect(await checkToken(h.g, { text: TOKEN })).toEqual({ ok: false, error });
      expect(h.calls).toEqual([]);
    }
    expect(await checkToken(globals().g, { text: TOKEN, realm: 'nope' })).toEqual({ ok: false, error: 'realmShape' });
  });

  it('a disabled key, one that cannot see computers, and an unparsable answer', async () => {
    expect(await checkToken(globals({ intro: intro({ isEnabled: false }) }).g, { text: TOKEN })).toEqual({ ok: false, error: 'invalid' });
    expect(await checkToken(globals({ intro: intro({ perms: { computers: { read: true } } }) }).g, { text: TOKEN })).toEqual({ ok: false, error: 'noComputers' });
    expect(await checkToken(globals({ intro: null }).g, { text: TOKEN })).toEqual({ ok: false, error: 'offline' });
    expect(await checkToken(globals({ me: { data: { id: 'x', username: 'o' } } }).g, { text: TOKEN })).toEqual({ ok: false, error: 'offline' });
  });

  it('a check the screen dropped (live() false) sends no owner read with the key and ends stale', async () => {
    const h = globals();
    expect(await checkToken(h.g, { text: TOKEN }, () => false)).toEqual({ ok: false, error: 'stale' });
    expect(h.calls).toEqual([{ path: '/auth/tokens/me', bearer: TOKEN }]);
    const p = globals();
    expect(await checkToken(p.g, { token: TOKEN, rev0: 'r0', intro: intro(), pin: R1 }, () => false)).toEqual({ ok: false, error: 'stale' });
    expect(p.calls).toEqual([]);
    // Control: live the whole way, both reads go out.
    const c = globals();
    expect(await checkToken(c.g, { text: TOKEN }, () => true)).toMatchObject({ ok: true });
    expect(c.calls.map((x) => x.path)).toEqual(['/auth/tokens/me', '/users/auth/me']);
  });

  it('a sign-in or sign-out elsewhere in between makes it stale; Open refuses too', async () => {
    expect(await checkToken(globals({ revs: ['r0', 'r1'] }).g, { text: TOKEN })).toEqual({ ok: false, error: 'stale' });
    const h = globals();
    const r = await checkToken(h.g, { text: TOKEN });
    if (!r.ok) throw new Error('not ok');
    expect(openToken(globals({ revs: ['r9'] }).g, r.checked)).toBe('stale');
    expect(openToken(globals({ auth: 'account' }).g, r.checked)).toBe('stale');
    expect(openToken(globals({ install: { ok: false, why: 'stale' } }).g, r.checked)).toBe('stale');
    expect(openToken(globals({ install: { ok: false, why: 'storage' } }).g, r.checked)).toBe('storage');
  });

  it('Open refuses, installing nothing, once storage names another Hoody than the one the key was checked on', async () => {
    const r = await checkToken(globals().g, { text: TOKEN });
    if (!r.ok) throw new Error('not ok');
    const other = globals({ held: false });
    expect(openToken(other.g, r.checked)).toBe('stale');
    expect(other.installs).toEqual([]);
  });

  it('a refused or unanswered request is a shown error, never a session', async () => {
    expect(await checkToken(globals({ fail: { status: 401 } }).g, { text: TOKEN })).toEqual({ ok: false, error: 'invalid' });
    expect(await checkToken(globals({ fail: { status: 429, retryAfter: 9 } }).g, { text: TOKEN })).toEqual({ ok: false, error: 'retry', retryAfter: 9 });
    expect(await checkToken(globals({ fail: new TypeError('offline') }).g, { token: TOKEN, rev0: 'r0', intro: intro(), pin: R1 })).toEqual({ ok: false, error: 'offline' });
  });

  it('maps refusals from status and code only', () => {
    expect(errorFor({ status: 401 })).toEqual({ key: 'invalid' });
    expect(errorFor({ status: 403, code: 'IP_NOT_ALLOWED' })).toEqual({ key: 'network' });
    expect(errorFor({ status: 403, code: 'ACCOUNT_BANNED' })).toEqual({ key: 'unavailable' });
    expect(errorFor({ status: 429, retryAfter: 12 })).toEqual({ key: 'retry', retryAfter: 12 });
    expect(errorFor({ status: 0, code: 'BAD_API_BASE' })).toEqual({ key: 'realmUnsupported' });
    expect(errorFor({ status: 502 })).toEqual({ key: 'offline' });
    expect(errorFor(new Error('x'))).toEqual({ key: 'offline' });
  });
});

describe('a page shown inside another page', () => {
  it('sends no key: checkToken refuses before any request, both on a pasted key and on a chosen realm', async () => {
    const h = globals({ framed: true });
    expect(await checkToken(h.g, { text: TOKEN })).toEqual({ ok: false, error: 'framed' });
    expect(await checkToken(h.g, { token: TOKEN, rev0: 'r0', intro: intro(), pin: R1 })).toEqual({ ok: false, error: 'framed' });
    expect(h.calls).toEqual([]);
  });

  it('installs no key: openToken refuses before the install, and a check that throws counts as framed', async () => {
    let framed = false;
    const h = globals({ framed: () => framed });
    const r = await checkToken(h.g, { text: TOKEN });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    framed = true;
    expect(openToken(h.g, r.checked)).toBe('framed');
    const t = globals({ framed: () => { throw new Error('no shared.js'); } });
    expect(openToken(t.g, r.checked)).toBe('framed');
    expect(h.installs).toEqual([]);
    expect(t.installs).toEqual([]);
  });
});
