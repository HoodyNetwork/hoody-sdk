// Acceptance, group FORK, part 2. The durable record and the
// agent's log are read from the raw bytes, never from the code under test.
//   U1  a fork is claimed once across tabs: the second tab joins the pending attempt and spends no key
//   U2  a reply that is not this fork is unknown and never moves a record (no read-back)
//   U3  Records.put keeps (k1, s, fk) one unit across create:<k1> and the session address
//   U4  a malformed stored fk is quarantined: an unresolved fork, no phantom, counted
//   U5  an unresolved fork is never evicted; the capacity refuses a NEW fork; unreadable data stays unknown
//   U6  the same-current-key fence: a turn paired with a fenced current key and a stored t of null is refused
//   U8  the key's second session is refused, with a turn named too
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import type * as F from '../fork';
import * as L from '../logic';
import * as R from '../journal/records';
import { recordsForTests, seedEntryForTests } from '../journal/testing';
import * as C from '../conv';
import { ACCOUNT, HANDLE, JOURNAL, REALM, slot, users, world, type World } from './env';
import { installTryLocks } from './try-locks';

let w: World | null = null;
// A fork press TRIES the target lock (ifAvailable): the suite's default lock grants every request in turn, so these use one that honours it.
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const JOURNAL_RECS = R.JOURNAL_RECS;
const FORKS_MAX: number = (R as any).FORKS_MAX ?? 8;
const flush = (n = 900) => w!.flush(n);
const agent = (): any => w!.agent as any;
const creates = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]);
const forkCreates = () => creates().filter((a) => 'fork' in a[0]);
const doc = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const forkRecs = () => Object.values(doc()).filter((r: any) => r.fk);
/** An unresolved fork written into the raw bytes: the claim is the only inserter of one, so a test that needs one the claim did not make plants it. */
function plantFork(rec: any): void {
  const raw = w!.fs.peek(JOURNAL);
  const all = raw ? JSON.parse(raw) : { v: 1, a: {} };
  all.a[ACCOUNT] = { ...(all.a[ACCOUNT] ?? {}), [`${HANDLE}|${REALM}|${rec.s === null ? 'create:' + rec.k1 : rec.s}`]: { h: HANDLE, ...rec } };
  w!.fs.seed(JOURNAL, JSON.stringify(all));
}
const seedDoc = (d: Record<string, any>) => { const all = JSON.parse(w!.fs.peek(JOURNAL)!); all.a[ACCOUNT] = d; w!.fs.seed(JOURNAL, JSON.stringify(all)); };

async function parentChat(turns = 2) {
  w = world();
  const a = await w.dock();
  a.send('first');
  await flush(1500);
  const sid = a.record!.s!;
  const p = w.pinned(sid);
  p.open();
  await flush(900);
  for (let i = 1; i < turns; i++) { p.send(`turn ${i + 1}`); await flush(1500); }
  const bounds = (await p.turnPins())!;
  expect(bounds.length).toBe(turns);
  return { a, p, sid, bounds };
}
const spec = (bounds: readonly number[], turn: number): F.ForkSpec => ({ turn, pin: bounds[turn] as number });
function holdNext(method: string) {
  const real = agent()[method].bind(agent());
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  agent()[method] = (...args: unknown[]) => { calls++; const p = real(...args); return calls === 1 ? gate.then(() => p) : p; };
  return { release: () => release(), get calls() { return calls; } };
}

describe('U1 one claim across tabs', () => {
  it('two tabs pressing the same fork at once make one create, one record and one key; the loser joins the pending attempt', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    const hold = holdNext('create');
    const a = p.fork(spec(bounds, 1));
    const b = pB.fork(spec(bounds, 1));
    await flush(900);
    hold.release();
    await flush(900);
    const [x, y] = await Promise.all([a, b]);
    expect(forkCreates(), 'one create left').toHaveLength(1);
    expect(forkRecs(), 'one record').toHaveLength(1);
    expect(x.k).toBe('opened');
    // The loser could not take the target lock: it is busy (the winner's claim is not stored yet) or, once it is, pending.
    expect(['unknown', 'refused'], 'the loser opens nothing of its own').toContain(y.k);
    expect(['pending', 'busy']).toContain((y as { reason: string }).reason);
    if (y.k === 'unknown') expect(y.k1, 'it joins the winner\'s attempt').toBe(forkCreates()[0]![1]);
    const keys = w!.agent.log.filter((l) => l[0] === 'create').map((l) => (l[1] as any[])[1]);
    expect(new Set(keys).size, 'no key was sent twice').toBe(keys.length);
  });
  it('a claim on another parent or another turn is not the same fork', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    const hold = holdNext('create');
    const a = p.fork(spec(bounds, 0));
    const b = pB.fork(spec(bounds, 1));
    await flush(900);
    hold.release();
    await flush(900);
    expect((await a).k).toBe('opened');
    expect((await b).k).toBe('opened');
    expect(forkCreates()).toHaveLength(2);
  });
});

