// The one model picker's pure rules.
import { providers } from '@core';
import { describe, expect, it, vi } from 'vitest';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { catalogue7k, okBody, type FixtureModel } from './fixtures/catalogue7k';
import { shownSpec } from './modelIndex';
import {
  clearFilters,
  CLAUDE_GROUP,
  filtersOn,
  FUSION_GROUP,
  indexPick,
  initialReadiness,
  NO_FILTERS,
  NO_MODEL_PREFS,
  openingFilters,
  parseModelPrefs,
  pickedRecently,
  pickRows,
  pickView,
  priceBandOf,
  PRICE_BANDS,
  recentList,
  rememberFilters,
  RECENT_MAX,
  SECTION_MAX,
  thinkingAfterPick,
  thinkingLevels,
  thinkingShown,
  toggleFavourite,
  WINDOW_BANDS,
  type PickBase,
  type PickFilters,
  type PickIndex,
  type PickItem,
  type PickRow,
  type ThinkingLevel,
  type ViewOptions,
} from './modelPickLogic';

const NAMES = { model: 'Model', provider: 'Provider' };
const baseOf = (cat: providers.Catalogue, purpose = 'bot'): PickBase[] => providers.list(cat, purpose, null, NAMES);

// ── a small catalogue ─────────────────────────────────────────────────────────────────────

const st = (state: string) => ({ state, via: state === 'ready' ? 'stored_key' : null, methods: ['api_key'] });
function small(models: Array<Record<string, unknown>>, ready: string[], provs?: Array<Record<string, unknown>>): providers.Catalogue {
  return providers.catalogue({
    providers: {
      providers: provs ?? [
        { id: 'hoody-ai', prefix: 'hoody-ai/', display_name: 'Hoody AI', status: st('ready') },
        { id: 'openai', prefix: 'openai/', display_name: 'OpenAI', status: st('ready') },
        { id: 'anthropic', prefix: 'anthropic/', display_name: 'Anthropic', status: st('needs_key') },
        { id: 'zeta', prefix: 'zeta/', display_name: 'Zeta', status: st('needs_key') },
        { id: 'alpha', prefix: 'alpha/', display_name: 'Alpha', status: st('ready') },
      ],
    },
    models: { models },
    ready: { models: ready.map((spec) => ({ spec })) },
  });
}

const SMALL_MODELS = [
  { spec: 'hoody-ai/hoody-free', display_name: 'Hoody Free', context_window: 200000, cost_in: 0, cost_out: 0, reasoning: false },
  { spec: 'openai/gpt-5', display_name: 'GPT-5', context_window: 400000, cost_in: 1.25, cost_out: 10, reasoning: true, input_modalities: ['text', 'image'] },
  { spec: 'openai/gpt-5-mini', display_name: 'GPT-5 mini', context_window: 128000, cost_in: 0.25, reasoning: true },
  { spec: 'anthropic/claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', context_window: 1000000, cost_in: 3, cost_out: 15, reasoning: true },
  { spec: 'anthropic/claude-haiku-4-5', display_name: 'Claude Haiku 4.5', context_window: 200000, cost_in: 1, reasoning: false },
  { spec: 'zeta/z1', display_name: 'Z1', context_window: 0, reasoning: false, input_modalities: [] },
  { spec: 'zeta/z2', display_name: 'Z2' },
  { spec: 'zeta/z3', display_name: 'Z3', cost_in: 20 },
  { spec: 'alpha/a1', display_name: 'A1', context_window: 32000, cost_in: 0.1 },
  { spec: 'fusion/team', display_name: 'Team', source: 'fusion', members: ['hoody-ai/hoody-free', 'openai/gpt-5'] },
];
const SMALL_READY = ['hoody-ai/hoody-free', 'openai/gpt-5', 'openai/gpt-5-mini', 'alpha/a1', 'fusion/team'];
const smallIx = (): PickIndex => {
  const cat = small(SMALL_MODELS, SMALL_READY);
  return indexPick(pickRows(baseOf(cat), cat));
};
const V = (o: Partial<ViewOptions> = {}): ViewOptions => ({ current: '', favourites: [], recent: [], ...o });
const F = (o: Partial<PickFilters> = {}): PickFilters => ({ ...NO_FILTERS, ...o });
const rowSpecs = (items: readonly PickItem[]) => items.flatMap((i) => (i.kind === 'row' ? [i.row.spec] : []));
const shape = (items: readonly PickItem[]) => items.map((i) => (i.kind === 'heading' ? `#${i.group ? i.group.id : i.section}` : i.kind === 'inherit' ? '@inherit' : `${i.section}:${i.row.spec}`));

