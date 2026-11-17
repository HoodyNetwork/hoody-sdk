// The ai page's data: reads and changes behind the `Api` the flows use. A real page goes through coreApi
// (core's declared routes); under the fixture transport (hub:dev, hub:shots, tests) the same calls answer from
// fixtures.ts. A read is a fresh refetch (never a cached answer), a change is one mutateAsync and never retried (C9).
// Fixtures reach this live module only through the core fixture seam (never the app fixture module: the terminal ship build
// refuses a fixture module as an input, and the web build folds the seam away).
import { commerce, coreSource, fixtureErrorKind, fixtureLatency, pageFixtures, defineRoute, isRealmId, providers, readLanes, realmsView, useCurrentComputer, type LaneReading, type Target } from '@core';
import { useShellData } from '@kit';
import { useMemo, useRef } from 'react';
import { GONE, type Api } from './api';
import { coreApi } from './coreApi';
import { checkerWireRealm } from './flows-checker';
import { routes } from './routes';
import { catalogue as buildCatalogue, membershipOf, parseVersion, realmOf, CAPS, cap } from './logic';
import type { AuthBody, Catalogue, Outcome, Settled } from './types';

const fixtures = pageFixtures('ai');
const balances = commerce.commerceRoutes.balancesRoute;
const container = defineRoute({ method: 'GET', path: '/computers/:cid', scope: 'base' });
// The account's Hoody AI allowance, per AI server (the read Billing's usage table and the Servers cards make).
const aiUsage = defineRoute({ method: 'GET', path: '/users/me/free-ai-usage', scope: 'base' });
const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const realmInput = (realm: string | null) => ({ realm: realm ?? undefined });

// The page's one data source: live on a real page (every read names its declared route), the page's own
// fixtures under the fixture transport. Changes go through coreApi (below), which keeps C9's read-back.
const source = coreSource('ai', {
  reads: {
    version: { route: routes.version },
    providers: { route: routes.providers },
    models: { route: routes.models },
    ready: { route: routes.models, input: () => ({ query: { ready: true } }), select: (r) => r },
    agents: { route: routes.agents, input: (realm?: string | null) => realmInput(realm ?? null) },
    bots: { route: routes.bots, input: (realm?: string | null) => realmInput(realm ?? null) },
    acp: { route: routes.acp, input: (realm?: string | null) => realmInput(realm ?? null) },
    acpDefault: { route: routes.acpDefault, input: (realm?: string | null) => realmInput(realm ?? null) },
    jev: { route: routes.jev, input: (realm?: string | null) => realmInput(realm ?? null) },
    jevModels: { route: routes.jevModels },
    spend: { route: routes.usage, input: (since?: number | null) => (since == null ? {} : { query: { since } }) },
    credit: {
      route: balances,
      select: (r) => {
        const d = rec(rec(r).data);
        return { aiLive: d.ai_usage_status === 'live', aiRemaining: d.ai_usage_status === 'live' ? d.ai_remaining : null };
      },
    },
    // Each AI server's lanes by core's lane rule; a server the answer could not read is kept as unavailable, never 0.
    allowance: {
      route: aiUsage,
      select: (raw): Allowance => {
        const d = rec(rec(raw).data);
        const servers: AllowanceServer[] = [];
        const seen = new Set<string>();
        for (const r of Array.isArray(d.servers) ? (d.servers as unknown[]) : []) {
          const x = rec(r);
          const sv = rec(x.server);
          if (typeof sv.id !== 'string' || !sv.id || seen.has(sv.id)) continue;
          seen.add(sv.id);
          const ok = x.status === 'ok';
          // The AI server's name labels its row of the allowance table (display only, never an address).
          const shown: unknown = sv.name;
          servers.push({ id: sv.id, name: typeof shown === 'string' ? shown : '', ok, lanes: ok ? readLanes(rec(x.lanes) as Parameters<typeof readLanes>[0]) : [] });
        }
        return { servers, truncated: d.truncated === true };
      },
    },
    container: {
      route: container,
      input: (t?: { cid: string }) => (t ? { params: { cid: t.cid } } : {}),
      // The record's own id and realm list, as sent: useLiveComputer judges them (logic.ts membershipOf).
      select: (r) => {
        const d = rec(rec(r).data ?? r);
        return { id: d.id, realm_ids: d.realm_ids };
      },
    },
  },
}, fixtures);
const LIVE = !__HUB_FIXTURES__;
const core = LIVE ? coreApi() : null;

