// query.ts: data for pages, over TanStack Query, with the core's context rules built in.
//
// Contract:
//   - defineQuery(route, {input, select}) declares a read. Its query key is auto-prefixed [account, realm,
//     gen] (and the computer for agent/kit routes), so a realm switch, an account change or a sign-out
//     moves every key: old queries are cancelled and dropped, and a late answer never renders.
//   - A read's context is the one of its key: a fetch that starts after the generation moved is refused
//     unsent (stale), and api() drops an answer that arrives after it died.
//   - Reads are not retried; refetch on window focus is off.
//   - defineMutation(route, {input, reads}) declares a change. Mutations never retry. A run captures its
//     context when it starts. Its outcome is done | pending | failed | not_sent | stale (api.ts, C9). A
//     pending change may have gone through: run() refuses to send again (READ_BACK_FIRST) until a fresh
//     read-back PROVES it (`proves` gives a verdict on the fresh answers) or the person dismisses it (dismiss():
//     "may have gone through", key kept). A plain fresh read never frees it: without `proves` it stays held
//     until dismissed. A later run of the same change reuses its key while this tab knows it goes with the same
//     variables (under a lockKey that digest stays in memory: after a reload or in another tab a released change
//     gets a new key; without one the identity digest is the variables', so the key replays there too),
//     and a replay that is refused leaves it pending (its refusal proves nothing about the first send). run() and
//     every use() hook of a definition share ONE lock per change (route, identity digest: the lockKey value, else
//     the variables; pass a lockKey when they may hold a secret) in changes.ts, so it survives the
//     hook that sent it (unmount, remount, a closed drawer). A read-back frees only changes that were pending
//     when it began. dismiss(vars, hold) (the hook: dismiss(); settle() is the same call) is the person's explicit
//     "forget it, it may have gone through": it frees only this definition's own change and keeps the key.
//     discard(vars, hold) (the hook:
//     discard()) is only for a change PROVED not applied (a failed receipt): it drops the lock and the key;
//     complete(vars, hold) (the hook: complete()) is for a change PROVED applied: lock and key go, the next run is new.
//     An account change or a sign-out drops every lock; a realm switch keeps them (changes.ts KEEPS), and a
//     change acts only in the realm it was sent in (lockRealm, readsRealm). readBack() answers true only when
//     no change it looked at is still held (proved, or nothing was pending), read after the verdict: a newer send
//     that went pending while it read keeps it false. A read-back judges only its own definition's changes (the
//     sender its locks record): another declaration sharing the lock is judged by its own reads.
//   - A read-back reads only enabled queries (a disabled one has nothing on screen to prove), cancels a load
//     already in flight so the answer comes from a request sent after recovery began, and needs at least one
//     fresh answer and no failed one. proves() gets exactly the answers those requests fetched (refreshFresh),
//     this account's and generation's, never another computer's: never whatever the cache holds afterwards.
//   - A generation bump also clears TanStack's mutation cache (a change's variables can hold secrets).
//   - A route with idem gets a fresh key per run (newKey); `idem` on the result names it.
import {
  QueryClient, QueryClientProvider, hashKey, useMutation, useQuery, type QueryKey, type UseQueryOptions, type UseQueryResult,
} from '@tanstack/react-query';
import { createElement, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { api, outcomeOf, realmScopedRoute, type HubError, type Outcome } from './api';
import { alive, capture, onBump, snapshot, subscribe, type CoreSnapshot, type Ctx, type Target } from './ctx';
import { changeContext, changeOwner, complete, declareAcrossRealms, declareExplicitRealm, type Compat, declareDefinition, discard, foreignLock, guarded, heldByOther, heldInstance, heldOfBase, holdOfLock, identityOfLock, isBusy, isPending, lockBase, pendingMark, pendingOf, realmScoped, refusalOf, refusingHold, release, senderOfLock, subscribeChanges, type HeldByOther, type HeldChange, type HeldFrom, type HeldRow, type Refusal } from './changes';
import { agentRealm, newKey } from './kit';
import type { CallInput, Route } from './routes';

/** Provides core's one QueryClient to its children: the app root, and page hook tests (pages never import
 *  TanStack Query themselves). */
export function CoreQueryProvider({ children }: { children?: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

/** The one QueryClient (the app provides it with QueryClientProvider). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: 15000 },
    // gcTime 0: a finished mutation leaves the MutationCache once no hook observes it. What the cache holds is
    // what core's hooks hand TanStack: defineMutation hands a number; coreSource hands {n} for a lockKey
    // definition and {n, vars} otherwise. networkMode 'always': no mutation waits as offline. Once TanStack runs
    // mutationFn (after onMutate, which may refuse the call), a defineMutation press reaches guarded() (BUSY,
    // HELD_BY_OTHER); a coreSource press may answer stale or refused before it (source.ts). Callbacks and the
    // press's own hashing may delay that. The press it waits with is dropped when its call settles.
    mutations: { retry: false, gcTime: 0, networkMode: 'always' },
  },
});

const PREFIX = 'hub';

/** The key prefix every core read starts with: a generation bump drops all of them. */
export function prefix(s: CoreSnapshot): readonly [string, string | null, string, number] {
  return [PREFIX, s.account, s.realm, s.gen];
}

// A generation bump (realm switch, account change, suspension, sign-out) cancels and drops every query of
// an older generation. The account can also change without a bump (another tab): the key moves with it.
onBump((_reason, g) => {
  const stale = (k: QueryKey) => k[0] === PREFIX && k[3] !== g;
  void queryClient.cancelQueries({ predicate: (q) => stale(q.queryKey) });
  queryClient.removeQueries({ predicate: (q) => stale(q.queryKey) });
  queryClient.getMutationCache().clear();
});

/** The core snapshot for React: account, realm, gen, target, identity, switching, loggingOut. */
export function useCore(): CoreSnapshot {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export interface QueryDef<P, S> {
  readonly route: Route;
  /** The full key for these params under the given core snapshot. */
  key(p: P, s?: CoreSnapshot): QueryKey;
  /** TanStack options (for useQueries, prefetch). */
  options(p: P, s?: CoreSnapshot): UseQueryOptions<unknown, HubError, S, QueryKey>;
  /** The hook. */
  use(p: P, o?: { enabled?: boolean; refetchInterval?: number | false }): UseQueryResult<S, HubError>;
  /** Fetches fresh under the current context (readBack, imperative reads). */
  fetch(p: P): Promise<S>;
  /** Drops cached answers of this read (all params) so the next render reads again. */
  invalidate(): Promise<void>;
  /** Re-reads every cached instance of this read now; true only when there was at least one and every one
   *  answered fresh under the current generation (a failed, skipped or empty read-back is false). */
  refresh(): Promise<boolean>;
  /** refresh() with 'none' when no enabled instance exists (nothing to read back), see refreshState(). With
   *  a target, an agent/kit read re-reads only that computer's instances (a change's read-back). */
  refreshState(target?: Target | null): Promise<RefreshState>;
  /** One read sent now, for a recovery or a send-time check: {data} only for a network answer that landed
   *  after this call began; null when it failed, was cancelled or only the cache answered. A call while one
   *  is out for the same key joins it (unless a change went pending since it was sent). */
  readFresh(p: P): Promise<{ data: S } | null>;
}

interface QueryOpts<R, P, S> {
  input?: (p: P) => Omit<CallInput, 'ctx' | 'signal' | 'scrub' | 'recovers'>;
  select?: (r: R) => S;
  staleTime?: number;
  /** 'own', for a read of one fixed input (no params) whose route other reads also use with other inputs (another page of a
   *  list): refresh(), refreshState() and a change's read-back re-read and judge only this read's own instances, so another
   *  read's instance that fails never fails this read-back. invalidate() still drops every instance of the route. */
  readBack?: 'own';
}

function targetKey(route: Route, input: CallInput, s: CoreSnapshot): readonly string[] {
  if (route.scope !== 'agent' && route.scope !== 'kit') return [];
  const t = input.target || s.target;
  return t ? [t.project.id, t.container.id] : ['-'];
}

export function defineQuery<R, S = R, P = void>(route: Route<R, unknown>, o: QueryOpts<R, P, S> = {}): QueryDef<P, S> {
  const r = route as Route;
  if (r.method !== 'GET' && r.method !== 'HEAD') throw new Error('defineQuery needs a GET route: ' + r.id);
  // A GET declared change (routes.ts change) is never a read: a refetch would send it again.
  if (r.change === true) throw new Error('defineQuery needs a read route: ' + r.id);
  const inputOf = (p: P): CallInput => (o.input ? o.input(p) : {}) as CallInput;
  const key = (p: P, s: CoreSnapshot = snapshot()): QueryKey => {
    const input = inputOf(p);
    return [...prefix(s), r.id, ...targetKey(r, input, s), input.params || null, input.query || null, input.realm ?? null, input.index ?? null];
  };
  // readBack 'own': a key whose input slots (params, query, realm, index: the last four) are this read's own.
  const own = (k: QueryKey): boolean => o.readBack !== 'own' || hashKey(k.slice(-4)) === hashKey(key(undefined as P).slice(-4));
  const run = (p: P, gen: number, signal?: AbortSignal, keyTarget?: Target | null): Promise<unknown> => {
    const input = inputOf(p);
    // The computer the key names (agent/kit reads), not whatever is current when a background refetch runs.
    const ctx: Ctx = capture(input.target || keyTarget || undefined);
    // The key's generation is the context's: a fetch that starts after it moved is not sent.
    if (ctx.gen !== gen || !alive(ctx)) return Promise.reject({ kind: 'not_sent', stale: true, notSent: true } as HubError);
    return api(r, { ...input, ctx, signal });
  };
  const options = (p: P, s: CoreSnapshot = snapshot()): UseQueryOptions<unknown, HubError, S, QueryKey> => ({
    queryKey: key(p, s),
    queryFn: ({ signal }) => run(p, s.gen, signal, r.scope === 'agent' || r.scope === 'kit' ? s.target : null),
    select: o.select as ((d: unknown) => S) | undefined,
    staleTime: o.staleTime,
  });
  const def: QueryDef<P, S> = {
    route: r,
    key,
    options,
    use(p, uo) {
      const s = useCore();
      return useQuery({ ...options(p, s), enabled: uo?.enabled ?? true, refetchInterval: uo?.refetchInterval });
    },
    async fetch(p) {
      const s = snapshot();
      const data = await queryClient.fetchQuery({ ...options(p, s), staleTime: 0 });
      return (o.select ? o.select(data as R) : data) as S;
    },
    invalidate() {
      return queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === PREFIX && q.queryKey[4] === r.id });
    },
    refresh() {
      return refreshWhere((k) => k[0] === PREFIX && k[4] === r.id && own(k));
    },
    refreshState(target) {
      return fresh.fresh(target).then((f) => f.state);
    },
    async readFresh(p) {
      const opts = { ...options(p), staleTime: 0 };
      const hash = hashKey(opts.queryKey);
      const got = await flight(opts.queryKey, hash, () => queryClient.fetchQuery(opts));
      if (!got) return null;
      try { return { data: (o.select ? o.select(got.v as R) : got.v) as S }; } catch { return null; }
    },
  };
  // A read-back: every enabled instance (an agent/kit read only the target's) re-read with a request sent now,
  // and the answers those requests fetched, shaped by select (a throwing select answers undefined). With a realm
  // (the change's), only the instances that can show it (keyReadsRealm): another realm's is never requested.
  // Internal: not on QueryDef.
  const fresh: CoreReadFresh = {
    async fresh(target, realm = null) {
      const t = target && (r.scope === 'agent' || r.scope === 'kit') ? target : null;
      const held = (k: QueryKey): boolean => k[0] === PREFIX && k[4] === r.id && own(k) && (!t || (k[5] === t.project.id && k[6] === t.container.id));
      let f = await refreshFresh((k) => held(k) && keyReadsRealm(k, realm));
      // Off-page: a read no page holds now (never read, or its page closed and the cache let it go) is read
      // once here, without params, for the change's computer: a change whose proof needs it can still be
      // proved. A read a page holds in another realm only (or keeps disabled) stays skipped, as before the realm
      // filter; one that needs params, does not answer, or would read another realm is skipped too (offPage).
      if (f.state === 'none' && !queryClient.getQueryCache().findAll({ predicate: (q) => held(q.queryKey) }).length) f = await offPage(t, realm);
      return { state: f.state, answers: f.answers.map((a) => { try { return { key: a.key, data: o.select ? o.select(a.data as R) : a.data }; } catch { return { key: a.key, data: undefined }; } }) };
    },
  };
  // An off-page read only adds evidence: one that cannot be built (it needs params) or does not answer is skipped
  // ('none', as before it was tried), never a failed read-back; a context that moved on during it is failed.
  async function offPage(t: Target | null, realm: string | null): Promise<FreshRead> {
    let opts: ReturnType<typeof options>;
    try { opts = { ...options(undefined as P, t ? { ...snapshot(), target: t } : snapshot()), staleTime: 0 }; } catch { return { state: 'none', answers: [] }; }
    if (!keyReadsRealm(opts.queryKey, realm)) return { state: 'none', answers: [] };
    const { gen } = snapshot();
    const got = await flight(opts.queryKey, hashKey(opts.queryKey), () => queryClient.fetchQuery(opts));
    dropUnheld(opts.queryKey);
    if (snapshot().gen !== gen) return { state: 'failed', answers: [] };
    if (!got) return { state: 'none', answers: [] };
    return { state: 'fresh', answers: [{ key: opts.queryKey, data: got.v }] };
  }
  Object.assign(def, fresh);
  readScopes.set(r.id, r.scope);
  coreReads.add(def);
  return Object.freeze(def);
}
/** A core read's read-back (defineQuery): its state and the answers it fetched, for a read-back's proves(). */
export interface CoreReadFresh { fresh(target?: Target | null, realm?: string | null): Promise<FreshRead> }

// The scope of each core read's route (defineQuery), by route id: keyComputer() finds the computer in its key.
const readScopes = new Map<string, Route['scope']>();
/** The computer a cached core read names, as [project id, container id]: a defineQuery agent/kit read (key
 *  slots 5 and 6) or a coreSource read (slot 8); null for a read that names none (a base or realm read, or a key
 *  core did not build). */
export function keyComputer(k: QueryKey): readonly [unknown, unknown] | null {
  if (k[4] === 'src') return Array.isArray(k[8]) ? [k[8][0], k[8][1]] : null;
  const sc = readScopes.get(k[4] as string);
  return sc === 'agent' || sc === 'kit' ? [k[5], k[6]] : null;
}
/** The realm a core read asked: a defineQuery read's explicit input.realm (the slot before the index) or a
 *  coreSource read's (slot 9), else the realm shown when it was keyed (slot 2). */
export function keyRealm(k: QueryKey): unknown {
  if (k[4] === 'src') return k[9] ?? k[2];
  return readScopes.has(k[4] as string) ? (k[k.length - 2] ?? k[2]) : k[2];
}
/** The send token a read-back is limited to (`readBack({ hold })`: the hold a band shows), or undefined for a bare
 *  read-back. Only a string names one: anything else (an event a bare handler hands in) is a bare read-back. The
 *  one rule of source.ts readBackNow, the defineMutation hook's readBack and locked.ts readBack. */
export function readBackHold(only: unknown): string | undefined {
  const h = (only as { hold?: unknown } | null | undefined)?.hold;
  return typeof h === 'string' ? h : undefined;
}
/** What a hold-scoped read-back proved about the send it names, beyond its boolean (`readBack({ hold, proof })`).
 *  `notApplied` turns true only when this read judged that send NOT made and this call itself wrote the release of
 *  exactly that hold while storage still held it pending (proveByVerdict; changes.ts SettleAsk.transition). A false
 *  answer alone never says so: it also covers a read that proved nothing, a hold freed or replaced while the read was
 *  out (another tab's proof or Dismiss, seen here or only in storage; an account or realm change) and a refused free. */
export interface ReadBackProof { notApplied: boolean }
/** The proof slot of a hold-scoped read-back, or undefined (a bare read-back, an event a bare handler hands in). */
export function readBackProof(only: unknown): ReadBackProof | undefined {
  if (readBackHold(only) === undefined) return undefined;
  const p = (only as { proof?: unknown }).proof;
  return p !== null && typeof p === 'object' && typeof (p as { notApplied?: unknown }).notApplied === 'boolean' ? (p as ReadBackProof) : undefined;
}
/** True when a read keyed `k` can show a change of `realm`: the read asked that realm or All realms (keyRealm: the
 *  realm the read asked, not only the one shown); a change with no realm recorded: any read. The one realm rule of a
 *  read-back: what it re-reads (source.ts readBackFresh, a core read's fresh(), locked.ts) and what it judges
 *  (answersFor). */
export function keyReadsRealm(k: QueryKey, realm: string | null): boolean {
  if (realm === null) return true;
  const kr = keyRealm(k);
  return kr === realm || kr === ALL_REALMS;
}
/** The fresh answers a read-back may judge a change by: this account and generation, the change's realm (or
 *  All realms; none recorded: any; keyReadsRealm), and no other computer than the change's (an agent/kit read of another
 *  computer never counts; a read that names no computer counts, unless `onComputer`: a query-key predicate's
 *  read, which core cannot tell apart from a read of every computer, proves a change on a computer only through
 *  keys that name it). */
export function answersFor(f: FreshRead, target: Target | null, realm: string | null, onComputer = false): unknown[] {
  const s = snapshot();
  return f.answers.filter(({ key: k }) => {
    if (k[1] !== s.account || k[3] !== s.gen) return false;
    if (!keyReadsRealm(k, realm)) return false;
    const c = keyComputer(k);
    if (!target) return true;
    return c ? c[0] === target.project.id && c[1] === target.container.id : !onComputer;
  }).map((a) => a.data);
}

// The reads core built (defineQuery): only their read-back is trusted (a request sent now, fresh from the
// network, flight()). A page's own adapter ({refresh}) could hand back the cache, so it proves nothing.
const coreReads = new WeakSet<object>();
/** True for a read defineQuery built (its refreshState() is core's flight). */
export const isCoreRead = (x: unknown): boolean => !!x && typeof x === 'object' && coreReads.has(x);

/** The computer a change acts on: its own target, or the current one (agent/kit routes). */
function idsOf(t: Target | null | undefined): string { return t ? t.project.id + '/' + t.container.id : '-'; }
/** The lock scope of a change, filed under what the call actually acts on: a realm-host route under the realm
 *  (realmScopedRoute); an agent route under the computer, and under the realm it sends (none for realm kind
 *  'none'); a kit route under the computer only (a kit call carries no realm: a realm switch leaves it the same
 *  change). The account is in every lock id (changes.ts). `realm` is the input's own realm, if any.
 *  `acrossRealms` (a lock on something one realm view cannot own, e.g. a computer's lifecycle): no realm in the
 *  scope, so the lock holds in every realm view (the lock still records the realm it was sent in, for read-back). */
export function changeScope(base: string, route: Route, target: Target | null | undefined, realm?: string, acrossRealms?: boolean): string {
  if (route.scope === 'kit') return base + '#' + idsOf(target ?? snapshot().target);
  if (route.scope === 'agent') {
    const sent = acrossRealms ? undefined : agentRealm(route, realm, capture());
    return base + (sent === undefined ? '' : '@' + sent) + '#' + idsOf(target ?? snapshot().target);
  }
  return realmScopedRoute(route) && !acrossRealms ? realmScoped(base) : base;
}
/** The realm a change of this route is sent in, as its lock records it: the realm an agent route sends (none
 *  for realm kind 'none'), the shown realm for a realm-host route, null for kit and account routes (the call
 *  carries none). A read-back releases a change only while this, read now, is still the change's realm: the
 *  reads it re-reads are the current realm's. */
export function changeRealm(route: Route, realm?: string): string | null {
  if (route.scope === 'kit') return null;
  if (route.scope === 'agent') return agentRealm(route, realm, capture()) ?? null;
  return realmScopedRoute(route) ? snapshot().realm : null;
}
/** The realm a change's lock records for its read-back and settle: the realm it was sent in (changeRealm),
 *  an agent change's own input.realm included. Never null for a call that carries a realm: a read made after
 *  a switch to another realm must never release it. */
export function lockRealm(route: Route, realm?: string): string | null {
  return changeRealm(route, realm);
}
/** MutationOpts.explicitRealm / SourceTable change `explicitRealm`: only an agent route whose call carries one realm
 *  (kind 'realm', 'bot' or 'opt'), and never with acrossRealms (a lock filed under no realm). Throws otherwise. */
export function explicitRealmRoute(route: Route, acrossRealms: boolean): void {
  if (route.scope !== 'agent' || route.realm === 'none' || route.realm === 'list' || acrossRealms) throw new Error('explicitRealm needs an agent route that names one realm, without acrossRealms: ' + route.id);
}
/** Why an explicitRealm press is refused unsent, or null: it must name its realm (input.realm; else INPUT_INVALID), and
 *  the call must act in that realm. A token session pinned to one realm acts in that realm whatever the call names
 *  (kit.ts agentRealm), so a press naming another realm is refused there (TOKEN_SESSION_REFUSED): its hold would be filed
 *  under the token's realm while its reads are keyed by the named one, and no read could ever prove it. A token session
 *  pinned to every realm sends the realm the call names, as an account session does, so it is admitted. */
export function explicitRealmRefusal(route: Route, realm: string | undefined): string | null {
  if (typeof realm !== 'string' || realm === '') return 'INPUT_INVALID';
  return lockRealm(route, realm) === realm ? null : 'TOKEN_SESSION_REFUSED';
}
/** The All realms view: its reads list every realm, so they read any realm's change. */
const ALL_REALMS = 'all';
/** True when reads made now read the realm `realm` (a change's recorded realm; null: the call carries none):
 *  the shown realm is that realm, or All realms. With `explicit` (a change that names its own realm on every call,
 *  MutationOpts.explicitRealm): always, since only reads that name that realm judge it (keyReadsRealm, answersFor),
 *  whatever realm is shown. */
export const readsRealm = (route: Route, realm: string | null, explicit?: boolean): boolean => {
  if (realm === null || explicit === true) return true;
  const now = changeRealm(route);
  return now === realm || now === ALL_REALMS;
};
/** useSyncExternalStore subscription: a change registry move or a context move (realm, computer). */
export function subscribeScope(l: () => void): () => void {
  const a = subscribeChanges(l);
  const b = subscribe(l);
  return () => { a(); b(); };
}

export type RefreshState = 'fresh' | 'failed' | 'none';
/** One answer a read-back fetched: the query's key and its data (as the query holds it, before any select). */
export interface FreshAnswer { readonly key: QueryKey; readonly data: unknown }
/** A read-back's result: its state and the answers its requests fetched (only when 'fresh'). */
export interface FreshRead { readonly state: RefreshState; readonly answers: readonly FreshAnswer[] }

// One recovery read per query at a time (a flight). A read-back that comes while one is out joins it, as long
// as no change went pending since it was sent and the generation did not move: a second request would cancel
// the first, whose caller then gets the cached answer back, which is no read-back at all. Only a network
// answer that landed after the flight began counts; a cancelled, failed or cached one is null.
interface Flight { readonly mark: number; readonly gen: number; readonly p: Promise<{ v: unknown } | null> }
const flights = new Map<string, Flight>();
/** An off-page read-back's fetch leaves no cache entry no page observes: the next read-back would take it for a
 *  read a page holds (and a failed one would fail that read-back). */
export function dropUnheld(queryKey: QueryKey): void {
  const q = queryClient.getQueryCache().find({ queryKey, exact: true });
  if (q && q.getObserversCount() === 0) queryClient.removeQueries({ queryKey, exact: true });
}
// `own`: never join an open flight; this call's request is sent after it began (a save's pre-write read, whose answer
// must postdate the press). It cancels the open one (whose caller then gets null or this newer answer, never its own
// older one) and becomes the flight later read-backs join.
export function flight(queryKey: QueryKey, hash: string, go: () => Promise<unknown>, own = false): Promise<{ v: unknown } | null> {
  const gen = snapshot().gen;
  const mark = pendingMark();
  const open = flights.get(hash);
  if (!own && open && open.gen === gen && open.mark === mark) return open.p;
  let me: Flight | null = null;
  const p = (async (): Promise<{ v: unknown } | null> => {
    // A load in flight (a first load included, which cancelRefetch leaves alone) may have started before the
    // change: cancelled so the answer is a request sent from here.
    await queryClient.cancelQueries({ queryKey, exact: true });
    // Only a fetch's own answer counts, not a clock: a cancelled fetch hands the cached answer back (the same
    // millisecond as a load that just landed passes a timestamp test), and a setQueryData (manual) during the
    // flight moves the data without any request. So the flight keeps the data of the query's fetched
    // success actions, and the answer counts only while the query still holds exactly that data.
    const began = Date.now();
    let fetched: { data: unknown } | null = null;
    const stop = queryClient.getQueryCache().subscribe((e) => {
      if (e.type === 'updated' && e.query.queryHash === hash && e.action.type === 'success' && !e.action.manual) fetched = { data: e.action.data };
    });
    try {
      await go();
      const st = queryClient.getQueryState(queryKey);
      const net = fetched as { data: unknown } | null;
      const ok = !!net && st?.data === net.data && snapshot().gen === gen && !!st && st.status === 'success' && !st.isInvalidated && st.dataUpdatedAt >= began;
      return ok ? { v: st.data } : null;
    } catch {
      return null;
    } finally {
      stop();
      if (flights.get(hash) === me) flights.delete(hash);
    }
  })();
  me = { mark, gen, p };
  flights.set(hash, me);
  return p;
}

/** Re-reads every enabled cached query whose key matches, under the current account and generation: 'fresh'
 *  when all of them answered with a request sent now (see flight()), 'failed' when one did not, 'none' when no
 *  enabled one matched (a disabled or never-observed query is skipped: refetchQueries would skip it and it
 *  proves nothing). Overlapping read-backs of the same query share one request. With 'fresh', `answers` holds
 *  what those requests fetched (one per query): what a read-back's proves() judges, never a later cache write.
 *  `own: true` joins no read already out: every answer comes from a request this call sent (see flight()). */
export async function refreshFresh(match: (k: QueryKey) => boolean, o: { own?: boolean } = {}): Promise<FreshRead> {
  const { gen: g, account } = snapshot();
  const qs = queryClient.getQueryCache().findAll({ predicate: (q) => match(q.queryKey) && q.queryKey[3] === g && q.queryKey[1] === account && !q.isDisabled() });
  if (!qs.length) return { state: 'none', answers: [] };
  const res = await Promise.all(qs.map((q) => flight(q.queryKey, q.queryHash,
    () => queryClient.refetchQueries({ queryKey: q.queryKey, exact: true }, { throwOnError: true, cancelRefetch: true }), o.own === true)));
  if (!res.every((x) => x !== null) || snapshot().gen !== g) return { state: 'failed', answers: [] };
  return { state: 'fresh', answers: qs.map((q, i) => ({ key: q.queryKey, data: (res[i] as { v: unknown }).v })) };
}
/** refreshFresh() without the answers. */
export async function refreshState(match: (k: QueryKey) => boolean): Promise<RefreshState> {
  return (await refreshFresh(match)).state;
}

/** refreshState() as a boolean: true only when at least one enabled query matched and all answered fresh. */
export async function refreshWhere(match: (k: QueryKey) => boolean): Promise<boolean> {
  return (await refreshState(match)) === 'fresh';
}

/** A read-back over several reads: true when none failed and at least one answered fresh. */
export function readBackStates(states: readonly RefreshState[]): boolean {
  return states.includes('fresh') && !states.includes('failed');
}

export type RunOutcome = 'idle' | 'running' | Outcome | 'read';

export interface MutationResult<R> {
  readonly outcome: Outcome;
  readonly data?: R;
  readonly error?: HubError;
  /** The idempotency key the run used (routes with idem). */
  readonly idem?: string;
  /** A HELD_BY_OTHER refusal: the page whose change holds the lock (null: it named none). */
  readonly heldFrom?: HeldFrom | null;
  /** Pending: the hold this run left (HeldChange.hold of that one send). Pass it to settle, dismiss, complete or
   *  discard to act on exactly that send. */
  readonly hold?: string;
}

export interface MutationDef<V, R> {
  readonly route: Route;
  /** Runs the change once under the context captured now, with the C9 lock of these variables (BUSY,
   *  READ_BACK_FIRST, key reuse). Never rejects: the outcome says what happened. */
  run(vars: V): Promise<MutationResult<R>>;
  /** Re-reads the declared reads under the current context (an agent/kit read only for the computer of
   *  `vars`, default the current one) and frees, by its proves verdict, this definition's own changes that were
   *  pending when it began. True only when none failed, one answered fresh, and what it looked at (the change of
   *  these variables, or without them every change of the lock in a realm read now) is not pending afterwards.
   *  Only reads defineQuery built count. */
  readBack(vars?: V): Promise<boolean>;
  /** The page proved the held change's outcome by its own fresh read: frees this definition's own change of these
   *  variables, only while the stored record still names the outcome its hold observed, no stamp is live and no
   *  request of it is out here (the person's Dismiss is dismiss()); the key stays, so a later run replays
   *  it. Another sender's change of them (sharing the lock) stays held and nothing tells the caller: pages ask
   *  heldByOther(vars) FIRST and render such a hold read-only, never as released. */
  settle(vars: V, hold: string): Promise<boolean>;
  /** The person's warned Dismiss (`warned`): like settle(), except that it frees the hold even when its
   *  request is still out, its outcome moved since it was shown, or its stamp is live, since the person was told it may
   *  be sent again; also frees a hold that records no sender. */
  dismiss(vars: V, hold: string): Promise<boolean>;
  /** The page PROVED the change did not apply (a failed receipt, an authoritative read showing no effect):
   *  drops the lock and the key of these variables, so the next run sends a fresh key. No-op while sending.
   *  Another sender's change of them (any state) keeps its lock and key, silently: pages ask
   *  heldByOther(vars) FIRST and never treat the call as a release. */
  discard(vars: V, hold: string): Promise<boolean>;
  /** The change is PROVEN applied (its receipt reads completed, or a read shows its effect): frees the lock of
   *  these variables and drops the key, so the next run is a new change with a fresh key (a replay of a spent
   *  key would get the old receipt back and do nothing). Acts on the change in the realm it was sent in, only
   *  while that realm is shown. Only this sender's: another sender's change of them keeps its lock and key,
   *  silently: pages ask heldByOther(vars) FIRST and never treat the call as a release. */
  complete(vars: V, hold: string): Promise<boolean>;
  /** `hold` (settle, dismiss, discard, complete; REQUIRED): the send the proof or the Dismiss concerns
   *  (MutationResult.hold, HeldChange.hold, or holdOf(vars) taken before the page's own read). Only that send is
   *  acted on; a later send of the same change (another incarnation), another realm's, another account's are
   *  left held. Each answers true when it freed that send, false (a no-op) when the hold is missing, no longer
   *  holds the lock, or is another sender's. holdOf: the send of these variables held now, or undefined. */
  holdOf(vars: V): Promise<string | undefined>;
  /** Who else holds the change of these variables: HELD_BY_OTHER (with the sending page) while another sender's
   *  change of them is recorded (pending, being sent, or released keeping its key), so settle, complete and
   *  discard of them free nothing; undefined when this sender's or nobody's. */
  heldByOther(vars: V): Promise<HeldByOther | undefined>;
  /** Every held send of this definition's lock base, whoever sent it (another page's sender, a hold recording no
   *  sender, this one's), in a realm the current reads read (an across-realms lock: every realm), oldest first,
   *  each with the account it was read under; [] when no account can be read. Read only: it frees nothing, and
   *  freeing stays sender-scoped (the hook's settleHeld/dismissHeld). For a page that must show what holds a lock
   *  before it offers a change of it. */
  heldAny(): readonly HeldRow[];
  /** C9 probe for pages (never core's lock scopes by hand): with variables, true while that exact change
   *  may have gone through and is not released (its own scope: realm, computer, shared lock); without, true
   *  while any change of this definition is pending in a realm the current reads read. Re-render with
   *  useChangesVersion(). */
  isPending(vars?: V): Promise<boolean>;
  /** Who sent a held change of its lock (heldChanges): 'self' this definition (its settle/dismiss can free it),
   *  'other' another declaration sharing the lock (only that one can), undefined when nothing recorded it. */
  heldBy(h: HeldChange): 'self' | 'other' | undefined;
  /** The hook: {run, outcome, error, data, readBack, settle, dismiss, running}. `page` names the mounting page
   *  (default the definition's `page`): each page is its own sender, so one definition shared by several pages
   *  (e.g. a computer's Start on Computers, Home and Bots) never frees another page's change. Fixed per mount. */
  use(o?: { page?: string }): MutationHook<V, R>;
  /** This definition as page `page`'s sender (same locks, reads and proves): run, readBack, settle, complete and
   *  discard act only on that page's changes; heldBy is 'other' for every other page's. */
  forPage(page: string): MutationDef<V, R>;
}

export interface MutationHook<V, R> {
  run(vars: V): Promise<MutationResult<R>>;
  readonly outcome: RunOutcome;
  readonly data?: R;
  readonly error?: HubError;
  readonly running: boolean;
  /** After a pending outcome: re-read; true only when the fresh read PROVED this definition's changes (proves)
   *  and no change of the lock is still held in a realm the current reads read (or nothing was pending). A
   *  failed, unproven or empty read-back keeps it pending: false. With `only.hold` (the send a band shows): only this
   *  mount's definition's change holding that token is read back, proved and released, never another hold (under
   *  All realms every realm's hold is read); true only when this read proved that send applied and its free was
   *  stored, never from nothing pending (a hold dismissed or replaced while the read was out); none such: false. */
  readBack(only?: { hold: string }): Promise<boolean>;
  /** The page's own proof (the proof rules of settle(vars, hold)): frees, in a realm the current reads read, every pending
   *  change THIS mount sent (not only the last), each while it still holds the token the mount recorded; never
   *  this definition's hold from an earlier mount (its identity was not shown here: list it with held(), free it
   *  with settleHeld/dismissHeld or the definition's settle/dismiss(vars, hold)), never another sender's under a
   *  shared lock; keys stay. */
  settle(): void;
  /** The person's warned Dismiss of this mount's own changes (`warned`; see dismiss(vars, hold)). */
  dismiss(): void;
  /** Proven not applied: drops this mount's last change and its key, while this definition still owns its lock
   *  (after a remount: nothing; a discard names what was proven). */
  discard(): void;
  /** Proven applied: frees every change this mount sent (never an earlier mount's, never another sender's) and
   *  drops their keys; the next run sends a fresh key. A mount that sent nothing frees nothing. */
  complete(): void;
  reset(): void;
  /** This definition's held sends (any mount's), in a realm the current reads read (an across-realms lock: every
   *  realm), oldest first: what a page shows to say which change a Dismiss concerns. */
  held(): readonly HeldRow[];
  /** By token, for a row held() listed and the page showed: frees exactly that send of this definition, judged and
   *  stored in one store-lock turn (changes.ts settleChange), only under the account and context the row was freed
   *  in; keys stay. True once the free is stored. False when it no longer holds the lock, another sender sent it,
   *  another account is shown, its outcome moved since the row was listed (another tab's answer: list it again), or
   *  a request of it is out. dismissHeld is the person's warned Dismiss: it also frees over a live send and a hold
   *  that records no sender. */
  settleHeld(row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean>;
  dismissHeld(row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean>;
}

interface MutationOpts<V> {
  input?: (v: V) => Omit<CallInput, 'ctx' | 'signal'>;
  /** The reads that show this change's effect: invalidated after done, re-read by readBack(). */
  reads?: ReadonlyArray<Pick<QueryDef<never, unknown>, 'invalidate'> & Partial<Pick<QueryDef<never, unknown>, 'refresh' | 'refreshState'>>>;
  /** A lock shared with other pages' sends of the same change (coreSource's LiveChange.lock): same name, and
   *  `lockKey` maps the variables to the same identity (default: the variables). */
  lock?: string;
  /** Names this definition among others of the same route and lock (each such definition is its own sender):
   *  needed only when one route and lock has more than one definition. Stable text, e.g. 'computers.start'. */
  name?: string;
  lockKey?: (v: V) => unknown;
  /** With a lockKey: what the held change shows (heldChanges, proves' `identity`) when it needs more than the lock
   *  identity, e.g. which operation a shared per-computer lock holds (default: the lockKey value). Never a secret. */
  identity?: (v: V) => unknown;
  /** The lock is not filed under a realm (changeScope): its lockKey names something every realm view reaches,
   *  e.g. a physical computer, so a hold sent in one realm view (All realms included) refuses the same change in
   *  every other view, and heldChanges shows it in each. */
  acrossRealms?: boolean;
  /** The change names its own realm on every call (input.realm: the page's own choice, e.g. Global, which the top bar
   *  never shows), never the one shown: its lock is filed and recorded under that realm (as any agent change naming
   *  input.realm), and its hold counts, is read back, settled and dismissed in every realm view, since only reads that
   *  name its realm judge it. Only an agent route that carries one realm (not 'none' or 'list'); with acrossRealms,
   *  never. Throws at declaration otherwise. */
  explicitRealm?: boolean;
  /** What a fresh read-back proves (see ReadVerdict). Without it no read frees the change: it stays held until
   *  dismissed. With it, only a verdict frees it: 'applied' frees it and drops the key, 'not_applied' frees it and
   *  keeps the key, undefined keeps it pending (the read showed neither). `identity` is the lock's lockKey
   *  value (undefined without a lockKey: the variables are never kept); `answers[i]` holds the fresh answers of
   *  reads[i] (every instance on the change's computer, as its select shapes them). */
  proves?: (identity: unknown, answers: readonly (readonly unknown[])[]) => ReadVerdict;
  /** The page id that sends this change (e.g. 'computers'): a page sharing the lock links there
   *  (HeldChange.from, a HELD_BY_OTHER refusal's heldFrom). */
  page?: string;
}

/** A read-back's verdict on a change (MutationOpts.proves, LiveChange.proves). */
export type ReadVerdict = 'applied' | 'not_applied' | undefined;
/** Frees a change after a fresh read-back by its verdict: 'applied' → completed (key dropped); 'not_applied'
 *  (or null, the caller's own proof) → released (key kept); no verdict → kept pending. With `by`, only a change
 *  that sender sent (another declaration sharing the lock was not judged by these reads). True when a verdict's
 *  free was stored and the change is not pending afterwards (a newer send that went pending after the read-back
 *  began, beyond `upTo`, keeps it false); without a free to make, when nothing is pending. A free that was refused
 *  or not stored answers false, whatever memory says. */
export async function freeByVerdict(scope: string, digest: string, hold: string | undefined, upTo: number, verdict: ReadVerdict | null, by?: string, ctx?: number): Promise<boolean> {
  // `hold`: the send pending when the read-back began (holdOfLock before its await), with the outcome it read: a
  // later incarnation (another tab's, a reload's), or an outcome stored after the read began, is not what these reads
  // judged. With `by`: only that sender's change (one recording no sender is nobody's to prove). An older change (an
  // older build's record converted on load, its identity unknown) is proved by no read: complete() and release()
  // refuse it in changes.ts, where only a warned Dismiss frees it. `ctx`: changeContext() before the read.
  if (hold !== undefined && (by === undefined || senderOfLock(scope, digest) === by)) {
    let ok: boolean | null = null;
    if (verdict === 'applied') ok = await complete(scope, digest, hold, { upTo, by, ctx });
    else if (verdict === null || verdict === 'not_applied') ok = await release(scope, digest, hold, { upTo, by, ctx });
    if (ok === false) return false;
  }
  return !isPending(scope, digest);
}
/** The proof form of freeByVerdict, for a hold-scoped read-back (`readBack({ hold })`): true only when this
 *  read stored an 'applied' free (complete() answered true) for exactly the requested send. `captured` is
 *  holdOfLock before the read's await; it must name that same send. A 'not_applied' verdict (or null, the caller's own
 *  proof) still stores its release, as freeByVerdict does, and answers false: the hold is freed, the change did not
 *  apply. Everything else answers false: the lock absent or holding another send, another sender's change, no
 *  verdict, a free refused or not stored. It never answers from "nothing is pending" (a hold dismissed while the read
 *  was out leaves nothing pending and proves nothing). */
export async function proveByVerdict(scope: string, digest: string, captured: string | undefined, requested: string, upTo: number, verdict: ReadVerdict | null, by?: string, ctx?: number, proof?: ReadBackProof): Promise<boolean> {
  if (captured !== requested || (by !== undefined && senderOfLock(scope, digest) !== by)) return false;
  if (verdict === 'applied') return (await complete(scope, digest, requested, { upTo, by, ctx })) === true;
  // Proved NOT made: `proof` learns it only when this release of the requested hold was stored (readBackProof).
  if (verdict === null || verdict === 'not_applied') {
    // Only this call's own write of the free of the still-pending stored send: a record already removed or released by
    // another tab also answers true (changes.ts SettleAsk.transition), and proves nothing here.
    const transition = { own: false };
    if ((await release(scope, digest, requested, { upTo, by, ctx, transition })) === true && transition.own && proof) proof.notApplied = true;
  }
  return false;
}

const definitions = new Map<string, number>();
export function defineMutation<V = void, R = unknown>(route: Route<R, unknown>, o: MutationOpts<V> = {}): MutationDef<V, R> {
  const r = route as Route;
  if (r.method === 'GET' || r.method === 'HEAD') throw new Error('defineMutation needs a change route: ' + r.id);
  // A bodyText route's text is secret: its change names a lockKey, so the lock is a digest of that, never of the text.
  if (r.bodyText && !o.lockKey) throw new Error('defineMutation of a bodyText route needs a lockKey: ' + r.id);
  needsLockKey(r, o.lockKey);
  if (o.explicitRealm) explicitRealmRoute(r, !!o.acrossRealms);
  const reads = o.reads || [];
  const base = o.lock ? lockBase(o.lock) : 'q:' + r.id;
  // This definition, as the sender its locks record (another definition sharing the lock is another sender);
  // each page using it is a sender of its own (bind(page): '/' + page), so pages sharing one definition never
  // free each other's changes. Its route, lock and o.name: the same after a reload (change-store.ts) whatever
  // order the definitions load in. Two definitions of one route and lock need distinct names; an unnamed second
  // one gets its place ('#2', which a reload in another load order could swap).
  const pair = r.id + '@' + (o.lock ?? '') + (o.name ? ':' + o.name : '');
  const nth = (definitions.get(pair) ?? 0) + 1;
  definitions.set(pair, nth);
  const senderBase = 'q:' + pair + (nth > 1 ? '#' + String(nth) : '');
  declareDefinition(r.id, base, senderBase, o.page);
  if (o.acrossRealms) declareAcrossRealms(base);
  if (o.explicitRealm) declareExplicitRealm(base);
  // The same change filed the other way (changes.ts Compat): a build of this definition with the flag flipped.
  const compat: Compat = { base, across: !!o.acrossRealms };
  // One press: its input, context and lock scope are taken when the press happens (before any await), so a
  // realm or computer switch while the variables are hashed never moves the change.
  interface Press {
    readonly vars: V; readonly input: CallInput | null; readonly ctx: Ctx; readonly target: Target | null; readonly scope: string; readonly realm: string | null;
    /** Under a lockKey, for a valid input: the digest of the full variables, in memory only (a released key is
     *  replayed only for the same bytes, and a key another sender of a shared lock kept for other bytes is dropped,
     *  whether or not this route is idempotent). Taken as a snapshot at the press, hashed only when the send calls
     *  it (pressBytes). */
    readonly bytes?: () => Promise<string>;
    /** The account the press was made in (changeOwner()): guarded() answers stale, touching no lock, once another
     *  account is shown (its lock of the same change is never this press's to change). */
    readonly who: string;
    /** The identity this press is hashed, admitted and shown under: the lockKey value taken once at the press
     *  (else the variables), LOCKKEY_THREW when it threw (the press is then refused: input null). */
    readonly ident: unknown;
    /** What heldChanges() shows for it (o.identity, else, or when that throws, the lockKey value; undefined
     *  without a lockKey). A stored hold under a lockKey always names an identity. */
    readonly shown: unknown;
    /** Why the press is refused unsent when its input is null (explicitRealmRefusal); default INPUT_INVALID. */
    readonly refusal?: string;
  }
  function press(vars: V): Press {
    let input: CallInput | null = null;
    try { input = (o.input ? o.input(vars) : {}) as CallInput; } catch { input = null; }
    // The lockKey runs once per press; its value is what the press is hashed, admitted and shown under. One that
    // throws refuses the press (INPUT_INVALID, nothing sent): its identity is unknown, so a hold of the same change
    // (an older build's, stored under another digest, or an earlier press's) could not be found.
    const ident = identityOf(vars);
    if (ident === LOCKKEY_THREW) input = null;
    let shown: unknown;
    if (o.lockKey && ident !== LOCKKEY_THREW) { try { shown = o.identity ? o.identity(vars) : ident; } catch { shown = ident; } }
    // An explicitRealm press that does not act in the realm it names is refused unsent (explicitRealmRefusal). Only its
    // send is refused: its computer, context, scope and realm stay those of its parsed input, so a lookup by these
    // variables (readBack(vars), holdOf, isPending, heldByOther) still names the change they would act on, never the
    // computer shown now.
    const refusal = o.explicitRealm && input ? explicitRealmRefusal(r, input.realm) ?? undefined : undefined;
    const target = (input && input.target) || snapshot().target;
    return { vars, input: refusal !== undefined ? null : input, ctx: capture(input ? input.target : undefined), target, scope: changeScope(base, r, target, input?.realm, o.acrossRealms), realm: lockRealm(r, input?.realm), bytes: o.lockKey && input && refusal === undefined ? pressBytes(vars) : undefined, who: changeOwner(), ident, shown, ...(refusal !== undefined ? { refusal } : {}) };
  }
  // A shared lock's identity: its lockKey value (shown to the pages that share the lock, heldChanges()). A lockKey
  // that throws gives LOCKKEY_THREW, never the variables (they may hold a secret the lockKey leaves out). The
  // lockKey runs once per press (Press.ident): that value is hashed, admitted, sent and shown, and a press whose
  // lockKey threw is refused before its digest is looked up or admitted. Otherwise the sentinel names locks only for
  // lookups (settle, isPending, holdOf), where it matches nothing that was sent.
  const identityOf = (vars: V): unknown => { if (!o.lockKey) return vars; try { return o.lockKey(vars); } catch { return LOCKKEY_THREW; } };
  const digestOf = (vars: V): Promise<string> => varsDigest(identityOf(vars));
  async function once(p: Press, keep?: string): Promise<MutationResult<R>> {
    if (!p.input) return { outcome: 'not_sent', error: { kind: 'not_sent', notSent: true, code: p.refusal ?? 'INPUT_INVALID' } };
    // The replayed key wins (C9); a key only where the route takes one (api refuses it elsewhere).
    const idem = r.idem ? keep || p.input.idem || newKey() : undefined;
    try {
      const data = (await api(r, { ...p.input, idem, ctx: p.ctx })) as R;
      await Promise.all(reads.map((q) => q.invalidate()));
      return { outcome: 'done', data, idem };
    } catch (err) {
      return { outcome: outcomeOf(err, true), error: err as HubError, idem };
    }
  }
  // The lock of each change (scope, identity digest) lives in changes.ts, shared by run() and every use() of
  // this definition, and survives the hook that sent it (C9 across unmount, remount and a realm switch). The
  // lock records the computer the change went to, so a read-back re-reads that computer's reads.
  /** Re-reads the declared reads for one computer now (an agent/kit read only its instances; with a realm, only the
   *  instances that can show a change of it); resolves the
   *  pending count it began at and what each read fetched when none failed and one answered fresh, else null
   *  (none declared: null). Only reads core built count (isCoreRead): any other read is a failed read-back. */
  async function readBackFrom(t: Target | null, realm: string | null = null): Promise<{ start: number; fresh: FreshRead[] } | null> {
    if (!reads.length) return null;
    const start = pendingMark();
    const fresh = await Promise.all(reads.map((q): Promise<FreshRead> => (isCoreRead(q) ? (q as unknown as CoreReadFresh).fresh(t, realm) : Promise.resolve({ state: 'failed', answers: [] }))));
    return readBackStates(fresh.map((f) => f.state)) ? { start, fresh } : null;
  }
  // The verdict of a fresh read-back on one change, from the answers it fetched (answersFor: the change's
  // computer and realm). No proves declared: none (a plain fresh read proves nothing, so the change stays held
  // until a proof or the person's Dismiss).
  const verdictOf = (scope: string, digest: string, t: Target | null, realm: string | null, fresh: readonly FreshRead[]): ReadVerdict | null => {
    if (!o.proves) return undefined;
    try { return o.proves(identityOfLock(scope, digest), fresh.map((f) => answersFor(f, t, realm))); } catch { return undefined; }
  };
  // One view per page (bind): the same locks, reads and proves; its own sender.
  function bind(page: string | undefined): MutationDef<V, R> {
    const sender = senderBase + (page ? '/' + page : '');
    /** One change (scope, digest, computer, realm): re-read, then free only that change, and only when this
     *  definition sent it, by what the read proves (verdictOf). True when it is not pending afterwards. The reads
     *  are the current realm's: a change sent in another realm is not read, so it stays held (and so does one
     *  whose realm changed during the read). With `requested` (readBack({ hold })): true only when this read proved that
     *  send (proveByVerdict), never from nothing pending. */
    async function readBackOne(scope: string, digest: string, t: Target | null, realm: string | null, entry?: { who: string; ctx: number }, requested?: string): Promise<boolean> {
      // Another sender's change is never judged here (proves is not even asked): it stays, so false.
      const foreign = (): boolean => foreignLock(scope, digest, sender);
      if (foreign() || !readsRealm(r, realm, o.explicitRealm)) return false;
      // A caller that awaited before this (readBack(vars): its digest) passes the account and context of its entry:
      // one that moved meanwhile (a switch, a round trip) judges nothing.
      if (entry && (changeOwner() !== entry.who || changeContext() !== entry.ctx)) return false;
      // The send and the account this read-back judges, taken before its await.
      const who = changeOwner(), hold = holdOfLock(scope, digest), ctx = entry?.ctx ?? changeContext();
      const got = await readBackFrom(t, realm);
      if (got === null || changeOwner() !== who || !readsRealm(r, realm, o.explicitRealm) || foreign()) return false;
      const verdict = verdictOf(scope, digest, t, realm, got.fresh);
      if (requested !== undefined) return proveByVerdict(scope, digest, hold, requested, got.start, verdict, sender, ctx);
      return freeByVerdict(scope, digest, hold, got.start, verdict, sender, ctx);
    }
    /** The pending changes of these variables in a realm the current reads read, on their computer (with `kept`,
     *  also released ones keeping their key, for complete()): settle() and complete() act on the change in the
     *  realm it was SENT in (its scope), never on a same-variables change of the realm shown now. */
    async function sentLocks(vars: V, kept = false): Promise<Array<{ scope: string; digest: string; by?: string }>> {
      const p = press(vars);
      // The realm and account shown at the call, before the await: a switch meanwhile never widens what is named.
      const shown = changeRealm(r);
      const d = await digestOf(vars);
      if (changeOwner() !== p.who) return [];
      const onComputer = r.scope === 'agent' || r.scope === 'kit';
      // An across-realms lock (o.acrossRealms) is the same change in every realm view: no realm filter (a read-back
      // still checks the realm it reads, readBackOne).
      return pendingOf(base, { kept }).filter((c) => c.digest === d && (o.acrossRealms || c.realm === null || shown === c.realm || shown === ALL_REALMS) && (!onComputer || idsOf(c.target) === idsOf(p.target)));
    }
    /** Every pending change this definition sent (each re-read against the computer it was sent to); with none,
     *  the current computer's reads. True when every re-read answered fresh, freed its change, and no change of
     *  the lock (any sender's) is still pending in a realm the current reads read. */
    async function readBackAllPending(): Promise<boolean> {
      const own = pendingOf(base).filter((c) => c.by === sender);
      const ok = own.length
        ? (await Promise.all(own.map((c) => readBackOne(c.scope, c.digest, c.target as Target | null, c.realm)))).every(Boolean)
        : (await readBackFrom(snapshot().target)) !== null;
      return ok && !pendingOf(base).some((c) => readsRealm(r, c.realm, o.explicitRealm));
    }
    async function readBack(vars?: V): Promise<boolean> {
      if (vars === undefined) return readBackAllPending();
      // The account and context of the call, before its first await: carried through the read and its free.
      const p = press(vars), entry = { who: changeOwner(), ctx: changeContext() };
      const d = await digestOf(vars);
      if (changeOwner() !== entry.who || changeContext() !== entry.ctx) return false;
      const sent = pendingOf(base).filter((c) => c.digest === d && (r.scope !== 'agent' && r.scope !== 'kit' || idsOf(c.target) === idsOf(p.target)));
      if (!sent.length) return readBackOne(p.scope, d, p.target, p.realm, entry);
      // Another sender's change of these variables is not judged here (freeByVerdict's `by`): it stays, so false.
      return (await Promise.all(sent.map((c) => readBackOne(c.scope, c.digest, c.target as Target | null, c.realm, entry)))).every(Boolean);
    }
    const refused = (code: string, heldFrom?: HeldFrom | null): MutationResult<R> => ({ outcome: 'not_sent', error: { kind: 'not_sent', notSent: true, code }, ...(heldFrom !== undefined ? { heldFrom } : {}) });
    // The press's account is no longer shown (p.who): nothing was sent and no lock was touched, as api's stale.
    const staleRun = (): MutationResult<R> => ({ outcome: 'stale', error: { kind: 'not_sent', stale: true, notSent: true } as HubError });
    async function send(p: Press, digest: string): Promise<MutationResult<R>> {
      const bytes = p.bytes ? await p.bytes() : undefined;
      // The key a route that takes one is sent with, stored with the hold before the send (guarded's firstKey).
      const first = r.idem && p.input ? p.input.idem || newKey() : undefined;
      const res = await guarded(p.scope, digest, (replayKey) => once(p, replayKey), { base, target: p.target, realm: p.realm, by: sender, across: compat.across, ...(page ? { page } : {}), ...(o.lockKey ? { identity: p.shown } : {}) }, bytes, first, p.who, compat);
      if (res.outcome === 'stale' && !('error' in res)) return staleRun();
      return 'code' in res && !('error' in res) ? refused(res.code, (res as Refusal).heldFrom) : (res as MutationResult<R>);
    }
    function run(vars: V): Promise<MutationResult<R>> {
      const p = press(vars);
      // An invalid press (its input or lockKey threw) is refused before any lookup or admission: its digest names nothing.
      if (!p.input) return Promise.resolve(refused(p.refusal ?? 'INPUT_INVALID'));
      return varsDigest(p.ident).then((d) => send(p, d).then((res) => {
        // The held send's scope, computer and realm (refusingHold), never the press's.
        const h = res.error?.code === 'READ_BACK_FIRST' ? refusingHold(p.scope, d, compat) : null;
        if (h) void readBackOne(h.scope, d, h.target as Target | null, h.realm);
        return res;
      }));
    }
    // The page re-read the outcome itself (fresh, after the change went pending), for these variables: the
    // change is free again and keeps its key (a retry of the same change replays it). For a change with no
    // declared reads (readBack() is then false). A receipt that proves it applied calls complete() instead: the
    // spent key goes.
    // Every call names the hold the page showed (HeldChange.hold, MutationResult.hold, holdOf(vars) taken before
    // the page's own read): that one send only, with the outcome the page observed, looked up by its token after the
    // digest is awaited, then judged and stored in one store-lock turn (changes.ts settleChange) under the account
    // and context the call was made in (taken before its first await). A send that went pending meanwhile (another
    // sender's, a later send of this one, another tab's newer incarnation), an outcome another tab stored since the
    // page's read, a realm switch, an account switch or round trip never move what is freed: the call then answers
    // false. Another sender's change of these variables is never freed (heldByOther names it).
    type Free = (scope: string, digest: string, o: { ctx: number; owner: string; by: string }) => Promise<boolean>;
    async function oneHold(vars: V, hold: string, kept: boolean, nobodys: boolean, free: Free): Promise<boolean> {
      if (typeof hold !== 'string' || !hold) return false;
      const who = changeOwner(), ctx = changeContext();
      const d = await digestOf(vars);
      if (changeOwner() !== who || changeContext() !== ctx) return false;
      const c = heldInstance(base, hold, kept);
      if (!c || c.digest !== d || !(c.by === sender || (nobodys && c.by === undefined))) return false;
      return free(c.scope, c.digest, { ctx, owner: who, by: sender });
    }
    const settle = (vars: V, hold: string): Promise<boolean> => oneHold(vars, hold, false, false, (sc, dg, w) => release(sc, dg, hold, w));
    // The person's warned Dismiss: also a hold that records no sender (nobody's to prove, changes.ts senderOf),
    // which no proof or settle may free, and a send another tab is still making (the person was warned).
    const dismissOne = (vars: V, hold: string): Promise<boolean> => oneHold(vars, hold, false, true, (sc, dg, w) => release(sc, dg, hold, { ...w, warned: true, nobodys: true }));
    // Proven applied (a completed receipt, a read showing the effect): lock and key go, so the next run is a new
    // change with a fresh key, never a replay of the spent one. Only this sender's: another sender's change of
    // these variables keeps its lock and key (dropping its key would let that sender send it again under a new one).
    const completeOne = (vars: V, hold: string): Promise<boolean> => oneHold(vars, hold, true, false, (sc, dg, w) => complete(sc, dg, hold, w));
    async function holdOfVars(vars: V): Promise<string | undefined> {
      const p = press(vars), who = changeOwner();
      const d = await digestOf(vars);
      if (changeOwner() !== who) return undefined;
      // The pending hold that refuses a press (its own id, or filed the other way: Compat); only with none, a
      // record released keeping its key (what complete() can retire).
      return refusingHold(p.scope, d, compat)?.hold ?? holdOfLock(p.scope, d);
    }
    // The page PROVED the change did not apply (a failed receipt, an authoritative read showing no effect):
    // lock and key go, the next run sends a fresh key. Nothing happens while that change is being sent. Only this
    // sender's: a hold recording no sender is freed only by the person's Dismiss, and another sender's change of
    // these variables (in any state) keeps its lock and key.
    const discardOne = (vars: V, hold: string): Promise<boolean> => oneHold(vars, hold, true, false, (sc, dg, w) => discard(sc, dg, hold, w));
    // Another sender's change of these variables (on their computer, in a realm read now, or the press's own lock).
    async function heldByOtherOf(vars: V): Promise<HeldByOther | undefined> {
      const p = press(vars);
      const d = await digestOf(vars);
      const sent = await sentLocks(vars, true);
      // Another account shown by now: its locks are not this call's to name.
      if (changeOwner() !== p.who) return undefined;
      for (const c of [...sent, { scope: p.scope, digest: d }]) { const no = heldByOther(c.scope, c.digest, sender); if (no) return no; }
      return undefined;
    }
    // Every sender's held sends of this lock base (the hook's held() without its sender filter); frees nothing.
    function heldAnyOf(): readonly HeldRow[] {
      let account: string;
      try { account = changeOwner(); } catch { return []; }
      return heldOfBase(base).filter((h) => h.hold !== undefined && (o.acrossRealms || readsRealm(r, h.realm, o.explicitRealm))).map((h) => Object.freeze({ hold: h.hold as string, at: h.at, identity: h.identity, target: h.target, account }));
    }
    interface Sent { readonly p: Press; readonly d: string }
    // What TanStack holds for a send: a number, never the press (its variables and input may hold a secret,
    // and a mutation keeps its variables while the send is out). The press waits here, per definition, for
    // exactly that send, and goes when it settles.
    const sends = new Map<number, Sent>();
    let sendSeq = 0;
    // A mount names its page (use({page})): a page other than this view's is that page's sender. One hook
    // either way (the page is fixed per mount), so the hook order never changes.
    function use(uo?: { page?: string }): MutationHook<V, R> {
      const pg = uo?.page || page;
      const useView = (pg && pg !== page && hooks.get(forPage(pg))) || useOwn;
      return useView();
    }
    function useOwn(): MutationHook<V, R> {
      // The last change this mount ran (scope, digest, computer): discard() and readBack() without variables act
      // on it. After a remount (none of its own) readBack() acts on every pending change of this definition (each
      // against its own computer), and discard() drops nothing (a discard must name what was proven not applied).
      const lastRef = useRef<{ scope: string; digest: string; target: Target | null; realm: string | null } | undefined>(undefined);
      // Every change this mount sent that went pending (scope + digest → the hold its answer carried): its Dismiss frees all
      // of them, not only the last; complete() and discard() only while the hold is unchanged.
      const sentRef = useRef(new Map<string, string>());
      // The press is hashed once, here; the TanStack mutation gets only its number (sends).
      const m = useMutation<MutationResult<R>, never, number>({
        mutationFn: async (n: number) => { const s = sends.get(n); return s ? send(s.p, s.d) : refused('INPUT_INVALID'); },
        retry: false,
      });
      const [state, setState] = useState<RunOutcome>('idle');
      // The settled answer lives here, not in the TanStack mutation, which holds only the call's number and is
      // reset once it settles (the hook's state and result read as before). The press waits in `sends` and leaves
      // it when mutateAsync settles (run, below).
      const [result, setResult] = useState<MutationResult<R> | undefined>(undefined);
      // Pending: a change of this definition (this mount's or an earlier one's) on the current computer, or this
      // mount's last change on the computer it went to, while its realm is shown (a read-back releases it only there).
      const cur = (): string => changeScope(base, r, snapshot().target, undefined, o.acrossRealms);
      // An explicitRealm change is filed under the realm it names, never the one shown (cur() names the shown one): any
      // change of this definition on the current computer, in any realm, is pending here, also after a remount.
      const explicitPending = (): boolean => !!o.explicitRealm && pendingOf(base).some((c) => idsOf(c.target as Target | null) === idsOf(snapshot().target));
      const pending = useSyncExternalStore(subscribeScope, () => {
        const last = lastRef.current;
        return isPending(cur(), undefined, compat) || (!!last && readsRealm(r, last.realm, o.explicitRealm) && isPending(last.scope, last.digest)) || explicitPending();
      }, () => false);
      const busy = useSyncExternalStore(subscribeScope, () => isBusy(cur(), undefined, compat) || (!!lastRef.current && isBusy(lastRef.current.scope, lastRef.current.digest)), () => false);
      const runHook = useCallback(async (vars: V): Promise<MutationResult<R>> => {
        const p = press(vars);
        if (!p.input) return refused(p.refusal ?? 'INPUT_INVALID');
        const d = await varsDigest(p.ident);
        if (changeOwner() !== p.who) return staleRun();
        // Refusals answer at once, without a TanStack mutation (nothing is sent).
        // A press while this change is pending (READ_BACK_FIRST), being sent (BUSY, which leaves the running state
        // to the send that owns it) or held by another sender (HELD_BY_OTHER) sends nothing.
        const no = refusalOf(p.scope, d, sender, compat);
        if (no) return refused(no.code, no.heldFrom);
        lastRef.current = { scope: p.scope, digest: d, target: p.target, realm: p.realm };
        setState('running');
        setResult(undefined);
        const n = ++sendSeq;
        sends.set(n, { p, d });
        let res: MutationResult<R>;
        try { res = await m.mutateAsync(n); } finally { sends.delete(n); }
        m.reset();
        // The hold this send left, as guarded stamped it when it settled (MutationResult.hold): only a pending answer
        // leaves one, and it is recorded only while the account the press was made in is still shown. Never a lock
        // lookup after the await: that names whoever holds the lock now (another account's, or a later send).
        const held = res.outcome === 'pending' && changeOwner() === p.who ? res.hold : undefined;
        if (held !== undefined) sentRef.current.set(p.scope + '\u0000' + d, held);
        if (res.outcome === 'not_sent' && res.error?.code === 'BUSY') return res;
        setResult(res);
        setState(res.outcome);
        return res;
      }, [m]);
      const readBackHook = useCallback(async (only?: { hold: string }) => {
        // Unlocks only after a fresh, successful read-back that began after the change went pending.
        // Every pending change of this definition (two may be in flight), each on its own computer; with none
        // pending, this mount's last change. With `only`: the one change of this sender holding that token.
        const last = lastRef.current;
        const hold = readBackHold(only);
        const one = hold !== undefined ? pendingOf(base).find((c) => c.by === sender && holdOfLock(c.scope, c.digest) === hold) : undefined;
        if (hold !== undefined && !one) return false;
        // The read-back's own answer counts too: a free it could not store (refused, its outcome moved, another tab
        // sending it) leaves nothing proved, even when memory shows nothing pending.
        const ok = one
          ? await readBackOne(one.scope, one.digest, one.target as Target | null, one.realm, undefined, hold)
          : pendingOf(base).length || !last ? await readBackAllPending() : await readBackOne(last.scope, last.digest, last.target, last.realm);
        if (one) {
          setState((!!last && isPending(last.scope, last.digest)) || pendingOf(base).some((c) => readsRealm(r, c.realm, o.explicitRealm)) ? 'pending' : 'read');
          return ok;
        }
        const still = (!!last && isPending(last.scope, last.digest)) || pendingOf(base).some((c) => readsRealm(r, c.realm, o.explicitRealm));
        setState(still ? 'pending' : 'read');
        return ok && !still;
      }, []);
      // The changes settle(), dismiss() and complete() without variables act on: only the sends THIS mount made and
      // showed, each still holding the token this mount recorded after its send (a later send, here or in another
      // tab, moved it), in a realm the current reads read; never another sender's sharing the lock, and never a
      // hold of this definition from an earlier mount or another editor (its identity was not shown here: the
      // page frees it with settle/dismiss(vars, hold), naming the hold it showed). Every one, not only the last.
      const ownChanges = (kept: boolean): Array<{ scope: string; digest: string; hold: string }> => {
        const mine = sentRef.current;
        const out: Array<{ scope: string; digest: string; hold: string }> = [];
        for (const c of pendingOf(base, { kept })) {
          // An across-realms lock is the same change in every realm view (as sentLocks): no realm filter.
          if (c.by !== sender || !(o.acrossRealms || readsRealm(r, c.realm, o.explicitRealm))) continue;
          // Read in the same synchronous step that asks for its free (settleChange judges it again in its turn).
          const now = holdOfLock(c.scope, c.digest);
          if (now !== undefined && mine.get(c.scope + '\u0000' + c.digest) === now) out.push({ scope: c.scope, digest: c.digest, hold: now });
        }
        return out;
      };
      // Each free is stored in its own store-lock turn (changes.ts settleChange); one refused or not stored keeps its
      // hold pending (the outcome reads 'pending' again from the registry).
      const settleHook = useCallback(() => {
        for (const c of ownChanges(false)) void release(c.scope, c.digest, c.hold, { by: sender });
        setState('read');
      }, []);
      // The person's warned Dismiss of this mount's own sends: frees them over a live send too (the person was warned).
      const dismissHook = useCallback(() => {
        for (const c of ownChanges(false)) void release(c.scope, c.digest, c.hold, { by: sender, warned: true });
        setState('read');
      }, []);
      const completeHook = useCallback(() => {
        for (const c of ownChanges(true)) void complete(c.scope, c.digest, c.hold, { by: sender });
        setState('read');
      }, []);
      const discardHook = useCallback(() => {
        const last = lastRef.current;
        if (!last) return;
        // Only while this definition still owns that lock: another sender's change of the same identity, sent
        // after this mount's finished, is not what this mount proved not applied.
        // Only this mount's own send of it, still unchanged (no later send moved its token).
        const mine = sentRef.current.get(last.scope + '\u0000' + last.digest);
        if (mine !== undefined && senderOfLock(last.scope, last.digest) === sender) void discard(last.scope, last.digest, mine, { by: sender });
        lastRef.current = undefined;
        m.reset(); setResult(undefined); setState('idle');
      }, [m]);
      // This definition's held sends (any mount's), read now; each with the account it was read under.
      const held = (): readonly HeldRow[] => {
        let account: string;
        try { account = changeOwner(); } catch { return []; }
        return heldOfBase(base).filter((h) => h.by === sender && h.hold !== undefined && (o.acrossRealms || readsRealm(r, h.realm, o.explicitRealm))).map((h) => Object.freeze({ hold: h.hold as string, at: h.at, identity: h.identity, target: h.target, account }));
      };
      // By token: found now, under the row's account, only this definition's send (or, for the warned Dismiss, a hold
      // recording no sender), then judged and stored in one store-lock turn under the account and context of the call.
      const byToken = async (row: Pick<HeldRow, 'hold' | 'account'> | undefined, warned: boolean): Promise<boolean> => {
        if (!row || typeof row.hold !== 'string' || !row.hold) return false;
        let shown: string;
        try { shown = changeOwner(); } catch { return false; }
        if (row.account !== shown) return false;
        const c = heldInstance(base, row.hold, false);
        if (!c || !(c.by === sender || (warned && c.by === undefined))) return false;
        const freed = await release(c.scope, c.digest, row.hold, { by: sender, owner: shown, ...(warned ? { warned: true, nobodys: true } : {}) });
        if (freed) setState('read');
        return freed;
      };
      const outcome: RunOutcome = pending ? 'pending' : state === 'pending' ? 'idle' : state;
      return {
        run: runHook,
        outcome,
        data: result?.data,
        error: result?.error,
        running: m.isPending || busy,
        readBack: readBackHook,
        settle: settleHook,
        dismiss: dismissHook,
        discard: discardHook,
        complete: completeHook,
        reset: () => { if (!pending) { m.reset(); setResult(undefined); setState('idle'); } },
        held,
        settleHeld: (row: Pick<HeldRow, 'hold' | 'account'>) => byToken(row, false),
        dismissHeld: (row: Pick<HeldRow, 'hold' | 'account'>) => byToken(row, true),
      };
    }
    async function isPendingOf(vars?: V): Promise<boolean> {
      if (vars === undefined) return pendingOf(base).some((c) => readsRealm(r, c.realm, o.explicitRealm));
      const p = press(vars);
      const d = await digestOf(vars);
      // Its hold filed the other way (Compat) is this change too.
      return changeOwner() === p.who && isPending(p.scope, d, compat);
    }
    const heldBy = (h: HeldChange): 'self' | 'other' | undefined => (h.by === undefined ? undefined : h.by === sender ? 'self' : 'other');
    const def: MutationDef<V, R> = Object.freeze({ route: r, run, readBack, settle, dismiss: dismissOne, discard: discardOne, complete: completeOne, holdOf: holdOfVars, isPending: isPendingOf, heldBy, heldByOther: heldByOtherOf, heldAny: heldAnyOf, use, forPage });
    hooks.set(def, useOwn);
    return def;
  }
  const views = new Map<string, MutationDef<V, R>>();
  // Each view's own hook (use() of another page's view runs that view's).
  const hooks = new WeakMap<MutationDef<V, R>, () => MutationHook<V, R>>();
  function forPage(page: string): MutationDef<V, R> {
    let v = views.get(page);
    if (!v) { v = bind(page); views.set(page, v); }
    return v;
  }
  return o.page ? forPage(o.page) : bind(undefined);
}

/** What a lookup (settle, isPending, holdOf) names when the lockKey throws (a page bug): it matches no sent change,
 *  and never digests the variables. A press whose lockKey threw is refused unsent (INPUT_INVALID). */
export const LOCKKEY_THREW: unknown = Object.freeze({ lockKeyThrew: true });
/** A secret route (defineRoute secret: true, secret body keys, or bodyText) sends a secret: its change needs a
 *  lockKey, so the stored lock id is a digest of the lockKey value, never of the variables (an unsalted digest of
 *  a password can be guessed offline). A definition without one is refused when it is made.
 *  Variables of other routes that hold a secret need a lockKey too; nothing here can see that. */
export function needsLockKey(r: Route, lockKey: unknown): void {
  if ((r.secret || r.secretKeys.length) && typeof lockKey !== 'function') throw new Error('a change of a secret route needs a lockKey: ' + r.id);
}

/** What a C9 lock keeps to recognise the same change again: a SHA-256 of its identity (the lockKey value, else the
 *  variables, which then must hold no secret: needsLockKey), never the plain value. The digest of the full
 *  variables a key went with (`bytes`) is never stored (changes.ts keyBytes). Without Web Crypto (an insecure
 *  context, or a digest that throws) it falls back to a 128-bit non-cryptographic hash (fallbackDigest), never
 *  the JSON: the plain variables are never kept, whatever the context.
 *  Digests resolve in call order (one chain): Web Crypto may finish them out of order, and the press that
 *  came first must be the one that reaches its lock first (a second press of the same change is BUSY). */
let digestChain: Promise<unknown> = Promise.resolve();
export function varsDigest(v: unknown): Promise<string> { return jsonDigest(stableJson(v)); }
function jsonDigest(json: string): Promise<string> {
  const p = digestChain.then(() => digestOf(json));
  digestChain = p;
  return p;
}
/** A press's bytes (varsDigest of its variables): their JSON is taken now, as a snapshot the press owns, and queued
 *  for hashing only when the send calls it. A press refused before its send (an onMutate that throws) never puts its
 *  variables on the shared digest queue, where they would outlive the call. */
export function pressBytes(v: unknown): () => Promise<string> {
  const json = stableJson(v);
  return () => jsonDigest(json);
}
async function digestOf(json: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') return fallbackDigest(json);
  try {
    const d = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(json)));
    return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return fallbackDigest(json); }
}
/** Four 32-bit FNV-1a-style lanes with distinct seeds and a final avalanche, over the UTF-16 units: a lock
 *  identity, not a secret's protection (it only has to tell changes apart and never hold their bytes). The
 *  'x' prefix keeps it apart from a SHA-256 hex digest. */
export function fallbackDigest(json: string): string {
  const h = [0x811c9dc5, 0x01000193 ^ 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    for (let j = 0; j < 4; j++) h[j] = Math.imul((h[j]! ^ c) >>> 0, 0x01000193 + j * 0x2c1b3c6e) >>> 0;
  }
  return 'x' + h.map((v, j) => {
    let x = (v ^ json.length ^ (j * 0x27d4eb2f)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0).toString(16).padStart(8, '0');
  }).join('');
}

/** JSON with sorted keys: the same change's variables compare equal whatever their key order. */
export function stableJson(v: unknown): string {
  // Only a cycle (an object inside itself) becomes null: `seen` holds the current path, so the same sub-object
  // repeated in two places is written out both times (two different changes never digest alike).
  const seen = new Set<object>();
  const norm = (x: unknown): unknown => {
    if (!x || typeof x !== 'object') return x;
    if (seen.has(x)) return null;
    seen.add(x);
    try {
      if (Array.isArray(x)) return x.map(norm);
      return Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm((x as Record<string, unknown>)[k])]));
    } finally { seen.delete(x); }
  };
  try { return JSON.stringify(norm(v)) ?? ''; } catch { return ''; }
}
