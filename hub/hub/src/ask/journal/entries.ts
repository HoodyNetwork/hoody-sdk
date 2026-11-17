// entries.ts: the journal of REQUESTS (hub_ai_req_v1), the migrated evidence (hub_ai_mig_v1) and the legacy source rows, as one
// scan; the one removal door; the owed-work queue.
//
//   - One entry per request key, "<h>:<k>", written ONCE by the door (put) before its POST and never rewritten.
//   - scan() makes one browser read per store (req, mig, and the legacy source once a migration has named the computers) and is
//     `ok` only when all of them are; an unreadable store is never an empty one. Its entries are the req entries, the mig
//     members (m 1) and the legacy source rows no member or tombstone covers (m 2).
//   - remove(proof) is the ONLY code that deletes an entry, member or source row. A proof is made only in proof.ts. A removal
//     that cannot be done now (unreadable, full, failed, another account) is OWED and retried by sweep().
//   - Nothing else removes or rewrites an entry: no heal, scan, record write, eviction, capacity cap, 404, missing gate, close or
//     account switch. Capacity full refuses the NEW send; it never evicts.
import { legacyRead, currentAccount, readStore, updateStore, REQ_KEY, MIG_KEY } from './storage';
import { addTomb, cloneMig, collect, dayOf, emptyMig, hasTomb, isMember, members, parseMig, removeMember, sizeOf, type Mig } from './migstore';
import { evidenceOf, groupOf, viewOf } from './evidence';
import { isRec, okHandle, okRealm, seg } from './shape';
import { isProof, type RemovalProof } from './proof';
import type { Entry, Kind } from './types';
import type { AskRecord } from '../logic';
import { sameValue } from './same';

/** Bytes of the entry names in hub_ai_req_v1 (checked at admission only). */
export const ENTRIES_MAX = 60_000;
/** hub_ai_mig_v1: an import stays under MIG_IMPORT_MAX; any write stays under MIG_TOTAL_MAX. */
export const MIG_IMPORT_MAX = 44_000;
export const MIG_TOTAL_MAX = 64_000;

export const KINDS: readonly Kind[] = ['create', 'turn', 'message', 'interrupt', 'stop', 'decision', 'answer'];
const KEY = /^hx-[0-9a-f]{24,32}$/;
export const nameOf = (h: string, k: string): string => `${h}:${k}`;

/** The validated entry, or null. Unknown fields are dropped (so a stored text could never survive a read). */
export function validEntry(x: unknown): Entry | null {
  if (!isRec(x)) return null;
  const { k, kind, h, r, s, c, ct, g, gn, f, at } = x;
  if (typeof k !== 'string' || !KEY.test(k) || !(KINDS as readonly unknown[]).includes(kind)) return null;
  if (!okHandle(h) || !okRealm(r) || (s !== null && !seg(s)) || typeof c !== 'string' || !KEY.test(c) || typeof ct !== 'string' || !seg(ct)) return null;
  const e: Entry = { k, kind: kind as Kind, h, r, s: s as string | null, c, ct, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 };
  if (typeof g === 'string' && g && g.length <= 256) e.g = g;
  if (typeof gn === 'number' && Number.isInteger(gn) && gn >= 0) e.gn = gn;
  if (f === 1) e.f = 1;
  return e;
}

export type Scan = { s: 'ok'; acct: string; entries: readonly Entry[] } | { s: 'unreadable' };
export type PutResult = 'ok' | 'account' | 'exists' | 'full' | 'unreadable' | 'failed';
/** What one raw read of an entry's name found. */
export type Peek = { s: 'ok'; acct: string; entry: unknown } | { s: 'missing'; acct: string } | { s: 'unreadable' };

interface Owed { acct: string; run: () => boolean | Promise<boolean> }

export class Entries {
  private owedItems: Owed[] = [];
  private handleOf: ((container: string) => string | null) | null = null;
  private last: Extract<Scan, { s: 'ok' }> | null = null;
  /** No merge rule: the browser has no compare-and-set (a racing overwrite is an accepted
   *  residual): a tab rewrites a whole document from its own read, and a read that has not yet seen another tab's write loses it.
   *  Absence is authoritative: nothing here writes a name back or repeats a removal, so tabs can never fight over one. */
  private subs = new Set<(s: Extract<Scan, { s: 'ok' }>) => void>();
  constructor(private now: () => number = Date.now) {}

  /** Migration names the computers; from then on scan() shows the legacy source rows too. */
  setHandleOf(f: (container: string) => string | null): void { this.handleOf = f; }
  hasHandleOf(): boolean { return this.handleOf !== null; }
  /** The installed resolver itself (never a wrapper that asks this object again). */
  resolver(): ((container: string) => string | null) | null { return this.handleOf; }
  handleFor(container: string): string | null { return this.handleOf ? this.handleOf(container) : null; }
  clock(): number { return this.now(); }

