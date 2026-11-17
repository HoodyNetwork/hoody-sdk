// script-asks.ts: the stored copy of the scripts writer's unsettled asks (pages/scripts), so an ask whose outcome is
// unknown survives a reload and is never sent twice (C9).
//
// Contract, in plain words:
//   - One registered key, hub.v3.script-asks (registry.ts: purge false, forget true: no auth purge removes it, a
//     sign-out included; only Forget this browser removes the key). Its value holds every account's list:
//     { v: 1, accounts: { <account id>: ScriptAsk[] } }. A record is secret-free identity only (ids, idempotency
//     keys, phase, time): never prompt, reply or script text.
//   - Reads and writes are always for the account shown now (ctx capture().account, as attempts.ts): a caller never
//     names another account, and a write re-checks inside the lock that the account it started under is still shown.
//   - Every read-modify-write runs under change-store.ts's cross-tab lock (underChangeStore: the same lock as held
//     changes, so this file adds no second locking rule). Without it a write refuses ('uncoordinated').
//   - A write goes over a clean read only. A value that does not parse or validate (corrupt, or a newer `v`) and
//     storage that cannot be read are never written over: reads answer 'unreadable' and writes refuse. Only Forget
//     this browser clears it.
//   - Every write is a compare-and-set on the record the caller last read: put(rec, prev) lands only while the stored
//     ask is exactly `prev` (null: not stored), drop(prevs) only while each is still `prev` (or already gone). So a
//     tab acting on an older read never brings back an ask another tab dropped, nor moves one back ('changed').
//   - claim(prev) is the exclusive removal: 'ok' only for the one call that removed the stored ask while it was
//     exactly `prev`; gone or different is 'changed'. Of two tabs claiming one ask, exactly one wins.
//   - Bounds: SCRIPT_ASKS_MAX records per account, SCRIPT_ASKS_MAX_BYTES (UTF-8) for the whole value, STR_MAX
//     characters per string. Past them a put refuses ('full', 'too_large'); nothing stored is ever pushed out.
//   - The writer removes its own asks: when settled, and at its warned sign-out only those its warning showed, in one
//     dropScriptAsks before signOutForgetting (writes refuse once the account is going): lifecycle.ts
//     signOutForgettingAsks, which signs out whatever the drop answered. An ask the drop could not remove stays stored
//     under that account id (secret-free, read only by that account at its next sign-in): no purge drops an ask whose
//     outcome is unknown (C9), a sign-out included.
//   - Never call these from inside underChangeStore: the lock is not reentrant, so the write would wait forever.
//   - New script drafts (pages/scripts/new) keep one DraftRecord per
//     draft in the same value, under `drafts` (same account rule, same lock, same compare-and-set on the whole record): its
//     current and retained attempts, its lifecycle state and, before a deploy is sent, the deploy's recovery metadata. Also
//     secret-free (ids, numbers, paths). A value holding drafts is written as v 2, so an older build (which knows only v 1)
//     reads it as unreadable and never writes over it; a value without drafts stays v 1. DRAFTS_MAX records per account;
//     the byte bound is shared with the asks. A consumed or discarded record older than DRAFT_KEEP_MS is dropped by the next
//     write of its account.
import { useSyncExternalStore } from 'react';
import { capture, loggingOut } from './ctx';
import { underChangeStore } from './change-store';
import { accountEnded } from './realm';
import { isRecord } from './shape';
import { createListeners } from './listeners';
import { hostEnv, localStore, settleHostEnv } from './host-env';

export const SCRIPT_ASKS_KEY = 'hub.v3.script-asks';
export const SCRIPT_ASKS_MAX = 32;
export const SCRIPT_ASKS_MAX_BYTES = 65536;
export const SCRIPT_ASK_STR_MAX = 128;

export type ScriptAskPhase = 'create' | 'turn' | 'lost' | 'wait' | 'read';
export interface ScriptAsk {
  readonly askId: string;
  readonly compId: string;
  readonly path: string | null;
  readonly realm: string | null;
  readonly owner: string | null;
  readonly sessionId: string | null;
  readonly turnId: string | null;
  readonly phase: ScriptAskPhase;
  /** When the ask was sent (ms, this client's clock). */
  readonly sentAt: number;
  /** The Idempotency-Keys (random ids, not credentials). */
  readonly createKey: string;
  readonly turnKey: string;
}
/** What a write did. 'ok': stored (or, for drop, already absent from a clean read). Every other answer wrote
 *  nothing: 'invalid' (a record outside the shape or bounds), 'changed' (the stored ask is no longer the `prev`
 *  the caller read: read again and decide), 'no_account' (none shown, the account is going, or
 *  another one is shown by the time the lock is had), 'unreadable' (storage cannot be read, or holds a value this
 *  file cannot read: never written over), 'full' (MAX_ASKS for the account), 'too_large' (MAX_BYTES),
 *  'uncoordinated' (no cross-tab lock), 'refused' (the browser refused the write). */
