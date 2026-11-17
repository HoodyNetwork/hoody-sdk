// locked.ts: useLockedChange(run, reads), the C9 lock for a change a page sends through its own call.
//
// Contract, in plain words:
//   - run(vars, idem, ctx) is the page's own send (normally api(route, {..., idem, ctx})); the hook calls it with
//     an idempotency key and the context captured at the press (send with it, never a later capture()). One send at a
//     time per change identity: a second press of the same change while it runs is not_sent (BUSY), nothing is sent.
//   - done: the reads are re-read in the background and the hook is free. failed / not_sent / stale: free again.
//     A failed run keeps its code, status and, when they are an object, its details (frozen copy): a gate decided
//     elsewhere tells the page whose decision was used.
//   - pending (may have gone through): the hook locks at once and starts a read-back. While locked every press is
//     not_sent (READ_BACK_FIRST) and only tries the read-back again; nothing is sent. The lock clears only when
//     every read answered fresh under the current context (an authoritative read, not the cache) AND `proves`
//     gives a verdict on those answers ('applied': key dropped; 'not_applied': key kept). A plain fresh read
//     proves nothing: without `proves` (or with no verdict) it stays locked until the person dismisses it
//     (dismiss(), "may have gone through"; frees only this id's own change, key kept). A failed, stale or empty
//     read-back keeps it locked. A definite refusal (4xx) of a first send is 'failed' and frees it; a refused replay
//     of a kept key proves nothing about the first send and stays pending.
//   - dismissOne(identity) is the same warned Dismiss for ONE held change: the one this id holds in the scope whose
//     recorded identity equals `identity` (Files' Copy the rest frees its own held copy, never one this
//     id holds on another computer). No match (unknown, or freed already) frees nothing and answers false.
//   - held() lists, read now, the changes dismiss() would free (this id's own and one that records no sender, in the
//     current scope), each as {identity, hold}: a warning snapshots them when it arms, and its Dismiss frees exactly
//     those with dismissOne(identity, { hold }), never a hold that came after. It changes nothing. That pairing needs
//     a lockKey: without one the lock records no identity, each row's identity is undefined and dismissOne frees
//     nothing for it (answers false), so such a warning frees with dismiss().
//   - `id` names the change: its lock and key live in changes.ts (module level), so they survive this hook's
//     unmount and remount and a realm switch; only an account change or a sign-out drops them. A change to
//     realm-owned data passes {realm: true}: its lock is filed under the realm it is sent in (another realm's
//     same change is its own, and that realm's read-back never releases it). Default: account-wide.
//   - A later run with the same variables reuses the released run's key while this tab knows the variables
//     match, so the server can tell a resend apart. Under a lockKey that digest of the variables stays in memory
//     (they may hold a password): after a reload or in another tab the run gets a new key. Without one the
//     identity digest is the variables', so the key replays there too. The stored lock names the lockKey
//     identity, never the variables.
//   - reads: QueryDefs built by defineQuery or query-key predicates (refreshFresh): both are core's network-only
//     read-back (flight), and `proves` judges exactly what those requests fetched. Any other object (a page's
//     own {refresh}) proves nothing and keeps the lock: it could hand back the cache. A read with only disabled
//     queries is skipped, a failed one keeps the lock, and at least one must answer fresh.
//   - A refused press (BUSY, READ_BACK_FIRST) never touches the running state of the send that owns the lock;
//     `state` reads the registry, so every mount of the same id sees the same running/pending/free.
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { QueryKey } from '@tanstack/react-query';
import { outcomeOf, type HubError, type Outcome } from './api';
import { newKey } from './kit';
import { alive, capture, type Ctx, type Target } from './ctx';
import { changeContext, changeOwner, discard as discardLock, frozenCopy, guarded, holdOfLock, identityOfLock, isBusy, isPending, lockBase, pendingMark, pendingOf, realmScoped, refusalOf, release, type HeldFrom } from './changes';
import { answersFor, changeRealm, changeScope, freeByVerdict, isCoreRead, proveByVerdict, LOCKKEY_THREW, readBackHold, readBackProof, readBackStates, refreshFresh, stableJson, subscribeScope, varsDigest, type CoreReadFresh, type FreshRead, type ReadBackProof, type ReadVerdict, type RefreshState } from './query';
import { routeOf, type Route } from './routes';
import { traceIdOf } from './trace-id';

