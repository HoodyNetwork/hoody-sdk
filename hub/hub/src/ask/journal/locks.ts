// locks.ts: the Web Locks the journal takes.
//   holdLock(name)        the send door's lock. Without Web Locks the page holds it at once (no other tab to guard against).
//   holdStrict(name)      FAILS CLOSED: no Web Locks, a name the browser refuses, or a request that throws or rejects => it rejects.
//   holdChatLock          hub-ai-first:<acct>|<h>|<r>|<k1>   one first message of one chat at a time (the engine's gate)
//   withRecsLock          hub-ai-recs:<acct>                 every read-modify-write of the record document (records.ts)
//   withDockLock          hub-ask-dock:<acct>                every writer of the dock's store hub_ask_v1 (migrate.ts dockApply / dockRemove; registry.ts)
//   holdIfFree            hub-ai-fork:<digest>               one claim or Check of one fork target at a time; never waited for
// Lock order (fixed): hub-ai-fork:* (try only) -> hub-ai-first:* -> hub-ai-send:<key> / hoody-agent-decide:* -> hub-ai-recs:<acct> (innermost). The recs lock is
// held only across one synchronous updateStore call, never across an io call or another lock request.
// The recs lock is defense in depth, not a transaction: the browser has no compare-and-set across tabs (entries.ts says so).
import { hostEnv } from '@core/host-env';

interface Locks { request(name: string, o: { ifAvailable: boolean }, cb: (lock: unknown) => unknown): Promise<unknown>; request(name: string, cb: () => unknown): Promise<unknown> }
export function locks(): Locks | null {
  try {
    // The host's locks: the browser's Web Locks on the web, the session's own in a terminal Hub (core/host-env).
    const l = hostEnv().locks as unknown as Locks | null;
    return l && typeof l.request === 'function' ? l : null;
  } catch { return null; }
}
export const LOCKABLE = /^[\x21-\x7e]{1,200}$/;
export const LOCK_REFUSED = Symbol('lockRefused');
export interface Hold { held: Promise<() => void>; cancel(): void }

function take(name: string, strict: boolean): Hold {
  const l = locks();
  if (!l) return strict ? { held: Promise.reject(LOCK_REFUSED), cancel: () => {} } : { held: Promise.resolve(() => {}), cancel: () => {} };
  if (!LOCKABLE.test(name)) return { held: Promise.reject(LOCK_REFUSED), cancel: () => {} };
  let cancelled = false;
  let release: () => void = () => {};
  const held = new Promise<() => void>((resolve, reject) => {
    const gate = new Promise<void>((res) => { release = res; });
    try {
      l.request(name, () => { if (cancelled) return undefined; resolve(() => release()); return gate; }).catch(() => reject(LOCK_REFUSED));
    } catch { reject(LOCK_REFUSED); }
  });
  held.catch(() => {});
  return { held, cancel: () => { if (cancelled) return; cancelled = true; release(); } };
}
/** Takes a Web Lock; the promise rejects with LOCK_REFUSED when the browser refuses it. Without Web Locks the page holds it at
 *  once. cancel() gives the lock back the moment it is granted. */
export function holdLock(name: string): Hold { return take(name, false); }
/** Like holdLock, but without Web Locks (or with a refusal) it rejects: it never holds a lock without exclusion. */
export function holdStrict(name: string): Hold { return take(name, true); }

const enc = (s: string): string => encodeURIComponent(s);
export const chatLockName = (acct: string, h: string, r: string, k1: string): string => `hub-ai-first:${enc(acct)}|${h}|${r}|${k1}`;
export const recsLockName = (acct: string): string => `hub-ai-recs:${enc(acct)}`;
export const dockLockName = (acct: string): string => `hub-ask-dock:${enc(acct)}`;

export type ChatHold = { ok: true; release: () => void } | { ok: false; why: 'refused' | 'timeout' };
/** The chat lock, strict. `bound`: the wait ends after `ms` on the caller's clock (the engine's), the hold is cancelled and nothing runs. */
export async function holdChatLock(
  acct: string, h: string, r: string, k1: string,
  bound?: { ms: number; set(fn: () => void, ms: number): unknown; clear(id: unknown): void },
): Promise<ChatHold> {
  const hold = holdStrict(chatLockName(acct, h, r, k1));
  let timer: unknown = null;
  const timedOut = new Promise<'timeout'>((res) => { if (bound) timer = bound.set(() => res('timeout'), bound.ms); });
  try {
    const got = await Promise.race([hold.held.then((release) => ({ release }), () => ({ refused: true as const })), timedOut]);
    if (got === 'timeout') { hold.cancel(); return { ok: false, why: 'timeout' }; }
    if ('refused' in got) return { ok: false, why: 'refused' };
    return { ok: true, release: got.release };
  } finally { if (bound && timer !== null) bound.clear(timer); }
}

