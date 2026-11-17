// The one model picker's pure rules: the rows it shows, its filters with their live
// counts, the order of its list, and the favourites and recent lists it remembers per account. No React and no words:
// ModelPick turns the view into rows, and its strings name the sections and chips.
//
// Truth rules:
//   - a field the agent does not send is unknown (null), never a guess: a filter over it takes no part, and a filter
//     whose field no row carries (images, tools until the agent sends them) is absent (its facet count is null);
//   - readiness is the caller's (the evidence's), never re-judged here;
//   - one pass over the index answers a keystroke: the matches, the order and every facet count.
import { providers } from '@core';
import { fold as kitFold } from '../data/DataTableViewLogic';
import { shownSpec } from './modelIndex';

type Ready = providers.Ready;
type Obj = Record<string, unknown>;

// ── rows ──────────────────────────────────────────────────────────────────────────────────

/** A thinking level in any caller's vocabulary ('' = the default: the caller's inherit label). */
export type ThinkingLevel = '' | 'off' | 'on' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type PickSource = 'provider' | 'fusion' | 'claude_code';

/** One model as the callers already build it (core agent choices, providers.list rows, the kit's ModelChoice). */
export interface PickBase {
  spec: string;
  label: string;
  providerId: string;
  providerLabel: string;
  ready: Ready;
  source: PickSource;
  recommended?: boolean;
}