export type LockedRead = { refresh(): Promise<boolean>; refreshState?(): Promise<RefreshState> } | ((k: QueryKey) => boolean);
export type LockState = 'free' | 'running' | 'pending';

export interface LockedResult<R> {
  readonly outcome: Outcome;
  readonly data?: R;
  /** The error's code (a refusal: BUSY, READ_BACK_FIRST, HELD_BY_OTHER). */
  readonly code?: string;
  /** A HELD_BY_OTHER refusal: the page whose change holds the lock (null: it named none). */
  readonly heldFrom?: HeldFrom | null;
  /** The HTTP status of a refused send (401, 429...), kept when the code is blank. */
  readonly status?: number;
  /** A refused send's wait in whole seconds (Retry-After, else a lockout's own seconds; at most a day), on 'failed'
   *  only: never on a pending answer, which may have applied. */
  readonly retryAfter?: number;
  /** The idempotency key the send used: a pending change's receipt is read with it. */
  readonly idem?: string;
  /** A definite refusal's details (the agent's error details, e.g. a gate decided elsewhere: request_id,
   *  decision), as a deep-frozen plain copy; only for outcome 'failed' and only when they are an object. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** A sent call that did not end 'done': the API's trace id of its answer, when it carried one (error details). */
  readonly traceId?: string;
  /** A sent call that did not end 'done': its declared route, "METHOD /template", when the run went through api(). */
  readonly route?: string;
  /** The person answered Cancel to the 2FA code prompt: the API refused the send before applying anything and no code
   *  went out. Only with outcome 'not_sent' and no code, and only for a hook that set `quietCancel`; nothing is held.
   *  Say nothing: the form stays as it was. */
  readonly cancelled?: true;
}

export interface LockedChange<V, R> {
  run(vars: V): Promise<LockedResult<R>>;
  /** Re-reads every read; true only when all answered fresh and `proves` freed every change this id holds (or
   *  nothing was pending). With `only.hold` (the send a band shows): only this id's change holding that token is
   *  judged and freed, never another hold of the scope; true only when this read proved that send applied and its
   *  free was stored, never from nothing pending (a hold dismissed or replaced while the read was out); none such:
   *  false. `only.proof.notApplied` turns true only when this read proved that send NOT made and stored its release
   *  (query.ts readBackProof); a false answer alone never says so. */
  readBack(only?: { hold: string; proof?: ReadBackProof }): Promise<boolean>;
  /** The person's explicit, warned Dismiss ("may have gone through"; check before sending again): frees every change
   *  this id holds in the current scope, never another page's under a shared lock. The key stays. Each free is
   *  judged and stored in its own store-lock turn, so the hold leaves once that write lands. True once every
   *  free it asked for was stored (nothing to free: true); false when one was refused or could not be stored (that
   *  hold stays shown): a page clears its own state only on true. */
  dismiss(): Promise<boolean>;
  /** The person's explicit, warned Dismiss of ONE held change: the one this id holds in the current scope whose
   *  recorded identity (LockedOptions.identity, as heldChanges shows it) equals `identity`; every other change stays
   *  held, this id's on other locks (another computer) included, and never another page's. Same free as dismiss() (its
   *  own store-lock turn, key kept). True once that free was stored; false when nothing held matches (an unknown
   *  identity, or one freed already) or the free was refused or could not be stored. `only.hold`: free it only while
   *  it is still that shown send (heldChanges' hold), never a later send of the same identity. `only.transition`: told
   *  whether THIS call freed a pending hold (changes.ts SettleAsk.transition): true answers also a hold already freed
   *  in another tab. */
  dismissOne(identity: unknown, only?: { readonly hold?: string; readonly transition?: { own: boolean } }): Promise<boolean>;
  /** The changes dismiss() would free now (this id's own and one that records no sender, in the current scope), as
   *  {identity, hold}: `identity` is the recorded identity (LockedOptions.identity, else the lockKey value; a deep-frozen
   *  copy; undefined without a lockKey) and `hold` that very send's token. Read when a warning arms, then passed back to
   *  dismissOne(identity, { hold }) so a Dismiss frees what it showed and nothing sent later. Reads only; not a
   *  subscription (re-read it on a render). The dismissOne pairing needs a lockKey: without one the lock records no
   *  identity, each row's identity is undefined and dismissOne frees nothing for it, so such a warning frees with
   *  dismiss(). */
  held(): ReadonlyArray<{ readonly identity: unknown; readonly hold: string }>;
  /** The page proved its own change was NOT applied (e.g. its receipt says so): drops this id's changes in the
   *  current scope, lock and key (the next run is a new request with a new key). Never another page's. */
  discard(): void;
  /** 'pending' until a read-back proves it or the person dismisses it; render "may have gone through" and a Check
   *  again button from it. */
  readonly state: LockState;
  /** Whose change holds the lock in the current scope: 'self' while this id has a pending change there (its
   *  dismiss() frees it), 'other' while only another page's change sharing the lock does (dismiss() here frees
   *  nothing: that page's Check again or Dismiss does), undefined while nothing is pending. */
  readonly heldBy: 'self' | 'other' | undefined;
  /** The last run's result, as run() answered it (without `data` for a change with LockedOptions.secret). */
  readonly last?: LockedResult<R>;
}

