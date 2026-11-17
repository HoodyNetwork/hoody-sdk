// source.ts: a page's data source over core, with the same surface as app/fixtures.ts fixtureSource().
//
// Contract, in plain words:
//   - coreSource(pageId, table, fallback?) returns {useQuery(key, params?), useQueries(key, params[]), useMutation(key)} like
//     fixtureSource: useQuery gives a TanStack query result of the page's own shape; useMutation gives a TanStack
//     mutation whose result is {outcome, data?, code?} (C9 outcome: done | pending | failed | not_sent | stale).
//   - On a live page every key goes through core: `table.reads[key]` names a declared route (defineRoute), the
//     call input from the params, and select(raw, params) turns the API answer into the page's shape;
//     `table.changes[key]` names a change route, its input from the variables, select for the answer, and the
//     read keys that show its effect. Keys are bound to the account, realm and generation (a switch drops them),
//     every call carries its context (api(): host table, 2FA, owner binding, pending rules).
//   - A key the table does not name fails on a live page (error kind 'not_wired'): never fixture data on a live
//     page. Under a fixture transport (bootFixtureCore, hub:dev, hub:shots, tests) and with a fallback given, the
//     fallback (fixtureSource(pageId)) answers instead; without one, the table's routes go to core's fixture rules.
//   - Changes: never retried; one send at a time per change identity (a second run of the same change while it
//     runs is not_sent; another identity may run meanwhile). After done the
//     reads are re-read; after pending (may have gone through) the reads are re-read at once and the hook refuses
//     to send again (not_sent, READ_BACK_FIRST) until a fresh read-back proves it (the change's `proves` verdict;
//     a fresh read alone frees nothing, a failed read-back keeps it refused) or the person dismisses it; a later
//     run of the same change reuses its idempotency key while this tab knows its bytes, and a replay that fails
//     keeps it: never a blind resend. A read key whose queries are all disabled is skipped by the read-back.
//     `coreReads` (core reads outside the source, e.g. the top bar's computer list) are read again wherever the
//     change is proved applied: a done answer, a read-back whose verdict is 'applied', or the page's complete().
//     sendProved(hold) is the automatic read-back's proof of a pending send (true only on 'applied'), taken once.
//   - Query errors carry `kind`: 'network' | 'forbidden' | 'not_found' | 'bad_request' | 'server' | 'stale' |
//     'not_sent' | 'not_wired', plus `code` and `status` when the API gave them. 'not_sent': core refused the read
//     before sending (its code says why; a token session's refusal keeps the leaf it lacks in `perm`). 'stale': the
//     read's context died, it was cancelled, or its answer came too late.
//   - readTarget(keys?, {computer?}) (and sourceReads(pageId, ...) without the source object) is the query-key
//     predicate of the source's reads, for a locked change's read-back: pages never spell the key layout.
import {
  hashKey, useMutation, useQueries, useQuery, type QueryKey, type UseMutationResult, type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { api, keptDetails, outcomeOf, type HubError, type Outcome } from './api';
import { alive, capture, snapshot, type CoreSnapshot, type Ctx, type Target } from './ctx';
import { changeContext, changeOwner, complete, declareAcrossRealms, declareExplicitRealm, type Compat, discard, foreignLock, guarded, heldByOther, heldInstance, heldOfBase, holdOfLock, identityOfLock, isBusy, isPending, lockBase, pendingMark, pendingOf, refusalOf, refusingHold, release, senderOfLock, type HeldByOther, type HeldChange, type HeldFrom, type HeldRow } from './changes';
import { newKey } from './kit';
import { answersFor, changeRealm, changeScope, dropUnheld, explicitRealmRefusal, explicitRealmRoute, flight, freeByVerdict, keyReadsRealm, proveByVerdict, LOCKKEY_THREW, readBackHold, lockRealm, needsLockKey, prefix, queryClient, readBackStates, readsRealm, refreshFresh, subscribeScope, useCore, pressBytes, varsDigest, type FreshRead, type ReadVerdict } from './query';
import { isChangeRoute, routeOf, type CallInput, type Route } from './routes';
import { traceIdOf } from './trace-id';
import { fixtureModeActive } from './transport';

type Input = Omit<CallInput, 'ctx' | 'signal' | 'scrub' | 'recovers'>;

export interface LiveRead<P = never> {
  readonly route: Route<unknown, unknown>;
  readonly input?: (params: P) => Input;
  /** The API answer → the page's shape. Throwing reads as a server error. */
  readonly select?: (raw: unknown, params: P) => unknown;
  readonly staleTime?: number;
  readonly refetchMs?: number;
}
export interface LiveChange<V = never> {
  readonly route: Route<unknown, unknown>;
  readonly input?: (vars: V) => Input;
  readonly select?: (raw: unknown, vars: V) => unknown;
  /** Whether a 2xx answer shows the change ran (default: every 2xx does). False, or a throw, reads the answer as
   *  pending (it may have gone through): held and read back as a lost answer, never done (e.g. an agent's 200
   *  whose body says the command did not finish). */
  readonly settles?: (raw: unknown, vars: V) => boolean;
  /** Whether a refused answer leaves the change's outcome unknown (default: none does). True reads it as pending
   *  like settles false: held, with the same persistent hold, freed only by a proving read or the warned Dismiss
   *  (e.g. an agent refusal whose details say a first step landed, or were dropped as too big). A throw counts
   *  as true. It sees the answer's code, status and kept details (keepDetails routes). */
  readonly holds?: (answer: { readonly code?: string; readonly status?: number; readonly details?: Record<string, unknown>; readonly detailsDropped?: true }, vars: V) => boolean;
  /** Read keys (of this source) that show the change's effect. */
  readonly reads?: readonly string[];
  /** Core reads outside this source that show the change's effect too (e.g. computersPage, the top bar's list):
   *  invalidated wherever the change is proved applied, a done answer or a read-back whose verdict is 'applied'
   *  (never a pending answer, a plain read, or a 'not_applied' verdict). */
  readonly coreReads?: readonly { invalidate(): Promise<void> }[];
  /** A lock shared across pages: pages that send the same change (Programs and Computers restarting one
   *  program) name the same lock, and `lockKey` maps their variables to the same identity (default: the
   *  variables), so a change pending on one page holds the other. Default: this page's own (page, key). */
  readonly lock?: string;
  readonly lockKey?: (vars: V) => unknown;
  /** The lock holds in every realm view (query.ts changeScope `acrossRealms`), e.g. a computer's lifecycle. */
  readonly acrossRealms?: boolean;
  /** The change names its own realm on every call (input.realm), never the one shown, e.g. Global: its hold counts,
   *  is read back and dismissed in every realm view, judged only by reads that name its realm (query.ts MutationOpts
   *  explicitRealm). Only an agent route that carries one realm, never with acrossRealms. */
  readonly explicitRealm?: boolean;
  /** With a lockKey: what the held change shows (heldChanges, proves' `identity`) when the proof needs more than
   *  the lock identity, e.g. the name a create sent (default: the lockKey value). Never a secret. */
  readonly identity?: (vars: V) => unknown;
  /** What a fresh read-back of `reads` proves (query.ts MutationOpts.proves): only a verdict frees the change
   *  ('applied': key dropped; 'not_applied': key kept); undefined keeps it pending. Without proves no read frees
   *  it: it stays held until the person dismisses it. `answers[i]` holds the fresh answers of reads[i] on the
   *  change's computer, in the page's shape. */
  readonly proves?: (identity: unknown, answers: readonly (readonly unknown[])[]) => ReadVerdict;
}
export interface SourceTable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly reads?: Readonly<Record<string, LiveRead<any>>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly changes?: Readonly<Record<string, LiveChange<any>>>;
}

