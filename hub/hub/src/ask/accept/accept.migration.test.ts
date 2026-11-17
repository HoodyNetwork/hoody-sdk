// Acceptance, group MIGRATION: an earlier release's evidence (hub_ask_v1) is copied once into
// hub_ai_mig_v1 compactly, never comes back once dismissed, never exceeds the stores' budgets, and stays visible while it waits.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { writeStore } from '../data';
import { ACCOUNT, HANDLE, MIG, REALM, REQ, slot, storedKeys, world, type World } from './env';
import * as S from './seam';
import { seedEntryForTests } from '../journal/testing';
import { addMember, addTomb, cloneMig, collect, dayOf, emptyMig, hasTomb, isMember, removeMember, sizeOf, TOMB_MIN_AGE_DAYS, DAY_MS, b64, type Group } from '../journal/migstore';
import { MIG_IMPORT_MAX, MIG_TOTAL_MAX } from '../journal';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
const rid = (n: number) => 'hx-' + n.toString(16).padStart(24, '0');
const rec = (n: number, o: Partial<S.AskRecord> = {}): S.AskRecord => ({ p: slot.project, c: slot.computer, r: REALM, s: 'sess-' + n, t: null, k1: hex(n), k2: hex(n + 1), rc: 'custom', n: null, at: 5 + n, i: null, q: 0, ph: 'sending', l: 'en', w: true, ...o } as S.AskRecord);
/** A record carrying an earlier release's maximum of evidence: k1 (no session), k2, 16 kw, 8 k3, 16 da = 42 keys. */
const fat = (n: number): S.AskRecord => rec(n, { s: null, kw: Array.from({ length: 16 }, (_, i) => hex(n + 10 + i)), k3: Array.from({ length: 8 }, (_, i) => hex(n + 30 + i)), da: Object.fromEntries(Array.from({ length: 16 }, (_, i) => ['G' + i, rid(n * 100 + i)])) } as any);
const handleOf = () => HANDLE;
const legacyKeys = (r: S.AskRecord): string[] => [...(r.s === null ? [r.k1] : []), ...(r.w ? [r.k2] : []), ...(r.kw ?? []), ...(r.k3 ?? []), ...Object.values(r.da ?? {})];
const shown = (j: S.J.Journal): string[] => { const s = j.scan(); return s.s === 'ok' ? s.entries.map((e) => e.k) : []; };
const migDoc = (fs: any) => JSON.parse(fs.peek(MIG)).a[ACCOUNT];
const setMig = (fs: any, doc: unknown) => { const raw = JSON.parse(fs.peek(MIG)); raw.a[ACCOUNT] = doc; fs.seed(MIG, JSON.stringify(raw)); };
const legacyWrite = (recs: S.AskRecord[]) => expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: recs } } as any)).toBe(true);

describe('what was dismissed stays gone; what the old tab writes later is imported; the dock never invents a record', () => {
  it('no resurrection: import A while U stays unresolved, dismiss A, a readable snapshot [U], an old tab writes [A, U]: A is not back', () => {
    w = world();
    const A = rec(1), U = rec(3, { c: 'comp-u' });
    const h = (c: string) => (c === 'comp-u' ? null : HANDLE);
    expect(S.migrate(w.j, [A, U], h)).toBe(1);
    expect(S.dismiss(w.j, { h: HANDLE, k: A.k2 })).toBe(true);
    S.migrate(w.j, [U], h);
    S.migrate(w.j, [A, U], h);
    expect(S.hasEntry(w.j, HANDLE, A.k2)).toBe(false);
    expect(S.migrationDone(w.j)).toBe(false);
  });
  it('a record with one dismissed key and one new key still imports the new one (all or none is about room, not about history)', () => {
    w = world();
    const r1 = rec(1, { kw: [hex(900)] } as any);
    S.migrate(w.j, [r1], handleOf);
    expect(S.dismiss(w.j, { h: HANDLE, k: r1.k2 })).toBe(true);
    const r2 = { ...r1, kw: [hex(900), hex(901)] } as S.AskRecord;     // the old tab adds a newer follow-up to the same record
    S.migrate(w.j, [r2], handleOf);
    expect(S.hasEntry(w.j, HANDLE, hex(901))).toBe(true);
    expect(S.hasEntry(w.j, HANDLE, r1.k2)).toBe(false);
  });
  it('evidence written after a run that had nothing left is imported on the next trigger', () => {
    w = world();
    S.migrate(w.j, [], handleOf);
    expect(S.migrationDone(w.j)).toBe(true);
    const late = rec(5);
    expect(S.migrate(w.j, [late], handleOf)).toBe(1);
    expect(S.hasEntry(w.j, HANDLE, late.k2)).toBe(true);
    expect(S.migrationDone(w.j)).toBe(true);
  });
  it('dockApply never introduces a record whose session is null into the source, and a migration between the save and the admit cannot block a create', () => {
    w = world();
    S.migrate(w.j, [], handleOf);                                   // registers the computer directory (D1 needs it)
    const draft = rec(7, { s: null, w: undefined });
    expect(w.j.dockApply(ACCOUNT, { k: 'put', rec: draft } as any)).toBe(true);
    const src = S.J.legacyRead();
    expect(src.s === 'ok' ? src.v.some((x) => x.k1 === draft.k1) : false, 'the source holds a session-less record').toBe(false);
    S.migrate(w.j, [], handleOf);                                   // fired between the save and the admit
    const k = w.j.mint('create')!;
    expect('kind' in (w.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'create', key: k } as any, S.newToken()) as object)).toBe(false);
  });
});

