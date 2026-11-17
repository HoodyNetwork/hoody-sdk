// The model chooser's search: an index of every model and provider, built in time slices after the
// first paint, and a paged bounded search over it. Readiness is not in the index: the caller looks it up at query
// time from the evidence, so a key save never rebuilds it. Pure apart from the slicer's clock and yield.
import { providers } from '@core';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { PAGE } from './modelPaging';

type Catalogue = providers.Catalogue;

export interface IndexedModel {
  spec: string;
  /** The provider's position in `providers` (ensembles: `providers.length`). */
  pi: number;
  /** Folded label, provider name and spec. */
  hay: string;
  lab: string;
  plab: string;
  /** 0 for a Suggested provider's model (ranked first), else 1. */
  sug: 0 | 1;
}

export interface IndexedProvider {
  id: string;
  prefix: string;
  hay: string;
  lab: string;
  sug: 0 | 1;
}

export interface ModelIndex {
  identity: string;
  providers: IndexedProvider[];
  models: IndexedModel[];
}

const NO_NAMES = { model: '', provider: '' };
/** A spec as indexed: a Hoody AI spec only as core providers shows a raw id (idText), every other spec whole. */
export const shownSpec = (spec: string) => (providers.ownedByHoody(spec) ? providers.idText(spec, NO_NAMES) : spec);

/**
 * The index identity: the scope plus a hash over every indexed field (provider id, prefix and public label; model
 * spec and public label). A provider-only rename or a scope change gives a new identity; readiness never does.
 */
export function indexIdentity(scopeKey: string, cat: Catalogue): string {
  return `${scopeKey}|${providers.catalogueSig(cat)}`;
}

export interface BuildOptions {
  /** False once a newer build or another catalogue took over: the build stops at its next slice. */
  isCurrent?: () => boolean;
  /** True once a query is waiting: the remaining slices run without yielding. */
  urgent?: () => boolean;
  /** Work per slice before yielding (ms); the clock is read every 100 entries. */
  budgetMs?: number;
  now?: () => number;
  yieldTo?: () => Promise<void>;
  /** Called with each slice's start and end (default: a `mc-index-slice` performance measure). */
  onSlice?: (start: number, end: number) => void;
  fold?: (s: string) => string;
  /** A hidden name's word, as the chooser's rows read (default: none). */
  modelWord?: string;
}

const CLOCK_EVERY = 100;

function defaultYield(): Promise<void> {
  const sched = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched && typeof sched.yield === 'function') return sched.yield();
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

function measureSlice(start: number, end: number): void {
  try {
    performance.measure('mc-index-slice', { start, end });
  } catch {
    // A browser without measure options records nothing; the build goes on.
  }
}

/**
 * Builds the index in slices. Resolves null when the build became obsolete (`isCurrent` false at a slice
 * boundary), so a stale catalogue never lands.
 */
export async function buildIndex(cat: Catalogue, identity: string, o: BuildOptions = {}): Promise<ModelIndex | null> {
  const isCurrent = o.isCurrent ?? (() => true);
  const urgent = o.urgent ?? (() => false);
  const budget = o.budgetMs ?? 4;
  const now = o.now ?? (() => performance.now());
  const yieldTo = o.yieldTo ?? defaultYield;
  const onSlice = o.onSlice ?? measureSlice;
  const f = o.fold ?? kitFold;
  const word = o.modelWord ?? '';
  if (!isCurrent()) return null;

  const plist = Object.values(cat.byId);
  const pos = new Map<string, number>();
  const provs: IndexedProvider[] = plist.map((p, i) => {
    pos.set(p.prefix, i);
    const label = p.label === null ? '' : providers.publicName(p.label, p.id);
    const sug: 0 | 1 = providers.SUGGESTED.includes(p.id) ? 0 : 1;
    return { id: p.id, prefix: p.prefix, hay: f(`${label}\u0000${p.id}`), lab: f(label || p.id), sug };
  });
  const plabs = provs.map((p) => p.lab);
  const src = cat.models;
  const models: IndexedModel[] = new Array(src.length);
  let i = 0;
  while (i < src.length) {
    const t0 = now();
    while (i < src.length) {
      const end = Math.min(i + CLOCK_EVERY, src.length);
      for (; i < end; i++) {
        const m = src[i]!;
        const pre = providers.prefixOf(m.spec);
        const pi = pre === 'fusion' ? provs.length : (pos.get(pre) ?? provs.length);
        const p = provs[pi];
        const label = providers.modelNameOf(m.spec, cat, word);
        const plab = pi < provs.length ? plabs[pi]! : '';
        models[i] = { spec: m.spec, pi, hay: f(`${label}\u0000${p ? p.lab : ''}\u0000${shownSpec(m.spec)}`), lab: f(label), plab, sug: p ? p.sug : 1 };
      }
      if (now() - t0 >= budget) break;
    }
    onSlice(t0, now());
    if (!isCurrent()) return null;
    if (i < src.length && !urgent()) {
      await yieldTo();
      if (!isCurrent()) return null;
    }
  }
  return { identity, providers: provs, models };
}