/** 'account_changed': the call named an account and another one (or none) is shown, so nothing was written. */
export type ScriptAskWrite = 'ok' | 'invalid' | 'changed' | 'no_account' | 'account_changed' | 'unreadable' | 'full' | 'too_large' | 'uncoordinated' | 'refused';

export type DraftMode = 'ai' | 'idea' | 'write';
/** open: being made; deploying: a deploy may be out (its metadata below); live_cleanup: made live, its attempts not all closed
 *  yet (sends nothing again); consumed: made live and cleaned up; discarded: ended without going live. */
export type DraftState = 'open' | 'deploying' | 'live_cleanup' | 'consumed' | 'discarded';
export interface DraftDeploy {
  readonly kind: 'write' | 'instantiate';
  /** Root-relative script path the deploy writes. */
  readonly path: string;
  /** write: the kit op id (ops/settle settles it); instantiate: the request's Idempotency-Key. */
  readonly opId: string;
  /** The computer's own clock (health.now) read before the send: settle's sentAfter. Null for instantiate. */
  readonly sentAfter: number | null;
  readonly attempt: number;
  /** The sending tab's last heartbeat (ms, this client's clock): one older than the page's bound reads as unknown. */
  readonly beatAt: number;
  /** sending: a send is (or may be) out under this reservation; didnt: the last send was known not sent (Try again may move it
   *  back to sending, by compare-and-set); held: the outcome is held or unknown (no send ever again, a fresh read or Discard). */
  readonly phase: DeployPhase;
}
export type DeployPhase = 'sending' | 'didnt' | 'held';
export interface DraftRecord {
  readonly draftId: string;
  readonly mode: DraftMode;
  /** The bound computer: its project and container (a container id alone is not unique across projects). */
  readonly project: string;
  readonly compId: string;
  readonly realm: string;
  readonly owner: string;
  readonly exec: number;
  readonly current: number;
  readonly retained: number | null;
  readonly state: DraftState;
  readonly deploy: DraftDeploy | null;
  readonly updatedAt: number;
}
export const DRAFTS_MAX = 32;
export const DRAFT_KEEP_MS = 24 * 3600_000;

type Value = { v: 1 | 2; accounts: Record<string, ScriptAsk[]>; drafts: Record<string, DraftRecord[]> };
const PHASES: readonly string[] = ['create', 'turn', 'lost', 'wait', 'read'];
const KEYS = ['askId', 'compId', 'path', 'realm', 'owner', 'sessionId', 'turnId', 'phase', 'sentAt', 'createKey', 'turnKey'];