/** A row of the picker: the base plus what the catalogue says about the model (null = the agent did not say). */
export interface PickRow extends PickBase {
  /** Input context window in tokens. null: unknown (0 or absent on the wire, or a Claude Code row). */
  window: number | null;
  /** List price in USD per million tokens, in and out. null: unknown (absent on the wire). 0 is free. */
  priceIn: number | null;
  priceOut: number | null;
  /** Takes a thinking level: the catalogue's `reasoning`, or Claude Code with efforts. null: unknown (not sent). */
  reasoning: boolean | null;
  /** Reads images. null: unknown (no `input_modalities` on the wire). */
  images: boolean | null;
  /** Calls tools. null: unknown (no `tool_call` on the wire). */
  tools: boolean | null;
  /** The effort levels this model takes (GET /models `efforts`, from the agent's capability rows; Claude Code's
   * efforts). null: not published. Says nothing about the off/on switches. */
  efforts: readonly string[] | null;
  /** An ensemble's member count; null for any other row. */
  members: number | null;
  /** The row's place in the agent's own list (GET /models order: family, newest first); Claude Code rows follow the
   * catalogue in the caller's order. The order inside a provider group. */
  at: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

export interface PickRowsOptions {
  /** Claude Code's efforts (its ClaudeSet), for Claude Code rows. */
  claudeEfforts?: readonly string[];
}

/**
 * Rows from the caller's base rows and the catalogue's raw answer. The raw model rows keep every field the agent sends
 * (core's catalogue() keeps the object), so the fields GET /models carries today (context_window, cost_in, cost_out,
 * reasoning) and the newer ones (input_modalities, tool_call, efforts) are read here, defensively.
 */
export function pickRows(base: readonly PickBase[], cat: providers.Catalogue | null, o: PickRowsOptions = {}): PickRow[] {
  const out: PickRow[] = [];
  const seen = new Set<string>();
  const wire = new Map<string, number>();
  if (cat) cat.models.forEach((m, i) => wire.set(m.spec, i));
  let extra = wire.size;
  for (const b of base) {
    if (!b.spec || seen.has(b.spec)) continue;
    seen.add(b.spec);
    if (b.source === 'claude_code') {
      const efforts = o.claudeEfforts ?? [];
      out.push({ ...b, window: null, priceIn: null, priceOut: null, reasoning: efforts.length > 0 ? true : null, images: null, tools: null, efforts: efforts.length ? efforts : null, members: null, at: extra++ });
      continue;
    }
    const raw = (cat?.bySpec[b.spec] ?? null) as Obj | null;
    const win = num(raw?.context_window);
    const pin = num(raw?.cost_in);
    const pout = num(raw?.cost_out);
    const mods = strs(raw?.input_modalities);
    const members = b.source === 'fusion' ? (strs(raw?.members)?.length ?? null) : null;
    out.push({
      ...b,
      window: win !== null && win > 0 ? win : null,
      priceIn: pin !== null && pin >= 0 ? pin : null,
      priceOut: pout !== null && pout >= 0 ? pout : null,
      reasoning: typeof raw?.reasoning === 'boolean' ? raw.reasoning : null,
      // An empty list is "unknown" on the agent (its input modalities), never "text only".
      images: mods && mods.length ? mods.includes('image') : null,
      tools: typeof raw?.tool_call === 'boolean' ? raw.tool_call : null,
      efforts: strs(raw?.efforts),
      members,
      at: wire.get(b.spec) ?? extra++,
    });
  }
  return out;
}

// ── index ─────────────────────────────────────────────────────────────────────────────────

export interface PickIndex {
  rows: readonly PickRow[];
  /** Folded name, provider name and shown spec of each row (same positions as rows). */
  hay: readonly string[];
  /** The group key of each row (provider id, 'fusion' or 'claude-code'). */
  group: readonly string[];
  /** Per group: whether any of its rows is ready, needs setup everywhere, or can't tell (whole catalogue, not the
   * search: a heading's word does not change while typing). */
  groupReady: ReadonlyMap<string, Ready>;
  /** Some row carries images / tools (else that filter is absent). */
  hasImages: boolean;
  hasTools: boolean;
  anyReady: boolean;
  specs: ReadonlySet<string>;
  /** Row positions in the agent's order (`at`, then spec): a keystroke walks this, so groups come out ordered. */
  order: Int32Array;
  /** Per group: its heading label (the first row's provider name in the agent's order). */
  groupLabel: ReadonlyMap<string, string>;
}

export const FUSION_GROUP = 'fusion';
export const CLAUDE_GROUP = 'claude-code';
export const groupOf = (r: PickBase): string => (r.source === 'fusion' ? FUSION_GROUP : r.source === 'claude_code' ? CLAUDE_GROUP : r.providerId);

/** Built once per catalogue (memoised by the caller); a keystroke never rebuilds it. */
export function indexPick(rows: readonly PickRow[], fold: (s: string) => string = kitFold): PickIndex {
  const hay = new Array<string>(rows.length);
  const group = new Array<string>(rows.length);
  const g: Map<string, { ready: boolean; setup: number; n: number }> = new Map();
  let hasImages = false;
  let hasTools = false;
  let anyReady = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    hay[i] = fold(`${r.label}\u0000${r.providerLabel}\u0000${shownSpec(r.spec)}`);
    const k = groupOf(r);
    group[i] = k;
    let e = g.get(k);
    if (!e) g.set(k, (e = { ready: false, setup: 0, n: 0 }));
    e.n++;
    if (r.ready === 'ready') e.ready = anyReady = true;
    else if (r.ready === 'needs_key') e.setup++;
    if (r.images !== null) hasImages = true;
    if (r.tools !== null) hasTools = true;
  }
  const groupReady = new Map<string, Ready>();
  for (const [k, e] of g) groupReady.set(k, e.ready ? 'ready' : e.setup === e.n ? 'needs_key' : 'unknown');
  const order = Int32Array.from(rows.keys()).sort((a, b) => rows[a]!.at - rows[b]!.at || (rows[a]!.spec < rows[b]!.spec ? -1 : rows[a]!.spec > rows[b]!.spec ? 1 : 0));
  const groupLabel = new Map<string, string>();
  for (const i of order) if (!groupLabel.has(group[i]!)) groupLabel.set(group[i]!, rows[i]!.providerLabel);
  return { rows, hay, group, groupReady, hasImages, hasTools, anyReady, specs: new Set(rows.map((r) => r.spec)), order, groupLabel };
}

// ── filters ───────────────────────────────────────────────────────────────────────────────

/** Ready: ready rows only. Setup: rows that need setup. All: every row, can't-tell rows included. */
export type Readiness = 'ready' | 'setup' | 'all';
export const WINDOW_BANDS = [128_000, 200_000, 1_000_000] as const;
export type WindowBand = 0 | (typeof WINDOW_BANDS)[number];
export const PRICE_BANDS = ['free', 'lt1', '1to5', 'gt5'] as const;
export type PriceBand = '' | (typeof PRICE_BANDS)[number];

export interface PickFilters {
  query: string;
  readiness: Readiness;
  /** Provider group keys; empty = every provider. */
  providers: readonly string[];
  thinking: boolean;
  images: boolean;
  tools: boolean;
  /** At least this many tokens (0 = any). */
  window: WindowBand;
  /** Input price band per million tokens ('' = any). Rows with no price take no part while a band is on. */
  price: PriceBand;
  favourites: boolean;
  recent: boolean;
}