describe('pickRows: what the agent sends, and nothing guessed', () => {
  const ix = smallIx();
  const row = (spec: string) => ix.rows.find((r) => r.spec === spec)!;
  it('reads the window, list prices and reasoning GET /models carries today', () => {
    expect(row('openai/gpt-5')).toMatchObject({ window: 400000, priceIn: 1.25, priceOut: 10, reasoning: true });
    expect(row('hoody-ai/hoody-free')).toMatchObject({ window: 200000, priceIn: 0, priceOut: 0, reasoning: false });
  });
  it('0 or absent is unknown (null), never 0 tokens or free', () => {
    expect(row('zeta/z1')).toMatchObject({ window: null, priceIn: null, priceOut: null });
    expect(row('zeta/z2')).toMatchObject({ window: null, priceIn: null, reasoning: null });
    expect(row('openai/gpt-5-mini').priceOut).toBeNull();
  });
  it('images and tools are null unless the agent says (an empty modalities list is unknown, not text-only)', () => {
    expect(row('openai/gpt-5').images).toBe(true);
    expect(row('zeta/z1').images).toBeNull();
    expect(row('zeta/z2').images).toBeNull();
    expect(ix.rows.every((r) => r.tools === null)).toBe(true);
    expect(ix.hasImages).toBe(true);
    expect(ix.hasTools).toBe(false);
  });
  it('an ensemble carries its member count; others none', () => {
    expect(row('fusion/team').members).toBe(2);
    expect(row('openai/gpt-5').members).toBeNull();
  });
  it('a Claude Code row has no window or price, and takes thinking when Claude Code lists efforts', () => {
    const cat = small(SMALL_MODELS, SMALL_READY);
    const cc: PickBase = { spec: 'claude-code/opus', label: 'Opus', providerId: 'claude-code', providerLabel: 'Claude Code', ready: 'ready', source: 'claude_code' };
    const [r] = pickRows([cc], cat, { claudeEfforts: ['low', 'high'] });
    expect(r).toMatchObject({ window: null, priceIn: null, reasoning: true, efforts: ['low', 'high'] });
    expect(pickRows([cc], cat)[0]).toMatchObject({ reasoning: null, efforts: null });
  });
  it('newer fields are read when the agent sends them (tool_call, efforts)', () => {
    const cat = small([{ spec: 'openai/o9', display_name: 'O9', tool_call: false, efforts: ['low', 'high'] }], []);
    const [r] = pickRows(baseOf(cat), cat);
    expect(r).toMatchObject({ tools: false, efforts: ['low', 'high'] });
  });
  it('tool_call decodes true, false and absent apart (absent = unknown, never false)', () => {
    const cat = small(
      [
        { spec: 'openai/t1', display_name: 'T1', tool_call: true },
        { spec: 'openai/t2', display_name: 'T2', tool_call: false },
        { spec: 'openai/t3', display_name: 'T3' },
      ],
      [],
    );
    const bySpec = new Map(pickRows(baseOf(cat), cat).map((r) => [r.spec, r.tools]));
    expect(bySpec.get('openai/t1')).toBe(true);
    expect(bySpec.get('openai/t2')).toBe(false);
    expect(bySpec.get('openai/t3')).toBeNull();
  });
  it('one row per spec (the first wins), and each row keeps its place in the agent list', () => {
    const cat = small(SMALL_MODELS, SMALL_READY);
    const b = baseOf(cat);
    const rows = pickRows([...b, b[0]!], cat);
    expect(rows).toHaveLength(b.length);
    expect(row('hoody-ai/hoody-free').at).toBe(0);
    expect(row('fusion/team').at).toBe(9);
  });
});

