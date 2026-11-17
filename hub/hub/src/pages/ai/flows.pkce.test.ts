// Vitest: signing in to OpenRouter from the Hub: the agent runs OpenRouter's PKCE flow, whose
// redirect lands on localhost on the person's own machine, so the person copies the address of the page they landed on
// back into the Hub. The C9 rules under test: one start per click (a lost answer replays once with the same key), the
// pasted code is sent once per job and never kept, a lost or refused-as-already answer is read back by polling, never
// sent again, and "signed in" comes only from the job's own end or a read-back.
import { providers } from '@core';
import { describe, expect, it } from 'vitest';

const { LIFE, POLL_STEP, pkceCancel, pkceInput, pkceJobEnd, pkceLink, pkcePoll, pkceStart, pkceSubmit, signedInTo } = providers;
type Settled = providers.Settled<unknown>;
type Outcome = providers.Outcome;

const ok = (body: unknown = {}): Settled => ({ ok: true, body });
const out = (kind: Outcome['kind'], code = '', status = 0, extra: Partial<Outcome> = {}): Settled => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {}, ...extra } });
const lost = () => out('pending');
const refused = (code: string, status = 422, extra: Partial<Outcome> = {}) => out('failed', code, status, extra);
const stale = () => out('stale');

type Name = 'pkceStart' | 'pkcePoll' | 'pkceCode' | 'pkceCancel' | 'auth';
function fake(init: Partial<Record<Name, Array<Settled | ((args: unknown[]) => Settled)>>> = {}) {
  const calls: Array<{ name: Name; args: unknown[] }> = [];
  const used = new Map<Name, number>();
  const api = {} as Record<Name, (...a: unknown[]) => Promise<Settled>>;
  for (const name of ['pkceStart', 'pkcePoll', 'pkceCode', 'pkceCancel', 'auth'] as Name[]) {
    api[name] = (...args: unknown[]) => {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) as unknown[] });
      const q = init[name] ?? [ok()];
      const i = Math.min(used.get(name) ?? 0, q.length - 1);
      used.set(name, (used.get(name) ?? 0) + 1);
      const a = q[i]!;
      return Promise.resolve(typeof a === 'function' ? a(args) : a);
    };
  }
  return { api: api as unknown as providers.ProvidersApi, calls, argsOf: (n: Name) => calls.filter((c) => c.name === n).map((c) => c.args), count: (n: Name) => calls.filter((c) => c.name === n).length };
}
function env(): providers.Env & { waits: number[] } {
  const waits: number[] = [];
  let now = 1_000_000;
  return {
    waits,
    sleep: (ms) => {
      waits.push(ms);
      now += ms;
      return Promise.resolve();
    },
    now: () => now,
    hidden: () => false,
    visible: () => Promise.resolve(),
    newKey: () => 'idem-1',
    digest: () => Promise.resolve(null),
    alive: () => true,
  };
}

const AUTH = 'https://openrouter.ai/auth?callback_url=http%3A%2F%2Flocalhost%3A53781%2Fcallback&code_challenge=abc&code_challenge_method=S256';

describe('the sign-in link', () => {
  it('is shown only for https on openrouter.ai, with no user or port', () => {
    expect(pkceLink('openrouter', AUTH)).toBe(AUTH);
    for (const bad of ['http://openrouter.ai/auth', 'https://openrouter.ai.evil.example/auth', 'https://evil.example/?openrouter.ai', 'https://u:p@openrouter.ai/auth', 'https://openrouter.ai:8443/auth', 'javascript:alert(1)', 'not a url', ''])
      expect([bad, pkceLink('openrouter', bad)]).toEqual([bad, null]);
  });
  it('a provider without a known sign-in host gets no link', () => {
    expect(pkceLink('anthropic', AUTH)).toBeNull();
  });
});

