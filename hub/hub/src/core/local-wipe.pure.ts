// The pure part of local-wipe.ts (split out so the terminal build shares it; the contract is at the top of
// local-wipe.ts): the warning before a wipe and its freshness. local-wipe.ts re-exports the public names and keeps the
// storage, IndexedDB and wipe steps. shownAccount, payments and storedWarning are for local-wipe.ts.
import type { HoldRef } from './change-store';
import { ATTEMPT_PREFIX, readChangesState } from './change-store';
import { attemptHoldRefsIn } from './attempts';
import { changeHoldRefsIn } from './changes';
import { paymentsSettled } from './commerce';
import { snapshot } from './ctx';
import { leaveCount } from './leave';
import { signOutHolds } from './lifecycle';
import { readScriptAsks, sameScriptAsk, type ScriptAsk } from './script-asks';

/** One hold the confirm names: its ref (passed back unchanged) and the page that sent it, when its record says. */
export interface WipeHold {
  readonly ref: HoldRef;
  /** The sending page's id ('computers'), or null (an attempt, or a record that names none). */
  readonly page: string | null;
}
export interface LocalWipeWarning {
  readonly account: string;
  readonly holds: readonly WipeHold[];
  readonly asks: readonly ScriptAsk[];
  /** Whether a payment's outcome is open in this browser, any account (commerce paymentsSettled). */
  readonly payments: 'settled' | 'held' | 'unreadable';
  /** Work running from this tab (leave.ts leaveCount); the sign-out cuts it. Absent: none. */
  readonly running?: number;
}
/** A store the wipe could not read or list. */
export type WipeCheck = 'storage' | 'databases' | 'caches' | 'changes' | 'asks' | 'payments';
/** What Remove all local data did (see the contract). Only 'started' signed out. */
export type LocalWipe =
  | { readonly kind: 'started' }
  | { readonly kind: 'tabs' }
  | { readonly kind: 'payments' }
  | { readonly kind: 'unchecked'; readonly what: readonly WipeCheck[] }
  /** The host's local store cannot remove its keys now (KeyValueStore.cannotDelete; the terminal's store). */
  | { readonly kind: 'store'; readonly why: 'busy' | 'failed' }
  | { readonly kind: 'changed' }
  | { readonly kind: 'failed' };

/** The page each stored change record names (its meta.page), by record id. */
function pagesOfRecords(): Map<string, string> {
  const out = new Map<string, string>();
  const rd = readChangesState();
  if (rd.state === 'unreadable') return out;
  for (const r of rd.list) {
    const page = (r.meta as { page?: unknown } | undefined)?.page;
    if (typeof page === 'string' && /^[a-z0-9-]+$/.test(page)) out.set(r.id, page);
  }
  return out;
}

export function shownAccount(): string | null {
  try {
    const s = snapshot();
    return s.loggingOut ? null : s.account || null;
  } catch {
    return null;
  }
}

export function payments(): LocalWipeWarning['payments'] {
  try { return paymentsSettled(); } catch { return 'unreadable'; }
}

/** What the confirm shows now (see the contract). */
export function localWipeWarning(): LocalWipeWarning | null {
  const account = shownAccount();
  if (!account) return null;
  const pages = pagesOfRecords();
  const holds = signOutHolds().map((ref) => ({ ref, page: ref.id.startsWith(ATTEMPT_PREFIX) ? null : (pages.get(ref.id) ?? null) }));
  let asks: readonly ScriptAsk[] = [];
  try {
    const a = readScriptAsks(account);
    asks = a === 'unreadable' ? [] : a;
  } catch { /* unreadable: the check before the sign-out refuses */ }
  return { account, holds, asks, payments: payments(), running: leaveCount() };
}

/** `account`'s holds and asks from storage alone (the wipe's last check, when no account shows any more), with the
 *  same predicates as signOutHolds. null when the change store or the asks cannot be read (never taken for empty). */
export function storedWarning(account: string): LocalWipeWarning | null {
  const rd = readChangesState();
  if (rd.state !== 'clean') return null;
  const now = Date.now();
  const holds = [...changeHoldRefsIn(rd.list, account, now), ...attemptHoldRefsIn(rd.list, account, now)].map((ref) => ({ ref, page: null }));
  const asks = readScriptAsks(account);
  if (asks === 'unreadable') return null;
  return { account, holds, asks, payments: payments() };
}

const holdKey = (h: HoldRef): string => h.id + '\u0000' + h.token;
/** Every hold and ask of `now` is one `was` named, as it was named (a hold that became a send still out, or an ask
 *  that moved on, is new), and no more work runs than `was` named. Payments are judged on their own (they refuse
 *  whenever they are not settled). */
export function warningWithin(now: LocalWipeWarning, was: LocalWipeWarning): boolean {
  if (now.account !== was.account) return false;
  if ((now.running ?? 0) > (was.running ?? 0)) return false;
  const holds = new Map(was.holds.map((h) => [holdKey(h.ref), h.ref.sending === true]));
  if (!now.holds.every((h) => holds.has(holdKey(h.ref)) && (h.ref.sending !== true || holds.get(holdKey(h.ref)) === true))) return false;
  return now.asks.every((a) => was.asks.some((b) => sameScriptAsk(a, b)));
}