const DRAFT_KEYS = ['draftId', 'mode', 'project', 'compId', 'realm', 'owner', 'exec', 'current', 'retained', 'state', 'deploy', 'updatedAt'];
const DEPLOY_KEYS = ['kind', 'path', 'opId', 'sentAfter', 'attempt', 'beatAt', 'phase'];
const DEPLOY_PHASES: readonly string[] = ['sending', 'didnt', 'held'];
const MODES: readonly string[] = ['ai', 'idea', 'write'];
const STATES: readonly string[] = ['open', 'deploying', 'live_cleanup', 'consumed', 'discarded'];
const nat = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const exact = (v: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= SCRIPT_ASK_STR_MAX;
const strOrNull = (v: unknown): boolean => v === null || str(v);

/** A record in the exact shape and bounds (no other field: nothing else, a prompt included, is ever stored). */
export function validScriptAsk(v: unknown): v is ScriptAsk {
  if (!isRecord(v) || Object.keys(v).length !== KEYS.length || !KEYS.every((k) => Object.hasOwn(v, k))) return false;
  return str(v.askId) && str(v.compId) && strOrNull(v.path) && strOrNull(v.realm) && strOrNull(v.owner)
    && strOrNull(v.sessionId) && strOrNull(v.turnId) && typeof v.phase === 'string' && PHASES.includes(v.phase)
    && typeof v.sentAt === 'number' && Number.isFinite(v.sentAt) && v.sentAt >= 0 && str(v.createKey) && str(v.turnKey);
}

/** A draft record in the exact shape and bounds. A deploy is present exactly while one may be out or was made (deploying,
 *  live_cleanup, consumed). */
export function validDraftRecord(v: unknown): v is DraftRecord {
  if (!isRecord(v) || !exact(v, DRAFT_KEYS)) return false;
  if (!(typeof v.draftId === 'string' && /^[0-9a-z]{10}$/.test(v.draftId) && typeof v.mode === 'string' && MODES.includes(v.mode)
    && typeof v.project === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v.project) && str(v.compId) && str(v.realm) && str(v.owner) && nat(v.exec, 9999) && v.exec >= 1 && nat(v.current, 999)
    && (v.retained === null || nat(v.retained, 999)) && typeof v.state === 'string' && STATES.includes(v.state) && time(v.updatedAt))) return false;
  const d = v.deploy;
  if (d === null) return v.state === 'open' || v.state === 'discarded';
  if (v.state === 'open' || v.state === 'discarded' || !isRecord(d) || !exact(d, DEPLOY_KEYS)) return false;
  return (d.kind === 'write' || d.kind === 'instantiate') && str(d.path) && str(d.opId) && (d.sentAfter === null || time(d.sentAfter)) && nat(d.attempt, 999) && time(d.beatAt) && typeof d.phase === 'string' && DEPLOY_PHASES.includes(d.phase);
}
function copyDraft(v: unknown): DraftRecord | null {
  if (!validDraftRecord(v)) return null;
  const r = v as unknown as Record<string, unknown>;
  const c = Object.fromEntries(DRAFT_KEYS.map((k) => [k, k === 'deploy' && r.deploy !== null ? Object.fromEntries(DEPLOY_KEYS.map((j) => [j, (r.deploy as Record<string, unknown>)[j]])) : r[k]]));
  return validDraftRecord(c) ? c : null;
}
/** The same stored draft record, field for field (deploy included). */
export const sameDraftRecord = (a: DraftRecord, b: DraftRecord): boolean => JSON.stringify(copyDraft(a)) === JSON.stringify(copyDraft(b)) && copyDraft(a) !== null;

/** A plain copy of exactly the record's fields, validated as copied (null when it is not a valid record). */
function copyAsk(v: unknown): ScriptAsk | null {
  if (!validScriptAsk(v)) return null;
  const c = Object.fromEntries(KEYS.map((k) => [k, (v as unknown as Record<string, unknown>)[k]]));
  return validScriptAsk(c) ? c : null;
}
/** True when both are the same stored record, field for field (what put, drop and claim compare). */
export const sameScriptAsk = (a: ScriptAsk, b: ScriptAsk): boolean => KEYS.every((k) => (a as unknown as Record<string, unknown>)[k] === (b as unknown as Record<string, unknown>)[k]);

/** The stored value, clean; null when nothing is stored is an empty one; 'unreadable' otherwise. */
function readValue(): Value | 'unreadable' {
  let raw: string | null;
  try { raw = localStore().getItem(SCRIPT_ASKS_KEY); } catch { return 'unreadable'; }
  if (raw === null) return { v: 1, accounts: {}, drafts: {} };
  let a: unknown;
  try { a = JSON.parse(raw); } catch { return 'unreadable'; }
  if (!isRecord(a) || !(a.v === 1 || a.v === 2) || !isRecord(a.accounts)) return 'unreadable';
  // v 1 has no drafts (a v 1 value carrying them is not one this file wrote); v 2 always has the map.
  if (a.v === 1 ? 'drafts' in a : !isRecord(a.drafts)) return 'unreadable';
  const drafts: Record<string, DraftRecord[]> = {};
  for (const [acct, list] of Object.entries(a.v === 2 ? (a.drafts as Record<string, unknown>) : {})) {
    if (!acct || !Array.isArray(list) || list.length > DRAFTS_MAX || !list.every(validDraftRecord)) return 'unreadable';
    if (new Set(list.map((r) => r.draftId)).size !== list.length) return 'unreadable';
    drafts[acct] = list;
  }
  const accounts: Record<string, ScriptAsk[]> = {};
  for (const [acct, list] of Object.entries(a.accounts)) {
    if (!acct || !Array.isArray(list) || list.length > SCRIPT_ASKS_MAX || !list.every(validScriptAsk)) return 'unreadable';
    if (new Set(list.map((r) => r.askId)).size !== list.length) return 'unreadable';
    accounts[acct] = list;
  }
  return { v: a.v, accounts, drafts };
}

