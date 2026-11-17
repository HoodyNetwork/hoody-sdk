// Journal store acceptance tests, each written red-first.
// Store level: the dock writer (recursive resolver, copy-through identity), the create handoff (a Kept needs a record), the dock's
// reload of an unknown create, account binding of record views and cached scans, realm isolation of frame settlement, the
// text-file turn, and the cross-tab lost update (narrowed by a merge rule).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeStore, readStore } from '../data';
import { dismissal } from '../journal';
import { bindDestForTests, evidenceOf, recordsForTests, seedEntryForTests } from '../journal/testing';
import * as C from '../conv';
import { ACCOUNT, HANDLE, JOURNAL, KEY, MIG, OTHER, REALM, REQ, posts, showAccount, slot, storedEntries, storedKeys, users, world, type World } from './env';
import * as S from './seam';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const REALM2 = 'e2e2e2e2e2e2e2e2e2e2e2e2';
const hex = (n: number) => 'hx-' + n.toString(16).padStart(32, '0');
const legacy = (computer: string, n: number, sid: string | null = 'sess-9', extra: Record<string, unknown> = {}): S.AskRecord =>
  ({ p: slot.project, c: computer, r: REALM, s: sid, t: null, k1: hex(n), k2: hex(n + 1), rc: 'custom', n: null, at: 5, i: null, q: 0, ph: 'sending', l: 'en', w: true, ...extra } as S.AskRecord);
const legacyList = (): S.AskRecord[] => (readStore(ACCOUNT).a[ACCOUNT] ?? []) as S.AskRecord[];
const entry = (kind: string, k: string, over: Record<string, unknown> = {}) =>
  ({ k, kind, h: HANDLE, r: REALM, s: 'sess-1', c: KEY('1'), ct: slot.computer, at: 1, ...over }) as any;

describe('S1: the dock writer never installs a resolver that calls itself', () => {
  it('a migrated record, then a dock write, then a scan: the scan answers', () => {
    w = world();
    const handleOf = (c: string) => (c === 'comp-a-0001' ? HANDLE : null);
    const A = legacy('comp-a-0001', 1);
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [A] } } as any)).toBe(true);
    S.migrate(w.j, [A], handleOf);
    expect(w.j.dockApply(ACCOUNT, { k: 'put', rec: { ...A, w: undefined } } as any)).toBe(true);
    expect(() => w!.j.scan()).not.toThrow();
    expect(w.j.scan().s).toBe('ok');
    expect(() => w!.j.pending(HANDLE)).not.toThrow();
  });
});

