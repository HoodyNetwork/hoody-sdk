// readCatalogue: one read of a computer's catalogue as an evidence part. A failed
// providers or models read settles the part as failed; a failed ready read keeps it (only ready is withheld); an
// agent without provider status gets its credential probes for the providers the caller names first, wherever
// they sit in the catalogue.
import { describe, expect, it } from 'vitest';
import { catalogueReadiness } from './catalogue';
import { catalogueSig, readCatalogue, sameScope, scopeOf, type CatalogueReader } from './read';
import type { Ctx } from '../ctx';
import type { Outcome, Settled } from './types';

const ERR: Outcome = { kind: 'failed', code: 'unavailable', status: 503, retryAfter: null, details: {} };
const ok = (body: unknown): Settled<unknown> => ({ ok: true, body });
const no: Settled<unknown> = { ok: false, err: ERR };
const st = (state: string) => ({ state, via: 'stored_key', methods: ['api_key'], alternatives: {}, output_cap: true, shares_with: [] });

interface Fake {
  providers: unknown[];
  models: unknown[];
  ready?: unknown[];
  fail?: 'providers' | 'models' | 'ready';
}
function reader(f: Fake): CatalogueReader & { probed: string[] } {
  const probed: string[] = [];
  return {
    probed,
    providers: () => Promise.resolve(f.fail === 'providers' ? no : ok({ providers: f.providers })),
    models: (q = {}) => {
      if (q.ready) return Promise.resolve(f.fail === 'ready' ? no : ok({ models: f.ready ?? [] }));
      return Promise.resolve(f.fail === 'models' ? no : ok({ models: f.models }));
    },
    auth: (pid: string) => {
      probed.push(pid);
      return Promise.resolve(ok({ auth: { ready: true, api_key_stored: true } }));
    },
  } as CatalogueReader & { probed: string[] };
}

const STATUS = {
  providers: [
    { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready') },
    { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready') },
    { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
  ],
  models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }, { spec: 'anthropic/claude' }],
  ready: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5' }],
};

describe('readCatalogue: the part', () => {
  it.each(['providers', 'models'] as const)('a failed %s read settles the part as failed', async (fail) => {
    const r = await readCatalogue(reader({ ...STATUS, fail }));
    expect(r).toEqual({ state: 'failed', err: ERR });
  });

  it('a failed ready read keeps the part: ready is withheld, needs setup still shows', async () => {
    const r = await readCatalogue(reader({ ...STATUS, fail: 'ready' }));
    expect(r.state).toBe('ok');
    if (r.state !== 'ok') return;
    expect(r.value.ready).toBe('failed');
    expect(catalogueReadiness(r.value.cat, 'openai/gpt-5')).toBe('unknown');
    expect(catalogueReadiness(r.value.cat, 'anthropic/claude')).toBe('needs_key');
  });

  it('a trusted ready read: listed models are ready, and an agent with status is never probed', async () => {
    const api = reader(STATUS);
    const r = await readCatalogue(api, ['anthropic/claude']);
    expect(r.state === 'ok' && r.value.ready).toBe('ok');
    expect(r.state === 'ok' && catalogueReadiness(r.value.cat, 'openai/gpt-5')).toBe('ready');
    expect(api.probed).toEqual([]);
  });
});

describe('readCatalogue: probes on an agent without provider status', () => {
  // 20 providers, listed in reverse name order: the old code probed the first 11 in catalogue order.
  const ids = Array.from({ length: 20 }, (_, i) => `p${String(i).padStart(2, '0')}`).reverse();
  const legacy = (extra: unknown[] = []) => ({
    providers: [
      ...ids.map((id) => ({ id, prefix: `${id}/`, display_name: id.toUpperCase() })),
      { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI' },
      ...extra,
    ],
    models: [...ids.map((id) => ({ spec: `${id}/m` })), { spec: 'hoody-ai/hoody-free' }],
    ready: [{ spec: 'p00/m' }],
  });

  it('probes the providers the caller names first, wherever the catalogue lists them, then custom endpoints past the first 11', async () => {
    const api = reader(legacy([{ id: 'zz-endpoint', prefix: 'zz-endpoint/', display_name: 'Mine', custom: true }]));
    const r = await readCatalogue(api, ['p00/m', 'p03/m']);
    expect(r.state === 'ok' && r.value.ready).toBe('legacy');
    // p00 and p03 sit last in catalogue order; the custom endpoint is the 22nd provider.
    expect(api.probed.slice(0, 2)).toEqual(['p00', 'p03']);
    expect(api.probed).toContain('zz-endpoint');
    expect(api.probed).not.toContain('hoody-ai');
    expect(api.probed.length).toBeLessThanOrEqual(11);
  });

  it('a stored-key probe proves no model ready, and the ready list of an agent without status is not trusted', async () => {
    const r = await readCatalogue(reader(legacy()), ['p00/m']);
    expect(r.state).toBe('ok');
    if (r.state !== 'ok') return;
    expect(r.value.cat.auth.p00).toBeDefined();
    expect(catalogueReadiness(r.value.cat, 'p00/m')).toBe('unknown');
    expect(catalogueReadiness(r.value.cat, 'hoody-ai/hoody-free')).toBe('unknown');
  });
});

describe('scope and signature', () => {
  const ctx = (o: Partial<Ctx> = {}): Ctx => ({
    account: 'acc',
    realm: 'r1',
    target: { project: { id: 'p' }, container: { id: 'c', server_name: 's' } } as Ctx['target'],
    gen: 4,
    page: null,
    view: '',
    vgen: 0,
    ...o,
  });

  it('a scope matches only the same account, realm, computer, generation and page load', () => {
    const a = scopeOf(ctx(), 'b1');
    expect(a.computer).toBe('p|c|s');
    expect(sameScope(a, scopeOf(ctx(), 'b1'))).toBe(true);
    expect(sameScope(a, scopeOf(ctx(), 'b2'))).toBe(false);
    expect(sameScope(a, scopeOf(ctx({ gen: 5 }), 'b1'))).toBe(false);
    expect(sameScope(a, scopeOf(ctx({ realm: 'r2' }), 'b1'))).toBe(false);
    expect(sameScope(a, scopeOf(ctx({ account: 'other' }), 'b1'))).toBe(false);
    expect(sameScope(a, scopeOf(ctx({ target: null }), 'b1'))).toBe(false);
    expect(sameScope(a, null)).toBe(false);
  });

  it('the signature changes with a rename, never with readiness', async () => {
    const one = await readCatalogue(reader(STATUS));
    const lessReady = await readCatalogue(reader({ ...STATUS, ready: [] }));
    const renamed = await readCatalogue(reader({ ...STATUS, models: [{ spec: 'hoody-ai/hoody-free' }, { spec: 'openai/gpt-5', display_name: 'GPT 5' }, { spec: 'anthropic/claude' }] }));
    const sig = (r: typeof one) => (r.state === 'ok' ? r.value.sig : '');
    expect(sig(one)).not.toBe('');
    expect(sig(lessReady)).toBe(sig(one));
    expect(catalogueSig(one.state === 'ok' ? one.value.cat : (null as never))).toBe(sig(one));
    expect(sig(renamed)).not.toBe(sig(one));
  });
});
