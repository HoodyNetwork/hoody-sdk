// The Board's data: the selected realm's Boards, kept per account and realm.
//
// Contract, in plain words:
//   - useBoards() reads hub_boards_v1 through core's accountPref (scope account+realm, part = the selected realm,
//     'all' included; kept at sign-out, never readable by another account). Switching realm or account, or a
//     Forget on this browser, switches the Board set and drops this tab's undo; a change made before the Forget is
//     never stored. ready is false while the signed-in account is not known (boot): the view
//     waits on its skeleton.
//   - apply(op) runs a model operation and WRITES AT ONCE, under the account the page shows (core's bound setter):
//     no change waits in a timer, so a sign-out, an account switch or a closed tab right after a change neither
//     loses it nor lands it under another account. A refusal changes nothing and comes back to the caller. Layout
//     changes ({record: label}) enter the active Board's 10-step undo (per Board, never saved); undo() puts that
//     Board back. op's second argument (held) is every tile id this tab has seen this session (each op's Boards
//     before it runs; never shrinking): a new tile's id avoids them, so an undo never puts back an id given since.
//     applyFresh(op) is apply(op) run on this tab's state merged first with what another tab stored, held
//     or not (as apply's own write merges it), for an op that must see every Board before it chooses (a new
//     terminal's number); a merge that needs writing is written even when the op changes nothing. held says
//     whether a hold is on (state, so a release re-renders) and isHeld() reads it at once (hold() sets it before any
//     render): such work checks isHeld() and waits for the release instead of merging under a drag or a rename.
//   - Two tabs merge by Board id (model/merge.ts). Each write first reads the value stored now; when another tab
//     wrote since this tab last saw it, the write is the three-way merge, never a whole-blob clobber. Another tab's
//     write (storage event) is merged in the same way, unless the view holds the state (hold(true) during a drag or
//     a rename: it is merged at release). A Board both tabs changed takes the other tab's version here, and so does
//     one this tab was still working on (it had undo steps): notice {kind: 'other', name}. The open Board deleted there: notice {kind: 'deleted', name}, the first Board opens. Each
//     clears after OTHER_TAB_NOTICE_MS or at the next change. Boards the other tab changed lose their undo steps
//     here; undoStale then says the active Board's undo went that way. The merge base is always the last value
//     stored: while this tab's own write is on its way ('saving') or refused and kept for a retry ('unsaved'), what
//     core shows is that write, and it is never taken as a base (a refused change then meets another tab's write as
//     a change of this tab, not as already stored).
//   - applyLocked(op) (program boards, and every new Board) commits against the
//     latest stored value, never leaving a new Board to the two-tab merge (which keeps both tabs' new Boards, and the
//     load then drops those past nine). Under the cross-tab lock hub_boards_add:<account>:<realm>, once no write of
//     this tab is on its way, it folds in what is stored, runs op on that, stores, and keeps the lock until the store
//     answers. Another tab stored first ('conflict'): this tab goes back to the value it read, folds the winner's in
//     and runs op again (so the caps and the program board's lookup are checked again), at most LOCK_ROUNDS more times.
//     op takes the commit's own random source: every round draws the same numbers, so a round that takes the same
//     path makes the same Board and slot ids, and an edit that names one of them still names it in the next round (a
//     round on a changed stored value may reuse a slot or an id instead: such an edit is then skipped).
//     While it runs, another tab's write waits as under a hold, and this tab's own edits (apply) are queued on it:
//     shown at once, made again after op in every round (each on the Board it was made on, a Board op made included;
//     on a value without that Board, only its change elsewhere stays, such as keep loaded; so too for a Board another
//     tab deleted, and the notice says it was deleted there), and stored with the commit's value, or when it ends
//     (also when it adds nothing).
//     Its own stored value is then the merge base, so an edit made after it is never taken for another tab's change.
//     Undo waits until it ends. The commit belongs to the scope it began in: after a realm, account or Forget switch
//     it touches nothing (every wait is followed by a scope check), edits there are ordinary
//     edits of that scope, and the scope coming back does not give it back, nor does a lock granted after it went.
//     Answers null (done; a write the browser refused stays in this page with the 'unsaved' notice, as every write),
//     op's refusal (nothing changed), NOT_ADDED (nothing was written: no lock, a stored value that cannot be used (what
//     the hook did about it stands, and the queued edits go with it), the scope changed before the store, a lost race
//     seen after it changed, or the rounds ran out), or NOT_KNOWN (C9: the store was accepted but its outcome not seen:
//     still on its way after STORE_WAIT_MS, or its owner gone before the answer (sign-out, another account, a realm
//     switch: core's alive()), after which the status read is another slot's. Nothing is rolled back; a later merge
//     reconciles it like any write).
//   - A merge never keeps more than nine Boards (merge.ts): a new Board of this tab not yet stored gives way first
//     (notice {kind: 'capped', name}), then a Board another tab deleted that this tab had changed (the delete stands:
//     notice {kind: 'deleted', name}).
//   - useStoredBoards() → the selected realm's Boards as core shows them (the left menu's count, navCount.ts): it
//     writes nothing of its own, merges nothing and reads no network; its reads go through core's pref get(), which
//     (for every reader of it, this page's included) may retry this account's own refused write or migrate a plaintext
//     value. null while nobody is signed in, while they open ('loading'), while the stored value cannot be used here
//     (core's reset reason, watched on its own like useBoards does, or a value parse could not read), and while core
//     says 'oversized' unless what it shows is this page's own copy of a Board write it refused (core's pageCopy,
//     watched on its own): core reports 'oversized' ahead of 'loading' and for an old stored value over its limit,
//     so without that copy the value shown is not proven. A page copy is shown as the page shows it, whatever the
//     write was refused for. A storage read the browser refuses outright reads as nothing stored (core does not
//     tell it apart yet).
//   - notice: what parse found ({kind: 'reset' | 'boards' | 'tile'}), {kind: 'unsaved'} while the store says the
//     browser refused the last store (core status 'unsaved': set() answers true and stores in the background) or a
//     write stayed in this page ('page'), until a store succeeds, or a two-tab notice.
//   - Encrypted prefs (core cryptStore): ready is also false while the account's saved preferences open (status
//     'loading'): nothing is editable, so a Board built from defaults never replaces the saved one. A saved value
//     that does not open on this browser (status 'locked') is an unreadable notice like the kit-io resets below,
//     and Boards already shown from it (its key went in a rotation or a Forget) are dropped at once, held or not:
//     working state, undo and the merge base go, and lockGen moves so the view drops its dialogs and drags (the
//     rename draft included). The view shows a fresh realm and writes nothing until the user's next change.
//   - No silent loss (core kit-io): a stored value core could not use reads as a fresh realm with notice
//     {kind: 'unreadable', reason: 'foreign' | 'malformed' | 'oversized'}. Its bytes stay until this account's next
//     change replaces them; a storage event bringing one in (or a value parse resets) merges nothing and writes
//     nothing: only a user change writes. A write that evicted other entries under core's caps, or replaced another
//     Hub version's layout, says so: {kind: 'evicted', accounts, parts} or {kind: 'replaced'}. These stay until
//     dismissed.
import { accountForgets, accountPref, prefsGeneration, alive, capture, useAccountForgets, useCore, useRealms, type AccountPref, type CryptRead, type PrefReport, type PrefWrite, type StoreReset } from '@core';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { activeBoard, allTids, isRefusal, lastStep, recordStep, undoStep, type Board, type BoardUndo, type UndoStep, type Rand, type Refusal, type RealmBoards } from './model/boards';
import { merge } from './model/merge';
import { parseRealmBoards, toStored, type Loaded, type LoadNotice } from './model/persist';
import { browserLocks } from './locks.web';

