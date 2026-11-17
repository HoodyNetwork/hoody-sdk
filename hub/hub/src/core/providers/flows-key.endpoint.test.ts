// Endpoint revision rule: a custom endpoint's key is sent only with the
// definition revision the step read. The daemon accepts a PUT without one, so a missing revision must never reach it:
// `saveEndpointKey` refuses an empty revision (not_sent), asks the step's guard and the page's context right before the
// PUT, and sends `if_definition_rev`; a changed endpoint answers 409 definition_changed. `readEndpointRev` gives the
// revision only from an answer that carries a non-empty one. Built-in providers keep `saveKey`, which sends none.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bump, resetCore, setTarget } from '../ctx';
import { boot } from '../test/env';
import type { Env, ProvidersApi } from './api';
import { confirmKey, readEndpointRev, saveEndpointKey, saveKey, stepScope, stepScopeLive, watchStepScope } from './flows-key';
import type { Outcome, Settled } from './types';

const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const out = (kind: Outcome['kind'], code = '', status = 0): Settled<unknown> => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });

function api(over: Partial<ProvidersApi> = {}): ProvidersApi {
  const none = () => Promise.resolve(out('failed', 'unexpected', 500));
  return new Proxy({ ...over } as ProvidersApi, { get: (t, k) => (k in t ? t[k as keyof ProvidersApi] : none) });
}
const env = (alive = () => true): Env => ({
  sleep: () => Promise.resolve(),
  now: () => 0,
  hidden: () => false,
  visible: () => Promise.resolve(),
  newKey: () => 'k',
  digest: () => Promise.resolve('fp-1'),
  alive,
});

describe('readEndpointRev', () => {
  it('gives the revision from an answer that carries one', async () => {
    const a = api({ provider: () => Promise.resolve(ok({ provider: { id: 'my-ep', definition_rev: 'rev-7', custom_definition: {} } })) });
    expect(await readEndpointRev(a, 'my-ep')).toEqual({ state: 'ok', rev: 'rev-7' });
  });
  it('an answer without a revision, or an empty one, is a failed read', async () => {
    for (const provider of [{ id: 'my-ep' }, { id: 'my-ep', definition_rev: '' }, { id: 'my-ep', definition_rev: 7 }]) {
      expect(await readEndpointRev(api({ provider: () => Promise.resolve(ok({ provider })) }), 'my-ep')).toEqual({ state: 'failed' });
    }
    expect(await readEndpointRev(api({ provider: () => Promise.resolve(ok(null)) }), 'my-ep')).toEqual({ state: 'failed' });
  });
  it('a refused read is failed, a stale one is stale', async () => {
    expect(await readEndpointRev(api({ provider: () => Promise.resolve(out('failed', 'not_found', 404)) }), 'x')).toEqual({ state: 'failed' });
    expect(await readEndpointRev(api({ provider: () => Promise.resolve(out('stale')) }), 'x')).toEqual({ state: 'stale' });
  });
});

describe('saveEndpointKey', () => {
  it('sends the key with if_definition_rev, and wipes the sent body', async () => {
    const sent: Array<{ api_key: string; if_definition_rev?: string }> = [];
    const bodies: Array<{ api_key: string }> = [];
    const keyPut = vi.fn((_pid: string, body: { api_key: string; check: true; if_definition_rev?: string }) => {
      sent.push({ ...body });
      bodies.push(body);
      return Promise.resolve(ok({ check: 'valid' }));
    });
    expect(await saveEndpointKey(api({ keyPut }), env(), 'my-ep', 'sk-1', 'rev-7', () => true)).toEqual({ state: 'valid' });
    expect(sent).toEqual([{ api_key: 'sk-1', check: true, if_definition_rev: 'rev-7' }]);
    expect(bodies[0]?.api_key, 'the sent body no longer holds the key').toBe('');
  });

  it('an empty or missing revision is not_sent: nothing reaches the agent', async () => {
    const keyPut = vi.fn();
    for (const rev of [null, '', '   '.trim()]) {
      expect(await saveEndpointKey(api({ keyPut }), env(), 'my-ep', 'sk-1', rev, () => true)).toEqual({ state: 'not_sent' });
    }
    expect(keyPut).not.toHaveBeenCalled();
  });

  it("the step's guard ended (Back, another attempt): nothing is sent", async () => {
    const keyPut = vi.fn();
    expect(await saveEndpointKey(api({ keyPut }), env(), 'my-ep', 'sk-1', 'rev-7', () => false)).toEqual({ state: 'ended' });
    expect(keyPut).not.toHaveBeenCalled();
  });

  it("the page's context changed (account, realm, computer): nothing is sent, even with the step's guard still true", async () => {
    const keyPut = vi.fn();
    expect(await saveEndpointKey(api({ keyPut }), env(() => false), 'my-ep', 'sk-1', 'rev-7', () => true)).toEqual({ state: 'ended' });
    expect(keyPut).not.toHaveBeenCalled();
  });

  it('a guard that ends while the key is hashed sends nothing', async () => {
    let on = true;
    const keyPut = vi.fn();
    const e = { ...env(), digest: () => { on = false; return Promise.resolve('fp-1'); } };
    expect(await saveEndpointKey(api({ keyPut }), e, 'my-ep', 'sk-1', 'rev-7', () => on)).toEqual({ state: 'ended' });
    expect(keyPut).not.toHaveBeenCalled();
  });

  it('409 definition_changed is def_changed; a refused key is refused; a lost answer reads back by fingerprint', async () => {
    expect(await saveEndpointKey(api({ keyPut: () => Promise.resolve(out('failed', 'definition_changed', 409)) }), env(), 'my-ep', 'k', 'rev-7', () => true)).toEqual({ state: 'def_changed' });
    expect(await saveEndpointKey(api({ keyPut: () => Promise.resolve(out('failed', 'api_key_refused', 422)) }), env(), 'my-ep', 'k', 'rev-7', () => true)).toEqual({ state: 'refused' });
    const a = api({ keyPut: () => Promise.resolve(out('pending', '', 502)), auth: () => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } })) });
    expect(await saveEndpointKey(a, env(), 'my-ep', 'k', 'rev-7', () => true)).toEqual({ state: 'saved' });
  });
});

