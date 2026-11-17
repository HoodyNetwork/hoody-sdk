// The apps page's data: its queries and mutations, declared in one place.
// LIVE SOURCE: reads go through coreSource over the computer's run kit (GET /api/v1/run/catalog and
// /api/v1/run/search) and the computer row (GET /computers/:cid). On a live
// page Open, Stop, Check, Restart and Forget run through core's run-open machine (parts/live.ts), and the
// Open list is the recent list's rows of this computer plus this session's launches (ops.ts). The mutations
// here serve the fixtures only.
import type { BoardOffer } from './parts/board';
import { coreSource, defineRoute, useCurrentComputer, type Target, pageFixtures } from '@core';
import type { OutcomeKind } from '@kit';
import { useEffect, useMemo, useState } from 'react';
import { FIND_MIN, FIND_SOURCES, type Candidate, type Find, type FindSource, type OpenApp, type Opens, type SourceAnswer, type Starter, argvProgramOf, classify, WARM_RETRIES, WARM_RETRY_MAX_MS, WARM_RETRY_MS } from './logic';

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const str = (x: unknown, max: number): string => (typeof x === 'string' ? x.slice(0, max) : '');
const CATALOG_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const OPENS: Record<string, Opens> = { web: 'web', terminal: 'terminal', screen: 'screen', gui: 'screen', cli: 'terminal' };
const PROVIDERS = ['nix', 'pkgx', 'appimage', 'oci', 'registry', 'system'] as const;

const routes = {
  computer: defineRoute({ method: 'GET', path: '/computers/:cid', scope: 'base' }),
  catalog: defineRoute({ method: 'GET', path: '/api/v1/run/catalog', scope: 'kit', kit: 'run', index: 1, query: ['q'] }),
  search: defineRoute({ method: 'GET', path: '/api/v1/run/search', scope: 'kit', kit: 'run', index: 1, query: ['app', 'limit', 'source'] }),
};
export const searchRoute = routes.search;

/** GET /api/v1/run/catalog → starters (a row that does not check is dropped). */
function catalogRows(raw: unknown): Starter[] {
  const list = rec(raw).entries;
  if (!Array.isArray(list)) throw new Error('unreadable');
  const out: Starter[] = [];
  const seen = new Set<string>();
  for (const e of list.slice(0, 200)) {
    const r = rec(e);
    const id = r.catalog_id;
    if (typeof id !== 'string' || !CATALOG_ID.test(id) || seen.has(id)) continue;
    const name = str(r.name, 80);
    if (!name) continue;
    seen.add(id);
    out.push({ id, name, description: str(r.description, 200), opensIn: OPENS[String(r.opens_in)] ?? 'web', available: r.available === true, shares: r.shares === true || id === 'miniserve' });
  }
  return out;
}

/** A row's program: its argv plan's binary (argvProgramOf), left out when longer than the row keeps, never cut. */
const pathOf = (c: Record<string, unknown>): string => {
  const p = argvProgramOf(c)?.path ?? '';
  return p.length <= 200 ? p : '';
};

/** GET /api/v1/run/search?source=<kind> → one source's rows. Its warnings are the kit's codes
 *  (SOURCE_WARMING and SOURCE_BACKOFF: skipped for now; SOURCE_TIMEOUT and SOURCE_FAILED: no answer) or older words,
 *  read in any case. */