describe('S2: copy-through keeps an unresolved legacy key together with its identity', () => {
  it('the pending turn key k2 of a legacy record is never replaced by the engine\'s new k2 while the migration store is unreadable', () => {
    w = world();
    const A = legacy('comp-a-0001', 1);
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [A] } } as any)).toBe(true);
    w.fs.blockReads(MIG);
    const next = { ...A, k2: hex(99) } as any;
    delete next.w;
    const ok = w.j.dockApply(ACCOUNT, { k: 'put', rec: next } as any);
    const recs = legacyList();
    const holds = recs.some((r) => (r.k2 === A.k2 && r.w) || (r.kw ?? []).includes(A.k2));
    expect(ok === false || holds, 'the write succeeded and the old turn key is nowhere in the source').toBe(true);
  });
  it('a pending turn key that no longer fits among the kept keys refuses the write instead of dropping one', async () => {
    w = world();
    const L = await import('../logic');
    const kw = Array.from({ length: L.JOURNAL_MAX }, (_, i) => hex(200 + i));
    const A = legacy('comp-a-0001', 1, 'sess-9', { kw });
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [A] } } as any)).toBe(true);
    w.fs.blockReads(MIG);
    const next = { ...A, k2: hex(99), kw: undefined } as any;
    delete next.w;
    const ok = w.j.dockApply(ACCOUNT, { k: 'put', rec: next } as any);
    const recs = legacyList();
    const held = new Set(recs.flatMap((r) => [...(r.kw ?? []), ...(r.w ? [r.k2] : [])]));
    expect(ok === false || [...kw, A.k2].every((k) => held.has(k)), 'a pending key was dropped to make room').toBe(true);
  });
  it('S-H3: a kept key that the incoming record makes its current key survives the parse (real serialize-then-parse round trip)', () => {
    w = world();
    const Kold = hex(300), Knew = hex(301);
    const A = legacy('comp-a-0001', 1, 'sess-9', { k2: Knew, kw: [Kold], w: undefined });
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [A] } } as any)).toBe(true);
    expect(evidenceOf(legacyList()[0]!).map((e) => e.key), 'control: the stored record carries Kold').toContain(Kold);
    w.fs.blockReads(MIG);
    const next = { ...A, k2: Kold, kw: undefined } as any;
    delete next.w;
    const ok = w.j.dockApply(ACCOUNT, { k: 'put', rec: next } as any);
    const keys = legacyList().flatMap((r) => evidenceOf(r).map((e) => e.key));
    expect(ok === false || keys.includes(Kold), 'Kold left no evidence after the write').toBe(true);
  });
  it('a legacy create (s null) is not turned into a session record while its evidence is uncovered', () => {
    w = world();
    const A = legacy('comp-a-0001', 1, null, { w: undefined });
    expect(writeStore(ACCOUNT, { v: 1, a: { [ACCOUNT]: [A] } } as any)).toBe(true);
    w.fs.blockReads(MIG);
    const ok = w.j.dockApply(ACCOUNT, { k: 'put', rec: { ...A, s: 'sess-new' } } as any);
    const recs = legacyList();
    expect(!ok || recs.some((r) => r.s === null && r.k1 === A.k1), 'the create evidence was erased').toBe(true);
  });
});

describe('no create leaves unless its chat record was durably written first', () => {
  it('no chat record can be written (storage refuses): nothing is sent, nothing is admitted, the row says it was not sent, retry works', async () => {
    w = world();
    w.fs.blockWrites(JOURNAL);
    const eng = await w.dock();
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(posts(w.agent, 'create'), 'a create left with no chat record behind it').toHaveLength(0);
    expect(storedKeys(w.fs), 'an entry was admitted for a request that never left').toHaveLength(0);
    expect(w.j.owed()).toBe(0);
    expect(users(eng.getSnapshot(), C).some((u: any) => u.state === 'notSent'), 'the row does not say "not sent"').toBe(true);
    w.fs.clearFaults();
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(posts(w.agent, 'create'), 'retry after the storage came back').toHaveLength(1);
  });
});

describe('S3b: a readable chat-record document that holds neither the create nor its destination keeps the entry', () => {
  it('another chat is stored, this one is not', async () => {
    w = world();
    const other = legacy(slot.computer, 40, 'sess-other', { w: undefined, t: 'turn-1' });
    expect(await S.putRecord(w.j, HANDLE, other)).toBe('ok');
    const stored = w.fs.peek(JOURNAL);
    expect(stored).not.toBeNull();
    const eng = await w.dock();
    eng.send('Build me a small dashboard');
    await w.flush(500);
    expect(posts(w.agent, 'create')).toHaveLength(1);
    const sid = (eng as any).record?.s as string | undefined;
    const found = sid ? S.findRecord(w.j, HANDLE, REALM, sid) : null;
    expect(found !== null || storedKeys(w.fs).length === 1, 'the entry went with no chat record kept').toBe(true);
  });
});

