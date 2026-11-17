// Vitest: the AI models page's flows (key save, ChatGPT device code, own endpoints, disconnect, default,
// Claude Code, checker) over a fake Api and a fake Env.
// The C9 rules under test: a lost answer is read back, never resent blindly; "saved" only from an answer
// or a read-back that shows the change; every read-only "check again" sends nothing.
import { describe, expect, it } from 'vitest';
import type { Api, Env, Stop } from './api';
import { afterSave, confirmKey, READ_WAITS, saveKey, testKey } from './flows-key';
import {
  HIDDEN_MAX,
  LIFE,
  POLL_STEP,
  codeOf,
  deviceCancel,
  devicePoll,
  deviceStart,
  jobEnd,
  checkHeldJob,
  linkFor,
  readAuth,
  setDefault,
  signedIn,
  type DeviceCode,
  type Plan,
} from './flows-oauth';
import { createEndpoint, deleteEndpoint, editEndpoint, modelsOf, parseEndpoint, planEndpoint, publicHost, readEndpoint, shows, slug, type CreatePlan, type EndpointDef, type Saved } from './flows-endpoint';
import { confirmGone, disconnect } from './flows-disconnect';
import { confirmModel, setModel } from './flows-default';
import { closeSetup, confirmBackend, confirmEnabled, setBackend, setEnabled, setupDone, typeSetup } from './flows-claude';
import { setChecker } from './flows-checker';
import { COMMANDS, catalogue, DECIDE, type Account } from './logic';
import type { ClaudeCode, Outcome, Settled } from './types';

// ── fakes ─────────────────────────────────────────────────────────────────────────────────

const ok = (body: unknown = {}): Settled<unknown> => ({ ok: true, body });
const out = (kind: Outcome['kind'], code = '', status = 0, extra: Partial<Outcome> = {}): Settled<never> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {}, ...extra } });
/** A lost answer: the request may have gone through. */
const lost = () => out('pending');
const refused = (code: string, status = 422, extra: Partial<Outcome> = {}) => out('failed', code, status, extra);
const stale = () => out('stale');

const METHODS = [
  'version', 'providers', 'provider', 'auth', 'catalogue', 'agents', 'bots', 'acp', 'acpDefault', 'jev', 'jevModels', 'oauthPoll',
  'keyPut', 'keyDelete', 'authTest', 'authDefault', 'oauthStart', 'oauthCancel', 'signOut', 'customCreate', 'customPatch', 'customDelete',
  'agentModel', 'acpEnabled', 'acpDefaultPut', 'jevPut', 'termCaps', 'termSessions', 'termCreate', 'termWait', 'termWrite', 'termDelete',
] as const;
type Name = (typeof METHODS)[number];
type Answer = Settled<unknown> | ((args: unknown[]) => Settled<unknown>);

interface Fake {
  api: Api;
  /** Every call, in order, with its arguments snapshotted at call time. */
  calls: Array<{ name: Name; args: unknown[] }>;
  count(name: Name): number;
  argsOf(name: Name): unknown[][];
  /** Answers for a method, in order; the last one repeats. */
  on(name: Name, ...answers: Answer[]): void;
}

function fakeApi(init: Partial<Record<Name, Answer[]>> = {}): Fake {
  const calls: Fake['calls'] = [];
  const queues = new Map<Name, Answer[]>(Object.entries(init) as Array<[Name, Answer[]]>);
  const used = new Map<Name, number>();
  const api = {} as Record<string, unknown>;
  for (const name of METHODS) {
    api[name] = (...args: unknown[]) => {
      calls.push({ name, args: JSON.parse(JSON.stringify(args)) as unknown[] });
      const q = queues.get(name) ?? [ok()];
      const i = Math.min(used.get(name) ?? 0, q.length - 1);
      used.set(name, (used.get(name) ?? 0) + 1);
      const a = q[i] as Answer;
      return Promise.resolve(typeof a === 'function' ? a(args) : a);
    };
  }
  return {
    api: api as unknown as Api,
    calls,
    count: (n) => calls.filter((c) => c.name === n).length,
    argsOf: (n) => calls.filter((c) => c.name === n).map((c) => c.args),
    on: (n, ...a) => {
      queues.set(n, a);
      used.set(n, 0);
    },
  };
}

interface FakeEnv extends Env {
  waits: number[];
  clock: { now: number };
  state: { hidden: boolean; alive: boolean };
  visibleCalls: number;
}

function fakeEnv(o: { digest?: (s: string) => string | null; onSleep?: (ms: number, n: number) => void } = {}): FakeEnv {
  const waits: number[] = [];
  const clock = { now: 1_000_000 };
  const state = { hidden: false, alive: true };
  const e: FakeEnv = {
    waits,
    clock,
    state,
    visibleCalls: 0,
    sleep: (ms) => {
      waits.push(ms);
      clock.now += ms;
      o.onSleep?.(ms, waits.length);
      return Promise.resolve();
    },
    now: () => clock.now,
    hidden: () => state.hidden,
    visible: () => {
      e.visibleCalls++;
      state.hidden = false;
      return Promise.resolve();
    },
    newKey: () => 'idem-1',
    digest: (s) => Promise.resolve(o.digest ? o.digest(s) : `fp:${s}`),
    alive: () => state.alive,
  };
  return e;
}

const R1 = 'a'.repeat(24);
const KEY = 'sk-test-key-123';
const FP = `fp:${KEY}`;
const authWith = (fp: string | null) => ok({ auth: { api_key_fingerprint: fp ?? undefined } });

// ── API key ───────────────────────────────────────────────────────────────────────────────

describe('saveKey', () => {
  it('sends the key once with check and the definition revision, and maps the agent check', async () => {
    for (const [check, state] of [['valid', 'valid'], ['inconclusive', 'inconclusive'], [undefined, 'untested'], ['weird', 'untested']] as const) {
      const f = fakeApi({ keyPut: [ok({ check })] });
      expect(await saveKey(f.api, fakeEnv(), 'openai', KEY, 'rev-9')).toEqual({ state });
      expect(f.argsOf('keyPut')).toEqual([['openai', { api_key: KEY, check: true, if_definition_rev: 'rev-9' }]]);
    }
  });
  it('sends no revision when none is known', async () => {
    const f = fakeApi({ keyPut: [ok({ check: 'valid' })] });
    await saveKey(f.api, fakeEnv(), 'openai', KEY, null);
    expect(f.argsOf('keyPut')[0]?.[1]).toEqual({ api_key: KEY, check: true });
  });
  it('clears the key from the body it sent', async () => {
    let seen: { api_key: string } | null = null;
    const f = fakeApi({
      keyPut: [
        (a) => {
          seen = a[1] as { api_key: string };
          return ok({ check: 'valid' });
        },
      ],
    });
    await saveKey(f.api, fakeEnv(), 'openai', KEY, null);
    expect(seen).toMatchObject({ api_key: '' });
  });
  it('a refused key and a changed definition are their own states', async () => {
    expect(await saveKey(fakeApi({ keyPut: [refused('api_key_refused')] }).api, fakeEnv(), 'openai', KEY, null)).toEqual({ state: 'refused' });
    expect(await saveKey(fakeApi({ keyPut: [refused('definition_changed', 409)] }).api, fakeEnv(), 'p', KEY, 'r')).toEqual({ state: 'def_changed' });
  });
  it('any other refusal is failed with the outcome', async () => {
    const r = await saveKey(fakeApi({ keyPut: [refused('provider_builtin', 409)] }).api, fakeEnv(), 'openai', KEY, null);
    expect(r).toMatchObject({ state: 'failed', err: { code: 'provider_builtin' } });
  });
  it('a stale answer ends quietly, and a dead page sends nothing', async () => {
    expect(await saveKey(fakeApi({ keyPut: [stale()] }).api, fakeEnv(), 'openai', KEY, null)).toEqual({ state: 'stale' });
    const f = fakeApi();
    expect(await saveKey(f.api, fakeEnv(), 'openai', KEY, null, () => false)).toEqual({ state: 'ended' });
    expect(f.count('keyPut')).toBe(0);
  });
  it('a lost answer reads GET auth at 2, 8 and 25 seconds in total and is saved only when the fingerprint matches', async () => {
    const f = fakeApi({ keyPut: [lost()], auth: [authWith(null), authWith('fp:other'), authWith(FP)] });
    const e = fakeEnv();
    expect(await saveKey(f.api, e, 'openai', KEY, null)).toEqual({ state: 'saved' });
    expect(e.waits).toEqual([2000, 6000, 17000]);
    expect(e.waits.reduce((a: number[], w) => [...a, (a.at(-1) ?? 0) + w], [])).toEqual([2000, 8000, 25000]);
    expect(f.count('auth')).toBe(3);
    expect(READ_WAITS).toEqual([2000, 6000, 17000]);
  });
  it('stops reading as soon as the fingerprint shows', async () => {
    const f = fakeApi({ keyPut: [lost()], auth: [authWith(FP)] });
    const e = fakeEnv();
    expect(await saveKey(f.api, e, 'openai', KEY, null)).toEqual({ state: 'saved' });
    expect(e.waits).toEqual([2000]);
  });
  it('a fingerprint that never shows is "not confirmed" with the fingerprint, never "not saved"', async () => {
    const f = fakeApi({ keyPut: [lost()], auth: [authWith('fp:other')] });
    expect(await saveKey(f.api, fakeEnv(), 'openai', KEY, null)).toEqual({ state: 'not_confirmed', fp: FP });
    expect(f.count('auth')).toBe(3);
  });
  it('never sends the key a second time while reading back', async () => {
    const f = fakeApi({ keyPut: [lost()], auth: [out('pending'), authWith(null), authWith(FP)] });
    await saveKey(f.api, fakeEnv(), 'openai', KEY, null);
    expect(f.count('keyPut')).toBe(1);
  });
  it('without a fingerprint (no Web Crypto) a lost answer is never "saved"', async () => {
    const f = fakeApi({ keyPut: [lost()], auth: [authWith(null)] });
    expect(await saveKey(f.api, fakeEnv({ digest: () => null }), 'openai', KEY, null)).toEqual({ state: 'not_confirmed', fp: null });
  });
  it('a digest that throws counts as no fingerprint', async () => {
    const f = fakeApi({ keyPut: [lost()] });
    const e = fakeEnv();
    e.digest = () => Promise.reject(new Error('no crypto'));
    expect(await saveKey(f.api, e, 'openai', KEY, null)).toEqual({ state: 'not_confirmed', fp: null });
  });
  it('a page that ends during the read-back is stale', async () => {
    const f = fakeApi({ keyPut: [lost()], auth: [authWith(null)] });
    const e = fakeEnv({ onSleep: () => void 0 });
    e.state.alive = false;
    expect(await saveKey(f.api, e, 'openai', KEY, null)).toEqual({ state: 'stale' });
    expect(f.count('auth')).toBe(0);
  });
});