export const BOARDS_KEY = 'hub_boards_v1';
export const OTHER_TAB_NOTICE_MS = 6000;
/** Rounds a locked commit runs again after another tab stored first (as core's reapplied updates, prefs.ts). */
export const LOCK_ROUNDS = 3;
/** How long a locked commit waits for a store to answer before it gives up (it never holds the lock past this). */
export const STORE_WAIT_MS = 10_000;
/** A locked commit that added nothing for a reason of its own (see the contract). */
export const NOT_ADDED = { refused: 'NOT_ADDED' } as const;
/** A locked commit whose store was accepted but whose outcome was not seen (see the contract): C9 unknown, never "added"
 *  or "not added". What it showed stays; a later merge reconciles it like any write (never past nine Boards). */
export const NOT_KNOWN = { refused: 'NOT_KNOWN' } as const;
export type LockedRefusal = Refusal | typeof NOT_ADDED | typeof NOT_KNOWN;
/** An edit refused while another tab's value opens here: nothing changed; the 'updating' notice says
 *  so, and edits work again once that value opens (or stops opening). */
export const UPDATING = { refused: 'UPDATING' } as const;
const parse = (raw: unknown): Loaded => parseRealmBoards(raw);
// One pref object, so the subscription and the reads before a write share its cache (same stored text, same object).
// Made again for a new preference session (prefsGeneration): one kept from a disposed session reads its old store.
let prefOnce: { gen: number; pref: AccountPref<Loaded> } | null = null;
const pref = (): AccountPref<Loaded> => {
  const gen = prefsGeneration();
  if (prefOnce?.gen !== gen) prefOnce = { gen, pref: accountPref<Loaded>(BOARDS_KEY, parse, { scope: 'account+realm', keepAtSignOut: true }) };
  return prefOnce.pref;
};
const text = (s: RealmBoards): string => JSON.stringify(toStored(s));
/** Tests only: a new page (with core's resetPrefs): the pref object is made again. */
export function resetBoardsForTests(): void { prefOnce = null; }

export type BoardsNotice =
  | LoadNotice
  | { readonly kind: 'unsaved' | 'replaced' | 'updating' }
  | { readonly kind: 'other' | 'deleted' | 'capped'; readonly name: string }
  | { readonly kind: 'unreadable'; readonly reason: Unusable }
  | { readonly kind: 'evicted'; readonly accounts: number; readonly parts: number };

/** What core could not use in the stored value for this realm (only a fresh read can be one). */
/** Why a stored value core keeps could not be used here: a kit-io reset, or core status 'locked' (it does not
 *  open on this browser) or 'oversized' (over the encrypted store's limit). */
export type Unusable = StoreReset | 'locked';
const storeReset = (loaded: Loaded, realm: string): Unusable | null => {
  if (!loaded.fresh) return null;
  const st = pref().status(realm);
  return pref().reset(realm) ?? (st === 'locked' ? 'locked' : st === 'oversized' ? 'oversized' : null);
};
const loadNotice = (loaded: Loaded, realm: string): BoardsNotice => {
  if (loaded.notice) return loaded.notice;
  const reason = storeReset(loaded, realm);
  return reason ? { kind: 'unreadable', reason } : null;
};
/** What a stored write did to other entries, as a notice; null when it touched none. */
export function writeNotice(r: PrefReport): BoardsNotice {
  if (r.replacedForeign) return { kind: 'replaced' };
  return r.evicted.accounts || r.evicted.parts ? { kind: 'evicted', accounts: r.evicted.accounts, parts: r.evicted.parts } : null;
}

