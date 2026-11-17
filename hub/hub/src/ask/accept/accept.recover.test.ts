// Acceptance, group RECOVERY: an entry leaves only on evidence the page itself can classify,
// and only through the entry's own computer and account.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { ACCOUNT, HANDLE, KEY, REALM, RID, settleReal, slot, storedKeys, world, type World } from './env';
import { SendToken, type Op } from '../journal';
import { bindDestForTests, seedEntryForTests } from '../journal/testing';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const B = 'c0a7150000000000000000b2';
const gate = (id: string, generation: number, kind: 'confirm' | 'question') => ({ id, generation, kind });
const seedDecision = (k: string, g: string, gn: number | undefined, sid = 'sess-1', ct = slot.computer) =>
  expect(seedEntryForTests(w!.j, { k, kind: 'decision', h: HANDLE, r: REALM, s: sid, c: KEY('1'), ct, g, ...(gn !== undefined ? { gn } : {}), at: 1 } as any)).toBe('ok');
const seedAnswer = (k: string, g: string, gn: number) =>
  expect(seedEntryForTests(w!.j, { k, kind: 'answer', h: HANDLE, r: REALM, s: 'sess-1', c: KEY('1'), ct: slot.computer, g, gn, at: 1 } as any)).toBe('ok');
const frame = (kind: string, o: Record<string, unknown>) => ({ kind, ...o });
const spyIO = (container: string) => {
  const calls: string[] = [];
  const io: any = bindDestForTests({
    receipt: (...a: unknown[]) => { calls.push('receipt'); return Promise.resolve({ turn_id: String(a[1]) }); },
    commandGet: (...a: unknown[]) => { calls.push('commandGet'); return Promise.resolve({ command_id: String(a[1]), state: 'committed' }); },
    create: () => { calls.push('POST'); return Promise.resolve({}); },
    turn: () => { calls.push('POST'); return Promise.resolve({}); },
    command: () => { calls.push('POST'); return Promise.resolve({}); },
    confirm: () => { calls.push('POST'); return Promise.resolve({}); },
    answer: () => { calls.push('POST'); return Promise.resolve({}); },
  } as any, container);
  return { io, calls };
};

describe('a gate frame closes only the entry of that gate and generation, and says closed, not applied', () => {
  it('a consumed answer whose frame carries a gateway req- id closes the entry (removed)', () => {
    w = world();
    seedAnswer(RID('a'), 'G1', 3);
    w.j.observe(spyIO(slot.computer).io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 3, 'question'), data: frame('question', { outcome: 'answered', request_id: 'req-123', provenance: 'decision' }) });
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('a late copy with our own request id and outcome cancelled closes the entry; it is not a settlement of a decision', () => {
    w = world();
    seedDecision(RID('b'), 'G1', 3);
    w.j.observe(spyIO(slot.computer).io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 3, 'confirm'), data: frame('confirm', { outcome: 'cancelled', request_id: RID('b'), provenance: 'cancelled' }) });
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('a frame for another session, gate or kind changes nothing; so does a pending or contradictory frame', () => {
    w = world();
    seedDecision(RID('c'), 'G1', 3);
    const { io } = spyIO(slot.computer);
    const done = frame('confirm', { outcome: 'answered', provenance: 'decision' });
    w.j.observe(io, { type: 'gate', r: REALM, sid: 'sess-2', gate: gate('G1', 3, 'confirm'), data: done });
    w.j.observe(io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G9', 3, 'confirm'), data: done });
    w.j.observe(io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 3, 'question'), data: frame('question', { outcome: 'answered' }) });
    w.j.observe(io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 3, 'confirm'), data: frame('confirm', { outcome: 'pending' }) });
    w.j.observe(io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 3, 'confirm'), data: frame('confirm', { outcome: 'answered', provenance: 'cancelled' }) });
    expect(storedKeys(w.fs)).toEqual([RID('c')]);
  });
  it('an entry that stores gn 1 is not closed by a closure for generation 2; one with no gn (a migrated decision) is closed by either', () => {
    w = world();
    seedDecision(RID('d'), 'G1', 1);
    seedDecision(RID('e'), 'G1', undefined);
    const { io } = spyIO(slot.computer);
    w.j.observe(io, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 2, 'confirm'), data: frame('confirm', { outcome: 'answered', provenance: 'decision' }) });
    expect(storedKeys(w.fs)).toEqual([RID('d')]);
  });
});

