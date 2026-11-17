// signin.ts: password sign-in and its 2FA step, before any session exists.
import { describe, expect, it } from 'vitest';
import {
  cancelSignIn, passwordFitsRule, passwordSignIn, readSignupConfig, requestPasswordReset, resendVerification, startSignup,
  type SignInDeps, type SignInResult, type SignupState,
} from './signin';

const ORIGIN = 'https://example.test';
const PASSWORD = 'correct horse battery staple';
const TEMP = 'temp.jwt.value';
const PAIR = { token: 'a.b.c', refreshToken: 'd.e.f', expires_at: '2026-11-13T00:00:00Z', refresh_expires_at: '2026-12-13T00:00:00Z', session_id: 'sid' };

type Reply = { ok: unknown } | { err: unknown } | { wait: Promise<unknown> };

function harness(replies: Reply[], o: { origin?: () => string | null; store?: boolean; clock?: { t: number }; stored?: () => string; rev?: () => string | null; onStore?: () => void } = {}) {
  const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
  const times: number[] = []; // the clock at each send
  const stored: Array<Readonly<Record<string, string>>> = [];
  const dropped: Array<{ token: string; refreshToken: string }> = [];
  const deps: SignInDeps = {
    call: async (path, body) => {
      calls.push({ path, body });
      times.push(o.clock?.t ?? 0);
      const r = replies.shift();
      // An unplanned call ends a loop as a definite refusal rather than spinning on a 'no answer'.
      if (!r) throw { status: 400, code: 'NO_REPLY_QUEUED' };
      if ('wait' in r) return r.wait;
      if ('err' in r) throw r.err;
      return r.ok;
    },
    origin: o.origin ?? (() => ORIGIN),
    store: (pair) => { stored.push(pair); o.onStore?.(); return o.store ?? true; },
    stored: o.stored ?? (() => 'none'),
    rev: o.rev ?? (() => 'rev0'),
    dropOwn: (p) => { dropped.push({ ...p }); },
    // The signup check's waits: no real time, each wait moves the clock.
    sleep: async (ms) => { if (o.clock) o.clock.t += ms; },
    now: () => o.clock?.t ?? 0,
  };
  return { deps, calls, stored, times, dropped };
}

const ok = (data: unknown): Reply => ({ ok: { statusCode: 200, data } });
const err = (status: number, code: string | null, extra: Record<string, unknown> = {}): Reply => ({ err: { status, code, message: 'server words', data: { secret: PASSWORD }, ...extra } });
const refusedWhy = (r: SignInResult) => (r.kind === 'refused' ? r.why : r.kind);