describe('pickView: the order', () => {
  const ix = smallIx();
  it('groups: Hoody AI, ready Suggested providers in their order, other ready ones by name, the rest by count, ensembles last', () => {
    const v = pickView(ix, F(), V());
    expect(v.items.filter((i) => i.kind === 'heading').map((i) => (i.kind === 'heading' ? i.group!.id : ''))).toEqual(['hoody-ai', 'openai', 'alpha', 'zeta', 'anthropic', FUSION_GROUP]);
  });
  it('the rest rank by matches before pinning: starring rows of a group does not move it down', () => {
    const v = pickView(ix, F(), V({ favourites: ['zeta/z1', 'zeta/z2'] }));
    const heads = v.items.flatMap((i) => (i.kind === 'heading' && i.group ? [i.group.id] : []));
    expect(heads.indexOf('zeta')).toBeLessThan(heads.indexOf('anthropic'));
    const zeta = v.items.find((i) => i.kind === 'heading' && i.group?.id === 'zeta');
    expect(zeta && zeta.kind === 'heading' ? zeta.count : -1).toBe(1); // the heading counts the rows under it
  });
  it('inside a group the agent order holds (not names)', () => {
    const cat = small([{ spec: 'openai/zz', display_name: 'ZZ' }, { spec: 'openai/aa', display_name: 'AA' }], ['openai/zz', 'openai/aa']);
    const v = pickView(indexPick(pickRows(baseOf(cat), cat)), F(), V());
    expect(rowSpecs(v.items)).toEqual(['openai/zz', 'openai/aa']);
  });
  it('inherit, current, favourites, recent, groups; each spec once, in its first section', () => {
    const v = pickView(ix, F(), V({ inherit: { label: "Agent's model" }, current: 'openai/gpt-5', favourites: ['openai/gpt-5', 'zeta/z2'], recent: ['zeta/z2', 'alpha/a1'] }));
    expect(shape(v.items).slice(0, 7)).toEqual(['@inherit', 'current:openai/gpt-5', '#favourites', 'favourites:zeta/z2', '#recent', 'recent:alpha/a1', '#hoody-ai']);
    const specs = rowSpecs(v.items);
    expect(new Set(specs).size).toBe(specs.length);
    expect(specs).toHaveLength(ix.rows.length);
  });
  it('the current row is pinned only while it passes the search and the filters', () => {
    expect(shape(pickView(ix, F({ query: 'claude' }), V({ current: 'openai/gpt-5' })).items)).not.toContain('current:openai/gpt-5');
    expect(shape(pickView(ix, F({ readiness: 'setup' }), V({ current: 'openai/gpt-5' })).items)).not.toContain('current:openai/gpt-5');
    expect(shape(pickView(ix, F({ query: 'gpt' }), V({ current: 'openai/gpt-5' })).items)[0]).toBe('current:openai/gpt-5');
  });
  it('favourites and recent each hold at most 8, counted after de-duplication', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ spec: `openai/m${i}`, display_name: `M${i}` }));
    const cat = small(many, many.map((m) => m.spec));
    const mix = indexPick(pickRows(baseOf(cat), cat));
    const fav = many.slice(0, 12).map((m) => m.spec);
    const recent = many.slice(4, 20).map((m) => m.spec);
    const v = pickView(mix, F(), V({ favourites: fav, recent }));
    const sec = (s: string) => v.items.filter((i) => i.kind === 'row' && i.section === s).map((i) => (i.kind === 'row' ? i.row.spec : ''));
    expect(sec('favourites')).toEqual(fav.slice(0, SECTION_MAX));
    expect(sec('recent')).toEqual(many.slice(8, 16).map((m) => m.spec)); // m4-m7 already shown as favourites
  });
  it('a starred spec the catalogue does not list is returned as stale, never drawn as a model', () => {
    const v = pickView(ix, F(), V({ favourites: ['gone/model', 'openai/gpt-5'] }));
    expect(v.staleFavourites).toEqual(['gone/model']);
    expect(rowSpecs(v.items)).not.toContain('gone/model');
  });
  it('positions count options only (headings excluded), 1..total, and total = inherit + matched', () => {
    const v = pickView(ix, F(), V({ inherit: { label: 'Hoody decides' }, favourites: ['alpha/a1'] }));
    const pos = v.items.flatMap((i) => (i.kind === 'heading' ? [] : [i.pos]));
    expect(pos).toEqual(Array.from({ length: pos.length }, (_, k) => k + 1));
    expect(v.total).toBe(v.matched + 1);
  });
  it('the inherit row shows with an empty search, or when the search matches its label', () => {
    const inherit = { label: 'Hoody decides' };
    expect(shape(pickView(ix, F({ query: 'gpt' }), V({ inherit })).items)).not.toContain('@inherit');
    expect(shape(pickView(ix, F({ query: 'decides' }), V({ inherit })).items)[0]).toBe('@inherit');
  });
  it('headingOf names the heading in force for every item (sticky)', () => {
    const v = pickView(ix, F(), V({ inherit: { label: 'x' }, current: 'alpha/a1' }));
    expect(v.headingOf[0]).toBe(-1);
    expect(v.headingOf[1]).toBe(-1);
    v.items.forEach((it, k) => {
      if (it.kind === 'row' && it.section === 'group') {
        const h = v.items[v.headingOf[k]!]!;
        expect(h.kind === 'heading' && h.group!.id).toBe(it.row.source === 'fusion' ? FUSION_GROUP : it.row.providerId);
      }
    });
  });
  it('rows say current and favourite', () => {
    const v = pickView(ix, F({ query: 'gpt' }), V({ current: 'openai/gpt-5', favourites: ['openai/gpt-5-mini'] }));
    const r = v.items.filter((i): i is Extract<PickItem, { kind: 'row' }> => i.kind === 'row');
    expect(r.map((i) => [i.row.spec, i.current, i.favourite])).toEqual([
      ['openai/gpt-5', true, false],
      ['openai/gpt-5-mini', false, true],
    ]);
  });
  it('a Claude Code group is ordered like a provider by its readiness', () => {
    const cat = small(SMALL_MODELS, SMALL_READY);
    const cc: PickBase = { spec: 'claude-code/opus', label: 'Opus', providerId: 'claude-code', providerLabel: 'Claude Code', ready: 'needs_key', source: 'claude_code' };
    const v = pickView(indexPick(pickRows([...baseOf(cat), cc], cat)), F(), V());
    const heads = v.items.flatMap((i) => (i.kind === 'heading' && i.group ? [i.group.id] : []));
    expect(heads.indexOf(CLAUDE_GROUP)).toBeGreaterThan(heads.indexOf('alpha'));
    expect(heads.indexOf(CLAUDE_GROUP)).toBeLessThan(heads.indexOf(FUSION_GROUP));
  });
});