describe('pkceStart', () => {
  const plan = (): providers.Plan => ({ idem: 'k1', another: false, replay: false });
  it('starts one job for the provider with the click\'s key; the link may come later from the poll', async () => {
    const f = fake({ pkceStart: [ok({ job_id: 'j1', verification_uri: AUTH })] });
    expect(await pkceStart(f.api, 'openrouter', plan())).toEqual({ state: 'job', job: 'j1', uri: AUTH });
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'k1']]);
    expect(await pkceStart(fake({ pkceStart: [ok({ job_id: 'j1' })] }).api, 'openrouter', plan())).toEqual({ state: 'job', job: 'j1', uri: null });
  });
  it('a sign-in already waiting is busy with the job the agent names; a 409 naming none is a failed start', async () => {
    expect(await pkceStart(fake({ pkceStart: [refused('oauth_in_progress', 409, { details: { job_id: 'j9' } })] }).api, 'openrouter', plan())).toEqual({ state: 'busy', job: 'j9' });
    expect(await pkceStart(fake({ pkceStart: [refused('oauth_in_progress', 409)] }).api, 'openrouter', plan())).toMatchObject({ state: 'failed', err: { code: 'oauth_in_progress' } });
  });
  it('a lost answer replays once with the same key, then is not confirmed', async () => {
    const f = fake({ pkceStart: [lost(), ok({ job_id: 'j2' })] });
    expect(await pkceStart(f.api, 'openrouter', plan())).toMatchObject({ state: 'job', job: 'j2' });
    expect(f.argsOf('pkceStart')).toEqual([['openrouter', 'k1'], ['openrouter', 'k1']]);
    const g = fake({ pkceStart: [lost()] });
    expect(await pkceStart(g.api, 'openrouter', plan())).toEqual({ state: 'not_confirmed' });
    expect(g.count('pkceStart')).toBe(2);
  });
  it('never replays once the step is gone; a refusal fails; a stale answer ends quietly', async () => {
    const f = fake({ pkceStart: [lost()] });
    expect(await pkceStart(f.api, 'openrouter', plan(), () => false)).toEqual({ state: 'not_confirmed' });
    expect(f.count('pkceStart')).toBe(1);
    expect(await pkceStart(fake({ pkceStart: [refused('oauth_unsupported')] }).api, 'openrouter', plan())).toMatchObject({ state: 'failed', err: { code: 'oauth_unsupported' } });
    expect(await pkceStart(fake({ pkceStart: [stale()] }).api, 'openrouter', plan())).toEqual({ state: 'stale' });
    expect(await pkceStart(fake({ pkceStart: [ok({})] }).api, 'openrouter', plan())).toEqual({ state: 'not_confirmed' });
  });
});

describe('what the person pastes', () => {
  it('takes the code out of the address they were sent to, or a bare code', () => {
    expect(pkceInput('  http://localhost:53781/callback?code=7f3a-9bc1_x.y~z  ')).toEqual({ ok: true, code: '7f3a-9bc1_x.y~z' });
    expect(pkceInput('localhost:53781/callback?code=abcd1234')).toEqual({ ok: true, code: 'abcd1234' });
    expect(pkceInput('abcd-1234-efgh')).toEqual({ ok: true, code: 'abcd-1234-efgh' });
  });
  it('refuses, sending nothing: empty text, an address without a code, several lines, spaces, or an API key', () => {
    expect(pkceInput('   ')).toEqual({ ok: false, why: 'empty' });
    expect(pkceInput('http://localhost:53781/callback')).toEqual({ ok: false, why: 'no_code' });
    expect(pkceInput('http://localhost:53781/callback?code=')).toEqual({ ok: false, why: 'no_code' });
    expect(pkceInput('abc\ndef')).toEqual({ ok: false, why: 'no_code' });
    expect(pkceInput('two words')).toEqual({ ok: false, why: 'no_code' });
    expect(pkceInput('x'.repeat(5000))).toEqual({ ok: false, why: 'no_code' });
    expect(pkceInput('sk-or-v1-0123456789abcdef0123456789abcdef')).toEqual({ ok: false, why: 'key' });
    expect(pkceInput('http://localhost:53781/callback?code=sk-or-v1-0123456789abcdef')).toEqual({ ok: false, why: 'key' });
  });
});

describe('pkceSubmit', () => {
  it('sends the code once to the job and clears what was typed', async () => {
    const f = fake({ pkceCode: [ok({ submitted: true })] });
    const input = { text: 'http://localhost:53781/callback?code=abcd1234' };
    expect(await pkceSubmit(f.api, 'openrouter', 'j1', input)).toEqual({ state: 'sent' });
    expect(f.argsOf('pkceCode')).toEqual([['openrouter', 'j1', { code: 'abcd1234' }]]);
    expect(input.text).toBe('');
  });
  it('text that is not a code sends nothing and keeps the text so the person can fix it', async () => {
    const f = fake();
    const input = { text: 'sk-or-v1-0123456789abcdef0123456789abcdef' };
    expect(await pkceSubmit(f.api, 'openrouter', 'j1', input)).toEqual({ state: 'refused', why: 'key' });
    expect(f.count('pkceCode')).toBe(0);
    expect(input.text).toBe('sk-or-v1-0123456789abcdef0123456789abcdef');
  });
  it('an already fed or finished job, and a lost answer, are left to the poll: never sent again', async () => {
    const f = fake({ pkceCode: [ok({ submitted: false })] });
    expect(await pkceSubmit(f.api, 'openrouter', 'j1', { text: 'abcd1234' })).toEqual({ state: 'already' });
    const g = fake({ pkceCode: [lost()] });
    expect(await pkceSubmit(g.api, 'openrouter', 'j1', { text: 'abcd1234' })).toEqual({ state: 'not_confirmed' });
    expect(g.count('pkceCode')).toBe(1);
    expect(await pkceSubmit(fake({ pkceCode: [ok({})] }).api, 'openrouter', 'j1', { text: 'abcd1234' })).toEqual({ state: 'not_confirmed' });
  });
  it('a gone job, a refusal and a stale answer', async () => {
    expect(await pkceSubmit(fake({ pkceCode: [refused('job_not_found', 404)] }).api, 'openrouter', 'j1', { text: 'abcd1234' })).toEqual({ state: 'gone' });
    expect(await pkceSubmit(fake({ pkceCode: [refused('forbidden', 403)] }).api, 'openrouter', 'j1', { text: 'abcd1234' })).toMatchObject({ state: 'failed', err: { code: 'forbidden' } });
    expect(await pkceSubmit(fake({ pkceCode: [stale()] }).api, 'openrouter', 'j1', { text: 'abcd1234' })).toEqual({ state: 'stale' });
  });
});

