// Unit tests for logic.ts (the Ask flow):
// readiness, the realm rule, the exact prompt and request bodies, the stream reducer, the result-link
// rule and the hub_ask_v1 store. The module is pure; the result-link rows run next to the real
// public/auth/hub-embed-guard.js it delegates host and secret checks to (loaded as text, read-only).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect } from 'vitest';
import guardSource from '../../../public/auth/hub-embed-guard.js?raw';
import * as L0 from './logic';
import SRC from './logic.ts?raw';

const L: any = L0;
function loadGuard(): any {
  const window: any = {};
  new Function('window', guardSource)(window);
  return window.HubEmbedGuard;
}
const G = loadGuard();
const plain = (x: any) => JSON.parse(JSON.stringify(x));

const ACCT = '1042';
const R1 = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const R2 = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const R3 = 'cccccccccccccccccccccccc';
const CAPS = ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'].map((name) => ({ name, supported: true, available: true }));
const version = (o: any = {}) => ({ api_version: '1.1.0', pinned_realm: null, capabilities: CAPS, session_protocol_version: 3, ...o });
const status = (o: any = {}) => ({
  connected: true, source: 'login', account_id: ACCT, auth_active: true, owner_fingerprint: 'fp-1',
  restriction: 'none', realm: { id: '', pinned: false }, ...o,
});
const bytes = (n: number, f = (i: number) => i) => Uint8Array.from({ length: n }, (_, i) => f(i) & 255);

// ── identifiers ──────────────────────────────────────────────────────────────
describe('identifiers come from caller-supplied random bytes', () => {
  test('keys, request ids and nonces have their fixed shapes', () => {
    expect(L.newKey(bytes(16))).toBe('hx-000102030405060708090a0b0c0d0e0f');
    expect(L.newKey(bytes(15))).toBeNull();
    expect(L.newRequestId(bytes(12, (i) => 255 - i))).toBe('hx-fffefdfcfbfaf9f8f7f6f5f4');
    expect(L.newNonce(bytes(10, (i) => i * 37))).toMatch(/^[a-z0-9]{10}$/);
    expect(L.newNonce(bytes(9))).toBeNull();
  });
});

// ── prompt ───────────────────────────────────────────────────────────────────
describe('the recipes are fixed English plus one language line', () => {
  const N = 'k3x9q2m7ab';
  test('dashboard: the agreed snapshot of real computers, exact text', () => {
    expect(L.prompt('dashboard', { nonce: N, lang: 'de', realm: 'global' })).toBe([
      'Build a one-page HTML dashboard of my Hoody computers in my account.',
      'Title it "My computers".',
      '',
      'Read my computer list once, now. Embed only these four fields per computer: its',
      'display name, its current state, its size and its server region. No other field',
      'goes into the script\'s data or the page: no server or host names, computer, project',
      'or realm IDs, addresses, links to my computers or their programs, tokens, keys,',
      'passwords or email addresses. Show the time of this snapshot.',
      '',
      'The page must be static HTML: it must not call the Hoody API, read credentials or',
      'load anything from the network when it is opened.',
      '',
      'Publish it with Hoody Exec instance 1 on this computer as a new script at',
      `api/hoody-start-${N}/dashboard.js, answering at`,
      `/api/hoody-start-${N}/dashboard. Use the default serverless mode.`,
      'The script must return the finished page as one string that starts with',
      '<!DOCTYPE html>; Exec serves that as text/html. Do not return an object such as',
      '{status, headers, body}: Exec sends any returned object as JSON.',
      'Do not replace existing files or services, and do not change link permissions.',
      '',
      'Check that the link answers with Content-Type text/html and shows the page itself, not JSON.',
      'If you cannot finish, explain what remains.',
      'End your final reply with the full HTTPS link on its own line.',
      'Reply in German.',
    ].join('\n'));
  });
  test('a named realm is never stated: the session is bound to it, and the page must carry no realm id', () => {
    expect(L.prompt('dashboard', { nonce: N, lang: 'en', realm: R1 })!.split('\n')[0])
      .toBe("Build a one-page HTML dashboard of my Hoody computers in this session's realm.");
  });
  test('no built prompt contains a 24-hex id, for any recipe, realm or language', () => {
    for (const id of ['dashboard', 'hello']) for (const realm of ['global', R1, R2]) for (const lang of ['en', 'de', 'ar', 'zht']) {
      const p = L.prompt(id, { nonce: N, lang, realm })!;
      expect(p, `${id} ${realm} ${lang}`).not.toMatch(/[0-9a-f]{24}/i);
    }
  });
  test('hello: a greeting endpoint with no account data', () => {
    const p = L.prompt('hello', { nonce: N, lang: 'ar', realm: R1 })!;
    expect(p).toContain(`/api/hoody-start-${N}/hello. Use the default serverless mode.`);
    expect(p).toContain('Do not include tokens, keys, passwords, account details, server or host names,');
    expect(p).toContain('The script must return the finished page as one string that starts with\n<!DOCTYPE html>;');
    expect(p).toContain('Exec sends any returned object as JSON.');
    expect(p.endsWith('\nReply in Arabic.')).toBe(true);
  });
  test('an unknown locale is English; the language never comes from free text', () => {
    expect(L.prompt('hello', { nonce: N, lang: 'xx', realm: 'global' })!.endsWith('Reply in English.')).toBe(true);
    expect(L.prompt('hello', { nonce: N, lang: '__proto__', realm: 'global' })!.endsWith('Reply in English.')).toBe(true);
    expect(L.prompt('hello', { nonce: N, lang: 'zht', realm: 'global' })!.endsWith('Reply in Traditional Chinese.')).toBe(true);
  });
  test('a bad nonce, recipe or realm builds no prompt', () => {
    expect(L.prompt('dashboard', { nonce: 'ABC', lang: 'en', realm: 'global' })).toBeNull();
    expect(L.prompt('dashboard', { nonce: N + '/x', lang: 'en', realm: 'global' })).toBeNull();
    expect(L.prompt('nope', { nonce: N, lang: 'en', realm: 'global' })).toBeNull();
    expect(L.prompt('hello', { nonce: N, lang: 'en', realm: 'all' })).toBeNull();
    expect(L.prompt('toString', { nonce: N, lang: 'en', realm: 'global' })).toBeNull();
  });
  test('only the dashboard needs the publication acknowledgement', () => {
    expect(L.RECIPES.dashboard.ack).toBe(true);
    expect(L.RECIPES.hello.ack).toBe(false);
  });
  test('recipe paths are namespaced by the nonce', () => {
    expect(L.recipePath('dashboard', N)).toBe(`/api/hoody-start-${N}/dashboard`);
    expect(L.recipePath('hello', 'bad')).toBeNull();
  });
  test('a custom message: non-blank, at most 4000 code points, otherwise unchanged', () => {
    expect(L.checkText('  ')).toBe('EMPTY');
    expect(L.checkText('')).toBe('EMPTY');
    expect(L.checkText(5 as any)).toBe('EMPTY');
    expect(L.checkText('x'.repeat(4000))).toBeNull();
    expect(L.checkText('x'.repeat(4001))).toBe('TOO_LONG');
    expect(L.checkText('😀'.repeat(4000))).toBeNull(); // 8000 UTF-16 units, 4000 code points
    expect(L.checkText('😀'.repeat(4001))).toBe('TOO_LONG');
    expect(plain(L.turnBody('  keep  my\nspacing '))).toEqual({ text: '  keep  my\nspacing ' });
    expect(L.turnBody('')).toBeNull();
  });
});

// ── readiness ────────────────────────────────────────────────────────────────
describe('readiness: the contract first, then the login', () => {
  test('ready reports the owner, restriction and pin', () => {
    expect(plain(L.readiness(version(), status(), ACCT))).toEqual({ state: 'ready', owner: 'fp-1', restricted: false, loginRealms: null, pinned: null });
  });
  test('each required capability must be supported AND available', () => {
    for (const name of ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding']) {
      expect(L.readiness(version({ capabilities: CAPS.filter((c) => c.name !== name) }), status(), ACCT).state).toBe('unsupported');
      expect(L.readiness(version({ capabilities: CAPS.map((c) => (c.name === name ? { ...c, available: false } : c)) }), status(), ACCT).state).toBe('unsupported');
    }
    expect(L.readiness(null, status(), ACCT).state).toBe('unsupported');
    expect(L.readiness({}, status(), ACCT).state).toBe('unsupported');
  });
  test('a protocol-2 gateway with the other three capabilities is not ready: the computer binding needs protocol 3', () => {
    for (const v of [2, 1, 0, undefined, '3', 3.5, null]) {
      const ver = version({ session_protocol_version: v });
      expect(L.protocolOk(ver), `protocol ${JSON.stringify(v)}`).toBe(false);
      expect(L.capsOk(ver)).toBe(false);
      expect(L.readiness(ver, status(), ACCT).state, `protocol ${JSON.stringify(v)}`).toBe('unsupported');
    }
    const noBinding = version({ session_protocol_version: 3, capabilities: CAPS.filter((c) => c.name !== 'computer_binding') });
    expect(L.capsOk(noBinding)).toBe(false);
    expect(L.readiness(noBinding, status(), ACCT).state).toBe('unsupported');
    const unavailable = version({ capabilities: CAPS.map((c) => (c.name === 'computer_binding' ? { ...c, available: false } : c)) });
    expect(L.readiness(unavailable, status(), ACCT).state).toBe('unsupported');
    expect(L.protocolOk(version({ session_protocol_version: 4 }))).toBe(true);
    expect(L.capsOk(version())).toBe(true);
  });
  test('another account blocks and is never replaced', () => {
    expect(L.readiness(version(), status({ account_id: '9999' }), ACCT).state).toBe('otherAccount');
    expect(L.readiness(version(), status({ account_id: 9999 }), ACCT).state).toBe('otherAccount');
    // A rejected login of another account still blocks: bootstrap would be agent_login_conflict.
    expect(L.readiness(version(), status({ account_id: '9999', last_error: { credential_rejected: true } }), ACCT).state).toBe('otherAccount');
  });
  test('a signed-out agent that still names another account is refused, never offered a sign-in', () => {
    expect(L.readiness(version(), status({ auth_active: false, account_id: '9999' }), ACCT).state).toBe('otherAccount');
    expect(L.readiness(version(), status({ auth_active: false, account_id: ACCT }), ACCT).state).toBe('login');
    expect(L.readiness(version(), status({ auth_active: false, account_id: '' }), ACCT).state).toBe('login');
  });
  test('connected:true alone is not enough: identity, owner and restriction must be known', () => {
    expect(L.readiness(version(), status({ account_id: undefined }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), status({ owner_fingerprint: undefined }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), status({ owner_fingerprint: '' }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), status({ identity_unavailable: true }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), status({ restriction: 'unknown' }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), status({ restriction: undefined }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), status({ restriction: 'realms', realm_ids: [] }), ACCT).state).toBe('identity');
    expect(L.readiness(version(), null, ACCT).state).toBe('identity');
    expect(L.readiness(version(), status(), '').state).toBe('identity');
  });
  test('a logged-out agent is login; a rejected same-account login is a renewal', () => {
    expect(plain(L.readiness(version(), status({ auth_active: false, account_id: undefined, owner_fingerprint: undefined }), ACCT))).toEqual({ state: 'login', renew: false, pinned: null });
    expect(plain(L.readiness(version(), status({ last_error: { credential_rejected: true, code: 'hoody_auth_expired' } }), ACCT))).toEqual({ state: 'login', renew: true, pinned: null });
    expect(L.readiness(version({ pinned_realm: R1 }), status({ auth_active: false }), ACCT).pinned).toBe(R1);
    expect(L.readiness(version(), status({ account_id: undefined, last_error: { credential_rejected: true } }), ACCT).state).toBe('identity');
  });
  test('a realm-limited login reports its realms; a pin comes from /version or status', () => {
    const r = L.readiness(version(), status({ restriction: 'realms', realm_ids: [R1, 'junk', R2] }), ACCT);
    expect(plain(r)).toEqual({ state: 'ready', owner: 'fp-1', restricted: true, loginRealms: [R1, R2], pinned: null });
    expect(L.readiness(version({ pinned_realm: R1 }), status(), ACCT).pinned).toBe(R1);
    expect(L.readiness(version(), status({ realm: { id: R2, pinned: true } }), ACCT).pinned).toBe(R2);
    expect(L.readiness(version(), status({ realm: { id: R2, pinned: false } }), ACCT).pinned).toBeNull();
    expect(L.readiness(version({ pinned_realm: 'all' }), status(), ACCT).pinned).toBeNull();
  });
});