export type SourceErrorKind = 'network' | 'forbidden' | 'not_found' | 'bad_request' | 'server' | 'stale' | 'not_sent' | 'not_wired';
export class SourceError extends Error {
  /** The API's trace id of the answer, when it carried one (trace-id.ts); null otherwise. */
  readonly traceId: string | null;
  /** The declared route of the call, "METHOD /template" (api.ts); null when no call was made. */
  readonly route: string | null;
  /** The call was a change (its route's method is not GET or HEAD), kept even when its route is not: error details
   *  read a change still running as pending (C9). */
  readonly change: boolean;
  /** A token session's refusal before sending: the leaf the token lacks (errorInfo keeps it only when routePerms.ts
   *  knows it); null otherwise. */
  readonly perm: string | null;
  constructor(readonly kind: SourceErrorKind, readonly code: string | null = null, readonly status: number | null = null, facts: { traceId?: string | null; route?: string | null; perm?: unknown } = {}) {
    super(`source ${kind}`);
    this.traceId = traceIdOf(facts.traceId);
    this.route = routeOf(facts.route);
    this.change = isChangeRoute(facts.route);
    this.perm = typeof facts.perm === 'string' ? facts.perm : null;
  }
}
export interface SourceResult<T> {
  outcome: Outcome;
  data?: T;
  code?: string;
  /** The HTTP status of a refused send (401, 429...), kept when the code is blank. */
  status?: number;
  /** A refused send's wait in whole seconds (Retry-After, else the body's data.retry_after; at most a day), on
   *  'failed' only: never on a pending answer, which may have applied. */
  retryAfter?: number;
  /** The idempotency key the send used (routes with idem): a pending change's receipt is read with it (the
   *  lock keeps it too: heldChanges()). */
  idem?: string;
  /** A HELD_BY_OTHER refusal: the page whose change holds the lock (null: it named none). */
  heldFrom?: HeldFrom | null;
  /** The person answered Cancel to the 2FA code prompt: the API refused the send before applying anything and no code
   *  went out. Only beside outcome 'failed' with no code or status; nothing is held. A page that reads it says
   *  nothing (the form stays as it was); one that does not sees the same 'failed' as before. */
  cancelled?: true;
  /** A sent call that did not end 'done': the API's trace id of its answer, when it carried one (error details). */
  traceId?: string;
  /** A sent call that did not end 'done': its declared route, "METHOD /template" (error details). */
  route?: string;
  /** Pending: the hold this send left (HeldChange.hold of that one send). Pass it to settle, dismiss, complete or
   *  discard with the variables to act on exactly that send. */
  hold?: string;
  /** A keepDetails route's (routes.ts) refused or pending send: the agent's details object (api.ts keptDetails). */
  details?: Record<string, unknown>;
  /** The same, when the details were over api.ts DETAILS_MAX: none kept. */
  detailsDropped?: true;
}

/** A change's recovery controls (C9), from core's lock, not page state: render "may have gone through" and
 *  Check again from `pending`. */
