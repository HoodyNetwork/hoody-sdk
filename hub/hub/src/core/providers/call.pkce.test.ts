// The providers Api's OpenRouter sign-in calls: each is one declared route of the provider's own OAuth job, the
// start carries the click's Idempotency-Key and no body field, the code goes once in the body and is wiped from the
// caller's object after the send, and the agent's 409 on a secret start keeps its code (oauth_in_progress).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiMod from '../api';
import type { CallInput, Route } from '../routes';

const W = vi.hoisted(() => ({ seen: [] as Array<{ method: string; path: string; input: CallInput; secret: boolean; secretKeys: readonly string[]; idem?: string }>, reject: null as unknown }));

vi.mock('../api', async (orig) => {
  const real = await orig<typeof ApiMod>();
  return {
    ...real,
    api: (route: Route, input: CallInput) => {
      W.seen.push({ method: route.method, path: route.path, input: JSON.parse(JSON.stringify(input)) as CallInput, secret: route.secret, secretKeys: route.secretKeys, idem: route.idem });
      return W.reject ? Promise.reject(W.reject) : Promise.resolve({ ok: true });
    },
  };
});

vi.resetModules();
const { providersApi } = await import('./call');
const { providerRoutes: routes } = await import('./routes');

beforeEach(() => {
  W.seen = [];
  W.reject = null;
});

describe('the OpenRouter sign-in calls', () => {
  it('start: POST the provider\'s oauth with the key and no body field', async () => {
    await providersApi().pkceStart('openrouter', 'k1');
    expect(W.seen).toHaveLength(1);
    expect(W.seen[0]).toMatchObject({ method: 'POST', path: '/providers/:pid/auth/oauth', idem: 'Idempotency-Key' });
    expect(W.seen[0]!.input).toEqual({ params: { pid: 'openrouter' }, body: {}, idem: 'k1' });
  });
  it('poll and cancel name the provider and the job', async () => {
    await providersApi().pkcePoll('openrouter', 'j1');
    await providersApi().pkceCancel('openrouter', 'j1');
    expect(W.seen.map((s) => [s.method, s.path, s.input.params])).toEqual([
      ['GET', '/providers/:pid/auth/oauth/:job', { pid: 'openrouter', job: 'j1' }],
      ['DELETE', '/providers/:pid/auth/oauth/:job', { pid: 'openrouter', job: 'j1' }],
    ]);
  });
  it('code: one POST with the code as a secret body key, wiped from the caller\'s object after the send', async () => {
    const body = { code: 'abcd1234' };
    await providersApi().pkceCode('openrouter', 'j1', body);
    expect(W.seen).toHaveLength(1);
    expect(W.seen[0]).toMatchObject({ method: 'POST', path: '/providers/:pid/auth/oauth/:job/code', secretKeys: ['code'] });
    expect(W.seen[0]!.input).toMatchObject({ params: { pid: 'openrouter', job: 'j1' }, body: { code: 'abcd1234' } });
    expect(body.code).toBe('');
  });
  it('a refused code send is wiped too', async () => {
    W.reject = { status: 404 };
    const body = { code: 'abcd1234' };
    const r = await providersApi().pkceCode('openrouter', 'j1', body);
    expect(r.ok).toBe(false);
    expect(body.code).toBe('');
  });
  it('the start is not a secret route, so core keeps its refusal details (the waiting job id); the code is a secret body key', async () => {
    // core/api.ts rebuilds a secret route's refusal without details (bareRejection), which would drop details.job_id.
    expect(routes.pkceStart.secret).toBe(false);
    expect(routes.pkceCode.secret).toBe(true);
    expect(routes.pkceCode.secretKeys).toEqual(['code']);
  });
  it('a 409 on the start names oauth_in_progress, as for ChatGPT', async () => {
    W.reject = { status: 409, details: { job_id: 'j9' } };
    const r = await providersApi().pkceStart('openrouter', 'k1');
    expect(r).toMatchObject({ ok: false, err: { code: 'oauth_in_progress', status: 409, details: { job_id: 'j9' } } });
  });
});