describe('confirmKey', () => {
  it('reads only (check again): saved on a match, otherwise not confirmed, and a stale read ends it', async () => {
    const f = fakeApi({ auth: [authWith(FP)] });
    expect(await confirmKey(f.api, fakeEnv(), 'openai', FP, [10])).toEqual({ state: 'saved' });
    expect(f.calls.map((c) => c.name)).toEqual(['auth']);
    expect(await confirmKey(fakeApi({ auth: [authWith('x')] }).api, fakeEnv(), 'openai', FP, [10, 10])).toEqual({ state: 'not_confirmed', fp: FP });
    expect(await confirmKey(fakeApi({ auth: [stale()] }).api, fakeEnv(), 'openai', FP, [10])).toEqual({ state: 'stale' });
  });
});

describe('testKey and afterSave', () => {
  it('testKey maps the agent check and reports failures and stale answers', async () => {
    for (const c of ['valid', 'invalid', 'inconclusive'] as const) expect(await testKey(fakeApi({ authTest: [ok({ check: c })] }).api, 'openai')).toEqual({ check: c, err: null, stale: false });
    expect(await testKey(fakeApi({ authTest: [ok({ check: 'odd' })] }).api, 'openai')).toEqual({ check: null, err: null, stale: false });
    const r = await testKey(fakeApi({ authTest: [refused('credential_not_stored', 409)] }).api, 'openai');
    expect(r.check).toBeNull();
    expect(r.err?.code).toBe('credential_not_stored');
    expect(await testKey(fakeApi({ authTest: [stale()] }).api, 'openai')).toEqual({ check: null, err: null, stale: true });
  });
  it('afterSave counts the provider ready models and reads its via', async () => {
    const cat = catalogue({
      providers: { items: [{ id: 'openai', display_name: 'OpenAI', prefix: 'openai', status: { state: 'ready', via: 'stored_key' } }] },
      models: { items: [{ spec: 'openai/a' }, { spec: 'openai/b' }] },
      ready: { items: [{ spec: 'openai/a' }, { spec: 'openai/b' }] },
    });
    const f = fakeApi({ catalogue: [{ ok: true, body: cat }], provider: [ok({ provider: { status: { via: 'stored_key' } } })] });
    expect(await afterSave(f.api, 'openai')).toEqual({ n: 2, via: 'stored_key' });
    const g = fakeApi({ catalogue: [lost()], provider: [lost()] });
    expect(await afterSave(g.api, 'openai')).toEqual({ n: null, via: null });
  });
});

// ── ChatGPT device code ───────────────────────────────────────────────────────────────────

