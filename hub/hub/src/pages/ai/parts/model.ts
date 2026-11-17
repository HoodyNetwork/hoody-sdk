// The page's one read model: every section's projection from the reads, each with its own load state so
// one failing read leaves the other sections drawn.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { capture, providers, useCore, type Ctx, type Target } from '@core';
import { GONE } from '../api';
import { useAiApi, useBundleSource, useComputer, usePageReads, type Query } from '../data';
import {
  accountsOf, botList, cap, CAPS, checkerOf, claudeOf, defaults, guarded, headline, list, parseVersion, problemOf, realmOf, rows, t, usable,
  type Account,
} from '../logic';
import type { Catalogue, ClaudeCode, Checker, Defaults, Model, Obj, Outcome, Settled } from '../types';

export type Load = 'loading' | 'error' | 'ok';

function settled(q: Query, acp = false): Settled<unknown> | null {
  if (q.isPending) return null;
  if (q.error) {
    const k = (q.error as { kind?: string }).kind;
    const err: Outcome = { kind: k === 'network' || k === 'server' ? 'pending' : 'failed', code: k === 'not_found' ? 'not_found' : k === 'forbidden' ? 'forbidden' : '', status: k === 'not_found' ? 404 : k === 'forbidden' ? 403 : 0, retryAfter: null, details: {} };
    return { ok: false, err: err.kind === 'failed' && k === 'not_found' && acp ? { ...err, code: 'unknown_agent' } : err };
  }
  return q.data === undefined ? { ok: false, err: GONE } : { ok: true, body: q.data };
}

const load = (...qs: Array<Query>): Load => (qs.some((q) => q.isPending) ? 'loading' : qs.some((q) => q.error) ? 'error' : 'ok');

export interface AiModel {
  computer: { id: string; name: string } | null;
  /** The computer the catalogue bundle reads (null: none). */
  target: Target | null;
  /** The bundle's snapshot and when it answered, or the failed run's outcome with no snapshot held (evidenceOfAi). */
  bundle: { snap: providers.Snapshot | null; at: number; err: Outcome | null; refreshFailed: boolean };
  /** The bundle's reader for one read bound to `ctx`: the model chooser reads through it (useModelCatalogue `reads`). */
  readerFor: (t: Target, ctx: Ctx) => providers.CatalogueReader;
  realm: string | null;
  /** The computer's realms as its record proves them (../data Computer); null: not told, never no realm. */
  realmIds: string[] | null;
  caps: Record<string, boolean>;
  cat: Catalogue | null;
  models: Model[];
  /** Every model a setting can name, ensembles included (the Bots' default may be one): names and tags only. */
  named: Model[];
  defaults: Defaults | null;
  accounts: Account[] | null;
  bots: Obj[] | null;
  claude: ClaudeCode | null;
  acpDefaultCap: boolean;
  checker: Checker | null;
  checkerChoices: unknown;
  guarded: Record<string, number>;
  summary: string | null;
  problem: ReturnType<typeof problemOf>;
  loads: { catalogue: Load; defaults: Load; accounts: Load; claude: Load; checker: Load; bots: Load };
  firstLoad: boolean;
  reload: () => void;
}

/** A signal that never aborts: the chooser's reads end with their visit (useModelCatalogue drops a stale answer). */
const NEVER = new AbortController().signal;

/**
 * The page's catalogue bundle as the model picker's evidence (evidenceOfAi), for the Connect directory: no
 * second read. The scope is today's for the bundle's computer; null while the bundle has not answered or with no
 * computer.
 */
export function evidenceOfAi(m: Pick<AiModel, 'target' | 'bundle'>): providers.Evidence | null {
  if (!m.target) return null;
  const { snap, at, err } = m.bundle;
  const scope = providers.scopeOf(capture(m.target));
  if (snap) return { seq: at, scope, at, catalogue: { state: 'ok', value: snap }, claude: null };
  if (err) return { seq: at, scope, at, catalogue: { state: 'failed', err }, claude: null };
  return null;
}