export type Query<T = unknown> = ReturnType<typeof source.useQuery<T>>;
type Mutation = ReturnType<typeof source.useMutation<unknown, unknown>>;

export interface Computer {
  id: string;
  name: string;
  /** The realms its record proves (logic.ts membershipOf); null: not told, never read as no realm. */
  realmIds: string[] | null;
  selectedRealm: string | null;
}

const STATUS: Record<string, number> = { not_found: 404, job_not_found: 404, unknown_agent: 404, forbidden: 403, admin_unauthorized: 403, oauth_in_progress: 409, definition_changed: 409, provider_exists: 409, model_prefix_taken: 409, api_key_refused: 422, model_unavailable: 422, provider_invalid: 422, store_failed: 503, rate_limited: 429 };

function failure(kind: Outcome['kind'], code = '', extra?: { status?: number; retryAfter?: number; details?: Outcome['details'] }): Outcome {
  return { kind, code, status: extra?.status ?? STATUS[code] ?? 0, retryAfter: extra?.retryAfter ?? null, details: extra?.details ?? {} };
}

function fromError(e: unknown): Outcome {
  const kind = fixtureErrorKind(e) ?? 'server';
  if (kind === 'not_found') return failure('failed', 'not_found', { status: 404 });
  if (kind === 'forbidden') return failure('failed', 'forbidden', { status: 403 });
  if (kind === 'bad_request') return failure('failed', 'bad_request', { status: 400 });
  return failure('pending', kind === 'network' ? 'network' : 'server', { status: kind === 'network' ? 0 : 500 });
}

async function read<T = unknown>(q: Query<T>, pick?: (b: T) => unknown): Promise<Settled<unknown>> {
  const r = await q.refetch();
  if (r.error || r.data === undefined) return { ok: false, err: fromError(r.error) };
  const b = pick ? pick(r.data) : r.data;
  return b === undefined ? { ok: false, err: failure('failed', 'not_found', { status: 404 }) } : { ok: true, body: b };
}

async function write(m: Mutation, input?: unknown): Promise<Settled<unknown>> {
  try {
    const r = await m.mutateAsync(input);
    if (r.outcome === 'done') return { ok: true, body: r.data ?? {} };
    if (r.outcome === 'stale') return { ok: false, err: GONE };
    const d = (r.data ?? {}) as { status?: number; retryAfter?: number; details?: Outcome['details'] };
    return { ok: false, err: failure(r.outcome, r.code ?? '', d) };
  } catch (e) {
    return { ok: false, err: fromError(e) };
  }
}

type PerProvider = Record<string, unknown>;

/** A read that cannot run here (`runs` false) is not waiting: TanStack v5 keeps a disabled query without data
 * `isPending` for good. Its manual refetch, which skips `enabled`, does nothing, so the page's reload never asks a read
 * that its own gate holds back (no computer shown, no realm, a capability the agent lacks). `waits` is false only where
 * the read is not one the page waits for here. */
function gated<Q extends { isPending: boolean; refetch: unknown }>(q: Q, runs: boolean, waits = runs): Q {
  const r = waits ? q : { ...q, isPending: false };
  return runs ? r : { ...r, refetch: (() => Promise.resolve(r)) as Q['refetch'] };
}

