// The model chooser's views as data: what the Ready view, a drill-in and the In use card
// hold for one evidence and one caller. Pure: readiness comes from the evidence (readinessOf), paging from
// modelPaging.ts, the directory from core/providers/directory.ts; ModelBrowser draws it.
import { agent, providers } from '@core';
import { PAGE, pageOf, pager, type Pager } from './modelPaging';
import type { PickBase } from './modelPickLogic';

type Evidence = providers.Evidence;
type Catalogue = providers.Catalogue;
type JudgeRules = providers.JudgeRules;
type Purpose = providers.Purpose;

/** A listed model's readiness, as the chooser shows it (gone is never listed). */
export type RowReady = 'ready' | 'unknown' | 'needs_key';

export interface ModelRow {
  spec: string;
  label: string;
  /** The provider id ('fusion' for ensembles, 'claude-code' for Claude Code rows). */
  provider: string;
  ready: RowReady;
  current: boolean;
  recommended: boolean;
  /** A caller's fallback row after a settled catalogue failure, or while the catalogue loads: always unknown. */
  fallback?: boolean;
}

export type GroupKind = 'ready' | 'unknown' | 'fusion' | 'claude' | 'fallback';

export interface ModelGroup {
  /** The provider id, or 'fusion' / 'claude-code' / 'fallback'. */
  id: string;
  kind: GroupKind;
  /** Provider label ('' for the kit's own groups: the browser words them). */
  label: string;
  /** Payment fact (null: none; never guessed). */
  pay: Exclude<providers.Pay, 'unknown' | 'ai_credit'> | null;
  /** Of the group's eligible models: in the trusted ready list, and all of them. */
  readyCount: number;
  total: number;
  /** At most a page of options (5). */
  options: ModelRow[];
}

/** A caller's row while the catalogue cannot be read: always unknown. */
export interface FallbackRow {
  spec: string;
  label: string;
}

/** The current model's problem (the In use card); null when it is healthy, inherited or not yet read. */
export interface InUse {
  spec: string;
  label: string;
  provider: string;
  providerLabel: string;
  why: 'needs_key' | 'unknown' | 'unlisted' | 'gone';
}

