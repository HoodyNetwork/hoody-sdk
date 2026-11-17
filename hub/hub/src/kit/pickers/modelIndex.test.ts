// The model chooser's search index and bounded search (deterministic checks).
import { providers } from '@core';
import { describe, expect, it } from 'vitest';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { catalogue7k, okBody } from './fixtures/catalogue7k';
import { buildIndex, cmpHit, indexIdentity, queryWords, scoreOf, searchIndex, type Group, type ModelIndex } from './modelIndex';
import { PAGE } from './modelPaging';

type Catalogue = providers.Catalogue;

const cat7k = (scenario: Parameters<typeof catalogue7k>[0] = 'threeReady'): Catalogue => {
  const r = catalogue7k(scenario);
  return providers.catalogue({ providers: okBody(r.providers), models: okBody(r.models), ready: okBody(r.ready) ?? undefined });
};
const groupOf = (cat: Catalogue) => (spec: string): Group => {
  const r = providers.catalogueReadiness(cat, spec);
  return r === 'ready' ? 'ready' : r === 'unknown' ? 'unknown' : 'needs_key';
};
const build = (cat: Catalogue) => buildIndex(cat, indexIdentity('s', cat), { yieldTo: () => Promise.resolve(), onSlice: () => {} }) as Promise<ModelIndex>;