/** Runs `fn` (synchronous) while this page holds the account's record-document lock. ran:false: the lock could not be had. */
export async function withRecsLock<T>(acct: string, fn: () => T): Promise<{ ran: true; v: T } | { ran: false }> {
  const hold = holdStrict(recsLockName(acct));
  let release: () => void;
  try { release = await hold.held; } catch { return { ran: false }; }
  try { return { ran: true, v: fn() }; } finally { try { release(); } catch { /* released */ } }
}

/** Runs `fn` (synchronous) while this page holds the account's dock-store lock (every writer of hub_ask_v1 takes it, in every tab).
 *  ran:false: the lock could not be had (no Web Locks, a refused name, a rejected request): nothing ran, nothing is written. */
export async function withDockLock<T>(acct: string, fn: () => T): Promise<{ ran: true; v: T } | { ran: false }> {
  const hold = holdStrict(dockLockName(acct));
  let release: () => void;
  try { release = await hold.held; } catch { return { ran: false }; }
  try { return { ran: true, v: fn() }; } finally { try { release(); } catch { /* released */ } }
}
/** Whether this browser can take the dock lock at all: without Web Locks, Clear is not offered (dock writes still run, unlocked). */
export const dockLockAvailable = (): boolean => locks() !== null;

// ---- the fork target lock T ---------------------------------------------------------------------
// One fork target (account, handle, realm, parent, turn) is claimed, posted, checked or hidden by one operation at a time. T is only
// ever TRIED (`ifAvailable`): nothing waits for it, no lease, no clock. A hold ends with release() or with the page.
declare const forkHoldBrand: unique symbol;
export interface ForkHold { readonly name: string; release(): void; readonly [forkHoldBrand]: true }
/** The account, handle and realm an operation was started for (acct = currentAccount() at its start). */
export interface OpScope { acct: string; h: string; r: string }
/** The fork origin a record carries (records.ts AskRecord['fk']): the parent chat and the turn index (null = the whole chat). */
export interface ForkRef { s: string; i: number | null; bad?: true }

const FNV_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;
/** FNV-1a over the UTF-8 bytes, 64 bits, from `basis` (two distinct bases give two independent halves). */
function fnv64(text: string, basis: bigint): string {
  let h = basis;
  for (const b of new TextEncoder().encode(text)) h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK64;
  return h.toString(16).padStart(16, '0');
}
const digestName = (parts: readonly unknown[]): string => {
  const j = JSON.stringify(parts);
  return `hub-ai-fork:${fnv64(j, 0xcbf29ce484222325n)}${fnv64(j, 0x84222325cbf29ce4n)}`;
};
/** T of one fork target: 44 characters, always LOCKABLE. A collision only over-excludes. */
export const forkLockName = (acct: string, h: string, r: string, fk: { s: string; i: number | null }): string => digestName(['fork', acct, h, r, fk.s, fk.i ?? null]);
/** T of a record whose origin cannot be read (fk.bad): scoped to its own create key, deterministic. */
export const badForkLockName = (acct: string, h: string, r: string, k1: string): string => digestName(['bad', acct, h, r, k1]);
/** The one place that says which T a stored fork record is under. */
export const lockNameOf = (rec: { k1: string; fk?: ForkRef }, scope: OpScope): string =>
  rec.fk && !rec.fk.bad ? forkLockName(scope.acct, scope.h, scope.r, rec.fk) : badForkLockName(scope.acct, scope.h, scope.r, rec.k1);

/** Tries T: the hold when this page got it, null when another holder has it. Rejects LOCK_REFUSED when Web Locks are absent or refuse the
 *  name (it never reports a free lock it could not take). Every caller re-checks its scope right after the grant (late grant rule). */
export function holdIfFree(name: string): Promise<ForkHold | null> {
  const l = locks();
  if (!l || !LOCKABLE.test(name)) return Promise.reject(LOCK_REFUSED);
  return new Promise<ForkHold | null>((resolve, reject) => {
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    const hold = { name, release: () => release() } as unknown as ForkHold;
    try {
      l.request(name, { ifAvailable: true }, (lock) => { if (!lock) { resolve(null); return undefined; } resolve(hold); return gate; }).catch(() => reject(LOCK_REFUSED));
    } catch { reject(LOCK_REFUSED); }
  });
}