export function searchRows(raw: unknown, app: string): SourceRead {
  const a = rec(raw);
  if (!Array.isArray(a.candidates) || typeof a.set_id !== 'string') throw new Error('unreadable');
  const warnings = Array.isArray(a.warnings) ? a.warnings.map((w) => String(rec(w).code ?? w)) : [];
  // Any warning at all, or a warnings field that does not read: the answer may not be whole.
  const warned = warnings.length > 0 || (a.warnings !== undefined && a.warnings !== null && !Array.isArray(a.warnings));
  const rows: Candidate[] = [];
  for (const c0 of a.candidates.slice(0, 50)) {
    const c = rec(c0);
    if (typeof c.candidate_id !== 'string' || !c.candidate_id || c.candidate_id.length > 200) continue;
    const title = str(c.title, 120);
    if (!title) continue;
    const provider = (PROVIDERS as readonly string[]).includes(String(c.provider)) ? (c.provider as Candidate['provider']) : ('other' as Candidate['provider']);
    const st = rec(c.starter);
    rows.push({
      app: app.slice(0, 120), setId: a.set_id, candidateId: c.candidate_id, title, description: str(c.description, 200),
      kind: c.kind === 'gui' || c.kind === 'cli' ? c.kind : 'any', provider, source: str(c.source_id, 80), version: str(c.version, 40),
      attr: provider === 'nix' ? str(rec(c.nix).attr ?? c.attr, 120) : '', path: pathOf(c), tags: Array.isArray(c.tags) ? c.tags.slice(0, 8).map((x) => str(x, 40)).filter(Boolean) : [],
      ...(typeof st.catalog_id === 'string' && CATALOG_ID.test(st.catalog_id) ? { starterId: st.catalog_id, starterOpens: OPENS[String(st.opens_in)] ?? '' } : {}),
    });
  }
  return { rows, partial: warnings.some((w) => /partial/i.test(w)), warming: warnings.some((w) => /warm|backoff/i.test(w)), failed: warnings.some((w) => /fail|unavailable|timeout/i.test(w)), ...(warned ? { warned } : {}) };
}

/** A read's params: the query, and the computer when it is not the current one (a Board tile's computer). */
interface On {
  target?: Target;
}
const targetInput = (p: On) => (p.target ? { target: p.target } : {});

const searchRead = (k: FindSource) => ({
  route: routes.search,
  input: (p: { q: string } & On) => ({ query: { app: p.q, source: k, limit: 50 }, ...targetInput(p) }),
  select: (raw: unknown, p: { q: string }) => searchRows(raw, p.q),
});

const source = coreSource(
  'apps',
  {
    reads: {
      computer: {
        route: routes.computer,
        input: (p: { cid: string }) => ({ params: { cid: p.cid } }),
        select: (raw: unknown): Computer => {
          const d = rec(rec(raw).data ?? raw);
          return { name: str(d.name, 80) || str(d.id, 8), status: str(d.status, 40) || 'unknown', color: str(d.color, 16) };
        },
      },
      // The catalogue narrows on the server (GET /run/catalog?q=), never by a page-made filter.
      catalog: { route: routes.catalog, input: (p: { q: string } & On) => ({ ...(p.q ? { query: { q: p.q } } : {}), ...targetInput(p) }), select: catalogRows },
      'search.system': searchRead('system'),
      'search.registry': searchRead('registry'),
      'search.nix': searchRead('nix'),
      'search.pkgx': searchRead('pkgx'),
      'search.appimage': searchRead('appimage'),
      'search.oci': searchRead('oci'),
    },
  },
  // The ship build (__HUB_FIXTURES__ false) holds no fixture module: the fallback is given only in a fixture build,
  // the only build where coreSource answers from it (fixtureModeActive needs __HUB_FIXTURES__).
  pageFixtures('apps'),
);
export const LIVE = !__HUB_FIXTURES__;

/** Whether a search answer row stays. Live: the sources already searched for q, so their answer is trusted as
 *  is (a match on tags or a path counts too). Only the fixtures, which answer every query
 *  alike, are narrowed here. */
export function kept(c: Candidate, q: string, live = LIVE): boolean {
  return live || matches(c, q);
}

export interface Computer {
  name: string;
  status: string;
  /** Its colour as the API gives it (ComputerMark checks it). */
  color?: string;
}

/** The shell's selected computer (null: none picked). */
export function useComputer() {
  const target = useCurrentComputer();
  const q = source.useQuery<Computer | null, { cid: string }>('computer', { cid: target?.container.id ?? '' }, { enabled: !LIVE || !!target });
  // No computer picked in the top bar: the page says so (data null), it never asks for one.
  return LIVE && !target ? { ...q, data: null as Computer | null, isPending: false } : q;
}

/** The computer a launcher acts on: the given one, or (undefined) the current one. null: none. */
function useLaunchTarget(given?: Target | null): Target | null {
  const current = useCurrentComputer();
  return given === undefined ? current : given;
}
/** A read's params for that computer: the current one is not named, so its cache stays the Apps page's. */
const onFor = (given: Target | null | undefined, target: Target | null): On => (given && target ? { target } : {});