/** The Api over the page's fixtures. Stable across renders (the hooks' result objects are read by ref). */
function useFixtureAiApi(): Api {
  const q = {
    version: source.useQuery<unknown>('version'),
    providers: source.useQuery<unknown>('providers'),
    provider: source.useQuery<PerProvider>('provider'),
    auth: source.useQuery<PerProvider>('auth'),
    models: source.useQuery<unknown>('models'),
    ready: source.useQuery<unknown>('ready'),
    agents: source.useQuery<unknown>('agents'),
    bots: source.useQuery<unknown>('bots'),
    acp: source.useQuery<unknown>('acp'),
    acpDefault: source.useQuery<unknown>('acpDefault'),
    jev: source.useQuery<unknown>('jev'),
    jevModels: source.useQuery<unknown>('jevModels'),
    oauthPoll: source.useQuery<unknown>('oauthPoll'),
    pkcePoll: source.useQuery<unknown>('pkcePoll'),
  };
  const m = {
    keyPut: source.useMutation<unknown, unknown>('keyPut'),
    keyDelete: source.useMutation<unknown, unknown>('keyDelete'),
    authTest: source.useMutation<unknown, unknown>('authTest'),
    authDefault: source.useMutation<unknown, unknown>('authDefault'),
    oauthStart: source.useMutation<unknown, unknown>('oauthStart'),
    oauthCancel: source.useMutation<unknown, unknown>('oauthCancel'),
    pkceStart: source.useMutation<unknown, unknown>('pkceStart'),
    pkceCode: source.useMutation<unknown, unknown>('pkceCode'),
    pkceCancel: source.useMutation<unknown, unknown>('pkceCancel'),
    signOut: source.useMutation<unknown, unknown>('signOut'),
    customCreate: source.useMutation<unknown, unknown>('customCreate'),
    customPatch: source.useMutation<unknown, unknown>('customPatch'),
    customDelete: source.useMutation<unknown, unknown>('customDelete'),
    agentModel: source.useMutation<unknown, unknown>('agentModel'),
    acpEnabled: source.useMutation<unknown, unknown>('acpEnabled'),
    acpDefaultPut: source.useMutation<unknown, unknown>('acpDefaultPut'),
    jevPut: source.useMutation<unknown, unknown>('jevPut'),
    termCaps: source.useMutation<unknown, unknown>('termCaps'),
    termSessions: source.useMutation<unknown, unknown>('termSessions'),
    termCreate: source.useMutation<unknown, unknown>('termCreate'),
    termWait: source.useMutation<unknown, unknown>('termWait'),
    termWrite: source.useMutation<unknown, unknown>('termWrite'),
    termDelete: source.useMutation<unknown, unknown>('termDelete'),
  };
  const ref = useRef({ q, m });
  ref.current = { q, m };
  return useMemo<Api>(() => {
    const Q = () => ref.current.q;
    const M = () => ref.current.m;
    const per = (key: 'provider' | 'auth') => (pid: string) => read(Q()[key], (b) => (b as PerProvider)[pid]);
    const w = (k: keyof ReturnType<typeof M>) => (...a: unknown[]) => write(M()[k] as never, a);
    const api: Api = {
      version: () => read(Q().version),
      providers: () => read(Q().providers),
      models: (query) => read(query?.ready ? Q().ready : Q().models),
      provider: per('provider'),
      auth: per('auth'),
      catalogue: async () => {
        const [p, mo, rd] = await Promise.all([read(Q().providers), read(Q().models), read(Q().ready)]);
        if (!p.ok || !mo.ok) return { ok: false, err: (!p.ok ? p : (mo as { ok: false; err: Outcome })).err } as Settled<Catalogue>;
        const auth: Record<string, AuthBody> = {};
        const a = await read(Q().auth);
        if (a.ok) Object.assign(auth, a.body as Record<string, AuthBody>);
        return { ok: true, body: buildCatalogue({ providers: p.body, models: mo.body, ready: rd.ok ? rd.body : undefined, auth }) };
      },
      agents: () => read(Q().agents),
      bots: () => read(Q().bots),
      acp: () => read(Q().acp),
      acpDefault: () => read(Q().acpDefault),
      jev: () => read(Q().jev),
      jevModels: () => read(Q().jevModels),
      oauthPoll: () => read(Q().oauthPoll),
      pkcePoll: () => read(Q().pkcePoll),
      keyPut: (pid, body) => write(M().keyPut as never, { pid, check: body.check }).finally(() => void (body.api_key = '')),
      keyDelete: (pid) => write(M().keyDelete as never, pid),
      authTest: (pid) => write(M().authTest as never, pid),
      authDefault: (which) => write(M().authDefault as never, which),
      oauthStart: (another, idem) => write(M().oauthStart as never, { another, idem }),
      oauthCancel: (job) => write(M().oauthCancel as never, job),
      pkceStart: (pid, idem) => write(M().pkceStart as never, { pid, idem }),
      // The fixture never sees the pasted code: only that one was sent.
      pkceCode: (pid, job, body) => write(M().pkceCode as never, { pid, job, sent: body.code !== '' }).finally(() => void (body.code = '')),
      pkceCancel: (pid, job) => write(M().pkceCancel as never, { pid, job }),
      signOut: () => write(M().signOut as never),
      customCreate: (body, idem) => write(M().customCreate as never, { body, idem }),
      customPatch: (pid, body) => write(M().customPatch as never, { pid, body }),
      customDelete: (pid) => write(M().customDelete as never, pid),
      agentModel: (realm, agent, model, guard) => write(M().agentModel as never, { realm, agent, model, guard }),
      acpEnabled: (realm, enabled) => write(M().acpEnabled as never, { realm, enabled }),
      acpDefaultPut: (realm, agent) => write(M().acpDefaultPut as never, { realm, agent }),
      jevPut: (realm, guard, body) => write(M().jevPut as never, { realm, guard, body }),
      termCaps: w('termCaps') as Api['termCaps'],
      termSessions: w('termSessions') as Api['termSessions'],
      termCreate: (n, user) => write(M().termCreate as never, { n, user }),
      termWait: (o) => write(M().termWait as never, o),
      termWrite: (o, input) => write(M().termWrite as never, { o, input }),
      termDelete: (o) => write(M().termDelete as never, o),
    };
    return api;
  }, []);
}