describe('budgets', () => {
  it('8 records x 42 keys import into a journal that already holds 130 entries: all 336 keys are visible and no account value passes 65,536', () => {
    w = world();
    for (let i = 0; i < 130; i++) expect(seedEntryForTests(w.j, { k: hex(900 + i), kind: 'turn', h: HANDLE, r: REALM, s: 'sess-z', c: hex(1), ct: slot.computer, at: 1 })).toBe('ok');
    const recs = Array.from({ length: 8 }, (_, i) => fat(10_000 + i * 100));
    const want = recs.flatMap(legacyKeys);
    expect(want).toHaveLength(336);
    expect(S.migrate(w.j, recs, handleOf)).toBe(8);
    const seen = new Set(shown(w.j));
    expect(want.filter((k) => !seen.has(k))).toEqual([]);
    expect(seen.size).toBe(130 + 336);
    expect(w.fs.peek(MIG)!.length).toBeLessThanOrEqual(65_536);
    expect(w.fs.peek(REQ)!.length).toBeLessThanOrEqual(65_536);
  });
  it('with hub_ai_mig_v1 at its import limit the import waits, the evidence stays in the source and visible, and a create is still admitted', () => {
    w = world();
    S.migrate(w.j, [rec(1)], handleOf);
    const doc = migDoc(w.fs);
    const today = Object.keys(doc.t).sort().pop()!;
    // young tombstones are never collected: fill the value up to the import limit with them
    let pad = 0;
    while (JSON.stringify(doc).length < MIG_IMPORT_MAX - 40) doc.t[today] += '.' + b64(rid(900_000 + pad++))!;
    setMig(w.fs, doc);
    const R = fat(20_000);
    legacyWrite([R]);
    expect(S.migrate(w.j, [R], handleOf)).toBe(0);
    const seen = new Set(shown(w.j));
    expect(legacyKeys(R).filter((k) => !seen.has(k)), 'a waiting key is invisible').toEqual([]);
    const k = w.j.mint('create')!;
    expect('kind' in (w.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'create', key: k } as any, S.newToken()) as object)).toBe(false);
    // D3/D4: a dock write that no longer holds the record keeps its evidence in the source
    // The engine drops R: a reference that still carries evidence nothing covers is refused (false), and its evidence stays in the source.
    expect(w.j.dockApply(ACCOUNT, { k: 'drop', p: R.p, c: R.c, r: R.r, k1: R.k1 })).toBe(false);
    const src = S.J.legacyRead();
    expect(src.s === 'ok' && src.v.some((x) => x.k1 === R.k1), 'the evidence left the source with nothing to hold it').toBe(true);
  });
  it('dismissing every member of a full hub_ai_mig_v1 never fails on budget', () => {
    w = world();
    const recs = Array.from({ length: 8 }, (_, i) => fat(30_000 + i * 100));
    S.migrate(w.j, recs, handleOf);
    const doc = migDoc(w.fs);
    const today = Object.keys(doc.t).sort().pop()!;
    let pad = 0;
    while (JSON.stringify(doc).length < MIG_TOTAL_MAX - 60) doc.t[today] += '.' + b64(rid(800_000 + pad++))!;
    setMig(w.fs, doc);
    for (const k of recs.flatMap(legacyKeys)) expect(S.dismiss(w.j, { h: HANDLE, k }), k).toBe(true);
    expect(w.fs.peek(MIG)!.length).toBeLessThanOrEqual(MIG_TOTAL_MAX + 200);
  });
});