export const NO_FILTERS: PickFilters = Object.freeze({ query: '', readiness: 'all', providers: [], thinking: false, images: false, tools: false, window: 0, price: '', favourites: false, recent: false });

/** Any filter is on besides the search and the readiness segment ("Clear filters" shows). */
export function filtersOn(f: PickFilters): boolean {
  return f.providers.length > 0 || f.thinking || f.images || f.tools || f.window !== 0 || f.price !== '' || f.favourites || f.recent;
}

/** Clear filters: everything off except the search and the readiness segment. */
export function clearFilters(f: PickFilters): PickFilters {
  return { ...NO_FILTERS, query: f.query, readiness: f.readiness };
}

export function priceBandOf(p: number | null): PriceBand {
  if (p === null) return '';
  return p === 0 ? 'free' : p < 1 ? 'lt1' : p <= 5 ? '1to5' : 'gt5';
}

const readinessHolds = (r: Ready, want: Readiness) => want === 'all' || (want === 'ready' ? r === 'ready' : r === 'needs_key');

// Fail bits: one per filter, so one pass gives every facet count. A value's count = the rows that pass every OTHER
// filter and hold that value. For a single chip that is the list if that chip alone changed; for the provider
// popover (multi-select, OR) it is the provider's own rows under every other filter, as faceted lists count a value.
const B_READY = 1;
const B_PROV = 2;
const B_THINK = 4;
const B_IMG = 8;
const B_TOOLS = 16;
const B_WIN = 32;
const B_PRICE = 64;
const B_FAV = 128;
const B_RECENT = 256;

export interface ProviderFacet {
  id: string;
  label: string;
  ready: Ready;
  count: number;
}

export interface Facets {
  readiness: Record<Readiness, number>;
  /** Every provider group in the catalogue, ready groups first (the order of the list), with its own count: its rows
   * under every filter but the provider one (adding it to a selection adds exactly these rows). */
  providers: ProviderFacet[];
  thinking: number;
  /** null: no row carries the field, so the chip is absent. */
  images: number | null;
  tools: number | null;
  window: Record<Exclude<WindowBand, 0>, number>;
  price: Record<Exclude<PriceBand, ''>, number>;
  favourites: number;
  recent: number;
}

// ── order ─────────────────────────────────────────────────────────────────────────────────

export type PickSection = 'inherit' | 'current' | 'favourites' | 'recent' | 'group';

export interface GroupHead {
  id: string;
  label: string;
  ready: Ready;
  /** Rows listed under this heading. */
  count: number;
}

export type PickItem =
  | { kind: 'heading'; key: string; section: Exclude<PickSection, 'inherit' | 'current'>; group: GroupHead | null; count: number }
  | { kind: 'inherit'; key: string; section: 'inherit'; pos: number }
  | { kind: 'row'; key: string; section: Exclude<PickSection, 'inherit'>; row: PickRow; pos: number; current: boolean; favourite: boolean };

export interface PickView {
  /** The flat list a virtualizer draws: headings and options. */
  items: PickItem[];
  /** Options in the list (aria-setsize): the inherit row plus every matching model, each once. */
  total: number;
  /** Models that match (the inherit row not counted): "214 of 7,077". */
  matched: number;
  facets: Facets;
  /** For each item, the index of the heading in force (sticky), or -1. */
  headingOf: Int32Array;
  /** Starred specs this catalogue does not list (gone, or another computer's): shown removable, never as a model. */
  staleFavourites: string[];
}

export interface ViewOptions {
  /** The spec in use ('' = the inherit row or nothing). */
  current: string;
  favourites: readonly string[];
  /** The recent list already merged (recentList). */
  recent: readonly string[];
  /** The caller's inherit row label (shown first when the search is empty or matches it). */
  inherit?: { label: string } | null;
  fold?: (s: string) => string;
}

/** At most this many rows in the favourites and in the recent section (each). */
export const SECTION_MAX = 8;

const HOODY_GROUP = 'hoody-ai';
const cmpLabel = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

/**
 * Group order: groups with a ready model first (Hoody AI, then the Suggested providers in their order, then by
 * name), then the rest by how many rows match (most first), then by name; ensembles last.
 */
function groupRank(id: string, ready: Ready): [number, number] {
  if (id === FUSION_GROUP) return [3, 0];
  if (ready !== 'ready') return [2, 0];
  if (id === HOODY_GROUP) return [0, -1];
  const s = providers.SUGGESTED.indexOf(id);
  return [1, s < 0 ? providers.SUGGESTED.length : s];
}