// ── realm auth ───────────────────────────────────────────────────────────────
describe('realm auth: signed in is not enough; the realm token decides', () => {
  const ok = { ok: true }, fail = (status: number, code = 'bad_request') => ({ ok: false, e: { status, code } });
  const by = (row: unknown) => ({ realm_isolation_by_realm: { [R1]: row } });
  test('Global needs no realm token, with or without a probe', () => {
    expect(L.realmAuth(null, 'global', null)).toBe('ok');
    expect(L.realmAuth(null, '', null)).toBe('ok');
  });
  test('a 24-hex realm without its probe is undecided: the probe must run', () => {
    expect(L.realmAuth({}, R1, null)).toBe('read');
  });
  test('the probe answered and the realm is not reported unavailable: ok (active, degraded, or no entry)', () => {
    expect(L.realmAuth(by({ state: 'active' }), R1, ok)).toBe('ok');
    expect(L.realmAuth({ realm_isolation: 'degraded' }, R1, ok)).toBe('ok');
    expect(L.realmAuth({}, R1, ok)).toBe('ok');
    expect(L.realmAuth({ realm_isolation_by_realm: { [R2]: { state: 'unavailable' } } }, R1, ok)).toBe('ok');
  });
  test('a refused realm token is a same-account sign-in: a 4xx probe with no entry, or the realm unavailable', () => {
    expect(L.realmAuth({}, R1, fail(400))).toBe('renew');
    expect(L.realmAuth({}, R1, fail(409, 'hoody_auth_expired'))).toBe('renew');
    expect(L.realmAuth({}, R1, fail(403, 'realm_not_allowed'))).toBe('renew');
    expect(L.realmAuth(by({ state: 'unavailable', reason: 'creator_ceiling_insufficient' }), R1, fail(400))).toBe('renew');
    expect(L.realmAuth(by({ state: 'unavailable', reason: 'login_lifetime_too_short' }), R1, ok)).toBe('renew');
  });
  test('the one reason a new login cannot fix is "update", whatever the probe said', () => {
    expect(L.realmAuth(by({ state: 'unavailable', reason: 'sidecar_permissions_mismatch' }), R1, fail(400))).toBe('update');
    expect(L.realmAuth(by({ state: 'unavailable', reason: 'sidecar_permissions_mismatch' }), R1, ok)).toBe('update');
    expect(L.realmAuth(by({ state: 'active', reason: 'sidecar_permissions_mismatch' }), R1, ok)).toBe('ok');
  });
  test('a probe that never reached a decision is left to the read rules, never a sign-in', () => {
    for (const st of [0, 429, 404, 405, 500, 502, 503, 504]) expect(L.realmAuth({}, R1, fail(st))).toBe('read');
    expect(L.realmAuth({}, R1, fail(403, 'forbidden'))).toBe('read');
    expect(L.realmAuth({}, R1, { ok: false, e: { pending: true } })).toBe('read');
    expect(L.realmAuth({}, R1, { ok: false, e: { stale: true } })).toBe('read');
    expect(L.realmAuth({}, R1, { ok: false, e: { superseded: true } })).toBe('read');
    expect(L.realmAuth({}, R1, { ok: false })).toBe('read');
  });
  test('only a 4xx refusal is a sign-in: 1xx, 2xx and 3xx probe failures (302, 304) are read failures', () => {
    for (const st of [100, 200, 204, 301, 302, 304, 307, 399]) expect(L.realmAuth({}, R1, fail(st))).toBe('read');
    expect(L.realmAuth(by({ state: 'unavailable', reason: 'creator_ceiling_insufficient' }), R1, fail(302))).toBe('read');
    expect(L.realmAuth({}, R1, fail(400))).toBe('renew');
    expect(L.realmAuth({}, R1, fail(499, 'x'))).toBe('renew');
  });
  test('probeFault names only a probe failure that decides nothing: excluded codes, never a refusal', () => {
    for (const st of [0, 302, 304, 404, 405, 429, 500, 503]) expect(L.probeFault({ ok: false, e: { status: st } })).toBe(true);
    expect(L.probeFault({ ok: false, e: { status: 403, code: 'forbidden' } })).toBe(true);
    expect(L.probeFault({ ok: false, e: { stale: true } })).toBe(true);
    expect(L.probeFault({ ok: false })).toBe(true);
    expect(L.probeFault(null)).toBe(true);
    expect(L.probeFault({ ok: true })).toBe(false);
    expect(L.probeFault({ ok: false, e: { status: 400, code: 'bad_request' } })).toBe(false);
    expect(L.probeFault({ ok: false, e: { status: 403, code: 'realm_not_allowed' } })).toBe(false);
  });
  test('an inherited key is not a realm row', () => {
    const s = Object.create({ [R1]: { state: 'unavailable', reason: 'sidecar_permissions_mismatch' } });
    expect(L.realmAuth({ realm_isolation_by_realm: s }, R1, ok)).toBe('ok');
  });
});

// ── realm rule ───────────────────────────────────────────────────────────────
describe('realm rule: never "all", never a silent pick', () => {
  const base = { restricted: false, loginRealms: null, pinned: null, computerRealms: [R1, R2] };
  const cases: [string, any, any][] = [
    ['named realm, member, unrestricted', { selected: R1 }, { realm: R1 }],
    ['named realm, not a member', { selected: R3 }, { error: 'NOT_MEMBER' }],
    ['named realm, membership unknown', { selected: R1, computerRealms: null }, { error: 'UNKNOWN' }],
    ['named realm, another pin', { selected: R1, pinned: R2 }, { error: 'PINNED', pinned: R2 }],
    ['named realm, the pin itself', { selected: R2, pinned: R2 }, { realm: R2 }],
    ['named realm outside a limited login', { selected: R2, restricted: true, loginRealms: [R1] }, { error: 'NOT_ALLOWED' }],
    ['Global named, unrestricted', { selected: 'global', computerRealms: [] }, { realm: 'global' }],
    ['Global named under a limited login', { selected: 'global', restricted: true, loginRealms: [R1] }, { error: 'NOT_ALLOWED' }],
    ['Global named, another pin', { selected: 'global', pinned: R1 }, { error: 'PINNED', pinned: R1 }],
    ['Global named, pinned Global', { selected: 'global', pinned: 'global' }, { realm: 'global' }],
    ['All, unpinned, unrestricted → Global, shown', { selected: 'all' }, { realm: 'global', shown: true }],
    ['All, pinned', { selected: 'all', pinned: R1 }, { realm: R1, shown: true }],
    ['All, pinned to a realm the computer is not in', { selected: 'all', pinned: R3 }, { error: 'NOT_MEMBER' }],
    ['All, pinned Global', { selected: 'all', pinned: 'global', computerRealms: [] }, { realm: 'global', shown: true }],
    ['All, pinned Global under a limited login', { selected: 'all', pinned: 'global', restricted: true, loginRealms: [R1] }, { error: 'NOT_ALLOWED' }],
    ['All, limited login, one shared realm → it, shown', { selected: 'all', restricted: true, loginRealms: [R2, R3] }, { realm: R2, shown: true }],
    ['All, limited login, two shared realms → a choice', { selected: 'all', restricted: true, loginRealms: [R1, R2] }, { choices: [R1, R2] }],
    ['All, limited login, a valid pick', { selected: 'all', restricted: true, loginRealms: [R1, R2], picked: R2 }, { realm: R2, shown: true }],
    ['All, limited login, a pick outside the choice', { selected: 'all', restricted: true, loginRealms: [R1, R2], picked: R3 }, { error: 'UNKNOWN' }],
    ['All, limited login, nothing shared', { selected: 'all', restricted: true, loginRealms: [R3] }, { error: 'NONE' }],
    ['All, limited login, computer realms unknown', { selected: 'all', restricted: true, loginRealms: [R1], computerRealms: null }, { error: 'UNKNOWN' }],
    ['a malformed selection', { selected: 'ALL' }, { error: 'UNKNOWN' }],
    ['a malformed pin', { selected: 'all', pinned: 'x' }, { error: 'UNKNOWN' }],
  ];
  for (const [name, input, want] of cases) {
    test(name, () => { expect(plain(L.realmFor({ ...base, ...input }))).toEqual(want); });
  }
  test('no outcome is ever the string "all"', () => {
    for (const [, input] of cases) expect(L.realmFor({ ...base, ...input }).realm).not.toBe('all');
  });
});