/** A result as `last` keeps it for a secret answer: everything but `data`. */
function withoutData<R>(r: LockedResult<R>): LockedResult<R> {
  const { data: _data, ...rest } = r;
  return rest;
}

// Re-reads every read (enabled queries only, with a request sent now): what each one fetched, or null when one
// failed or none answered (no reads: null).
const FAILED: FreshRead = { state: 'failed', answers: [] };
async function freshAll(reads: readonly LockedRead[], realm: string | null = null): Promise<FreshRead[] | null> {
  if (!reads.length) return null;
  const one = (r: LockedRead): Promise<FreshRead> => {
    if (typeof r === 'function') return refreshFresh(r);
    // A core read re-reads only its instances that can show a change of `realm` (keyReadsRealm); a page's own
    // query-key predicate is the page's match.
    if (isCoreRead(r)) return (r as unknown as CoreReadFresh).fresh(undefined, realm).catch((): FreshRead => FAILED);
    return Promise.resolve(FAILED);
  };
  const fresh = await Promise.all(reads.map(one));
  return readBackStates(fresh.map((f) => f.state)) ? fresh : null;
}
/** Re-reads every read (enabled queries only, with a request sent now); true when none failed and one answered. */
export async function readBackAll(reads: readonly LockedRead[]): Promise<boolean> {
  return (await freshAll(reads)) !== null;
}

export interface LockedOptions<V> {
  /** File the lock under the realm it is sent in (realm-owned data). Default: account-wide. */
  realm?: boolean;
  /** A lock shared with defineMutation / coreSource changes of the same name (their `lock`): the same base
   *  ('lock:' + name), so a pending send on one page shows and holds on the others. With a shared lock give a
   *  lockKey whose value equals theirs (e.g. `() => ({})` for a change without identity variables). */
  lock?: string;
  /** The change's identity (default: all its variables). A create locked by {bot} and not its label: while one
   *  may have gone through, another label for the same bot is refused too (READ_BACK_FIRST). A key is replayed
   *  only for the same variables; other bytes after a release are a new request with a new key. */
  lockKey?: (vars: V) => unknown;
  /** With a shared `lock`: the route the sharing defineMutation / coreSource change sends. The scope then
   *  follows the same rule as theirs (query.ts changeScope: the computer for a kit or agent route, the realm it
   *  sends for an agent or realm-host route), so both exclude each other; `realm` is ignored. */
  route?: Route;
  /** With an agent `route`: the realm every call of this hook names (its input.realm), when the page acts in a realm of
   *  its own (e.g. a computer's Global under All realms). The lock is filed and recorded under the realm the call is
   *  sent in (query.ts changeScope, changeRealm with this realm, as a source change naming its realm), so its hold
   *  shows in that realm (heldChanges) and its read-back reads that realm. Default: the context's realm. */
  sentIn?: string;
  /** With a lockKey: what the held change records as its identity for `proves` (default: the lockKey value). */
  identity?: (vars: V) => unknown;
  /** What a fresh read-back proves (query.ts MutationOpts.proves): `answers[i]` holds what reads[i]'s requests
   *  fetched in this read-back (a QueryDef's enabled instances, or the queries a predicate matches), only this
   *  account's and generation's, in the change's realm, and never another computer's than the change's (for a
   *  change on a computer, a predicate's key that names no computer proves nothing about it). Without it no read frees the change: only dismiss() or a definite refusal does. */
  proves?: (identity: unknown, answers: readonly (readonly unknown[])[]) => ReadVerdict;
  /** The page id that sends this change (e.g. 'home'): a page sharing the lock links there (HeldChange.from,
   *  a HELD_BY_OTHER refusal's heldFrom). */
  page?: string;
  /** Opt in: the person's own Cancel of the 2FA code prompt answers { outcome: 'not_sent', cancelled: true } (the page
   *  says nothing). Without it a cancelled prompt answers 'failed', as it always did. */
  quietCancel?: boolean;
  /** The answer may carry a secret (a minted key): `last` keeps the outcome and codes, never `data`, so the one copy is
   *  the one run() hands back, which the page wipes. Without it `last` keeps `data` too. */
  secret?: boolean;
}