/** One pass: what the list shows for these filters, and every chip's count. */
export function pickView(ix: PickIndex, f: PickFilters, o: ViewOptions): PickView {
  const fold = o.fold ?? kitFold;
  const words = fold(f.query).trim().split(/\s+/).filter(Boolean);
  const provSet = f.providers.length ? new Set(f.providers) : null;
  const favSet = new Set(o.favourites);
  const recentSet = new Set(o.recent);
  const facets: Facets = {
    readiness: { ready: 0, setup: 0, all: 0 },
    providers: [],
    thinking: 0,
    images: ix.hasImages ? 0 : null,
    tools: ix.hasTools ? 0 : null,
    window: { 128000: 0, 200000: 0, 1000000: 0 },
    price: { free: 0, lt1: 0, '1to5': 0, gt5: 0 },
    favourites: 0,
    recent: 0,
  };
  const provCount = new Map<string, number>();
  // Matches per group before any row moves to a pinned section: the "rest by match count" rank.
  const groupMatched = new Map<string, number>();
  const matchedAt: number[] = [];
  const rows = ix.rows;
  const order = ix.order;
  outer: for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    const h = ix.hay[i]!;
    for (const w of words) if (!h.includes(w)) continue outer;
    const r = rows[i]!;
    const g = ix.group[i]!;
    const band = priceBandOf(r.priceIn);
    let m = 0;
    if (!readinessHolds(r.ready, f.readiness)) m |= B_READY;
    if (provSet && !provSet.has(g)) m |= B_PROV;
    if (f.thinking && r.reasoning !== true) m |= B_THINK;
    if (f.images && r.images !== true) m |= B_IMG;
    if (f.tools && r.tools !== true) m |= B_TOOLS;
    if (f.window !== 0 && !(r.window !== null && r.window >= f.window)) m |= B_WIN;
    if (f.price !== '' && band !== f.price) m |= B_PRICE;
    if (f.favourites && !favSet.has(r.spec)) m |= B_FAV;
    if (f.recent && !recentSet.has(r.spec)) m |= B_RECENT;
    if (m === 0) {
      matchedAt.push(i);
      groupMatched.set(g, (groupMatched.get(g) ?? 0) + 1);
    }
    // A value's count: every other filter passes (the bit itself may fail: the count is for the value, not the state).
    if ((m & ~B_READY) === 0) {
      facets.readiness.all++;
      if (r.ready === 'ready') facets.readiness.ready++;
      else if (r.ready === 'needs_key') facets.readiness.setup++;
    }
    if ((m & ~B_PROV) === 0) provCount.set(g, (provCount.get(g) ?? 0) + 1);
    if ((m & ~B_THINK) === 0 && r.reasoning === true) facets.thinking++;
    if (facets.images !== null && (m & ~B_IMG) === 0 && r.images === true) facets.images++;
    if (facets.tools !== null && (m & ~B_TOOLS) === 0 && r.tools === true) facets.tools++;
    if ((m & ~B_WIN) === 0 && r.window !== null) for (const b of WINDOW_BANDS) if (r.window >= b) facets.window[b]++;
    if ((m & ~B_PRICE) === 0 && band !== '') facets.price[band]++;
    if ((m & ~B_FAV) === 0 && favSet.has(r.spec)) facets.favourites++;
    if ((m & ~B_RECENT) === 0 && recentSet.has(r.spec)) facets.recent++;
  }

  // Provider facets: every group of the catalogue (a chip for a provider never disappears while typing).
  for (const [id, label] of ix.groupLabel) facets.providers.push({ id, label, ready: ix.groupReady.get(id) ?? 'unknown', count: provCount.get(id) ?? 0 });
  facets.providers.sort((a, b) => {
    const [ka, sa] = groupRank(a.id, a.ready);
    const [kb, sb] = groupRank(b.id, b.ready);
    return ka - kb || sa - sb || (ka === 2 ? b.count - a.count : 0) || cmpLabel(a.label, b.label);
  });

  // The list.
  const items: PickItem[] = [];
  let pos = 0;
  if (o.inherit) {
    const lab = fold(o.inherit.label);
    if (words.every((w) => lab.includes(w))) items.push({ kind: 'inherit', key: 'inherit', section: 'inherit', pos: ++pos });
  }
  const bySpec = new Map<string, number>();
  for (const i of matchedAt) bySpec.set(rows[i]!.spec, i);
  const shown = new Set<string>();
  const rowItem = (i: number, section: Exclude<PickSection, 'inherit'>): PickItem => {
    const r = rows[i]!;
    shown.add(r.spec);
    return { kind: 'row', key: `${section}:${r.spec}`, section, row: r, pos: ++pos, current: r.spec === o.current, favourite: favSet.has(r.spec) };
  };
  if (o.current && bySpec.has(o.current)) items.push(rowItem(bySpec.get(o.current)!, 'current'));
  const pinned = (list: readonly string[], section: 'favourites' | 'recent') => {
    const at: number[] = [];
    for (const s of list) {
      if (at.length >= SECTION_MAX) break;
      const i = bySpec.get(s);
      if (i !== undefined && !shown.has(s) && !at.includes(i)) at.push(i);
    }
    if (!at.length) return;
    items.push({ kind: 'heading', key: `h:${section}`, section, group: null, count: at.length });
    for (const i of at) items.push(rowItem(i, section));
  };
  pinned(o.favourites, 'favourites');
  pinned(o.recent, 'recent');

  const groups = new Map<string, number[]>();
  for (const i of matchedAt) {
    if (shown.has(rows[i]!.spec)) continue;
    const g = ix.group[i]!;
    let a = groups.get(g);
    if (!a) groups.set(g, (a = []));
    a.push(i);
  }
  // matchedAt is in the agent's order (the pass walks ix.order), so each group's rows already are: no sort per keystroke.
  const groupOrder = [...groups.keys()].map((id) => ({ id, ready: ix.groupReady.get(id) ?? ('unknown' as Ready), n: groupMatched.get(id) ?? 0, label: ix.groupLabel.get(id) ?? id }));
  groupOrder.sort((a, b) => {
    const [ka, sa] = groupRank(a.id, a.ready);
    const [kb, sb] = groupRank(b.id, b.ready);
    return ka - kb || sa - sb || (ka === 2 ? b.n - a.n : 0) || cmpLabel(a.label, b.label);
  });
  for (const g of groupOrder) {
    const at = groups.get(g.id)!;
    items.push({ kind: 'heading', key: `h:g:${g.id}`, section: 'group', group: { id: g.id, label: g.label, ready: g.ready, count: at.length }, count: at.length });
    // Inside a group: the agent's own order (family, newest first), from the walk.
    for (const i of at) items.push(rowItem(i, 'group'));
  }

  const headingOf = new Int32Array(items.length);
  let h = -1;
  for (let k = 0; k < items.length; k++) {
    if (items[k]!.kind === 'heading') h = k;
    headingOf[k] = h;
  }
  return { items, total: pos, matched: matchedAt.length, facets, headingOf, staleFavourites: o.favourites.filter((s) => !ix.specs.has(s)) };
}