/** applyLocked's options. `clearUndoIds` (the cross-Board move): the Boards whose undo steps go when op's value is shown, read then
 *  (a cross-Board move: an undo step of either Board would put the moved tile back while the other still holds it).
 *  `onEnd`: called once as the commit ends, before it answers: true only when op's value was stored
 *  and its store answered 'ok' (the write is durable), with its owner alive and no Forget since it began; a page-only or
 *  refused write, an unknown outcome or no write is false. `untouched` (close): a Board id; an edit of this tab queued on
 *  that Board during the commit refuses it with NOT_ADDED (op never sees queued edits). Restore waits on it before it removes the entry from Closed Boards. */
export interface LockedOpts { readonly record?: string; readonly made?: () => Board | undefined; readonly clearUndoIds?: () => readonly string[]; readonly onEnd?: (durable: boolean) => void; readonly untouched?: string }

export interface BoardsApi {
  /** false until the signed-in account is known and its Boards for this realm have been read once. A background read
   *  after that (another tab's value opening: core says 'loading') keeps the last Boards shown and ready true, so open
   *  dialogs and drags stay; only a realm, account or Forget switch reads first again. */
  readonly ready: boolean;
  readonly realm: string;
  readonly state: RealmBoards;
  readonly notice: BoardsNotice;
  /** The label of the active Board's last undoable change, or null. */
  readonly undoLabel: string | null;
  /** The active Board's undo steps were dropped because another tab changed it. */
  readonly undoStale: boolean;
  /** UPDATING (nothing changed) when op would change the Boards while another tab's value opens (`refreshing`). */
  apply(op: (s: RealmBoards, held: ReadonlySet<string>) => RealmBoards | Refusal, o?: { record?: string }): Refusal | typeof UPDATING | null;
  /** apply(op) on the state merged first with what another tab stored (see the contract). */
  applyFresh(op: (s: RealmBoards, held: ReadonlySet<string>) => RealmBoards | Refusal, o?: { record?: string }): Refusal | typeof UPDATING | null;
  /** op committed against the latest stored value under the cross-tab lock (see the contract). The undo step, when
   *  recorded, is the Board op leaves active, as it was before. `stored` is the round's stored value as read, before
   *  this tab's state is folded in (the fold keeps a Board this tab changed over another tab's delete; its tombstone
   *  is in `stored.gone`). */
  applyLocked(op: (s: RealmBoards, rand: Rand, held: ReadonlySet<string>, stored: RealmBoards) => RealmBoards | Refusal, o?: LockedOpts): Promise<LockedRefusal | null>;
  /** Does nothing while another tab's value opens (`refreshing`) but show the 'updating' notice. */
  undo(): void;
  /** The active Board's newest undo step as it is right now (read at once, before any render), with its Board; null when
   *  it has none. What an Undo offered for one change keeps (a toast's): see undoOwn. */
  undoMark(): UndoMark | null;
  /** undo(), but only while `mark` still is the newest step of the Board that is active now: true then (undo ran, with
   *  its own waits). false, and nothing is touched, when the mark is null, another Board is active, a later change was
   *  recorded or undone on that Board, or its steps went (another tab, a realm, account or Forget switch). The undo
   *  stack itself is as before: this only refuses. */
  undoOwn(mark: UndoMark | null): boolean;
  /** Another tab's value is opening here after the Boards were read (ready stays true, the last Boards stay shown):
   *  edits are refused (UPDATING) until it opens or stops opening; the view shows its edit controls busy. */
  readonly refreshing: boolean;
  /** `refreshing` read now (core's status at once, before a render shows it): work that must not be refused checks it first. */
  isRefreshing(): boolean;
  /** true while a drag or a rename holds the state: another tab's write waits until it is released. */
  hold(on: boolean): void;
  /** Whether a hold is on, as of the last render (re-renders when it changes): what wakes work that waited for it. */
  readonly held: boolean;
  /** Whether a hold is on right now (set synchronously by hold(), before any render): what such work checks. */
  isHeld(): boolean;
  dismissNotice(): void;
  /** Moves each time the stored value stops opening here: the view drops what it holds (dialogs, drags) with it. */
  readonly lockGen: number;
}

/** One recorded undo step and the Board it is of (BoardsApi.undoMark). The step is told by identity, never by its label. */
export interface UndoMark { readonly board: string; readonly step: UndoStep }

/** The undo steps without those of `ids`' Boards (the same object when none had any). */
function withoutUndo(u: BoardUndo, ids: readonly string[]): BoardUndo {
  if (!ids.some((id) => id in u)) return u;
  const out: Record<string, BoardUndo[string]> = { ...u };
  for (const id of ids) delete out[id];
  return out;
}

/** core shows a stored value (a merge base): not this tab's own write still on its way ('saving') or refused and kept
 *  for a retry ('unsaved'), and not a value not yet confirmed ('loading'). */
const showsStored = (st: string): boolean => st !== 'saving' && st !== 'unsaved' && st !== 'loading';

export function useStoredBoards(): RealmBoards | null {
  const realm = useRealms().selected;
  const account = useCore().account;
  const loaded = useSyncExternalStore(pref().subscribe, () => pref().get(realm), () => pref().get(realm));
  const status = useSyncExternalStore(pref().subscribe, () => pref().status(realm), () => 'ok' as const);
  // A reason can change while the parsed value stays the same object (an unusable document reads as nothing stored).
  const unusable = useSyncExternalStore(pref().subscribe, () => storeReset(pref().get(realm), realm), () => null);
  const pageCopy = useSyncExternalStore(pref().subscribe, () => pref().pageCopy(realm), () => false);
  if (account === null || status === 'loading' || unusable !== null) return null;
  if (loaded.notice && loaded.notice.kind === 'reset') return null;
  if (status === 'oversized' && !pageCopy) return null;
  return loaded.state;
}