describe('pickView: filters and their counts', () => {
  const ix = smallIx();
  it('readiness: ready / needs setup / all (can-not-tell rows only under All)', () => {
    expect(pickView(ix, F({ readiness: 'ready' }), V()).matched).toBe(5);
    expect(pickView(ix, F({ readiness: 'setup' }), V()).matched).toBe(5);
    expect(pickView(ix, F({ readiness: 'all' }), V()).matched).toBe(10);
  });
  it("can't-tell rows count only under All; ensembles and Claude Code are provider chips of their own", () => {
    const mk = (spec: string, ready: PickBase['ready'], source: PickBase['source'] = 'provider'): PickBase => ({ spec, label: spec, providerId: spec.split('/')[0]!, providerLabel: spec.split('/')[0]!, ready, source });
    const base = [mk('openai/a', 'ready'), mk('openai/b', 'unknown'), mk('zeta/c', 'needs_key'), mk('fusion/t', 'ready', 'fusion'), mk('claude-code/opus', 'unknown', 'claude_code')];
    const uix = indexPick(pickRows(base, null));
    const v = pickView(uix, F({ readiness: 'ready' }), V());
    expect(v.facets.readiness).toEqual({ ready: 2, setup: 1, all: 5 });
    expect(v.matched).toBe(2);
    expect(Object.fromEntries(v.facets.providers.map((p) => [p.id, p.count]))).toEqual({ openai: 1, zeta: 0, [FUSION_GROUP]: 1, [CLAUDE_GROUP]: 0 });
    expect(Object.fromEntries(pickView(uix, F(), V()).facets.providers.map((p) => [p.id, p.count]))).toEqual({ openai: 2, zeta: 1, [FUSION_GROUP]: 1, [CLAUDE_GROUP]: 1 });
    expect(uix.groupReady.get(CLAUDE_GROUP)).toBe('unknown');
  });
  it('window bands drop unknown windows; price bands drop unpriced rows', () => {
    const w = pickView(ix, F({ window: 200_000 }), V());
    expect(rowSpecs(w.items).sort()).toEqual(['anthropic/claude-haiku-4-5', 'anthropic/claude-sonnet-5-5', 'hoody-ai/hoody-free', 'openai/gpt-5']);
    const p = pickView(ix, F({ price: 'free' }), V());
    expect(rowSpecs(p.items)).toEqual(['hoody-ai/hoody-free']);
    expect(rowSpecs(pickView(ix, F({ price: 'gt5' }), V()).items)).toEqual(['zeta/z3']);
  });
  it('price bands', () => {
    expect([null, 0, 0.99, 1, 5, 5.01].map(priceBandOf)).toEqual(['', 'free', 'lt1', '1to5', '1to5', 'gt5']);
  });
  it('images keeps only rows the agent says read images; the chip is absent (null count) when no row says', () => {
    expect(rowSpecs(pickView(ix, F({ images: true }), V()).items)).toEqual(['openai/gpt-5']);
    const cat = small([{ spec: 'openai/x', display_name: 'X' }], []);
    const v = pickView(indexPick(pickRows(baseOf(cat), cat)), F(), V());
    expect(v.facets.images).toBeNull();
    expect(v.facets.tools).toBeNull();
  });
  it('search: every word, any order, over name, provider name and spec (accents folded)', () => {
    expect(rowSpecs(pickView(ix, F({ query: 'SONNET anthropic' }), V()).items)).toEqual(['anthropic/claude-sonnet-5-5']);
    expect(rowSpecs(pickView(ix, F({ query: 'gpt-5-mini' }), V()).items)).toEqual(['openai/gpt-5-mini']);
    expect(rowSpecs(pickView(ix, F({ query: 'Clàude' }), V()).items)).toHaveLength(2);
  });
  it('a chip count is what the list would show with that chip alone changed', () => {
    const f = F({ query: 'a', readiness: 'all', thinking: true });
    const v = pickView(ix, f, V());
    expect(v.facets.thinking).toBe(v.matched); // on: its count is the list
    expect(v.facets.window[200000]).toBe(pickView(ix, { ...f, window: 200_000 }, V()).matched);
    expect(v.facets.readiness.ready).toBe(pickView(ix, { ...f, readiness: 'ready' }, V()).matched);
  });
  it('every provider of the catalogue keeps a chip (count 0 when nothing of it matches), in list order', () => {
    const v = pickView(ix, F({ query: 'gpt' }), V());
    expect(v.facets.providers.map((p) => [p.id, p.count])).toEqual([
      ['hoody-ai', 0],
      ['openai', 2],
      ['alpha', 0],
      ['anthropic', 0],
      ['zeta', 0],
      [FUSION_GROUP, 0],
    ]);
  });
  it('filtersOn / clearFilters keep the search and the readiness segment', () => {
    const f = F({ query: 'q', readiness: 'ready', thinking: true, providers: ['openai'], price: 'lt1' });
    expect(filtersOn(f)).toBe(true);
    expect(clearFilters(f)).toEqual(F({ query: 'q', readiness: 'ready' }));
    expect(filtersOn(clearFilters(f))).toBe(false);
  });
});

