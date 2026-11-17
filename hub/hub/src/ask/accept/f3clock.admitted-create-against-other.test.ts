// Acceptance, by-key recovery: the send lock of an ordinary keyed request is requested in admit(), before its entry is written, and
// post() adopts that hold. So no entry of a key exists without its send lock held or already queued, and another tab's by-key Check (which
// retires only under a free send lock) cannot retire a request that is about to send.
//   L1  admit -> (the other tab's Check) -> post: the Check answers heldElsewhere, makes no retire call; the post then sends once
//   L2  a holder elsewhere when the request is admitted: admit still answers, the post waits, then sends; a real other-tab Check retires nothing (refused by the holder)
//   L1b the sender is only QUEUED when the Check arrives (the Web Locks queue rule modelled): the Check retires nothing
//   L3  the hold is given back: on a cancelled admission, on a refused admit, and when the post ends
//   L4  a request that is not admitted holds nothing and leaves no entry
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { SendToken, guardIO, type Op } from '../journal';
import { sendLockName } from '../journal/door';
import { seedEntryForTests } from '../journal/testing';
import { installTryLocks } from './try-locks';
import { ACCOUNT, HANDLE, REALM, posts, settleReal, slot, storedKeys, world, type World } from './env';

let w: World | null = null;
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const createOp = (key: string): Op => ({ acct: ACCOUNT, container: slot.computer, h: HANDLE, r: REALM, route: 'create', key });
const retires = (): number => w!.agent.log.filter((x) => x[0] === 'createKeyRetire').length;
const io = (): any => guardIO(w!.agent as any, { acct: ACCOUNT, container: slot.computer }) as any;
/** True while somebody holds (or has queued ahead) the name: a raw ifAvailable probe; a free name is taken and released at once. */
function held(name: string): Promise<boolean> {
  return (globalThis.navigator as any).locks.request(name, { ifAvailable: true }, (lock: unknown) => lock === null);
}
async function holdElsewhere(key: string): Promise<() => void> {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  void (globalThis.navigator as any).locks.request(sendLockName(key), () => gate);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return release;
}

describe('L1 an admitted create against the other tab\'s Check', () => {
  it('between its admit and its post the other tab\'s Check answers heldElsewhere and retires nothing; the post then sends once', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const a = w.j.admit(createOp(k), new SendToken()) as any;
    expect('kind' in a).toBe(false);
    expect(storedKeys(w.fs)).toContain(k);
    const v = (await w.jB.check(w.agent, HANDLE, k)).v;
    expect(v, 'nothing is proven while the sender is about to send').toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
    expect(retires(), 'no retire call').toBe(0);
    expect(storedKeys(w.fs), 'the entry stays').toContain(k);
    const out = await w.j.post(a, async (t) => { await io().create({}, k, REALM, [t]); });
    expect(out.kind).toBe('sent');
    expect(posts(w.agent, 'create'), 'one create').toHaveLength(1);
    expect(retires(), 'still no retire call').toBe(0);
  });
});

// L2 shows the wait case (a holder elsewhere when the request is admitted: admit answers, the post waits, then sends once) and that a real
// other-tab Check refuses meanwhile. Its Check assertions pass WHETHER OR NOT the sender queued: the raw holder alone makes the Check's
// free-lock try fail. They do NOT prove queued-request exclusion; that rests on Web Locks spec behaviour and is modelled by L1b.
describe('L2 a holder elsewhere when the request is admitted', () => {
  it('admit still answers, the post waits for the holder and then sends; a Check from the other tab (refused by the raw holder) retires nothing', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const release = await holdElsewhere(k);
    const a = w.j.admit(createOp(k), new SendToken()) as any;
    expect('kind' in a, 'admit does not wait for the lock').toBe(false);
    let done = false;
    const p = w.j.post(a, async (t) => { await io().create({}, k, REALM, [t]); }).then((o) => { done = true; return o; });
    await settleReal(10);
    expect(done, 'the post waits for the lock').toBe(false);
    expect(posts(w.agent, 'create')).toHaveLength(0);
    // The other tab's Check while a raw holder has the lock: refused by the holder itself (the sender's queueing is not what is shown here).
    const v = (await w.jB.check(w.agent, HANDLE, k)).v;
    expect(v, 'the holder refuses the Check').toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
    expect(retires(), 'the Check retired nothing').toBe(0);
    release();
    const out = await p;
    expect(out.kind).toBe('sent');
    expect(posts(w.agent, 'create')).toHaveLength(1);
    expect(retires()).toBe(0);
  });
});

