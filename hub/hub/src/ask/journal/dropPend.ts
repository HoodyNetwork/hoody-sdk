// dropPend.ts: the journal removals this page has started and not yet settled.
// While a record's removal is queued behind the records lock, the dock's read must not bring that record back as a journal-only
// extra. Pending drops are kept per account, per JOURNAL identity (handle, realm, session, create key), as the live call numbers
// that started them, so one drop settling (kept, refused or thrown) never lifts the hiding of another call's drop of the same record.
//   JDropKey   a journal record's identity; a dock identity (conv.ts idKey: k1, p, c, r) is a different string and does not compile here.
declare const jdropBrand: unique symbol;
export type JDropKey = string & { readonly [jdropBrand]: true };
export const jdropKey = (h: string, r: string, s: string | null, k1: string): JDropKey => JSON.stringify([h, r, s, k1]) as JDropKey;

export class DropPend {
  private readonly m = new Map<string, Map<JDropKey, Set<number>>>();
  private n = 0;
  /** Adds a fresh call number for `key` under `acct` and returns it. */
  registerDrop(acct: string, key: JDropKey): number {
    const n = ++this.n;
    let keys = this.m.get(acct);
    if (!keys) { keys = new Map(); this.m.set(acct, keys); }
    let calls = keys.get(key);
    if (!calls) { calls = new Set(); keys.set(key, calls); }
    calls.add(n);
    return n;
  }
  /** Removes that call's number (from `finally`), then the key and the account when they are empty. */
  releaseDrop(acct: string, key: JDropKey, n: number): void {
    const keys = this.m.get(acct);
    const calls = keys?.get(key);
    if (!keys || !calls) return;
    calls.delete(n);
    if (!calls.size) keys.delete(key);
    if (!keys.size) this.m.delete(acct);
  }
  /** True while any call of `acct` holds a drop of `key`. */
  dropPending(acct: string, key: JDropKey): boolean { return (this.m.get(acct)?.get(key)?.size ?? 0) > 0; }
  /** Whether the account holds any pending drop at all (tests). */
  empty(acct: string): boolean { return !this.m.has(acct); }
}
