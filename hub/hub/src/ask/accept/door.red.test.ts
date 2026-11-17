// Acceptance tests (through seam.ts), group DOOR: the send door (admission of a journaled POST). The rule: "No journaled route can be called without
// the door's ticket", and further: the ticket must be bound to ONE retained entry, ITS key and ITS operation, single
// use, and the cleanup of a cancelled attempt may only remove the entry of THAT never-sent attempt.
// These go through the seam (journal internals are named there); the properties are API-independent: a POST that carries a
// journaled key leaves only with a stored entry for that key and operation behind it.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { HANDLE, KEY, REALM, RID, never, posts, settleReal, slot, storedKeys, world, type World } from './env';
import * as S from './seam';

let w: World | null = null;
afterEach(() => { w?.dispose(); w = null; });

const entry = (c: string, o: Partial<S.Entry> = {}): S.Entry => ({ k: KEY(c), kind: 'create', h: HANDLE, r: REALM, s: null, c: KEY(c), ct: slot.computer, at: 1, ...o });
const swallow = (p: Promise<unknown>) => p.then(() => 'resolved', () => 'rejected');

describe('the door admits a POST only with a retained entry for that key', () => {
  it('no entry at all (null): the guarded create does not reach the agent, and nothing is stored', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const key = KEY('9');
    await swallow(S.sendThroughDoor(w.j, null, key, S.newToken(), () => (io as any).create({}, key, REALM)));
    expect(posts(w.agent, 'create')).toHaveLength(0);
    expect(storedKeys(w.fs)).toEqual([]);
  });
  it('an entry for key A does not open the door for key B', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const A = entry('a');
    expect(S.beginEntry(w.j, A)).toBe('ok');
    await swallow(S.sendThroughDoor(w.j, A, KEY('b'), S.newToken(), () => (io as any).create({}, KEY('b'), REALM)));
    expect(posts(w.agent, 'create'), 'a create under key B left with only A\'s entry stored').toHaveLength(0);
  });
  it('an open door for a create does not admit an answer to an unrelated session and gate', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const A = entry('a');
    S.beginEntry(w.j, A);
    await swallow(S.sendThroughDoor(w.j, A, A.k, S.newToken(), () => (io as any).answer('sess-other', { gate_id: 'gate-9', generation: 1, answer: 'x' })));
    expect(posts(w.agent, 'answer')).toHaveLength(0);
  });
  it('an open door for a create does not admit a TURN under the same key (the entry says what operation it covers)', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const A = entry('a', { kind: 'create' });
    S.beginEntry(w.j, A);
    await swallow(S.sendThroughDoor(w.j, A, A.k, S.newToken(), () => (io as any).turn('sess-1', 'hello', A.k, REALM)));
    expect(posts(w.agent, 'turn')).toHaveLength(0);
  });
  it('the admission is single-use: a second POST under the same open door is refused', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const A = entry('a');
    S.beginEntry(w.j, A);
    await swallow(S.sendThroughDoor(w.j, A, A.k, S.newToken(), () => { void swallow((io as any).create({}, A.k, REALM)); return (io as any).create({}, A.k, REALM); }));
    expect(posts(w.agent, 'create'), 'two POSTs left through one admission').toHaveLength(1);
  });
  it('control: the entry\'s own key and operation is admitted once', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const A = entry('a');
    S.beginEntry(w.j, A);
    await swallow(S.sendThroughDoor(w.j, A, A.k, S.newToken(), () => (io as any).create({}, A.k, REALM)));
    expect(posts(w.agent, 'create')).toHaveLength(1);
  });
  it('control: a confirm whose body names another request id than the open door\'s is refused', async () => {
    w = world();
    const io = S.guarded(w.agent as any);
    const A = entry('a', { kind: 'decision', k: RID('a'), g: 'gate-1', s: 'sess-1' });
    S.beginEntry(w.j, A);
    await swallow(S.sendThroughDoor(w.j, A, A.k, S.newToken(), () => (io as any).confirm('sess-1', { gate_id: 'gate-1', generation: 1, approved: true, request_id: RID('b') })));
    expect(posts(w.agent, 'confirm')).toHaveLength(0);
  });
});

describe('cleanup after a cancel removes only the entry of the attempt that never left', () => {
  it('a second send of the same entry with an already-cancelled token does not remove the entry of the first, whose POST is out', async () => {
    w = world();
    const A = entry('a');
    expect(S.beginEntry(w.j, A)).toBe('ok');
    const tok1 = S.newToken();
    let out = 0;
    const p1 = swallow(S.sendThroughDoor(w.j, A, A.k, tok1, () => { out++; return never(); }));
    await settleReal(10);
    expect(out, 'the first POST is out').toBe(1);
    const tok2 = S.newToken();
    tok2.cancel();
    await swallow(S.sendThroughDoor(w.j, A, A.k, tok2, () => { throw new Error('must not run'); }));
    await settleReal(5);
    expect(storedKeys(w.fs), 'the entry of the in-flight POST must stay: it may have been admitted').toContain(A.k);
    tok1.cancel();
    await p1;
  });
  it('a cancelled send in this tab does not remove the entry another tab wrote for the same key', async () => {
    w = world();
    const A = entry('a');
    expect(S.beginEntry(w.jB, A)).toBe('ok');                       // tab B begins it (and may send it)
    const tok = S.newToken();
    tok.cancel();
    await swallow(S.sendThroughDoor(w.j, A, A.k, tok, () => { throw new Error('must not run'); }));
    await settleReal(5);
    expect(storedKeys(w.fs), 'an entry this attempt did not write is not its to remove').toContain(A.k);
  });
  it('control: a send cancelled before its POST removes its own never-sent entry', async () => {
    w = world();
    const A = entry('a');
    expect(S.beginEntry(w.j, A)).toBe('ok');
    const tok = S.newToken();
    tok.cancel();
    let ran = false;
    expect(await swallow(S.sendThroughDoor(w.j, A, A.k, tok, () => { ran = true; return Promise.resolve(1); }))).toBe('rejected');
    expect(ran).toBe(false);
    expect(storedKeys(w.fs)).toEqual([]);
  });
});