describe('U2 a reply that is not this fork stays unknown', () => {
  it('a tampered reply: unknown, no record at the session it named, and the page sends no second create', async () => {
    const { p, bounds } = await parentChat(2);
    const real = agent().create.bind(agent());
    agent().create = async (...a: unknown[]) => { const r = await real(...a); return { ...r, started: { ...r.started, parent_id: 'sess-elsewhere' } }; };
    const out = await p.fork(spec(bounds, 1));
    if (out.k !== 'unknown') throw new Error('expected unknown');
    expect(forkRecs().filter((r: any) => r.s !== null), 'no record moved to a session this fork did not make').toHaveLength(0);
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'unknown', k1: out.k1 });
    expect(forkCreates()).toHaveLength(1);
  });
});

describe('U3 Records.put keeps (k1, s, fk) one unit across addresses', () => {
  const k1a = 'hx-' + 'a'.repeat(32), k1b = 'hx-' + 'f'.repeat(32), k2 = 'hx-' + 'b'.repeat(32);
  const base = (over: Record<string, unknown> = {}): any => ({
    p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, k1: k1a, k2,
    rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: 'en', fk: { s: 'sess-1', i: 2 }, ...over,
  });
  const all = () => Object.entries(doc());
  it('a stale create-shaped save after the handoff folds into the session record; it never leaves a second record', async () => {
    w = world();
    plantFork(base());
    expect(await recordsForTests(w.j).moveCreate(HANDLE, REALM, k1a, 'sess-5')).toBeTruthy();
    expect(await w.j.put(HANDLE, base({ at: 9 }))).toBe('ok');
    expect(all().map(([id]) => id), 'one record, at the session').toEqual([`${HANDLE}|${REALM}|sess-5`]);
    expect(all()[0]![1]).toMatchObject({ s: 'sess-5', k1: k1a, fk: { s: 'sess-1', i: 2 } });
  });
  it('a different k1 at an existing session is refused whole', async () => {
    w = world();
    plantFork(base());
    expect(await recordsForTests(w.j).moveCreate(HANDLE, REALM, k1a, 'sess-5')).toBeTruthy();
    expect(await w.j.put(HANDLE, base({ s: 'sess-5', k1: k1b, fk: undefined }))).toBe('lost');
    expect(all()).toHaveLength(1);
    expect(all()[0]![1]).toMatchObject({ s: 'sess-5', k1: k1a, fk: { s: 'sess-1', i: 2 } });
  });
  it('the same k1 at a second session is refused whole', async () => {
    w = world();
    plantFork(base());
    expect(await recordsForTests(w.j).moveCreate(HANDLE, REALM, k1a, 'sess-5')).toBeTruthy();
    expect(await w.j.put(HANDLE, base({ s: 'sess-6' }))).toBe('lost');
    expect(all().map(([id]) => id)).toEqual([`${HANDLE}|${REALM}|sess-5`]);
  });
  it('a chat that is not a fork stays not a fork, and a fork keeps its parent and turn, at either address', async () => {
    w = world();
    plantFork(base());
    expect(await w.j.put(HANDLE, base({ fk: { s: 'sess-9', i: 0 } }))).toBe('ok');
    expect(all()[0]![1].fk).toEqual({ s: 'sess-1', i: 2 });
    expect(await w.j.put(HANDLE, base({ fk: undefined }))).toBe('ok');
    expect(all()[0]![1].fk).toEqual({ s: 'sess-1', i: 2 });
  });
});