// ── request bodies ───────────────────────────────────────────────────────────
describe('request bodies are exact', () => {
  test('create carries the explicit container binding', () => {
    expect(plain(L.createBody(R1, 'c-77'))).toEqual({
      realm: R1, computer: 'c-77', tool_mode: 'standard', dir_scope: 'home', approval: { mode: 'default' },
      expected_binding: { realm: R1, computer: 'c-77' },
    });
    expect(L.createBody('all', 'c-77')).toBeNull();
    expect(L.createBody(R1, '../x')).toBeNull();
    expect(L.createBody(R1, '')).toBeNull();
  });
  test('create never follows the realm\'s backend; a third argument that is not options builds today\'s body', () => {
    const base = plain(L.createBody(R1, 'c-77'));
    expect(base).not.toHaveProperty('follow_realm_backend');
    for (const f of [true, false, undefined, null, 1, 'true', {}]) expect(plain(L.createBody(R1, 'c-77', f as any)), String(f)).toEqual(base);
    expect(L.createBody('all', 'c-77', {})).toBeNull();
    expect(L.createBody(R1, '../x', {})).toBeNull();
  });
  test('capOn: a capability counts only when /version lists it as supported and available', () => {
    const v = (c: any) => version({ capabilities: [...CAPS, c] });
    expect(L.capOn(v({ name: 'acp_default', supported: true, available: true }), 'acp_default')).toBe(true);
    expect(L.capOn(v({ name: 'acp_default', supported: true, available: false }), 'acp_default')).toBe(false);
    expect(L.capOn(v({ name: 'acp_default', supported: false, available: true }), 'acp_default')).toBe(false);
    expect(L.capOn(v({ name: 'acp_default', supported: 'true', available: 'true' }), 'acp_default')).toBe(false);
    expect(L.capOn(v({ name: 'acp_defaults', supported: true, available: true }), 'acp_default')).toBe(false);
    expect(L.capOn(version(), 'acp_default')).toBe(false);
    expect(L.capOn(null, 'acp_default')).toBe(false);
    expect(L.capOn({ capabilities: 'acp_default' }, 'acp_default')).toBe(false);
    expect(L.capOn(version(), 'session_state')).toBe(true);
  });
  test('the created session must report the captured realm, computer and owner', () => {
    const want = { realm: R1, container: 'c-77', owner: 'fp-1' };
    const ok = { session_id: 's-1', started: { realm_selector: R1, computer_id: 'c-77', owner_fingerprint: 'fp-1' } };
    const nocontainer = (): any => { const { computer_id: _c, ...rest } = ok.started; return { ...ok, started: rest }; };
    expect(L.checkStarted(ok, want)).toBeNull();
    expect(L.checkStarted({ ...ok, started: { ...ok.started, computer_id: '' } }, want)).toBeNull(); // the agent's self spelling
    expect(L.checkStarted(nocontainer(), want), 'an omitted computer_id is the self spelling (omitempty)').toBeNull();
    // Well-formed evidence for another binding: MISMATCH.
    expect(L.checkStarted({ ...ok, started: { ...ok.started, computer_id: 'c-78' } }, want)).toBe('MISMATCH');
    expect(L.checkStarted({ ...ok, started: { ...ok.started, realm_selector: R2 } }, want)).toBe('MISMATCH');
    expect(L.checkStarted({ ...ok, started: { ...ok.started, owner_fingerprint: 'fp-2' } }, want)).toBe('MISMATCH');
    // Evidence that is absent or ill-typed proves nothing: MISSING.
    expect(L.checkStarted({ ...ok, started: { ...ok.started, realm_selector: '' } }, want)).toBe('MISSING');
    expect(L.checkStarted({ ...ok, started: { ...ok.started, realm_selector: undefined } }, want)).toBe('MISSING');
    expect(L.checkStarted({ ...ok, started: { ...ok.started, realm_selector: 5 } }, want)).toBe('MISSING');
    for (const c of [7, null, {}, [], true]) expect(L.checkStarted({ ...ok, started: { ...ok.started, computer_id: c } }, want), `computer_id ${JSON.stringify(c)}`).toBe('MISSING');
    // The retired container_id is never an identity. A reply carrying it is not evidence of the binding, whatever it names:
    // not the self spelling, not a mismatch (the base said MISMATCH for another id; the rename must not turn that into a pass).
    const { computer_id: _drop, ...bare } = ok.started;
    for (const c of ['c-77', 'computer-B', 'c-78', '', 7, null, {}, []]) {
      expect(L.checkStarted({ ...ok, started: { ...bare, container_id: c } }, want), `container_id ${JSON.stringify(c)} alone`).toBe('MISSING');
      expect(L.checkStarted({ ...ok, started: { ...ok.started, container_id: c } }, want), `both spellings, container_id ${JSON.stringify(c)}`).toBe('MISSING');
    }
    expect(L.checkStarted({ ...ok, started: { ...ok.started, owner_fingerprint: undefined } }, want)).toBe('MISSING');
    expect(L.checkStarted({ ...ok, started: { ...ok.started, owner_fingerprint: 5 } }, want)).toBe('MISSING');
    expect(L.checkStarted({ ...ok, session_id: '../../x' }, want)).toBe('MISSING');
    expect(L.checkStarted({ session_id: 's-1' }, want)).toBe('MISSING');
    expect(L.checkStarted({ ...ok, started: 'yes' }, want)).toBe('MISSING');
    expect(L.checkStarted(null, want)).toBe('MISSING');
    const g = { realm: 'global', container: 'c-77', owner: 'fp-1' };
    for (const rs of ['global', 'GLOBAL', ' Global ']) expect(L.checkStarted({ ...ok, started: { ...ok.started, realm_selector: rs } }, g), rs).toBeNull();
    for (const rs of ['', undefined]) expect(L.checkStarted({ ...ok, started: { ...ok.started, realm_selector: rs } }, g), `a Global slot never reads ${JSON.stringify(rs)} as global`).toBe('MISSING');
    expect(L.checkStarted(ok, g)).toBe('MISMATCH');
  });
  const gate = { kind: 'confirm', id: 'g-3', generation: 7, offerSession: false };
  const RQ = 'hx-0123456789abcdef01234567';
  test('Allow once is one-shot and names the gate the person saw', () => {
    expect(plain(L.confirmBody(gate, 'once', RQ))).toEqual({ gate_id: 'g-3', generation: 7, approved: true, remember: false, request_id: RQ });
  });
  test('Deny keeps the identity; a reason only on denial and only up to 500 code points', () => {
    expect(plain(L.confirmBody(gate, 'deny', RQ))).toEqual({ gate_id: 'g-3', generation: 7, approved: false, remember: false, request_id: RQ });
    expect(L.confirmBody(gate, 'deny', RQ, 'not now').reason).toBe('not now');
    expect(L.confirmBody(gate, 'once', RQ, 'not now').reason).toBeUndefined();
    expect(L.confirmBody(gate, 'deny', RQ, 'x'.repeat(501))).toBeNull();
  });
  test('Allow for this session only when the gate offers it', () => {
    expect(L.confirmBody(gate, 'session', RQ)).toBeNull();
    expect(plain(L.confirmBody({ ...gate, offerSession: true }, 'session', RQ)))
      .toEqual({ gate_id: 'g-3', generation: 7, approved: true, remember: false, request_id: RQ, session_scope: true });
  });
  test('never persist_dirs or trust_computer, whatever the gate offers', () => {
    for (const c of ['once', 'session', 'deny']) {
      const b = L.confirmBody({ ...gate, offerSession: true, dirAccess: true }, c, RQ) || {};
      expect(Object.keys(b).some((k) => k === 'persist_dirs' || k === 'trust_computer')).toBe(false);
    }
  });
  test('a confirm needs a string gate id, a generation and a request id', () => {
    expect(L.confirmBody({ ...gate, id: 3 }, 'once', RQ)).toBeNull();
    expect(L.confirmBody({ ...gate, generation: -1 }, 'once', RQ)).toBeNull();
    expect(L.confirmBody({ ...gate, generation: undefined }, 'once', RQ)).toBeNull();
    expect(L.confirmBody(gate, 'once', 'bad id')).toBeNull();
    expect(L.confirmBody({ ...gate, kind: 'question' }, 'once', RQ)).toBeNull();
    expect(L.confirmBody(gate, 'always', RQ)).toBeNull();
  });
  test('questions: one answer, or every field of a batch', () => {
    const q = { kind: 'question', id: 'q-1', generation: 2 };
    expect(plain(L.answerBody(q, 'Blue'))).toEqual({ gate_id: 'q-1', generation: 2, answer: 'Blue' });
    expect(L.answerBody(q, '  ')).toBeNull();
    const qb = { ...q, questions: [{ id: 'name' }, { id: 'size' }] };
    expect(plain(L.answerBody(qb, { name: 'Shop', size: 'M' }))).toEqual({ gate_id: 'q-1', generation: 2, answers: { name: 'Shop', size: 'M' } });
    expect(L.answerBody(qb, { name: 'Shop' })).toBeNull();
    expect(L.answerBody(qb, 'Shop')).toBeNull();
  });
  test('cancel names the turn only', () => {
    expect(plain(L.cancelBody('turn-1'))).toEqual({ turn_id: 'turn-1' });
    expect(L.cancelBody('a/b')).toBeNull();
  });
  test('a receipt stream_url is accepted only as this session\'s own stream route', () => {
    expect(plain(L.streamCursor('/api/v1/agent/sessions/s-1/stream?since=40&incarnation=inc-2', 's-1'))).toEqual({ since: 40, incarnation: 'inc-2' });
    for (const u of [
      'https://evil.test/api/v1/agent/sessions/s-1/stream?since=40&incarnation=inc-2',
      '/api/v1/agent/sessions/s-2/stream?since=40&incarnation=inc-2',
      '/api/v1/agent/sessions/s-1/stream?since=40&incarnation=inc-2&x=1',
      '/api/v1/agent/sessions/s-1/stream?since=-1&incarnation=inc-2',
      '//evil.test/api/v1/agent/sessions/s-1/stream?since=1&incarnation=a',
    ]) expect(L.streamCursor(u, 's-1')).toBeNull();
    expect(L.streamPath('s-1', { since: 40, incarnation: 'inc-2' })).toBe('/sessions/s-1/stream?since=40&incarnation=inc-2');
    expect(L.streamPath('s-1', null)).toBe('/sessions/s-1/stream');
    expect(L.streamPath('s/1', null)).toBeNull();
  });
});

// ── reducer ──────────────────────────────────────────────────────────────────
let SEQ = 0;
const env = (type: string, data: any, o: any = {}) => ({ seq: o.seq ?? ++SEQ, incarnation: o.inc ?? 'i1', turn_id: o.turn ?? 'T1', ...(o.gate ? { gate: o.gate } : {}), event: { type, data } });
const frame = (e: any) => ({ type: 'frame', name: e.event.type.slice(6), data: e });
const run = (s: any, ...as: any[]) => as.reduce((x, a) => L.reduce(x, a), s);
const started = () => run(L.initial(), { type: 'turn', turnId: 'T1' });