describe('S3c: the handoffs of a settled create are Kept only with a record behind them', () => {
  const create = (n: number) => legacy(slot.computer, n, null, { w: undefined });
  it('moveCreate: neither record stored is no handoff; the destination already stored is; the create record moved is', async () => {
    w = world();
    const R = recordsForTests(w.j);
    expect(await S.putRecord(w.j, HANDLE, legacy(slot.computer, 40, 'sess-other', { w: undefined, t: 'turn-1' }))).toBe('ok');
    expect(await R.moveCreate(HANDLE, REALM, hex(50), 'sess-50'), 'a Kept with no record behind it').toBeNull();
    expect(await S.putRecord(w.j, HANDLE, legacy(slot.computer, 50, 'sess-50', { w: undefined, t: 'turn-1' }))).toBe('ok');
    expect(await R.moveCreate(HANDLE, REALM, hex(50), 'sess-50'), 'the destination is stored').not.toBeNull();
    expect(await S.putRecord(w.j, HANDLE, create(60))).toBe('ok');
    expect(await R.moveCreate(HANDLE, REALM, hex(60), 'sess-60')).not.toBeNull();
    expect(S.findRecord(w.j, HANDLE, REALM, 'sess-60')).not.toBeNull();
  });
  it('markUnavailable: no create record stored is no handoff; one already marked gone is', async () => {
    w = world();
    const R = recordsForTests(w.j);
    expect(await S.putRecord(w.j, HANDLE, legacy(slot.computer, 40, 'sess-other', { w: undefined, t: 'turn-1' }))).toBe('ok');
    expect(await R.markUnavailable(HANDLE, REALM, hex(70)), 'a Kept with no record behind it').toBeNull();
    expect(await S.putRecord(w.j, HANDLE, create(70))).toBe('ok');
    expect(await R.markUnavailable(HANDLE, REALM, hex(70))).not.toBeNull();
    expect(await R.markUnavailable(HANDLE, REALM, hex(70)), 'already marked: the same record is still there').not.toBeNull();
  });
});

describe('A6, S8: a view, a record write and a cached scan belong to their account', () => {
  const rec = (sid: string, n = 1) => legacy(slot.computer, n, sid, { w: undefined, t: 'turn-1' });
  it('a record view made for account A neither reads nor writes once B is shown', async () => {
    w = world();
    expect(await S.putRecord(w.j, HANDLE, rec('sess-1'))).toBe('ok');
    const v = w.j.view(HANDLE, 'sess-1');
    showAccount(OTHER);
    expect(v.read(ACCOUNT).a[ACCOUNT] ?? [], 'B\'s store was read under A\'s label').toEqual([]);
    expect(v.write(ACCOUNT, { v: 1, a: { [ACCOUNT]: [rec('sess-1', 2)] } } as any)).toBe(false);
    expect(S.findRecord(w.j, HANDLE, REALM, 'sess-1'), 'A\'s chat was written into B\'s journal').toBeNull();
  });
  it('B holds a chat with the same session id: a view made for A reads none of it', async () => {
    w = world();
    const v = w.j.view(HANDLE, 'sess-1');
    showAccount(OTHER);
    expect(await S.putRecord(w.j, HANDLE, rec('sess-1', 5))).toBe('ok');
    const got = v.read(ACCOUNT).a;
    expect(Object.values(got).flat(), 'B\'s chat was read under A').toEqual([]);
    expect(Object.keys(got).length === 0 || (got[ACCOUNT] ?? []).length === 0).toBe(true);
  });
  it('an unreadable scan after an account switch shows nothing of the account before', () => {
    w = world();
    expect(seedEntryForTests(w.j, entry('turn', hex(7)))).toBe('ok');
    expect(w.j.scan().s).toBe('ok');
    showAccount(OTHER);
    w.fs.blockReads(REQ);
    expect(w.j.pending()).toEqual([]);
    expect(w.j.pending(HANDLE)).toEqual([]);
  });
});

describe('S7: a frame settles only the entries of its own realm', () => {
  it('two realms with the same computer, session and gate: one closure removes one entry', () => {
    w = world();
    expect(seedEntryForTests(w.j, entry('decision', 'hx-' + 'a'.repeat(24), { g: 'G1', gn: 3, c: KEY('1') }))).toBe('ok');
    expect(seedEntryForTests(w.j, entry('decision', 'hx-' + 'b'.repeat(24), { g: 'G1', gn: 3, c: KEY('2'), r: REALM2 }))).toBe('ok');
    const io: any = bindDestForTests({} as any, slot.computer);
    (w.j as any).observe(io, { type: 'gate', r: REALM, sid: 'sess-1', gate: { id: 'G1', generation: 3, kind: 'confirm' }, data: { kind: 'confirm', outcome: 'answered', provenance: 'decision' } });
    expect(storedKeys(w.fs)).toEqual(['hx-' + 'b'.repeat(24)]);
  });
});