function shownAccount(): string | null {
  try { const a = capture().account; return a != null && String(a) !== '' ? String(a) : null; } catch { return null; }
}
const accountGoing = (): boolean => { try { return loggingOut() || accountEnded(); } catch { return true; } };

/** The shown account's stored asks, oldest first; 'unreadable' when storage cannot be read or holds a value this
 *  file cannot read (an absent ask then proves nothing). No account shown: an empty list. With `account`: that
 *  account's asks only while it is the shown one, else an empty list. A pure read: it writes and notifies nothing.
 *  An ask's askId is its stable identity; the whole record (sameScriptAsk) is what a drop compares. */
export function readScriptAsks(account?: string): ScriptAsk[] | 'unreadable' {
  const acct = shownAccount();
  // The account is checked before storage is read: another account reads empty whatever storage holds.
  if (!acct || (account !== undefined && account !== acct)) return [];
  const v = readValue();
  if (v === 'unreadable') return 'unreadable';
  return [...(v.accounts[acct] ?? [])].sort((x, y) => x.sentAt - y.sentAt);
}

/** One read-modify-write of the shown account's list under the store lock. `edit` returns the new list, or a
 *  refusal. With `expect`: only while that account is the shown one, checked before and again under the lock
 *  ('account_changed' otherwise, nothing written). */
function rmw(edit: (list: readonly ScriptAsk[]) => ScriptAsk[] | ScriptAskWrite, expect?: string): Promise<ScriptAskWrite> {
  return rmwBoth((asks, drafts) => { const next = edit(asks); return typeof next === 'string' ? next : { asks: next, drafts: [...drafts] }; }, expect);
}
function rmwBoth(edit: (asks: readonly ScriptAsk[], drafts: readonly DraftRecord[]) => { asks: ScriptAsk[]; drafts: DraftRecord[] } | ScriptAskWrite, expect?: string): Promise<ScriptAskWrite> {
  const acct = shownAccount();
  if (expect !== undefined && acct !== expect) return Promise.resolve('account_changed');
  if (!acct || accountGoing()) return Promise.resolve('no_account');
  return underChangeStore<ScriptAskWrite>(() => {
    if (expect !== undefined && shownAccount() !== expect) return 'account_changed';
    if (shownAccount() !== acct || accountGoing()) return 'no_account';
    const v = readValue();
    if (v === 'unreadable') return 'unreadable';
    const now = Date.now();
    // Ended drafts are kept a day (another tab may still be looking at them), then dropped by the next write of the account.
    const kept = (v.drafts[acct] ?? []).filter((r) => !((r.state === 'consumed' || r.state === 'discarded') && now - r.updatedAt > DRAFT_KEEP_MS));
    const next = edit(v.accounts[acct] ?? [], kept);
    if (typeof next === 'string') return next;
    if (next.asks.length > SCRIPT_ASKS_MAX || next.drafts.length > DRAFTS_MAX) return 'full';
    const accounts = { ...v.accounts };
    if (next.asks.length) accounts[acct] = next.asks; else delete accounts[acct];
    const drafts = { ...v.drafts };
    if (next.drafts.length) drafts[acct] = next.drafts; else delete drafts[acct];
    const withDrafts = Object.keys(drafts).length > 0;
    const empty = Object.keys(accounts).length === 0 && !withDrafts;
    const text = empty ? null : JSON.stringify(withDrafts ? { v: 2, accounts, drafts } : { v: 1, accounts });
    if (text !== null && new TextEncoder().encode(text).byteLength > SCRIPT_ASKS_MAX_BYTES) return 'too_large';
    try {
      if (text === null) localStore().removeItem(SCRIPT_ASKS_KEY);
      else localStore().setItem(SCRIPT_ASKS_KEY, text);
    } catch { return 'refused'; }
    return 'ok';
  }).then((out) => { if (out === 'ok') changed(); return out; }, () => 'uncoordinated' as const);
}