describe('U4 a malformed stored fk is quarantined', () => {
  it('it stays an unresolved fork: counted, no phantom chat, and a new fork waits until it is resolved', async () => {
    const { sid, bounds } = await parentChat(2);
    const out = { k1: 'hx-' + '9'.repeat(32) };
    plantFork({ p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, k1: out.k1, k2: 'hx-' + '8'.repeat(32),
      rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: 'en', fk: { s: '', i: -3 } });   // a stored fork whose identity is corrupt
    const b = await w!.dockB();                                    // a page reloaded over the corrupt document
    expect(forkRecs().map((r: any) => r.k1), 'still an unresolved fork').toEqual([out.k1]);
    expect(users(b.getSnapshot(), C), 'no phantom first message').toHaveLength(0);
    const rows = w!.jB.dockRead(ACCOUNT, { v: 1, a: {} } as any);
    expect(((rows.a as any)[ACCOUNT] ?? []).filter((r: any) => r.k1 === out.k1), 'not a dock conversation').toHaveLength(0);
    const listed = C.convsFor({ v: 1, a: { [ACCOUNT]: w!.jB.dockRead(ACCOUNT, { v: 1, a: {} } as any).a[ACCOUNT] ?? [] } } as any, ACCOUNT, { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM });
    expect(listed.filter((r: any) => r.k1 === out.k1)).toHaveLength(0);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    const again = await pB.fork(spec(bounds, 0));
    expect(again, 'a new fork waits until the unreadable one is resolved').toMatchObject({ k: 'refused', key: 'ask.forkFull' });
    expect(forkCreates()).toHaveLength(0);
  });
  it('validRec marks it; a valid fk and an absent one are untouched', () => {
    const base: any = { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, k1: 'hx-' + 'a'.repeat(32), k2: 'hx-' + 'b'.repeat(32), rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: 'en' };
    expect(L.validRec({ ...base, fk: { s: '', i: 1 } })?.fk).toMatchObject({ bad: true });
    expect(L.validRec({ ...base, fk: [] })?.fk).toMatchObject({ bad: true });
    expect(L.validRec({ ...base, fk: 'x' })?.fk).toMatchObject({ bad: true });
    expect(L.validRec({ ...base, fk: { s: 'sess-1', i: 1.5 } })?.fk).toMatchObject({ bad: true });
    expect(L.validRec({ ...base })?.fk).toBeUndefined();
    expect(L.validRec({ ...base, fk: { s: 'sess-1', i: null } })?.fk).toEqual({ s: 'sess-1', i: null });
  });
});

describe('U5 an unresolved fork is never evicted; capacity refuses a new fork', () => {
  const rec = (n: number, over: Record<string, unknown> = {}): any => ({
    p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: `sess-x${n}`, t: 'turn-1', k1: 'hx-' + n.toString(16).padStart(32, '0'), k2: 'hx-' + (n + 100000).toString(16).padStart(32, '0'),
    rc: 'custom', n: null, at: 1000 + n, i: null, q: 0, ph: 'completed', l: 'en', ...over,
  });
  it('past the record limit the fork record stays, even when it is the oldest and has no entry', async () => {
    await parentChat(2);
    const out = { k1: 'hx-' + '7'.repeat(32) };
    const { k1: _k1, k2: _k2, ...tpl } = rec(9000, { s: null, t: null, fk: { s: 'sess-p', i: 1 } });
    expect((await w!.j.claimFork(HANDLE, tpl, () => ({ k1: out.k1, k2: 'hx-' + '6'.repeat(32) }), ACCOUNT)).t, 'a claim in flight').toBe('claimed');
    const d = doc();
    const fid = Object.keys(d).find((k) => d[k].k1 === out.k1)!;
    d[fid] = { ...d[fid], at: 1 };
    seedDoc(d);
    w!.fs.removeItem('hub_ai_req_v1');                              // no entry holds it: eviction would take it first
    for (let n = 0; n < JOURNAL_RECS + 8; n++) expect(await w!.j.put(HANDLE, rec(n))).toBe('ok');
    expect(Object.keys(doc()).length, 'the limit still applies to chats').toBeLessThanOrEqual(JOURNAL_RECS + 1);
    expect(forkRecs().filter((r: any) => r.k1 === out.k1), 'the unresolved fork was not evicted').toHaveLength(1);
  });
  it('FORKS_MAX unresolved forks refuse a new one with typed words and send nothing', async () => {
    const { p, bounds } = await parentChat(2);
    // Eight creates in flight: each record has its request entry (a claim with no entry never left, and the next claim frees it).
    for (let n = 0; n < FORKS_MAX; n++) {
      const f = rec(n, { s: null, t: null, ph: 'completed', fk: { s: `sess-p${n}`, i: n } });
      plantFork(f);
      expect(seedEntryForTests(w!.j, { k: f.k1, kind: 'create', h: HANDLE, r: REALM, s: null, c: f.k1, ct: slot.computer, at: 1 } as any)).toBe('ok');
    }
    const before = creates().length;
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.forkFull' });
    expect(creates().length).toBe(before);
    expect(forkRecs()).toHaveLength(FORKS_MAX);
  });
});