export function useAiModel(): AiModel {
  const r = usePageReads();
  const comp = useComputer();
  const api = useAiApi();
  // The catalogue is one bundle per computer (core's useCatalogueBundle: providers, models, the ready list and the
  // probes from one run); the page reads only the bundle.
  // Each run reads its own computer (the key's), never whichever is current when a read starts.
  const src = useBundleSource(api, comp.data?.id ?? null);
  const bundle = providers.useCatalogueBundle(src.computer, src.readerFor);
  const shown = bundle.data ?? null;
  const core = useCore();
  const readerFor = src.readerFor;
  // Reload asks the reads of the latest render, each behind its own gate (a read held back stays held back), and
  // the catalogue bundle again.
  const latest = useRef({ r, comp, bundle });
  useEffect(() => {
    latest.current = { r, comp, bundle };
  });
  const reload = useCallback(() => {
    for (const q of Object.values(latest.current.r)) void q.refetch();
    if (latest.current.comp.data) void latest.current.bundle.refetch();
    void latest.current.comp.refetch();
  }, []);
  return useMemo<AiModel>(() => {
    const caps = parseVersion(r.version.data);
    // Not told (no computer, or a record that proves no realm list) stays null: realmOf never reads it as Global.
    const realmIds = comp.data?.realmIds ?? null;
    const realm = realmOf(realmIds, comp.data?.selectedRealm ?? null);
    const cat = shown ? shown.snap.cat : null;
    // The catalogue: loading until this computer's bundle answers; a failed run shows its error unless an earlier
    // bundle of the computer is held (the evidence stays, with its age).
    const catState: Load = cat ? 'ok' : bundle.isError ? 'error' : 'loading';
    const catLoad = (...qs: Query[]): Load => (catState !== 'ok' ? catState : load(...qs));
    const models = cat ? list(cat, 'worker', null) : [];
    const named = cat ? list(cat, 'bot', null) : [];
    const agentRows = r.agents.data ? rows(r.agents.data, 'agents') : null;
    const d = agentRows ? defaults(agentRows) : null;
    const botRowsAll = r.bots.data ? botList(r.bots.data) : null;
    const acpDefaultCap = cap(caps, CAPS.acpDefault);
    const here = !!comp.data && realm !== null;
    const claude = !here || r.acp.isPending ? null : claudeOf(settled(r.acp, true), acpDefaultCap ? settled(r.acpDefault) : null);
    const checker = !here || r.jev.isPending ? null : checkerOf(settled(r.jev), { realm, realmSettings: cap(caps, CAPS.jevRealm) });
    const u = d ? usable(d, cat, claude) : null;
    const name = comp.data?.name ?? t('name.computer');
    const computer = comp.data ? { id: comp.data.id, name: comp.data.name } : null;
    const accounts = cat && shown ? accountsOf(models, shown.providers) : null;
    const failed = bundle.error instanceof providers.CatalogueFailed ? bundle.error.err : bundle.isError ? GONE : null;
    return {
      computer,
      target: src.computer,
      // A held snapshot keeps its own time (its age shows); a later failed refresh is marked, never dropped.
      bundle: { snap: shown ? shown.snap : null, at: shown ? bundle.dataUpdatedAt : bundle.errorUpdatedAt, err: shown ? null : failed, refreshFailed: !!shown && bundle.isError },
      readerFor: (_t: Target, ctx: Ctx) => readerFor({ ctx, signal: NEVER }),
      realm,
      realmIds,
      caps,
      cat,
      models,
      named,
      defaults: d,
      accounts,
      bots: botRowsAll,
      claude,
      acpDefaultCap,
      checker,
      checkerChoices: r.jevModels.data ?? null,
      guarded: botRowsAll ? guarded(botRowsAll) : {},
      summary: d && cat ? headline({ ...d, ...(claude ? { helperBackend: claude.selected ? 'claude_code' : 'hoody' } : {}) }, models, name) : null,
      problem: u && d ? problemOf(u, d, models) : null,
      loads: {
        catalogue: catLoad(),
        defaults: catLoad(r.agents),
        accounts: catLoad(),
        claude: load(r.acp),
        checker: load(r.jev),
        bots: load(r.bots),
      },
      firstLoad: comp.isPending || (!!comp.data && bundle.isPending) || r.agents.isPending,
      reload,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, bundle.isError, bundle.isPending, bundle.error, bundle.dataUpdatedAt, bundle.errorUpdatedAt, src.computer, readerFor, core.account, core.realm, core.gen, r.version.data, r.agents.data, r.bots.data, r.acp.data, r.acpDefault.data, r.jev.data, r.jevModels.data, comp.data, r.agents.status, r.bots.status, r.acp.status, r.jev.status, r.acpDefault.status,
    // A read that stops or starts waiting (the computer cleared or picked mid-load) keeps its data and status.
    comp.isPending, r.agents.isPending, r.bots.isPending, r.acp.isPending, r.jev.isPending, reload]);
}