describe('pkcePoll', () => {
  const run = (f: ReturnType<typeof fake>, e = env(), on: (s: { uri: string | null; needsCode: boolean }) => void = () => undefined, stop: providers.Stop = { stopped: false }) => pkcePoll(f.api, e, 'openrouter', 'j1', on, stop);
  it('polls the provider\'s job every 3 s and hands over the link and whether it waits for a code', async () => {
    const seen: Array<{ uri: string | null; needsCode: boolean }> = [];
    const f = fake({ pkcePoll: [ok({ state: 'pending' }), ok({ state: 'pending', verification_uri: AUTH, needs_code: true }), ok({ state: 'complete' })] });
    const e = env();
    expect(await run(f, e, (s) => seen.push(s))).toEqual({ state: 'complete' });
    expect(seen).toEqual([{ uri: null, needsCode: false }, { uri: AUTH, needsCode: true }]);
    expect(e.waits).toEqual([0, POLL_STEP, POLL_STEP]);
    expect(f.argsOf('pkcePoll')).toEqual([['openrouter', 'j1'], ['openrouter', 'j1'], ['openrouter', 'j1']]);
  });
  it('error and cancelled end it; a 404 is gone; it ends at 15 minutes', async () => {
    expect(await run(fake({ pkcePoll: [ok({ state: 'error', error: 'scrubbed text' })] }))).toEqual({ state: 'error' });
    expect(await run(fake({ pkcePoll: [ok({ state: 'cancelled' })] }))).toEqual({ state: 'cancelled' });
    expect(await run(fake({ pkcePoll: [refused('job_not_found', 404)] }))).toEqual({ state: 'gone' });
    const f = fake({ pkcePoll: [ok({ state: 'pending' })] });
    expect(await run(f)).toEqual({ state: 'expired' });
    expect(f.count('pkcePoll')).toBe(LIFE / POLL_STEP);
  });
  it('a stop sends nothing more', async () => {
    const f = fake();
    expect(await run(f, env(), undefined, { stopped: true })).toEqual({ state: 'stopped' });
    expect(f.count('pkcePoll')).toBe(0);
  });
});

describe('cancel, the job\'s end and the read-back', () => {
  it('pkceCancel answers cancelled or complete, else not confirmed, and sends once', async () => {
    const c = (a: Settled) => pkceCancel(fake({ pkceCancel: [a] }).api, 'openrouter', 'j');
    expect(await c(ok({ state: 'cancelled' }))).toEqual({ state: 'cancelled' });
    expect(await c(ok({ state: 'complete' }))).toEqual({ state: 'complete' });
    expect(await c(ok({ state: 'pending' }))).toEqual({ state: 'not_confirmed' });
    expect(await c(lost())).toEqual({ state: 'not_confirmed' });
    expect(await c(stale())).toEqual({ state: 'stale' });
    const f = fake({ pkceCancel: [lost()] });
    await pkceCancel(f.api, 'openrouter', 'j');
    expect(f.argsOf('pkceCancel')).toEqual([['openrouter', 'j']]);
  });
  it('pkceJobEnd reads the provider\'s job', async () => {
    const end = (a: Settled) => pkceJobEnd(fake({ pkcePoll: [a] }).api, 'openrouter', 'j');
    expect(await end(ok({ state: 'complete' }))).toEqual({ state: 'complete' });
    expect(await end(ok({ state: 'cancelled' }))).toEqual({ state: 'signed_out' });
    expect(await end(ok({ state: 'error' }))).toEqual({ state: 'signed_out' });
    expect(await end(ok({ state: 'pending' }))).toEqual({ state: 'pending' });
    expect(await end(ok({ state: 'odd' }))).toEqual({ state: 'not_confirmed' });
    expect(await end(lost())).toEqual({ state: 'not_confirmed' });
  });
  it('signedInTo reads that provider\'s stored sign-in', async () => {
    const f = fake({ auth: [ok({ auth: { oauth_stored: true } })] });
    expect(await signedInTo(f.api, 'openrouter')).toEqual({ state: 'signed_in' });
    expect(f.argsOf('auth')).toEqual([['openrouter']]);
    expect(await signedInTo(fake({ auth: [ok({ auth: { oauth_stored: false } })] }).api, 'openrouter')).toEqual({ state: 'signed_out' });
    expect(await signedInTo(fake({ auth: [ok({ auth: {} })] }).api, 'openrouter')).toEqual({ state: 'not_confirmed' });
  });
});
