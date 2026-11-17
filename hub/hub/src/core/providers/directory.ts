// The provider directory of the model picker: who needs attention, who is connected, the
// Suggested shortcuts, everyone else, and the other ways in. Providers only, never models. Pure: the kit pages
// each section (kit/pickers/modelPaging.ts) and draws it.
import { HOODY, prefixOf, providerState, publicName, SUGGESTED } from './catalogue';
import type { Purpose } from './choice';
import type { Evidence } from './read';
import { readinessOf } from './readiness';
import type { CatProvider, Catalogue, Pay } from './types';

/** choose: the picker's directory (ready providers live in the Ready view). connect: AI Connect (ready ones are listed too). */
export type Verb = 'choose' | 'connect';

export interface DirectoryOptions {
  purpose: Purpose;
  verb: Verb;
  /** The caller's current value (a spec; '' = the Agent's default). */
  current?: string | null;
  /** The caller's effective default, given explicitly (omitted: no attention entry for it). */
  defaultSpec?: string | null;
  /** Other ways: the endpoint entry unless `endpoint: false`; Claude Code only when `claude`. */
  offer?: { endpoint?: boolean; claude?: boolean };
}

/**
 * One provider. `state`: the agent's status (needs_key, ready, unknown); on an agent without provider status
 * Hoody AI is ready, a probe that said ready is `stored` (key stored, readiness not reported), everyone else
 * `not_checked`.
 */
export type DirState = 'ready' | 'needs_key' | 'unknown' | 'stored' | 'not_checked';
export type AttentionReason = 'current' | 'default' | 'endpoint' | 'unknown';

export interface DirProvider {
  id: string;
  prefix: string;
  /** Public label ('' = the caller's generic provider word). */
  label: string;
  custom: boolean;
  state: DirState;
  /** null: no payment fact (never guessed). */
  pay: Exclude<Pay, 'unknown'> | null;
  /** The setup methods the agent lists; null on an agent without provider status (no method claim). */
  methods: string[] | null;
  /** Caller-eligible models under this provider (by spec prefix). */
  models: number;
  /** Of those, in the trusted ready list; null when there is no trusted list. */
  ready: number | null;
  unknown: number;
  needsKey: number;
  /** Needs attention only. */
  reason?: AttentionReason;
}

export type OtherWay = 'endpoint' | 'claude';

export interface Directory {
  /** false while the catalogue part is not ok: every section is empty, Other ways stays. */
  available: boolean;
  attention: DirProvider[];
  /** Verb connect only. */
  connected: DirProvider[];
  suggested: DirProvider[];
  all: DirProvider[];
  /** Always shown (reserved rows). */
  other: OtherWay[];
  /** For the "More models" card: providers and models that need setup, models whose readiness can't be told. */
  totals: { setupProviders: number; setupModels: number; unknownModels: number };
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function stateOf(cat: Catalogue, p: CatProvider): DirState {
  const s = providerState(cat, p).state;
  if (cat.am1 || p.status) return s === 'ready' || s === 'needs_key' ? s : 'unknown';
  if (p.id === HOODY) return 'ready';
  return s === 'ready' ? 'stored' : 'not_checked';
}

const NO_OTHER = (o: DirectoryOptions): OtherWay[] => [...(o.offer?.endpoint === false ? [] : (['endpoint'] as const)), ...(o.offer?.claude ? (['claude'] as const) : [])];

/** The directory of one evidence, for one caller. One pass over the models, then at most one sort per section. */
export function directory(ev: Evidence, o: DirectoryOptions): Directory {
  const other = NO_OTHER(o);
  const empty: Directory = { available: false, attention: [], connected: [], suggested: [], all: [], other, totals: { setupProviders: 0, setupModels: 0, unknownModels: 0 } };
  if (ev.catalogue.state !== 'ok') return empty;
  const snap = ev.catalogue.value;
  const cat = snap.cat;
  const trusted = snap.ready === 'ok';

  const rows = new Map<string, DirProvider>();
  for (const p of Object.values(cat.byId)) {
    const ps = providerState(cat, p);
    rows.set(p.prefix, {
      id: p.id,
      prefix: p.prefix,
      label: p.label === null ? '' : publicName(p.label, p.id),
      custom: p.custom,
      state: stateOf(cat, p),
      pay: ps.pay === 'unknown' ? null : ps.pay,
      methods: p.status && Array.isArray(p.status.methods) ? p.status.methods.filter((m): m is string => typeof m === 'string') : null,
      models: 0,
      ready: trusted ? 0 : null,
      unknown: 0,
      needsKey: 0,
    });
  }
  // Caller eligibility for the model count: explain drops providers that take no output cap; ensembles are not providers.
  const capOk = (prefix: string) => o.purpose !== 'explain' || providerState(cat, cat.byPrefix[prefix]).completion;
  for (const m of cat.models) {
    const row = rows.get(prefixOf(m.spec));
    if (!row || !capOk(row.prefix)) continue;
    row.models++;
    const r = readinessOf(ev, m.spec);
    if (r === 'ready') row.ready = (row.ready ?? 0) + 1;
    else if (r === 'needs_key') row.needsKey++;
    else row.unknown++;
  }

  const shown = [...rows.values()].filter((r) => r.models > 0);
  const byName = (a: DirProvider, b: DirProvider) => collator.compare(a.label || a.id, b.label || b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const taken = new Set<string>();

  // Needs attention: (a) the current model's or the default's provider when it needs setup or its state is unknown;
  // (b) custom endpoints that need a key; (c) providers whose state is unknown. "Not checked" (old agents) never.
  const attention: DirProvider[] = [];
  const attend = (r: DirProvider | undefined, reason: AttentionReason) => {
    if (!r || r.models === 0 || taken.has(r.id) || !(r.state === 'needs_key' || r.state === 'unknown')) return;
    taken.add(r.id);
    attention.push({ ...r, reason });
  };
  for (const [spec, reason] of [[o.current, 'current'], [o.defaultSpec, 'default']] as const) if (spec) attend(rows.get(prefixOf(spec)), reason);
  const rest = (pred: (r: DirProvider) => boolean) => shown.filter((r) => !taken.has(r.id) && pred(r)).sort(byName);
  for (const r of rest((r) => r.custom && r.state === 'needs_key')) attend(r, 'endpoint');
  for (const r of rest((r) => r.state === 'unknown')) attend(r, 'unknown');

  // Connected (connect): a provider set up already, ready or with a key stored on an old agent (add a method,
  // replace the key). choose: only a ready provider leaves the directory (its models are in the Ready view); a
  // stored one is not proven ready, so it stays offered.
  const settled = (r: DirProvider) => r.state === 'ready' || r.state === 'stored';
  const connected = o.verb === 'connect' ? rest(settled) : [];
  for (const r of connected) taken.add(r.id);
  const offered = (r: DirProvider) => o.verb === 'connect' || r.state !== 'ready';
  const suggested = SUGGESTED.map((id) => shown.find((r) => r.id === id)).filter((r): r is DirProvider => !!r && !taken.has(r.id) && offered(r));
  for (const r of suggested) taken.add(r.id);
  const all = rest(offered);

  let setupProviders = 0;
  let setupModels = 0;
  let unknownModels = 0;
  for (const r of shown) {
    if (r.needsKey) setupProviders++;
    setupModels += r.needsKey;
    unknownModels += r.unknown;
  }
  return { available: true, attention, connected, suggested, all, other, totals: { setupProviders, setupModels, unknownModels } };
}