// ── the 7k catalogue: counts against a reference, and the work per keystroke ───────────────

// Deterministic per-spec attributes over the real catalogue (the fixture has names only).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const WINDOWS = [0, 8192, 128000, 131072, 200000, 1048576];
const PRICES = [undefined, 0, 0.4, 1, 3, 15];
/** The wire tool_call each fixture spec was given (absent = not in the map); the reference reads this, never the decoded row. */
const WIRE_TOOLS = new Map<string, boolean>();
function cat7k(): providers.Catalogue {
  const r = catalogue7k('threeReady');
  const models = okBody(r.models)!;
  const aug = models.models.map((m: FixtureModel) => {
    const h = hash(m.spec);
    const price = PRICES[h % PRICES.length];
    const out = {
      ...m,
      context_window: WINDOWS[(h >>> 3) % WINDOWS.length],
      ...(price === undefined ? {} : { cost_in: price, cost_out: price * 4 }),
      reasoning: (h >>> 7) % 3 === 0,
      ...((h >>> 9) % 4 === 0 ? { input_modalities: (h >>> 11) % 2 ? ['text', 'image'] : ['text'] } : {}),
      ...((h >>> 13) % 3 === 0 ? {} : { tool_call: (h >>> 15) % 2 === 0 }),
    };
    if ((h >>> 13) % 3 !== 0) WIRE_TOOLS.set(m.spec, (h >>> 15) % 2 === 0);
    return out;
  });
  return providers.catalogue({ providers: okBody(r.providers), models: { models: aug }, ready: okBody(r.ready) ?? undefined });
}

