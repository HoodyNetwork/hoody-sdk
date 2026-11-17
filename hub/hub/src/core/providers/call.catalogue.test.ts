// The providers Api's catalogue: each of its reads failing fails the whole read (an agent that reports provider
// status never reads as ready without its ready list), and an Api bound to a computer sends every call there.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiMod from '../api';
import type { CallInput, Route } from '../routes';

const W = vi.hoisted(() => ({ fail: '' as string, legacy: false, seen: [] as Array<{ path: string; ready: boolean; target: unknown; pid?: unknown }> }));
// An agent without provider status: 15 providers listed in reverse name order.
const LEGACY = vi.hoisted(() => Array.from({ length: 15 }, (_, i) => `p${String(i).padStart(2, '0')}`).reverse());

vi.mock('../api', async (orig) => {
  const real = await orig<typeof ApiMod>();
  return {
    ...real,
    api: (route: Route, input: CallInput) => {
      const ready = Boolean((input.query as Record<string, unknown> | undefined)?.ready);
      const name = route.path === '/models' && ready ? 'ready' : route.path;
      W.seen.push({ path: route.path, ready, target: input.target, pid: (input.params as Record<string, unknown> | undefined)?.pid });
      if (name === W.fail) return Promise.reject({ status: 500, code: 'UNEXPECTED' });
      if (route.path === '/providers' && W.legacy) return Promise.resolve({ providers: LEGACY.map((id) => ({ id, prefix: `${id}/`, display_name: id })) });
      if (route.path === '/models' && W.legacy) return Promise.resolve({ models: LEGACY.map((id) => ({ spec: `${id}/m` })) });
      if (route.path === '/providers') return Promise.resolve({ providers: [{ id: 'anthropic', display_name: 'Anthropic', status: { state: 'ready', via: 'stored_key' } }] });
      if (route.path === '/models') return Promise.resolve({ models: ready ? [] : [{ spec: 'anthropic/claude-a', display_name: 'Claude A' }] });
      return Promise.resolve({});
    },
  };
});

// The test setup has loaded core already: load this Api again so it sends through the mock.
vi.resetModules();
const { providersApi } = await import('./call');

beforeEach(() => {
  W.fail = '';
  W.legacy = false;
  W.seen = [];
});

describe('providersApi().catalogue()', () => {
  it.each(['/providers', '/models', 'ready'])('fails when the %s read fails', async (which) => {
    W.fail = which;
    const r = await providersApi().catalogue();
    expect(r.ok).toBe(false);
  });

  it('reads all three for an agent that reports provider status, and a model missing from the ready list is not ready', async () => {
    const r = await providersApi().catalogue();
    expect(r.ok).toBe(true);
    expect(r.ok && r.body.readySpecs).toEqual({});
  });

  it('an agent without provider status: the providers the page names are probed first, wherever the catalogue lists them', async () => {
    W.legacy = true;
    const r = await providersApi().catalogue(['p00/m', 'p01/m']);
    expect(r.ok).toBe(true);
    const probed = W.seen.filter((s) => s.pid !== undefined).map((s) => s.pid);
    expect(probed).toContain('p00');
    expect(probed).toContain('p01');
    expect(probed.length).toBeLessThanOrEqual(11);
  });

  it('a bound Api sends every read to its computer', async () => {
    const target = { project: { id: 'p2' }, container: { id: 'c2', server_name: 's2' } };
    await providersApi(target).catalogue();
    await providersApi(target).auth('anthropic');
    expect(W.seen.length).toBeGreaterThanOrEqual(4);
    for (const s of W.seen) expect(s.target).toEqual(target);
  });
});