describe('a read by id', () => {
  const sendCommand = async (reply: unknown) => {
    const k = w!.j.mint('command')!;
    const a = w!.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'command', key: k, sid: 'sess-1', c: KEY('1'), cmd: 'message' } as Op, new SendToken()) as any;
    const io: any = bindDestForTests({ command: () => Promise.resolve(reply) } as any, slot.computer);
    const { guardIO } = await import('../journal');
    const g = guardIO(io, { acct: ACCOUNT, container: slot.computer }) as any;
    await w!.j.post(a, (t) => g.command('sess-1', 'x', k, REALM, [t]));
    return k;
  };
  it('a queued reply is admitted: the entry stays, and a read by the id the reply gave settles it once the command ended', async () => {
    w = world();
    const k = await sendCommand({ command_id: 'cmd-1', state: 'queued' });
    expect(storedKeys(w.fs)).toEqual([k]);
    const queued: any = bindDestForTests({ commandGet: () => Promise.resolve({ command_id: 'cmd-1', state: 'queued' }) } as any, slot.computer);
    expect((await w.j.checkById(queued, HANDLE, k)).t).toBe('admitted');
    expect(storedKeys(w.fs)).toEqual([k]);
    const ended: any = bindDestForTests({ commandGet: () => Promise.resolve({ command_id: 'cmd-1', state: 'committed' }) } as any, slot.computer);
    expect((await w.j.checkById(ended, HANDLE, k)).t).toBe('settled');
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('a read answering 403, 404, 429 or a core not_sent describes the read: the entry stays', async () => {
    for (const e of [{ status: 403, code: 'forbidden' }, { status: 404, code: 'not_found' }, { status: 429, code: 'rate_limited' }, { kind: 'not_sent', notSent: true }]) {
      w = world();
      const k = await sendCommand({ command_id: 'cmd-1', state: 'queued' });
      const io: any = bindDestForTests({ commandGet: () => Promise.reject(e) } as any, slot.computer);
      expect((await w.j.checkById(io, HANDLE, k)).t, JSON.stringify(e)).toBe('unknown');
      expect(storedKeys(w.fs)).toEqual([k]);
      w.dispose(); w = null;
    }
  });
  it('a recovery read never POSTs; with no id from the attempt\'s own reply nothing is read at all', async () => {
    w = world();
    const k = KEY('4');
    seedEntryForTests(w.j, { k, kind: 'turn', h: HANDLE, r: REALM, s: 'sess-1', c: KEY('1'), ct: slot.computer, at: 1 });
    const { io, calls } = spyIO(slot.computer);
    expect((await w.j.checkById(io, HANDLE, k)).t).toBe('unknown');
    expect(calls).toEqual([]);
  });
});

describe('an entry is read and closed only through the computer it went to', () => {
  it('the same key on two computers: a closure seen through B closes nothing of A\'s, and a check through B sends no read', async () => {
    w = world();
    seedDecision(RID('f'), 'G1', 3);
    const { io: ioB, calls } = spyIO(B);
    w.j.observe(ioB, { type: 'gate', r: REALM, sid: 'sess-1', gate: gate('G1', 3, 'confirm'), data: frame('confirm', { outcome: 'answered', provenance: 'decision' }) });
    expect(storedKeys(w.fs)).toEqual([RID('f')]);
    expect((await w.j.checkById(ioB, HANDLE, RID('f'))).t).toBe('unknown');
    expect(calls).toEqual([]);
  });
  it('a check of A\'s entry through B\'s io sends no request and leaves the entry', async () => {
    w = world();
    const k = w.j.mint('create')!;
    w.j.admit({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'create', key: k } as Op, new SendToken());
    const { io, calls } = spyIO(B);
    await w.j.checkById(io, HANDLE, k);
    expect(calls).toEqual([]);
    expect(storedKeys(w.fs)).toEqual([k]);
  });
});

void settleReal;