describe('passwordSignIn', () => {
  it('signs in with an address: one anonymous login, the pair stored once, no challenge sent', async () => {
    const h = harness([ok(PAIR)]);
    expect(await passwordSignIn(' me@example.test ', PASSWORD, h.deps)).toEqual({ kind: 'signed-in' });
    expect(h.calls).toEqual([{ path: '/users/auth/login', body: { email: 'me@example.test', password: PASSWORD, client: 'web' } }]);
    expect(h.stored).toEqual([{ token: PAIR.token, refreshToken: PAIR.refreshToken, expires_at: PAIR.expires_at, refresh_expires_at: PAIR.refresh_expires_at }]);
  });

  it('a name without @ is sent as the user name', async () => {
    const h = harness([ok(PAIR)]);
    await passwordSignIn('alice', PASSWORD, h.deps);
    expect(h.calls[0]?.body).toEqual({ username: 'alice', password: PASSWORD, client: 'web' });
  });

  it('2FA: the step hides its token, a wrong code keeps it, a right one stores the pair', async () => {
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP, method: 'totp' }), err(401, 'INVALID_OTP_CODE'), ok(PAIR)]);
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    expect(first.kind).toBe('two-factor');
    if (first.kind !== 'two-factor') return;
    expect(JSON.stringify(first)).not.toContain(TEMP);
    expect(Object.keys(first.step)).toEqual([]);
    expect(h.stored).toEqual([]);
    expect(refusedWhy(await first.step.verify('000000'))).toBe('otp');
    expect(await first.step.verify(' 123456 ')).toEqual({ kind: 'signed-in' });
    expect(h.calls.slice(1).map((c) => c.body)).toEqual([
      { temp_token: TEMP, code: '000000', client: 'web' },
      { temp_token: TEMP, code: '123456', client: 'web' },
    ]);
    expect(h.stored).toHaveLength(1);
  });

  it('2FA: a code typed with spaces or a hyphen is sent without them; a backup code keeps its letters', async () => {
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), err(401, 'INVALID_OTP_CODE'), err(401, 'INVALID_OTP_CODE'), err(401, 'INVALID_OTP_CODE')]);
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    if (first.kind !== 'two-factor') throw new Error('expected 2FA');
    await first.step.verify('123 456');
    await first.step.verify(' 123-456 ');
    await first.step.verify('Ab12 cd34-ef');
    expect(h.calls.slice(1).map((c) => (c.body as { code: string }).code)).toEqual(['123456', '123456', 'Ab12cd34ef']);
  });

  it('2FA: a lockout names its wait from the answer body when no Retry-After came, as a number or its digits', async () => {
    const locked = (data: unknown) => err(429, 'TWOFACTOR_RATE_LIMIT', { retryAfter: null, data: { data } });
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), locked({ lockout_seconds: 900 }), locked({ lockout_seconds: '900' }), locked({ lockout_seconds: 'soon' }), err(429, null, { retryAfter: 30, data: { data: { lockout_seconds: 900 } } })]);
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    if (first.kind !== 'two-factor') throw new Error('expected 2FA');
    expect(await first.step.verify('123456')).toEqual({ kind: 'refused', why: 'retry', retryAfter: 900 });
    expect(await first.step.verify('123456')).toEqual({ kind: 'refused', why: 'retry', retryAfter: 900 });
    expect(await first.step.verify('123456')).toEqual({ kind: 'refused', why: 'retry' });
    expect(await first.step.verify('123456')).toEqual({ kind: 'refused', why: 'retry', retryAfter: 30 });
  });

  it('a 2FA step refused after its five minutes took too long: start again', async () => {
    const clock = { t: 1_000 };
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), err(401, 'INVALID_TOKEN')], { clock });
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    if (first.kind !== 'two-factor') throw new Error('expected 2FA');
    clock.t += 5 * 60_000;
    expect(refusedWhy(await first.step.verify('123456'))).toBe('expired');
  });

  it('a 2FA step refused while it is still young did not take too long: it ended (used, revoked, not this step)', async () => {
    // The API answers a used token, a revoked session and a timed-out one with the same 401; only the step's own age
    // tells them apart, so a young step is never told it "took too long".
    for (const reply of [err(401, 'INVALID_TOKEN'), err(401, null), err(400, 'Bad Request'), err(400, 'DEVICE_BINDING_GONE')]) {
      const clock = { t: 1_000 };
      const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), reply], { clock });
      const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
      if (first.kind !== 'two-factor') throw new Error('expected 2FA');
      clock.t += 4 * 60_000 + 59_000;
      expect(refusedWhy(await first.step.verify('123456'))).toBe('ended');
    }
  });

  it('an old 2FA step keeps the other refusals as they are: a wrong code, a lockout, a fault', async () => {
    const clock = { t: 1_000 };
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), err(401, 'INVALID_OTP_CODE'), err(429, null), err(503, null), err(403, 'ACCOUNT_BANNED')], { clock });
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    if (first.kind !== 'two-factor') throw new Error('expected 2FA');
    clock.t += 10 * 60_000;
    const whys: string[] = [];
    for (let i = 0; i < 4; i++) whys.push(refusedWhy(await first.step.verify('123456')));
    expect(whys).toEqual(['otp', 'retry', 'unavailable', 'banned']);
  });

  it('maps every refusal to one reason, and never passes on the server text or data', async () => {
    const cases: Array<[Reply, string]> = [
      [err(401, 'INVALID_CREDENTIALS'), 'credentials'],
      [err(400, null), 'credentials'],
      [err(401, 'EMAIL_NOT_VERIFIED'), 'unverified'],
      [err(403, 'ACCOUNT_BANNED'), 'banned'],
      [err(429, null, { retryAfter: 30 }), 'retry'],
      [err(503, null), 'unavailable'],
      [err(0, 'TIMEOUT'), 'network'],
      [{ err: new TypeError('Failed to fetch') }, 'network'],
      [err(403, 'FRAMED_ACTION_REFUSED'), 'framed'],
      [err(0, 'BAD_API_BASE'), 'no-api'],
      [ok({}), 'unavailable'],
      [ok({ token: 'only-access' }), 'unavailable'],
    ];
    for (const [reply, why] of cases) {
      const h = harness([reply]);
      const r = await passwordSignIn('me@example.test', PASSWORD, h.deps);
      expect(refusedWhy(r)).toBe(why);
      expect(JSON.stringify(r)).not.toContain(PASSWORD);
      expect(JSON.stringify(r)).not.toContain('server words');
      expect(h.stored).toEqual([]);
    }
    const h = harness([err(429, null, { retryAfter: 30 })]);
    expect(await passwordSignIn('me@example.test', PASSWORD, h.deps)).toEqual({ kind: 'refused', why: 'retry', retryAfter: 30 });
  });

  it('no Hoody to send to: nothing is sent', async () => {
    const h = harness([], { origin: () => null });
    expect(refusedWhy(await passwordSignIn('me@example.test', PASSWORD, h.deps))).toBe('no-api');
    expect(h.calls).toEqual([]);
  });

  it('the Hoody changed while the answer was out: nothing is stored', async () => {
    let origin: string | null = ORIGIN;
    const h = harness([ok(PAIR)], { origin: () => origin });
    const p = passwordSignIn('me@example.test', PASSWORD, h.deps);
    origin = 'https://other.test';
    expect(refusedWhy(await p)).toBe('no-api');
    expect(h.stored).toEqual([]);
  });

  it('another Hoody named between the pre-check and the write: this attempt\'s pair is taken back, no-api', async () => {
    let written = false;
    const h = harness([ok(PAIR)], { origin: () => (written ? 'https://other.test' : ORIGIN), onStore: () => { written = true; } });
    expect(refusedWhy(await passwordSignIn('me@example.test', PASSWORD, h.deps))).toBe('no-api');
    expect(h.stored).toHaveLength(1);
    expect(h.dropped).toEqual([{ token: PAIR.token, refreshToken: PAIR.refreshToken }]);
  });

  it('a write that failed part way while another Hoody was named: what it wrote is taken back, storage', async () => {
    let written = false;
    const h = harness([ok(PAIR)], { store: false, origin: () => (written ? 'https://other.test' : ORIGIN), onStore: () => { written = true; } });
    expect(refusedWhy(await passwordSignIn('me@example.test', PASSWORD, h.deps))).toBe('storage');
    expect(h.dropped).toEqual([{ token: PAIR.token, refreshToken: PAIR.refreshToken }]);
  });

  it('the Hoody still named after the write: nothing is taken back', async () => {
    const h = harness([ok(PAIR)]);
    expect((await passwordSignIn('me@example.test', PASSWORD, h.deps)).kind).toBe('signed-in');
    expect(h.dropped).toEqual([]);
  });

  it('a newer attempt, or leaving the screen, makes the earlier one store nothing', async () => {
    let answer!: (v: unknown) => void;
    const h = harness([{ wait: new Promise((res) => { answer = res; }) }, ok(PAIR)]);
    const older = passwordSignIn('me@example.test', PASSWORD, h.deps);
    const newer = passwordSignIn('me@example.test', PASSWORD, h.deps);
    expect(await newer).toEqual({ kind: 'signed-in' });
    answer({ statusCode: 200, data: PAIR });
    expect(refusedWhy(await older)).toBe('stale');
    expect(h.stored).toHaveLength(1);

    const h2 = harness([ok({ requires_2fa: true, temp_token: TEMP })]);
    const step = await passwordSignIn('me@example.test', PASSWORD, h2.deps);
    cancelSignIn();
    if (step.kind !== 'two-factor') throw new Error('expected 2FA');
    expect(refusedWhy(await step.step.verify('123456'))).toBe('stale');
    expect(h2.calls).toHaveLength(1);
  });

  it('stored but not kept: storage', async () => {
    const h = harness([ok(PAIR)], { store: false });
    expect(refusedWhy(await passwordSignIn('me@example.test', PASSWORD, h.deps))).toBe('storage');
  });
});