describe('reducer: frames for this turn only, each once', () => {
  test('text concatenates; only the response after the last tool call is final', () => {
    const s = run(started(),
      frame(env('event.stream_chunk', { text: 'Let me look. ' })),
      frame(env('event.tool_call', { tool_id: 't1', name: 'bash', summary: '$ ls' })),
      frame(env('event.tool_result', { tool_id: 't1', is_error: false })),
      frame(env('event.stream_chunk', { text: 'Done.\n' })),
      frame(env('event.stream_chunk', { text: 'https://x' })));
    expect(L.reply(s)).toBe('Done.\nhttps://x');
    expect(plain(s.steps)).toEqual([{ id: 't1', name: 'bash', summary: '$ ls', ok: true, n: 0, seg: 1 }]);   // seg 1: the reply after it
    expect(L.phase(s)).toBe('working');
  });
  test('frames of another turn, or none, are ignored', () => {
    const s = run(started(),
      frame(env('event.stream_chunk', { text: 'mine' })),
      frame(env('event.stream_chunk', { text: 'theirs' }, { turn: 'T9' })),
      frame(env('event.agent_done', { outcome: 'completed' }, { turn: 'T9' })),
      frame({ seq: ++SEQ, incarnation: 'i1', event: { type: 'event.stream_chunk', data: { text: 'idle' } } }));
    expect(L.reply(s)).toBe('mine');
    expect(s.done).toBeNull();
  });
  test('a repeated or older seq is applied once', () => {
    const e = env('event.stream_chunk', { text: 'a' });
    const s = run(started(), frame(e), frame(e), frame({ ...e, seq: e.seq - 1 }));
    expect(L.reply(s)).toBe('a');
  });
  test('the SSE name must match the payload type', () => {
    const e = env('event.stream_chunk', { text: 'a' });
    expect(L.reply(run(started(), { type: 'frame', name: 'tool_call', data: e }))).toBe('');
  });
  test('frames before the turn id is known are buffered, then applied for that turn only', () => {
    const a = env('event.stream_chunk', { text: 'early ' });
    const b = env('event.stream_chunk', { text: 'other' }, { turn: 'T0' });
    let s = run(L.initial(), frame(a), frame(b));
    expect(L.reply(s)).toBe('');
    s = run(s, { type: 'turn', turnId: 'T1' }, frame(env('event.stream_chunk', { text: 'late' })));
    expect(L.reply(s)).toBe('early late');
    expect(run(s, { type: 'turn', turnId: 'T2' }).turnId).toBe('T1');
  });
  test('a full buffer asks for a resync instead of growing', () => {
    let s = L.initial();
    for (let i = 0; i < 520; i++) s = L.reduce(s, frame(env('event.stream_chunk', { text: 'x' })));
    expect(s.buffer.length).toBe(512);
    expect(s.resync).toBe(true);
  });
  test('a new incarnation resets the cursor and asks for a resync', () => {
    let s = run(started(), frame(env('event.stream_chunk', { text: 'a' }, { seq: 50 })));
    s = run(s, frame(env('event.stream_chunk', { text: 'b' }, { seq: 1, inc: 'i2' })));
    expect(s.inc).toBe('i2');
    expect(s.seq).toBe(1);
    expect(s.resync).toBe(true);
    expect(L.reply(s)).toBe('ab');
  });
  test('lagged with replay_gap marks a history gap; end is not completion', () => {
    let s = run(started(), { type: 'frame', name: 'lagged', data: { code: 'replay_gap', min_seq: 9 } });
    expect(s.resync && s.gap).toBe(true);
    s = run(started(), { type: 'frame', name: 'end', data: {} });
    expect(s.ended).toBe(true);
    expect(L.phase(s)).toBe('working');
    expect(run(s, { type: 'resynced' }).ended).toBe(false);
  });
  test('error is not terminal; stream_done is not completion', () => {
    const s = run(started(),
      frame(env('event.error', { code: 'rate_limit', retry_at: '2026-10-20T10:00:00Z', message: 'x' })),
      frame(env('event.stream_done', { cost_usd: 0.25 })),
      frame(env('event.stream_done', { cost_usd: 1, background: true })),
      frame(env('event.stream_done', { cost_usd: 0.5 })));
    expect(plain(s.error)).toEqual({ code: 'rate_limit', retryAt: '2026-10-20T10:00:00Z' });
    expect(s.cost).toBe(0.75);
    expect(L.phase(s)).toBe('working');
    expect(run(s, frame(env('event.error', { retry_at: 'tomorrow' }))).error.retryAt).toBeNull();
  });
  describe('usage responses: the token counts of each foreground response', () => {
    const counts = (n: number) => ({ input_tokens: 10 * n, output_tokens: n, cache_read_tokens: 100 * n, cache_creation_tokens: 7 * n });
    test('each foreground stream_done adds one response, in order; cache_creation_tokens is the cacheWrite', () => {
      const s = run(started(), frame(env('event.stream_done', { cost_usd: 0.25, ...counts(1) })), frame(env('event.stream_done', { cost_usd: 0.5, ...counts(2) })));
      expect(plain(s.responses)).toEqual([{ input: 10, output: 1, cacheRead: 100, cacheWrite: 7 }, { input: 20, output: 2, cacheRead: 200, cacheWrite: 14 }]);
      expect(s.responsesSkipped).toBe(0);
    });
    test('a background or helper response is neither kept nor counted as skipped', () => {
      const s = run(started(), frame(env('event.stream_done', { cost_usd: 1, background: true, ...counts(1) })), frame(env('event.stream_done', { cost_usd: 1, helper_id: 'h1', ...counts(2) })));
      expect(s.responses).toEqual([]);
      expect(s.responsesSkipped).toBe(0);
    });
    test('a missing, negative, fractional, text or unsafe count skips the whole response and flags it; nothing is guessed', () => {
      const bad: Array<Record<string, unknown>> = [
        { ...counts(1), cache_creation_tokens: undefined },
        { ...counts(1), input_tokens: -1 },
        { ...counts(1), output_tokens: 1.5 },
        { ...counts(1), cache_read_tokens: '7' },
        { ...counts(1), input_tokens: null },
        { ...counts(1), output_tokens: Number.MAX_SAFE_INTEGER + 2 },
        {},
      ];
      const s = run(started(), ...bad.map((d) => frame(env('event.stream_done', d))), frame(env('event.stream_done', counts(3))));
      expect(plain(s.responses)).toEqual([{ input: 30, output: 3, cacheRead: 300, cacheWrite: 21 }]);
      expect(s.responsesSkipped).toBe(bad.length);
    });
    test('the cost line is byte-identical with or without counts on the frames [pin]', () => {
      const frames = (withCounts: boolean) => [
        frame(env('event.stream_done', { cost_usd: 0.25, ...(withCounts ? counts(1) : {}) })),
        frame(env('event.stream_done', { cost_usd: 1, background: true, ...(withCounts ? counts(2) : {}) })),
        frame(env('event.stream_done', { cost_usd: 0.5, helper_id: 'h', ...(withCounts ? counts(3) : {}) })),
        frame(env('event.stream_done', { cost_usd: 0.125, ...(withCounts ? { ...counts(4), output_tokens: -1 } : {}) })),
        frame(env('event.stream_done', { ...(withCounts ? counts(5) : {}) })),
        frame(env('event.stream_done', { cost_usd: -3, ...(withCounts ? counts(6) : {}) })),
      ];
      SEQ = 5000; const a = run(started(), ...frames(true));
      SEQ = 5000; const b = run(started(), ...frames(false));
      expect(a.cost).toBe(0.375);
      expect(b.cost).toBe(0.375);
      const strip = (x: any) => { const rest = plain(x); delete rest.responses; delete rest.responsesSkipped; return rest; };
      expect(strip(a)).toEqual(strip(b));
    });
    test('a usage_only stream_done is a turn total, not a request: neither kept nor counted as skipped, and its cost still counts', () => {
      const s = run(started(), frame(env('event.stream_done', { cost_usd: 0.5, usage_only: true, ...counts(3) })), frame(env('event.stream_done', { cost_usd: 0.25, ...counts(1) })));
      expect(plain(s.responses)).toEqual([{ input: 10, output: 1, cacheRead: 100, cacheWrite: 7 }]);
      expect(s.responsesSkipped).toBe(0);
      expect(s.cost).toBe(0.75);
    });
    test('a new incarnation clears the old history\'s responses: a replay of the same turn after the change does not append to them', () => {
      const old = run(started(), frame(env('event.stream_done', counts(1), { seq: 1 })), frame(env('event.stream_done', { ...counts(2), output_tokens: -1 }, { seq: 2 })));
      expect(old.responses).toHaveLength(1);
      expect(old.responsesSkipped).toBe(1);
      const after = run(old, frame(env('event.stream_done', counts(3), { seq: 1, inc: 'i2' })));
      expect(plain(after.responses)).toEqual([{ input: 30, output: 3, cacheRead: 300, cacheWrite: 21 }]);
      expect(after.responsesSkipped).toBe(0);
      expect(after.inc).toBe('i2');
      const again = run(after, frame(env('event.stream_done', counts(3), { seq: 1, inc: 'i2' })));
      expect(again.responses).toHaveLength(1);
    });
    test('a frame seen twice (same incarnation and seq) is one response; the next turn starts empty; a later frame never changes an earlier state', () => {
      const f = frame(env('event.stream_done', counts(1), { seq: 900 }));
      const once = run(started(), f);
      const twice = run(once, f);
      expect(twice.responses).toHaveLength(1);
      const more = run(once, frame(env('event.stream_done', counts(2))));
      expect(once.responses).toHaveLength(1);
      expect(more.responses).toHaveLength(2);
      const next = L.nextTurn(more, { turnId: 'T2' });
      expect(next.responses).toEqual([]);
      expect(next.responsesSkipped).toBe(0);
    });
  });
  test('agent_done and turn_discarded only lead to the receipt', () => {
    expect(L.phase(run(started(), frame(env('event.agent_done', { outcome: 'completed' }))))).toBe('finishing');
    expect(L.phase(run(started(), frame(env('event.turn_discarded', {}))))).toBe('finishing');
  });
  test('the receipt decides the outcome, for this turn only', () => {
    let s = run(started(), frame(env('event.agent_done', { outcome: 'completed' })));
    s = run(s, { type: 'receipt', body: { turn_id: 'T9', state: 'failed' } });
    expect(L.phase(s)).toBe('finishing');
    s = run(s, { type: 'receipt', body: { turn_id: 'T1', state: 'dispatched' } });
    expect(L.phase(s)).toBe('finishing');
    for (const st of ['completed', 'failed', 'cancelled', 'interrupted']) {
      expect(L.phase(run(s, { type: 'receipt', body: { turn_id: 'T1', state: st } }))).toBe(st);
    }
    const f = run(s, { type: 'receipt', body: { turn_id: 'T1', state: 'interrupted', effects_may_have_occurred: true, error_code: 'x', retry_at: 'junk' } });
    expect(plain(f.terminal)).toEqual({ state: 'interrupted', code: 'x', retryAt: null, effects: true });
  });
  test('Stop shows stopping until a terminal receipt', () => {
    let s = run(started(), { type: 'stop' });
    expect(L.phase(s)).toBe('stopping');
    s = run(s, { type: 'receipt', body: { turn_id: 'T1', state: 'cancelled' } });
    expect(L.phase(s)).toBe('cancelled');
    expect(s.stopping).toBe(false);
    expect(run(L.initial(), { type: 'stop' }).stopping).toBe(false);
  });
  test('a refused Stop clears stopping only for the turn it named, and never a finished one', () => {
    const stopping = run(started(), { type: 'stop' });
    expect(stopping.stopping).toBe(true);
    // The refusal of an earlier turn's Stop (it came after that turn ended and T1 began) is not about T1.
    expect(run(stopping, { type: 'stopRefused', turnId: 'T0' }).stopping, 'another turn\'s refusal changes nothing').toBe(true);
    expect(run(stopping, { type: 'stopRefused', turnId: '' }).stopping).toBe(true);
    expect(run(stopping, { type: 'stopRefused', turnId: null }).stopping, 'a refusal naming no turn changes nothing').toBe(true);
    // The refusal of T1's own Stop: Stop shows again.
    const back = run(stopping, { type: 'stopRefused', turnId: 'T1' });
    expect(back.stopping).toBe(false);
    expect(L.phase(back)).toBe('working');
    // A turn that already ended keeps its terminal state whatever a refusal says.
    const ended = run(stopping, { type: 'receipt', body: { turn_id: 'T1', state: 'cancelled' } });
    const again = run(ended, { type: 'stopRefused', turnId: 'T1' });
    expect(again.terminal).toEqual(ended.terminal);
    expect(again.stopping).toBe(false);
  });
  test('steps are bounded; the total keeps counting', () => {
    let s = started();
    for (let i = 0; i < 230; i++) s = L.reduce(s, frame(env('event.tool_call', { tool_id: 't' + i, name: 'bash' })));
    expect(s.steps.length).toBe(200);
    expect(s.stepsTotal).toBe(230);
    expect(s.steps[0].id).toBe('t30');
  });
  test('the reply is bounded', () => {
    let s = started();
    const big = 'y'.repeat(150000);
    s = run(s, frame(env('event.stream_chunk', { text: big })), frame(env('event.stream_chunk', { text: big })));
    expect(s.replyLen).toBe(200000);
    expect(s.cut).toBe(true);
  });
  test('helper frames never become the reply', () => {
    const s = run(started(), frame(env('event.stream_chunk', { text: 'helper says', helper_id: 'h1' })));
    expect(L.reply(s)).toBe('');
  });
});