// ── search ────────────────────────────────────────────────────────────────────────────────

export type Group = 'ready' | 'unknown' | 'needs_key';

export interface SearchPages {
  providers?: number;
  ready?: number;
  unknown?: number;
  /** The page of needs-setup providers (4 per page). */
  setup?: number;
}

export interface SetupHit {
  /** The provider id ('fusion' for ensembles). */
  providerId: string;
  /** Its best matches (at most 5), ranked. */
  specs: string[];
  /** All of its matches ("{n - specs.length} more in {provider}"). */
  n: number;
}

export interface SearchResult {
  providers: string[];
  ready: string[];
  unknown: string[];
  setup: SetupHit[];
  totals: { providers: number; ready: number; unknown: number; setup: number };
  /** Providers with at least one needs-setup match (the setup pager's total). */
  setupProviders: number;
}

export interface SearchOptions {
  /** A listed model's readiness group (from the evidence; never in the index). */
  readiness: (spec: string) => Group;
  /** Caller eligibility (purpose, backend). Default: every model. */
  eligible?: (spec: string) => boolean;
  /** Providers the directory shows. Default: every provider. */
  showProvider?: (id: string) => boolean;
  /** The kit's fold (injectable so a test can count it: it runs once per query). */
  fold?: (s: string) => string;
}

interface Hit {
  s: number;
  sug: number;
  plab: string;
  lab: string;
  key: string;
  pi: number;
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** The ranking inside a group: first-word score, Suggested first, provider name, label, then the key: a total order. */
export const cmpHit = (a: Hit, b: Hit): number => a.s - b.s || a.sug - b.sug || cmpStr(a.plab, b.plab) || cmpStr(a.lab, b.lab) || cmpStr(a.key, b.key);
const cmpF = (s: number, sug: number, plab: string, lab: string, key: string, b: Hit) => s - b.s || sug - b.sug || cmpStr(plab, b.plab) || cmpStr(lab, b.lab) || cmpStr(key, b.key);
/** 0: the label starts with the first word; 1: a word of the label does; 2: anywhere. */
export const scoreOf = (lab: string, first: string): number => (lab.startsWith(first) ? 0 : lab.includes(` ${first}`) ? 1 : 2);

/** Past this K a group keeps every match and sorts once (a deep page). */
const FULL_SORT_K = 200;

/** A top-K that allocates nothing for a match that cannot enter it. */
class Top {
  readonly hits: Hit[] = [];
  constructor(readonly k: number) {}
  get full(): boolean {
    return this.k > FULL_SORT_K;
  }
  enters(s: number, sug: number, plab: string, lab: string, key: string): boolean {
    return this.full || this.hits.length < this.k || cmpF(s, sug, plab, lab, key, this.hits[this.k - 1]!) < 0;
  }
  add(h: Hit): void {
    if (this.full) {
      this.hits.push(h);
      return;
    }
    let lo = 0;
    let hi = this.hits.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cmpHit(this.hits[mid]!, h) <= 0) lo = mid + 1;
      else hi = mid;
    }
    this.hits.splice(lo, 0, h);
    if (this.hits.length > this.k) this.hits.pop();
  }
  ranked(): Hit[] {
    return this.full ? this.hits.sort(cmpHit) : this.hits;
  }
}