describe('another tab signs in meanwhile', () => {
  const flips = (from: string, to: string) => { let n = 0; return () => (n++ === 0 ? from : to); };

  it('during the password request: the stored session is kept, nothing written, the tab opens with it', async () => {
    const h = harness([ok(PAIR)], { stored: flips('none', 'account') });
    expect(await passwordSignIn('me@example.test', PASSWORD, h.deps)).toEqual({ kind: 'signed-in' });
    expect(h.stored).toEqual([]);
  });

  it('during the 2FA step (an access key counts too)', async () => {
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), ok(PAIR)], { stored: flips('none', 'token') });
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    if (first.kind !== 'two-factor') throw new Error('expected the 2FA step');
    expect(await first.step.verify('123456')).toEqual({ kind: 'signed-in' });
    expect(h.stored).toEqual([]);
  });

  it('nothing changed: the pair is stored', async () => {
    const h = harness([ok(PAIR)], { stored: () => 'none' });
    expect(await passwordSignIn('me@example.test', PASSWORD, h.deps)).toEqual({ kind: 'signed-in' });
    expect(h.stored.length).toBe(1);
  });
});

describe('another tab signs out meanwhile (the auth revision moved)', () => {
  const flips = (from: string, to: string) => { let n = 0; return () => (n++ === 0 ? from : to); };

  it('during the password request: nothing is stored, and the tab reloads into what storage holds', async () => {
    const h = harness([ok(PAIR)], { rev: flips('rev0', 'rev1') });
    expect(await passwordSignIn('me@example.test', PASSWORD, h.deps)).toEqual({ kind: 'signed-in' });
    expect(h.stored).toEqual([]);
  });

  it('during the 2FA step: the verify answer stores nothing either', async () => {
    const h = harness([ok({ requires_2fa: true, temp_token: TEMP }), ok(PAIR)], { rev: flips('rev0', 'rev1') });
    const first = await passwordSignIn('me@example.test', PASSWORD, h.deps);
    if (first.kind !== 'two-factor') throw new Error('expected the 2FA step');
    expect(await first.step.verify('123456')).toEqual({ kind: 'signed-in' });
    expect(h.stored).toEqual([]);
  });

  it('an unreadable revision that stays unreadable changes nothing: the pair is stored', async () => {
    const h = harness([ok(PAIR)], { rev: () => null });
    expect(await passwordSignIn('me@example.test', PASSWORD, h.deps)).toEqual({ kind: 'signed-in' });
    expect(h.stored.length).toBe(1);
  });
});