describe('reducer: gates', () => {
  const ref = { id: 'g-5', generation: 3, type: 'confirm', gate_cause: 'static_stakes', risk: 'write', human_only: false };
  const confirm = (o: any = {}, r: any = ref) => frame(env('event.confirm_request', { tool_name: 'bash', params: { command: 'rm -rf /tmp/x' }, detail: '```\nrm\n```', gate_id: 41, generation: 0, lease_required: false, ...o }, { gate: r }));
  test('the gate identity is the envelope string id, never the payload number', () => {
    const s = run(started(), confirm());
    expect(L.phase(s)).toBe('waiting');
    expect(s.gate.id).toBe('g-5');
    expect(s.gate.generation).toBe(3);
    expect(s.gate.dnum).toBe(41);
    expect(L.confirmBody(s.gate, 'once', 'hx-0123456789abcdef01234567').gate_id).toBe('g-5');
  });
  test('a confirm without an envelope gate cannot be answered and asks for /state', () => {
    const s = run(started(), frame(env('event.confirm_request', { tool_name: 'bash', gate_id: 41 })));
    expect(s.gate.invalid).toBe(true);
    expect(s.resync).toBe(true);
    expect(L.confirmBody(s.gate, 'once', 'hx-0123456789abcdef01234567')).toBeNull();
  });
  test('directory gates and session offers are recognised', () => {
    const s = run(started(), confirm({ requested_dirs: ['/srv/a'], offer_session_allow: true }, { ...ref, gate_cause: 'dir_access' }));
    expect(s.gate.dirAccess).toBe(true);
    expect(s.gate.offerSession).toBe(true);
  });
  test('a gate that requires an approver lease is blocked for the Hub', () => {
    expect(run(started(), confirm({ lease_required: true })).gate.blocked).toBe('policy');
  });
  test('gate_resolved clears only the matching daemon gate', () => {
    let s = run(started(), confirm());
    s = run(s, frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 40, outcome: 'answered' })));
    expect(s.gate).not.toBeNull();
    s = run(s, frame(env('event.gate_resolved', { kind: 'question', question_id: 41, outcome: 'answered' })));
    expect(s.gate).not.toBeNull();
    s = run(s, { type: 'decide', requestId: 'hx-0123456789abcdef01234567' });
    s = run(s, frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 41, outcome: 'answered', request_id: 'hx-0123456789abcdef01234567', session_scope_applied: false })));
    expect(s.gate).toBeNull();
    expect(plain(s.resolved)).toEqual({ outcome: 'answered', mine: true });
    expect(s.onceOnly).toBe(true);
  });
  test('the text after a gate is a new paragraph of the same reply', () => {
    const q = { gate: { id: 'q-2', generation: 1, type: 'question' } };
    let s = run(started(), frame(env('event.stream_chunk', { text: 'Before I build it:' })),
      frame(env('event.user_question', { question: 'Which port?', options: ['8080'], question_id: 8 }, q)));
    s = run(s, frame(env('event.gate_resolved', { kind: 'question', question_id: 8, outcome: 'answered' })),
      frame(env('event.stream_chunk', { text: 'It now listens ' })), frame(env('event.stream_chunk', { text: 'on that port.' })));
    expect(L.reply(s)).toBe('Before I build it:\n\nIt now listens on that port.');
    expect(s.segs.length).toBe(1);   // still one response: the text before the gate is not moved into the trail
    // a helper's gate, a gate before any text, a break the agent already wrote: nothing added
    const h = run(started(), frame(env('event.stream_chunk', { text: 'a' })),
      frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 3, helper_id: 'h1', outcome: 'answered' })), frame(env('event.stream_chunk', { text: 'b' })));
    expect(L.reply(h)).toBe('ab');
    const first = run(started(), frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 3, outcome: 'answered' })), frame(env('event.stream_chunk', { text: 'b' })));
    expect(L.reply(first)).toBe('b');
    const own = run(started(), frame(env('event.stream_chunk', { text: 'a' })),
      frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 3, outcome: 'answered' })), frame(env('event.stream_chunk', { text: '\n\nb' })));
    expect(L.reply(own)).toBe('a\n\nb');
    // a tool call after the gate starts a new response: no break carried into it
    const tool = run(started(), frame(env('event.stream_chunk', { text: 'a' })),
      frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 3, outcome: 'answered' })),
      frame(env('event.tool_call', { tool_id: 't1', name: 'bash', summary: '$ ls' })), frame(env('event.stream_chunk', { text: 'b' })));
    expect(L.reply(tool)).toBe('b');
  });
  test('questions: options, free text and batches', () => {
    const q = (d: any) => run(started(), frame(env('event.user_question', d, { gate: { id: 'q-2', generation: 1, type: 'question' } }))).gate;
    expect(plain(q({ question: 'Which?', options: ['A', 'B', 3], question_id: 8 }))).toMatchObject({ kind: 'question', id: 'q-2', question: 'Which?', options: ['A', 'B'], dnum: 8 });
    expect(q({ question: 'Name?', options: [], placeholder: 'e.g. Shop' }).placeholder).toBe('e.g. Shop');
    expect(plain(q({ question: '', questions: [{ id: 'a', category: 'c', question: 'A?', options: ['x'] }, { id: 'b', category: 'c', question: 'B?' }] }).questions))
      .toEqual([{ id: 'a', category: 'c', question: 'A?', options: ['x'] }, { id: 'b', category: 'c', question: 'B?', options: [] }]);
    expect(q({ questions: [{ id: '../x', question: 'A?' }] }).invalid).toBe(true);
  });
  test('/state rebuilds the gate from pending_gate_ref; its pending_gate.generation is not the gate generation', () => {
    const body = { pending_gate_ref: { id: 'g-9', generation: 4, gate_cause: 'dir_access' }, pending_gate: { type: 'confirm', generation: 77, lease_required: false, tool_name: 'read_file', gate_id: 12, requested_dirs: ['/etc'] } };
    let s = run(started(), { type: 'state', body });
    expect(s.gate.id).toBe('g-9');
    expect(s.gate.generation).toBe(4);
    expect(s.gate.dnum).toBe(12);
    expect(s.gate.dirAccess).toBe(true);
    s = run(s, { type: 'decide', requestId: 'hx-0123456789abcdef01234567' }, { type: 'state', body });
    expect(s.decision).not.toBeNull(); // the same gate again keeps the decision in flight
    s = run(s, { type: 'state', body: { state: 'running' } });
    expect(s.gate).toBeNull();
  });
  test('decisions: 200 consumed, pending stays, a foreign resolution never re-decides', () => {
    const RQ = 'hx-0123456789abcdef01234567';
    const parked = run(started(), confirm(), { type: 'decide', requestId: RQ });
    const ID = { requestId: RQ, gateId: 'g-5', generation: 3 };
    expect(run(parked, { type: 'decided', ...ID, status: 200, body: { status: 'ok', session_scope_applied: false } }).onceOnly).toBe(true);
    expect(run(parked, { type: 'decided', ...ID, status: 200, body: {} }).gate).toBeNull();
    const pend = run(parked, { type: 'decided', ...ID, status: 409, body: { code: 'gate_decision_pending' } });
    expect(pend.decision.requestId).toBe(RQ);
    expect(pend.gate).not.toBeNull();
    const mine = run(parked, { type: 'decided', ...ID, status: 409, body: { code: 'gate_already_resolved', details: { request_id: RQ } } });
    expect(mine.gate).toBeNull();
    expect(mine.resolved.mine).toBe(true);
    const other = run(parked, { type: 'decided', ...ID, status: 409, body: { code: 'gate_already_resolved', details: { request_id: 'hx-ffffffffffffffffffffffff' } } });
    expect(other.decision).toBeNull();
    expect(other.resync).toBe(true);
    expect(other.gate).toBeNull(); // a definite refusal naming the gate gone is positive evidence: it goes at once (and is never re-answered)
    const stale = run(parked, { type: 'decided', ...ID, status: 409, body: { code: 'stale_gate' } });
    expect([stale.gate, stale.decision, stale.resync]).toEqual([null, null, true]);
    const err5 = run(parked, { type: 'decided', ...ID, status: 502, body: { code: 'upstream' } });
    expect(err5.gate).not.toBeNull(); // anything that is not a refusal naming the gate proves nothing
  });
  test('an answer is applied only to the decision it answers: a held ack for gate A never clears gate B', () => {
    const RA = 'hx-0123456789abcdef01234567', RB = 'hx-ffffffffffffffffffffffff';
    let s = run(started(), confirm(), { type: 'decide', requestId: RA });
    const forA = { requestId: RA, gateId: 'g-5', generation: 3 };
    s = run(s, confirm({ gate_id: 42 }, { ...ref, id: 'g-6', generation: 1 }), { type: 'decide', requestId: RB });
    for (const ack of [{ status: 200, body: { status: 'ok' } }, { status: 409, body: { code: 'gate_already_resolved', details: { request_id: RA } } },
      { status: 409, body: { code: 'gate_stale' } }, { status: 0, body: { code: 'unknown' } }]) {
      const t = run(s, { type: 'decided', ...forA, ...ack });
      expect([ack.status, t.gate && t.gate.id, t.decision && t.decision.requestId, !!t.resync, t.resolved]).toEqual([ack.status, 'g-6', RB, false, null]);
    }
    // an answer that names no decision, or names it with another gate or generation, is nobody's
    expect(run(s, { type: 'decided', requestId: RB, gateId: 'g-6', generation: 2, status: 200, body: {} }).gate.id).toBe('g-6');
    expect(run(s, { type: 'decided', requestId: RB, gateId: 'g-5', generation: 1, status: 200, body: {} }).gate.id).toBe('g-6');
    expect(run(s, { type: 'decided', status: 200, body: {} }).gate.id).toBe('g-6');
    // the same gate id at a new generation is another gate
    let u = run(started(), confirm(), { type: 'decide', requestId: RA });
    u = run(u, confirm({ gate_id: 43 }, { ...ref, generation: 4 }), { type: 'decide', requestId: RB });
    expect(run(u, { type: 'decided', ...forA, status: 200, body: {} }).gate.generation).toBe(4);
    // control: B's own answer clears B
    const own = run(s, { type: 'decided', requestId: RB, gateId: 'g-6', generation: 1, status: 200, body: {} });
    expect([own.gate, own.decision, plain(own.resolved)]).toEqual([null, null, { outcome: 'answered', mine: true }]);
  });
  test('a new gate replaces the old decision', () => {
    let s = run(started(), confirm(), { type: 'decide', requestId: 'hx-0123456789abcdef01234567' });
    s = run(s, confirm({ gate_id: 42 }, { ...ref, id: 'g-6' }));
    expect(s.decision).toBeNull();
    expect(s.gate.id).toBe('g-6');
  });
});

describe('reducer: replay and reload', () => {
  test('replay frames are deduplicated against the live stream', () => {
    const a = env('event.stream_chunk', { text: 'one ' }, { seq: 10 });
    const b = env('event.stream_chunk', { text: 'two' }, { seq: 11 });
    let s = run(started(), frame(a));
    s = run(s, { type: 'replay', body: { incarnation: 'i1', min_seq: 1, max_seq: 11, events: [a, b] } });
    expect(L.reply(s)).toBe('one two');
    expect(s.gap).toBe(false);
  });
  test('a reload rebuilds from replay; a turn that began before min_seq is a gap', () => {
    const s0 = L.initial({ turnId: 'T1' });
    const evs = [env('event.stream_chunk', { text: 'tail' }, { seq: 30 })];
    expect(run(s0, { type: 'replay', body: { incarnation: 'i1', min_seq: 30, max_seq: 30, events: evs }, turnSince: 12 }).gap).toBe(true);
    const ok = run(s0, { type: 'replay', body: { incarnation: 'i1', min_seq: 30, max_seq: 30, events: evs }, turnSince: 29 });
    expect(ok.gap).toBe(false);
    expect(L.reply(ok)).toBe('tail');
  });
  test('initial() keeps only valid recovery metadata', () => {
    expect(plain(L.initial({ turnId: '../x', inc: 'i 1', seq: -3 })).turnId).toBeNull();
    const s = L.initial({ turnId: 'T1', inc: 'i1', seq: 9 });
    expect([s.turnId, s.inc, s.seq]).toEqual(['T1', 'i1', 9]);
  });
});

// ── result link ──────────────────────────────────────────────────────────────
describe('result link: the exact exec host and recipe path, last line only', () => {
  const project = { id: 'p1' };
  const container = { id: 'c-77', server_name: 'n2' };
  const host = L.execHost(project, container, 'computers.hoody.test', G);
  const path = '/api/hoody-start-k3x9q2m7ab/dashboard';
  const url = `https://${host}${path}`;
  const expect_ = { host, path };
  test('the exec-1 host of the captured computer', () => {
    expect(host).toBe('p1-c-77-exec-1.n2.computers.hoody.test');
    expect(L.execHost(project, { ...container, server_name: 'n2.evil' }, 'computers.hoody.test', G)).toBe('');
    expect(L.execHost(project, container, 'localhost', G)).toBe('');
  });
  test('accepted on the last nonempty line, alone or wrapped once', () => {
    expect(L.resultLink(`Here it is.\n\n${url}\n  \n`, expect_, G)).toBe(url);
    expect(L.resultLink(`Done\n<${url}>`, expect_, G)).toBe(url);
    expect(L.resultLink('Done\n`' + url + '`', expect_, G)).toBe(url);
  });
  const bad: [string, string][] = [
    ['not the last line', `${url}\nThanks.`],
    ['inside prose', `Open ${url}`],
    ['http', url.replace('https:', 'http:')],
    ['another program on the computer', url.replace('-exec-1.', '-http-8080.')],
    ['another exec instance', url.replace('-exec-1.', '-exec-2.')],
    ['another computer', url.replace('c-77', 'c-78')],
    ['a lookalike suffix', `https://${host}.evil.test${path}`],
    ['credentials', `https://u:p@${host}${path}`],
    ['an explicit port', `https://${host}:443${path}`],
    ['a query', `${url}?x=1`],
    ['a fragment', `${url}#x`],
    ['a trailing slash', `${url}/`],
    ['another path', url.replace('/dashboard', '/hello')],
    ['an encoded path', url.replace('/dashboard', '/dash%62oard')],
    ['a backslash', url.replace('/api/', '\\api/')],
    ['uppercase host (URL would lowercase it)', url.replace(host, host.toUpperCase())],
    ['a dot segment (URL would resolve it)', url.replace('/api/', '/x/../api/')],
    ['a secret-shaped tail', `${url}hdy_abcdefgh123`],
    ['two wrappers', `<<${url}>>`],
  ];
  for (const [name, text] of bad) test(`refused: ${name}`, () => { expect(L.resultLink(`ok\n${text}`, expect_, G)).toBeNull(); });
  test('nothing without an expectation or a guard', () => {
    expect(L.resultLink(url, { host, path: '' }, G)).toBeNull();
    expect(L.resultLink(url, expect_, null)).toBeNull();
  });
  test('the guard is consulted: a host it refuses is refused', () => {
    const g2 = { ...G, boundUrl: () => false, secretIn: G.secretIn };
    expect(L.resultLink(url, expect_, g2)).toBeNull();
    const g3 = { ...G, boundUrl: G.boundUrl, secretIn: () => true };
    expect(L.resultLink(url, expect_, g3)).toBeNull();
  });
  test('a link in tool output is never a candidate: only the reduced final response is', () => {
    const s = run(started(),
      frame(env('event.tool_result', { tool_id: 't1', output: url })),
      frame(env('event.stream_chunk', { text: 'I could not finish.' })));
    expect(L.resultLink(L.reply(s), expect_, G)).toBeNull();
    const s2 = run(started(),
      frame(env('event.stream_chunk', { text: url })),
      frame(env('event.tool_call', { tool_id: 't2', name: 'bash' })),
      frame(env('event.stream_chunk', { text: 'Something failed.' })));
    expect(L.resultLink(L.reply(s2), expect_, G)).toBeNull();
  });
});