/** The launcher's computer (its name and colour for the subtitle): the given one, or the current one. null: none. */
export function useLaunchComputer(given?: Target | null, o?: { refetchInterval?: number | false }) {
  const target = useLaunchTarget(given);
  return source.useQuery<Computer | null, { cid: string }>('computer', { cid: target?.container.id ?? '' }, { enabled: !LIVE || !!target, ...(o?.refetchInterval !== undefined ? { refetchInterval: o.refetchInterval } : {}) });
}

/** The ready-to-open apps. */
export function useCatalog(q = '', given?: Target | null) {
  const target = useLaunchTarget(given);
  const r = source.useQuery<Starter[], { q: string } & On>('catalog', { q: q.trim(), ...onFor(given, target) }, { enabled: !LIVE || !!target });
  // Fixtures answer one list whatever was asked: narrow it as the run kit does on the server (every word in the id,
  // name or description), so a fixture search shows what a live one would. Live, the server's answer is taken as is.
  const words = q.trim();
  const narrowed = useMemo(() => (LIVE || !words || !r.data ? r.data : r.data.filter((x) => fixtureMatches(x, words))), [r.data, words]);
  return narrowed === r.data ? r : ({ ...r, data: narrowed } as typeof r);
}

/** Fixtures only: whether a catalogue entry answers the words, every word somewhere in its id, name or description. */
function fixtureMatches(x: Starter, words: string): boolean {
  const text = `${x.id} ${x.name} ${x.description}`.toLowerCase();
  return words.toLowerCase().split(/\s+/).every((w) => text.includes(w));
}

/** Fixtures only: the Board offer of an open app by its key (a fixture state's `board`), so the details' Board row can
 *  be seen without a live launch. Live, the offer comes from the launch's own place (parts/board.ts) and this is empty. */
const NO_BOARD: Readonly<Record<string, BoardOffer>> = {};
export function useFixtureBoard(): Readonly<Record<string, BoardOffer>> {
  const q = source.useQuery<Record<string, BoardOffer>>('board', undefined, { enabled: !LIVE });
  return LIVE ? NO_BOARD : (q.data ?? NO_BOARD);
}

/** The apps opened from here on this computer, newest first: the fixture list; a live page shows this session's launches instead. */
const NONE: OpenApp[] = [];
export function useOpenApps() {
  // Live: the list is this session's launches (ops.ts).
  const q = source.useQuery<OpenApp[]>('opened', undefined, { enabled: !LIVE });
  return LIVE ? { ...q, data: NONE, isPending: false, error: null } : q;
}

export interface SourceRead {
  rows: Candidate[];
  partial: boolean;
  warming: boolean;
  /** The source did not answer. */
  failed: boolean;
  /** It came with a warning (any, even one not named above) or with warnings that do not read: maybe not whole. */
  warned?: boolean;
}

// One request per source (GET search?source=<kind>), so the list fills in as each answers. The fixture returns
// the source's rows for any query; core is asked with the query itself.
function usePerSource(q: string, given?: Target | null) {
  const target = useLaunchTarget(given);
  const enabled = q.trim().length >= FIND_MIN && (!LIVE || !!target);
  const p = { q: q.trim(), ...onFor(given, target) };
  const o = { enabled };
  const system = source.useQuery<SourceRead, typeof p>('search.system', p, o);
  const registry = source.useQuery<SourceRead, typeof p>('search.registry', p, o);
  const nix = source.useQuery<SourceRead, typeof p>('search.nix', p, o);
  const pkgx = source.useQuery<SourceRead, typeof p>('search.pkgx', p, o);
  const appimage = source.useQuery<SourceRead, typeof p>('search.appimage', p, o);
  const oci = source.useQuery<SourceRead, typeof p>('search.oci', p, o);
  // Each read's identity (computer, realm and generation with the words): state kept per read is keyed by it.
  const ids: Record<FindSource, string> = {
    system: source.useQueryHash('search.system', p),
    registry: source.useQueryHash('search.registry', p),
    nix: source.useQueryHash('search.nix', p),
    pkgx: source.useQueryHash('search.pkgx', p),
    appimage: source.useQueryHash('search.appimage', p),
    oci: source.useQueryHash('search.oci', p),
  };
  return { q, all: { system, registry, nix, pkgx, appimage, oci }, ids };
}

type AgentParams = { q: string; press?: true } & On;
/** The agents' read params: the list's reads, and Open's own (`press`: another query key, so a press never joins a
 *  read already out). */