/** Stores one ask for the shown account (a copy of exactly its fields): a new one when `prev` is null and no ask
 *  of its askId is stored, else in place of the stored ask while it is exactly `prev` (same askId). Otherwise
 *  'changed', nothing written: another tab added, moved or dropped it since the caller's read. */
export function putScriptAsk(rec: ScriptAsk, prev: ScriptAsk | null): Promise<ScriptAskWrite> {
  const copy = copyAsk(rec);
  const was = prev === null ? null : copyAsk(prev);
  if (!copy || (prev !== null && (!was || was.askId !== copy.askId))) return Promise.resolve('invalid');
  return rmw((list) => {
    const i = list.findIndex((r) => r.askId === copy.askId);
    const cur = i < 0 ? null : (list[i] as ScriptAsk);
    if (was === null ? cur !== null : cur === null || !sameScriptAsk(cur, was)) return 'changed';
    return i < 0 ? [...list, copy] : list.map((r, j) => (j === i ? copy : r));
  });
}

/** Removes asks of the shown account in one write, each only while it is still exactly the `prev` given (an ask
 *  already gone counts as removed). One that changed since: 'changed', and none is removed. With `account`: only
 *  while that account is the shown one, checked under the lock ('account_changed', nothing removed): the warned
 *  sign-out passes the account its warning was for, so a session another tab swapped in meanwhile is never touched. */
export function dropScriptAsks(prevs: readonly ScriptAsk[], account?: string): Promise<ScriptAskWrite> {
  const was = prevs.map(copyAsk);
  if (!was.every((r): r is ScriptAsk => r !== null)) return Promise.resolve('invalid');
  return rmw((list) => {
    for (const p of was) {
      const cur = list.find((r) => r.askId === p.askId);
      if (cur && !sameScriptAsk(cur, p)) return 'changed';
    }
    const gone = new Set(was.map((p) => p.askId));
    return list.filter((r) => !gone.has(r.askId));
  }, account);
}
/** dropScriptAsks for one ask. */
export const dropScriptAsk = (prev: ScriptAsk): Promise<ScriptAskWrite> => dropScriptAsks([prev]);

/** Removes the shown account's ask only while it is still exactly `prev`, and answers 'ok' only to the call that
 *  removed it: an ask already gone, or replaced (another record at its askId), is 'changed', nothing written. The
 *  winner of a delivery or a close between tabs is the one call that got 'ok'. With `when`, only while `when()` is true
 *  at the moment the store is held (else 'changed', nothing written). */
export function claimScriptAsk(prev: ScriptAsk, when?: () => boolean): Promise<ScriptAskWrite> {
  const was = copyAsk(prev);
  if (!was) return Promise.resolve('invalid');
  return rmw((list) => {
    const cur = list.find((r) => r.askId === was.askId);
    if (!cur || !sameScriptAsk(cur, was)) return 'changed';
    // `when` is asked while the store is held: a claim that is not wanted any more (its view left) leaves the ask stored,
    // untouched, and answers 'changed'. Nothing is ever taken out and put back.
    if (when) { let ok = false; try { ok = when() === true; } catch { ok = false; } if (!ok) return 'changed'; }
    return list.filter((r) => r.askId !== was.askId);
  });
}

/** The shown account's draft records; 'unreadable' as readScriptAsks. With `account`: only while it is the shown one. */
export function readDraftRecords(account?: string): DraftRecord[] | 'unreadable' {
  const acct = shownAccount();
  if (!acct || (account !== undefined && account !== acct)) return [];
  const v = readValue();
  if (v === 'unreadable') return 'unreadable';
  return [...(v.drafts[acct] ?? [])];
}

/** Stores a draft record (compare-and-set as putScriptAsk): new when `prev` is null and none of its draftId is stored, else in
 *  place of the stored one while it is exactly `prev`. 'changed' otherwise: another tab moved it since the caller's read. */
export function putDraftRecord(rec: DraftRecord, prev: DraftRecord | null): Promise<ScriptAskWrite> {
  const copy = copyDraft(rec);
  const was = prev === null ? null : copyDraft(prev);
  if (!copy || (prev !== null && (!was || was.draftId !== copy.draftId))) return Promise.resolve('invalid');
  return rmwBoth((asks, drafts) => {
    const i = drafts.findIndex((r) => r.draftId === copy.draftId);
    const cur = i < 0 ? null : (drafts[i] as DraftRecord);
    if (was === null ? cur !== null : cur === null || !sameDraftRecord(cur, was)) return 'changed';
    return { asks: [...asks], drafts: i < 0 ? [...drafts, copy] : drafts.map((r, j) => (j === i ? copy : r)) };
  });
}