// ── outcome texts ────────────────────────────────────────────────────────────
describe('error views never invent an outcome', () => {
  test('a lost or late mutation is unknown, never failed', () => {
    expect(plain(L.errorView({ pending: true }))).toEqual({ key: 'ask.unknown', unknown: true });
    expect(plain(L.errorView({ status: 503, code: 'admission_unconfirmed' }))).toEqual({ key: 'ask.unknown', unknown: true });
    expect(plain(L.errorView({ status: 0 }))).toEqual({ key: 'ask.unknown', unknown: true });
    expect(plain(L.errorView({ message: 'x' }))).toEqual({ key: 'ask.unknown', unknown: true });
  });
  test('a dead context renders nothing; framed is named', () => {
    expect(plain(L.errorView({ stale: true, notSent: true }))).toEqual({ drop: true });
    expect(plain(L.errorView({ status: 401, superseded: true }))).toEqual({ drop: true });
    expect(L.errorView({ status: 403, framed: true, notSent: true }).key).toBe('ask.framed');
  });
  test('definite refusals', () => {
    expect(L.errorView({ status: 409, code: 'binding_mismatch' })).toMatchObject({ key: 'ask.bindingFailed', consumed: true });
    expect(plain(L.errorView({ status: 409, code: 'delegated_agent_unavailable' }))).toEqual({ key: 'claude', consumed: true });
    expect(L.errorView({ status: 409, code: 'turn_in_flight' }).key).toBe('ask.busy');
    expect(L.errorView({ status: 409, code: 'gate_parked' }).key).toBe('ask.busy');
    expect(L.errorView({ status: 403, code: 'realm_not_allowed' }).key).toBe('ask.realmNeeded');
    expect(L.errorView({ status: 404, code: 'not_found' }).key).toBe('ask.gone');
    expect(L.errorView({ status: 403, code: 'forbidden' }).key).toBe('ask.accessRefused');
    expect(L.errorView({ status: 403, code: 'other' }).key).toBe('ask.failed');
  });
  test('reads: a failed fetch is unreachable, not a permissions diagnosis', () => {
    expect(L.readView({ message: 'TypeError' }).key).toBe('ask.unreachable');
    expect(L.readView({ status: 0 }).key).toBe('ask.unreachable');
    expect(L.readView({ status: 403, code: 'forbidden' }).key).toBe('ask.accessRefused');
    expect(L.readView({ status: 403 }).key).toBe('ask.unreachable');
    expect(L.readView({ status: 404 }).key).toBe('ask.unsupported');
  });
  test('signInView: maybe-done results hold any second sign-in and go to the status (stale: no further); every refusal says its own words', () => {
    for (const kind of ['signedIn', 'unknown'] as const) expect(L.signInView({ kind })).toEqual({ prove: true, hold: true });
    expect(L.signInView({ kind: 'stale' })).toEqual({ prove: false, hold: true, key: 'ask.signUnknown' });
    expect(L.signInView({ kind: 'refused', reason: 'key' }).hold).toBe(false);
    expect(L.signInView({ kind: 'notAllowed', reason: 'otherAccount' }).hold).toBe(false);
    const key = (r: Parameters<typeof L.signInView>[0]) => (L.signInView(r) as { key: string }).key;
    expect(key({ kind: 'refused', reason: 'key' })).toBe('ask.signInInAgent');
    expect(key({ kind: 'refused', reason: 'disabled' })).toBe('ask.signNotOffered');
    expect(key({ kind: 'refused', reason: 'cancelled' })).toBe('ask.signCancelled');
    expect(key({ kind: 'refused', reason: 'busy' })).toBe('ask.signBusy');
    for (const reason of ['notThisBox', 'computerLogin', 'refused'] as const) expect(key({ kind: 'refused', reason })).toBe('ask.signFail');
    expect(key({ kind: 'notAllowed', reason: 'shared' })).toBe('ask.signShared');
    expect(key({ kind: 'notAllowed', reason: 'admin' })).toBe('ask.signAdmin');
    expect(key({ kind: 'notAllowed', reason: 'otherAccount' })).toBe('ask.otherAccount');
  });
  test('failure codes', () => {
    expect(L.failureKey('no_credentials')).toBe('ask.noModel');
    expect(L.failureKey('quota_wait_too_long')).toBe('ask.rateLimited');
    expect(L.failureKey('approval_policy_unsatisfiable')).toBe('ask.policyChanged');
    expect(L.failureKey('whatever')).toBe('ask.failed');
    expect(L.failureKey('toString')).toBe('ask.failed');
  });
});