const cut = <T>(xs: readonly T[], size: number, page: number) => xs.slice(page * size, page * size + size);
const pg = (p: number | undefined) => Math.max(0, Math.floor(p ?? 0));

/** The words of a query, folded once. Every word must appear, in any order. */
export function queryWords(query: string, fold: (s: string) => string = kitFold): string[] {
  return fold(query).trim().split(/\s+/).filter(Boolean);
}

/** One pass over the index. Each group pages on its own. */
export function searchIndex(ix: ModelIndex, query: string, pages: SearchPages, o: SearchOptions): SearchResult {
  const ws = queryWords(query, o.fold ?? kitFold);
  const first = ws[0] ?? '';
  const eligible = o.eligible ?? (() => true);
  const showProvider = o.showProvider ?? (() => true);
  const match = (hay: string) => {
    for (const w of ws) if (!hay.includes(w)) return false;
    return true;
  };
  const pp = pg(pages.providers);
  const pr = pg(pages.ready);
  const pu = pg(pages.unknown);
  const ps = pg(pages.setup);
  const tp = new Top((pp + 1) * PAGE.searchProviders);
  const tr = new Top((pr + 1) * PAGE.searchReady);
  const tu = new Top((pu + 1) * PAGE.searchUnknown);
  const groups = ix.providers.length + 1;
  const per: (Top | undefined)[] = new Array(groups);
  const perN = new Int32Array(groups);
  const totals = { providers: 0, ready: 0, unknown: 0, setup: 0 };

  ix.providers.forEach((e, i) => {
    if (!match(e.hay) || !showProvider(e.id)) return;
    totals.providers++;
    const s = scoreOf(e.lab, first);
    if (tp.enters(s, e.sug, e.lab, e.lab, e.id)) tp.add({ s, sug: e.sug, plab: e.lab, lab: e.lab, key: e.id, pi: i });
  });
  for (const e of ix.models) {
    if (!match(e.hay) || !eligible(e.spec)) continue;
    const s = scoreOf(e.lab, first);
    const g = o.readiness(e.spec);
    let top: Top;
    if (g === 'ready') {
      totals.ready++;
      top = tr;
    } else if (g === 'unknown') {
      totals.unknown++;
      top = tu;
    } else {
      totals.setup++;
      perN[e.pi]!++;
      top = per[e.pi] ??= new Top(PAGE.searchPerProvider);
    }
    if (top.enters(s, e.sug, e.plab, e.lab, e.spec)) top.add({ s, sug: e.sug, plab: e.plab, lab: e.lab, key: e.spec, pi: e.pi });
  }
  // Needs setup: providers ranked by their best match (at most every provider to sort), then the asked page.
  const ranked: { best: Hit; i: number }[] = [];
  per.forEach((t, i) => {
    if (t && t.hits.length) ranked.push({ best: t.hits[0]!, i });
  });
  ranked.sort((a, b) => cmpHit(a.best, b.best));
  const setup = cut(ranked, PAGE.searchSetupProviders, ps).map(({ i }) => ({
    providerId: i < ix.providers.length ? ix.providers[i]!.id : 'fusion',
    specs: per[i]!.hits.map((h) => h.key),
    n: perN[i]!,
  }));
  const keys = (t: Top, size: number, page: number) => cut(t.ranked(), size, page).map((h) => h.key);
  return {
    providers: keys(tp, PAGE.searchProviders, pp),
    ready: keys(tr, PAGE.searchReady, pr),
    unknown: keys(tu, PAGE.searchUnknown, pu),
    setup,
    totals,
    setupProviders: ranked.length,
  };
}