  // ---- reading ----
  /** Parses the req store's value for this account: a plain object of names, or null (corrupt: unreadable). */
  private reqMap(cur: { s: 'ok'; v: unknown } | { s: 'missing' }): Record<string, unknown> | null {
    if (cur.s === 'missing') return {};
    return isRec(cur.v) ? cur.v : null;
  }
  /** The mig value, or null when it is corrupt. */
  private migDoc(cur: { s: 'ok'; v: unknown } | { s: 'missing' }): Mig | null {
    return cur.s === 'missing' ? emptyMig(dayOf(this.now())) : parseMig(cur.v);
  }

  /** A fresh scan: one browser read per store. */
  scan(h?: string): Scan {
    const rq = readStore(REQ_KEY);
    if (rq.s === 'unreadable') return { s: 'unreadable' };
    const map = rq.s === 'missing' ? {} : isRec(rq.v) ? rq.v : null;
    if (map === null) return { s: 'unreadable' };
    const mg = readStore(MIG_KEY);
    if (mg.s === 'unreadable') return { s: 'unreadable' };
    const mig = mg.s === 'missing' ? null : parseMig(mg.v);
    if (mg.s === 'ok' && mig === null) return { s: 'unreadable' };
    const acct = rq.acct;
    if (mg.acct !== acct) return { s: 'unreadable' };
    const out: Entry[] = [];
    for (const name of Object.keys(map)) {
      const e = validEntry(map[name]);
      if (e && name === nameOf(e.h, e.k)) out.push(e);
    }
    if (mig) out.push(...members(mig));
    if (this.handleOf) {
      const src = legacyRead();
      if (src.s === 'unreadable') return { s: 'unreadable' };
      if (src.s === 'ok') {
        if (src.acct !== acct) return { s: 'unreadable' };
        out.push(...this.sourceRows(src.v, mig, new Set(out.map((e) => e.k))));
      }
    }
    const all = h === undefined ? out : out.filter((e) => e.h === h);
    const sc: Extract<Scan, { s: 'ok' }> = { s: 'ok', acct, entries: all };
    if (h === undefined) this.publish(sc);
    return sc;
  }
  /** Legacy evidence nothing covers: not a member, not a tombstone, not an entry. */
  private sourceRows(recs: readonly AskRecord[], mig: Mig | null, have: ReadonlySet<string>): Entry[] {
    const rows: Entry[] = [];
    for (const rec of recs) {
      const g = groupOf(rec, this.handleOf!, rec.at);
      if (!g) continue;
      for (const ev of evidenceOf(rec)) {
        if (have.has(ev.key) || (mig && (isMember(mig, ev.key) || hasTomb(mig, ev.key)))) continue;
        rows.push(viewOf(g, ev, 2));
      }
    }
    return rows;
  }
  /** Display only: a fresh ok scan, else the last ok scan. */
  pending(h?: string): readonly Entry[] {
    const s = this.scan(h);
    if (s.s === 'ok') return s.entries;
    // The last ok scan is shown only for the account shown now (another account's request keys are never displayed).
    if (!this.last || this.last.acct !== currentAccount()) return [];
    return h === undefined ? this.last.entries : this.last.entries.filter((e) => e.h === h);
  }
  /** Only ok scans are published. */
  subscribe(fn: (s: Extract<Scan, { s: 'ok' }>) => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private publish(s: Extract<Scan, { s: 'ok' }>): void {
    const same = this.last && this.last.acct === s.acct && JSON.stringify(this.last.entries) === JSON.stringify(s.entries);
    this.last = s;
    if (!same) for (const f of [...this.subs]) { try { f(s); } catch { /* a listener's own */ } }
  }
  lastScan(): Extract<Scan, { s: 'ok' }> | null { return this.last; }

  /** One raw read of an entry's name in the req store (the door's read-back). */
  peek(name: string): Peek {
    const r = readStore(REQ_KEY);
    if (r.s === 'unreadable') return r;
    if (r.s === 'missing') return { s: 'missing', acct: r.acct };
    if (!isRec(r.v)) return { s: 'unreadable' };
    return Object.prototype.hasOwnProperty.call(r.v, name) ? { s: 'ok', acct: r.acct, entry: r.v[name] } : { s: 'missing', acct: r.acct };
  }

  /** Whether a key is already an entry, a migrated member or a tombstone: one read of each store. null: unreadable (nothing is
   *  covered then). */
  covered(): ((key: string) => boolean) | null {
    const rq = readStore(REQ_KEY), mg = readStore(MIG_KEY);
    if (rq.s === 'unreadable' || mg.s === 'unreadable') return null;
    const map = rq.s === 'missing' ? {} : isRec(rq.v) ? rq.v : null;
    const mig = mg.s === 'missing' ? null : parseMig(mg.v);
    if (map === null || (mg.s === 'ok' && mig === null)) return null;
    const names = new Set<string>();
    for (const n of Object.keys(map)) { const e = validEntry(map[n]); if (e) names.add(e.k); }
    return (key) => names.has(key) || (!!mig && (isMember(mig, key) || hasTomb(mig, key)));
  }

  // ---- writing: the door (admit) and migration only ----
  /** Adds the one name for a NEW send, copying every other name from the same read. Nothing is written for another account, an
   *  existing name, a corrupt store or a full one. */
  put(e: Entry, acct: string): PutResult {
    let why: PutResult | null = null;
    const r = updateStore(REQ_KEY, (cur) => {
      if (currentAccount() !== acct) { why = 'account'; return null; }
      const map = this.reqMap(cur);
      if (map === null) { why = 'unreadable'; return null; }
      const name = nameOf(e.h, e.k);
      if (Object.prototype.hasOwnProperty.call(map, name)) { why = 'exists'; return null; }
      const next = { ...map, [name]: e };
      if (JSON.stringify(next).length > ENTRIES_MAX) { why = 'full'; return null; }
      return { set: next };
    }, { keepOthers: true });
    if (why) return why;
    return r === 'ok' ? 'ok' : r === 'unreadable' ? 'unreadable' : r === 'full' ? 'full' : 'failed';
  }

  // ---- the removal door ----
  /** Removes what the proof names. 'done': gone (or already absent). 'owed': it could not be done now and is retried by sweep(). */
  remove(p: RemovalProof): 'done' | 'owed' {
    if (!isProof(p)) return 'owed';
    if (!this.tryRemove(p)) { this.owe(p.acct, () => this.tryRemove(p)); return 'owed'; }
    return 'done';
  }
  /** One attempt, owing nothing (an owed item's own retry). */
  removeNow(p: RemovalProof): boolean { return isProof(p) && this.tryRemove(p); }
  private tryRemove(p: RemovalProof): boolean {
    if (p.acct !== currentAccount()) return false;
    return p.store === 'req' ? this.removeEntry(p) : this.removeMig(p);
  }
  private removeEntry(p: RemovalProof): boolean {
    const name = nameOf(p.h, p.k);
    let blocked = false;
    const r = updateStore(REQ_KEY, (cur) => {
      if (currentAccount() !== p.acct) { blocked = true; return null; }
      const map = this.reqMap(cur);
      if (map === null) { blocked = true; return null; }
      if (!Object.prototype.hasOwnProperty.call(map, name)) return null;
      // A request that never left removes only the value its own admission wrote.
      if (p.by === 'neverLeft' && !sameValue(map[name], p.written)) { blocked = true; return null; }
      const next = { ...map };
      delete next[name];
      return Object.keys(next).length ? { set: next } : { remove: true };
    }, { keepOthers: true });
    return !blocked && (r === 'ok' || r === 'same');
  }
  /** A migrated member becomes a tombstone; a source row (no member) gets one. A member's removal shrinks the value and is never
   *  refused for budget; a source row's is, past MIG_TOTAL_MAX after collection. */
  private removeMig(p: RemovalProof): boolean {
    let blocked = false;
    const r = updateStore(MIG_KEY, (cur) => {
      if (currentAccount() !== p.acct) { blocked = true; return null; }
      const doc = this.migDoc(cur);
      if (doc === null) { blocked = true; return null; }
      const next = cloneMig(doc), day = dayOf(this.now());
      if (isMember(next, p.k)) {
        removeMember(next, p.k, day);
        return { set: next };
      }
      if (hasTomb(next, p.k)) return null;
      if (!addTomb(next, p.k, day)) return null;
      if (sizeOf(next) > MIG_TOTAL_MAX) this.collectFor(next, day, MIG_TOTAL_MAX);
      if (sizeOf(next) > MIG_TOTAL_MAX) { blocked = true; return null; }
      return { set: next };
    }, { keepOthers: true });
    return !blocked && (r === 'ok' || r === 'same');
  }
  /** Collection inside a write that would pass `limit`: tombstones at least 7 days old whose key has left the legacy source. */
  collectFor(doc: Mig, day: number, limit: number): number {
    const src = legacyRead();
    // A source that cannot be read cannot say a key has left it: nothing is collected.
    if (src.s === 'unreadable') return 0;
    const inSource = new Set<string>();
    if (src.s === 'ok') for (const rec of src.v) for (const ev of evidenceOf(rec)) inSource.add(ev.key);
    return collect(doc, day, (k) => inSource.has(k), () => sizeOf(doc) <= limit);
  }

  // ---- owed work ----
  /** Owes `run`: a settlement the store did not keep now (a retry may take a lock, so it may answer later). */
  owe(acct: string, run: () => boolean | Promise<boolean>): void { this.owedItems.push({ acct, run }); }
  owed(): number { return this.owedItems.length + this.sweeping; }
  private sweeping = 0;
  /** Retries the shown account's owed work, one item at a time. Items of another account wait until it is shown again. An item a
   *  running sweep holds is not run again by another call. */
  async sweep(): Promise<void> {
    const acct = currentAccount();
    if (!acct) return;
    const mine = this.owedItems.filter((it) => it.acct === acct);
    if (!mine.length) return;
    this.owedItems = this.owedItems.filter((it) => it.acct !== acct);
    this.sweeping += mine.length;
    const keep: Owed[] = [];
    for (const it of mine) {
      let done = false;
      try { done = await it.run(); } catch { done = false; }
      this.sweeping -= 1;
      if (!done) keep.push(it);
    }
    this.owedItems.push(...keep);
  }
}