// ── readiness default ─────────────────────────────────────────────────────────────────────

/** The readiness segment when the panel opens: the remembered one, else Ready when anything is ready, else All.
 * A remembered Ready falls back to All when nothing is ready (it would show an empty list). */
export function initialReadiness(ix: PickIndex, remembered: Readiness | null): Readiness {
  if (remembered && (remembered !== 'ready' || ix.anyReady)) return remembered;
  return ix.anyReady ? 'ready' : 'all';
}

// ── thinking ──────────────────────────────────────────────────────────────────────────────

/** The thinking step shows when the model takes a level, or a level is held (it must stay removable). */
export function thinkingShown(row: PickRow | null, held: ThinkingLevel): boolean {
  return row?.reasoning === true || held !== '';
}

/**
 * The levels offered for a model: '' (the caller's default) first, then the caller's vocabulary narrowed by what is
 * known about the model. A model known to take no thinking (reasoning false) is offered nothing more. Effort levels
 * narrow to the model's own `efforts` once published. The off/on switches are not in `efforts`: a switch is offered
 * only when the caller passes it in `switches` (the switches it knows the model takes; null or absent: none known, so
 * none offered). A held level the model does not take is kept last, so it can be seen and removed.
 */
export function thinkingLevels(row: PickRow | null, vocabulary: readonly ThinkingLevel[], held: ThinkingLevel, switches: readonly ('off' | 'on')[] | null = null): ThinkingLevel[] {
  const own = row?.efforts ?? null;
  const none = row?.reasoning === false;
  const out: ThinkingLevel[] = [''];
  for (const l of vocabulary) {
    if (l === '' || out.includes(l) || none) continue;
    if (l === 'off' || l === 'on') {
      if (!switches || !switches.includes(l)) continue;
    } else if (own && !own.includes(l)) continue;
    out.push(l);
  }
  if (held !== '' && !out.includes(held)) out.push(held);
  return out;
}