function useFixtureComputer() {
  return source.useQuery<Computer>('computer');
}

/** The computer on a real page: core's current computer, its name from the shell and its realms from its record. Its
 *  realms are null (not told) unless the record is this computer's and lists realm ids only (membershipOf), and also
 *  while the last read of it failed: a record kept from an earlier read proves nothing now (its realms may have moved). */
function useLiveComputer(): Query<Computer> {
  const target = useCurrentComputer();
  const shell = useShellData();
  const view = realmsView();
  const id = target?.container.id ?? '';
  const q = source.useQuery<{ id: unknown; realm_ids: unknown }, { cid: string }>('container', target ? { cid: id } : undefined, { enabled: !!target });
  const name = shell.computers.find((c) => c.id === id)?.name ?? '';
  const realmIds = q.isError ? null : membershipOf(q.data, id);
  const data = target && q.data ? { id, name, realmIds, selectedRealm: isRealmId(view.selected) ? view.selected : null } : undefined;
  return { ...q, data, isPending: !!target && q.isPending, refetch: target ? q.refetch : () => Promise.resolve(q) } as unknown as Query<Computer>;
}

/** The realm a per-realm read uses: the computer's only realm, Global for none, the selected one when it is in the list
 *  (logic.ts realmOf: the one rule, also New chat's and aiRealm.ts'). */
const realmOfComputer = (c: Computer): string | null => realmOf(c.realmIds, c.selectedRealm);

export const useComputer = LIVE ? useLiveComputer : useFixtureComputer;

/** The spend rollup for a period. */
function useFixtureSpend(period: string) {
  const q = source.useQuery<Record<string, unknown>>('spend');
  return { ...q, data: q.data ? q.data[period] : undefined };
}
function useLiveSpend(period: string) {
  const days = period === 'd7' ? 7 : period === 'd30' ? 30 : 0;
  const since = useMemo(() => (days ? Math.floor(Date.now() / 1000) - days * 86_400 : null), [days]);
  // Usage is the computer's own (agent scope): with no computer shown it is not read.
  const on = useCurrentComputer() !== null;
  return gated(source.useQuery<unknown, number | null>('spend', since, { refetchInterval: false, enabled: on }), on);
}
export const useSpend = LIVE ? useLiveSpend : useFixtureSpend;

export function useCredit() {
  return source.useQuery<unknown>('credit');
}