describe('codeOf', () => {
  it('accepts a plain code and a short address, and drops anything else', () => {
    expect(codeOf({ user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/codex/device' })).toEqual({ code: 'ABCD-1234', uri: 'https://auth.openai.com/codex/device' });
    expect(codeOf({ user_code: 'ab', verification_uri: 'x'.repeat(513) })).toEqual({ code: null, uri: null });
    expect(codeOf({ user_code: 'AB CD-12' }).code).toBeNull();
    expect(codeOf(null)).toEqual({ code: null, uri: null });
  });
});

describe('linkFor', () => {
  const CODE = 'ABCD-1234';
  const good = 'https://auth.openai.com/codex/device';
  it('allows https on auth.openai.com and chatgpt.com', () => {
    expect(linkFor(good, CODE)).toBe(good);
    expect(linkFor('https://chatgpt.com/device', CODE)).toBe('https://chatgpt.com/device');
    expect(linkFor(good, null)).toBe(good);
  });
  it('refuses a malformed address, another scheme, another host and look-alike hosts', () => {
    for (const u of ['not a url', 'http://auth.openai.com/x', 'javascript:alert(1)', 'https://evil.com/x', 'https://auth.openai.com.evil.com/x', 'https://evil-chatgpt.com/x', 'https://openai.com/x', 'ftp://chatgpt.com/x']) expect(linkFor(u, CODE)).toBeNull();
  });
  it('refuses a user name, a password and a port', () => {
    for (const u of ['https://user@auth.openai.com/x', 'https://user:pw@auth.openai.com/x', 'https://auth.openai.com:8443/x']) expect(linkFor(u, CODE)).toBeNull();
  });
  it('hides the link when the code is in the path, query or fragment, whatever the case or hyphens', () => {
    for (const u of [
      `https://auth.openai.com/${CODE}`,
      'https://auth.openai.com/abcd-1234',
      'https://auth.openai.com/ABCD1234',
      `https://auth.openai.com/x?code=${CODE}`,
      `https://auth.openai.com/x?a=1&code=abcd1234`,
      `https://auth.openai.com/x#${CODE}`,
      'https://auth.openai.com/x#abcd1234',
    ])
      expect(linkFor(u, CODE)).toBeNull();
  });
  it('hides the link for encoded and doubly encoded variants', () => {
    for (const u of [
      'https://auth.openai.com/ABCD%2D1234',
      'https://auth.openai.com/ABCD%252D1234',
      'https://auth.openai.com/%41BCD-1234',
      'https://auth.openai.com/%2541BCD%252D1234',
      'https://auth.openai.com/x?code=ABCD%2D1234',
      'https://auth.openai.com/x?code=ABCD%252D1234',
      'https://auth.openai.com/x#ABCD%2D1234',
      'https://auth.openai.com/x?code=ABCD+1234'.replace('+', '-'),
      'https://auth.openai.com/ABCD‑1234',
      'https://auth.openai.com/ABCD–1234',
    ])
      expect(linkFor(u, CODE)).toBeNull();
  });
  it('hides the link when an escape cannot be decoded', () => {
    expect(linkFor('https://auth.openai.com/%E0%A4%A', CODE)).toBeNull();
    expect(linkFor('https://auth.openai.com/x?q=%zz', CODE)).toBeNull();
  });
  it('keeps the link when the code is not in it', () => {
    expect(linkFor('https://auth.openai.com/codex/device?lang=en#top', CODE)).toBe('https://auth.openai.com/codex/device?lang=en#top');
  });
});

describe('deviceStart', () => {
  const plan = (): Plan => ({ idem: 'k1', another: false, replay: false });
  it('starts a job and reads its code', async () => {
    const f = fakeApi({ oauthStart: [ok({ job_id: 'j1', user_code: 'ABCD-1234', verification_uri: 'https://auth.openai.com/d' })] });
    expect(await deviceStart(f.api, plan())).toEqual({ state: 'job', job: 'j1', code: { code: 'ABCD-1234', uri: 'https://auth.openai.com/d' } });
    expect(f.argsOf('oauthStart')).toEqual([[false, 'k1']]);
  });
  it('an answer without a job is not confirmed', async () => {
    expect(await deviceStart(fakeApi({ oauthStart: [ok({})] }).api, plan())).toEqual({ state: 'not_confirmed' });
  });
  it('a sign-in already waiting is busy with the job the agent names; a 409 naming none is a failed start', async () => {
    expect(await deviceStart(fakeApi({ oauthStart: [refused('oauth_in_progress', 409, { details: { job_id: 'j9' } })] }).api, plan())).toEqual({ state: 'busy', job: 'j9' });
    expect(await deviceStart(fakeApi({ oauthStart: [refused('oauth_in_progress', 409)] }).api, plan())).toMatchObject({ state: 'failed', err: { code: 'oauth_in_progress' } });
  });
  it('a lost answer replays once with the same Idempotency-Key and the same body', async () => {
    const f = fakeApi({ oauthStart: [lost(), ok({ job_id: 'j2' })] });
    const p = plan();
    expect(await deviceStart(f.api, p)).toMatchObject({ state: 'job', job: 'j2' });
    expect(f.argsOf('oauthStart')).toEqual([[false, 'k1'], [false, 'k1']]);
    expect(p.replay).toBe(true);
  });
  it('a second lost answer is not confirmed, after exactly two sends', async () => {
    const f = fakeApi({ oauthStart: [lost()] });
    expect(await deviceStart(f.api, plan())).toEqual({ state: 'not_confirmed' });
    expect(f.count('oauthStart')).toBe(2);
  });
  it('does not replay once the drawer is gone', async () => {
    const f = fakeApi({ oauthStart: [lost()] });
    expect(await deviceStart(f.api, plan(), () => false)).toEqual({ state: 'not_confirmed' });
    expect(f.count('oauthStart')).toBe(1);
  });
  it('a refusal is failed and a stale answer ends quietly', async () => {
    expect(await deviceStart(fakeApi({ oauthStart: [refused('oauth_unsupported', 400)] }).api, plan())).toMatchObject({ state: 'failed', err: { code: 'oauth_unsupported' } });
    expect(await deviceStart(fakeApi({ oauthStart: [stale()] }).api, plan())).toEqual({ state: 'stale' });
  });
  it('carries "another" when a second account is added', async () => {
    const f = fakeApi({ oauthStart: [ok({ job_id: 'j' })] });
    await deviceStart(f.api, { idem: 'k', another: true, replay: false });
    expect(f.argsOf('oauthStart')[0]).toEqual([true, 'k']);
  });
});

describe('devicePoll', () => {
  const pending = (code?: string) => ok({ state: 'pending', ...(code ? { user_code: code } : {}) });
  const run = (f: Fake, e: FakeEnv, stop: Stop = { stopped: false }, on: (c: DeviceCode) => void = () => void 0) => devicePoll(f.api, e, 'j1', on, stop);

  it('polls every 3 seconds until complete', async () => {
    const f = fakeApi({ oauthPoll: [pending(), pending(), pending(), ok({ state: 'complete' })] });
    const e = fakeEnv();
    expect(await run(f, e)).toEqual({ state: 'complete' });
    expect(e.waits).toEqual([0, POLL_STEP, POLL_STEP, POLL_STEP]);
    expect(POLL_STEP).toBe(3000);
    expect(f.argsOf('oauthPoll')).toEqual([['j1'], ['j1'], ['j1'], ['j1']]);
  });
  it('an error state ends it, and each pending answer hands over its code', async () => {
    const seen: Array<string | null> = [];
    const f = fakeApi({ oauthPoll: [pending('ABCD-1234'), pending(), ok({ state: 'error' })] });
    expect(await run(f, fakeEnv(), { stopped: false }, (c) => seen.push(c.code))).toEqual({ state: 'error' });
    expect(seen).toEqual(['ABCD-1234', null]);
  });
  it('a 404 means the job is gone', async () => {
    expect(await run(fakeApi({ oauthPoll: [refused('job_not_found', 404)] }), fakeEnv())).toEqual({ state: 'gone' });
  });
  it('429 and 503 wait Retry-After, at most 10 seconds, and 6 seconds without one', async () => {
    for (const status of [429, 503]) {
      const f = fakeApi({ oauthPoll: [refused('x', status, { retryAfter: 30 }), refused('x', status, { retryAfter: 2 }), refused('x', status), ok({ state: 'complete' })] });
      const e = fakeEnv();
      await run(f, e);
      expect(e.waits).toEqual([0, 10000, 2000, 6000]);
    }
  });
  it('any other failure keeps polling at the normal step', async () => {
    const f = fakeApi({ oauthPoll: [lost(), refused('boom', 500), ok({ state: 'complete' })] });
    const e = fakeEnv();
    expect(await run(f, e)).toEqual({ state: 'complete' });
    expect(e.waits).toEqual([0, POLL_STEP, POLL_STEP]);
  });
  it('a stale answer ends it quietly', async () => {
    expect(await run(fakeApi({ oauthPoll: [stale()] }), fakeEnv())).toEqual({ state: 'stale' });
  });
  it('ends at 15 minutes', async () => {
    const f = fakeApi({ oauthPoll: [pending()] });
    const e = fakeEnv();
    expect(await run(f, e)).toEqual({ state: 'expired' });
    expect(LIFE).toBe(15 * 60000);
    expect(e.waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(LIFE);
    expect(f.count('oauthPoll')).toBe(LIFE / POLL_STEP);
  });
  it('a stop raised before the first poll sends nothing', async () => {
    const f = fakeApi();
    expect(await run(f, fakeEnv(), { stopped: true })).toEqual({ state: 'stopped' });
    expect(f.count('oauthPoll')).toBe(0);
  });
  it('a stop raised while a poll is out ends it without reading the answer', async () => {
    const stop: Stop = { stopped: false };
    const f = fakeApi({
      oauthPoll: [
        () => {
          stop.stopped = true;
          return ok({ state: 'complete' });
        },
      ],
    });
    expect(await run(f, fakeEnv(), stop)).toEqual({ state: 'stopped' });
  });
  it('a page that ended is stale, with no poll', async () => {
    const f = fakeApi();
    const e = fakeEnv();
    e.state.alive = false;
    expect(await run(f, e)).toEqual({ state: 'stale' });
    expect(f.count('oauthPoll')).toBe(0);
  });
  it('pauses once the page has been hidden for more than 60 seconds, and resumes when it shows again', async () => {
    const f = fakeApi({ oauthPoll: [pending()] });
    const e = fakeEnv();
    e.state.hidden = true;
    // The poll that follows the pause completes.
    let polls = 0;
    f.on('oauthPoll', () => (e.visibleCalls > 0 ? ok({ state: 'complete' }) : (polls++, pending())));
    expect(await run(f, e)).toEqual({ state: 'complete' });
    expect(e.visibleCalls).toBe(1);
    expect(HIDDEN_MAX).toBe(60000);
    // Hidden for 60 s polls roughly every 3 s before the pause.
    expect(polls).toBeGreaterThanOrEqual(HIDDEN_MAX / POLL_STEP);
    expect(polls).toBeLessThanOrEqual(HIDDEN_MAX / POLL_STEP + 2);
  });
  it('does not pause when the page shows again before the limit', async () => {
    const f = fakeApi({ oauthPoll: [pending()] });
    const e = fakeEnv({ onSleep: (_ms, n) => void (e.state.hidden = n % 4 !== 0) });
    f.on('oauthPoll', () => (f.count('oauthPoll') > 60 ? ok({ state: 'complete' }) : pending()));
    expect(await run(f, e)).toEqual({ state: 'complete' });
    expect(e.visibleCalls).toBe(0);
  });
});

describe('deviceCancel and jobEnd', () => {
  it('deviceCancel answers cancelled or complete (the sign-in won the race), else not confirmed', async () => {
    expect(await deviceCancel(fakeApi({ oauthCancel: [ok({ state: 'cancelled' })] }).api, 'j')).toEqual({ state: 'cancelled' });
    expect(await deviceCancel(fakeApi({ oauthCancel: [ok({ state: 'complete' })] }).api, 'j')).toEqual({ state: 'complete' });
    expect(await deviceCancel(fakeApi({ oauthCancel: [ok({ state: 'pending' })] }).api, 'j')).toEqual({ state: 'not_confirmed' });
    expect(await deviceCancel(fakeApi({ oauthCancel: [lost()] }).api, 'j')).toEqual({ state: 'not_confirmed' });
    expect(await deviceCancel(fakeApi({ oauthCancel: [refused('job_not_found', 404)] }).api, 'j')).toEqual({ state: 'not_confirmed' });
    expect(await deviceCancel(fakeApi({ oauthCancel: [stale()] }).api, 'j')).toEqual({ state: 'stale' });
  });
  it('deviceCancel sends the cancel once', async () => {
    const f = fakeApi({ oauthCancel: [lost()] });
    await deviceCancel(f.api, 'j');
    expect(f.count('oauthCancel')).toBe(1);
  });
  it('jobEnd reads the job: complete signed in; cancelled or error saved nothing; pending still waits; unreadable is unknown', async () => {
    const end = (a: Settled<unknown>) => jobEnd(fakeApi({ oauthPoll: [a] }).api, 'j');
    expect(await end(ok({ state: 'complete' }))).toEqual({ state: 'complete' });
    expect(await end(ok({ state: 'cancelled' }))).toEqual({ state: 'signed_out' });
    expect(await end(ok({ state: 'error' }))).toEqual({ state: 'signed_out' });
    expect(await end(ok({ state: 'pending' }))).toEqual({ state: 'pending' });
    expect(await end(ok({ state: 'odd' }))).toEqual({ state: 'not_confirmed' });
    expect(await end(lost())).toEqual({ state: 'not_confirmed' });
    expect(await end(stale())).toEqual({ state: 'stale' });
  });
  it('checkHeldJob reads the held job: complete, ended (cancelled or error), pending, or unknown; nothing once stale or superseded', async () => {
    const run = async (a: Settled<unknown>, on = () => true) => {
      const hit: string[] = [];
      await checkHeldJob(fakeApi({ oauthPoll: [a] }).api, 'j', on, { complete: () => hit.push('complete'), ended: () => hit.push('ended'), pending: () => hit.push('pending'), unknown: () => hit.push('unknown') });
      return hit;
    };
    expect(await run(ok({ state: 'complete' }))).toEqual(['complete']);
    expect(await run(ok({ state: 'cancelled' }))).toEqual(['ended']);
    expect(await run(ok({ state: 'error' }))).toEqual(['ended']);
    expect(await run(ok({ state: 'pending' }))).toEqual(['pending']);
    expect(await run(lost())).toEqual(['unknown']);
    expect(await run(stale())).toEqual([]);
    expect(await run(ok({ state: 'complete' }), () => false)).toEqual([]);
  });
});

describe('readAuth, signedIn and setDefault', () => {
  it('readAuth returns the auth block, or not confirmed / stale', async () => {
    expect(await readAuth(fakeApi({ auth: [ok({ auth: { ready: true } })] }).api, 'openai')).toEqual({ state: 'ok', auth: { ready: true } });
    expect(await readAuth(fakeApi({ auth: [ok({})] }).api, 'openai')).toEqual({ state: 'not_confirmed' });
    expect(await readAuth(fakeApi({ auth: [lost()] }).api, 'openai')).toEqual({ state: 'not_confirmed' });
    expect(await readAuth(fakeApi({ auth: [stale()] }).api, 'openai')).toEqual({ state: 'stale' });
  });
  it('signedIn reads OpenAI oauth_stored', async () => {
    const f = fakeApi({ auth: [ok({ auth: { oauth_stored: true } })] });
    expect(await signedIn(f.api)).toEqual({ state: 'signed_in' });
    expect(f.argsOf('auth')).toEqual([['openai']]);
    expect(await signedIn(fakeApi({ auth: [ok({ auth: { oauth_stored: false } })] }).api)).toEqual({ state: 'signed_out' });
    expect(await signedIn(fakeApi({ auth: [ok({ auth: {} })] }).api)).toEqual({ state: 'not_confirmed' });
  });
  it('setDefault is saved only when the read-back shows the choice', async () => {
    const f = fakeApi({ authDefault: [ok()], auth: [ok({ auth: { default: 'oauth' } })] });
    expect(await setDefault(f.api, 'oauth')).toEqual({ state: 'saved' });
    expect(f.argsOf('authDefault')).toEqual([['oauth']]);
    expect(await setDefault(fakeApi({ authDefault: [ok()], auth: [ok({ auth: { default: 'api_key' } })] }).api, 'oauth')).toEqual({ state: 'not_confirmed' });
    expect(await setDefault(fakeApi({ authDefault: [ok()], auth: [ok({ auth: {} })] }).api, 'oauth')).toEqual({ state: 'not_confirmed' });
  });
  it('setDefault reads back a lost answer, sends once, and reports a refusal without reading', async () => {
    const f = fakeApi({ authDefault: [lost()], auth: [ok({ auth: { default: 'api_key' } })] });
    expect(await setDefault(f.api, 'api_key')).toEqual({ state: 'saved' });
    expect(f.count('authDefault')).toBe(1);
    const g = fakeApi({ authDefault: [refused('credential_not_stored', 409)] });
    expect(await setDefault(g.api, 'oauth')).toMatchObject({ state: 'failed', err: { code: 'credential_not_stored' } });
    expect(g.count('auth')).toBe(0);
    expect(await setDefault(fakeApi({ authDefault: [stale()] }).api, 'oauth')).toEqual({ state: 'stale' });
    expect(await setDefault(fakeApi({ authDefault: [ok()], auth: [lost()] }).api, 'oauth')).toEqual({ state: 'not_confirmed' });
  });
});

// ── own endpoint ──────────────────────────────────────────────────────────────────────────

const DEF: EndpointDef = { name: 'My Endpoint', base_url: 'https://api.example.com/v1', models: ['m1', 'm2'], wire: 'chat_completions' };
const providerRow = (over: Record<string, unknown> = {}) => ({
  id: 'my-endpoint',
  prefix: 'my-endpoint/',
  display_name: 'My Endpoint',
  definition_rev: 'rev-1',
  custom_definition: { wire_format: 'chat_completions', auth_scheme: 'bearer', base_url: 'https://api.example.com/v1', header_names: [] },
  models: [{ spec: 'my-endpoint/m1' }, { spec: 'my-endpoint/m2' }],
  ...over,
});

describe('parseEndpoint and slug', () => {
  const form = (over: Partial<{ name: string; address: string; models: string; wire: string }> = {}) => ({ name: 'My Endpoint', address: 'https://api.example.com/v1', models: 'm1\nm2', wire: 'messages', ...over });
  it('accepts a valid form and trims, dedupes and defaults the wire', () => {
    expect(parseEndpoint(form({ name: ' X ', models: ' a \n\nb\na\r\nc ', wire: 'nope' }))).toEqual({ def: { name: 'X', base_url: 'https://api.example.com/v1', models: ['a', 'b', 'c'], wire: 'chat_completions' } });
    expect(parseEndpoint(form())).toMatchObject({ def: { wire: 'messages' } });
  });
  it('names the bad fields', () => {
    expect(parseEndpoint(form({ name: '  ' }))).toEqual({ bad: { display_name: true } });
    expect(parseEndpoint(form({ name: 'x'.repeat(81) }))).toEqual({ bad: { display_name: true } });
    for (const address of ['http://a.com', 'https://', 'https://u@a.com', 'https://a.com/x?y', 'https://a.com/x#y', 'https://a.com/${KEY}', 'ftp://a.com', `https://a.com/${'x'.repeat(520)}`, 'https://a b.com'])
      expect(parseEndpoint(form({ address }))).toEqual({ bad: { base_url: true } });
    for (const models of ['', '  \n ', 'a b', `x`.repeat(201), 'a\u0007b'])
      expect(parseEndpoint(form({ models }))).toEqual({ bad: { models: true } });
    expect(parseEndpoint(form({ models: Array.from({ length: 501 }, (_, i) => `m${i}`).join('\n') }))).toEqual({ bad: { models: true } });
    expect(parseEndpoint({ name: '', address: 'x', models: '', wire: '' })).toEqual({ bad: { display_name: true, base_url: true, models: true } });
  });
  it('slug makes an id from a name', () => {
    expect(slug('My Endpoint')).toBe('my-endpoint');
    expect(slug('  Ünï Çode!! ')).toBe('uni-code');
    expect(slug('!!!')).toBe('endpoint');
    expect(slug('a'.repeat(50))).toHaveLength(36);
    expect(slug('a'.repeat(35) + '--b')).toBe('a'.repeat(35));
  });
});

describe('planEndpoint', () => {
  it('picks the slug, then -2, -3 against every id and prefix taken, and reserves fusion', async () => {
    const f = fakeApi({ providers: [ok({ items: [{ id: 'my-endpoint' }, { id: 'x', prefix: 'my-endpoint-2/' }] })] });
    const r = await planEndpoint(f.api, DEF, 'k1');
    expect(r).toMatchObject({ state: 'plan', plan: { id: 'my-endpoint-3', idem: 'k1', replay: false } });
    if (r.state !== 'plan') throw new Error('no plan');
    expect(r.plan.body).toEqual({
      id: 'my-endpoint-3',
      model_prefix: 'my-endpoint-3',
      display_name: 'My Endpoint',
      wire_format: 'chat_completions',
      base_url: 'https://api.example.com/v1',
      models: [{ model: 'm1' }, { model: 'm2' }],
    });
    const g = await planEndpoint(fakeApi({ providers: [ok({ items: [] })] }).api, { ...DEF, name: 'Fusion' }, 'k');
    expect(g).toMatchObject({ state: 'plan', plan: { id: 'fusion-2' } });
  });
  it('the same name and address already there (under custom_definition) is name_taken, never a -2 copy', async () => {
    const f = fakeApi({ providers: [ok({ items: [providerRow()] })] });
    expect(await planEndpoint(f.api, DEF, 'k')).toEqual({ state: 'name_taken' });
  });
  it('is not confirmed when the list cannot be read, stale when stale, name_taken when 99 are taken', async () => {
    expect(await planEndpoint(fakeApi({ providers: [lost()] }).api, DEF, 'k')).toEqual({ state: 'not_confirmed' });
    expect(await planEndpoint(fakeApi({ providers: [stale()] }).api, DEF, 'k')).toEqual({ state: 'stale' });
    const ids = ['my-endpoint', ...Array.from({ length: 98 }, (_, i) => `my-endpoint-${i + 2}`)].map((id) => ({ id }));
    expect(await planEndpoint(fakeApi({ providers: [ok({ items: ids })] }).api, DEF, 'k')).toEqual({ state: 'name_taken' });
  });
});

describe('createEndpoint', () => {
  const plan = (): CreatePlan => ({
    id: 'my-endpoint',
    idem: 'k1',
    replay: false,
    body: { id: 'my-endpoint', model_prefix: 'my-endpoint', display_name: 'My Endpoint', wire_format: 'chat_completions', base_url: 'https://api.example.com/v1', models: [{ model: 'm1' }, { model: 'm2' }] },
  });
  it('creates once and reports the definition revision', async () => {
    const f = fakeApi({ customCreate: [ok({ provider: { definition_rev: 'rev-1' } })] });
    expect(await createEndpoint(f.api, plan())).toEqual({ state: 'created', rev: 'rev-1' });
    expect(f.argsOf('customCreate')).toEqual([[plan().body, 'k1']]);
    expect(await createEndpoint(fakeApi({ customCreate: [ok({})] }).api, plan())).toEqual({ state: 'created', rev: null });
  });
  it('a lost answer replays once with the same key and body', async () => {
    const f = fakeApi({ customCreate: [lost(), ok({ provider: { definition_rev: 'r' } })] });
    const p = plan();
    expect(await createEndpoint(f.api, p)).toEqual({ state: 'created', rev: 'r' });
    expect(f.argsOf('customCreate')).toEqual([[plan().body, 'k1'], [plan().body, 'k1']]);
    expect(p.replay).toBe(true);
  });
  it('two lost answers are not confirmed after two sends; a gone drawer does not replay', async () => {
    const f = fakeApi({ customCreate: [lost()] });
    expect(await createEndpoint(f.api, plan())).toEqual({ state: 'not_confirmed' });
    expect(f.count('customCreate')).toBe(2);
    const g = fakeApi({ customCreate: [lost()] });
    expect(await createEndpoint(g.api, plan(), () => false)).toEqual({ state: 'not_confirmed' });
    expect(g.count('customCreate')).toBe(1);
  });
  it('a replay that fails after an unknown first send keeps the hold: it is not_confirmed, never failed or not sent', async () => {
    for (const second of [out('not_sent'), out('failed', 'store_failed', 500), refused('rate_limited', 429)]) {
      const f = fakeApi({ customCreate: [lost(), second] });
      expect(await createEndpoint(f.api, plan())).toEqual({ state: 'not_confirmed' });
    }
  });
  it('a definition error on the replay is still invalid (the first send would have been refused the same way)', async () => {
    const f = fakeApi({ customCreate: [lost(), refused('provider_invalid', 422, { details: { field: 'base_url' } })] });
    expect(await createEndpoint(f.api, plan())).toEqual({ state: 'invalid', field: 'base_url' });
  });
  it('a taken name on the first send is name_taken, never adopted', async () => {
    for (const code of ['provider_exists', 'model_prefix_taken']) {
      const f = fakeApi({ customCreate: [refused(code, 409)] });
      expect(await createEndpoint(f.api, plan())).toEqual({ state: 'name_taken' });
      expect(f.count('provider')).toBe(0);
    }
  });
  it('a taken name on the replay adopts the endpoint only when its definition equals the plan', async () => {
    const f = fakeApi({ customCreate: [lost(), refused('provider_exists', 409)], provider: [ok({ provider: providerRow() })] });
    expect(await createEndpoint(f.api, plan())).toEqual({ state: 'created', rev: 'rev-1' });
    expect(f.argsOf('provider')).toEqual([['my-endpoint']]);
  });
  it('adoption refuses a different endpoint', async () => {
    const differ: Array<Record<string, unknown>> = [
      providerRow({ display_name: 'Other' }),
      providerRow({ models: [{ spec: 'my-endpoint/m1' }] }),
      providerRow({ custom_definition: { wire_format: 'chat_completions', auth_scheme: 'bearer', base_url: 'https://evil.example.com/v1', header_names: [] } }),
      providerRow({ custom_definition: { wire_format: 'messages', auth_scheme: 'x-api-key', base_url: 'https://api.example.com/v1', header_names: [] } }),
      providerRow({ custom_definition: { wire_format: 'chat_completions', auth_scheme: 'x-api-key', base_url: 'https://api.example.com/v1', header_names: [] } }),
      providerRow({ custom_definition: { wire_format: 'chat_completions', auth_scheme: 'bearer', base_url: 'https://api.example.com/v1', header_names: ['X-Extra'] } }),
      providerRow({ prefix: 'other/' }),
    ];
    for (const row of differ) {
      const f = fakeApi({ customCreate: [lost(), refused('provider_exists', 409)], provider: [ok({ provider: row })] });
      expect(await createEndpoint(f.api, plan())).toEqual({ state: 'other_endpoint' });
    }
  });
  it('adoption accepts the same models in another order', async () => {
    const f = fakeApi({ customCreate: [lost(), refused('provider_exists', 409)], provider: [ok({ provider: providerRow({ models: [{ spec: 'my-endpoint/m2' }, { spec: 'my-endpoint/m1' }] }) })] });
    expect(await createEndpoint(f.api, plan())).toMatchObject({ state: 'created' });
  });
  it('adoption without a readable custom definition is not confirmed, and a stale read ends it', async () => {
    const mk = (p: Settled<unknown>) => fakeApi({ customCreate: [lost(), refused('provider_exists', 409)], provider: [p] });
    expect(await createEndpoint(mk(ok({ provider: { id: 'my-endpoint' } })).api, plan())).toEqual({ state: 'not_confirmed' });
    expect(await createEndpoint(mk(lost()).api, plan())).toEqual({ state: 'not_confirmed' });
    expect(await createEndpoint(mk(stale()).api, plan())).toEqual({ state: 'stale' });
  });
  it('invalid names the field; other refusals are failed; stale ends quietly', async () => {
    expect(await createEndpoint(fakeApi({ customCreate: [refused('provider_invalid', 400, { details: { field: 'base_url' } })] }).api, plan())).toEqual({ state: 'invalid', field: 'base_url' });
    expect(await createEndpoint(fakeApi({ customCreate: [refused('provider_invalid', 400)] }).api, plan())).toEqual({ state: 'invalid', field: '' });
    expect(await createEndpoint(fakeApi({ customCreate: [refused('forbidden', 403)] }).api, plan())).toMatchObject({ state: 'failed', err: { code: 'forbidden' } });
    expect(await createEndpoint(fakeApi({ customCreate: [stale()] }).api, plan())).toEqual({ state: 'stale' });
  });
});

describe('editEndpoint', () => {
  const before: Saved = { name: 'My Endpoint', base_url: 'https://api.example.com/v1', models: ['m1', 'm2'] };
  it('sends nothing when nothing changed, and models in another order are not a change', async () => {
    const f = fakeApi();
    expect(await editEndpoint(f.api, 'my-endpoint', before, { ...before, models: ['m2', 'm1'] })).toEqual({ state: 'unchanged' });
    expect(f.calls).toEqual([]);
  });
  it('sends only the changed fields', async () => {
    const f = fakeApi({ customPatch: [ok()] });
    expect(await editEndpoint(f.api, 'my-endpoint', before, { ...before, name: 'New name' })).toEqual({ state: 'saved' });
    expect(await editEndpoint(f.api, 'my-endpoint', before, { ...before, base_url: 'https://b.example.com' })).toEqual({ state: 'saved' });
    expect(await editEndpoint(f.api, 'my-endpoint', before, { ...before, models: ['m1', 'm3'] })).toEqual({ state: 'saved' });
    expect(f.argsOf('customPatch')).toEqual([
      ['my-endpoint', { display_name: 'New name' }],
      ['my-endpoint', { base_url: 'https://b.example.com' }],
      ['my-endpoint', { models: [{ model: 'm1' }, { model: 'm3' }] }],
    ]);
  });
  it('a lost answer is read back: saved when the endpoint shows the change, else not confirmed; sent once', async () => {
    const after = { ...before, name: 'New name' };
    const f = fakeApi({ customPatch: [lost()], provider: [ok({ provider: providerRow({ display_name: 'New name' }) })] });
    expect(await editEndpoint(f.api, 'my-endpoint', before, after)).toEqual({ state: 'saved' });
    expect(f.count('customPatch')).toBe(1);
    const g = fakeApi({ customPatch: [lost()], provider: [ok({ provider: providerRow() })] });
    expect(await editEndpoint(g.api, 'my-endpoint', before, after)).toEqual({ state: 'not_confirmed' });
    expect(await editEndpoint(fakeApi({ customPatch: [lost()], provider: [lost()] }).api, 'my-endpoint', before, after)).toEqual({ state: 'not_confirmed' });
    expect(await editEndpoint(fakeApi({ customPatch: [lost()], provider: [stale()] }).api, 'my-endpoint', before, after)).toEqual({ state: 'stale' });
  });
  it('invalid names the field, a refusal is failed, stale ends quietly', async () => {
    const after = { ...before, name: 'N' };
    expect(await editEndpoint(fakeApi({ customPatch: [refused('provider_invalid', 400, { details: { field: 'models' } })] }).api, 'p', before, after)).toEqual({ state: 'invalid', field: 'models' });
    expect(await editEndpoint(fakeApi({ customPatch: [refused('definition_changed', 409)] }).api, 'p', before, after)).toMatchObject({ state: 'failed', err: { code: 'definition_changed' } });
    expect(await editEndpoint(fakeApi({ customPatch: [stale()] }).api, 'p', before, after)).toEqual({ state: 'stale' });
  });
});

describe('readEndpoint, modelsOf and deleteEndpoint', () => {
  it('readEndpoint returns the saved definition and revision', async () => {
    const r = await readEndpoint(fakeApi({ provider: [ok({ provider: providerRow() })] }).api, 'my-endpoint');
    expect(r).toEqual({ state: 'ok', rev: 'rev-1', def: { name: 'My Endpoint', base_url: 'https://api.example.com/v1', wire: 'chat_completions', models: ['m1', 'm2'], meta: new Map([['m1', {}], ['m2', {}]]) } });
    // No custom_definition (a built-in, or an agent from before it): a read like any failed one.
    expect(await readEndpoint(fakeApi({ provider: [ok({ provider: { id: 'x' } })] }).api, 'x')).toEqual({ state: 'failed' });
    expect(await readEndpoint(fakeApi({ provider: [lost()] }).api, 'x')).toEqual({ state: 'failed' });
    expect(await readEndpoint(fakeApi({ provider: [stale()] }).api, 'x')).toEqual({ state: 'stale' });
  });
  it('modelsOf strips the prefix and ignores other prefixes', () => {
    expect(modelsOf({ models: [{ spec: 'a/x' }, { spec: 'b/y' }, {}, null] }, 'a')).toEqual(['x']);
    expect(modelsOf(null, 'a')).toEqual([]);
  });
  it('deleteEndpoint: saved on success or 404, failed on another refusal, stale ends quietly', async () => {
    expect(await deleteEndpoint(fakeApi({ customDelete: [ok()] }).api, 'p')).toEqual({ state: 'saved' });
    expect(await deleteEndpoint(fakeApi({ customDelete: [refused('not_found', 404)] }).api, 'p')).toEqual({ state: 'saved' });
    expect(await deleteEndpoint(fakeApi({ customDelete: [refused('provider_builtin', 409)] }).api, 'p')).toMatchObject({ state: 'failed', err: { code: 'provider_builtin' } });
    expect(await deleteEndpoint(fakeApi({ customDelete: [stale()] }).api, 'p')).toEqual({ state: 'stale' });
  });
  it('a lost delete answer is read back from the list and never resent', async () => {
    const f = fakeApi({ customDelete: [lost()], providers: [ok({ items: [{ id: 'other' }] })] });
    expect(await deleteEndpoint(f.api, 'p')).toEqual({ state: 'saved' });
    expect(f.count('customDelete')).toBe(1);
    expect(await deleteEndpoint(fakeApi({ customDelete: [lost()], providers: [ok({ items: [{ id: 'p' }] })] }).api, 'p')).toEqual({ state: 'not_confirmed' });
    expect(await deleteEndpoint(fakeApi({ customDelete: [lost()], providers: [lost()] }).api, 'p')).toEqual({ state: 'not_confirmed' });
  });
  it('a lost delete is saved only by a list read whole: no list, or a row with no id, proves nothing', async () => {
    for (const body of [{}, { items: 'p' }, { providers: { p: {} } }, { items: [{ id: 'other' }, { display_name: 'P' }] }, { items: [null] }]) {
      const f = fakeApi({ customDelete: [lost()], providers: [ok(body)] });
      expect(await deleteEndpoint(f.api, 'p')).toEqual({ state: 'not_confirmed' });
      expect(f.count('customDelete')).toBe(1);
    }
    expect(await deleteEndpoint(fakeApi({ customDelete: [lost()], providers: [ok({ providers: [{ id: 'other' }] })] }).api, 'p')).toEqual({ state: 'saved' });
  });
});

// ── disconnect ────────────────────────────────────────────────────────────────────────────

describe('disconnect and confirmGone', () => {
  const acc = (over: Partial<Account>): Account => ({ id: 'anthropic', prefix: 'anthropic', label: 'Anthropic', ready: true, pay: 'own_key', custom: false, via: 'stored_key', status: 'ready', ...over });
  const KEYACC = acc({});
  const SIGNIN = acc({ id: 'openai', prefix: 'openai', via: 'signin', pay: 'plan' });
  const ENDPOINT = acc({ id: 'my-endpoint', custom: true, via: null, pay: 'unknown' });

  it('removes a key, signs out of ChatGPT and deletes an endpoint through their own calls', async () => {
    const f = fakeApi();
    expect(await disconnect(f.api, KEYACC)).toEqual({ state: 'removed' });
    expect(await disconnect(f.api, SIGNIN)).toEqual({ state: 'removed' });
    expect(await disconnect(f.api, ENDPOINT)).toEqual({ state: 'removed' });
    expect(f.calls.map((c) => c.name)).toEqual(['keyDelete', 'signOut', 'customDelete']);
    expect(f.argsOf('keyDelete')).toEqual([['anthropic']]);
    expect(f.argsOf('customDelete')).toEqual([['my-endpoint']]);
  });
  it('a 404 means it is already gone; another refusal is failed; stale ends quietly', async () => {
    expect(await disconnect(fakeApi({ keyDelete: [refused('credential_not_stored', 404)] }).api, KEYACC)).toEqual({ state: 'removed' });
    expect(await disconnect(fakeApi({ keyDelete: [refused('forbidden', 403)] }).api, KEYACC)).toMatchObject({ state: 'failed', err: { code: 'forbidden' } });
    expect(await disconnect(fakeApi({ keyDelete: [stale()] }).api, KEYACC)).toEqual({ state: 'stale' });
    expect(await disconnect(fakeApi({ customDelete: [refused('provider_builtin', 409)] }).api, ENDPOINT)).toMatchObject({ state: 'failed' });
  });
  it('a lost key removal is read back from the stored flag and never resent', async () => {
    const f = fakeApi({ keyDelete: [lost()], auth: [ok({ auth: { api_key_stored: false } })] });
    expect(await disconnect(f.api, KEYACC)).toEqual({ state: 'removed' });
    expect(f.count('keyDelete')).toBe(1);
    expect(f.argsOf('auth')).toEqual([['anthropic']]);
    expect(await disconnect(fakeApi({ keyDelete: [lost()], auth: [ok({ auth: { api_key_stored: true } })] }).api, KEYACC)).toEqual({ state: 'not_confirmed' });
    expect(await disconnect(fakeApi({ keyDelete: [lost()], auth: [ok({ auth: {} })] }).api, KEYACC)).toEqual({ state: 'not_confirmed' });
    expect(await disconnect(fakeApi({ keyDelete: [lost()], auth: [lost()] }).api, KEYACC)).toEqual({ state: 'not_confirmed' });
    expect(await disconnect(fakeApi({ keyDelete: [lost()], auth: [stale()] }).api, KEYACC)).toEqual({ state: 'stale' });
  });
  it('a lost sign-out reads oauth_stored; a lost endpoint delete reads the list', async () => {
    const s = fakeApi({ signOut: [lost()], auth: [ok({ auth: { oauth_stored: false, api_key_stored: true } })] });
    expect(await disconnect(s.api, SIGNIN)).toEqual({ state: 'removed' });
    expect(s.count('signOut')).toBe(1);
    expect(await disconnect(fakeApi({ signOut: [lost()], auth: [ok({ auth: { oauth_stored: true } })] }).api, SIGNIN)).toEqual({ state: 'not_confirmed' });
    const e = fakeApi({ customDelete: [lost()], providers: [ok({ items: [] })] });
    expect(await disconnect(e.api, ENDPOINT)).toEqual({ state: 'removed' });
    expect(e.count('customDelete')).toBe(1);
    expect(await disconnect(fakeApi({ customDelete: [lost()], providers: [ok({ items: [{ id: 'my-endpoint' }] })] }).api, ENDPOINT)).toEqual({ state: 'not_confirmed' });
  });
  it('confirmGone only reads: it never sends a removal', async () => {
    const f = fakeApi({ auth: [ok({ auth: { api_key_stored: false } })], providers: [ok({ providers: [] })] });
    expect(await confirmGone(f.api, KEYACC.id, 'key')).toEqual({ state: 'removed' });
    expect(await confirmGone(f.api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'removed' });
    expect(f.calls.map((c) => c.name)).toEqual(['auth', 'providers']);
    const g = fakeApi({ auth: [ok({ auth: { oauth_stored: true } })], providers: [ok({ items: [{ id: 'my-endpoint' }] })] });
    expect(await confirmGone(g.api, SIGNIN.id, 'signin')).toEqual({ state: 'present' });
    expect(await confirmGone(g.api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'present' });
    for (const w of ['keyDelete', 'signOut', 'customDelete'] as const) expect(g.count(w)).toBe(0);
  });
  it('confirmGone says present only for a flag that reads true; a missing flag proves neither', async () => {
    expect(await confirmGone(fakeApi({ auth: [ok({ auth: { api_key_stored: true } })] }).api, KEYACC.id, 'key')).toEqual({ state: 'present' });
    expect(await confirmGone(fakeApi({ auth: [ok({ auth: {} })] }).api, KEYACC.id, 'key')).toEqual({ state: 'not_confirmed' });
    expect(await confirmGone(fakeApi({ auth: [ok({ auth: { oauth_stored: 'yes' } })] }).api, SIGNIN.id, 'signin')).toEqual({ state: 'not_confirmed' });
  });
  it('confirmGone reads an endpoint list as providers first, then items, when a body carries both', async () => {
    expect(await confirmGone(fakeApi({ providers: [ok({ providers: [{ id: 'my-endpoint' }], items: [] })] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'present' });
    expect(await confirmGone(fakeApi({ providers: [ok({ providers: [], items: [{ id: 'my-endpoint' }] })] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'removed' });
  });
  it('confirmGone is not confirmed on an unreadable answer and stale on a stale one', async () => {
    expect(await confirmGone(fakeApi({ auth: [lost()] }).api, KEYACC.id, 'key')).toEqual({ state: 'not_confirmed' });
    expect(await confirmGone(fakeApi({ providers: [lost()] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'not_confirmed' });
    expect(await confirmGone(fakeApi({ auth: [stale()] }).api, KEYACC.id, 'key')).toEqual({ state: 'stale' });
    expect(await confirmGone(fakeApi({ providers: [stale()] }).api, ENDPOINT.id, 'endpoint')).toEqual({ state: 'stale' });
  });
});

// ── default model ─────────────────────────────────────────────────────────────────────────

describe('setModel and confirmModel', () => {
  const agents = (model: string | undefined) => ok({ items: [{ name: 'general', ...(model ? { model } : {}) }, { name: 'bot', model: 'x/y' }] });
  const GUARD = { defaultAgent: 'general' };
  it('is saved only when the agent list shows the chosen model', async () => {
    const f = fakeApi({ agentModel: [ok()], agents: [agents('openai/gpt-5.5')] });
    expect(await setModel(f.api, 'global', 'general', 'openai/gpt-5.5', GUARD)).toEqual({ state: 'saved' });
    expect(f.argsOf('agentModel')).toEqual([['global', 'general', 'openai/gpt-5.5', GUARD]]);
    expect(f.argsOf('agents')).toEqual([['global']]);
    expect(await setModel(fakeApi({ agentModel: [ok()], agents: [agents('other/m')] }).api, 'global', 'general', 'openai/gpt-5.5', GUARD)).toEqual({ state: 'not_confirmed' });
    expect(await setModel(fakeApi({ agentModel: [ok()], agents: [agents(undefined)] }).api, 'global', 'general', 'openai/gpt-5.5', GUARD)).toEqual({ state: 'not_confirmed' });
    expect(await setModel(fakeApi({ agentModel: [ok()], agents: [lost()] }).api, 'global', 'general', 'openai/gpt-5.5', GUARD)).toEqual({ state: 'not_confirmed' });
  });
  it('a lost answer is read back and the pick is sent once', async () => {
    const f = fakeApi({ agentModel: [lost()], agents: [agents('openai/gpt-5.5')] });
    expect(await setModel(f.api, 'global', 'general', 'openai/gpt-5.5', GUARD)).toEqual({ state: 'saved' });
    expect(f.count('agentModel')).toBe(1);
  });
  it('a refusal is failed and reads nothing; stale ends quietly', async () => {
    const f = fakeApi({ agentModel: [refused('model_unavailable', 422, { details: { reason: 'no_credentials' } })] });
    expect(await setModel(f.api, 'global', 'general', 'openai/gpt-5.5', GUARD)).toMatchObject({ state: 'failed', err: { code: 'model_unavailable' } });
    expect(f.count('agents')).toBe(0);
    expect(await setModel(fakeApi({ agentModel: [stale()] }).api, 'global', 'general', 'a/b', GUARD)).toEqual({ state: 'stale' });
  });
  it('confirmModel only reads the agent list and never sends the pick', async () => {
    const f = fakeApi({ agents: [agents('openai/gpt-5.5')] });
    expect(await confirmModel(f.api, 'global', 'general', 'openai/gpt-5.5')).toEqual({ state: 'saved' });
    expect(f.calls.map((c) => c.name)).toEqual(['agents']);
    expect(await confirmModel(fakeApi({ agents: [agents('x/y')] }).api, 'global', 'general', 'openai/gpt-5.5')).toEqual({ state: 'not_confirmed' });
    expect(await confirmModel(fakeApi({ agents: [lost()] }).api, 'global', 'general', 'a/b')).toEqual({ state: 'not_confirmed' });
    expect(await confirmModel(fakeApi({ agents: [stale()] }).api, 'global', 'general', 'a/b')).toEqual({ state: 'stale' });
  });
});

// ── Claude Code ───────────────────────────────────────────────────────────────────────────

describe('confirmEnabled and confirmBackend (Check again reads only)', () => {
  it('saved only when the read shows the asked state, and never sends', async () => {
    const f = fakeApi({ acp: [ok({ report: { agents: [{ name: 'claude', enabled: true }] } })] });
    expect(await confirmEnabled(f.api, 'global', true)).toEqual({ state: 'saved' });
    expect(f.count('acpEnabled')).toBe(0);
    expect(await confirmEnabled(fakeApi({ acp: [ok({ report: { agents: [{ name: 'claude', enabled: false }] } })] }).api, 'global', true)).toEqual({ state: 'not_confirmed' });
    const g = fakeApi({ acpDefault: [ok({ delegated_agent: 'claude' })] });
    expect(await confirmBackend(g.api, 'global', 'claude')).toEqual({ state: 'saved' });
    expect(g.count('acpDefaultPut')).toBe(0);
    expect(await confirmBackend(fakeApi({ acpDefault: [ok({ delegated_agent: '' })] }).api, 'global', 'claude')).toEqual({ state: 'not_confirmed' });
  });
});

describe('setEnabled and setBackend', () => {
  it('setEnabled is saved only when the read-back shows the state, and sends once', async () => {
    const f = fakeApi({ acpEnabled: [ok()], acp: [ok({ report: { agents: [{ name: 'claude', enabled: true }] } })] });
    expect(await setEnabled(f.api, 'global', true)).toEqual({ state: 'saved' });
    expect(f.argsOf('acpEnabled')).toEqual([['global', true]]);
    expect(await setEnabled(fakeApi({ acpEnabled: [ok()], acp: [ok({ report: { agents: [{ name: 'claude', enabled: false }] } })] }).api, 'global', true)).toEqual({ state: 'not_confirmed' });
    const g = fakeApi({ acpEnabled: [lost()], acp: [ok({ report: { agents: [{ name: 'claude', enabled: false }] } })] });
    expect(await setEnabled(g.api, 'global', false)).toEqual({ state: 'saved' });
    expect(g.count('acpEnabled')).toBe(1);
    expect(await setEnabled(fakeApi({ acpEnabled: [lost()], acp: [lost()] }).api, 'global', true)).toEqual({ state: 'not_confirmed' });
  });
  it('setEnabled reports a refusal without reading, and a stale answer quietly', async () => {
    const f = fakeApi({ acpEnabled: [refused('unknown_agent', 404)] });
    expect(await setEnabled(f.api, 'global', true)).toMatchObject({ state: 'failed', err: { code: 'unknown_agent' } });
    expect(f.count('acp')).toBe(0);
    expect(await setEnabled(fakeApi({ acpEnabled: [stale()] }).api, 'global', true)).toEqual({ state: 'stale' });
  });
  it('setBackend is saved when the read-back shows the agent; choosing the built-in backend reads an empty answer', async () => {
    const f = fakeApi({ acpDefaultPut: [ok()], acpDefault: [ok({ delegated_agent: 'claude' })] });
    expect(await setBackend(f.api, R1, 'claude')).toEqual({ state: 'saved' });
    expect(f.argsOf('acpDefaultPut')).toEqual([[R1, 'claude']]);
    for (const body of [{ delegated_agent: '' }, { delegated_agent: null }, {}]) expect(await setBackend(fakeApi({ acpDefaultPut: [ok()], acpDefault: [ok(body)] }).api, R1, '')).toEqual({ state: 'saved' });
    expect(await setBackend(fakeApi({ acpDefaultPut: [ok()], acpDefault: [ok({ delegated_agent: 'claude' })] }).api, R1, '')).toEqual({ state: 'not_confirmed' });
    expect(await setBackend(fakeApi({ acpDefaultPut: [ok()], acpDefault: [ok({ delegated_agent: '' })] }).api, R1, 'claude')).toEqual({ state: 'not_confirmed' });
    expect(await setBackend(fakeApi({ acpDefaultPut: [ok()], acpDefault: [lost()] }).api, R1, '')).toEqual({ state: 'not_confirmed' });
  });
  it('setBackend reads back a lost answer once, never resends, and reports refusals', async () => {
    const f = fakeApi({ acpDefaultPut: [lost()], acpDefault: [ok({ delegated_agent: 'claude' })] });
    expect(await setBackend(f.api, 'global', 'claude')).toEqual({ state: 'saved' });
    expect(f.count('acpDefaultPut')).toBe(1);
    expect(await setBackend(fakeApi({ acpDefaultPut: [refused('delegated_agent_unavailable', 422)] }).api, 'global', 'claude')).toMatchObject({ state: 'failed' });
    expect(await setBackend(fakeApi({ acpDefaultPut: [stale()] }).api, 'global', 'claude')).toEqual({ state: 'stale' });
  });
});

describe('setupDone (the setup watch settles on it)', () => {
  const cc = (state: ClaudeCode['state']) => ({ state }) as ClaudeCode;
  it('a sign-in is done only once Claude Code reads signed in; an install once it reads installed and current', () => {
    expect(setupDone('login', cc('signed_in'))).toBe(true);
    for (const st of ['signed_out', 'sign_in_unknown', 'unknown', 'check_failed', 'not_installed', 'outdated', 'agent_update', 'unavailable'] as const) expect(setupDone('login', cc(st))).toBe(false);
    for (const st of ['signed_in', 'signed_out', 'sign_in_unknown'] as const) expect(setupDone('install', cc(st))).toBe(true);
    for (const st of ['unknown', 'check_failed', 'not_installed', 'outdated', 'agent_update', 'unavailable'] as const) expect(setupDone('install', cc(st))).toBe(false);
  });
});

describe('typeSetup', () => {
  const OWNED = { n: 15007, inc: 'inc-1' };
  // What the terminal kit answers to a create: {status, terminal_id, incarnation, ...}.
  const created = (n: number, inc = 'inc-1') => ok({ status: 'ok', terminal_id: String(n), pid: 1, incarnation: inc });
  const fresh = (over: Partial<Record<'termCaps' | 'termCreate' | 'termWait' | 'termWrite', Settled<unknown>>> = {}) =>
    fakeApi({ termCaps: [over.termCaps ?? ok()], termCreate: [over.termCreate ?? created(OWNED.n)], termWait: [over.termWait ?? ok()], termWrite: [over.termWrite ?? ok()] });

  it('opens an owned terminal and writes the fixed command once (Enter is the write\'s flag, never in the text)', async () => {
    for (const step of ['install', 'login'] as const) {
      const f = fresh();
      const r = await typeSetup(f.api, step, 'setup-user', null);
      const made = (f.argsOf('termCreate')[0] ?? [])[0] as number;
      // The terminal lives in the band the routes allow follow-up calls for.
      expect(made).toBeGreaterThanOrEqual(8001);
      expect(made).toBeLessThanOrEqual(9999);
      expect(r).toEqual({ state: 'typed', owned: { n: made, inc: 'inc-1' } });
      expect(f.calls.map((c) => c.name)).toEqual(['termCaps', 'termCreate', 'termWait', 'termWrite']);
      expect(f.argsOf('termCreate')[0]?.[1]).toBe('setup-user');
      expect(f.argsOf('termWrite')).toEqual([[{ n: made, inc: 'inc-1' }, COMMANDS[step]]]);
      const typed = String((f.argsOf('termWrite')[0] ?? [])[1]);
      expect(typed).toBe(COMMANDS[step]);
      expect(typed).not.toMatch(/[\r\n]/);
    }
  });
  it('reuses an owned terminal without creating one', async () => {
    const f = fakeApi({ termWrite: [ok()] });
    expect(await typeSetup(f.api, 'login', 'u', OWNED)).toEqual({ state: 'typed', owned: OWNED });
    expect(f.calls.map((c) => c.name)).toEqual(['termWrite']);
  });
  it('a computer without terminals is unsupported and types nothing', async () => {
    const f = fresh({ termCaps: refused('not_found', 404) });
    expect(await typeSetup(f.api, 'install', 'u', null)).toEqual({ state: 'unsupported' });
    expect(f.count('termWrite')).toBe(0);
  });
  it('a terminal that cannot be made or waited for fails, typing nothing', async () => {
    for (const over of [{ termCreate: lost() }, { termCreate: ok({ status: 'error', code: 'timeout' }) }, { termCreate: ok({ status: 'ok' }) }, { termWait: lost() }]) {
      const f = fresh(over);
      expect(await typeSetup(f.api, 'install', 'u', null)).toEqual({ state: 'failed' });
      expect(f.count('termWrite')).toBe(0);
    }
  });
  it('a terminal made and then failed on is closed again', async () => {
    for (const over of [{ termWait: lost() }, { termWrite: refused('internal', 500) }]) {
      const f = fresh(over);
      expect(await typeSetup(f.api, 'install', 'u', null)).toEqual({ state: 'failed' });
      expect(f.count('termDelete')).toBe(1);
    }
    const kept = fakeApi({ termWrite: [refused('internal', 500)] });
    expect(await typeSetup(kept.api, 'install', 'u', OWNED)).toEqual({ state: 'failed' });
    expect(kept.count('termDelete')).toBe(0);
  });
  it('a write whose answer is lost may have run the command: typed, written once, the terminal kept for the watch', async () => {
    const f = fresh({ termWrite: lost() });
    const r = await typeSetup(f.api, 'login', 'u', null);
    expect(r.state).toBe('typed');
    expect(f.count('termWrite')).toBe(1);
    expect(f.count('termDelete')).toBe(0);
  });
  it('a refused write is failed; a stale answer anywhere ends quietly', async () => {
    expect(await typeSetup(fresh({ termWrite: refused('internal', 500) }).api, 'install', 'u', null)).toEqual({ state: 'failed' });
    for (const over of [{ termCaps: stale() }, { termCreate: stale() }, { termWait: stale() }, { termWrite: stale() }]) expect(await typeSetup(fresh(over).api, 'install', 'u', null)).toEqual({ state: 'stale' });
  });
  it('the typed commands are the fixed ones', () => {
    expect(COMMANDS).toEqual({ install: 'sudo npm install -g @anthropic-ai/claude-code', login: 'claude auth login' });
  });
  it('closeSetup deletes the owned terminal', async () => {
    const f = fakeApi();
    await closeSetup(f.api, OWNED);
    expect(f.argsOf('termDelete')).toEqual([[OWNED]]);
  });
});

// ── checker ───────────────────────────────────────────────────────────────────────────────

describe('setChecker', () => {
  const PER_REALM = { realm: R1, realmSettings: true };
  const eff = (e: Record<string, unknown>) => ok({ effective: e });
  it('is saved only when the read-back shows the change (per-realm settings)', async () => {
    const f = fakeApi({ jevPut: [ok()], jev: [eff({ enabled: true, model: DECIDE, usable: true })] });
    expect(await setChecker(f.api, R1, PER_REALM, { enabled: true, model: DECIDE })).toEqual({ state: 'saved' });
    expect(f.argsOf('jevPut')).toEqual([[R1, PER_REALM, { enabled: true, model: DECIDE }]]);
    expect(f.argsOf('jev')).toEqual([[R1, PER_REALM]]);
  });
  it('a read-back that disagrees on enabled or model is not confirmed', async () => {
    const a = fakeApi({ jevPut: [ok()], jev: [eff({ enabled: false, model: DECIDE, usable: false })] });
    expect(await setChecker(a.api, R1, PER_REALM, { enabled: true })).toEqual({ state: 'not_confirmed' });
    const b = fakeApi({ jevPut: [ok()], jev: [eff({ enabled: true, model: 'other/m', usable: true })] });
    expect(await setChecker(b.api, R1, PER_REALM, { model: DECIDE })).toEqual({ state: 'not_confirmed' });
    expect(await setChecker(fakeApi({ jevPut: [ok()], jev: [lost()] }).api, R1, PER_REALM, { enabled: true })).toEqual({ state: 'not_confirmed' });
  });
  it('a lost answer is read back, sent once', async () => {
    const f = fakeApi({ jevPut: [lost()], jev: [eff({ enabled: false, model: DECIDE, usable: false })] });
    expect(await setChecker(f.api, R1, PER_REALM, { enabled: false })).toEqual({ state: 'saved' });
    expect(f.count('jevPut')).toBe(1);
  });
  it('an older agent\'s flat reply (no effective) confirms nothing', async () => {
    const guard = { realm: 'global', realmSettings: false };
    const f = fakeApi({ jevPut: [ok()], jev: [ok({ enabled: true, effective_model: DECIDE })] });
    expect(await setChecker(f.api, 'global', guard, { enabled: true })).toEqual({ state: 'not_confirmed' });
  });
  it('a refusal is failed and reads nothing; stale ends quietly', async () => {
    const f = fakeApi({ jevPut: [refused('realm_scope_unsupported', 400)] });
    expect(await setChecker(f.api, R1, PER_REALM, { enabled: true })).toMatchObject({ state: 'failed', err: { code: 'realm_scope_unsupported' } });
    expect(f.count('jev')).toBe(0);
    expect(await setChecker(fakeApi({ jevPut: [stale()] }).api, R1, PER_REALM, { enabled: true })).toEqual({ state: 'stale' });
  });
});

describe('own endpoints: model metadata, stored addresses and the agent rules', () => {
  const form = (over: Partial<{ name: string; address: string; models: string }> = {}) => ({ name: 'My Endpoint', address: 'https://api.example.com/v1', models: 'm1\nm2', wire: '', ...over });
  const withMeta = () =>
    providerRow({
      models: [
        { spec: 'my-endpoint/m1', context_window: 128000, output_limit: 8192, reasoning: true },
        { spec: 'my-endpoint/m2', context_window: 32000, output_limit: 0, reasoning: false },
      ],
    });
  const read = async (f: Fake): Promise<Saved> => {
    const r = await readEndpoint(f.api, 'my-endpoint');
    if (r.state !== 'ok') throw new Error(r.state);
    return r.def;
  };

  it('a model edit sends every kept model its current window, output limit and reasoning, and a new model none', async () => {
    const f = fakeApi({ provider: [ok({ provider: withMeta() })], customPatch: [ok(), ok()] });
    const before = await read(f);
    expect(await editEndpoint(f.api, 'my-endpoint', before, { ...before, models: ['m1', 'm3'] })).toEqual({ state: 'saved' });
    expect(await editEndpoint(f.api, 'my-endpoint', before, { ...before, models: ['m2'] })).toEqual({ state: 'saved' });
    expect(f.argsOf('customPatch')).toEqual([
      ['my-endpoint', { models: [{ model: 'm1', context_window: 128000, output_limit: 8192, reasoning: true }, { model: 'm3' }] }],
      ['my-endpoint', { models: [{ model: 'm2', context_window: 32000, output_limit: 0, reasoning: false }] }],
    ]);
  });

  it('only well-formed metadata is sent back; a name-only edit sends no models', async () => {
    const odd = providerRow({ models: [{ spec: 'my-endpoint/m1', context_window: '128000', output_limit: -1, reasoning: 'yes' }, { spec: 'my-endpoint/m2', context_window: 1.5, output_limit: 100_000_001 }] });
    const f = fakeApi({ provider: [ok({ provider: odd })], customPatch: [ok(), ok()] });
    const before = await read(f);
    await editEndpoint(f.api, 'my-endpoint', before, { ...before, models: ['m1', 'm2', 'constructor'] });
    await editEndpoint(f.api, 'my-endpoint', before, { ...before, name: 'New name' });
    expect(f.argsOf('customPatch')).toEqual([
      ['my-endpoint', { models: [{ model: 'm1' }, { model: 'm2' }, { model: 'constructor' }] }],
      ['my-endpoint', { display_name: 'New name' }],
    ]);
  });

  it('an address is kept without its trailing slashes, as the agent stores it, so retyping one is no change', async () => {
    expect(parseEndpoint(form({ address: 'https://api.example.com/v1/' }))).toMatchObject({ def: { base_url: 'https://api.example.com/v1' } });
    expect(parseEndpoint(form({ address: 'https://api.example.com//' }))).toMatchObject({ def: { base_url: 'https://api.example.com' } });
    const f = fakeApi({ provider: [ok({ provider: withMeta() })] });
    const before = await read(f);
    const p = parseEndpoint(form({ address: 'https://api.example.com/v1/' }));
    if (!('def' in p)) throw new Error('bad');
    expect(await editEndpoint(f.api, 'my-endpoint', before, p.def)).toEqual({ state: 'unchanged' });
    expect(await editEndpoint(f.api, 'my-endpoint', { ...before, base_url: 'https://api.example.com/v1/' }, p.def)).toEqual({ state: 'unchanged' });
    expect(f.count('customPatch')).toBe(0);
  });

  it('a replay of a held plan whose address ended in a slash adopts the endpoint the first send made', async () => {
    const held: CreatePlan = {
      id: 'my-endpoint',
      idem: 'k1',
      replay: false,
      body: { id: 'my-endpoint', model_prefix: 'my-endpoint', display_name: 'My Endpoint', wire_format: 'chat_completions', base_url: 'https://api.example.com/v1/', models: [{ model: 'm1' }, { model: 'm2' }] },
    };
    const f = fakeApi({ customCreate: [lost(), refused('provider_exists', 409)], provider: [ok({ provider: providerRow() })] });
    expect(await createEndpoint(f.api, held)).toEqual({ state: 'created', rev: 'rev-1' });
    expect(f.count('customCreate')).toBe(2);
    const def: EndpointDef = { name: 'My Endpoint', base_url: 'https://api.example.com/v1/', models: ['m1'], wire: 'chat_completions' };
    expect(await planEndpoint(fakeApi({ providers: [ok({ providers: [providerRow()] })] }).api, def, 'k2')).toEqual({ state: 'name_taken' });
  });

  it('shows: a read definition matches values whose address differs only by trailing slashes and whose models are reordered', () => {
    const d: Saved = { name: 'My Endpoint', base_url: 'https://api.example.com/v1', models: ['m1', 'm2'] };
    expect(shows(d, { name: 'My Endpoint', base_url: 'https://api.example.com/v1/', models: ['m2', 'm1'] })).toBe(true);
    expect(shows(d, { name: 'My Endpoint', base_url: 'https://api.example.com/v2', models: ['m1', 'm2'] })).toBe(false);
    expect(shows(d, { name: 'Other', base_url: 'https://api.example.com/v1', models: ['m1', 'm2'] })).toBe(false);
    expect(shows(d, { name: 'My Endpoint', base_url: 'https://api.example.com/v1', models: ['m1'] })).toBe(false);
  });

  it('names follow the agent rule: at most 80 characters, no ${ and no control characters', () => {
    for (const name of ['a${b}', 'a\u0007b', 'a\u0085b', 'a\u007fb', '😀'.repeat(81)]) expect(parseEndpoint(form({ name }))).toEqual({ bad: { display_name: true } });
    for (const name of ['😀'.repeat(80), 'é'.repeat(80), 'a $ {b}']) expect(parseEndpoint(form({ name }))).toMatchObject({ def: { name } });
  });

  it('addresses follow the agent host rule: a public name or a public IPv4 address only', () => {
    const refusedHosts = [
      'https://localhost/v1',
      'https://intranet/v1',
      'https://api.corp/v1',
      'https://x.internal',
      'https://box.local.',
      'https://my.home.arpa',
      'https://10.0.0.1',
      'https://127.0.0.1:8443/v1',
      'https://192.168.1.10',
      'https://172.16.0.1',
      'https://169.254.169.254',
      'https://100.64.0.1',
      'https://0.0.0.0',
      'https://224.0.0.1',
      'https://240.0.0.1',
      'https://198.51.100.7',
      'https://[::1]/v1',
      'https://[2606:4700::1111]',
      'https://2130706433',
      'https://0x7f.1',
      'https://evil.0x7f',
      'https://017.0.0.1',
      'https://1.2.3',
      'https://a.com:abc',
      'https://a.com/x\u0085',
      'https://api.example.com/%zz',
      'https://api.example.com/v1%2',
      'https://api.exa\\mple.com/v1',
      'https://api.exa{mple.com',
      'https://api%2eexample.com',
    ];
    for (const address of refusedHosts) expect(parseEndpoint(form({ address })), address).toEqual({ bad: { base_url: true } });
    for (const address of ['https://8.8.8.8/v1', 'https://api.example.com:8443/v1', 'https://API.Example.COM/v1', 'https://api.example.com./v1', 'https://a.com:/v1', 'HTTPS://api.example.com/v1', 'https://api.example.com/a%20b', 'https://bücher.example/v1'])
      expect(parseEndpoint(form({ address })), address).toMatchObject({ def: {} });
    // As PublicHost, which also takes a bare or bracketed IPv6 literal: every IPv6 address is refused.
    for (const host of ['[::1]', '::1', '2606:4700::1111', '[::ffff:8.8.8.8]']) expect(publicHost(host), host).toBe(false);
    expect(publicHost('8.8.8.8')).toBe(true);
  });

  it('model names follow the agent path rule: no empty part between slashes', () => {
    for (const models of ['a//b', '/a', 'a/', 'a\u0085b', 'é'.repeat(101)]) expect(parseEndpoint(form({ models })), models).toEqual({ bad: { models: true } });
    // 200 bytes, as the agent counts (Go len): 100 two-byte letters fit, 101 do not.
    expect(parseEndpoint(form({ models: 'é'.repeat(100) }))).toMatchObject({ def: { models: ['é'.repeat(100)] } });
    expect(parseEndpoint(form({ models: 'org/model-1\nm2' }))).toMatchObject({ def: { models: ['org/model-1', 'm2'] } });
  });
});