export interface ChangeControls<V> {
  /** True while a change of this key may have gone through and is not released (this mount's or an earlier one's). */
  readonly pending: boolean;
  /** Re-reads the change's declared reads now; true only when the fresh read PROVED this key's changes (proves)
   *  and no change of the lock is still held in a realm read now (or nothing was pending). A failed, unproven or
   *  errored read keeps it pending. */
  readBack(): Promise<boolean>;
  /** The page's own proof: frees this key's own changes (these
   *  variables and the hold shown; without, in a realm read now, only the sends THIS mount made, each while it
   *  still holds the token the mount recorded: never a hold of this key from an earlier mount or another editor,
   *  whose identity this mount did not show (list them with held(), free one with settleHeld/dismissHeld or with
   *  variables and its hold), never another page's sharing the lock (with variables, one held by another page
   *  stays, silently: pages ask heldByOther(vars) FIRST); keys stay. A proof frees only while the stored record still
   *  names the outcome the hold observed, no stamp is live and no request of it is out here; the person's
   *  Dismiss is dismiss(). */
  settle(): Promise<boolean>;
  settle(vars: V, hold: string): Promise<boolean>;
  /** The person's warned Dismiss (`warned`): like settle(), except that it frees the hold even when its
   *  request is still out, its outcome moved since it was shown, or its stamp is live, since the person was told it may
   *  be sent again; with variables also a hold that records no sender. */
  dismiss(): Promise<boolean>;
  dismiss(vars: V, hold: string): Promise<boolean>;
  /** The page PROVED the change did not apply: drops its lock and key (these variables; without, this mount's
   *  last change while this key still owns its lock). No-op while it is being sent. Another page's change of
   *  these variables keeps its lock and key, silently: pages ask heldByOther(vars) FIRST. */
  discard(): Promise<boolean>;
  discard(vars: V, hold: string): Promise<boolean>;
  /** The change is PROVEN applied (its receipt reads completed): frees it and drops its key, so the next press
   *  is a new change with a fresh key (these variables in the realm they were sent in; without, every change
   *  this mount sent: never an earlier mount's, never another page's sharing the lock; one that sent nothing
   *  frees nothing). With variables, another page's change of them keeps its lock and key, silently: pages ask
   *  heldByOther(vars) FIRST and never treat the call as a release. */
  complete(): Promise<boolean>;
  complete(vars: V, hold: string): Promise<boolean>;
  /** With variables, `hold` (settle, dismiss, discard, complete; REQUIRED) names the one send the proof or the
   *  Dismiss concerns (the press's result hold, HeldChange.hold, or holdOf(vars) taken before the page's own
   *  read): a later send of the same change, another realm's and another account's are left held. Each answers
   *  true when it freed something, false (a no-op) when the hold is missing or no longer holds the lock.
   *  holdOf: the send of these variables held now, or undefined. */
  holdOf(vars: V): Promise<string | undefined>;
  /** HELD_BY_OTHER (with the sending page) while another page's change of these variables is recorded (pending,
   *  being sent, or released keeping its key): settle, complete and discard of them free nothing. */
  heldByOther(vars: V): Promise<HeldByOther | undefined>;
  /** This key's held sends (pending, recorded as this key's, from any mount), in a realm read now (an
   *  across-realms lock: every realm), oldest first: what a page shows to say which change a Dismiss concerns. */
  held(): readonly HeldRow[];
  /** By token, for a row held() listed and the page showed: frees exactly that send of this key, judged and stored
   *  in one store-lock turn (changes.ts settleChange), only under the account and context of the call; keys stay.
   *  True once stored. False (a no-op) when the row's send no longer holds the lock (freed, sent again since),
   *  another key sent it, another account is shown, its outcome moved since the row was listed (another tab's answer:
   *  list it again), or a request of it is out. dismissHeld is the person's warned Dismiss: it also frees over a
   *  live send and a hold that records no sender. */
  settleHeld(row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean>;
  dismissHeld(row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean>;
}
export type SourceMutation<T, V> = UseMutationResult<SourceResult<T>, SourceError, V> & ChangeControls<V>;
const FIXTURE_CONTROLS: ChangeControls<unknown> = Object.freeze({
  pending: false,
  readBack: () => Promise.resolve(true),
  settle: () => Promise.resolve(false),
  dismiss: () => Promise.resolve(false),
  discard: () => Promise.resolve(false),
  holdOf: () => Promise.resolve(undefined),
  complete: () => Promise.resolve(false),
  heldByOther: () => Promise.resolve(undefined),
  held: () => [],
  settleHeld: () => Promise.resolve(false),
  dismissHeld: () => Promise.resolve(false),
});

/** The fixture source shape (app/fixtures.ts fixtureSource) a page passes as its fallback. */
export interface FallbackSource {
  useQuery<T>(key: string): UseQueryResult<T, Error>;
  useMutation<T, V = void>(key: string): UseMutationResult<{ outcome: Outcome; data?: T; code?: string }, Error, V>;
}

export interface CoreSource {
  useQuery<T, P = void>(key: string, params?: P, o?: { enabled?: boolean; refetchInterval?: number | false }): UseQueryResult<T, SourceError>;
  /** One read of `key` per params item (each with its own target from the key's input), keyed as useQuery
   *  keys them, so invalidate() and a change's read-back see every one. Fixture mode: the fallback's answer
   *  for each item. */
  useQueries<T, P>(key: string, params: readonly P[], o?: { enabled?: boolean; refetchInterval?: number | false }): UseQueryResult<T, SourceError>[];
  useMutation<T, V = void>(key: string): SourceMutation<T, V>;
  /** The hash of the query key useQuery(key, params) reads now: account, realm, generation, the computer a kit or
   *  agent read asks, and the params. One read's identity, for state a page keeps per read (not per params). */
  useQueryHash<P = void>(key: string, params?: P): string;
  /** Re-read these keys now (all params). */
  invalidate(keys?: readonly string[]): Promise<void>;
  /** The query-key predicate of these read keys (all when omitted), as a locked change's reads take it:
   *  sourceReads(pageId, keys, o). */
  readTarget(keys?: string | readonly string[], o?: { computer?: string }): (k: readonly unknown[]) => boolean;
  /** Who sent a held change of a lock (heldChanges): 'self' this source's change `key` (its settle/dismiss can
   *  free it), 'other' another declaration sharing the lock, undefined when nothing recorded it. */
  heldBy(key: string, h: HeldChange): 'self' | 'other' | undefined;
}

/**
 * The query-key predicate of a page source's reads: `keys` of coreSource(pageId) (all its reads when omitted).
 * With o.computer, a read of another computer does not match; a read that names no computer (base or realm scope)
 * still does. Pages use this instead of spelling the key layout.
 */
export function sourceReads(pageId: string, keys?: string | readonly string[], o?: { computer?: string }): (k: readonly unknown[]) => boolean {
  const names = typeof keys === 'string' ? [keys] : keys;
  return (k) => {
    if (!(k[0] === 'hub' && k[4] === SRC && k[5] === pageId && (!names || names.includes(k[6] as string)))) return false;
    if (!o?.computer) return true;
    const target = k[8];
    return !Array.isArray(target) || target[1] === o.computer;
  };
}

function errorOf(e: unknown): SourceError {
  if (e instanceof SourceError) return e;
  const x = (e || {}) as HubError;
  const code = typeof x.code === 'string' ? x.code : null;
  const st = typeof x.status === 'number' ? x.status : null;
  const f = { traceId: x.traceId, route: x.route };
  // A dead context (api gone(): not_sent with stale, or superseded when the session ended), a caller's abort before
  // sending, a cancel or a late answer is stale; any other refusal before sending is not_sent with its own code, so it
  // never reads as "the answer came after you moved on".
  const unsent = x.notSent || x.kind === 'not_sent';
  if (x.stale || x.cancelled || x.kind === 'stale' || (unsent && (x.superseded || x.kind === 'aborted' || code === 'aborted'))) return new SourceError('stale', code, st, f);
  if (unsent) return new SourceError('not_sent', code, st, { ...f, perm: x.perm });
  // A body lost after the answer arrived (kit.ts `answered`) keeps no code: reachability.ts reads it as unknown,
  // never as a computer that did not answer.
  if (!st) return new SourceError('network', (x as { answered?: unknown }).answered === true ? null : code, st, f);
  if (st === 401 || st === 403) return new SourceError('forbidden', code, st, f);
  if (st === 404) return new SourceError('not_found', code, st, f);
  if (st >= 400 && st < 500) return new SourceError('bad_request', code, st, f);
  return new SourceError('server', code, st, f);
}

/** A change's coreReads read again (LiveChange.coreReads), once it is proved applied. Never throws: a read that cannot
 *  be invalidated leaves the change's own outcome as it was. */
function invalidateCore(def: { readonly coreReads?: LiveChange['coreReads'] } | undefined): void {
  for (const q of def?.coreReads ?? []) { try { void q.invalidate().catch(() => undefined); } catch { /* the outcome stands */ } }
}

// The automatic read-back's proof of a pending send, by its hold token (bounded: the oldest goes first).
const provedSends = new Map<string, Promise<boolean>>();
function keepProof(hold: string, p: Promise<boolean>): void {
  provedSends.set(hold, p);
  while (provedSends.size > 64) provedSends.delete(provedSends.keys().next().value as string);
}
/** The proof of a pending send (its result's `hold`): settles true only when core's own read-back after that answer
 *  proved it applied; false otherwise, or for a hold it does not know. Taken once. */
export function sendProved(hold: string): Promise<boolean> {
  const p = provedSends.get(hold);
  provedSends.delete(hold);
  return p ?? Promise.resolve(false);
}

const SRC = 'src';

/** The page's data source over core (see the contract). */
export function coreSource(pageId: string, table: SourceTable, fallback?: FallbackSource): CoreSource {
  const reads = table.reads || {};
  const changes = table.changes || {};
  // A GET declared change (routes.ts change) is never a read: a refetch or read-back would send it again.
  for (const [k, r] of Object.entries(reads)) if ((r.route as Route).change === true) throw new Error('coreSource reads need a read route: ' + k);
  // A bad lock name throws here, when the page declares it, not at its first press (lockBase).
  for (const c of Object.values(changes)) { needsLockKey(c.route as Route, c.lockKey); if (c.lock) lockBase(c.lock); }
  // A change filed across realms: its lock base (as baseOf names it) shows its legacy realm-scoped holds in every view.
  for (const [k, c] of Object.entries(changes)) if (c.acrossRealms) declareAcrossRealms(c.lock ? lockBase(c.lock) : 's:' + pageId + ':' + k);
  // A change naming its own realm (query.ts MutationOpts explicitRealm): its holds show in every realm view.
  for (const [k, c] of Object.entries(changes)) if (c.explicitRealm) { explicitRealmRoute(c.route as Route, !!c.acrossRealms); declareExplicitRealm(c.lock ? lockBase(c.lock) : 's:' + pageId + ':' + k); }
  // Slot 9: the realm the read asks explicitly (input.realm), so a read-back judges its answers in that realm
  // (keyRealm), not the one shown.
  const keyOf = (s: CoreSnapshot, key: string, params: unknown, target: unknown, realm?: string): QueryKey =>
    [...prefix(s), SRC, pageId, key, params === undefined ? null : params, target ?? null, realm ?? null];
  const mine = (keys?: readonly string[]) => (k: QueryKey): boolean =>
    k[0] === 'hub' && k[4] === SRC && k[5] === pageId && (!keys || keys.includes(k[6] as string));
  const invalidate = (keys?: readonly string[]) => queryClient.invalidateQueries({ predicate: (q) => mine(keys)(q.queryKey) });
  // Each declared read key with an enabled query re-reads with a request sent now; none may fail and at least
  // one must answer (a key with only disabled queries proves nothing either way and is skipped). Resolves what
  // each key's requests fetched (a change's proves() judges only that), or null.
  // An agent/kit read re-reads only the change's computer (key slot 8 holds [project, container]): a read of
  // another computer never proves this one's change. With a realm (the change's), only the reads that can show it
  // are re-read (keyReadsRealm, the rule answersFor judges by), so a read of another realm is never requested.
  const readBackFresh = async (keys: readonly string[], t: Target | null = null, realm: string | null = null): Promise<FreshRead[] | null> => {
    if (!keys.length) return null;
    const fresh = await Promise.all(keys.map(async (k) => {
      const def = reads[k];
      const only = t && def && (def.route.scope === 'agent' || def.route.scope === 'kit') ? t : null;
      const held = (q: QueryKey): boolean => mine([k])(q) && (!only || (Array.isArray(q[8]) && q[8][0] === only.project.id && q[8][1] === only.container.id));
      const f = await refreshFresh((q) => held(q) && keyReadsRealm(q, realm));
      // Off-page: a read no page holds now (never read, or its page closed and the cache let it go) is read
      // once here, without params, for the change's computer, so a change whose proof needs it can be proved.
      // A read a page holds in another realm only (or keeps disabled) stays skipped, as before the realm filter.
      if (f.state !== 'none' || !def || queryClient.getQueryCache().findAll({ predicate: (q) => held(q.queryKey) }).length) return f;
      return offPage(k, only, realm);
    }));
    return readBackStates(fresh.map((f) => f.state)) ? fresh : null;
  };
  const readBack = async (keys: readonly string[], t: Target | null = null): Promise<boolean> => (await readBackFresh(keys, t)) !== null;
  // An off-page read only adds evidence: one that cannot be built or does not answer is skipped ('none', as
  // before it was tried), never a failed read-back; a context that moved on during it is failed.
  // One that would read another realm than the change's (keyReadsRealm) is never sent.
  async function offPage(k: string, t: Target | null, realm: string | null = null): Promise<FreshRead> {
    const s = snapshot();
    let opts: { queryKey: QueryKey; queryFn: (c: { signal: AbortSignal }) => Promise<unknown> };
    try { const o = optionsFor(t ? { ...s, target: t } : s, k, undefined); opts = { queryKey: o.queryKey, queryFn: o.queryFn }; } catch { return { state: 'none', answers: [] }; }
    if (!keyReadsRealm(opts.queryKey, realm)) return { state: 'none', answers: [] };
    const got = await flight(opts.queryKey, hashKey(opts.queryKey), () => queryClient.fetchQuery({ ...opts, staleTime: 0 }));
    dropUnheld(opts.queryKey);
    if (snapshot().gen !== s.gen) return { state: 'failed', answers: [] };
    if (!got) return { state: 'none', answers: [] };
    return { state: 'fresh', answers: [{ key: opts.queryKey, data: got.v }] };
  }

  type QueryOpts = { enabled?: boolean; refetchInterval?: number | false };
  // One read's TanStack options: the key (bound to account, realm, generation and, for agent/kit reads, the
  // computer) and a queryFn that carries its context. Shared by useQuery and useQueries.
  function optionsFor<P>(s: CoreSnapshot, key: string, params: P | undefined, o?: QueryOpts) {
    const def = reads[key];
    const input = def?.input ? def.input(params as P) : {};
    const scoped = def && (def.route.scope === 'agent' || def.route.scope === 'kit') ? (input.target || s.target) : null;
    return {
      queryKey: keyOf(s, key, params, scoped ? [scoped.project.id, scoped.container.id] : null, input.realm),
      enabled: o?.enabled ?? true,
      refetchInterval: o?.refetchInterval ?? def?.refetchMs,
      staleTime: def?.staleTime,
      queryFn: async ({ signal }: { signal: AbortSignal }): Promise<unknown> => {
        if (!def) throw new SourceError('not_wired');
        // The computer the key names (not whatever is current when a background refetch runs): a cached read of
        // computer A refetched while B is shown still asks A.
        const ctx: Ctx = capture(input.target || scoped || undefined);
        if (ctx.gen !== s.gen || !alive(ctx)) throw new SourceError('stale');
        let raw: unknown;
        try { raw = await api(def.route, { ...input, ctx, signal }); } catch (e) { throw errorOf(e); }
        try { return def.select ? def.select(raw, params as P) : raw; } catch { throw new SourceError('server'); }
      },
    };
  }
  function useLiveQuery<T, P>(key: string, params: P | undefined, o?: QueryOpts): UseQueryResult<T, SourceError> {
    const s = useCore();
    return useQuery<unknown, SourceError, T>(optionsFor(s, key, params, o));
  }
  function useLiveQueries<T, P>(key: string, params: readonly P[], o?: QueryOpts): UseQueryResult<T, SourceError>[] {
    const s = useCore();
    return useQueries({ queries: params.map((p) => optionsFor(s, key, p, o)) }) as UseQueryResult<T, SourceError>[];
  }


  function useLiveMutation<T, V>(key: string): SourceMutation<T, V> {
    // The lock and key of each change live in changes.ts under (base, identity digest): they survive this hook
    // (unmount, remount, a closed sheet, a realm switch) and go only on an account change or a sign-out. The
    // scope names what the call acts on (changeScope: realm, computer); the lock records the computer.
    const baseOf = (): string => { const def = changes[key]; return def?.lock ? lockBase(def.lock) : 's:' + pageId + ':' + key; };
    // This key, as the sender its locks record.
    const senderOf = useCallback((): string => 's:' + pageId + ':' + key, [key]);
    // One press: input, context and scope are taken when it happens (before any await).
    interface Press {
      readonly input: CallInput | null; readonly bad: boolean; readonly ctx: Ctx; readonly target: Target | null; readonly scope: string; readonly realm: string | null;
      /** Under a lockKey, for a valid input: the digest of the full variables, in memory only (a released key is
       *  replayed only for the same bytes, and a key another sender of a shared lock kept for other bytes is dropped,
       *  whether or not this route is idempotent). Taken as a snapshot at the press, hashed only when the send calls
       *  it (pressBytes). */
      readonly bytes?: () => Promise<string>;
      /** The account the press was made in: guarded() answers stale, touching no lock, once another is shown. */
      readonly who: string;
      /** The identity this press is hashed, admitted and shown under: the lockKey value taken once at the press
       *  (else the variables), LOCKKEY_THREW when it threw (the press is then refused: bad). */
      readonly ident: unknown;
      /** What heldChanges() shows for it (the change's identity(), else, or when that throws, the lockKey value;
       *  undefined without one). */
      readonly shown: unknown;
      /** Why the press is refused unsent when bad (query.ts explicitRealmRefusal); default INPUT_INVALID. */
      readonly refusal?: string;
    }
    const press = useCallback((vars: V): Press => {
      const def = changes[key];
      let input: CallInput | null = null, bad = false;
      if (def) { try { input = def.input ? def.input(vars) : {}; } catch { bad = true; } }
      // The lockKey runs once per press; its value is what the press is hashed, admitted and shown under. One that
      // throws refuses the press (INPUT_INVALID, nothing sent), as a throwing input does.
      let ident: unknown = vars, shown: unknown;
      if (def?.lockKey) {
        try { ident = def.lockKey(vars); } catch { ident = LOCKKEY_THREW; bad = true; }
        if (!bad) { try { shown = def.identity ? def.identity(vars) : ident; } catch { shown = ident; } }
      }
      const target = (input && input.target) || snapshot().target;
      const scope = def ? changeScope(baseOf(), def.route, target, input?.realm, def.acrossRealms) : baseOf();
      const realm = def ? lockRealm(def.route, input?.realm) : null;
      // An explicitRealm press that does not act in the realm it names is refused unsent (query.ts explicitRealmRefusal).
      const refusal = def?.explicitRealm && input && !bad ? explicitRealmRefusal(def.route, input.realm) ?? undefined : undefined;
      if (refusal !== undefined) bad = true;
      return { input, bad, ctx: capture(input ? input.target : undefined), target, scope, realm, bytes: def?.lockKey && !bad && input ? pressBytes(vars) : undefined, who: changeOwner(), ident, shown, ...(refusal !== undefined ? { refusal } : {}) };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    // The digest of a change's identity for lookups (settle, isPending, holdOf): its lockKey (a shared lock), else
    // its variables. A lockKey that throws gives LOCKKEY_THREW, never the variables. A send takes its identity
    // once, at the press (Press.ident), and is refused when it threw.
    const digestOf = useCallback((vars: V): Promise<string> => {
      const def = changes[key];
      let id: unknown = vars;
      if (def?.lockKey) { try { id = def.lockKey(vars); } catch { id = LOCKKEY_THREW; } }
      return varsDigest(id);
    }, [key]);
    const curScope = (): string => { const def = changes[key]; return def ? changeScope(baseOf(), def.route, snapshot().target, undefined, def.acrossRealms) : baseOf(); };
    // The same change filed the other way (changes.ts Compat): a build of this change with acrossRealms flipped.
    const compatOf = (): Compat | undefined => { const def = changes[key]; return def ? { base: baseOf(), across: !!def.acrossRealms } : undefined; };
    // This mount's last change (scope, digest, computer, realm): discard() and readBack() act on it.
    const lastRef = useRef<{ scope: string; digest: string; target: Target | null; realm: string | null } | undefined>(undefined);
    // Every change this mount sent that went pending (scope + digest → the hold its answer carried): its Dismiss frees all
    // of them, not only the last; complete() and discard() only while the hold is unchanged.
    const sentRef = useRef(new Map<string, string>());
    // Reads made now read the realm a change was sent in (none recorded: any realm).
    const inRealm = (realm: string | null): boolean => { const def = changes[key]; return !def || readsRealm(def.route, realm, def.explicitRealm); };
    // Pending: a change of this key on the current computer, or this mount's last change on the computer it
    // went to, while its realm is shown (a read-back can release it only there).
    // An explicitRealm change is filed under the realm it names, never the one shown (curScope names the shown one): any
    // change of this key on the current computer, in any realm, is pending here, also after a remount.
    const explicitPending = (): boolean => {
      const def = changes[key];
      if (!def?.explicitRealm) return false;
      const ids = (t: Target | null | undefined): string => (t ? t.project.id + '/' + t.container.id : '-');
      return pendingOf(baseOf()).some((c) => ids(c.target as Target | null) === ids(snapshot().target));
    };
    const pending = useSyncExternalStore(subscribeScope, () => {
      const last = lastRef.current;
      return isPending(curScope(), undefined, compatOf()) || (!!last && inRealm(last.realm) && isPending(last.scope, last.digest)) || explicitPending();
    }, () => false);
    const busy = useSyncExternalStore(subscribeScope, () => isBusy(curScope(), undefined, compatOf()) || (!!lastRef.current && isBusy(lastRef.current.scope, lastRef.current.digest)), () => false);
    // One change: re-read its reads against the computer it went to, then free only that change, and only when
    // this key sent it (freeByVerdict's `by`). True when it is not pending afterwards. The reads are the current
    // realm's: a change sent in another realm (or one whose realm moved during the read) stays. With `requested`
    // (readBackNow({ hold })): true only when this read proved that send (proveByVerdict), never from nothing pending.
    const readBackOne = useCallback(async (scope: string, digest: string, t: Target | null, realm: string | null, requested?: string, onApplied?: () => void): Promise<boolean> => {
      const def = changes[key];
      // Another page's change is never judged here (proves is not even asked): it stays, so false.
      const foreign = (): boolean => foreignLock(scope, digest, senderOf());
      if (foreign() || !inRealm(realm)) return false;
      // The send and the account this read-back judges, taken before its await.
      const start = pendingMark(), who = changeOwner(), hold = holdOfLock(scope, digest), ctx = changeContext();
      const fresh = await readBackFresh(def?.reads || [], t, realm);
      if (!fresh || !inRealm(realm) || foreign()) return false;
      // Freed only by what the read fetched and proves (answersFor: the change's computer and realm): no proves
      // declared, no verdict (a plain fresh read proves nothing; the change stays held until the person
      // dismisses it).
      let verdict: ReadVerdict | null = undefined;
      if (def?.proves) { try { verdict = def.proves(identityOfLock(scope, digest), fresh.map((f) => answersFor(f, t, realm))); } catch { verdict = undefined; } }
      if (changeOwner() !== who) return false;
      const freed = requested !== undefined
        ? await proveByVerdict(scope, digest, hold, requested, start, verdict, senderOf(), ctx)
        : await freeByVerdict(scope, digest, hold, start, verdict, senderOf(), ctx);
      // Proved applied: the core reads that show it outside this source are read again too (the top bar's list).
      if (freed && verdict === 'applied') { invalidateCore(def); onApplied?.(); }
      return freed;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    // Check again: every pending change this key sent (two rows may be in flight; each re-read on its own
    // computer and released by its own digest); with none, this mount's last change, else the current computer's
    // reads. True only when, after that, no change of the lock is pending in a realm the current reads read.
    // With `only.hold` (a runner's band, core/storage/runner.ts): only this key's change holding that send token, so a
    // press on one hold never proves or releases another (under All realms every realm's hold is read). None: false.
    // Anything but a string hold (readBackHold: an event a bare handler hands in) is a bare read-back.
    const readBackNow = useCallback(async (only?: { hold: string }): Promise<boolean> => {
      const hold = readBackHold(only);
      if (hold !== undefined) {
        const c = pendingOf(baseOf()).find((x) => x.by === senderOf() && holdOfLock(x.scope, x.digest) === hold);
        return c ? readBackOne(c.scope, c.digest, c.target as Target | null, c.realm, hold) : false;
      }
      const last = lastRef.current;
      const own = pendingOf(baseOf()).filter((c) => c.by === senderOf());
      const ok = own.length
        ? (await Promise.all(own.map((c) => readBackOne(c.scope, c.digest, c.target as Target | null, c.realm)))).every(Boolean)
        : last ? await readBackOne(last.scope, last.digest, last.target, last.realm) : await readBack(changes[key]?.reads || [], snapshot().target);
      return ok && !pendingOf(baseOf()).some((c) => inRealm(c.realm));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [readBackOne, key]);
    // The press is taken when mutate/mutateAsync is called (below), not when TanStack runs mutationFn a tick
    // later: a realm or computer switch in between never moves the change.
    // What TanStack holds for a send: its number, plus the variables only for a change with no lockKey (a page may
    // read `variables`). A change with a lockKey may carry a secret: every change whose route declares a secret or
    // sends a text body must have one (needsLockKey, checked at definition), and other variables that hold a secret
    // need one too. The press (its input holds the
    // body) and those variables wait in `sends` for exactly that call, and leave it when the call's promise settles
    // (mutate and mutateAsync, below), even when TanStack settles it without running mutationFn (an onMutate that
    // throws). The query client never pauses a mutation as offline (networkMode 'always', query.ts); its callbacks
    // may still delay mutationFn, and the entry leaves when the call settles either way.
    const sends = useRef(new Map<number, { vars: V; p: Press }>());
    const sendSeq = useRef(0);
    const m = useMutation<SourceResult<T>, SourceError, { n: number; vars?: V }>({
      retry: false,
      mutationFn: async ({ n }: { n: number; vars?: V }) => {
        // The entry is dropped by the call that put it there (mutateAsync, below), when its promise settles.
        const got = sends.current.get(n);
        return got ? sendOne(got.vars, got.p) : { outcome: 'not_sent', code: 'INPUT_INVALID' };
      },
    });
    async function sendOne(vars: V, p: Press): Promise<SourceResult<T>> {
        const def = changes[key];
        if (!def) return { outcome: 'not_sent', code: 'NOT_WIRED' };
        if (p.bad || !p.input) return { outcome: 'not_sent', code: p.refusal ?? 'INPUT_INVALID' };
        const input = p.input;
        // The identity digest (the press's lockKey value, else the variables), never the variables themselves.
        const d = await varsDigest(p.ident);
        // The press's account is no longer shown: nothing is sent, no lock touched, no read-back of the other's.
        if (changeOwner() !== p.who) return { outcome: 'stale' };
        const no = refusalOf(p.scope, d, senderOf(), compatOf());
        if (no) {
          // This key's own pending change: try the read-back again (nothing is sent); the next press runs once it
          // proved the outcome. Another page's (HELD_BY_OTHER) is that page's to check: named, never read back here.
          // Read back the held send (its scope, computer and realm: refusingHold), never the press's.
          const h = no.code === 'READ_BACK_FIRST' ? refusingHold(p.scope, d, compatOf()) : null;
          if (h) void readBackOne(h.scope, d, h.target as Target | null, h.realm);
          return { outcome: 'not_sent', code: no.code, ...(no.heldFrom !== undefined ? { heldFrom: no.heldFrom } : {}) };
        }
        lastRef.current = { scope: p.scope, digest: d, target: p.target, realm: p.realm };
        let data: T | undefined;
        const res = await guarded(p.scope, d, async (replayKey) => {
          // The replayed key wins (C9); a key only where the route takes one.
          const idem = def.route.idem ? replayKey || input.idem || newKey() : undefined;
          try {
            const raw = await api(def.route, { ...input, idem, ctx: p.ctx });
            try { data = (def.select ? def.select(raw, vars) : raw) as T; } catch { data = undefined; }
            let ran = true;
            if (def.settles) { try { ran = def.settles(raw, vars) === true; } catch { ran = false; } }
            return { outcome: (ran ? 'done' : 'pending') as Outcome, ...(idem ? { idem } : {}) };
          } catch (e) {
            const code = typeof (e as HubError | null)?.code === 'string' ? ((e as HubError).code as string) : undefined;
            const status = typeof (e as HubError | null)?.status === 'number' && (e as HubError).status ? ((e as HubError).status as number) : undefined;
            const w = e as { retryAfter?: unknown; data?: { data?: { retry_after?: unknown } } } | null;
            const ra = [w?.retryAfter, w?.data?.data?.retry_after].find((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0);
            const traceId = traceIdOf((e as HubError | null)?.traceId), route = routeOf((e as HubError | null)?.route);
            const kept = def.route.keepDetails ? { ...keptDetails(def.route, e), ...((e as HubError | null)?.detailsDropped ? { detailsDropped: true as const } : {}) } : {};
            let outcome = outcomeOf(e, true);
            // The 2FA prompt answered Cancel while the context lives (api() leaves `cancelled` on a definite refusal
            // only; once the context died the same answer is pending or stale): nothing was applied, and a page can
            // say nothing about it.
            const cancelled = outcome === 'failed' && (e as HubError | null)?.cancelled === true;
            if (outcome === 'failed' && def.holds) {
              const answer = { ...(code ? { code } : {}), ...(status !== undefined ? { status } : {}), ...kept };
              try { if (def.holds(answer, vars) !== false) outcome = 'pending'; } catch { outcome = 'pending'; }
            }
            return { outcome, ...(idem ? { idem } : {}), ...(code ? { code } : {}), ...(status !== undefined ? { status } : {}), ...(ra !== undefined ? { retryAfter: Math.min(Math.ceil(ra), 86400) } : {}), ...(traceId ? { traceId } : {}), ...(route ? { route } : {}), ...kept, ...(cancelled && outcome === 'failed' ? { cancelled: true as const } : {}) };
          }
        }, { base: baseOf(), target: p.target, realm: p.realm, by: senderOf(), page: pageId, across: !!def.acrossRealms, ...(def.lockKey ? { identity: p.shown } : {}) }, p.bytes ? await p.bytes() : undefined, def.route.idem ? input.idem || newKey() : undefined, p.who, compatOf());
        const idem = (res as { idem?: string }).idem;
        // The hold this send left, as guarded stamped it when it settled: only a pending answer leaves one, and it is
        // recorded only while the account the press was made in is still shown. Never a lock lookup after the await:
        // that names whoever holds the lock now (another account's, or a later send).
        const sentHold = (res as { hold?: string }).hold;
        const held = res.outcome === 'pending' && changeOwner() === p.who ? sentHold : undefined;
        if (held !== undefined) sentRef.current.set(p.scope + '\u0000' + d, held);
        if (res.outcome === 'done') {
          void invalidate(def.reads || []);
          invalidateCore(def);
          return { outcome: 'done', ...(data === undefined ? {} : { data }), ...(idem ? { idem } : {}) };
        }
        // May have gone through: read back at once; no new send before that read-back's proving verdict (proves)
        // or the person's warned Dismiss (none declared: refused until the page settles it). The key comes back: the page
        // reads the receipt with it.
        // Its proof is kept under the send's hold token (sendProved): true when that read-back proves this send
        // applied, else false, so a page can finish what a done answer would have (pages/computers/firstPick.ts).
        if (res.outcome === 'pending') {
          const proved = new Promise<boolean>((settle) => { readBackOne(p.scope, d, p.target, p.realm, undefined, () => settle(true)).then(() => settle(false), () => settle(false)); });
          const h = (res as { hold?: string }).hold;
          if (h) keepProof(h, proved);
        }
        const { code, status, heldFrom, hold, retryAfter, traceId, route, details, detailsDropped } = res as { code?: string; status?: number; heldFrom?: HeldFrom | null; hold?: string; retryAfter?: number; traceId?: string; route?: string; details?: Record<string, unknown>; detailsDropped?: true };
        // guarded judged a cancelled prompt 'failed' (nothing held); a replay of a kept key was turned 'pending' there.
        const cancelled = res.outcome === 'failed' && (res as { cancelled?: boolean }).cancelled === true;
        return { outcome: res.outcome, ...(cancelled ? { cancelled: true as const } : {}), ...(code ? { code } : {}), ...(status !== undefined && res.outcome === 'failed' ? { status } : {}), ...(retryAfter !== undefined && res.outcome === 'failed' ? { retryAfter } : {}), ...(idem ? { idem } : {}), ...(heldFrom !== undefined ? { heldFrom } : {}), ...(res.outcome === 'pending' && hold ? { hold } : {}), ...(traceId ? { traceId } : {}), ...(route ? { route } : {}), ...(details ? { details } : {}), ...(detailsDropped ? { detailsDropped } : {}) };
    }
    // The pending changes of these variables in a realm the current reads read, on their computer: settle()
    // and complete() act on the change in the realm it was SENT in, never a same-variables change of the realm
    // shown now.
    const sentLocks = useCallback(async (vars: V, kept = false): Promise<Array<{ scope: string; digest: string; by?: string }>> => {
      const def = changes[key];
      const p = press(vars);
      // The realm and account shown at the call, before the await: a switch meanwhile never widens what is named.
      const shown = def ? changeRealm(def.route) : null;
      const d = await digestOf(vars);
      if (changeOwner() !== p.who) return [];
      const onComputer = !!def && (def.route.scope === 'agent' || def.route.scope === 'kit');
      const ids = (t: Target | null | undefined): string => (t ? t.project.id + '/' + t.container.id : '-');
      // An across-realms lock (def.acrossRealms) is the same change in every realm view: no realm filter (a
      // read-back still checks the realm it reads).
      return pendingOf(baseOf(), { kept }).filter((c) => c.digest === d && (!def || def.acrossRealms || c.realm === null || shown === c.realm || shown === 'all') && (!onComputer || ids(c.target as Target | null) === ids(p.target)));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [press, digestOf, key]);
    // The changes settle(), dismiss() and complete() without variables act on: only the sends THIS mount made and
    // showed, each still holding the token this mount recorded after its send (a later send, here or in another
    // tab, moved it), in a realm the current reads read; never another key's sharing the lock, and never a hold of
    // this key from an earlier mount or another editor (its identity, e.g. another file, was not shown here: the
    // page frees it with settle/dismiss(vars, hold), naming the hold it showed). Every one, not only the last.
    const ownChanges = (kept: boolean): Array<{ scope: string; digest: string; hold: string }> => {
      const mine = senderOf();
      const sent = sentRef.current;
      const def = changes[key];
      const out: Array<{ scope: string; digest: string; hold: string }> = [];
      for (const c of pendingOf(baseOf(), { kept })) {
        // An across-realms lock is the same change in every realm view (as sentLocks): no realm filter.
        if (c.by !== mine || !(def?.acrossRealms || inRealm(c.realm))) continue;
        // Read in the same synchronous step that asks for its free (settleChange judges it again in its turn).
        const now = holdOfLock(c.scope, c.digest);
        if (now !== undefined && sent.get(c.scope + '\u0000' + c.digest) === now) out.push({ scope: c.scope, digest: c.digest, hold: now });
      }
      return out;
    };
    // With variables: the one send the page showed (`hold`, required, with the outcome the page observed), looked up
    // by its token after the digest is awaited, then judged and stored in one store-lock turn (changes.ts
    // settleChange) under the account and context the call was made in, taken before its first await (a send that
    // went pending meanwhile, an outcome another tab stored since, a realm switch, an account switch or round trip
    // never moves what is freed: false). Another page's change of them is never freed (heldByOther names it).
    type Free = (scope: string, digest: string, o: { ctx: number; owner: string; by: string }) => Promise<boolean>;
    const ownOnly = async (vars: V, hold: string, kept: boolean, nobodys: boolean, free: Free): Promise<boolean> => {
      if (typeof hold !== 'string' || !hold) return false;
      const mine = senderOf(), who = changeOwner(), ctx = changeContext();
      const d = await digestOf(vars);
      if (changeOwner() !== who || changeContext() !== ctx) return false;
      const c = heldInstance(baseOf(), hold, kept);
      return !!c && c.digest === d && (c.by === mine || (nobodys && c.by === undefined)) && free(c.scope, c.digest, { ctx, owner: who, by: mine });
    };
    const holdOfVars = useCallback(async (vars: V): Promise<string | undefined> => {
      const sc = press(vars).scope, who = changeOwner();
      const d = await digestOf(vars);
      if (changeOwner() !== who) return undefined;
      // The pending hold that refuses a press (its own id, or filed the other way: Compat); only with none, a
      // record released keeping its key.
      return refusingHold(sc, d, compatOf())?.hold ?? holdOfLock(sc, d);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [press, digestOf, key]);
    const heldByOtherOf = useCallback(async (vars: V): Promise<HeldByOther | undefined> => {
      const p = press(vars);
      const d = await digestOf(vars);
      const sent = await sentLocks(vars, true);
      // Another account shown by now: its locks are not this call's to name.
      if (changeOwner() !== p.who) return undefined;
      for (const c of [...sent, { scope: p.scope, digest: d }]) { const no = heldByOther(c.scope, c.digest, senderOf()); if (no) return no; }
      return undefined;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [press, digestOf, sentLocks]);
    // Without variables (this mount): every hold is read in the same synchronous step that asks for its free; each free
    // is judged and stored in its own store-lock turn. True when any was stored.
    const freeEach = async (list: Array<{ scope: string; digest: string; hold: string }>, free: (scope: string, digest: string, hold: string) => Promise<boolean>): Promise<boolean> =>
      (await Promise.all(list.map((c) => free(c.scope, c.digest, c.hold)))).some(Boolean);
    const settle = useCallback(async (vars?: V, hold?: string): Promise<boolean> => {
      // Only this key's own change: a Dismiss here never frees another page's change sharing the lock.
      if (vars !== undefined) return ownOnly(vars, hold as string, false, false, (sc, dg, w) => release(sc, dg, hold as string, w));
      return freeEach(ownChanges(false), (sc, dg, h) => release(sc, dg, h, { by: senderOf() }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digestOf]);
    // The person's warned Dismiss: with variables it also frees a hold that records no sender (nobody's to prove: no
    // settle or proof frees it); without, this mount's own sends. Either frees over a live send (the person was warned).
    const dismissIt = useCallback(async (vars?: V, hold?: string): Promise<boolean> => {
      if (vars !== undefined) return ownOnly(vars, hold as string, false, true, (sc, dg, w) => release(sc, dg, hold as string, { ...w, warned: true, nobodys: true }));
      return freeEach(ownChanges(false), (sc, dg, h) => release(sc, dg, h, { by: senderOf(), warned: true }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digestOf]);
    const completeIt = useCallback(async (vars?: V, hold?: string): Promise<boolean> => {
      // With variables: that change, only while this key sent it (dropping another page's key would let it be
      // sent again under a new one).
      // A completion is the page's own proof that the change applied: the core reads that show it are read again too.
      const done = vars !== undefined
        ? await ownOnly(vars, hold as string, true, false, (sc, dg, w) => complete(sc, dg, hold as string, w))
        : await freeEach(ownChanges(true), (sc, dg, h) => complete(sc, dg, h, { by: senderOf() }));
      if (done) invalidateCore(changes[key]);
      return done;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digestOf]);
    const discardIt = useCallback(async (vars?: V, hold?: string): Promise<boolean> => {
      // A discard names what was proven not applied: the send `hold` of these variables, only this key's (a hold
      // recording no sender is freed only by the person's Dismiss), or this mount's last change while this key
      // still owns its lock with the hold it sent (another page's change of the same identity, sent after it, is
      // not that); else nothing.
      if (vars !== undefined) return ownOnly(vars, hold as string, true, false, (sc, dg, w) => discard(sc, dg, hold as string, w));
      const last = lastRef.current;
      if (!last) return false;
      const mine = sentRef.current.get(last.scope + '\u0000' + last.digest);
      const ask = mine !== undefined && senderOfLock(last.scope, last.digest) === senderOf() ? discard(last.scope, last.digest, mine, { by: senderOf() }) : null;
      lastRef.current = undefined;
      return ask ? ask : false;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [digestOf, senderOf]);
    // This key's held sends (any mount's), read now; each with the account it was read under.
    const heldRows = useCallback((): readonly HeldRow[] => {
      let account: string;
      try { account = changeOwner(); } catch { return []; }
      const def = changes[key], mine = senderOf();
      return heldOfBase(baseOf()).filter((h) => h.by === mine && h.hold !== undefined && (def?.acrossRealms || inRealm(h.realm))).map((h) => Object.freeze({ hold: h.hold as string, at: h.at, identity: h.identity, target: h.target, account }));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, senderOf]);
    // By token: found now, under the account the row was read under, only this key's send (or, for the warned
    // Dismiss, a hold recording no sender), then judged and stored in one store-lock turn under the call's context.
    const byToken = async (row: Pick<HeldRow, 'hold' | 'account'> | undefined, warned: boolean): Promise<boolean> => {
      if (!row || typeof row.hold !== 'string' || !row.hold) return false;
      let shown: string;
      try { shown = changeOwner(); } catch { return false; }
      if (row.account !== shown) return false;
      const mine = senderOf();
      const c = heldInstance(baseOf(), row.hold, false);
      if (!c || !(c.by === mine || (warned && c.by === undefined))) return false;
      return release(c.scope, c.digest, row.hold, { by: mine, owner: shown, ...(warned ? { warned: true, nobodys: true } : {}) });
    };
    const settleHeld = useCallback((row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean> => byToken(row, false), [key, senderOf]); // eslint-disable-line react-hooks/exhaustive-deps
    const dismissHeld = useCallback((row: Pick<HeldRow, 'hold' | 'account'>): Promise<boolean> => byToken(row, true), [key, senderOf]); // eslint-disable-line react-hooks/exhaustive-deps
    // isPending: a BUSY second press ends its own TanStack mutation, but the first send still owns the lock.
    const handOff = useCallback((vars: V): { n: number; vars?: V } => {
      const n = ++sendSeq.current, def = changes[key];
      sends.current.set(n, { vars, p: press(vars) });
      return def?.lockKey ? { n } : { n, vars };
    }, [press, key]);
    // A secret route's observed mutation is reset when it settles, which detaches it (gcTime 0 then drops it from the
    // cache); its outcome is kept here and shown in its place until the next send or reset().
    const secret = !!changes[key]?.route.secret;
    const [kept, setKept] = useState<{ status: 'success'; data: SourceResult<T> } | { status: 'error'; error: SourceError } | null>(null);
    // Only the newest call by invocation order (or no call, after reset()) publishes an outcome: an older call
    // settling later never replaces a newer outcome or brings back a reset one. A call made re-entrantly from
    // input() is newer than the call whose input() made it, although it reaches TanStack first.
    const callGen = useRef(0);
    // The call the observer holds now (TanStack attaches each call as it starts and detaches the one before), until
    // it settles or reset(): only that call resets the observer when it settles, so a call settling never detaches a
    // pending one (reset() itself does). A call already detached settles without resetting it.
    const attached = useRef<number | null>(null);
    // Both entry points run the call through mutateAsync and drop its `sends` entry when that promise settles;
    // mutate swallows the rejection, as TanStack's own mutate does (its onError still runs).
    type CallOpts = Parameters<typeof m.mutateAsync>[1];
    const mutateAsync = useCallback(async (vars: V, opts?: CallOpts) => {
      if (!secret) {
        const h = handOff(vars);
        try { return await m.mutateAsync(h, opts); } finally { sends.current.delete(h.n); }
      }
      const mine = ++callGen.current;
      setKept(null);
      let h: { n: number; vars?: V };
      // A press that throws puts no `sends` entry (press runs before the entry is set).
      try { h = handOff(vars); } catch (e) {
        // Nothing was attached for this call: the observer is reset only when it holds no call.
        if (mine === callGen.current) {
          setKept({ status: 'error', error: e as SourceError });
          if (attached.current === null) m.reset();
        }
        throw e;
      }
      attached.current = mine;
      try {
        const data = await m.mutateAsync(h, opts);
        if (mine === callGen.current) setKept({ status: 'success', data });
        return data;
      } catch (e) {
        if (mine === callGen.current) setKept({ status: 'error', error: e as SourceError });
        throw e;
      } finally {
        sends.current.delete(h.n);
        if (attached.current === mine) { attached.current = null; m.reset(); }
      }
    }, [m, handOff, secret]);
    const mutate = useCallback((vars: V, opts?: CallOpts) => { mutateAsync(vars, opts).catch(() => undefined); }, [mutateAsync]);
    // TanStack's reset is one bound function for the hook's life; resetIt keeps one identity too.
    const mReset = m.reset;
    const resetIt = useCallback((): void => { callGen.current++; attached.current = null; setKept(null); mReset(); }, [mReset]);
    const shown = secret && m.isIdle && kept ? {
      status: kept.status, isIdle: false, isSuccess: kept.status === 'success', isError: kept.status === 'error',
      data: kept.status === 'success' ? kept.data : undefined, error: kept.status === 'error' ? kept.error : null,
    } : {};
    return {
      ...m, ...shown, mutate, mutateAsync, reset: resetIt, variables: m.variables?.vars,
      isPending: m.isPending || busy, pending, readBack: readBackNow, settle, dismiss: dismissIt, discard: discardIt, complete: completeIt, holdOf: holdOfVars, heldByOther: heldByOtherOf, held: heldRows, settleHeld, dismissHeld,
    } as unknown as SourceMutation<T, V>;
  }

  // The mode is fixed at boot (a fixture transport or the real one), so each render runs the same hooks.
  const fixtures = (): boolean => fallback !== undefined && fixtureModeActive();
  const queryImpl = (): typeof useLiveQuery => (fixtures() ? (((key: string) => (fallback as FallbackSource).useQuery(key)) as unknown as typeof useLiveQuery) : useLiveQuery);
  const fixtureMutation = (key: string): SourceMutation<unknown, unknown> => ({ ...(fallback as FallbackSource).useMutation(key), ...FIXTURE_CONTROLS } as unknown as SourceMutation<unknown, unknown>);
  const mutationImpl = (): typeof useLiveMutation => (fixtures() ? (fixtureMutation as unknown as typeof useLiveMutation) : useLiveMutation);
  return Object.freeze({
    heldBy(key: string, h: HeldChange): 'self' | 'other' | undefined {
      return h.by === undefined ? undefined : h.by === 's:' + pageId + ':' + key ? 'self' : 'other';
    },
    useQuery<T, P = void>(key: string, params?: P, o?: { enabled?: boolean; refetchInterval?: number | false }): UseQueryResult<T, SourceError> {
      return queryImpl()<T, P>(key, params, o);
    },
    useQueries<T, P>(key: string, params: readonly P[], o?: { enabled?: boolean; refetchInterval?: number | false }): UseQueryResult<T, SourceError>[] {
      if (fixtures()) {
        const r = (fallback as FallbackSource).useQuery<T>(key) as unknown as UseQueryResult<T, SourceError>;
        return params.map(() => r);
      }
      // eslint-disable-next-line react-hooks/rules-of-hooks -- the mode is fixed at boot (see above)
      return useLiveQueries<T, P>(key, params, o);
    },
    useMutation<T, V = void>(key: string): SourceMutation<T, V> {
      return mutationImpl()<T, V>(key);
    },
    useQueryHash<P = void>(key: string, params?: P): string {
      return hashKey(optionsFor(useCore(), key, params).queryKey);
    },
    invalidate,
    readTarget: (keys?: string | readonly string[], o?: { computer?: string }) => sourceReads(pageId, keys, o),
  });
}