/** The realm's keep-loaded choice for the shell (view.tsx useKeepPage): as stored; while another tab's value opens,
 *  the last one read in this scope (a background read never unloads a kept Board). false when signed
 *  out, before the first read, and when the stored value cannot be used. */
export function useKeepLoaded(): boolean {
  const realm = useRealms().selected;
  const account = useCore().account;
  const forgets = useAccountForgets();
  const stored = useStoredBoards();
  const status = useSyncExternalStore(pref().subscribe, () => pref().status(realm), () => 'ok' as const);
  const scope = (account ?? '') + '\n' + realm + '\n' + forgets;
  // The choice last read, kept only across an unbroken background open in the scope it was read in: any render in
  // another scope (a loading one included), signed out, or with the value unusable (not loading, nothing read) drops it.
  const [last, setLast] = useState<{ scope: string; keep: boolean } | null>(null);
  const keep = account !== null && stored !== null ? !!stored.keep : null;
  const want = keep !== null ? { scope, keep } : account !== null && status === 'loading' && last?.scope === scope ? last : null;
  if (want?.scope !== last?.scope || want?.keep !== last?.keep) setLast(want);
  return want?.keep ?? false;
}

interface Working { readonly state: RealmBoards; readonly undo: BoardUndo; readonly stale: ReadonlySet<string> }

