// migrate.ts: an earlier release's evidence (hub_ask_v1, one array of chat records per account) copied into hub_ai_mig_v1, and the
// dock's journaled writer. Migration never closes:
//   - It runs on every trigger the registry names (a computer directory, a storage event, every dock write first).
//   - One `update` of hub_ai_mig_v1: records newest first, a record's keys all or none, while the value stays within
//     MIG_IMPORT_MAX; collection (tombstones at least 7 days old and gone from the source) runs once if the next record does not fit.
//   - An unreadable source concludes nothing. A key that is a member or a tombstone, or is in its record's own `dk`, is never added.
//   - Nothing retained is invisible: scan() shows every uncovered source key as a source row (m 2), so the person can see and
//     clear a request whether or not it could be imported.
//   - dockApply is the dock's StoreIO.apply (one per-key op on the fresh list): only evidence of an earlier release ever reaches the source, and
//     none of it is lost. dockRemove is Clear list's single removal.
import type { AskRecord } from '../logic';
import * as L from '../logic';
import { isLivePhase, recentPhase, sameRec, type DockAnswer, type DockOp } from '../conv';
import { MIG_IMPORT_MAX, type Entries } from './entries';
import { evidenceOf, groupOf } from './evidence';
import { addMember, cloneMig, collect, dayOf, emptyMig, hasTomb, isMember, parseMig, sizeOf, type Mig } from './migstore';
import { MIG_KEY, currentAccount, legacyRead, legacyUpdate, readStore, updateStore, type Tri } from './storage';
import { stripEvidence } from './records';

export class Migrator {
  private done: boolean | null = null;
  constructor(private readonly entries: Entries) {}

  /** The records' evidence copied in. Returns how many records were imported whole. */
  migrate(src: Tri<readonly AskRecord[]>, handleOf: (container: string) => string | null): number {
    this.entries.setHandleOf(handleOf);
    if (src.s === 'unreadable') { this.done = null; return 0; }
    const acct = currentAccount();
    if (src.s === 'missing' || !acct || src.acct !== acct) { this.done = src.s === 'missing' ? true : null; return 0; }
    const recs = [...src.v].sort((a, b) => b.at - a.at);
    const day = dayOf(this.entries.clock());
    const inSource = new Set<string>();
    for (const r of recs) for (const ev of evidenceOf(r)) inSource.add(ev.key);
    let taken = 0;
    const res = updateStore(MIG_KEY, (cur) => {
      if (currentAccount() !== acct) return null;
      const doc = cur.s === 'missing' ? emptyMig(day) : parseMig(cur.v);
      if (doc === null) return null;                              // corrupt: unreadable, never an empty import
      const next = cloneMig(doc);
      let changed = false;
      taken = 0;
      let collected = false;
      for (const rec of recs) {
        const g = groupOf(rec, handleOf, rec.at);
        if (!g) continue;
        const evs = evidenceOf(rec).filter((e) => !isMember(next, e.key) && !hasTomb(next, e.key));
        if (evs.length === 0) { taken++; continue; }
        const build = (): Mig | null => {
          const trial = cloneMig(next);
          for (const ev of evs) if (!addMember(trial, g, ev.kind, ev.key, ev.id)) return null;
          return trial;
        };
        let trial = build();
        if (trial && sizeOf(trial) > MIG_IMPORT_MAX && !collected) {
          // Collection runs once, only as far as this record needs.
          collected = true;
          const over = sizeOf(trial) - MIG_IMPORT_MAX, before = sizeOf(next);
          if (collect(next, day, (k) => inSource.has(k), () => before - sizeOf(next) >= over) > 0) { changed = true; trial = build(); }
        }
        if (!trial || sizeOf(trial) > MIG_IMPORT_MAX) continue;      // waits for room: its keys stay source rows
        next.g = trial.g; next.m = trial.m; next.t = trial.t;
        changed = true; taken++;
      }
      return changed ? { set: next } : null;
    }, { keepOthers: true });
    if (res !== 'ok' && res !== 'same') { this.done = null; return 0; }
    this.done = this.computeDone(recs);
    return res === 'ok' ? taken : 0;
  }
  /** True when the last ok legacy read holds no evidence key that is neither a member nor a tombstone, whether or not its
   *  computer resolves; false when some remains; null when unreadable. */
  private computeDone(recs: readonly AskRecord[]): boolean | null {
    const mg = readStore(MIG_KEY);
    if (mg.s === 'unreadable') return null;
    const doc = mg.s === 'missing' ? null : parseMig(mg.v);
    if (mg.s === 'ok' && doc === null) return null;
    for (const r of recs) for (const ev of evidenceOf(r)) if (!doc || (!isMember(doc, ev.key) && !hasTomb(doc, ev.key))) return false;
    return true;
  }
  migrationDone(): boolean | null { return this.done; }
  noteUnreadable(): void { this.done = null; }