describe('requestPasswordReset', () => {
  it('one anonymous call with the trimmed address; the answer is the same either way', async () => {
    const h = harness([ok({})]);
    expect(await requestPasswordReset(' me@example.test ', h.deps)).toEqual({ kind: 'sent' });
    expect(h.calls).toEqual([{ path: '/auth/forgot-password', body: { email: 'me@example.test' } }]);
    expect(h.stored).toEqual([]);
  });

  it('refusals: a bad address, too many tries, no answer, a fault, no Hoody', async () => {
    const cases: Array<[Reply, string]> = [[err(400, null), 'address'], [err(429, null), 'retry'], [{ err: new TypeError('x') }, 'network'], [err(500, null), 'unavailable']];
    for (const [reply, why] of cases) {
      const h = harness([reply]);
      const r = await requestPasswordReset('me@example.test', h.deps);
      expect(r.kind === 'refused' ? r.why : r.kind).toBe(why);
    }
    const h = harness([err(429, null, { retryAfter: 60 })]);
    expect(await requestPasswordReset('me@example.test', h.deps)).toEqual({ kind: 'refused', why: 'retry', retryAfter: 60 });
    const none = harness([], { origin: () => null });
    expect(await requestPasswordReset('me@example.test', none.deps)).toEqual({ kind: 'refused', why: 'no-api' });
    expect(none.calls).toEqual([]);
  });
});

const TOKEN = 'tok_AAAAAAAAAAAAAAAAAAAA';
const CALLER = 'caller_BBBBBBBBBBBBBB';
const BROWSER = 'browser_CCCCCCCCCCCC';
const required = (token = TOKEN, url = `https://evil.test/auth/challenge#${token}.${BROWSER}`, interval = 5): Reply =>
  err(403, 'CHALLENGE_REQUIRED', { data: { error: 'CHALLENGE_REQUIRED', data: { challenge: { token, secret: CALLER, verification_url: url, match_code: 'K7QX', interval } } } });
const SIGNUP = { email: ' new@example.test ', password: 'Abcdefgh1234' };

async function signup(replies: Reply[], input: Parameters<typeof startSignup>[0] = SIGNUP, o: Parameters<typeof harness>[1] = {}) {
  const h = harness(replies, { clock: { t: 0 }, ...o });
  const states: SignupState[] = [];
  const run = startSignup(input, (s) => states.push(s), h.deps);
  return { h, states, last: await run.done, run };
}