describe('S6: a turn that carries only text files goes (the guard judges the wire images, the entry records the files)', () => {
  it('text file alone', async () => {
    w = world();
    const eng = await w.dock();
    eng.send('first');
    await w.flush(500);
    const before = posts(w.agent, 'turn').length;
    const file = { id: 'f1', kind: 'text', name: 'notes.txt', text: 'hello', bytes: 5, lines: 1 };
    expect(eng.send('read this', false, { files: [file] } as any)).toBe(true);
    await w.flush(500);
    expect(posts(w.agent, 'turn').length, 'the guard refused the turn').toBe(before + 1);
  });
});

describe('S6b: a turn with images is the turn that declared files', () => {
  it('the guard accepts images on a files turn and refuses them on a turn that declared none', async () => {
    const { matches } = await import('../journal/door');
    const { routes } = await import('../data');
    const call = (b: unknown) => ({ route: (routes as any).turn, sid: 'sess-1', idem: 'k', realm: REALM, body: b }) as any;
    const op = (files: boolean) => ({ route: 'turn', r: REALM, sid: 'sess-1', key: 'k', files }) as any;
    const img = { attachments: [{ kind: 'image' }] };
    expect(matches(op(true), call(img))).toBe(true);
    expect(matches(op(false), call(img))).toBe(false);
    expect(matches(op(true), call({}))).toBe(true);
    expect(matches(op(false), call({}))).toBe(true);
  });
});

describe('absence is authoritative; no tab writes a name back or repeats a removal', () => {
  it('A admits K and sends; B dismisses it; every storage event A could see, repeated, writes nothing; K stays absent, also after B is gone', () => {
    w = world();
    const K1 = w.j.mint('turn') as string;
    expect(S.beginEntry(w.j, { k: K1, kind: 'turn', h: HANDLE, r: REALM, s: 'sess-1', c: KEY('1'), ct: slot.computer, at: 1 } as any)).toBe('ok');
    expect(S.dismiss(w.jB, { h: HANDLE, k: K1 })).toBe(true);
    expect(storedKeys(w.fs), 'B removed it').toEqual([]);
    const writes = vi.spyOn(w.fs, 'setItem');
    const removes = vi.spyOn(w.fs, 'removeItem');
    for (let i = 0; i < 4; i++) { w.j.scan(); w.j.pending(HANDLE); w.j.sweep(); }   // what a storage event makes A do: read
    expect(writes, 'a tab wrote after B\'s removal').not.toHaveBeenCalled();
    expect(removes).not.toHaveBeenCalled();
    expect(storedKeys(w.fs)).toEqual([]);
    expect((w.j as any).repair, 'the repair door is gone').toBeUndefined();
  });
  it('a stale write of another tab is the accepted residual: the journal does not fight it', () => {
    w = world();
    const before = w.fs.peek(REQ);
    const K1 = w.j.mint('turn') as string;
    expect(S.beginEntry(w.j, { k: K1, kind: 'turn', h: HANDLE, r: REALM, s: 'sess-1', c: KEY('1'), ct: slot.computer, at: 1 } as any)).toBe('ok');
    let used = false;
    const real = w.fs.getItem.bind(w.fs);
    vi.spyOn(w.fs, 'getItem').mockImplementation((k: string) => { if (k === REQ && !used) { used = true; return before; } return real(k); });
    expect(seedEntryForTests(w.jB, entry('turn', hex(77), { c: KEY('2') }))).toBe('ok');
    const writes = vi.spyOn(w.fs, 'setItem');
    w.j.scan(); w.j.scan();
    expect(writes).not.toHaveBeenCalled();
  });
});

void dismissal; void storedEntries;