const small = (o: { label?: string; ready?: string[] } = {}) =>
  providers.catalogue({
    providers: {
      providers: [
        { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included', methods: ['included'] } },
        { id: 'openai', prefix: 'openai/', display_name: o.label ?? 'OpenAI', status: { state: 'ready', via: 'stored_key', methods: ['api_key'] } },
      ],
    },
    models: {
      models: [
        { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free' },
        { spec: 'hoody-ai/upstream-auto', display_name: 'Upstream Auto' },
        { spec: 'openai/gpt-5', display_name: 'GPT-5' },
      ],
    },
    ready: { models: (o.ready ?? ['hoody-ai/hoody-free']).map((spec) => ({ spec })) },
  });

describe('index identity', () => {
  it('changes on a provider-only rename and on a scope change, not on a readiness change', () => {
    const base = indexIdentity('scope-a', small());
    expect(indexIdentity('scope-a', small({ label: 'OpenAI Labs' }))).not.toBe(base);
    expect(indexIdentity('scope-b', small())).not.toBe(base);
    expect(indexIdentity('scope-a', small({ ready: ['hoody-ai/hoody-free', 'openai/gpt-5'] }))).toBe(base);
  });
});

describe('a model with no name of its own', () => {
  const hidden = () =>
    providers.catalogue({
      providers: { providers: [{ id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: { state: 'ready', via: 'included', methods: ['included'] } }] },
      models: { models: [{ spec: 'hoody-ai/upstream' }, { spec: 'hoody-ai/hoody-fast' }] },
      ready: { models: [] },
    } as never);

  it('is indexed under the name its row shows, so a search finds what it reads', async () => {
    const cat = hidden();
    const ix = (await buildIndex(cat, indexIdentity('s', cat), { modelWord: 'A model', yieldTo: () => Promise.resolve(), onSlice: () => undefined }))!;
    const of = (spec: string) => ix.models.find((m) => m.spec === spec)!;
    expect(of('hoody-ai/upstream').lab).toBe(kitFold('A model'));
    expect(of('hoody-ai/hoody-fast').lab).toBe(kitFold('hoody-fast'));
    expect(searchIndex(ix, 'a model', {}, { readiness: () => 'ready' }).ready).toContain('hoody-ai/upstream');
  });
});

describe('index build in slices', () => {
  it('measures each slice, yields between them, and holds every model', async () => {
    const cat = cat7k();
    let t = 0;
    const slices: Array<[number, number]> = [];
    let yields = 0;
    const ix = await buildIndex(cat, 'id', { now: () => t++, budgetMs: 4, onSlice: (a, b) => slices.push([a, b]), yieldTo: () => (yields++, Promise.resolve()) });
    expect(ix!.models).toHaveLength(cat.models.length);
    expect(ix!.providers).toHaveLength(Object.keys(cat.byId).length);
    expect(slices.length).toBeGreaterThan(1);
    expect(yields).toBe(slices.length - 1);
    for (const [a, b] of slices) expect(b).toBeGreaterThanOrEqual(a);
  });
  it('an obsolete build stops at its next slice and resolves null', async () => {
    let current = true;
    let slices = 0;
    const ix = await buildIndex(cat7k(), 'id', {
      now: (() => { let t = 0; return () => t++; })(),
      isCurrent: () => current,
      onSlice: () => {
        slices++;
        current = false;
      },
      yieldTo: () => Promise.resolve(),
    });
    expect(ix).toBeNull();
    expect(slices).toBe(1);
  });
  it('an obsolete build stops at its next slice also when nothing yields (a waiting query)', async () => {
    let current = true;
    let slices = 0;
    const ix = await buildIndex(cat7k(), 'id', {
      now: (() => { let t = 0; return () => t++; })(),
      urgent: () => true,
      isCurrent: () => current,
      onSlice: () => {
        slices++;
        current = false;
      },
      yieldTo: () => Promise.resolve(),
    });
    expect(ix).toBeNull();
    expect(slices).toBe(1);
  });
  it('a waiting query makes the remaining slices run without yielding', async () => {
    let yields = 0;
    let t = 0;
    const ix = await buildIndex(cat7k(), 'id', { now: () => t++, urgent: () => true, onSlice: () => {}, yieldTo: () => (yields++, Promise.resolve()) });
    expect(ix).not.toBeNull();
    expect(yields).toBe(0);
  });
});

describe('search', () => {
  it('folds the query once per search (injected counter)', async () => {
    const cat = cat7k();
    const ix = await build(cat);
    let n = 0;
    const fold = (s: string) => (n++, kitFold(s));
    for (const q of ['gpt 5', 'a', 'claude sonnet']) {
      n = 0;
      searchIndex(ix, q, {}, { readiness: groupOf(cat), fold });
      expect(n).toBe(1);
    }
  });
  it('a Hoody AI row not in Hoody\'s own form is found by no word of the name or id the agent sent', async () => {
    const cat = small();
    const ix = await build(cat);
    for (const q of ['upstream', 'auto']) {
      const r = searchIndex(ix, q, { providers: 0 }, { readiness: groupOf(cat) });
      const found = [...r.providers, ...r.ready, ...r.unknown, ...r.setup.flatMap((s) => s.specs)];
      expect(found.filter((x) => x.startsWith('hoody-ai')), q).toEqual([]);
    }
    // The row is still found by what it shows: its provider (not on the ready list: can't tell).
    expect(searchIndex(ix, 'hoody ai', {}, { readiness: groupOf(cat) }).unknown).toEqual(['hoody-ai/upstream-auto']);
  });
  it('every word must appear, in any order; ranking puts a label that starts with the first word first', async () => {
    const cat = cat7k();
    const ix = await build(cat);
    const r = searchIndex(ix, '5 gpt', {}, { readiness: groupOf(cat) });
    for (const spec of [...r.ready, ...r.unknown]) expect(ix.models.find((m) => m.spec === spec)!.hay).toMatch(/gpt/);
    expect(scoreOf('gpt 5', 'gpt')).toBe(0);
    expect(scoreOf('open gpt', 'gpt')).toBe(1);
    expect(scoreOf('xgpt', 'gpt')).toBe(2);
  });
});

describe('ranking inside a group: first-word score, Suggested first, provider name, label, spec', () => {
  const h = (s: number, sug: number, plab: string, lab: string, key: string) => ({ s, sug, plab, lab, key, pi: 0 });
  it('each step decides only when the earlier ones tie', () => {
    const rows = [
      h(1, 0, 'a', 'a', 'k1'),
      h(0, 1, 'a', 'a', 'k2'),
      h(0, 0, 'z', 'a', 'k3'),
      h(0, 0, 'b', 'z', 'k4'),
      h(0, 0, 'b', 'c', 'k6'),
      h(0, 0, 'b', 'c', 'k5'),
    ];
    expect([...rows].sort(cmpHit).map((r) => r.key)).toEqual(['k5', 'k6', 'k4', 'k3', 'k2', 'k1']);
  });
});

// The exhaustive reference: keep every match, sort fully, cut the same pages.
function exhaustive(ix: ModelIndex, query: string, readiness: (s: string) => Group) {
  const ws = queryWords(query);
  const first = ws[0] ?? '';
  const match = (h: string) => ws.every((w) => h.includes(w));
  const prov = ix.providers
    .map((e, i) => ({ s: scoreOf(e.lab, first), sug: e.sug, plab: e.lab, lab: e.lab, key: e.id, pi: i, hay: e.hay }))
    .filter((h) => match(h.hay))
    .sort(cmpHit);
  const all = ix.models.filter((m) => match(m.hay)).map((m) => ({ s: scoreOf(m.lab, first), sug: m.sug, plab: m.plab, lab: m.lab, key: m.spec, pi: m.pi }));
  const by = (g: Group) => all.filter((h) => readiness(h.key) === g).sort(cmpHit);
  const setupAll = by('needs_key');
  const per = new Map<number, typeof setupAll>();
  for (const h of setupAll) per.set(h.pi, [...(per.get(h.pi) ?? []), h]);
  const ranked = [...per.entries()].sort((a, b) => cmpHit(a[1][0]!, b[1][0]!));
  return { providers: prov.map((h) => h.key), ready: by('ready').map((h) => h.key), unknown: by('unknown').map((h) => h.key), ranked };
}

describe('bounded search equals the exhaustive reference on the 7k fixture (first, second and last pages)', () => {
  const QUERIES = ['a', 'o', 'g', 'gp', 'gpt', 'gpt 5', 'claude sonnet', 'llama', 'deepseek', 'zzzz'];
  it.each(QUERIES)('"%s"', async (q) => {
    const cat = cat7k();
    const ix = await build(cat);
    const readiness = groupOf(cat);
    const ref = exhaustive(ix, q, readiness);
    const pagesOf = (n: number, size: number) => [...new Set([0, 1, Math.max(0, Math.ceil(n / size) - 1)])];
    const cut = <T,>(xs: T[], size: number, p: number) => xs.slice(p * size, p * size + size);
    for (const p of pagesOf(ref.providers.length, PAGE.searchProviders)) {
      expect(searchIndex(ix, q, { providers: p }, { readiness }).providers).toEqual(cut(ref.providers, PAGE.searchProviders, p));
    }
    for (const p of pagesOf(ref.ready.length, PAGE.searchReady)) {
      expect(searchIndex(ix, q, { ready: p }, { readiness }).ready).toEqual(cut(ref.ready, PAGE.searchReady, p));
    }
    for (const p of pagesOf(ref.unknown.length, PAGE.searchUnknown)) {
      expect(searchIndex(ix, q, { unknown: p }, { readiness }).unknown).toEqual(cut(ref.unknown, PAGE.searchUnknown, p));
    }
    for (const p of pagesOf(ref.ranked.length, PAGE.searchSetupProviders)) {
      const got = searchIndex(ix, q, { setup: p }, { readiness });
      const want = cut(ref.ranked, PAGE.searchSetupProviders, p).map(([pi, hits]) => ({
        providerId: pi < ix.providers.length ? ix.providers[pi]!.id : 'fusion',
        specs: hits.slice(0, PAGE.searchPerProvider).map((h) => h.key),
        n: hits.length,
      }));
      expect(got.setup).toEqual(want);
      expect(got.setupProviders).toBe(ref.ranked.length);
    }
    const r = searchIndex(ix, q, {}, { readiness });
    expect(r.totals).toEqual({ providers: ref.providers.length, ready: ref.ready.length, unknown: ref.unknown.length, setup: ref.ranked.reduce((n, [, h]) => n + h.length, 0) });
  });

  it('the fixture exercises every group on a one-letter query', async () => {
    const cat = cat7k();
    const r = searchIndex(await build(cat), 'a', {}, { readiness: groupOf(cat) });
    expect(r.totals.ready).toBeGreaterThan(PAGE.searchReady);
    expect(r.totals.unknown).toBeGreaterThan(PAGE.searchUnknown);
    expect(r.setupProviders).toBeGreaterThan(PAGE.searchSetupProviders);
  });
});