export const agentParams = (names: readonly string[], on: On): { reads: AgentParams[]; presses: AgentParams[] } => ({
  reads: names.map((q) => ({ q, ...on })),
  presses: names.map((q) => ({ q, press: true as const, ...on })),
});

/** One coding agent's read: its answer now (AgentRead, for the badge, with when it came) and a fresh ask for Open. */
export interface AgentAsk {
  data?: SourceRead | undefined;
  error?: unknown;
  isFetching?: boolean;
  dataUpdatedAt?: number;
  errorUpdatedAt?: number;
  refetch: () => Promise<{ data?: SourceRead | undefined; error: unknown }>;
}

/** The coding agents' programs, each asked of the computer's system source by its name (GET search?app=<name>&
 *  source=system). With `enabled` (the Coding agents section is shown) each is read once for its badge, cached under
 *  the computer's key (core binds kit reads to it), so another computer never shows this one's answer. Open asks on a
 *  read of its own (`press` in its key, never enabled), so its answer always comes from a request sent after the
 *  press, never from a badge read already out. The fixtures answer per name from their `agents` key (a name it lacks:
 *  the source could not be asked); the system search itself is never read for it. */
export function useAgentSearch(names: readonly string[], given?: Target | null, o: { enabled?: boolean } = {}): AgentAsk[] {
  const target = useLaunchTarget(given);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- LIVE is fixed at build time: each build runs the same hooks
  if (!LIVE) return useFixtureAgents(names);
  const { reads: rp, presses: pp } = agentParams(names, onFor(given, target));
  const reads = source.useQueries<SourceRead, AgentParams>('search.system', rp, { enabled: !!o.enabled && !!target });
  const presses = source.useQueries<SourceRead, AgentParams>('search.system', pp, { enabled: false });
  return reads.map((r, i) => ({ data: r.data, error: r.error, isFetching: r.isFetching, dataUpdatedAt: r.dataUpdatedAt, errorUpdatedAt: r.errorUpdatedAt, refetch: presses[i]!.refetch }));
}

type AgentAnswers = Readonly<Record<string, SourceRead>>;
const notAsked = () => new Error('fixtures');
const answerOf = (all: AgentAnswers | undefined, name: string): SourceRead | undefined => (all && Object.hasOwn(all, name) ? all[name] : undefined);
function useFixtureAgents(names: readonly string[]): AgentAsk[] {
  const r = source.useQuery<AgentAnswers>('agents');
  return names.map((n) => {
    const data = answerOf(r.data, n);
    return {
      data,
      error: r.error ?? (r.data && !data ? notAsked() : null),
      isFetching: r.isFetching,
      dataUpdatedAt: r.dataUpdatedAt,
      errorUpdatedAt: r.errorUpdatedAt,
      refetch: () => r.refetch().then((x) => ({ data: answerOf(x.data, n), error: x.error ?? (answerOf(x.data, n) ? null : notAsked()) })),
    };
  });
}

const matches = (c: Candidate, q: string): boolean => `${c.title} ${c.description} ${c.attr}`.toLowerCase().includes(q.toLowerCase());

/** The wait before a still-warming source's nth automatic ask (from 0): WARM_RETRY_MS, doubling, capped. */
export const warmRetryDelay = (n: number): number => Math.min(WARM_RETRY_MS * 2 ** n, WARM_RETRY_MAX_MS);

type SearchQuery = ReturnType<typeof usePerSource>['all'][FindSource];
/** One source's own asks while it is getting ready: each answer that is still warming (a new dataUpdatedAt) arms one
 *  ask, after warmRetryDelay of how many warming answers came before it, never while a read is out, and never once
 *  the answer is failed (an error, or a source that says it failed: its Try again is the way). After WARM_RETRIES
 *  asks, the answer to the last one, still warming, leaves it spent (it reads as not answering). The count is this
 *  read's (`id`, its query key hash: the words, the computer, the realm and the generation): another read starts from
 *  none (back to an earlier one too), and so does reset (Try again). */