/** Admits a new draft record for the shown account in ONE write under the store lock (fail closed: no lock, no write). Its
 *  draftId must still be absent ('changed' otherwise: another tab admitted it). Under DRAFTS_MAX it is added. When full,
 *  `victimOf` (the caller's policy) is asked, under the same lock, for at most one record to drop, given the drafts and asks
 *  as stored now; its removal and the new record's insert are the same write, so neither happens without the other.
 *  Nothing named: 'full', nothing written. `dropped` is the record removed, only when the write is 'ok'. Every other put
 *  still refuses at the cap; this is the one place a record is pushed out, and only one the caller named. */
export async function admitDraftRecord(rec: DraftRecord, victimOf: (drafts: readonly DraftRecord[], asks: readonly ScriptAsk[]) => DraftRecord | null): Promise<{ w: ScriptAskWrite; dropped: DraftRecord | null }> {
  const copy = copyDraft(rec);
  if (!copy) return { w: 'invalid', dropped: null };
  let dropped: DraftRecord | null = null;
  const w = await rmwBoth((asks, drafts) => {
    dropped = null;
    if (drafts.some((r) => r.draftId === copy.draftId)) return 'changed';
    if (drafts.length < DRAFTS_MAX) return { asks: [...asks], drafts: [...drafts, copy] };
    let v: DraftRecord | null;
    try { v = victimOf(drafts, asks); } catch { return 'refused'; }
    if (!v || !drafts.some((r) => sameDraftRecord(r, v))) return 'full';
    dropped = v;
    return { asks: [...asks], drafts: [...drafts.filter((r) => r.draftId !== v.draftId), copy] };
  });
  return { w, dropped: w === 'ok' ? dropped : null };
}

/** Removes a draft record only while it is exactly `prev` ('ok' only to the call that removed it). */
export function dropDraftRecord(prev: DraftRecord): Promise<ScriptAskWrite> {
  const was = copyDraft(prev);
  if (!was) return Promise.resolve('invalid');
  return rmwBoth((asks, drafts) => {
    const cur = drafts.find((r) => r.draftId === was.draftId);
    if (!cur || !sameDraftRecord(cur, was)) return 'changed';
    return { asks: [...asks], drafts: drafts.filter((r) => r.draftId !== was.draftId) };
  });
}

// This tab's version of the store: it moves on every write this tab made ('ok') and on every storage event of the
// key from another tab, so a view re-reads (readScriptAsks) when it moves.
let version = 0;
const listeners = createListeners();
function changed(): void { version++; listeners.emit(); }
// The host's external-change registration while a listener is subscribed (web: the window 'storage' event).
let offOtherTab: (() => void) | null = null;
const onOtherTab = (key: string | null): void => { if (key === SCRIPT_ASKS_KEY || key === null) changed(); };
// A registration made while the env is still unresolved is held until it resolves; resolving now attaches it, so no event
// from the moment of subscribing is missed. A failure to resolve drops the registration and reaches the caller.
function attached(off: () => void): () => void {
  try { settleHostEnv(); } catch (e) { off(); throw e; }
  return off;
}
/** Called on every write this tab made ('ok', drops included) and on every other tab's change of the key: the
 *  version's own subscription (useScriptAsksVersion), for a non-React listener. Returns the unsubscribe. */
export function subscribeVersion(fn: () => void): () => void {
  if (listeners.size === 0) offOtherTab = attached(hostEnv().onExternalChange((_area, key) => { onOtherTab(key); }));
  const off = listeners.add(fn);
  return () => { off(); if (listeners.size === 0 && offOtherTab) { const o = offOtherTab; offOtherTab = null; o(); } };
}
export const scriptAsksVersion = (): number => version;
/** React: re-render when this tab writes the asks or another tab changes them (read readScriptAsks() in the render). */
export function useScriptAsksVersion(): number { return useSyncExternalStore(subscribeVersion, scriptAsksVersion, scriptAsksVersion); }

/** Called when another tab changed the key (its storage event, or a whole clear). */
export function subscribeScriptAsks(fn: () => void): () => void {
  return attached(hostEnv().onExternalChange((_area, key) => { if (key === SCRIPT_ASKS_KEY || key === null) fn(); }));
}