describe('members and tombstones', () => {
  it('da {G:K1} imported, an old tab then writes da {G:K2}: both are members; dismissing K1 leaves K2', () => {
    w = world();
    const r1 = rec(1, { w: false, da: { G: rid(1) } } as any), r2 = { ...r1, da: { G: rid(2) } } as S.AskRecord;
    S.migrate(w.j, [r1], handleOf);
    S.migrate(w.j, [r2], handleOf);
    expect(S.hasEntry(w.j, HANDLE, rid(1))).toBe(true);
    expect(S.hasEntry(w.j, HANDLE, rid(2))).toBe(true);
    expect(S.dismiss(w.j, { h: HANDLE, k: rid(1) })).toBe(true);
    expect(S.hasEntry(w.j, HANDLE, rid(1))).toBe(false);
    expect(S.hasEntry(w.j, HANDLE, rid(2))).toBe(true);
  });
  it('every member removal shrinks the value; a removal on a later day renames the newest bucket and never grows it; t is never empty', () => {
    const g: Group = [HANDLE, REALM, 's', hex(1), slot.computer, 1];
    const m = emptyMig(100);
    const keys = Array.from({ length: 60 }, (_, i) => rid(i + 1));
    for (const k of keys) expect(addMember(m, g, 'd', k, 'G')).toBe(true);
    let day = 100;
    for (const k of keys) {
      const before = sizeOf(m);
      day += k === keys[30] ? 1 : 0;                                  // one removal on a later day
      expect(removeMember(m, k, day)).toBe('removed');
      expect(sizeOf(m), k).toBeLessThanOrEqual(before);
      expect(Object.keys(m.t).length).toBeGreaterThan(0);
      expect(hasTomb(m, k)).toBe(true);
    }
    expect(Object.keys(m.m)).toEqual([]);
    expect(m.g.length, 'the last member out leaves no group').toBe(0);
  });
  it('a source holding more than an import can take shows the rest as source rows; a dismissal tombstones it and an old-tab write does not bring it back', () => {
    w = world();
    S.migrate(w.j, [rec(1)], handleOf);
    const doc = migDoc(w.fs);
    const today = Object.keys(doc.t).sort().pop()!;
    let pad = 0;
    while (JSON.stringify(doc).length < MIG_IMPORT_MAX - 40) doc.t[today] += '.' + b64(rid(700_000 + pad++))!;
    setMig(w.fs, doc);
    const R = rec(50_000, { kw: [hex(50_050)] } as any);
    legacyWrite([R]);
    expect(S.migrate(w.j, [R], handleOf)).toBe(0);
    const row = (w.j.scan(HANDLE) as any).entries.find((e: any) => e.k === R.k2);
    expect(row?.m).toBe(2);
    expect(S.dismiss(w.j, { h: HANDLE, k: R.k2 })).toBe(true);
    legacyWrite([R]);                                                 // the old tab writes it again
    S.migrate(w.j, [R], handleOf);
    expect(S.hasEntry(w.j, HANDLE, R.k2), 'a dismissed source row came back').toBe(false);
  });
  it('tombstones younger than 7 days, or still in the source, are never collected; older ones go oldest first and only under a limit', () => {
    const m = emptyMig(10);
    const old = rid(1), young = rid(2), stillThere = rid(3);
    m.t = { '10': '.' + b64(old) + '.' + b64(stillThere), '20': '.' + b64(young) };
    expect(collect(cloneMig(m), 20 + TOMB_MIN_AGE_DAYS - 1 - 10 + 10, () => false, () => true), 'it already fits').toBe(0);
    const c1 = cloneMig(m);
    expect(collect(c1, 20 + 3, (k) => k === stillThere, () => false), 'young bucket 20 is 3 days old; bucket 10 is old').toBe(1);
    expect(hasTomb(c1, old)).toBe(false);
    expect(hasTomb(c1, stillThere), 'still in the source').toBe(true);
    expect(hasTomb(c1, young), 'younger than 7 days').toBe(true);
    void DAY_MS; void dayOf; void addTomb; void isMember;
  });
  it('after the old tab closes, every legacy evidence key is a member or a source row, and source rows can be cleared', () => {
    w = world();
    const recs = Array.from({ length: 4 }, (_, i) => fat(60_000 + i * 100));
    legacyWrite(recs);
    S.migrate(w.j, recs, handleOf);
    const seen = new Set(shown(w.j));
    expect(recs.flatMap(legacyKeys).filter((k) => !seen.has(k))).toEqual([]);
    for (const k of recs.flatMap(legacyKeys)) expect(S.dismiss(w.j, { h: HANDLE, k })).toBe(true);
    expect(shown(w.j)).toEqual([]);
    expect(storedKeys(w.fs)).toEqual([]);
  });
});