describe('passwordFitsRule (the API rule)', () => {
  it('12+ characters, 3 of 4 classes, at most 72 bytes', () => {
    expect(passwordFitsRule('Abcdefgh1234')).toBe(true);
    expect(passwordFitsRule('abcdefgh123!')).toBe(true);
    expect(passwordFitsRule('Abcdefg1234')).toBe(false); // 11
    expect(passwordFitsRule('abcdefghijkl1')).toBe(false); // 2 classes
    expect(passwordFitsRule('Aa1' + 'é'.repeat(35))).toBe(false); // 73 bytes
    expect(passwordFitsRule('Aa1' + 'é'.repeat(34) + 'x')).toBe(true); // 72 bytes
  });
});

describe('startSignup', () => {
  it('one anonymous request when no check is asked: the generic answer is "sent"', async () => {
    const { h, states, last } = await signup([ok({ message: 'check your email' })], { ...SIGNUP, inviteCode: ' INV1 ', referralCode: ' ref ' });
    expect(last).toEqual({ kind: 'sent' });
    expect(states.map((s) => s.kind)).toEqual(['sending', 'sent']);
    expect(h.calls).toEqual([{ path: '/auth/signup', body: { email: 'new@example.test', password: SIGNUP.password, client: 'web', invite_code: 'INV1', referral_code: 'ref', referral_source: 'typed' } }]);
  });

  it('a check: its page on the CHOSEN Hoody, pending rounds wait, then the retry with the caller secret passes', async () => {
    const { h, states, last } = await signup([required(), err(403, 'CHALLENGE_PENDING'), err(503, 'CHALLENGE_BUSY'), { err: { status: 0 } }, ok({})]);
    expect(last).toEqual({ kind: 'sent' });
    expect(states[1]).toEqual({ kind: 'challenge', url: `${ORIGIN}/auth/challenge#${TOKEN}.${BROWSER}`, matchCode: 'K7QX' });
    expect(h.calls.length).toBe(5);
    for (const c of h.calls.slice(1)) expect(c.body).toEqual({ email: 'new@example.test', password: SIGNUP.password, client: 'web', challenge: { token: TOKEN, secret: CALLER } });
    expect(JSON.stringify(states)).not.toContain(CALLER);
    expect(JSON.stringify(states)).not.toContain(SIGNUP.password);
  });

  it('a successor check replaces the first', async () => {
    const NEXT = 'tok_NNNNNNNNNNNNNNNNNNNN';
    const { h, states } = await signup([required(), required(NEXT), ok({})]);
    expect(states.filter((s) => s.kind === 'challenge').length).toBe(2);
    expect(h.calls[2]?.body?.challenge).toEqual({ token: NEXT, secret: CALLER });
  });

  it('a check whose link is not token.secret is not shown; nothing is retried', async () => {
    const { h, last } = await signup([required(TOKEN, 'https://example.test/auth/challenge#<script>')]);
    expect(last).toEqual({ kind: 'refused', why: 'unavailable' });
    expect(h.calls.length).toBe(1);
  });

  it('refusals: invalid check, domain, closed, paused, bad input, faults', async () => {
    const cases: Array<[Reply[], string]> = [
      [[required(), err(403, 'CHALLENGE_INVALID')], 'challenge-expired'],
      [[err(400, 'EMAIL_DOMAIN_NOT_ACCEPTED')], 'domain'],
      [[err(403, 'SIGNUP_DISABLED')], 'closed'],
      [[err(403, 'SIGNUP_DAILY_LIMIT_REACHED')], 'paused'],
      [[err(400, null)], 'invalid'],
      [[err(503, 'SIGNUP_STATE_UNAVAILABLE')], 'unavailable'],
      [[{ err: { status: 0 } }], 'network'],
      [[err(0, 'FRAMED_ACTION_REFUSED')], 'framed'],
    ];
    for (const [replies, why] of cases) expect((await signup(replies)).last).toEqual({ kind: 'refused', why });
    expect((await signup([err(429, null, { retryAfter: 30 })])).last).toEqual({ kind: 'refused', why: 'retry', retryAfter: 30 });
  });

  it('gives up after 31 minutes of an open check, not sooner', async () => {
    const replies: Reply[] = [required(), ...Array.from({ length: 500 }, () => err(403, 'CHALLENGE_PENDING'))];
    const { last, h } = await signup(replies);
    expect(last).toEqual({ kind: 'refused', why: 'challenge-expired' });
    expect(h.calls.length).toBe((31 * 60_000) / 5_000); // one at the first check (t = 0), then one every 5 s while t < 31 min
    expect(Math.max(...h.times)).toBe(31 * 60_000 - 5_000);
  });

  it('the 31 minutes are checked before every send: no send after the deadline', async () => {
    const replies: Reply[] = [required(TOKEN, undefined, 30), ...Array.from({ length: 100 }, () => err(403, 'CHALLENGE_PENDING'))];
    const { h, last } = await signup(replies);
    expect(last).toEqual({ kind: 'refused', why: 'challenge-expired' });
    expect(Math.max(...h.times)).toBeLessThan(31 * 60_000);
  });

  it('a successor check does not restart the 31 minutes', async () => {
    const { h, last } = await signup(Array.from({ length: 500 }, () => required()));
    expect(last).toEqual({ kind: 'refused', why: 'challenge-expired' });
    expect(Math.max(...h.times)).toBeLessThan(31 * 60_000);
  });

  it('a busy or rate-limited check round waits its Retry-After before the next send', async () => {
    const { h, last } = await signup([required(), err(503, 'CHALLENGE_BUSY', { retryAfter: 20 }), err(429, null, { retryAfter: 40 }), ok({})]);
    expect(last).toEqual({ kind: 'sent' });
    expect(h.times).toEqual([0, 5_000, 25_000, 65_000]);
  });

  it('stop: nothing more is reported or sent; a request already out keeps its own answer', async () => {
    const pending = { status: 403, code: 'CHALLENGE_PENDING' };
    for (const [passes, done] of [[true, { kind: 'sent' }], [false, { kind: 'refused', why: 'stopped' }]] as const) {
      let release!: () => void;
      const h = harness([required(), { wait: new Promise((res, rej) => { release = () => (passes ? res({}) : rej(pending)); }) }], { clock: { t: 0 } });
      const states: SignupState[] = [];
      const run = startSignup(SIGNUP, (st) => states.push(st), h.deps);
      await new Promise((r) => setTimeout(r, 0));
      run.stop();
      release();
      expect(await run.done).toEqual(done);
      expect(states.map((st) => st.kind)).toEqual(['sending', 'challenge']);
      expect(h.calls.length).toBe(2);
    }
  });

  it('no Hoody chosen: nothing sent', async () => {
    const { h, last } = await signup([], SIGNUP, { origin: () => null });
    expect(last).toEqual({ kind: 'refused', why: 'no-api' });
    expect(h.calls).toEqual([]);
  });
});