/** The reference: a filter written the plain way, row by row (its own folded text, memoised per row). */
const refHay = new WeakMap<PickRow, string>();
function refMatch(r: PickRow, f: PickFilters, o: ViewOptions): boolean {
  let hay = refHay.get(r);
  if (hay === undefined) refHay.set(r, (hay = kitFold(`${r.label}\u0000${r.providerLabel}\u0000${shownSpec(r.spec)}`)));
  const words = kitFold(f.query).trim().split(/\s+/).filter(Boolean);
  if (!words.every((w) => hay.includes(w))) return false;
  if (f.readiness === 'ready' && r.ready !== 'ready') return false;
  if (f.readiness === 'setup' && r.ready !== 'needs_key') return false;
  const g = r.source === 'fusion' ? FUSION_GROUP : r.source === 'claude_code' ? CLAUDE_GROUP : r.providerId;
  if (f.providers.length && !f.providers.includes(g)) return false;
  if (f.thinking && r.reasoning !== true) return false;
  if (f.images && r.images !== true) return false;
  if (f.tools && WIRE_TOOLS.get(r.spec) !== true) return false;
  if (f.window && (r.window ?? 0) < f.window) return false;
  if (f.price) {
    // Written apart from priceBandOf: free = 0, lt1 = (0, 1), 1to5 = [1, 5], gt5 = above 5; unpriced never.
    const p = r.priceIn;
    if (p === null) return false;
    const band = p === 0 ? 'free' : p < 1 ? 'lt1' : p > 5 ? 'gt5' : '1to5';
    if (band !== f.price) return false;
  }
  if (f.favourites && !o.favourites.includes(r.spec)) return false;
  if (f.recent && !o.recent.includes(r.spec)) return false;
  return true;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('the 7,077-model catalogue', () => {
  const cat = cat7k();
  const rows = pickRows(baseOf(cat), cat);
  const ix = indexPick(rows);
  const specs = rows.map((r) => r.spec);
  // The fixture's models are not Hoody AI specs past Free, so the shown spec is the spec (the reference indexes it raw).
  const QUERIES = ['', 'c', 'claude', 'gpt 5', 'open', 'mini', 'zzzz-none', 'qwen 2'];

  it('is the real size', () => {
    expect(rows.length).toBeGreaterThanOrEqual(7077);
  });

  it('every row decodes the tool_call its spec was sent (true, false, absent = null)', () => {
    expect(WIRE_TOOLS.size).toBeGreaterThan(1000);
    for (const r of rows) expect(r.tools, r.spec).toBe(WIRE_TOOLS.has(r.spec) ? WIRE_TOOLS.get(r.spec)! : null);
  });

  it('matches and every chip count equal the reference on 40 random filter sets', () => {
    const rand = rng(7);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    const provIds = [...ix.groupReady.keys()];
    for (let n = 0; n < 40; n++) {
      const o = V({ favourites: Array.from({ length: 5 }, () => pick(specs)), recent: Array.from({ length: 4 }, () => pick(specs)) });
      const f = F({
        query: pick(QUERIES),
        readiness: pick(['ready', 'setup', 'all'] as const),
        providers: rand() < 0.3 ? [pick(provIds), pick(provIds)] : [],
        thinking: rand() < 0.3,
        images: rand() < 0.2,
        tools: rand() < 0.25,
        window: pick([0, 0, ...WINDOW_BANDS]),
        price: pick(['', '', ...PRICE_BANDS]),
        favourites: rand() < 0.1,
        recent: rand() < 0.1,
      });
      const v = pickView(ix, f, o);
      const ref = rows.filter((r) => refMatch(r, f, o));
      expect(v.matched, JSON.stringify(f)).toBe(ref.length);
      expect(new Set(rowSpecs(v.items))).toEqual(new Set(ref.map((r) => r.spec)));
      const only = (g: Partial<PickFilters>) => rows.filter((r) => refMatch(r, { ...f, ...g }, o)).length;
      expect(v.facets.thinking).toBe(only({ thinking: true }));
      expect(v.facets.images).toBe(only({ images: true }));
      expect(v.facets.tools).toBe(only({ tools: true }));
      expect(v.facets.favourites).toBe(only({ favourites: true }));
      expect(v.facets.recent).toBe(only({ recent: true }));
      expect(v.facets.readiness).toEqual({ ready: only({ readiness: 'ready' }), setup: only({ readiness: 'setup' }), all: only({ readiness: 'all' }) });
      for (const b of WINDOW_BANDS) expect(v.facets.window[b]).toBe(only({ window: b }));
      for (const b of PRICE_BANDS) expect(v.facets.price[b]).toBe(only({ price: b }));
      for (const p of v.facets.providers.slice(0, 6)) expect(p.count).toBe(only({ providers: [p.id] }));
      // Multi-select: adding an unselected provider adds exactly its count; the selection's list is the sum of counts.
      if (f.providers.length) {
        const sel = new Set(f.providers);
        const other = v.facets.providers.find((p) => !sel.has(p.id))!;
        expect(pickView(ix, { ...f, providers: [...f.providers, other.id] }, o).matched).toBe(v.matched + other.count);
        expect(v.facets.providers.filter((p) => sel.has(p.id)).reduce((n, p) => n + p.count, 0)).toBe(v.matched);
      }
    }
  }, 120_000);

  it('the tools chip exists once a row says, and drops unknown rows', () => {
    expect(ix.hasTools).toBe(true);
    const v = pickView(ix, F({ tools: true }), V());
    const wireTrue = rows.filter((r) => WIRE_TOOLS.get(r.spec) === true).length;
    const notFalse = rows.filter((r) => WIRE_TOOLS.get(r.spec) !== false).length;
    expect(wireTrue).toBeGreaterThan(0);
    expect(v.matched).toBe(wireTrue);
    expect(v.matched).toBeLessThan(notFalse);
  });

  it('a keystroke folds the query once and reads each row once (bounded work)', () => {
    let folds = 0;
    const counting = (s: string) => {
      folds++;
      return kitFold(s);
    };
    pickView(ix, F({ query: 'claude son', thinking: true }), V({ fold: counting }));
    expect(folds).toBe(1);
    const inherit = { label: 'Agent model' };
    folds = 0;
    pickView(ix, F({ query: 'x' }), V({ fold: counting, inherit }));
    expect(folds).toBe(2); // + the inherit label
  });

  // Every array a keystroke may walk is counted: text, rows, order and groups; and every sort the runtime
  // offers is watched (Array and typed-array sort and toSorted), so a second full scan or a row sort fails here.
  const watched = () => {
    const reads = { hay: 0, rows: 0, order: 0, group: 0 };
    const count = <T extends object>(arr: T, key: keyof typeof reads): T =>
      new Proxy(arr, {
        get(t, k) {
          if (typeof k === 'string' && /^\d+$/.test(k)) reads[key]++;
          // The target as receiver: a typed array's own getters (length) refuse a proxy as `this`. Methods are not bound,
          // so an array method walking the rows still reads them through the proxy and is counted.
          return Reflect.get(t, k);
        },
      });
    const counted: PickIndex = { ...ix, hay: count(ix.hay as string[], 'hay'), rows: count(ix.rows as PickRow[], 'rows'), order: count(ix.order, 'order'), group: count(ix.group as string[], 'group') };
    return { reads, counted };
  };
  const sortSpies = () => {
    const typed = Object.getPrototypeOf(Int32Array.prototype) as { sort: unknown; toSorted?: unknown };
    const targets: Array<[object, string]> = [[Array.prototype, 'sort'], [typed, 'sort']];
    if ('toSorted' in Array.prototype) targets.push([Array.prototype, 'toSorted']);
    if (typed.toSorted) targets.push([typed, 'toSorted']);
    return targets.map(([o, m]) => vi.spyOn(o as Record<string, (...a: unknown[]) => unknown>, m));
  };

  it('a keystroke that matches nothing reads each text once and no row, group or sort beyond the chips', () => {
    const { reads, counted } = watched();
    const spies = sortSpies();
    let sorted: number[] = [];
    try {
      const v = pickView(counted, F({ query: 'zzqqxxno' }), V({ favourites: specs.slice(0, 3) }));
      expect(v.matched).toBe(0);
      sorted = spies.flatMap((sp) => sp.mock.contexts.map((c) => (c as ArrayLike<unknown>).length));
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
    expect(reads.hay).toBe(rows.length);
    expect(reads.order).toBe(rows.length);
    expect(reads.rows).toBe(0);
    expect(reads.group).toBe(0);
    expect(Math.max(0, ...sorted)).toBeLessThanOrEqual(ix.groupReady.size);
  });

  it('a keystroke that matches reads each text once and only the matched rows, a bounded number of times', () => {
    const { reads, counted } = watched();
    const spies = sortSpies();
    let sorted: number[] = [];
    let matched = 0;
    try {
      matched = pickView(counted, F({ query: 'claude son', readiness: 'all' }), V({ favourites: specs.slice(0, 3) })).matched;
      sorted = spies.flatMap((sp) => sp.mock.contexts.map((c) => (c as ArrayLike<unknown>).length));
    } finally {
      for (const sp of spies) sp.mockRestore();
    }
    expect(matched).toBeGreaterThan(0);
    expect(matched).toBeLessThan(rows.length / 20);
    expect(reads.hay).toBe(rows.length);
    expect(reads.order).toBe(rows.length);
    expect(reads.rows).toBeLessThanOrEqual(8 * matched);
    expect(reads.group).toBeLessThanOrEqual(8 * matched);
    // Only the provider chips and the groups are sorted (one entry per provider), never the rows.
    expect(Math.max(0, ...sorted)).toBeLessThanOrEqual(ix.groupReady.size);
  });

  it('a keystroke stays far under the budget: min of 7 warmed runs under 250 ms (the 50 ms objective is the browser spec)', () => {
    const f = F({ query: 'cl', readiness: 'all', thinking: true, window: 128_000 });
    const o = V({ favourites: specs.slice(0, 8), recent: specs.slice(100, 108), current: specs[42]! });
    for (let i = 0; i < 3; i++) pickView(ix, f, o);
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      pickView(ix, { ...f, query: QUERIES[i % QUERIES.length]! }, o);
      times.push(performance.now() - t0);
    }
    expect(Math.min(...times), `keystroke times ${times.map((t) => t.toFixed(1)).join(', ')} ms`).toBeLessThan(250);
  });
});

describe('opening filters and the readiness default', () => {
  it('Ready when anything is ready, else All; a remembered Ready falls back to All when nothing is', () => {
    const ix = smallIx();
    expect(initialReadiness(ix, null)).toBe('ready');
    expect(initialReadiness(ix, 'setup')).toBe('setup');
    const none = small([{ spec: 'zeta/z', display_name: 'Z' }], []);
    const nix = indexPick(pickRows(baseOf(none), none));
    expect(initialReadiness(nix, null)).toBe('all');
    expect(initialReadiness(nix, 'ready')).toBe('all');
  });
  it('remembered providers no longer in the catalogue are dropped; the search is never remembered', () => {
    const ix = smallIx();
    const f = openingFilters(ix, { ...NO_MODEL_PREFS, readiness: 'all', providers: ['openai', 'gone'] });
    expect(f).toEqual(F({ readiness: 'all', providers: ['openai'] }));
  });
});

describe('remembered per account', () => {
  it('parses defensively: malformed reads as nothing remembered, lists de-duplicated and capped', () => {
    expect(parseModelPrefs(null)).toEqual(NO_MODEL_PREFS);
    expect(parseModelPrefs([1])).toEqual(NO_MODEL_PREFS);
    expect(parseModelPrefs({ fav: ['a/b', 'a/b', 3, 'x\ny', ''], recent: Array.from({ length: 20 }, (_, i) => `p/m${i}`), readiness: 'nope', providers: ['openai'] })).toEqual({
      fav: ['a/b'],
      recent: Array.from({ length: RECENT_MAX }, (_, i) => `p/m${i}`),
      readiness: null,
      providers: ['openai'],
    });
  });
  it('a star toggles; newest first', () => {
    const p1 = toggleFavourite(NO_MODEL_PREFS, 'a/1');
    const p2 = toggleFavourite(p1, 'a/2');
    expect(p2.fav).toEqual(['a/2', 'a/1']);
    expect(toggleFavourite(p2, 'a/1').fav).toEqual(['a/2']);
  });
  it('a pick moves to the front of recent, at most 8; the inherit row (spec "") is not a pick', () => {
    let p = NO_MODEL_PREFS;
    for (let i = 0; i < 10; i++) p = pickedRecently(p, `p/m${i}`);
    p = pickedRecently(p, 'p/m5');
    expect(p.recent).toEqual(['p/m5', 'p/m9', 'p/m8', 'p/m7', 'p/m6', 'p/m4', 'p/m3', 'p/m2']);
    expect(pickedRecently(p, '')).toBe(p);
  });
  it('remembers only readiness and providers, and returns the same object when nothing changed', () => {
    const p = rememberFilters(NO_MODEL_PREFS, { readiness: 'setup', providers: ['openai'] });
    expect(p).toMatchObject({ readiness: 'setup', providers: ['openai'] });
    expect(rememberFilters(p, { readiness: 'setup', providers: ['openai'] })).toBe(p);
  });
  it('recent section = the models in use here (always), then the last picks, to 8', () => {
    const recent = ['p/1', 'p/2', 'p/3', 'p/4', 'p/5', 'p/6', 'p/7', 'p/8'];
    expect(recentList(recent, ['p/9', 'p/2'])).toEqual(['p/9', 'p/2', 'p/1', 'p/3', 'p/4', 'p/5', 'p/6', 'p/7']);
    const inUse = Array.from({ length: 10 }, (_, i) => `u/${i}`);
    expect(recentList(recent, inUse)).toEqual(inUse);
  });
  it('repeated or invalid in-use entries do not stretch the section past 8', () => {
    const recent = ['p/1', 'p/2', 'p/3', 'p/4', 'p/5', 'p/6', 'p/7', 'p/8'];
    expect(recentList(recent, [...Array.from({ length: 10 }, () => 'u/1'), '', 'x\ny'])).toEqual(['u/1', ...recent.slice(0, 7)]);
  });
});

describe('thinking', () => {
  const ix = smallIx();
  const row = (spec: string) => ix.rows.find((r) => r.spec === spec)!;
  const BOT: ThinkingLevel[] = ['', 'off', 'on', 'low', 'medium', 'high', 'xhigh', 'max'];
  it('the step shows for a reasoning model, or while a level is held (so it stays removable)', () => {
    expect(thinkingShown(row('openai/gpt-5'), '')).toBe(true);
    expect(thinkingShown(row('zeta/z1'), '')).toBe(false);
    expect(thinkingShown(row('zeta/z1'), 'high')).toBe(true);
    expect(thinkingShown(null, '')).toBe(false);
    expect(thinkingShown(row('zeta/z2'), '')).toBe(false); // reasoning unknown: no step until a level is held
  });
  it('a model known to take no thinking is offered only the default (and a held level, to remove it)', () => {
    expect(thinkingLevels(row('zeta/z1'), BOT, '')).toEqual(['']);
    expect(thinkingLevels(row('zeta/z1'), BOT, 'high')).toEqual(['', 'high']);
  });
  it('off/on are not in efforts: offered only when the caller passes them as known', () => {
    const own: PickRow = { ...row('openai/gpt-5'), efforts: ['low', 'high'] };
    expect(thinkingLevels(own, BOT, '')).toEqual(['', 'low', 'high']);
    expect(thinkingLevels(own, BOT, '', null)).toEqual(['', 'low', 'high']);
    expect(thinkingLevels(own, BOT, 'on')).toEqual(['', 'low', 'high', 'on']);
    expect(thinkingLevels(own, BOT, '', ['on'])).toEqual(['', 'on', 'low', 'high']);
    expect(thinkingLevels(own, BOT, 'off', ['on'])).toEqual(['', 'on', 'low', 'high', 'off']);
    const typeOnly: PickRow = { ...row('openai/gpt-5'), efforts: [] };
    expect(thinkingLevels(typeOnly, BOT, '', ['off', 'on'])).toEqual(['', 'off', 'on']);
  });
  it("'' first, then the caller's vocabulary; narrowed to the model's own levels once published", () => {
    expect(thinkingLevels(row('openai/gpt-5'), BOT, '', ['off', 'on'])).toEqual(BOT);
    expect(thinkingLevels(row('openai/gpt-5'), BOT, '')).toEqual(BOT.filter((l) => l !== 'off' && l !== 'on'));
    const own: PickRow = { ...row('openai/gpt-5'), efforts: ['low', 'high'] };
    expect(thinkingLevels(own, BOT, '', ['off', 'on'])).toEqual(['', 'off', 'on', 'low', 'high']);
  });
  it('a held level the model does not take stays, last, so it can be seen and removed', () => {
    const own: PickRow = { ...row('openai/gpt-5'), efforts: ['low'] };
    expect(thinkingLevels(own, ['', 'low', 'high'], 'max')).toEqual(['', 'low', 'max']);
  });
  it('resets only when the committed model changes', () => {
    expect(thinkingAfterPick('a/1', 'a/1', 'high')).toBe('high');
    expect(thinkingAfterPick('a/1', 'a/2', 'high')).toBe('');
  });
});