/** One AI server's allowance: `ok` false when its reading is unavailable (its lanes are then empty). */
export interface AllowanceServer {
  id: string;
  name: string;
  ok: boolean;
  lanes: LaneReading[];
}
/** The account's AI servers; `truncated`: the answer stopped before the last one. */
export interface Allowance {
  servers: AllowanceServer[];
  truncated: boolean;
}

/** The account's Hoody AI allowance (an account read: it does not wait for a computer). */
export function useAllowance() {
  return source.useQuery<Allowance>('allowance');
}

/** The first load of the page's reads (each section reads its own part; one failing leaves the rest). */
export function usePageReads() {
  const comp = useComputer();
  const realm = comp.data ? realmOfComputer(comp.data) : null;
  const here = !!comp.data && realm !== null;
  // The computer's own reads wait for a computer (none shown: All computers), so nothing is asked of no computer.
  const on = !!comp.data;
  const its = <T,>(key: string) => gated(source.useQuery<T, undefined>(key, undefined, { enabled: on }), on);
  const version = its<unknown>('version');
  const caps = parseVersion(version.data);
  const checkerRealm = checkerWireRealm(realm, cap(caps, CAPS.jevRealm));
  const per = (key: string) => gated(source.useQuery<unknown, string | null>(key, realm, { enabled: here }), here);
  const acpDefaultRuns = here && !version.isPending && cap(caps, CAPS.acpDefault);
  const jevRuns = here && !version.isPending;
  // Providers, models, the ready list and the probes are not here: the catalogue is one combined read per
  // generation (parts/model.ts), never four cached queries paired after the fact.
  return {
    version,
    agents: per('agents'),
    bots: per('bots'),
    acp: per('acp'),
    // /acp/default exists only on an agent that reports the capability.
    acpDefault: gated(source.useQuery<unknown, string | null>('acpDefault', realm, { enabled: acpDefaultRuns }), acpDefaultRuns, here),
    jev: gated(source.useQuery<unknown, string | null>('jev', checkerRealm, { enabled: jevRuns }), jevRuns, here),
    jevModels: its<unknown>('jevModels'),
  };
}

/** Fixtures at instant latency shorten the read-back waits; a real page keeps real time. */
function fixtureWaitScale(): number {
  return fixtureLatency() === 'instant' ? 0.001 : 1;
}

export const useAiApi = LIVE ? () => useMemo(() => core as NonNullable<typeof core>, []) : useFixtureAiApi;

/** The catalogue bundle's computer and reader (core's useCatalogueBundle). `shown`: the id of the computer the page
 *  shows (null: none, nothing is asked). */
export interface BundleSource {
  computer: Target | null;
  readerFor: providers.BundleReader;
}
/** A real page: core's current computer, and core's reader bound to each run's own context and signal. */
function useLiveBundleSource(_api: Api, shown: string | null): BundleSource {
  const t = useCurrentComputer();
  return { computer: shown !== null && t && t.container.id === shown ? t : null, readerFor: providers.boundReader };
}
/** Fixtures: the fixture computer and the fixture Api (no context to bind to). */
function useFixtureBundleSource(api: Api, shown: string | null): BundleSource {
  const computer = useMemo<Target | null>(() => (shown === null ? null : { project: { id: 'fixture' }, container: { id: shown } }), [shown]);
  const readerFor = useMemo<providers.BundleReader>(() => {
    const reader: providers.CatalogueReader = {
      providers: () => api.providers(),
      models: (query) => (api.models ? api.models(query) : Promise.resolve({ ok: false as const, err: GONE })),
      auth: (pid) => api.auth(pid),
    };
    return () => reader;
  }, [api]);
  return { computer, readerFor };
}
export const useBundleSource = LIVE ? useLiveBundleSource : useFixtureBundleSource;
/** The model chooser's setup step on this page: core's own providers Api in a real page (bound to the step's computer
 *  and context), the fixture Api otherwise. */
export const chooserApi = (api: Api): ((t: Target, ctx: unknown) => Api) | undefined => (LIVE ? undefined : () => api);
export const waitScale = LIVE ? () => 1 : fixtureWaitScale;