describe('U6 the same-current-key fence', () => {
  it('a turn paired with the fenced CURRENT key and a stored t of null never moves the stored unit', async () => {
    w = world();
    const k1 = 'hx-' + 'e'.repeat(32), cur = 'hx-' + '1'.repeat(32);
    const at = (over: Record<string, unknown> = {}): any => ({
      p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: 'sess-7', t: null, k1, k2: cur, rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: 'en', ...over,
    });
    expect(await w.j.put(HANDLE, at({ s: null }))).toBe('ok');
    expect(await w.j.put(HANDLE, at({ na: [cur], dk: [cur] }))).toBe('ok');
    const read = () => Object.values(doc()).find((r: any) => r.k1 === k1) as any;
    expect(read()).toMatchObject({ t: null, k2: cur });
    expect(await w.j.put(HANDLE, at({ t: 'turn-1', ph: 'working', na: [cur], dk: [cur] }))).toBe('ok');
    expect(read(), 'the fenced current key never names a turn').toMatchObject({ t: null, k2: cur });
  });
});

describe('U7 the turn the page shows carries the pin', () => {
  it('fork({turn}) with no pin forks at the boundary of the turn the conversation shows', async () => {
    const { p, sid } = await parentChat(2);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    expect(pB.getSnapshot().conv.turns.map((t) => [t.idx, t.pin !== undefined]), 'a conversation read from history names its turns').toEqual([[0, true], [1, true]]);
    const out = await pB.fork({ turn: 1 });
    expect(out.k).toBe('opened');
    expect(forkCreates()[0]![0]).toMatchObject({ fork: sid, fork_turn_idx: 1 });
    void p;
  });
  it('a turn the page shows no boundary for is refused as changed, and nothing is sent', async () => {
    const { p } = await parentChat(2);
    expect(await p.fork({ turn: 7 })).toMatchObject({ k: 'refused', key: 'ask.forkChanged' });
    expect(forkCreates()).toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
  });
  it('the pin it takes is still re-read at press: a trim since the page read the turns sends nothing', async () => {
    const { sid } = await parentChat(3);
    const pB = w!.pinned(sid, 'B');
    pB.open();
    await flush(900);
    agent().ss.get(sid).bounds.splice(1, 1);
    expect(await pB.fork({ turn: 2 })).toMatchObject({ k: 'refused', key: 'ask.forkChanged' });
    expect(forkCreates()).toHaveLength(0);
  });
  it('chatRefOf names the new chat by the computer\'s handle, the realm and the session', async () => {
    const { p } = await parentChat(2);
    expect(p.chatRefOf('sess-9')).toEqual({ computer: HANDLE, realm: REALM, sid: 'sess-9' });
    expect(p.chatRefOf('')).toBeNull();
  });
});

describe('U8 the same key at a second session', () => {
  const k1a = 'hx-' + 'a'.repeat(32), k2 = 'hx-' + 'b'.repeat(32);
  const base = (over: Record<string, unknown> = {}): any => ({
    p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, k1: k1a, k2,
    rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: 'en', fk: { s: 'sess-1', i: 2 }, ...over,
  });
  it('the same k1 at a second session is refused even when the save names a turn', async () => {
    w = world();
    plantFork(base());
    expect(await recordsForTests(w.j).moveCreate(HANDLE, REALM, k1a, 'sess-5')).toBeTruthy();
    expect(await w.j.put(HANDLE, base({ s: 'sess-6', t: 'turn-1' }))).toBe('lost');
    expect(Object.keys(doc())).toEqual([`${HANDLE}|${REALM}|sess-5`]);
  });
});