  // ---- the dock writer ----
  /** The dock's StoreIO.apply: ONE per-key operation applied to the fresh stored list, never a snapshot, so a record
   *  another tab added is never dropped by a stale view. D1 migrate first; D2 evidence stripped, never a record whose `s` is null that
   *  the source does not already hold; D3 copy-through of evidence nothing covers (judged on fresh reads; unreadable = all uncovered);
   *  D4 a write that would lose such evidence is refused (false). The order is the stored order with the op applied (no re-sort).
   *  Capacity: a put that leaves more than MAX_RECS rotates out the last settled, evidence-free reference, else is refused
   *  ('recentFull') and writes nothing: no live, unknown or evidence-holding record ever goes. Synchronous and unlocked: the caller
   *  holds the dock lock (index.ts dockApplyLocked) or has no Web Locks. */
  dockApply(account: string, op: DockOp): DockAnswer {
    if (!account || account !== currentAccount()) return false;
    const handleOf = this.entries.resolver();
    // D1
    if (handleOf) this.migrate(legacyRead(), handleOf);
    const covered = this.entries.covered();
    const uncovered = (key: string): boolean => !covered || !covered(key);
    let refused = false, full = false;
    const r = legacyUpdate((stored) => {
      refused = false; full = false;
      if (op.k === 'drop') {
        const old = stored.find((x) => sameRec(x, op));
        if (!old) return null;
        // A reference that still carries evidence nothing covers is kept whole.
        if (keepEvidence(old, uncovered).any) { refused = true; return null; }
        return stored.filter((x) => x !== old);
      }
      const valid = L.validRec(op.rec);
      if (!valid) { refused = true; return null; }
      const base = stripEvidence(valid);
      const old = stored.find((x) => sameRec(x, base));
      // D2: a record whose chat has no session yet is evidence (its k1); only one the source already holds may be written.
      if (!old && base.s === null) return null;
      let rec = base;
      if (old) {
        const kept = keepEvidence(old, uncovered, base);
        // Evidence travels with its identity: a lossless representation that does not fit refuses the write (D4).
        if (kept.refuse) { refused = true; return null; }
        rec = { ...base, ...kept.fields, ...(kept.dk.length || base.dk ? { dk: [...new Set([...(base.dk ?? []), ...kept.dk])].slice(-L.K3_MAX) } : {}) };
      }
      const out = stored.slice();
      const i = old ? out.indexOf(old) : -1;
      if (i >= 0 && !op.front) out[i] = rec;
      else { if (i >= 0) out.splice(i, 1); out.unshift(rec); }
      while (out.length > L.MAX_RECS) {
        const j = lastRotatable(out, rec, uncovered);
        if (j < 0) { full = true; return null; }
        out.splice(j, 1);
      }
      return out;
    });
    if (full) return 'recentFull';
    return !refused && (r === 'ok' || r === 'same');
  }