export function useBoards(): BoardsApi {
  const realm = useRealms().selected;
  const account = useCore().account;
  const loaded = useSyncExternalStore(pref().subscribe, () => pref().get(realm), () => pref().get(realm));
  const [work, setWork] = useState<Working>(() => ({ state: loaded.state, undo: {}, stale: new Set() }));
  const [notice, setNotice] = useState<BoardsNotice>(() => loadNotice(loaded, realm));
  // base: the stored value this tab last saw (parse caches by stored text, so an unchanged store gives this object).
  const base = useRef(loaded);
  const held = useRef(false);
  const [heldNow, setHeldNow] = useState(false);
  // A locked commit (applyLocked) for the Boards shown now: another tab's write waits, as under a hold, and this tab's
  // edits (apply) are queued on it: shown at once, never stored on their own then, made again after its op each round
  // (each on the Board it was made on) and stored with its value or when it ends. It belongs to the scope it began in:
  // a realm, account or Forget switch ends its hold on this tab for good (scopeGen moves), even if that scope comes back.
  // `before`: the Boards the edit was made on or replaced (the active one, and any other it gave a new value, such as a
  // rename by id), as they were before it; an edit is made again on them when another tab deleted them (withEdits). A
  // reorder gives no Board a new value, so it holds only the active one: a reordered Board another tab deleted is
  // skipped (its reorder finds no Board) and gets no notice of its own; the other Boards keep their order.
  type Edit = { readonly op: (s: RealmBoards, held: ReadonlySet<string>) => RealmBoards | Refusal; readonly record?: string; readonly active: string; readonly before: readonly Board[] };
  type Tx = { readonly gen: number; readonly edits: Edit[] };
  const tx = useRef<Tx | null>(null);
  const scopeGen = useRef(0);
  const inTx = (): boolean => tx.current !== null && tx.current.gen === scopeGen.current;
  const workRef = useRef(work);
  workRef.current = work;
  // Writes are bound to the account this render showed: one made for another account writes nothing.
  const accountRef = useRef(account);
  accountRef.current = account;
  const realmRef = useRef(realm);
  realmRef.current = realm;
  const put = useCallback((w: Working) => { workRef.current = w; setWork(w); }, []);
  // Every tile id seen this session (any realm: an id kept off in another one costs nothing), read when an op runs.
  const seen = useRef(new Set<string>());
  const seenTids = useCallback((s: RealmBoards): ReadonlySet<string> => {
    for (const id of allTids(s)) seen.current.add(id); // an undo step is a Board an earlier op ran on
    return seen.current;
  }, []);

  // Forget on this browser: the Boards this tab holds (state, undo, base) go like at an account switch, and nothing
  // made before it is stored (forgetsRef fences store()).
  const forgets = useAccountForgets();
  const forgetsRef = useRef(forgets);
  forgetsRef.current = forgets;
  // Realm or account switch, or a Forget: that set of Boards, with no undo (derived during render, so no frame shows
  // the old set).
  const scope = (account ?? '') + '\n' + realm + '\n' + forgets;
  const [shownScope, setShownScope] = useState(scope);
  if (shownScope !== scope) {
    setShownScope(scope);
    scopeGen.current++;
    const w: Working = { state: loaded.state, undo: {}, stale: new Set() };
    workRef.current = w;
    setWork(w);
    setNotice(loadNotice(loaded, realm));
    base.current = loaded;
    held.current = false;
    setHeldNow(false);
  }

  // A value core cannot use arriving from elsewhere (another tab, another Hub version) reads like nothing stored, so
  // `loaded` may not change: its reason is watched on its own.
  const unusable = useSyncExternalStore(pref().subscribe, () => storeReset(pref().get(realm), realm), () => null);
  const status = useSyncExternalStore(pref().subscribe, () => pref().status(realm), () => 'ok' as const);
  // The scope whose Boards have been read once (derived during render). Until then 'loading' is the first read (the
  // view waits); after it, 'loading' is a background read of another tab's value, shown when it opens (fold), and the
  // view keeps the last Boards with its dialogs. No account (signed out) forgets it, so the same account signing in
  // again reads first again. A value that stops opening is a real loss: lockGen below.
  const [readScope, setReadScope] = useState<string | null>(account !== null && status !== 'loading' ? scope : null);
  if (account === null ? readScope !== null : status !== 'loading' && readScope !== scope) setReadScope(account === null ? null : scope);
  const refreshing = account !== null && status === 'loading' && readScope === scope;
  // Read live by edits (a storage event can start one between renders): this scope was read, and core says 'loading'.
  const readNow = useRef(false);
  readNow.current = readScope === scope;
  const refreshingNow = (): boolean => readNow.current && pref().status(realmRef.current) === 'loading';
  useEffect(() => { if (!refreshing) setNotice((n) => (n && n.kind === 'updating' ? null : n)); }, [refreshing]);
  // The stored value stopped opening here (a rotation, a Forget elsewhere): everything decrypted goes at once, held or
  // not (derived during render, so no frame shows it): working state, undo, the merge base, and through lockGen the
  // view's dialogs and drags. Nothing is written until the user's next change.
  const [lockedSeen, setLockedSeen] = useState(status === 'locked');
  const [lockGen, setLockGen] = useState(0);
  if ((status === 'locked') !== lockedSeen) {
    setLockedSeen(status === 'locked');
    if (status === 'locked') {
      const w: Working = { state: loaded.state, undo: {}, stale: new Set() };
      workRef.current = w;
      setWork(w);
      base.current = loaded;
      held.current = false;
    setHeldNow(false);
      setNotice({ kind: 'unreadable', reason: 'locked' });
      setLockGen((g) => g + 1);
    }
  }
  // 'page' answers keep the unsaved notice until a write stores; core's 'unsaved' status keeps it until it clears.
  const pageOnly = useRef(false);
  useEffect(() => {
    if (status === 'unsaved') setNotice((n) => (n && n.kind === 'unsaved' ? n : { kind: 'unsaved' }));
    else if (status === 'ok' && !pageOnly.current) setNotice((n) => (n && n.kind === 'unsaved' ? null : n));
    // Core reports 'ok' again (the stored value opens, or there is none): an earlier "cannot be opened" notice goes;
    // other notices stay.
    if (status === 'ok') setNotice((n) => (n && n.kind === 'unreadable' && n.reason === 'locked' ? null : n));
  }, [status]);
  useEffect(() => {
    if (unusable) setNotice((n) => (n && n.kind === 'unreadable' && n.reason === unusable ? n : { kind: 'unreadable', reason: unusable }));
  }, [unusable]);

  // The two-tab notices clear by themselves.
  useEffect(() => {
    if (!notice || (notice.kind !== 'other' && notice.kind !== 'deleted')) return;
    const id = setTimeout(() => setNotice((n) => (n === notice ? null : n)), OTHER_TAB_NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  /** Folds what is stored now into this tab's state (see the contract); true when the result still needs writing. */
  const fold = useCallback((now: Loaded): boolean => {
    if (now === base.current) return false;
    const w = workRef.current;
    const was = base.current;
    base.current = now;
    // An unreadable value elsewhere (another tab's bad write, a newer schema) is never merged and never written over
    // here: this tab's state stands, carrying the raw text it kept, until the user's next change (which writes both).
    if (now.notice && now.notice.kind === 'reset') {
      if (now.state.unreadable) put({ ...w, state: { ...w.state, unreadable: now.state.unreadable } });
      setNotice({ kind: 'reset' });
      return false;
    }
    // A value core could not use (another Hub version's layout, a bad or oversized entry): nothing is merged and
    // nothing is written now; the bytes stay until this account's next change, and the band says so.
    const reason = storeReset(now, realmRef.current);
    if (reason === 'locked') put({ state: now.state, undo: {}, stale: new Set() });
    if (reason) { setNotice({ kind: 'unreadable', reason }); return false; }
    // Nothing was stored and nothing changed here: the stored value is simply taken (no fresh Board to keep).
    if (was.fresh && text(w.state) === text(was.state)) {
      put({ state: now.state, undo: {}, stale: new Set() });
      return false;
    }
    const m = merge(was.state, w.state, now.state);
    const undo: Record<string, BoardUndo[string]> = { ...w.undo };
    const stale = new Set(w.stale);
    for (const id of m.changed) { delete undo[id]; stale.add(id); }
    put({ state: m.state, undo, stale });
    // This tab lost a change: a Board both sides changed, or one this tab was still working on (it has undo steps).
    const lostIds = [...m.lost, ...m.changed.filter((id) => (w.undo[id]?.length ?? 0) > 0)];
    const lostName = lostIds.map((id) => m.state.boards.find((b) => b.id === id)?.name).find((n) => n !== undefined);
    if (m.capped.length) setNotice({ kind: 'capped', name: m.capped[0] as string });
    else if (m.deletedOpen !== null) setNotice({ kind: 'deleted', name: m.deletedOpen });
    else if (m.yielded.length) setNotice({ kind: 'deleted', name: m.yielded[0] as string });
    else if (lostName !== undefined) setNotice({ kind: 'other', name: lostName });
    return text(m.state) !== text(now.state);
  }, [put]);

  const store = useCallback((s: RealmBoards): PrefWrite | 'forgotten' => {
    if (accountForgets() !== forgetsRef.current) return 'forgotten'; // made before a Forget: never stored under the next key
    const r = pref().report(accountRef.current, toStored(s) as unknown as Loaded, realmRef.current);
    if (r.result === 'page') { pageOnly.current = true; setNotice({ kind: 'unsaved' }); return r.result; }
    if (r.result !== 'stored') return r.result;
    // The base stays the last stored value: the write is stored in the background ('saving'), and only once stored
    // (or refused for another tab's value: 'conflict') does the subscription fold it in, so an edit another tab beat
    // is merged like any other two-tab change instead of lost.
    const lost = writeNotice(r);
    pageOnly.current = false;
    const refused = pref().status(realmRef.current) !== 'ok'; // 'unsaved', or 'saving' until it is stored
    setNotice((n) => lost ?? (n && n.kind === 'unsaved' && !refused ? null : n));
    return r.result;
  }, []);

  /** Writes this tab's state, merged first with whatever another tab stored meanwhile. */
  const commit = useCallback(() => {
    // While a write of ours is on its way or refused, what core shows is that write, not a stored value: nothing to fold.
    if (showsStored(pref().status(realmRef.current))) fold(pref().get(realmRef.current));
    store(workRef.current.state);
  }, [fold, store]);

  // Another tab's write, or our own once stored (it becomes the base; while 'saving' or 'unsaved' core shows it, not a
  // stored value, so the base stays the last stored one): merge unless a hold says wait.
  useEffect(() => {
    if (held.current || inTx() || loaded === base.current || !showsStored(status)) return;
    if (fold(loaded)) store(workRef.current.state);
  }, [loaded, status, fold, store]);

  const apply = useCallback((op: (s: RealmBoards, held: ReadonlySet<string>) => RealmBoards | Refusal, o: { record?: string } = {}): Refusal | typeof UPDATING | null => {
    const w = workRef.current;
    const next = op(w.state, seenTids(w.state));
    if (isRefusal(next)) return next;
    if (next === w.state) return null;
    // Another tab's value is opening: no edit is made on the Boards it replaces (nothing shown, queued or written).
    if (refreshingNow()) { setNotice({ kind: 'updating' }); return UPDATING; }
    put({ state: next, undo: o.record !== undefined ? recordStep(w.undo, activeBoard(w.state), o.record) : w.undo, stale: w.stale });
    setNotice((n) => (n && (n.kind === 'other' || n.kind === 'deleted' || n.kind === 'capped') ? null : n));
    if (inTx()) { tx.current?.edits.push({ op, active: w.state.active, before: w.state.boards.filter((b) => b.id === w.state.active || next.boards.find((x) => x.id === b.id) !== b), ...(o.record !== undefined ? { record: o.record } : {}) }); return null; }
    commit();
    return null;
  }, [put, commit, seenTids]);

  const applyFresh = useCallback((op: (s: RealmBoards, held: ReadonlySet<string>) => RealmBoards | Refusal, o: { record?: string } = {}): Refusal | typeof UPDATING | null => {
    // While a locked commit runs it owns the fold: this is an ordinary edit then (apply records it).
    const owed = !inTx() && showsStored(pref().status(realmRef.current)) && fold(pref().get(realmRef.current));
    let wrote = false;
    const r = apply((s, held) => { const n = op(s, held); wrote = !isRefusal(n) && n !== s; return n; }, o);
    if (owed && !wrote) store(workRef.current.state);
    return r;
  }, [apply, fold, store]);

  const applyLocked = useCallback(async (op: (s: RealmBoards, rand: Rand, held: ReadonlySet<string>, stored: RealmBoards) => RealmBoards | Refusal, o: LockedOpts = {}): Promise<LockedRefusal | null> => {
    const acct = accountRef.current, realm = realmRef.current, fg = forgetsRef.current, gen = scopeGen.current;
    // The write's owner: once it is gone (sign-out, another account, a realm switch), the slot's status no longer
    // speaks for this write.
    const owner = capture();
    const locks = browserLocks();
    if (!acct || !locks || typeof locks.request !== 'function') return NOT_ADDED;
    // The Boards this commit began on are still the ones shown (a scope change is for good: scopeGen).
    const sameScope = () => scopeGen.current === gen && accountForgets() === fg;
    /** The slot's status once `done` says so; null after STORE_WAIT_MS. */
    const until = (done: (st: CryptRead) => boolean) => new Promise<CryptRead | null>((resolve) => {
      let over = false;
      const check = () => {
        if (over) return;
        const st = pref().status(realm);
        if (done(st)) { over = true; off(); clearTimeout(timer); resolve(st); }
      };
      const off = pref().subscribe(check);
      const timer = setTimeout(() => { if (!over) { over = true; off(); resolve(null); } }, STORE_WAIT_MS);
      check();
    });
    const mine: Tx = { gen, edits: [] };
    // Every round of op draws the same random numbers (the first round's, then new ones), so a retry makes the same
    // Board and slot ids as the round this tab's edits were made on, and the ids those edits hold still name them.
    const drawn: number[] = [];
    let draw = 0;
    const rand: Rand = () => { if (draw === drawn.length) drawn.push(Math.random()); return drawn[draw++] as number; };
    // The Boards op made, as last shown: an edit made on one is made on it again when a value lacks it (see withEdits).
    const madeShown = new Map<string, Board>();
    /** `w` with this tab's queued edits made again in order, each on the Board it was made on. When that Board is not
     *  in `w` (op made it, and this value is from before op), the edit runs with it put back as last shown, and keeps
     *  only what it changed elsewhere (another Board it names, a realm-wide setting: keep loaded, recents); its change
     *  to that Board waits, queued, for a round whose op makes it again (with the same ids: `rand`). Any other Board the
     *  edit was made on or changed (the active one, or one it named by id) that is gone from `w` (another tab deleted
     *  it) is put back as it was before the edit, the same way: the edit's change to it is not applied (never run on
     *  another Board, no undo step for it), its change elsewhere is, and the Board's name is left in `dropped` for the
     *  notice that it was deleted in another tab. */
    let dropped: string | null = null;
    const withEdits = (w: Working): Working => {
      let { state, undo } = w;
      dropped = null;
      for (const e of mine.edits) {
        const ghosts: Board[] = [];
        const deleted = new Set<string>();
        for (const b of e.before) {
          if (state.boards.some((x) => x.id === b.id)) continue;
          const made = madeShown.get(b.id);
          ghosts.push(made ?? b);
          if (!made) deleted.add(b.id);
        }
        const put0 = ghosts.length ? { ...state, boards: [...state.boards, ...ghosts] } : state;
        const at = put0.active === e.active ? put0 : { ...put0, active: e.active };
        const n = e.op(at, seenTids(at));
        if (isRefusal(n) || n === at) continue;
        const ghostIds = new Set(ghosts.map((g) => g.id));
        for (const g of ghosts) if (deleted.has(g.id) && n.boards.find((b) => b.id === g.id) !== g) dropped = g.name;
        // The undo step is for the Board the edit was made on, when it is there. With a Board put back for the edit, only
        // when the edit changed the active Board (its change may have been to the Board put back); otherwise as apply
        // recorded it (every recorded edit in the view changes the active Board).
        if (e.record !== undefined && !ghostIds.has(e.active) && (!ghosts.length || n.boards.find((b) => b.id === e.active) !== activeBoard(at))) undo = recordStep(undo, activeBoard(at), e.record);
        state = ghosts.length ? { ...n, active: ghostIds.has(n.active) ? state.active : n.active, boards: n.boards.filter((b) => !ghostIds.has(b.id)) } : n;
      }
      return { state, undo, stale: w.stale };
    };
    /** An edit's Board another tab deleted: its change there was not applied, so the notice says the Board was deleted.
     *  A later round that has the Board again (the change applied after all) takes this commit's notice back. */
    let told: BoardsNotice = null;
    const tellDropped = () => {
      if (dropped !== null) {
        const said: BoardsNotice = { kind: 'deleted', name: dropped };
        told = said;
        setNotice(said);
      } else if (told !== null) {
        const said = told;
        told = null;
        setNotice((n) => (n === said ? null : n));
      }
    };
    // This tab's Boards without the queued edits (op runs on them; the edits come after it, as they did).
    let core: Working = workRef.current;
    // How many queued edits the last store carried (-1: no store of this commit stands); whether a fold found this
    // tab's value needs writing with no store carrying it; the text of this commit's store once it is stored.
    let carried = -1;
    let owedFold = false;
    let confirmed: string | null = null;
    const run = async (): Promise<LockedRefusal | null> => {
      // No write of this tab on its way: what core shows is what is stored, which the op is run on.
      if ((await until((st) => st !== 'saving' && st !== 'loading')) === null) return NOT_ADDED;
      for (let round = 0; round <= LOCK_ROUNDS; round++) {
        // After every wait: a realm, account or Forget switch meanwhile is another set of Boards, never touched here.
        if (!sameScope()) return NOT_ADDED;
        const st = pref().status(realm);
        const now = pref().get(realm);
        if (st === 'locked' || st === 'oversized' || storeReset(now, realm) || (now.notice && now.notice.kind === 'reset')) {
          // A stored value that cannot be used: what the hook did about it stands (a value that does not open cleared the
          // Boards it showed), and nothing is written until the user's next change: the queued edits go with it.
          mine.edits.length = 0;
          owedFold = false;
          // The queued edits are shown as made: take them back off the Boards (this tab's own changes from before the
          // commit stay, owed to the next change). A value that does not open already cleared the Boards it showed.
          if (st !== 'locked') {
            const raw = workRef.current.state.unreadable;
            put(raw === undefined || raw === core.state.unreadable ? core : { ...core, state: { ...core.state, unreadable: raw } });
          }
          return NOT_ADDED;
        }
        put(core);
        if (showsStored(st) && fold(now)) owedFold = true;
        core = workRef.current;
        // A Board the caller holds as it read it (close: untouched): an edit of this tab queued on it since the lock
        // (made again after op, so op could not see it) refuses the commit; nothing is written, the edit stays.
        if (o.untouched !== undefined && mine.edits.some((e) => e.active === o.untouched || e.before.some((b) => b.id === o.untouched))) { put(withEdits(core)); tellDropped(); return NOT_ADDED; }
        draw = 0;
        const next = op(core.state, rand, seenTids(core.state), now.state);
        if (isRefusal(next) || next === core.state) { put(withEdits(core)); tellDropped(); return isRefusal(next) ? next : null; }
        // The undo step is the Board op leaves active as it was; a Board op made is recorded as it was made (o.made).
        const prev = o.record !== undefined ? core.state.boards.find((b) => b.id === next.active) ?? o.made?.() : undefined;
        const recorded = prev && o.record !== undefined ? recordStep(core.undo, prev, o.record) : core.undo;
        const shown = withEdits({ state: next, undo: o.clearUndoIds ? withoutUndo(recorded, o.clearUndoIds()) : recorded, stale: core.stale });
        for (const b of shown.state.boards) if (!core.state.boards.some((c) => c.id === b.id)) madeShown.set(b.id, b);
        put(shown);
        setNotice((n) => (n && (n.kind === 'other' || n.kind === 'deleted' || n.kind === 'capped') ? null : n));
        tellDropped();
        const edits = mine.edits.length;
        const w = store(shown.state);
        if (w === 'page') { carried = edits; owedFold = false; return null; } // kept in this page: the 'unsaved' notice, as for every write
        if (w === 'refused' && pref().status(realm) === 'loading') {
          // Another tab's value arrived and is opening (core refuses writes until it is open): nothing was written. Back
          // to the value read, and again on theirs once it is open (the next round checks the scope first).
          put(withEdits(core));
          if ((await until((x) => x !== 'saving' && x !== 'loading')) === null) return NOT_ADDED;
          continue;
        }
        if (w !== 'stored') { put(withEdits(core)); return NOT_ADDED; }
        carried = edits;
        owedFold = false;
        const end = await until((x) => x !== 'saving');
        // Accepted, and its owner gone meanwhile (sign-out, another account, a realm switch): the status read now is
        // another slot's, not this write's. Unknown (C9): nothing is rolled back.
        if (!alive(owner)) return NOT_KNOWN;
        if (end === 'ok') { confirmed = text(shown.state); return null; }
        if (end === 'unsaved') return null; // refused by the browser and kept for a retry: the 'unsaved' notice, as every write
        // Still on its way after STORE_WAIT_MS, or any answer that is not a lost race: unknown (C9), nothing rolled back;
        // a later merge reconciles it like any write (never past nine Boards).
        if (end !== 'conflict') return NOT_KNOWN;
        // A lost race is known: this write was not stored. Another set of Boards shown by now is never touched.
        carried = -1;
        if (!sameScope()) return NOT_ADDED;
        // Another tab stored first: back to the value read (this tab's edits made again on it), and again on the
        // winner's, folded at the next round.
        put(withEdits(core));
      }
      return NOT_ADDED;
    };
    try {
      return await locks.request(`hub_boards_add:${acct}:${realm}`, async () => {
        // Granted after its scope went (another realm shown meanwhile): it touches nothing, never that scope's commit.
        if (!sameScope()) return NOT_ADDED;
        core = workRef.current;
        tx.current = mine;
        try { return await run(); } finally {
          o.onEnd?.(confirmed !== null && alive(owner) && accountForgets() === fg);
          if (tx.current === mine) tx.current = null;
          // Edits of a set of Boards no longer shown went with it. Otherwise: this commit's own stored value is the base
          // now (edits made after it are this tab's changes, never a two-tab conflict with it); then edits no store
          // carried, or a fold no store carried, are stored as apply stores them (merged first); else what arrived
          // meanwhile is folded unless a hold waits (its release folds), as at a hold's release.
          if (sameScope()) {
            if (confirmed !== null) {
              const now = pref().get(realm);
              if (now !== base.current && showsStored(pref().status(realm)) && text(now.state) === confirmed) base.current = now;
            }
            if (owedFold || mine.edits.length > Math.max(carried, 0)) commit();
            else if (!held.current && showsStored(pref().status(realm)) && fold(pref().get(realm))) store(workRef.current.state);
          }
        }
      });
    } catch {
      return NOT_ADDED;
    }
  }, [put, fold, store, commit, seenTids]);
  // A lock never granted (no Web Locks, the request refused): onEnd still answers, once, false.
  const applyLockedEnded = useCallback(async (op: Parameters<typeof applyLocked>[0], o: LockedOpts = {}): Promise<LockedRefusal | null> => {
    let ended = false;
    const r = await applyLocked(op, { ...o, onEnd: (d) => { ended = true; o.onEnd?.(d); } });
    if (!ended) o.onEnd?.(false);
    return r;
  }, [applyLocked]);

  const undo = useCallback(() => {
    // Refused while another tab's value opens, said first (a locked commit may be waiting on that same open). Undo also
    // waits while a locked commit runs (it takes a store's time): its rollback could not make an undo again.
    if (refreshingNow()) { setNotice({ kind: 'updating' }); return; }
    if (inTx()) return;
    const r = undoStep(workRef.current.state, workRef.current.undo);
    if (!r) return;
    put({ ...r, stale: workRef.current.stale });
    commit();
  }, [put, commit]);

  const undoMark = useCallback((): UndoMark | null => {
    const w = workRef.current;
    const step = lastStep(w.state, w.undo);
    return step ? { board: w.state.active, step } : null;
  }, []);
  const undoOwn = useCallback((mark: UndoMark | null): boolean => {
    const w = workRef.current;
    if (!mark || w.state.active !== mark.board || lastStep(w.state, w.undo) !== mark.step) return false;
    undo();
    return true;
  }, [undo]);

  const hold = useCallback((on: boolean) => {
    held.current = on;
    setHeldNow(on);
    // A release during a locked commit folds nothing: the commit's end folds (or drops) what it saw, once.
    if (!on && !inTx() && showsStored(pref().status(realmRef.current)) && fold(pref().get(realmRef.current))) store(workRef.current.state);
  }, [fold, store]);

  const step = lastStep(work.state, work.undo);
  return {
    ready: account !== null && (status !== 'loading' || readScope === scope),
    realm,
    state: work.state,
    notice,
    undoLabel: step?.label ?? null,
    undoStale: !step && work.stale.has(work.state.active),
    apply,
    applyFresh,
    applyLocked: applyLockedEnded,
    undo,
    undoMark,
    undoOwn,
    refreshing,
    hold,
    held: heldNow,
    // Another tab's value opening counts as a hold for work that waits for one (added links): it runs after it.
    isHeld: useCallback(() => held.current || refreshingNow(), []),
    isRefreshing: useCallback(() => refreshingNow(), []),
    dismissNotice: useCallback(() => setNotice(null), []),
    lockGen,
  };
}