// ── store ────────────────────────────────────────────────────────────────────
describe('hub_ask_v1 holds operation references only', () => {
  const rec = (o: any = {}) => ({ p: 'p1', c: 'c-77', r: R1, s: 's-1', t: 'T1', k1: L.newKey(bytes(16)), k2: L.newKey(bytes(16, (i) => i + 1)), rc: 'dashboard', n: 'k3x9q2m7ab', at: 1760000000000, i: 'i1', q: 12, ph: 'working', l: 'de', ...o });
  test('a record round-trips; extra fields (a prompt, a reply, a URL) are dropped', () => {
    const st = L.putRec(L.parseStore(null), ACCT, { ...rec(), text: 'my prompt', url: 'https://x', token: 'hdy_secret' });
    const back = L.parseStore(JSON.stringify(st));
    expect(plain(back.a[ACCT])).toEqual([rec()]);
    expect(JSON.stringify(back)).not.toMatch(/prompt|https|hdy_/);
  });
  test('malformed records are dropped one by one', () => {
    const raw = JSON.stringify({ v: 1, a: { [ACCT]: [rec(), rec({ k2: rec().k1 }), rec({ r: 'all' }), rec({ s: '../x' }), rec({ rc: 'custom', n: null, c: 'c-2' }), rec({ rc: 'custom' }), rec({ ph: 'done!' }), rec({ l: 'xx', c: 'c-3' }), rec({ l: 'toString', c: 'c-4' })], __proto__: [rec()], 'bad id': [rec()] } });
    const st = L.parseStore(raw);
    expect(st.a[ACCT].length).toBe(2);
    expect(Object.keys(st.a)).toEqual([ACCT]);
  });
  test('a follow flag an older page stored is not kept on reload (no create follows the realm\'s backend)', () => {
    const back = (o: any) => L.parseStore(JSON.stringify(L.putRec(L.parseStore(null), ACCT, rec(o)))).a[ACCT][0];
    for (const f of [true, false, 1, 'true', null]) { expect(plain(back({ f }))).toEqual(rec()); expect('f' in back({ f })).toBe(false); }
  });
  test('replaced turn keys (kw) keep only valid keys other than k1, k2 and k3, at most JOURNAL_MAX, and decisions (da) only request ids', () => {
    const back = (o: any) => L.parseStore(JSON.stringify(L.putRec(L.parseStore(null), ACCT, rec(o)))).a[ACCT][0];
    const k = (n: number) => L.newKey(bytes(16, (i) => i + n)) as string;
    const r0 = rec();
    expect(back({ kw: [k(5), 'nope', r0.k1, r0.k2, k(5), k(6)] }).kw).toEqual([k(5), k(6)]);
    expect(back({ k3: [k(7)], kw: [k(7), k(8)] }).kw).toEqual([k(8)]);
    // Above the K3_MAX admission limit (two tabs at it at once) nothing is dropped up to JOURNAL_MAX.
    expect(back({ kw: Array.from({ length: 12 }, (_, i) => k(20 + i)) }).kw).toHaveLength(12);
    expect(back({ kw: Array.from({ length: 20 }, (_, i) => k(40 + i)) }).kw).toHaveLength(L.JOURNAL_MAX);
    const ids = Array.from({ length: 12 }, (_, i) => L.newRequestId(bytes(12, (j) => j + i)) as string);
    expect(Object.keys(back({ da: Object.fromEntries(ids.map((x, i) => ['gate-' + i, x])) }).da)).toHaveLength(12);
    expect('kw' in back({ kw: 'x' })).toBe(false);
    const rid = L.newRequestId(bytes(12)) as string;
    expect(back({ da: { 'gate-1': rid, 'gate-2': 'x', '../g': rid } }).da).toEqual({ 'gate-1': rid });
  });
  test('ended gates (dg) keep only gate keys, once each, the newest SETTLED_MAX; refused decisions (dr) map a gate key to a request id', () => {
    const back = (o: any) => L.parseStore(JSON.stringify(L.putRec(L.parseStore(null), ACCT, rec(o)))).a[ACCT][0];
    const keys = Array.from({ length: 40 }, (_, i) => 'gate-' + i);
    expect(back({ dg: [keys[0], '../g', keys[0], 7, keys[1]] }).dg).toEqual([keys[0], keys[1]]);
    expect(back({ dg: keys }).dg).toEqual(keys.slice(-L.SETTLED_MAX));
    expect('dg' in back({ dg: 'x' })).toBe(false);
    const rid = L.newRequestId(bytes(12)) as string;
    expect(back({ dr: { 'gate-1': rid, 'gate-2': 'x', '../g': rid } }).dr).toEqual({ 'gate-1': rid });
    expect(Object.keys(back({ dr: Object.fromEntries(keys.map((k) => [k, rid])) }).dr)).toHaveLength(L.SETTLED_MAX);
    expect('dr' in back({ dr: [rid] })).toBe(false);
  });
  test('garbage parses to an empty store', () => {
    for (const raw of [null, '', '{', '[]', '{"v":2,"a":{}}', '{"v":1,"a":[]}']) expect(plain(L.parseStore(raw))).toEqual({ v: 1, a: {} });
  });
  test('one slot per (project, computer, realm), newest first, at most 8', () => {
    let st = L.parseStore(null);
    for (let i = 0; i < 10; i++) st = L.putRec(st, ACCT, rec({ c: 'c-' + i, at: i }));
    st = L.putRec(st, ACCT, rec({ c: 'c-5', at: 99 }));
    expect(st.a[ACCT].length).toBe(8);
    expect(st.a[ACCT][0]).toMatchObject({ c: 'c-5', at: 99 });
    expect(st.a[ACCT].filter((x: any) => x.c === 'c-5').length).toBe(1);
    expect(L.findRec(st, ACCT, 'p1', 'c-5', R1).at).toBe(99);
    expect(L.findRec(st, ACCT, 'p1', 'c-5', R2)).toBeNull();
    expect(L.findRec(st, 'other', 'p1', 'c-5', R1)).toBeNull();
    expect(L.putRec(st, '__proto__', rec())).toBeNull();
    expect(L.putRec(st, ACCT, rec({ k1: 'x' }))).toBeNull();
  });
  test('backoff doubles to 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 40].map(L.backoff)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
});

describe('transcript reply', () => {
  const msg = (role: string, ...blocks: any[]) => ({ role, blocks });
  test('the text after the last tool call of the last assistant message', () => {
    const body = { messages: [msg('user', { kind: 'text', text: 'go' }), msg('assistant', { kind: 'text', text: 'Working.' }, { kind: 'tool_use', tool_id: 'a' }),
      msg('user', { kind: 'tool_result', tool_id: 'a', output: 'https://evil.example/x' }), msg('assistant', { kind: 'thinking', text: 'hm' }, { kind: 'text', text: 'Done.\n' }, { kind: 'text', text: 'https://x' })] };
    expect(L.transcriptReply(body)).toBe('Done.\nhttps://x');
  });
  test('a last message ending in a tool call, or no assistant message, has no reply', () => {
    expect(L.transcriptReply({ messages: [msg('assistant', { kind: 'text', text: 'https://x' }, { kind: 'tool_use', tool_id: 'b' })] })).toBe('');
    expect(L.transcriptReply({ messages: [msg('user', { kind: 'text', text: 'https://x' })] })).toBe('');
    for (const b of [null, {}, { messages: 'x' }, { messages: [null, 3] }]) expect(L.transcriptReply(b)).toBe('');
  });
});

describe('the module stays pure', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  test('no DOM, network, storage, timers or window.Hub', () => {
    for (const re of [/\bdocument\b/, /\bfetch\s*\(/, /XMLHttpRequest|EventSource/, /localStorage|sessionStorage/, /setTimeout|setInterval/, /window\.Hub\b/, /innerHTML/, /\bcrypto\b/, /Math\.random/])
      expect(code).not.toMatch(re);
  });
});

// ---- the incarnation epoch, the retired set and the whole-reply fence of the reducer
describe('reducer: a recovery reply is one unit, stamped at dispatch; incarnations only move forward', () => {
  const GREF = { id: 'gate-i1-1', generation: 1, type: 'confirm', gate_cause: 'static_stakes', risk: 'write', human_only: false };
  const CONFD = { tool_name: 'bash', params: { command: 'ls' }, detail: 'ls', gate_id: 41, generation: 0, lease_required: false };
  const gateIn = (inc: string, seq: number, id: string, num = 41) =>
    frame(env('event.confirm_request', { ...CONFD, gate_id: num }, { inc, seq, gate: { ...GREF, id } }));
  const chunkIn = (inc: string, seq: number) => frame(env('event.stream_chunk', { text: '.' }, { inc, seq }));
  const boundary = (inc: string) => ({ type: 'frame', name: 'replay_boundary', data: { incarnation: inc, max_seq: 1 } });
  const replayOf = (inc: string, events: any[]) => ({ incarnation: inc, min_seq: 1, max_seq: events.length ? events[events.length - 1].seq : 0, events });
  const stateOf = (inc: string, seq: number, id?: string, num = 41) => ({
    state: 'running', incarnation: inc, seq,
    ...(id ? { pending_gate_ref: { id, generation: 3 }, pending_gate: { type: 'confirm', tool_name: 'bash', gate_id: num, params: { command: 'ls' }, detail: 'ls' } } : {}),
  });
  const inI1WithGate = () => run(started(), gateIn('i1', 5000, 'gate-i1-5', 41));

  test('a reply stamped before an incarnation change is dropped whole: nothing of it is applied, and the card is told', () => {
    const s0 = inI1WithGate();
    const stamp = { epoch: s0.epoch, rev: s0.gateRev };
    const s1 = run(s0, boundary('i2'));
    expect(s1.gate).toBeNull();
    expect(s1.epoch).toBeGreaterThan(stamp.epoch);
    const ev = gateIn('i1', 5000, 'gate-i1-5').data;   // the old incarnation's replay, which holds its gate
    const s2 = run(s1, { type: 'reply', ...stamp, replay: replayOf('i1', [ev]), state: stateOf('i1', 5001) });
    expect(s2.replyDropped).toBe(true);
    expect(s2.gate).toBeNull();
    expect(s2.inc).toBe('i2');
    // a reply of the current epoch is applied, and says so
    const s3 = run(s2, { type: 'reply', epoch: s2.epoch, rev: s2.gateRev, replay: replayOf('i2', []), state: stateOf('i2', 1) });
    expect(s3.replyDropped).toBe(false);
  });

  test('control: the same reply without an incarnation change is applied and the gate stays', () => {
    const s0 = inI1WithGate();
    const ev = gateIn('i1', 5000, 'gate-i1-5').data;
    const s1 = run(s0, { type: 'reply', epoch: s0.epoch, rev: s0.gateRev, replay: replayOf('i1', [ev]), state: stateOf('i1', 5000, 'gate-i1-5') });
    expect(s1.replyDropped).toBe(false);
    expect(s1.gate && s1.gate.id).toBe('gate-i1-5');
  });

  test('a retired incarnation never comes back: its frames, replay and snapshot are ignored', () => {
    let s = run(inI1WithGate(), boundary('i2'));
    expect(plain(s.retired)).toEqual(['i1']);
    const before = plain(s);
    s = run(s, gateIn('i1', 5001, 'gate-i1-6', 42));
    expect(s.gate).toBeNull();
    s = run(s, { type: 'replay', body: replayOf('i1', [gateIn('i1', 5001, 'gate-i1-6', 42).data]) });
    expect(s.gate).toBeNull();
    s = run(s, { type: 'state', body: stateOf('i1', 5002, 'gate-i1-6', 42) });
    expect(s.gate).toBeNull();
    s = run(s, boundary('i1'));
    expect(s.inc).toBe('i2');
    expect(s.gate).toBeNull();
    expect(s.epoch).toBe(before.epoch);
  });

  test('the gate revision fence leaves a snapshot out, but the replay of the same reply still counts', () => {
    const s0 = inI1WithGate();
    const stale = { epoch: s0.epoch, rev: s0.gateRev - 1 };   // the gate moved since the reads began
    const s1 = run(s0, { type: 'reply', ...stale, replay: replayOf('i1', [chunkIn('i1', 5001).data]), state: stateOf('i1', 5001) });
    expect(s1.replyDropped).toBe(false);
    expect(s1.gate && s1.gate.id).toBe('gate-i1-5');   // the snapshot that would have cleared it was not applied
    expect(s1.seq).toBe(5001);                          // the replay was
  });

  test('the gate revision moves with the gate: a snapshot of the gate it replaced cannot put it back', () => {
    const s0 = inI1WithGate();
    const stamp = { epoch: s0.epoch, rev: s0.gateRev };
    const s1 = run(s0, gateIn('i1', 5002, 'gate-i1-6', 42));   // a new gate replaced it while the reads were out
    expect(s1.gateRev).toBeGreaterThan(stamp.rev);
    const s2 = run(s1, { type: 'reply', ...stamp, state: stateOf('i1', 5001, 'gate-i1-5', 41) });
    expect(s2.gate && s2.gate.id).toBe('gate-i1-6');
  });

  test('an epoch mismatch drops a reply even when the old incarnation cannot be told from its bodies (no incarnation named)', () => {
    const s0 = inI1WithGate();
    const stamp = { epoch: s0.epoch, rev: s0.gateRev };
    const s1 = run(s0, boundary('i2'));
    const bare = { state: 'running', pending_gate_ref: { id: 'gate-i1-5', generation: 3 }, pending_gate: { type: 'confirm', tool_name: 'bash', gate_id: 41, params: { command: 'ls' }, detail: 'ls' } };
    const s2 = run(s1, { type: 'reply', ...stamp, state: bare });
    expect(s2.replyDropped).toBe(true);
    expect(s2.gate).toBeNull();
  });

  test('a definite 409 removes the gate at once; an older snapshot cannot bring it back', () => {
    const RQ = 'hx-0123456789abcdef01234567';
    for (const code of ['stale_gate', 'no_pending_gate', 'gate_already_answered', 'gate_cancelled']) {
      let s = run(inI1WithGate(), { type: 'decide', requestId: RQ });
      s = run(s, { type: 'decided', requestId: RQ, gateId: 'gate-i1-5', generation: 1, status: 409, body: { code } });
      expect(s.gate, code).toBeNull();
      expect(s.decision, code).toBeNull();
      expect(s.resync, code).toBe(true);
      const again = run(s, { type: 'state', body: stateOf('i1', 5000, 'gate-i1-5') });   // taken before the refusal
      expect(again.gate, code).toBeNull();
    }
  });

  test('an unknown outcome (5xx, a decision still pending) and a refusal that does not name the gate are not evidence: the gate stays', () => {
    const RQ = 'hx-0123456789abcdef01234567';
    for (const [status, body] of [[503, {}], [409, { code: 'gate_decision_pending' }], [500, { code: 'internal' }], [500, { code: 'stale_gate' }], [400, { code: 'bad_request' }], [403, { code: 'forbidden' }], [429, { code: 'rate_limited' }]] as const) {
      let s = run(inI1WithGate(), { type: 'decide', requestId: RQ });
      s = run(s, { type: 'decided', requestId: RQ, gateId: 'gate-i1-5', generation: 1, status, body });
      expect(s.gate && s.gate.id, String(status)).toBe('gate-i1-5');
    }
  });

  test('a resolve seen on the stream closes the gate id even when the card never saw it open', () => {
    let s = run(started(), boundary('i1'));
    s = run(s, frame(env('event.gate_resolved', { kind: 'confirm', gate_id: 41, outcome: 'answered' }, { inc: 'i1', seq: 7 })));
    s = run(s, { type: 'state', body: stateOf('i1', 6, 'gate-i1-5', 41) });   // a snapshot older than the resolve
    expect(s.gate).toBeNull();
    s = run(s, { type: 'state', body: stateOf('i1', 9, 'gate-i1-5', 41) });   // a snapshot newer than it is not contradicted by it
    expect(s.gate && s.gate.id).toBe('gate-i1-5');
  });

  test('the retired set and the closed set are bounded', () => {
    let s = started();
    for (let k = 1; k <= 60; k++) s = run(s, boundary('i' + k));
    expect(s.retired.length).toBeLessThanOrEqual(32);
    expect(s.inc).toBe('i60');
    for (let n = 0; n < 100; n++) s = run(s, frame(env('event.gate_resolved', { kind: 'confirm', gate_id: n, outcome: 'answered' }, { inc: 'i60', seq: 1000 + n })));
    expect(s.closed.length).toBeLessThanOrEqual(64);
  });

  test('the reducer does not mutate the state it was given', () => {
    const s0 = inI1WithGate();
    const snap = JSON.stringify(s0);
    run(s0, boundary('i2'));
    run(s0, { type: 'reply', epoch: s0.epoch, rev: s0.gateRev, state: stateOf('i1', 5001) });
    expect(JSON.stringify(s0)).toBe(snap);
  });

  // ---- opening events are evidence like snapshots
  const questionIn = (inc: string, seq: number, id: string, num = 41) =>
    frame(env('event.user_question', { question: 'Which?', options: ['a', 'b'], question_id: num }, { inc, seq, gate: { id, generation: 1, type: 'question' } }));
  const questionState = (inc: string, seq: number, id: string, num = 41) => ({
    state: 'running', incarnation: inc, seq,
    pending_gate_ref: { id, generation: 1 }, pending_gate: { type: 'question', question: 'Which?', options: ['a', 'b'], question_id: num },
  });
  const confirmState = (inc: string, seq: number, id: string, num = 41) => ({
    state: 'running', incarnation: inc, seq,
    pending_gate_ref: { id, generation: 1 }, pending_gate: { type: 'confirm', tool_name: 'bash', gate_id: num, params: { command: 'ls' }, detail: 'ls' },
  });
  const RQ = 'hx-0123456789abcdef01234567';
  const kinds = [
    ['confirm', (inc: string, seq: number, id: string, num = 41) => gateIn(inc, seq, id, num), confirmState],
    ['question', questionIn, questionState],
  ] as const;

  test('an opening event does not open a gate that a definite 409 or a resolve closed (stream and replay alike)', () => {
    for (const [kind, open, state] of kinds) {
      for (const how of ['409', 'resolved'] as const) {
        let s = run(started(), frame(env('event.stream_chunk', { text: '.' }, { inc: 'i1', seq: 1 })), { type: 'state', body: state('i1', 2, 'gate-i1-5'), replay: replayOf('i1', []) });
        expect(s.gate && s.gate.id, kind).toBe('gate-i1-5');
        if (how === '409') {
          s = run(s, { type: 'decide', requestId: RQ }, { type: 'decided', requestId: RQ, gateId: 'gate-i1-5', generation: 1, status: 409, body: { code: 'stale_gate' } });
        } else {
          s = run(s, frame(env('event.gate_resolved', { kind, [kind === 'question' ? 'question_id' : 'gate_id']: 41, outcome: 'answered' }, { inc: 'i1', seq: 4 })));
        }
        expect(s.gate, kind + how).toBeNull();
        // the delayed opening event, by a frame and by a replay body
        const byFrame = run(s, open('i1', 3, 'gate-i1-5'));
        expect(byFrame.gate, kind + how + ' frame').toBeNull();
        const byReplay = run(s, { type: 'replay', body: replayOf('i1', [open('i1', 3, 'gate-i1-5').data]) });
        expect(byReplay.gate, kind + how + ' replay').toBeNull();
        // and the reply that carries it, with the snapshot left out by the revision fence
        const reply = run(s, { type: 'reply', epoch: s.epoch, rev: s.gateRev - 1, replay: replayOf('i1', [open('i1', 3, 'gate-i1-5').data]), state: state('i1', 5, 'gate-i1-5') });
        expect(reply.gate, kind + how + ' reply').toBeNull();
      }
    }
  });

  test('the same gate seen again by its opening event keeps an answer in flight or of unknown outcome (confirm and question)', () => {
    for (const [kind, open, state] of kinds) {
      let s = run(started(), frame(env('event.stream_chunk', { text: '.' }, { inc: 'i1', seq: 1 })), { type: 'state', body: state('i1', 2, 'gate-i1-5'), replay: replayOf('i1', []) });
      s = run(s, { type: 'decide', requestId: RQ });
      expect(s.decision && s.decision.requestId, kind).toBe(RQ);
      expect(run(s, open('i1', 2, 'gate-i1-5')).decision, kind + ' frame').not.toBeNull();
      expect(run(s, { type: 'replay', body: replayOf('i1', [open('i1', 2, 'gate-i1-5').data]) }).decision, kind + ' replay').not.toBeNull();
      // a different gate (another id) is a new gate: the decision belonged to the old one
      expect(run(s, open('i1', 3, 'gate-i1-6', 42)).decision, kind + ' other gate').toBeNull();
      // a resolve ends it
      const r = run(s, frame(env('event.gate_resolved', { kind, [kind === 'question' ? 'question_id' : 'gate_id']: 41, outcome: 'answered' }, { inc: 'i1', seq: 3 })));
      expect([r.gate, r.decision], kind + ' resolved').toEqual([null, null]);
    }
  });

  test('an opening event older than the watermark a snapshot showed the held gate at does not replace it, and the answer in flight stays', () => {
    for (const [kind, open, state] of kinds) {
      let s = run(started(), frame(env('event.stream_chunk', { text: '.' }, { inc: 'i1', seq: 1 })), { type: 'state', body: state('i1', 6, 'gate-i1-9', 49), replay: replayOf('i1', []) });
      s = run(s, { type: 'decide', requestId: RQ });
      // a replay that walks through an older gate, its resolve and then the held gate's own opening
      const events = [open('i1', 3, 'gate-i1-5', 41).data, env('event.gate_resolved', { kind, [kind === 'question' ? 'question_id' : 'gate_id']: 41, outcome: 'answered' }, { inc: 'i1', seq: 5 }), open('i1', 6, 'gate-i1-9', 49).data];
      const t = run(s, { type: 'replay', body: replayOf('i1', events) });
      expect(t.gate && t.gate.id, kind).toBe('gate-i1-9');
      expect(t.decision && t.decision.requestId, kind).toBe(RQ);
    }
  });

  test('a snapshot that is left out, or names another incarnation than the replay beside it, asks the caller to read again', () => {
    const s0 = inI1WithGate();
    // left out by the gate revision
    const moved = run(s0, gateIn('i1', 5002, 'gate-i1-6', 42));
    const a = run(moved, { type: 'reply', epoch: moved.epoch, rev: s0.gateRev, state: stateOf('i1', 5001) });
    expect(a.stateLeftOut).toBe(true);
    // applied: no re-read owed
    const b = run(s0, { type: 'reply', epoch: s0.epoch, rev: s0.gateRev, state: stateOf('i1', 5000, 'gate-i1-5') });
    expect(b.stateLeftOut).toBe(false);
    // a snapshot of a retired incarnation, or of another one than the replay
    const c = run(run(s0, boundary('i2')), { type: 'state', body: stateOf('i1', 5001) });
    expect(c.stateLeftOut).toBe(true);
    const d = run(started(), { type: 'reply', epoch: 0, rev: 0, replay: replayOf('i2', [chunkIn('i2', 1).data]), state: stateOf('i1', 3) });
    expect(d.stateLeftOut).toBe(true);
    expect(d.inc).toBe('i2');
  });

  test('a snapshot older than the replay\'s oldest event is applied as far as it goes and read again; a contiguous pair is not', () => {
    const s0 = started();
    const ev = (n: number) => chunkIn('i1', n).data;
    const far = run(s0, { type: 'reply', epoch: s0.epoch, rev: s0.gateRev, replay: { incarnation: 'i1', min_seq: 7, max_seq: 8, events: [ev(7), ev(8)] }, state: stateOf('i1', 5) });
    expect(far.stateLeftOut).toBe(true);
    const adjacent = run(s0, { type: 'reply', epoch: s0.epoch, rev: s0.gateRev, replay: { incarnation: 'i1', min_seq: 6, max_seq: 8, events: [ev(6), ev(7), ev(8)] }, state: stateOf('i1', 5) });
    expect(adjacent.stateLeftOut).toBe(false);
    const ahead = run(s0, { type: 'reply', epoch: s0.epoch, rev: s0.gateRev, replay: { incarnation: 'i1', min_seq: 7, max_seq: 8, events: [ev(7), ev(8)] }, state: stateOf('i1', 9) });
    expect(ahead.stateLeftOut).toBe(false);
  });
});

// ── v3 additions: step order and timing, loose (command-started) turns, the next turn on the same connection ──
describe('v3: steps, loose turns, nextTurn', () => {
  test('a live step records when its call and result arrived; a replayed one does not', () => {
    let s = started();
    s = L.reduce(s, { ...frame(env('event.tool_call', { tool_id: 't1', name: 'bash' })), now: 1000 });
    s = L.reduce(s, { ...frame(env('event.tool_result', { tool_id: 't1' })), now: 4000 });
    s = L.reduce(s, frame(env('event.tool_call', { tool_id: 't2', name: 'read_file' })));
    expect(s.steps[0]).toMatchObject({ at: 1000, end: 4000, n: 0 });
    expect(s.steps[1].at).toBeUndefined();
    expect(s.steps[1].n).toBe(1);
  });
  test('a loose turn takes untagged frames; a strict one does not', () => {
    const untagged = (type: string, data: any, seq: number) => ({ type: 'frame', name: type.slice(6), data: { seq, incarnation: 'i1', event: { type, data } } });
    let s = L.initial({ turnId: 'tc1', loose: true });
    s = L.reduce(s, untagged('event.stream_chunk', { text: 'hi' }, 1));
    expect(L.reply(s)).toBe('hi');
    let t = L.initial({ turnId: 'tc1' });
    t = L.reduce(t, untagged('event.stream_chunk', { text: 'hi' }, 1));
    expect(L.reply(t)).toBe('');
  });
  test('nextTurn keeps the stream position and incarnation, nothing of the turn', () => {
    const s = run(started(), frame(env('event.stream_chunk', { text: 'a' })));
    const n = L.nextTurn(s, { turnId: 'T2' });
    expect(n.seq).toBe(s.seq);
    expect(n.inc).toBe(s.inc);
    expect(n.turnId).toBe('T2');
    expect(L.reply(n)).toBe('');
    expect(n.steps).toEqual([]);
  });
});

// ---- The validator a caller asks before it erases stored evidence on a /state snapshot
describe('stateUsable: the snapshot the reducer evaluates whole', () => {
  const ref = { id: 'g-9', generation: 4 };
  const pg = { type: 'confirm', tool_name: 'bash', gate_id: 12 };
  const cases: Array<[string, unknown, boolean]> = [
    ['null', null, false], ['empty', {}, false], ['no watermark', { pending_gate_ref: null }, false],
    ['seq not a number', { incarnation: 'i1', seq: 'x', pending_gate_ref: null }, false],
    ['negative seq', { incarnation: 'i1', seq: -1, pending_gate_ref: null }, false],
    ['fractional seq', { incarnation: 'i1', seq: 1.5 }, false],
    ['bad incarnation', { incarnation: 'bad inc', seq: 3 }, false],
    ['empty incarnation', { incarnation: '', seq: 3 }, false],
    ['watermark, no gate named', { incarnation: 'i1', seq: 3 }, true],
    ['watermark, null ref', { incarnation: 'i1', seq: 3, pending_gate_ref: null }, true],
    ['ref without its gate', { incarnation: 'i1', seq: 3, pending_gate_ref: ref }, false],
    ['falsy ref', { incarnation: 'i1', seq: 3, pending_gate_ref: 0 }, false],
    ['ref that is not an object', { incarnation: 'i1', seq: 3, pending_gate_ref: 5, pending_gate: pg }, false],
    ['empty ref object', { incarnation: 'i1', seq: 3, pending_gate_ref: {}, pending_gate: pg }, false],
    ['ref with a bad id', { incarnation: 'i1', seq: 3, pending_gate_ref: { id: '../x', generation: 1 }, pending_gate: pg }, false],
    ['gate of an unknown type', { incarnation: 'i1', seq: 3, pending_gate_ref: ref, pending_gate: { type: 'other' } }, false],
    ['gate that is not an object', { incarnation: 'i1', seq: 3, pending_gate_ref: ref, pending_gate: 'x' }, false],
    ['a question with a bad batch', { incarnation: 'i1', seq: 3, pending_gate_ref: ref, pending_gate: { type: 'question', questions: [{ id: '../x', question: 'A?' }] } }, false],
    ['a confirm gate', { incarnation: 'i1', seq: 3, pending_gate_ref: ref, pending_gate: pg }, true],
    ['a question gate', { incarnation: 'i1', seq: 3, pending_gate_ref: ref, pending_gate: { type: 'question', question: 'Which?', question_id: 2 } }, true],
  ];
  for (const [name, body, want] of cases) {
    test(`${name}: ${want ? 'usable' : 'not usable'}, and the reducer agrees`, () => {
      expect(L.stateUsable(body)).toBe(want);
      // The reducer's own step: a body that is not usable never builds a valid gate from a gate it names.
      const s = run(started(), { type: 'state', body });
      if (!want) expect(!s.gate || s.gate.invalid).toBe(true);
      else if (L0 && (body as any).pending_gate_ref) expect(s.gate && !s.gate.invalid).toBeTruthy();
    });
  }
});

// Auto-approve not on = the agent's default mode, where rules and hooks can let an action run without asking: the
// dock's notes never promise asking before each action or "first".
describe('Approve automatically failure notes promise no asking', () => {
  test('ask.autoFailOn and ask.autoStartFail say "when an action needs you"', async () => {
    const S = (await import('./strings.en.json')).default as Record<string, string>;
    for (const k of ['ask.autoFailOn', 'ask.autoStartFail']) {
      expect(S[k]).not.toMatch(/\b(asks?|ask you)( you)? (before|first)\b/i);
      expect(S[k]).toMatch(/when an action needs you/);
    }
  });
});