  /** Clear list: removes the confirmed references from the fresh stored list in ONE legacyUpdate and touches no
   *  other record. A record goes only when it is a confirmed key (same identity and session), `still(rec)` passes on the stored record,
   *  and it holds no evidence nothing covers. Synchronous and unlocked: the caller holds the dock lock. */
  dockRemove(account: string, keys: readonly ClearKey[], still: (rec: AskRecord) => boolean): DockRemoveResult {
    // In-lock account recheck: legacyUpdate reads the shown account when it runs, not when it was queued.
    if (!account || account !== currentAccount()) return { t: 'account_changed' };
    const covered = this.entries.covered();
    const uncovered = (key: string): boolean => !covered || !covered(key);
    let removed: string[] = [];
    const r = legacyUpdate((stored) => {
      removed = [];
      const out = stored.filter((rec) => {
        const k = keys.find((x) => sameRec(x, rec));
        if (!k || !rec.s || rec.s !== k.s) return true;
        if (!still(rec) || keepEvidence(rec, uncovered).any) return true;
        removed.push(rec.k1);
        return false;
      });
      return removed.length ? out : null;
    });
    return r === 'ok' ? { t: 'ok', removed } : { t: r };
  }
}

/** A confirmed Clear candidate: the dock record's identity and the session the server read answered for. */
export interface ClearKey { k1: string; p: string; c: string; r: string; s: string }
export type DockRemoveResult =
  | { t: 'ok'; removed: string[] }
  | { t: 'same' | 'unreadable' | 'full' | 'failed' | 'account_changed' | 'refused' };

/** Index of the last record a put may rotate out, or -1: not the op's own, not live, not unknown (recentPhase), no uncovered evidence. */
function lastRotatable(list: readonly AskRecord[], own: AskRecord, uncovered: (key: string) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i] as AskRecord;
    if (sameRec(x, own)) continue;
    const ph = recentPhase(x);
    if (isLivePhase(ph) || ph === 'unknown') continue;
    if (keepEvidence(x, uncovered).any) continue;
    return i;
  }
  return -1;
}

/** The evidence of a stored record that nothing covers yet, as record fields. `base` is the record the engine now writes over it:
 *  a pending turn key the base no longer points at moves into kw (with its file mark) instead of being renamed by the overlay, and
 *  an uncovered create (s null) cannot become a session record without erasing its key, so that write is refused. */
function keepEvidence(old: AskRecord, uncovered: (key: string) => boolean, base?: AskRecord): { any: boolean; refuse: boolean; fields: Partial<AskRecord>; dk: string[] } {
  const fields: Partial<AskRecord> = {};
  let any = false, refuse = false;
  // Every unresolved turn key of the stored record (its pending k2 and the kw list), normalized against the key the written record
  // will point at: that one is the record's pending key (w / wf), all the others stay in kw / kwf (the parser drops a kw member equal
  // to the current k2, so a key kept in the wrong place would be evidence on disk and none on the next read).
  const pend = new Map<string, boolean>();
  if (old.w && uncovered(old.k2)) pend.set(old.k2, !!old.wf);
  for (const k of old.kw ?? []) if (uncovered(k)) pend.set(k, !!pend.get(k) || (old.kwf ?? []).includes(k));
  const cur = base ? base.k2 : old.k2;
  const kw: string[] = [], kwf: string[] = [];
  for (const [k, f] of pend) {
    if (k === cur) { fields.w = true; if (f) fields.wf = true; }
    else { kw.push(k); if (f) kwf.push(k); }
  }
  if (pend.size) any = true;
  if (kw.length > L.JOURNAL_MAX) refuse = true;
  if (kw.length) { fields.kw = kw; if (kwf.length) fields.kwf = kwf; }
  const k3 = (old.k3 ?? []).filter(uncovered);
  if (k3.length) {
    fields.k3 = k3;
    const c3: Record<string, string> = {};
    for (const k of k3) { const id = old.c3?.[k]; if (id) c3[k] = id; }
    if (Object.keys(c3).length) fields.c3 = c3;
    any = true;
  }
  const da: Record<string, string> = {};
  for (const [g, rid] of Object.entries(old.da ?? {})) if (uncovered(rid)) da[g] = rid;
  if (Object.keys(da).length) { fields.da = da; any = true; }
  if (old.s === null && uncovered(old.k1)) { any = true; if (base && base.s !== null) refuse = true; }
  return { any, refuse, fields, dk: any ? old.dk ?? [] : [] };
}