export function useLockedChange<V, R>(
  run: (vars: V, idem: string, ctx: Ctx) => Promise<R>, reads: readonly LockedRead[], id?: string, o?: LockedOptions<V>,
): LockedChange<V, R> {
  // The lock and key of each change live in changes.ts under ('l:' + id, identity digest): they survive this
  // hook (unmount, remount, a closed sheet, a realm switch) and go only on an account change or a sign-out.
  // Without an id the scope is this mount's own (lost on unmount): every page passes one.
  const own = useRef('m' + newKey());
  const base = o?.lock ? lockBase(o.lock) : 'l:' + (id ?? own.current);
  const realm = o?.realm === true;
  const route = o?.route;
  const sentIn = o?.sentIn;
  const page = o?.page;
  // This hook's id, as the sender its locks record: its read-back frees only what it sent itself. With a page,
  // 'l:<page>:<id>': stable across a reload and a second tab, and distinct per page under a shared lock.
  const sender = 'l:' + (page ? page + ':' : '') + (id ?? own.current);
  const scope = useCallback((): string => (route ? changeScope(base, route, null, sentIn) : realm ? realmScoped(base) : base), [base, realm, route, sentIn]);
  const [last, setLast] = useState<LockedResult<R> | undefined>(undefined);
  // subscribeScope: a computer or realm switch moves scope() too (a route's changeScope), not only a lock change.
  const pending = useSyncExternalStore(subscribeScope, () => isPending(scope()), () => isPending(scope()));
  const heldOf = (): 'self' | 'other' | undefined => {
    const sc = scope();
    let other = false;
    for (const c of pendingOf(base)) if (c.scope === sc) { if (c.by === sender) return 'self'; other = true; }
    return other ? 'other' : undefined;
  };
  const heldBy = useSyncExternalStore(subscribeScope, heldOf, heldOf);
  const running = useSyncExternalStore(subscribeScope, () => isBusy(scope()), () => isBusy(scope()));
  const runRef = useRef(run);
  runRef.current = run;
  const readsRef = useRef(reads);
  readsRef.current = reads;
  const lockKeyRef = useRef(o?.lockKey);
  lockKeyRef.current = o?.lockKey;
  const identityRef = useRef(o?.identity);
  identityRef.current = o?.identity;
  const provesRef = useRef(o?.proves);
  const quietCancelRef = useRef(o?.quietCancel === true);
  quietCancelRef.current = o?.quietCancel === true;
  const secretRef = useRef(o?.secret === true);
  secretRef.current = o?.secret === true;
  provesRef.current = o?.proves;

  // The scope is read once, when the read-back starts: the reads are that realm's, so a realm switch during
  // the read never releases the other realm's change (the read then fails: its flight's generation moved).
  // Only `proves` frees a change, and only one THIS id sent: another page's change under a shared lock was not
  // judged by these reads, so it stays held until its own sender proves it or the person dismisses it. proves
  // judges what the read-back fetched (answersFor: the change's computer and realm), never the cache afterwards.
  const readBack = useCallback(async (only?: { hold: string; proof?: ReadBackProof }): Promise<boolean> => {
    const sc = scope();
    // With `only.hold`: the one change of this id in the scope holding that token, chosen before the read (none:
    // nothing to read back here). Only that send is judged, by its own guarded free: a hold released or replaced while
    // the read was out is not what it read (false).
    const hold = readBackHold(only);
    // `only.proof`: told when this read proved that send NOT made and freed it (query.ts readBackProof).
    const proof = readBackProof(only);
    const mine = (c: { scope: string; by?: string }): boolean => c.scope === sc && c.by === sender;
    const sel = hold !== undefined ? pendingOf(base).find((c) => mine(c) && holdOfLock(sc, c.digest) === hold) : undefined;
    if (hold !== undefined && !sel) return false;
    // A bare read-back with nothing pending has nothing to prove (true); a hold-scoped one answers only from its proof.
    if (hold === undefined && !isPending(sc)) return true;
    // The sends these reads judge and the account, taken before the await: a later incarnation of a change (another
    // tab's, a reload's) and another account's changes are not what they read.
    const start = pendingMark(), who = changeOwner(), ctx = changeContext();
    const holds = new Map(pendingOf(base).filter((c) => c.scope === sc).map((c) => [c.digest, holdOfLock(sc, c.digest)] as const));
    // The realm the judged changes were sent in, when they share one (a realm lock's scope holds one realm): only the
    // core reads' instances that can show it are re-read. Mixed or none recorded: every instance, as before.
    const realms = new Set(sel ? [sel.realm] : pendingOf(base).filter(mine).map((c) => c.realm));
    const fresh = await freshAll(readsRef.current, realms.size === 1 ? [...realms][0]! : null);
    if (!fresh || sc !== scope() || changeOwner() !== who) return false;
    const proves = provesRef.current;
    if (!proves) return false;
    // Each free is judged and stored in its own store-lock turn (changes.ts settleChange): one refused or not stored
    // (its outcome moved since the read began, another tab sending it) answers false.
    const verdictOf = (c: { digest: string; target: unknown; realm: string | null }): ReadVerdict => {
      const t = (c.target as Target | null) ?? null;
      try { return proves(identityOfLock(sc, c.digest), fresh.map((f, i) => answersFor(f, t, c.realm, typeof readsRef.current[i] === 'function'))); } catch { return undefined; }
    };
    // The shown send: true only when this read proved exactly it (proveByVerdict), never from nothing pending.
    if (sel && hold !== undefined) return holdOfLock(sc, sel.digest) === hold ? proveByVerdict(sc, sel.digest, holds.get(sel.digest), hold, start, verdictOf(sel), sender, ctx, proof) : false;
    const asks: Array<Promise<boolean>> = [];
    for (const c of pendingOf(base)) {
      if (!mine(c)) continue;
      asks.push(freeByVerdict(sc, c.digest, holds.get(c.digest), start, verdictOf(c), sender, ctx));
    }
    const ok = (await Promise.all(asks)).every(Boolean);
    return ok && !isPending(sc);
  }, [scope, base, sender]);

  // The person's warned Dismiss: this id's own changes, and one that records no sender (nobody's to prove: no
  // read-back frees it).
  const dismiss = useCallback(async (): Promise<boolean> => {
    const sc = scope();
    const asks: Array<Promise<boolean>> = [];
    for (const c of pendingOf(base)) {
      if (c.scope !== sc || !(c.by === sender || c.by === undefined)) continue;
      // Read in the same synchronous step that asks for its free (judged again in its store-lock turn).
      const now = holdOfLock(sc, c.digest);
      if (now !== undefined) asks.push(release(sc, c.digest, now, { warned: true, by: sender, nobodys: true }));
    }
    return (await Promise.all(asks)).every(Boolean);
  }, [scope, base, sender]);

  // The same selection as dismiss(), read now: identity and hold of each, nothing freed.
  const held = useCallback((): ReadonlyArray<{ readonly identity: unknown; readonly hold: string }> => {
    const sc = scope();
    const out: Array<{ readonly identity: unknown; readonly hold: string }> = [];
    for (const c of pendingOf(base)) {
      if (c.scope !== sc || !(c.by === sender || c.by === undefined)) continue;
      const hold = holdOfLock(sc, c.digest);
      if (hold !== undefined) out.push(Object.freeze({ identity: frozenCopy(identityOfLock(sc, c.digest)), hold }));
    }
    return Object.freeze(out);
  }, [scope, base, sender]);

  const dismissOne = useCallback(async (identity: unknown, only?: { readonly hold?: string; readonly transition?: { own: boolean } }): Promise<boolean> => {
    const sc = scope();
    // Compared as stable JSON (key order free). No identity (no text) never matches, on either side.
    const want = stableJson(identity);
    if (!want) return false;
    for (const c of pendingOf(base)) {
      if (c.scope !== sc || !(c.by === sender || c.by === undefined)) continue;
      if (stableJson(identityOfLock(sc, c.digest)) !== want) continue;
      // Read in the same synchronous step that asks for its free (judged again in its store-lock turn).
      const now = holdOfLock(sc, c.digest);
      if (now === undefined || (only?.hold !== undefined && now !== only.hold)) return false;
      return release(sc, c.digest, now, { warned: true, by: sender, nobodys: true, ...(only?.transition ? { transition: only.transition } : {}) });
    }
    return false;
  }, [scope, base, sender]);

  // The sends this mount made that went pending, by lock (scope, digest), with their incarnation: a proof that
  // one did not apply (discard) concerns that send, never a later one of the same change.
  const sentRef = useRef(new Map<string, string>());
  const discard = useCallback((): void => {
    const sc = scope();
    for (const c of pendingOf(base, { kept: true })) {
      if (c.scope !== sc || c.by !== sender) continue;
      const mine = sentRef.current.get(sc + '\u0000' + c.digest);
      if (mine !== undefined && mine === holdOfLock(sc, c.digest)) void discardLock(sc, c.digest, mine, { by: sender });
    }
  }, [scope, base, sender]);

  const go = useCallback(async (vars: V): Promise<LockedResult<R>> => {
    // The scope and the context are taken at the press, before the digest is awaited: a realm switch meanwhile
    // never moves the lock, and run sends with the press's context (pass it to api as `ctx`).
    const sc = scope();
    const ctx = capture();
    // The account the press was made in: the hold this send leaves is recorded only while it is still shown.
    const who = changeOwner();
    // The realm the lock records, taken at the press with the scope (never after the digests are awaited).
    const routeRealm = route ? changeRealm(route, sentIn) : undefined;
    const lk = lockKeyRef.current;
    // A lockKey that throws refuses the press (INPUT_INVALID, nothing sent): its identity is unknown, so an older
    // build's hold of the same change (stored under another digest) could not be found. It is
    // never replaced by the variables (they may hold a secret it leaves out).
    let ident: unknown = vars;
    if (lk) { try { ident = lk(vars); } catch { ident = LOCKKEY_THREW; } }
    if (ident === LOCKKEY_THREW) return { outcome: 'not_sent', code: 'INPUT_INVALID' };
    // What heldChanges() shows: identity(), else (or when it throws) the lockKey value taken above (the lockKey
    // never runs twice).
    let shown: unknown = ident;
    if (lk && identityRef.current) { try { shown = identityRef.current(vars); } catch { shown = ident; } }
    // Both digests are asked for now (they resolve in call order).
    const dp = varsDigest(ident), bp = lk ? varsDigest(vars) : undefined;
    const d = await dp, bytes = bp ? await bp : undefined;
    // The context may have moved while the digests were awaited (an account change, a sign-out, a realm
    // switch): the press is stale and nothing is sent, so the change never goes out in the new context.
    if (!alive(ctx)) { const out: LockedResult<R> = { outcome: 'stale' }; setLast(out); return out; }
    // This hook's own pending change: read back (nothing is sent). Another sender's (HELD_BY_OTHER) is named,
    // never read back here; a press while its own send runs is left to guarded (BUSY).
    const no = refusalOf(sc, d, sender);
    if (no && no.code !== 'BUSY') {
      if (no.code === 'READ_BACK_FIRST') void readBack();
      return { outcome: 'not_sent', code: no.code, ...(no.heldFrom !== undefined ? { heldFrom: no.heldFrom } : {}) };
    }
    let data: R | undefined;
    const res = await guarded(sc, d, async (replayKey) => {
      const idem = replayKey ?? newKey();
      // Checked again right before the send (guarded runs it at once, but the rule holds after every await). Nothing
      // went out: not_sent, as api() answers an unsent call on a dead context.
      if (!alive(ctx)) return { outcome: 'not_sent' as Outcome };
      try {
        data = await runRef.current(vars, idem, ctx);
        return { outcome: 'done' as Outcome, idem };
      } catch (e) {
        const code = typeof (e as HubError | null)?.code === 'string' ? ((e as HubError).code as string) : undefined;
        const status = typeof (e as HubError | null)?.status === 'number' ? ((e as HubError).status as number) : undefined;
        const outcome = outcomeOf(e, true);
        // The 2FA prompt answered Cancel while the context lives (api() leaves `cancelled` on a definite refusal only;
        // once the context died the same answer is pending or stale, never 'failed').
        const cancelled = outcome === 'failed' && (e as HubError | null)?.cancelled === true;
        const raw = (e as { details?: unknown } | null)?.details;
        const details = outcome === 'failed' && raw && typeof raw === 'object' && !Array.isArray(raw) ? (frozenCopy(raw) as Readonly<Record<string, unknown>>) : undefined;
        const traceId = traceIdOf((e as HubError | null)?.traceId), route = routeOf((e as HubError | null)?.route);
        const ra = (e as HubError | null)?.retryAfter;
        const retryAfter = outcome === 'failed' && typeof ra === 'number' && Number.isFinite(ra) && ra >= 0 ? Math.min(Math.ceil(ra), 86400) : undefined;
        return { outcome, idem, ...(retryAfter !== undefined ? { retryAfter } : {}), ...(code ? { code } : {}), ...(status !== undefined ? { status } : {}), ...(details ? { details } : {}), ...(traceId ? { traceId } : {}), ...(route ? { route } : {}), ...(cancelled ? { cancelled: true as const } : {}) };
      }
    }, { base, target: route && (route.scope === 'agent' || route.scope === 'kit') ? ctx.target : null, realm: routeRealm !== undefined ? routeRealm : realm ? ctx.realm : null, by: sender, across: false, ...(page ? { page } : {}), ...(lk ? { identity: shown } : {}) }, bytes, newKey());
    let out: LockedResult<R>;
    const idem = (res as { idem?: string }).idem;
    // The hold this send left, as guarded stamped it when it settled (MutationResult.hold): only a pending answer
    // leaves one, and it is recorded only while the account the press was made in is still shown. Never a lock
    // lookup after the await: that names whoever holds the lock now (another account's, or a later send).
    const hold = res.outcome === 'pending' && changeOwner() === who ? (res as { hold?: string }).hold : undefined;
    if (hold !== undefined) sentRef.current.set(sc + '\u0000' + d, hold);
    if (res.outcome === 'done') {
      void readBackAll(readsRef.current);
      out = { outcome: 'done', ...(data === undefined ? {} : { data }), ...(idem ? { idem } : {}) };
    } else if (quietCancelRef.current && res.outcome === 'failed' && (res as { cancelled?: boolean }).cancelled === true) {
      // Only for a page that asked (quietCancel): the person's own Cancel of the 2FA prompt is not a failure. guarded judged this send as 'failed' (its key is
      // spent and dropped; a replay of a kept key was turned 'pending' there and never reaches this branch), so the
      // lock is free; the page is told nothing was sent and that the person cancelled.
      out = { outcome: 'not_sent', cancelled: true };
    } else {
      if (res.outcome === 'pending') void readBack();
      const { code, status, details, heldFrom, traceId, route, retryAfter } = res as { code?: string; status?: number; details?: Readonly<Record<string, unknown>>; heldFrom?: HeldFrom | null; traceId?: string; route?: string; retryAfter?: number };
      out = { outcome: res.outcome, ...(code ? { code } : {}), ...(status !== undefined ? { status } : {}), ...(res.outcome === 'failed' && retryAfter !== undefined ? { retryAfter } : {}), ...(res.outcome === 'pending' && idem ? { idem } : {}), ...(res.outcome === 'failed' && details ? { details } : {}), ...(heldFrom !== undefined ? { heldFrom } : {}), ...(traceId ? { traceId } : {}), ...(route ? { route } : {}) };
    }
    setLast(secretRef.current ? withoutData(out) : out);
    return out;
  }, [readBack, scope, base, realm, route, sentIn, sender, page]);

  const state: LockState = running ? 'running' : pending ? 'pending' : 'free';
  return { run: go, readBack, dismiss, dismissOne, held, discard, state, heldBy, last };
}