export interface ViewOptions {
  rules: JudgeRules;
  purpose: Purpose;
  /** The caller's value: a spec, or '' (the Agent's default when `rules.inherit`). */
  value: string;
  defaultSpec?: string | null;
  offer?: { endpoint?: boolean; claude?: boolean };
  /** The caller's generic word for a provider without a public label. */
  providerWord: string;
  /** The neutral name of a model with no name to show. */
  modelWord: string;
  fallback?: readonly FallbackRow[];
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const byLabel = (a: { label: string; spec: string }, b: { label: string; spec: string }) => collator.compare(a.label, b.label) || (a.spec < b.spec ? -1 : a.spec > b.spec ? 1 : 0);

const isFusion = (spec: string) => providers.prefixOf(spec) === 'fusion';
const isClaude = (spec: string) => agent.claudeModelOf(spec) !== null;

/** A model's public label: the one rule, providers.modelNameOf. `word` is the neutral name when nothing can be shown. */
type SentenceWord = 'mc.anyModel' | 'mc.model' | 'mc.thisModel';
/** A model's name inside a sentence: the row's word for a hidden name would read wrong there; a real name stays as it is. */
export const midSentence = (t: (k: SentenceWord) => string, label: string): string => (label === t('mc.anyModel') ? t('mc.model') : label);
/** The same, opening a sentence. */
export const startSentence = (t: (k: SentenceWord) => string, label: string): string => (label === t('mc.anyModel') ? t('mc.thisModel') : label);

export function modelLabel(cat: Catalogue | null, spec: string, word: string): string {
  return providers.modelNameOf(spec, cat, word);
}

/** A provider's public label, or the caller's generic word. */
export function providerLabel(cat: Catalogue, id: string, word: string): string {
  const p = cat.byId[id];
  if (!p || p.label === null) return word;
  return providers.publicName(p.label, p.id) || word;
}

/** readinessOf as a listed row reads it (gone: not listed). */
export function rowReady(ev: Evidence, spec: string): RowReady | 'gone' {
  return providers.readinessOf(ev, spec);
}

const RANK: Record<RowReady, number> = { ready: 0, unknown: 1, needs_key: 2 };

/** Drill-in order: current first, then recommended, ready, can't tell, needs setup, then name. */
export const drillOrder = (a: ModelRow, b: ModelRow): number =>
  Number(b.current) - Number(a.current) || Number(b.recommended) - Number(a.recommended) || RANK[a.ready] - RANK[b.ready] || byLabel(a, b);

/** Group order: current first, then recommended, then by name. */
const groupOrder = (a: ModelRow, b: ModelRow): number => Number(b.current) - Number(a.current) || Number(b.recommended) - Number(a.recommended) || byLabel(a, b);

/** The caller-eligible catalogue rows (gone and ineligible ones left out), with their readiness. */
function eligibleRows(ev: Evidence, o: ViewOptions): ModelRow[] {
  if (ev.catalogue.state !== 'ok') return [];
  const cat = ev.catalogue.value.cat;
  const out: ModelRow[] = [];
  for (const m of cat.models) {
    if (!o.rules.eligible(m.spec, ev)) continue;
    const r = rowReady(ev, m.spec);
    if (r === 'gone') continue;
    const fusion = isFusion(m.spec);
    const p = fusion ? undefined : cat.byPrefix[providers.prefixOf(m.spec)];
    out.push({ spec: m.spec, label: modelLabel(cat, m.spec, o.modelWord), provider: fusion ? 'fusion' : (p?.id ?? providers.prefixOf(m.spec)), ready: r, current: m.spec === o.value, recommended: m.spec === providers.FREE });
  }
  return out;
}

/** Claude Code rows from an ok Claude read, when the caller's rules take them (absent: none). */
function claudeRows(ev: Evidence, o: ViewOptions): ModelRow[] {
  if (!ev.claude || ev.claude.state !== 'ok') return [];
  const set = ev.claude.value;
  const specs = [agent.claudeSpec(''), ...set.models.map((m) => agent.claudeSpec(m.id))];
  const labels = new Map(set.models.map((m) => [agent.claudeSpec(m.id), m.label]));
  const out: ModelRow[] = [];
  for (const spec of specs) {
    if (!o.rules.eligible(spec, ev)) continue;
    const r = rowReady(ev, spec);
    if (r === 'gone') continue;
    out.push({ spec, label: labels.get(spec) ?? '', provider: agent.CLAUDE, ready: r, current: spec === o.value, recommended: false });
  }
  return out;
}

/** The current value's problem, or null (healthy, inherited, unread, or one the caller cannot take). */
export function inUseOf(ev: Evidence | null, o: ViewOptions): InUse | null {
  const spec = o.value;
  if (!ev || !spec) return null;
  const part = isClaude(spec) ? ev.claude : ev.catalogue;
  if (!part || part.state !== 'ok' || !o.rules.eligible(spec, ev)) return null;
  const r = providers.readinessOf(ev, spec);
  if (r === 'ready') return null;
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const fusion = isFusion(spec);
  const claude = isClaude(spec);
  const pid = fusion ? 'fusion' : claude ? agent.CLAUDE : (cat?.byPrefix[providers.prefixOf(spec)]?.id ?? providers.prefixOf(spec));
  const listed = claude || !!(cat && providers.own(cat.bySpec, spec));
  const why: InUse['why'] = r === 'needs_key' ? 'needs_key' : r === 'gone' ? 'gone' : listed ? 'unknown' : 'unlisted';
  const label = claude
    ? ev.claude?.state === 'ok'
      ? (ev.claude.value.models.find((m) => agent.claudeSpec(m.id) === spec)?.label ?? spec)
      : spec
    : modelLabel(cat, spec, o.modelWord);
  return { spec, label, provider: pid, providerLabel: cat && !fusion && !claude ? providerLabel(cat, pid, o.providerWord) : '', why };
}

export interface ReadyView {
  /** The Agent's default option (rules.inherit). */
  inherit: boolean;
  inUse: InUse | null;
  /** The provider groups of the page shown (ready groups, then Can't tell groups). */
  groups: ModelGroup[];
  groupPager: Pager;
  ensembles: ModelGroup | null;
  claude: ModelGroup | null;
  /** Every ready option across the view's groups (Nothing ready when 0). */
  readyTotal: number;
  /** The catalogue lists no model at all. */
  empty: boolean;
}

function pay(cat: Catalogue, id: string): ModelGroup['pay'] {
  const p = providers.providerState(cat, cat.byId[id]).pay;
  return p === 'included' || p === 'own_key' || p === 'plan' ? p : null;
}

/**
 * The Ready view of one evidence at group page `groupPage`. Groups: Hoody AI first, then the current model's
 * group, then the other ready providers A to Z; then Can't tell groups (a provider whose state is ready or unknown
 * and none of whose models is ready), current's first, then A to Z. A model shown in the In use card is in no group.
 */
export function readyView(ev: Evidence, o: ViewOptions, groupPage = 0): ReadyView {
  const inUse = inUseOf(ev, o);
  const rows = eligibleRows(ev, o);
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const byProvider = new Map<string, ModelRow[]>();
  const fusion: ModelRow[] = [];
  for (const r of rows) {
    if (r.provider === 'fusion') fusion.push(r);
    else {
      const list = byProvider.get(r.provider);
      if (list) list.push(r);
      else byProvider.set(r.provider, [r]);
    }
  }
  const hide = inUse?.spec;
  const currentProvider = o.value && !isFusion(o.value) && cat ? cat.byPrefix[providers.prefixOf(o.value)]?.id : undefined;
  const ready: ModelGroup[] = [];
  const unknown: ModelGroup[] = [];
  for (const [id, list] of byProvider) {
    if (!cat) break;
    const readyRows = list.filter((r) => r.ready === 'ready');
    const label = providerLabel(cat, id, o.providerWord);
    const base = { id, label, pay: pay(cat, id), readyCount: readyRows.length, total: list.length };
    if (readyRows.length) {
      ready.push({ ...base, kind: 'ready', options: readyRows.filter((r) => r.spec !== hide).sort(groupOrder).slice(0, PAGE.groupOptions) });
      continue;
    }
    const st = providers.providerState(cat, cat.byId[id]).state;
    const unk = list.filter((r) => r.ready === 'unknown' && r.spec !== hide);
    if (st !== 'needs_key' && unk.length) unknown.push({ ...base, kind: 'unknown', options: unk.sort(groupOrder).slice(0, PAGE.groupOptions) });
  }
  const first = (g: ModelGroup) => (g.id === providers.HOODY ? 0 : g.id === currentProvider ? 1 : 2);
  const order = (a: ModelGroup, b: ModelGroup) => first(a) - first(b) || collator.compare(a.label, b.label) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  ready.sort(order);
  unknown.sort(order);
  const all = [...ready, ...unknown].filter((g) => g.options.length > 0);
  const gp = pager(all.length, PAGE.readyGroups, groupPage);

  const mk = (id: string, kind: GroupKind, list: ModelRow[], size: number): ModelGroup | null => {
    const shown = list.filter((r) => r.spec !== hide);
    if (!shown.length) return null;
    return { id, kind, label: '', pay: null, readyCount: list.filter((r) => r.ready === 'ready').length, total: list.length, options: [...shown].sort(drillOrder).slice(0, size) };
  };
  const ensembles = mk('fusion', 'fusion', fusion, PAGE.ensembles);
  const claude = mk(agent.CLAUDE, 'claude', claudeRows(ev, o), PAGE.claude);
  const readyTotal = ready.reduce((n, g) => n + g.readyCount, 0) + (ensembles?.readyCount ?? 0) + (claude?.readyCount ?? 0);
  return {
    inherit: o.rules.inherit,
    inUse,
    groups: pageOf(all, PAGE.readyGroups, gp.page),
    groupPager: gp,
    ensembles,
    claude,
    readyTotal,
    empty: !!cat && cat.models.length === 0,
  };
}

/**
 * Fallback rows, for a settled failure only (usable with consent). The caller's rows, then its current value
 * and Hoody Free when the rules hold them; each spec once. While the catalogue loads only heldRow shows.
 */
export function fallbackRows(o: ViewOptions, cat: Catalogue | null = null): ModelRow[] {
  const out: ModelRow[] = [];
  const seen = new Set<string>();
  const add = (spec: string, label: string) => {
    if (!spec || seen.has(spec) || !o.rules.fallback.has(spec)) return;
    seen.add(spec);
    out.push({ spec, label: providers.publicName(label, spec) || modelLabel(cat, spec, o.modelWord), provider: providers.prefixOf(spec), ready: 'unknown', current: spec === o.value, recommended: spec === providers.FREE, fallback: true });
  };
  for (const r of o.fallback ?? []) add(r.spec, r.label);
  add(o.value, '');
  add(providers.FREE, '');
  return out.sort(groupOrder);
}

/**
 * The model this chooser holds, while the catalogue loads: it is real whatever the read answers. Shown, not activatable.
 * A Hoody AI spec with no name to show reads the neutral word, as in every other view.
 */
export function heldRow(o: ViewOptions, cat: Catalogue | null = null): ModelRow | null {
  const spec = o.value;
  if (!spec) return null;
  const given = providers.publicName(o.fallback?.find((r) => r.spec === spec)?.label, spec);
  const claude = isClaude(spec);
  const label = given || (spec === agent.CLAUDE ? '' : modelLabel(cat, spec, o.modelWord));
  return { spec, label, provider: claude ? agent.CLAUDE : providers.prefixOf(spec), ready: 'unknown', current: true, recommended: spec === providers.FREE, fallback: true };
}

export type DrillKind = 'provider' | 'fusion' | 'claude';

/** The spec as search may show it: a Hoody AI spec only as core providers shows a raw id (as the global index). */
const shownSpec = (spec: string): string => (providers.ownedByHoody(spec) ? providers.idText(spec, { model: '', provider: '' }) : spec);

/** A provider's words as the global index holds them: its public label, else its id. */
function providerWords(cat: Catalogue | null, id: string): string {
  const p = cat?.byId[id];
  if (!p) return '';
  return (p.label === null ? '' : providers.publicName(p.label, p.id)) || p.id;
}

/**
 * Folded words of a drill-in query match a row on the same fields as the global search (label, provider words, shown
 * spec; every word, any order), so "N more in {provider}" opens on the matches it counted.
 */
function matches(words: readonly string[], fold: (s: string) => string, r: ModelRow, plab: string): boolean {
  if (!words.length) return true;
  const hay = `${fold(r.label)}\u0000${fold(plab)}\u0000${fold(shownSpec(r.spec))}`;
  return words.every((w) => hay.includes(w));
}

/**
 * A drill-in's rows, in drill-in order, filtered by `words` (folded once by the caller). The caller pages them
 * (100 per page). Provider: its eligible models by spec prefix; fusion: the eligible ensembles; claude: Claude Code rows.
 */
export function drillRows(ev: Evidence, o: ViewOptions, kind: DrillKind, id: string, words: readonly string[] = [], fold: (s: string) => string = (s) => s): ModelRow[] {
  const src = kind === 'claude' ? claudeRows(ev, o) : eligibleRows(ev, o).filter((r) => (kind === 'fusion' ? r.provider === 'fusion' : r.provider === id));
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const plab = kind === 'provider' ? providerWords(cat, id) : '';
  return src.filter((r) => matches(words, fold, r, plab)).sort(drillOrder);
}

/** One option of a search result or a group, by spec (readiness from the evidence). */
export function rowOf(ev: Evidence, o: ViewOptions, spec: string): ModelRow | null {
  const r = rowReady(ev, spec);
  if (r === 'gone') return null;
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const fusion = isFusion(spec);
  const provider = fusion ? 'fusion' : (cat?.byPrefix[providers.prefixOf(spec)]?.id ?? providers.prefixOf(spec));
  return { spec, label: modelLabel(cat, spec, o.modelWord), provider, ready: r, current: spec === o.value, recommended: spec === providers.FREE };
}

/** The member providers an ensemble that needs setup is known to need: from the catalogue and the Claude read. */
export function ensembleSetup(ev: Evidence, spec: string): string[] {
  if (ev.catalogue.state !== 'ok') return [];
  const cat = ev.catalogue.value.cat;
  const members = [...providers.ensembleProblems(cat, spec), ...providers.claudeMemberProblems(ev, spec)];
  const out: string[] = [];
  for (const m of members) {
    const id = isClaude(m) ? agent.CLAUDE : (cat.byPrefix[providers.prefixOf(m)]?.id ?? '');
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The setup a provider needs, as a word key (old agents: no method claim). */
export function howOf(cat: Catalogue, id: string): 'key' | 'chatgpt' | 'openrouter' | 'endpoint' | 'ai' {
  const p = cat.byId[id];
  if (!p || !p.status || !Array.isArray(p.status.methods)) return 'ai';
  const m = p.status.methods;
  if (p.custom) return 'endpoint';
  if (id === 'openrouter' && m.includes('signin')) return 'openrouter';
  if (id === 'openai' && m.includes('signin')) return 'chatgpt';
  return m.includes('api_key') ? 'key' : 'ai';
}

// ── the one picker (ModelPick): every listed row once, and what a press does ────────────────

/** A spec Claude Code runs ('claude-code' or 'claude-code/<model>'). */
export const isClaudeSpec = (spec: string): boolean => spec === 'claude-code' || spec.startsWith('claude-code/');

/** The part of the evidence that holds a spec: ok, loading, failed, or absent (Claude Code not offered). */
export function agentPart(ev: Evidence, spec: string): 'ok' | 'loading' | 'failed' | 'absent' {
  const part = isClaudeSpec(spec) ? ev.claude : ev.catalogue;
  return part ? part.state : 'absent';
}

/** The words the picker's groups need that the catalogue does not hold. */
export interface PickWords {
  ensembles: string;
  claude: string;
  claudeDefault: string;
}

/**
 * Every row the caller may pick from one evidence, once each (modelPickLogic's PickBase): the eligible catalogue rows
 * (gone and ineligible left out) in the agent's order, then Claude Code's rows when the caller's rules take them.
 * Readiness is the evidence's (readinessOf), never re-judged.
 */
export function pickBaseOf(ev: Evidence, o: ViewOptions, words: PickWords): PickBase[] {
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  const out: PickBase[] = [];
  for (const r of eligibleRows(ev, o)) {
    const fusion = r.provider === 'fusion';
    out.push({ spec: r.spec, label: r.label, providerId: r.provider, providerLabel: fusion ? words.ensembles : cat ? providerLabel(cat, r.provider, o.providerWord) : o.providerWord, ready: r.ready, source: fusion ? 'fusion' : 'provider', recommended: r.recommended });
  }
  for (const r of claudeRows(ev, o)) out.push({ spec: r.spec, label: r.label || words.claudeDefault, providerId: agent.CLAUDE, providerLabel: words.claude, ready: r.ready, source: 'claude_code', recommended: false });
  return out;
}

/** What one press on a row does (ModelBrowser's activation as data), judged from the evidence at the press. */
export type Activation =
  | { do: 'inherit' }
  | { do: 'choose'; readiness: 'ready' }
  | { do: 'consent' }
  | { do: 'ensemble'; members: string[] }
  | { do: 'claude' }
  | { do: 'setup'; provider: string }
  | { do: 'none' };

export function activationOf(ev: Evidence | null, spec: string, rules: JudgeRules): Activation {
  if (spec === '') return rules.inherit ? { do: 'inherit' } : { do: 'none' };
  if (!ev) return { do: 'none' };
  const part = agentPart(ev, spec);
  if (part === 'failed') return rules.fallback.has(spec) ? { do: 'consent' } : { do: 'none' };
  if (part !== 'ok' || !rules.eligible(spec, ev)) return { do: 'none' };
  const r = rowReady(ev, spec);
  if (r === 'ready') return { do: 'choose', readiness: 'ready' };
  if (r === 'gone') return { do: 'none' };
  if (r === 'unknown') return { do: 'consent' };
  // needs setup: never chosen by the press (the attempt decides).
  if (isFusion(spec)) return { do: 'ensemble', members: ensembleSetup(ev, spec) };
  if (isClaudeSpec(spec)) return { do: 'claude' };
  const cat = ev.catalogue.state === 'ok' ? ev.catalogue.value.cat : null;
  return { do: 'setup', provider: cat?.byPrefix[providers.prefixOf(spec)]?.id ?? providers.prefixOf(spec) };
}