/** The Web Locks rule L1b relies on, modelled: a request that is made but not yet granted keeps a later `ifAvailable` request from being
 *  granted (spec). The suite's fake grants at once, so this wraps it: the first send-lock request waits behind a gate (queued, not granted). */
function queueSendLockRequests(): { open: () => void; asked: () => boolean } {
  const locks = (globalThis.navigator as any).locks;
  const real = locks.request.bind(locks);
  let open!: () => void;
  const gateP = new Promise<void>((r) => { open = r; });
  const pending = new Set<string>();
  let asked = false;
  locks.request = (name: string, a: unknown, b?: unknown) => {
    const isSend = name.startsWith(sendLockName(''));
    if (isSend && typeof a === 'function') {
      asked = true;
      pending.add(name);
      return gateP.then(() => { pending.delete(name); return real(name, a); });
    }
    if (isSend && pending.has(name) && b !== undefined) return Promise.resolve().then(() => (b as (l: unknown) => unknown)(null));
    return b === undefined ? real(name, a) : real(name, a, b);
  };
  return { open, asked: () => asked };
}

describe('L1b the sender is only QUEUED (not yet granted) when the other tab\'s Check arrives', () => {
  it('the Check answers heldElsewhere and retires nothing; once the request is granted the post sends once', async () => {
    w = world();
    const q = queueSendLockRequests();
    const k = w.j.mint('create')!;
    expect(q.asked(), 'a mint asks for nothing').toBe(false);
    const a = w.j.admit(createOp(k), new SendToken()) as any;
    expect('kind' in a).toBe(false);
    expect(q.asked(), 'admit asked for the lock before/with the entry').toBe(true);
    const v = (await w.jB.check(w.agent, HANDLE, k)).v;
    expect(v, 'a queued sender is a sender').toMatchObject({ t: 'unknown', why: 'heldElsewhere' });
    expect(retires(), 'no retire call').toBe(0);
    expect(storedKeys(w.fs)).toContain(k);
    const p = w.j.post(a, async (t) => { await io().create({}, k, REALM, [t]); });
    q.open();
    expect((await p).kind).toBe('sent');
    expect(posts(w.agent, 'create')).toHaveLength(1);
    expect(retires()).toBe(0);
  });
});

describe('L3 the hold is given back', () => {
  it('a cancelled admission gives it back and removes its entry', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const tok = new SendToken();
    const a = w.j.admit(createOp(k), tok) as any;
    expect('kind' in a).toBe(false);
    expect(await held(sendLockName(k)), 'held from admit on').toBe(true);
    tok.cancel();
    await settleReal(10);
    expect(await held(sendLockName(k)), 'given back on cancel').toBe(false);
    expect(storedKeys(w.fs)).not.toContain(k);
  });
  it('a refused admit (a key this tab did not mint) takes nothing', async () => {
    w = world();
    const k = w.j.mint('create')!;
    expect(w.jB.admit(createOp(k), new SendToken())).toEqual({ kind: 'notSent', why: 'notMinted' });
    expect(await held(sendLockName(k)), 'no hold from a refused admit').toBe(false);
  });
  it('an admit that fails after it asked for the lock (the entry already exists) gives it back', async () => {
    w = world();
    const k = w.j.mint('create')!;
    seedEntryForTests(w.j, { k, kind: 'create', h: HANDLE, r: REALM, s: null, c: k, ct: slot.computer, at: 1 });
    expect(w.j.admit(createOp(k), new SendToken())).toMatchObject({ kind: 'notSent', why: 'exists' });
    await settleReal(10);
    expect(await held(sendLockName(k)), 'no hold left by a failed admit').toBe(false);
  });
  it('the hold ends with the post', async () => {
    w = world();
    const k = w.j.mint('create')!;
    const a = w.j.admit(createOp(k), new SendToken()) as any;
    await w.j.post(a, async (t) => { await io().create({}, k, REALM, [t]); });
    await settleReal(10);
    expect(await held(sendLockName(k)), 'free once the post ended').toBe(false);
  });
});

describe('L4 a request that is not admitted', () => {
  it('a mint alone holds nothing and writes nothing', async () => {
    w = world();
    const k = w.j.mint('create')!;
    expect(await held(sendLockName(k))).toBe(false);
    expect(storedKeys(w.fs)).not.toContain(k);
  });
});