describe('saveKey (built-in providers) is unchanged', () => {
  it('sends without a revision when it has none', async () => {
    const sent: unknown[] = [];
    const keyPut = vi.fn((_pid: string, body: { api_key: string; check: true; if_definition_rev?: string }) => {
      sent.push({ ...body });
      return Promise.resolve(ok({ check: 'valid' }));
    });
    expect(await saveKey(api({ keyPut }), env(), 'anthropic', 'sk-1', null)).toEqual({ state: 'valid' });
    expect(sent).toEqual([{ api_key: 'sk-1', check: true }]);
  });
});

// The step scope and an answer that comes after the step moved on.
describe('stepScope', () => {
  afterEach(() => resetCore());
  const A = { project: { id: 'p1' }, container: { id: 'c1' } };
  const B = { project: { id: 'p1' }, container: { id: 'c2' } };

  it('dies when another computer is shown (no generation moves) and stays dead when the first comes back', () => {
    boot({ target: A });
    const sc = stepScope();
    const stop = watchStepScope(sc);
    expect(stepScopeLive(sc)).toBe(true);
    setTarget(B);
    setTarget(A);
    expect(stepScopeLive(sc)).toBe(false);
    stop();
  });
  it('onEnd runs once when the scope ends, at once for one already ended, and never after stop', () => {
    boot({ target: A });
    const sc = stepScope();
    const onEnd = vi.fn();
    watchStepScope(sc, onEnd);
    setTarget(B);
    setTarget(A);
    bump('switch');
    expect(onEnd).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    watchStepScope(sc, late);
    expect(late).toHaveBeenCalledTimes(1);
    const sc2 = stepScope();
    const never = vi.fn();
    watchStepScope(sc2, never)();
    bump('switch');
    expect(never).not.toHaveBeenCalled();
  });
  it('dies with the generation (account, realm, sign-out)', () => {
    boot({ target: A });
    const sc = stepScope();
    bump('switch');
    expect(stepScopeLive(sc)).toBe(false);
  });
});

describe('confirmKey: a context that ends while its read is out', () => {
  it('is "stale", even when the answer carries the matching fingerprint', async () => {
    let up = true;
    const a = api({
      auth: () => {
        up = false;
        return Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } }));
      },
    });
    expect(await confirmKey(a, env(() => up), 'openai', 'fp-1', [0])).toEqual({ state: 'stale' });
  });
});

describe('saveEndpointKey: an answer after the step moved on', () => {
  it('is "ended", whatever the agent answered', async () => {
    for (const answer of [ok({ check: 'valid' }), out('failed', 'definition_changed', 409), out('failed', 'api_key_refused', 400)]) {
      let on = true;
      const a = api({ keyPut: () => { on = false; return Promise.resolve(answer); } });
      expect(await saveEndpointKey(a, env(), 'my-ep', 'sk', 'rev-7', () => on)).toEqual({ state: 'ended' });
    }
  });
  it('a lost answer stops reading back once the step moved on', async () => {
    let on = true;
    const auth = vi.fn(() => Promise.resolve(ok({ auth: { api_key_fingerprint: 'fp-1' } })));
    const a = api({ keyPut: () => Promise.resolve(out('pending', 'network', 0)), auth });
    const e = { ...env(), sleep: () => { on = false; return Promise.resolve(); } };
    expect(await saveEndpointKey(a, e, 'my-ep', 'sk', 'rev-7', () => on)).toEqual({ state: 'ended' });
    expect(auth).not.toHaveBeenCalled();
  });
});