function useWarmRetry(r: SearchQuery, id: string, on: boolean): { spent: boolean; reset: () => void } {
  const at = r.dataUpdatedAt;
  const warming = on && !!r.data?.warming;
  // The warming answers in a row, as last committed: for which read, up to which answer.
  const [seen, setSeen] = useState({ id, at: 0, n: 0 });
  const base = seen.id === id ? seen : { id, at: -1, n: 0 };
  const n = at === base.at ? base.n : warming ? base.n + 1 : 0;
  useEffect(() => {
    if (seen.id !== id || seen.at !== at || seen.n !== n) setSeen({ id, at, n });
  }, [seen, id, at, n]);
  const waiting = warming && n > 0 && n <= WARM_RETRIES && !r.isFetching && !r.error && !r.data?.failed;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => void r.refetch(), warmRetryDelay(n - 1));
    return () => clearTimeout(t);
    // Keyed by the read and its answer: two reads can carry the same dataUpdatedAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, id, at]);
  return { spent: warming && n > WARM_RETRIES, reset: () => setSeen({ id, at, n: 0 }) };
}

/** Every source asked at once for a query of FIND_MIN characters or more; null otherwise. */
export function useFind(q: string, given?: Target | null): { find: Find | null; retry: (kinds?: FindSource[]) => void } {
  const { all, ids } = usePerSource(q, given);
  const on = q.trim().length >= FIND_MIN;
  // A source that is warming up is asked again by itself, on its own schedule (useWarmRetry).
  const warm: Record<FindSource, { spent: boolean; reset: () => void }> = {
    system: useWarmRetry(all.system, ids.system, on),
    registry: useWarmRetry(all.registry, ids.registry, on),
    nix: useWarmRetry(all.nix, ids.nix, on),
    pkgx: useWarmRetry(all.pkgx, ids.pkgx, on),
    appimage: useWarmRetry(all.appimage, ids.appimage, on),
    oci: useWarmRetry(all.oci, ids.oci, on),
  };
  const spent = FIND_SOURCES.filter((k) => warm[k].spent).join(' ');
  const find = useMemo<Find | null>(() => {
    if (!on) return null;
    const out: Find = {};
    const keep = (c: Candidate) => kept(c, q);
    for (const k of FIND_SOURCES) {
      const r = all[k];
      const a: SourceAnswer =
        r.isPending && !r.data
          ? { state: 'searching', rows: [], partial: false, warming: false }
          : r.error || r.data?.failed || spent.split(' ').includes(k)
            ? { state: 'failed', rows: (r.data?.rows ?? []).filter(keep).map((c) => classify({ ...c, app: q })), partial: false, warming: false }
            : { state: 'done', rows: (r.data?.rows ?? []).filter(keep).map((c) => classify({ ...c, app: q })), partial: !!r.data?.partial, warming: !!r.data?.warming };
      out[k] = a;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, q, spent, all.system.data, all.registry.data, all.nix.data, all.pkgx.data, all.appimage.data, all.oci.data, all.system.error, all.registry.error, all.nix.error, all.pkgx.error, all.appimage.error, all.oci.error, all.system.isPending, all.registry.isPending, all.nix.isPending, all.pkgx.isPending, all.appimage.isPending, all.oci.isPending]);

  const retry = (kinds?: FindSource[]) => {
    for (const k of kinds ?? FIND_SOURCES) {
      warm[k].reset();
      void all[k].refetch();
    }
  };
  return { find, retry };
}

// ── Changes (C9: one request per press, never resent) ────────────────────────────────

export interface OpenArgs {
  /** A starter id, or a search row's candidate id. */
  id: string;
  name: string;
  catalogId?: string;
  app?: string;
  opensIn: Opens;
  args?: string[];
  /** Names only: values never leave the form except to core. */
  envNames?: string[];
}
export interface ActResult {
  state?: OpenApp['state'];
  code?: string;
  /** The access code of a new Jupyter launch: shown once, held in memory. */
  accessCode?: string;
  key?: string;
}

export function useOpenApp() {
  return source.useMutation<ActResult, OpenArgs>('launch');
}
export function useStopApp() {
  return source.useMutation<ActResult, { key: string }>('stop');
}
export function useCheckApp() {
  return source.useMutation<ActResult, { key: string }>('check');
}
export function useRestartApp() {
  return source.useMutation<ActResult, { key: string }>('restart');
}
export function useForgetApp() {
  return source.useMutation<ActResult, { key: string }>('forget');
}

export type { OutcomeKind };