describe('readSignupConfig / resendVerification', () => {
  it('reads open + invite; unreadable = null', async () => {
    const h = harness([ok({ signupEnabled: false, inviteRequired: true }), err(500, null)]);
    expect(await readSignupConfig(h.deps)).toEqual({ open: false, invite: true, providers: [] });
    expect(h.calls[0]).toEqual({ path: '/auth/config', body: undefined });
    expect(await readSignupConfig(h.deps)).toBeNull();
  });

  it('reads the providers Hoody offers: only a flag that is exactly true, GitHub first as on the served pages', async () => {
    const h = harness([
      ok({ googleEnabled: true, githubEnabled: true }),
      ok({ googleEnabled: true, githubEnabled: false }),
      ok({ githubEnabled: 'true', googleEnabled: 1 }),
      ok({ signupEnabled: true }),
    ]);
    expect((await readSignupConfig(h.deps))?.providers).toEqual(['github', 'google']);
    expect((await readSignupConfig(h.deps))?.providers).toEqual(['google']);
    expect((await readSignupConfig(h.deps))?.providers).toEqual([]);
    expect((await readSignupConfig(h.deps))?.providers).toEqual([]);
    expect(h.calls.map((c) => c.path)).toEqual(['/auth/config', '/auth/config', '/auth/config', '/auth/config']);
  });

  it('resend asks for the email like a reset', async () => {
    const h = harness([ok({}), err(429, null, { retryAfter: 9 })]);
    expect(await resendVerification(' new@example.test ', h.deps)).toEqual({ kind: 'sent' });
    expect(h.calls[0]).toEqual({ path: '/auth/resend-verification', body: { email: 'new@example.test' } });
    expect(await resendVerification('new@example.test', h.deps)).toEqual({ kind: 'refused', why: 'retry', retryAfter: 9 });
  });
});