/** Picking another model resets the level: the old one may be a level the new model refuses. */
export function thinkingAfterPick(prevSpec: string, nextSpec: string, held: ThinkingLevel): ThinkingLevel {
  return prevSpec === nextSpec ? held : '';
}

// ── remembered per account (core/prefs ACCOUNT_PREF_KEYS) ─────────────────────────────────

/** One account preference for the picker everywhere: favourites, recent picks and the remembered filters. */
export const MODEL_PREFS_KEY = 'hub_models_v1';
export const FAV_MAX = 64;
export const RECENT_MAX = 8;

export interface ModelPrefs {
  /** Starred specs, newest first. */
  fav: string[];
  /** The last picks anywhere in the Hub, newest first. */
  recent: string[];
  /** The readiness segment last chosen (null: never chosen). */
  readiness: Readiness | null;
  /** The provider filter last chosen. */
  providers: string[];
}

export const NO_MODEL_PREFS: ModelPrefs = Object.freeze({ fav: [], recent: [], readiness: null, providers: [] }) as ModelPrefs;

// A spec as remembered: a short single-line string (catalogue specs, fusion/<slug>, claude-code[/<model>]).
const okSpec = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 260 && !/[\u0000-\u001f\u007f]/.test(s);
const specList = (v: unknown, max: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) if (okSpec(s) && !out.includes(s) && out.length < max) out.push(s);
  return out;
};
const READINESS: readonly Readiness[] = ['ready', 'setup', 'all'];

/** Reads a stored value defensively: anything malformed reads as nothing remembered. */
export function parseModelPrefs(raw: unknown): ModelPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return NO_MODEL_PREFS;
  const o = raw as Obj;
  return {
    fav: specList(o.fav, FAV_MAX),
    recent: specList(o.recent, RECENT_MAX),
    readiness: READINESS.includes(o.readiness as Readiness) ? (o.readiness as Readiness) : null,
    providers: specList(o.providers, 256),
  };
}

export function isFavourite(p: ModelPrefs, spec: string): boolean {
  return p.fav.includes(spec);
}

/** Stars or unstars a spec (newest first, at most FAV_MAX: the oldest star drops). */
export function toggleFavourite(p: ModelPrefs, spec: string): ModelPrefs {
  if (!okSpec(spec)) return p;
  return p.fav.includes(spec) ? { ...p, fav: p.fav.filter((s) => s !== spec) } : { ...p, fav: [spec, ...p.fav].slice(0, FAV_MAX) };
}

/** A pick anywhere in the Hub: first in the recent list (the inherit row, spec '', is not a model and is skipped). */
export function pickedRecently(p: ModelPrefs, spec: string): ModelPrefs {
  if (!okSpec(spec)) return p;
  if (p.recent[0] === spec) return p;
  return { ...p, recent: [spec, ...p.recent.filter((s) => s !== spec)].slice(0, RECENT_MAX) };
}

/** Remembers the readiness segment and the provider set (never a search, never the other chips). */
export function rememberFilters(p: ModelPrefs, f: Pick<PickFilters, 'readiness' | 'providers'>): ModelPrefs {
  const providers = specList(f.providers, 256);
  if (p.readiness === f.readiness && p.providers.length === providers.length && p.providers.every((x, i) => x === providers[i])) return p;
  return { ...p, readiness: f.readiness, providers };
}

/**
 * The recent section's list: the models in use where the picker opened (always), then the last picks, each once,
 * filled to SECTION_MAX.
 */
export function recentList(recent: readonly string[], inUse: readonly string[] = []): string[] {
  const out: string[] = [];
  for (const s of inUse) if (okSpec(s) && !out.includes(s)) out.push(s);
  const cap = Math.max(SECTION_MAX, out.length);
  for (const s of recent) {
    if (out.length >= cap) break;
    if (okSpec(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/** The filters a panel opens with: the remembered readiness and providers (those still in the catalogue). */
export function openingFilters(ix: PickIndex, p: ModelPrefs): PickFilters {
  return { ...NO_FILTERS, readiness: initialReadiness(ix, p.readiness), providers: p.providers.filter((id) => ix.groupReady.has(id)) };
}
