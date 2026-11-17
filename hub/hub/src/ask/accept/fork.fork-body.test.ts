// Acceptance, group FORK: forking a chat from a turn is a keyed create with its own journaled record (`fk`). The tests
// below read the durable record and the agent's log from the raw bytes, never from the code under test.
//   T1   the body: exactly the fork fields, an explicit 0 sent, nothing inherited sent           T8   (Check again: fork recovery tests)
//   T2   the record is kept BEFORE the request leaves; not kept = nothing sent                  T9   single flight, and a new press after a settled fork
//   T3   the reply must be THIS fork (parent, index; an absent echo reads 0) or it is unknown   T10  a reload: no phantom message, the target forks anew
//   T4   definite refusals: words, the record goes, no retry; a new press is a new key          T11  (Stop tracking: fork recovery tests)
//   T5   the press-time pin: a trim or a shifted index sends nothing                            T12  Records.put: fk is one unit with k1/s; a null t is refused whole
//   T6   navigation only after the create is settled; an unknown outcome never opens            T13  the typed words (errorView), the kit mapping
//   T7   a lost answer is unknown, never opened, never read back, no second create in that page
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { forkOutcome } from '../active';
import type { AskEngine } from '../engine';
import * as F from '../fork';
import * as L from '../logic';
import { routes } from '../data';
import { JOURNAL_RECS } from '../journal/records';
import { recordsForTests } from '../journal/testing';
import strings from '../strings.en.json';
import { ACCOUNT, HANDLE, JOURNAL, OTHER, REALM, REQ, showAccount, users, world, type World } from './env';
import { installTryLocks } from './try-locks';
import * as C from '../conv';

let w: World | null = null;
// A fork press TRIES the target lock (ifAvailable): the suite's default lock grants every request in turn, so these use one that honours it.
let restoreLocks: () => void = () => {};
beforeEach(() => { resetApproversForTests(); restoreLocks = installTryLocks(); });
afterEach(() => { w?.dispose(); w = null; restoreLocks(); resetApproversForTests(); });

const flush = (n = 900) => w!.flush(n);
const creates = (): any[][] => w!.agent.log.filter((x) => x[0] === 'create').map((x) => x[1] as any[]);
/** The create calls after the parent's own (the first). */
const forkCreates = () => creates().filter((a) => 'fork' in a[0]);
/** An unresolved fork written into the raw bytes: the claim is the only inserter of one, so a test that needs one the claim did not make plants it. */
function plantFork(rec: any): void {
  const raw = w!.fs.peek(JOURNAL);
  const all = raw ? JSON.parse(raw) : { v: 1, a: {} };
  all.a[ACCOUNT] = { ...(all.a[ACCOUNT] ?? {}), [`${HANDLE}|${REALM}|${rec.s === null ? 'create:' + rec.k1 : rec.s}`]: { h: HANDLE, ...rec } };
  w!.fs.seed(JOURNAL, JSON.stringify(all));
}
const recs = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
const forkRecs = () => Object.values(recs()).filter((r: any) => r.fk);
const words = (key: string): string => (strings as Record<string, string>)[key] as string;
const agent = (): any => w!.agent as any;

/** A parent chat with `turns` finished turns, open on a pinned engine. */
async function parentChat(turns = 2, o: Parameters<typeof world>[0] = {}) {
  w = world(o);
  const a = await w.dock();
  a.send('first');
  await flush(1500);
  const sid = a.record!.s!;
  const p = w.pinned(sid);
  p.open();
  await flush(900);
  for (let i = 1; i < turns; i++) { p.send(`turn ${i + 1}`); await flush(1500); }
  const bounds = (await p.turnPins())!;
  expect(bounds.length, 'the parent has its finished turns').toBe(turns);
  return { a, p, sid, bounds };
}
const spec = (bounds: readonly number[], turn: number): F.ForkSpec => ({ turn, pin: bounds[turn] as number });

/** The next call of an AgentIO method is answered only when released (the call itself is made at once). */
function holdNext(method: string) {
  const real = agent()[method].bind(agent());
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  let calls = 0;
  agent()[method] = (...args: unknown[]) => { calls++; const p = real(...args); return calls === 1 ? gate.then(() => p) : p; };
  return { release: () => release(), get calls() { return calls; } };
}

describe('T1 the fork body', () => {
  it('sends exactly the fork fields, an explicit 0 as 0, and nothing the fork inherits', async () => {
    const { p, sid, bounds } = await parentChat(2);
    const out = await p.fork(spec(bounds, 0));
    expect(out.k).toBe('opened');
    const [body, key, realm] = forkCreates()[0]!;
    expect(Object.keys(body).sort()).toEqual(['computer', 'expected_binding', 'fork', 'fork_turn_idx', 'realm']);
    expect(body.fork).toBe(sid);
    expect(body.fork_turn_idx, 'an explicit 0 is sent, not dropped').toBe(0);
    expect(body.expected_binding).toEqual({ realm: body.realm, computer: body.computer });
    for (const f of ['agent', 'tool_mode', 'dir_scope', 'approval', 'model', 'attach']) expect(f in body, `${f} is never sent on a fork`).toBe(false);
    expect(key).toMatch(/^hx-[0-9a-f]{32}$/);
    expect(realm).toBe(REALM);
  });
  it('the whole-chat fork omits fork_turn_idx', async () => {
    const { p, sid } = await parentChat(2);
    expect((await p.fork(null)).k).toBe('opened');
    const body = forkCreates()[0]![0];
    expect(body.fork).toBe(sid);
    expect('fork_turn_idx' in body).toBe(false);
  });
  it('every key a fork body carries is one the create route declares (a key it does not is refused unsent)', () => {
    const b = F.forkBody(REALM, 'c0a7150000000000000000a1', 'sess-1', 0)!;
    for (const k of Object.keys(b)) expect(routes.create.body, k).toContain(k);
    expect(routes.create.body).toContain('fork_turn_idx');
  });
  it('the first-message create body can never grow the fork fields', () => {
    const body = L.createBody(REALM, 'c0a7150000000000000000a1') as any;
    expect(body && 'fork' in body).toBe(false);
    expect(body && 'fork_turn_idx' in body).toBe(false);
    expect(F.forkBody(REALM, 'c0a7150000000000000000a1', 'sess-1', -1)).toBeNull();
    expect(F.forkBody(REALM, 'c0a7150000000000000000a1', '', 0)).toBeNull();
    expect(F.forkBody(REALM, 'c0a7150000000000000000a1', 'sess-1', 1.5)).toBeNull();
  });
});

describe('T2 the record is kept before the request leaves', () => {
  it('the journal holds the fork record (k1, fk, no session) when the create call is made', async () => {
    const { p, sid, bounds } = await parentChat(2);
    let seen: any[] = [];
    const real = agent().create.bind(agent());
    agent().create = (...a: unknown[]) => { seen = forkRecs().slice(); return real(...a); };
    await p.fork(spec(bounds, 1));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ s: null, fk: { s: sid, i: 1 }, k1: forkCreates()[0]![1] });
  });
  it('a record the journal could not keep sends nothing', async () => {
    const { p, bounds } = await parentChat(2);
    w!.fs.blockWrites(JOURNAL);
    const out = await p.fork(spec(bounds, 1));
    expect(out).toMatchObject({ k: 'refused', key: 'ask.notRemembered' });
    expect(forkCreates(), 'nothing left').toHaveLength(0);
    w!.fs.clearFaults();
    expect(forkRecs()).toHaveLength(0);
  });
  it('a claim whose request never left is released: nothing stays, and the next press sends a fresh create', async () => {
    const { p, bounds } = await parentChat(2);
    w!.fs.blockWrites(REQ);                                          // the request entry cannot be written: the door reads it as full
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.checkEarlier' });
    expect(forkCreates(), 'never asked').toHaveLength(0);
    expect(forkRecs(), 'the claim went with the refusal').toHaveLength(0);
    w!.fs.clearFaults();
    expect((await p.fork(spec(bounds, 1))).k, 'not blocked: nothing was asked').toBe('opened');
    expect(forkCreates()).toHaveLength(1);
  });
});

describe('T3 the reply must be this fork', () => {
  const want = { realm: REALM, container: 'c', owner: 'o', parent: 'sess-1', idx: 2 as number | null };
  const started = (s: Record<string, unknown>) => ({ session_id: 'sess-9', started: { realm_selector: REALM, computer_id: 'c', owner_fingerprint: 'o', ...s } });
  it('checkForked: parent, index (an absent echo is 0), binding and a session', () => {
    expect(F.checkForked(started({ parent_id: 'sess-1', fork_turn_idx: 2 }), want)).toBeNull();
    expect(F.checkForked(started({ parent_id: 'sess-2', fork_turn_idx: 2 }), want)).toBe('NOTFORK');
    expect(F.checkForked(started({ parent_id: 'sess-1', fork_turn_idx: 3 }), want)).toBe('NOTFORK');
    expect(F.checkForked(started({ parent_id: 'sess-1' }), want), 'a fork at 2 with no echo is a fork at 0').toBe('NOTFORK');
    expect(F.checkForked(started({}), want)).toBe('NOTFORK');
    expect(F.checkForked(started({ parent_id: 'sess-1' }), { ...want, idx: 0 }), 'a fork at 0 echoes no index').toBeNull();
    expect(F.checkForked(started({ parent_id: 'sess-1', fork_turn_idx: 5 }), { ...want, idx: null }), 'a whole-chat fork checks the parent only').toBeNull();
    expect(F.checkForked(started({ parent_id: 'sess-1', fork_turn_idx: 2, computer_id: 'other' }), want)).toBe('BINDING');
    expect(F.checkForked({ session_id: 'x' }, want)).toBe('BINDING');
    // The retired container_id is not identity evidence, so a fork reply carrying it is never a fork of THIS computer.
    for (const c of ['c', 'computer-B', 7]) {
      expect(F.checkForked(started({ parent_id: 'sess-1', fork_turn_idx: 2, container_id: c }), want), `both spellings, container_id ${JSON.stringify(c)}`).toBe('BINDING');
      const { session_id, started: st } = started({ parent_id: 'sess-1', fork_turn_idx: 2, container_id: c });
      const { computer_id: _c, ...bare } = st as any;
      expect(F.checkForked({ session_id, started: bare }, want), `container_id ${JSON.stringify(c)} alone`).toBe('BINDING');
    }
  });
  it('a reply that names another parent is unknown, never opened', async () => {
    const { p, bounds } = await parentChat(2);
    const real = agent().create.bind(agent());
    agent().create = async (...a: unknown[]) => { const r = await real(...a); return { ...r, started: { ...r.started, parent_id: 'sess-elsewhere' } }; };
    const out = await p.fork(spec(bounds, 1));
    expect(out.k).toBe('unknown');
    expect(Object.values(recs()).filter((r: any) => r.fk && r.s !== null), 'nothing moved to the session it named').toHaveLength(0);
    expect((await p.fork(spec(bounds, 1))).k, 'blocked for this page, not navigated to').toBe('unknown');
    expect(forkCreates()).toHaveLength(1);
  });
  it('a fork at 0 (no echoed index) opens', async () => {
    const { p, bounds } = await parentChat(2);
    expect((await p.fork(spec(bounds, 0))).k).toBe('opened');
  });
});

describe('T4 definite refusals', () => {
  const cases: Array<[number, string, string]> = [
    [400, 'bad_request', 'ask.forkChanged'],
    [409, 'approval_policy_unsatisfiable', 'ask.forkApproval'],
    [403, 'forbidden', 'ask.accessRefused'],
  ];
  for (const [status, code, key] of cases) {
    it(`${status} ${code}: its own words, the record goes, nothing is retried`, async () => {
      const { p, bounds } = await parentChat(2);
      agent().o.createRefuse = { status, code };
      const out = await p.fork(spec(bounds, 1));
      expect(out).toMatchObject({ k: 'refused', key });
      expect(words(key), 'the words exist').toBeTruthy();
      await flush(1500);
      expect(forkCreates(), 'no automatic second create').toHaveLength(1);
      expect(forkRecs(), 'the record of a fork that was not made goes').toHaveLength(0);
      const again = await p.fork(spec(bounds, 1));
      expect(again.k, 'a new press is a new fork').toBe('opened');
      const keys = forkCreates().map((a) => a[1]);
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
    });
  }
});

describe('T4b a 404 proves nothing (the journal rule P3)', () => {
  it('a refused parent is unknown: the record stays and a new press sends no second create', async () => {
    const { p, bounds } = await parentChat(2);
    agent().o.createRefuse = { status: 404, code: 'not_found' };
    const out = await p.fork(spec(bounds, 1));
    expect(out).toMatchObject({ k: 'unknown', key: 'ask.forkMade' });
    // The record is the block (on every page); a press over it says what is pending, and a Check recovers it.
    expect(await p.fork(spec(bounds, 1)), 'a 404 proves nothing: the pending record blocks the target').toMatchObject({ k: 'unknown', reason: 'pending', key: 'ask.forkPending' });
    expect(forkCreates()).toHaveLength(1);
  });
});

describe('T5 the press-time pin', () => {
  it('a trim since the page read the turns sends nothing', async () => {
    const { p, sid, bounds } = await parentChat(3);
    const s = agent().ss.get(sid);
    s.bounds.splice(1, 1);                                     // a turn left the chat: indexes shift
    const out = await p.fork(spec(bounds, 2));
    expect(out).toMatchObject({ k: 'refused', key: 'ask.forkChanged' });
    expect(forkCreates()).toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
  });
  it('an index still in range but ending elsewhere is changed', async () => {
    const { p, sid, bounds } = await parentChat(3);
    const s = agent().ss.get(sid);
    s.bounds[1] = (s.bounds[1] as number) + 1;
    expect((await p.fork(spec(bounds, 1))).k).toBe('refused');
    expect(forkCreates()).toHaveLength(0);
  });
  it('pinView: ok, changed, nothing', () => {
    expect(F.pinView([3, 7], { turn: 1, pin: 7 })).toBe('ok');
    expect(F.pinView([3, 7], { turn: 1, pin: 6 })).toBe('changed');
    expect(F.pinView([3], { turn: 1, pin: 7 })).toBe('changed');
    expect(F.pinView([3, 7], { turn: -1, pin: 3 })).toBe('changed');
    expect(F.pinView([], null)).toBe('nothing');
    expect(F.pinView([3], null)).toBe('ok');
  });
  it('a chat with no finished turn is refused by the engine itself, with its own words', async () => {
    w = world();
    const a = await w.dock();
    a.send('first');
    await flush(200);                                           // the turn has not finished
    const sid = a.record!.s!;
    const p = w.pinned(sid);
    p.open(); await flush(900);
    agent().ss.get(sid).bounds.length = 0;
    expect(await p.fork(null)).toMatchObject({ k: 'refused', key: 'ask.forkNoTurn', reason: 'notOpen' });
    expect(forkCreates()).toHaveLength(0);
    expect(w.agent.log.filter((x) => x[0] === 'attach'), 'nothing to fork: nothing reopened').toHaveLength(0);
  });
  // A chat the list shows that the computer put to sleep (dormant) is reopened by the press, then forked.
  it('a dormant parent is reopened first (one attach of the parent), then forked', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    const out = await f;
    const at = w!.agent.log.filter((x) => x[0] === 'attach');
    expect(at, 'the parent was reopened once').toHaveLength(1);
    expect((at[0]![1] as any)[0], 'reopened with helper approvals, as the chat runs').toMatchObject({ attach: sid, helper_gates: true });
    expect(w!.agent.log.findIndex((x) => x[0] === 'attach'), 'reopened before the fork create').toBeLessThan(w!.agent.log.findIndex((x) => x[0] === 'create' && 'fork' in (x[1] as any)[0]));
    expect(forkCreates()).toHaveLength(1);
    expect(out).toMatchObject({ k: 'opened' });
  });
  it('a dormant parent whose reopen is refused makes nothing and says the reopen failed', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    agent().attach = () => agent().no(500, 'internal');
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkReopenFailed', reason: 'notOpen' });
    expect(forkCreates(), 'nothing was sent').toHaveLength(0);
    expect(forkRecs(), 'nothing was claimed').toHaveLength(0);
  });
  it('a dormant parent started without helper approvals is not reopened without them: refused in its own words, nothing made', async () => {
    const { p, sid, bounds } = await parentChat(2, { helperGatesUnavailable: true });
    agent().setDormant(sid, true);
    await flush(900);
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkReopenGates', reason: 'notOpen' });
    expect(w!.agent.log.filter((x) => x[0] === 'attach'), 'one reopen, never retried without helper approvals').toHaveLength(1);
    expect(forkCreates()).toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
  });
  // A stale pin reopens nothing; nothing is claimed or sent while the reopen or its recheck is out; only
  // an explicit live answer after the reopen goes on; an account switch or an ended engine while a read is out reopens nothing.
  it('a dormant parent whose pin no longer matches is refused as changed without being reopened', async () => {
    const { p, sid, bounds } = await parentChat(3);
    agent().setDormant(sid, true);
    await flush(900);
    const s = agent().ss.get(sid);
    s.bounds[1] = (s.bounds[1] as number) + 1;
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkChanged' });
    expect(w!.agent.log.filter((x) => x[0] === 'attach'), 'a fork already known to fail reopens nothing').toHaveLength(0);
    expect(forkCreates()).toHaveLength(0);
  });
  it('nothing is claimed or sent while the reopen is out; the fork goes on once it is answered', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    const h = holdNext('attach');
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    expect(h.calls, 'the reopen was sent').toBe(1);
    expect(forkCreates(), 'no create while the reopen is out').toHaveLength(0);
    expect(forkRecs(), 'no claim while the reopen is out').toHaveLength(0);
    h.release();
    await flush(900);
    expect(await f).toMatchObject({ k: 'opened' });
    expect(forkCreates()).toHaveLength(1);
  });
  /** After the parent's reopen, its recheck read is answered by `answer`, held until released. */
  function afterReopen(answer: (sid: string) => Promise<unknown>) {
    const realAttach = agent().attach.bind(agent());
    const realState = agent().state.bind(agent());
    let reopened = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    agent().attach = (...x: unknown[]) => realAttach(...x).then((v: unknown) => { reopened = true; return v; });
    agent().state = (sid: string, ...x: unknown[]) => (reopened ? gate.then(() => answer(sid)) : realState(sid, ...x));
    return { release: () => release() };
  }
  it('nothing is claimed or sent while the recheck after the reopen is out', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    const h = afterReopen(() => Promise.resolve({ session_id: sid, live: true, state: 'idle', current_turn_id: null }));
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    expect(w!.agent.log.filter((x) => x[0] === 'attach')).toHaveLength(1);
    expect(forkCreates(), 'no create while the recheck is out').toHaveLength(0);
    expect(forkRecs(), 'no claim while the recheck is out').toHaveLength(0);
    h.release();
    await flush(900);
    expect(await f).toMatchObject({ k: 'opened' });
    expect(forkCreates()).toHaveLength(1);
  });
  for (const [name, answer] of [
    ['fails', () => Promise.reject({ status: 500, code: 'internal' })],
    ['says nothing of being live', (sid: string) => Promise.resolve({ session_id: sid, state: 'idle' })],
    ['is not a state at all', () => Promise.resolve('x')],
    ['says live only in a word, not a yes', (sid: string) => Promise.resolve({ session_id: sid, live: 'true', state: 'idle', current_turn_id: null })],
    ['still says asleep', (sid: string) => Promise.resolve({ session_id: sid, live: false, state: 'idle', current_turn_id: null })],
  ] as Array<[string, (sid: string) => Promise<unknown>]>) {
    it(`a recheck after the reopen that ${name} does not confirm the reopen: refused, nothing claimed or sent`, async () => {
      const { p, sid, bounds } = await parentChat(2);
      agent().setDormant(sid, true);
      await flush(900);
      afterReopen(answer).release();
      const f = p.fork(spec(bounds, 1));
      await flush(900);
      const out = await f;
      expect(out).toMatchObject({ k: 'refused', key: 'ask.forkReopenUnconfirmed', reason: 'notOpen' });
      // the reopen may have happened: the words claim only that no fork was made
      expect(forkOutcome(out)).toMatchObject({ k: 'refused', words: expect.stringContaining('no fork was made') });
      expect(forkCreates()).toHaveLength(0);
      expect(forkRecs()).toHaveLength(0);
    });
  }
  it('an account switch while the press reads the parent reopens nothing and claims nothing', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    const h = holdNext('state');
    const f = p.fork(spec(bounds, 1));
    await flush(300);
    showAccount(OTHER);
    h.release();
    await flush(900);
    showAccount(ACCOUNT);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkAccountMoved', reason: 'account' });
    expect(w!.agent.log.filter((x) => x[0] === 'attach'), 'nothing reopened under another account').toHaveLength(0);
    expect(forkCreates()).toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
  });
  for (const [name, answer] of [
    ['fails', () => Promise.reject({ status: 500, code: 'internal' })],
    ['says nothing of being live', (sid: string) => Promise.resolve({ session_id: sid, state: 'idle' })],
    ['is not a state at all', () => Promise.resolve('x')],
  ] as Array<[string, (sid: string) => Promise<unknown>]>) {
    for (const dormant of [true, false]) {
      it(`a first state read that ${name} (${dormant ? 'a dormant parent' : 'a live parent'}) proves nothing: refused, nothing reopened, claimed or sent`, async () => {
        const { p, sid, bounds } = await parentChat(2);
        if (dormant) { agent().setDormant(sid, true); await flush(900); }
        agent().state = (s: string) => answer(s);
        const f = p.fork(spec(bounds, 1));
        await flush(900);
        expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkStateUnread', reason: 'notRead' });
        expect(w!.agent.log.filter((x) => x[0] === 'attach')).toHaveLength(0);
        expect(forkCreates()).toHaveLength(0);
        expect(forkRecs()).toHaveLength(0);
      });
    }
  }
  it('an account switch while the reopen is out claims nothing and sends no create', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    const h = holdNext('attach');
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    expect(h.calls).toBe(1);
    showAccount(OTHER);
    h.release();
    await flush(900);
    showAccount(ACCOUNT);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkAccountMoved', reason: 'account' });
    expect(forkCreates()).toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
  });
  it('an engine ended while the reopen is out claims nothing and sends no create', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().setDormant(sid, true);
    await flush(900);
    const h = holdNext('attach');
    const f = p.fork(spec(bounds, 1));
    await flush(900);
    p.end();
    h.release();
    await flush(900);
    expect(await f).toMatchObject({ k: 'refused', key: 'ask.forkNotOpen', reason: 'notOpen' });
    expect(forkCreates()).toHaveLength(0);
    expect(forkRecs()).toHaveLength(0);
  });
  it('turn boundaries that are not a reading are not a pin', () => {
    expect(F.boundsOf({ turn_boundaries: [1, 3, 2] })).toBeNull();
    expect(F.boundsOf({ turn_boundaries: [1, -3] })).toBeNull();
    expect(F.boundsOf({ turn_boundaries: 'x' })).toBeNull();
    expect(F.boundsOf({ turn_boundaries: [1, 3, 3] })).toEqual([1, 3, 3]);
  });
});

describe('T5b the turns cannot be read', () => {
  it('a failed transcript read sends nothing', async () => {
    const { p, bounds } = await parentChat(2);
    agent().transcript = () => Promise.reject({ status: 0, pending: true });
    expect(await p.fork(spec(bounds, 1))).toMatchObject({ k: 'refused', key: 'ask.forkNotRead' });
    expect(forkCreates()).toHaveLength(0);
  });
});

describe('T6 navigation only after the create is settled', () => {
  it('a reply whose record move the journal could not keep is not opened (settled only with the record at the session)', async () => {
    const { p, bounds } = await parentChat(2);
    const hold = holdNext('create');
    const run = p.fork(spec(bounds, 1));
    await flush(900);
    w!.fs.blockWrites(JOURNAL);
    hold.release();
    const out = await run;
    expect(out).toMatchObject({ k: 'unknown', reason: 'handoff', key: 'ask.forkHandoff' });
    w!.fs.clearFaults();
    expect((await p.fork(spec(bounds, 1))).k, 'the record is kept, so the target stays pending').toBe('unknown');
    expect(forkCreates()).toHaveLength(1);
  });
  it('nothing opens while the create is out; the outcome appears with the settled reply', async () => {
    const { p, bounds } = await parentChat(2);
    const hold = holdNext('create');
    let outcome: F.ForkOutcome | null = null;
    void p.fork(spec(bounds, 1)).then((o) => { outcome = o; });
    await flush(900);
    expect(hold.calls, 'the create is out').toBe(1);
    expect(outcome, 'no outcome (nothing to open) before the settle').toBeNull();
    hold.release();
    await flush(900);
    expect(outcome).toMatchObject({ k: 'opened' });
    const o = outcome as unknown as { sid: string; k1: string };
    expect(recs()[`${HANDLE}|${REALM}|${o.sid}`], 'opened only with the record at the new session').toMatchObject({ s: o.sid, fk: { i: 1 } });
  });
  it('an unknown outcome never opens, however often it is asked again', async () => {
    const { p, bounds } = await parentChat(2);
    agent().o.createLost = true;
    const out = await p.fork(spec(bounds, 1));
    expect(out).toMatchObject({ k: 'unknown', key: 'ask.forkMade' });
    for (let i = 0; i < 3; i++) expect((await p.fork(spec(bounds, 1))).k, 'a press joins the unsettled fork').toBe('unknown');
    expect(forkCreates(), 'one create, never a second').toHaveLength(1);
  });
});

describe('T7 a lost answer stays unknown for the life of the page', () => {
  for (const [name, flag] of [['made, answer lost', 'createLost'], ['never admitted', 'createLostBefore']] as const) {
    it(`${name}: every later press is the same pending fork and sends no second create; the record is kept`, async () => {
      const { p, bounds } = await parentChat(2);
      agent().o[flag] = true;
      const out = await p.fork(spec(bounds, 1));
      expect(out).toMatchObject({ k: 'unknown', key: 'ask.forkMade' });
      expect(forkRecs(), 'the record is the block, on every page, until a Check proves what became of it').toHaveLength(1);
      for (let i = 0; i < 3; i++) expect(await p.fork(spec(bounds, 1)), 'the same pending fork').toMatchObject({ k: 'unknown', k1: (out as any).k1, reason: 'pending', key: 'ask.forkPending' });
      await flush(1500);
      expect(forkCreates(), 'one create, never a second').toHaveLength(1);
    });
  }
  it('a new engine on the same page (the chat reopened) still blocks the target', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().o.createLost = true;
    expect((await p.fork(spec(bounds, 1))).k).toBe('unknown');
    p.end();
    const p2 = w!.pinned(sid);
    p2.open(); await flush(900);
    expect((await p2.fork(spec(bounds, 1))).k).toBe('unknown');
    expect(forkCreates()).toHaveLength(1);
  });
  it('another turn of the same chat is not blocked by it', async () => {
    const { p, bounds } = await parentChat(2);
    agent().o.createLost = true;
    expect((await p.fork(spec(bounds, 1))).k).toBe('unknown');
    agent().o.createLost = false;
    expect((await p.fork(spec(bounds, 0))).k).toBe('opened');
    expect(forkCreates()).toHaveLength(2);
  });
  // The fork recovery (fork5.fake-agent-reserves-key) gives a pending fork its way back: Check and Hide live in ForkRecovery over the journal's readFork / retireFork /
  // dismissFork, under the target lock. What stays out for good is the lease family and a generic retire of a create.
  it('there is no lease and no generic create retire on the engine or the journal', async () => {
    const { p } = await parentChat(2);
    for (const m of ['retireCreate', 'leaseFork']) {
      expect((p as any)[m], `engine.${m}`).toBeUndefined();
      expect((w!.j as any)[m], `journal.${m}`).toBeUndefined();
    }
  });
});

describe('T9 single flight', () => {
  it('two presses while one is unsettled are one create', async () => {
    const { p, bounds } = await parentChat(2);
    const hold = holdNext('create');
    const a = p.fork(spec(bounds, 1));
    const b = p.fork(spec(bounds, 1));
    await flush(900);
    hold.release();
    const [x, y] = await Promise.all([a, b]);
    expect(x).toEqual(y);
    expect(x.k).toBe('opened');
    expect(forkCreates()).toHaveLength(1);
  });
  it('after a settled fork a new press is a new, distinct fork', async () => {
    const { p, bounds } = await parentChat(2);
    const x = await p.fork(spec(bounds, 1));
    const y = await p.fork(spec(bounds, 1));
    if (x.k !== 'opened' || y.k !== 'opened') throw new Error('expected two forks');
    expect(x.sid).not.toBe(y.sid);
    expect(x.k1).not.toBe(y.k1);
    expect(forkCreates()).toHaveLength(2);
  });
  it('different turns of one chat are different flights', async () => {
    const { p, bounds } = await parentChat(2);
    const hold = holdNext('create');
    const a = p.fork(spec(bounds, 0));
    await flush(300);
    const b = p.fork(spec(bounds, 1));
    await flush(300);
    hold.release();
    await flush(900);
    expect((await a).k).toBe('opened');
    expect((await b).k).toBe('opened');
    expect(forkCreates()).toHaveLength(2);
  });
});

describe('T10 a reload after a lost answer', () => {
  it('shows no phantom first message in any chat, and the target forks again with a fresh create and a new key', async () => {
    const { p, sid, bounds } = await parentChat(2);
    agent().o.createLost = true;
    const out = await p.fork(spec(bounds, 1));
    if (out.k !== 'unknown') throw new Error('expected unknown');
    const b = await w!.dockB();                                // a page reloaded after the lost answer
    expect(users(b.getSnapshot(), C), 'no first-message row for a fork').toHaveLength(0);
    const b2 = w!.pinned(sid, 'B');
    b2.open(); await flush(900);
    expect(users(b2.getSnapshot(), C).filter((u: any) => u.state === 'unknown'), 'the parent shows no lost message').toHaveLength(0);
    // The lost answer's record survives the reload and blocks the target on every page; a press says what is pending (Check recovers it).
    const again = await b2.fork(spec((await b2.turnPins())!, 1));
    expect(again, 'the reloaded page meets the stored record').toMatchObject({ k: 'unknown', k1: out.k1, reason: 'pending' });
    expect((await p.fork(spec(bounds, 1))).k, 'and so does the page that lost the answer').toBe('unknown');
    expect(forkCreates(), 'no second create').toHaveLength(1);
  });
});

describe('T10b the pending fork is never a chat row', () => {
  it('the conversation list and the dock read leave a fork record without a session out', async () => {
    const { p, bounds } = await parentChat(2);
    const hold = holdNext('create');                           // the create is out: its claim is stored
    const run = p.fork(spec(bounds, 1));
    await flush(900);
    const out = forkRecs()[0] as any;
    expect(out, 'the claim is stored while the create is out').toBeTruthy();
    const st = w!.j.dockRead(ACCOUNT, { v: 1, a: {} } as any);
    const rows = ((st.a as any)[ACCOUNT] ?? []) as any[];
    expect(rows.filter((r) => r.k1 === out.k1), 'dock read').toHaveLength(0);
    const all = { v: 1, a: { [ACCOUNT]: [...rows, { ...forkRecs()[0], h: undefined }] } } as any;
    const listed = C.convsFor(all, ACCOUNT, { p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM });
    expect(listed.filter((r: any) => r.k1 === out.k1), 'conversation list').toHaveLength(0);
    hold.release();
    expect((await run).k).toBe('opened');
  });
});

describe('T12 Records.put', () => {
  const base = (over: Record<string, unknown> = {}): any => ({
    p: '6a0000000000000000000001', c: 'c0a7150000000000000000a1', r: REALM, s: null, t: null, k1: 'hx-' + 'a'.repeat(32), k2: 'hx-' + 'b'.repeat(32),
    rc: 'custom', n: null, at: 1, i: null, q: 0, ph: 'completed', l: 'en', fk: { s: 'sess-1', i: 2 }, ...over,
  });
  it('a save can neither drop fk nor change its parent or turn, and cannot turn a chat into a fork', async () => {
    w = world();
    plantFork(base());
    const id = `${HANDLE}|${REALM}|create:${'a'.repeat(32) === '' ? '' : 'hx-' + 'a'.repeat(32)}`;
    void id;
    const read = () => Object.values(recs()).find((r: any) => r.k1 === 'hx-' + 'a'.repeat(32)) as any;
    expect(await w.j.put(HANDLE, base({ fk: undefined }))).toBe('ok');
    expect(read().fk, 'a stale save without fk').toEqual({ s: 'sess-1', i: 2 });
    expect(await w.j.put(HANDLE, base({ fk: { s: 'sess-9', i: 0 } }))).toBe('ok');
    expect(read().fk, 'another parent or turn').toEqual({ s: 'sess-1', i: 2 });
    expect(await w.j.put(HANDLE, base({ s: 'sess-5' }))).toBe('ok');
    expect(read().fk, 'the same unit at its session').toEqual({ s: 'sess-1', i: 2 });
    const plain = base({ k1: 'hx-' + 'c'.repeat(32), fk: undefined, ph: 'completed' });
    expect(await w.j.put(HANDLE, plain)).toBe('ok');
    expect(await w.j.put(HANDLE, { ...plain, fk: { s: 'sess-1', i: 1 } })).toBe('ok');
    expect((Object.values(recs()).find((r: any) => r.k1 === plain.k1) as any).fk, 'a chat that is not a fork stays one').toBeUndefined();
  });
  it('a corrupt fk in the stored document is quarantined as an unresolved fork (never stripped into a phantom chat; see fork2.claim-across-tabs U4)', () => {
    expect(L.validRec(base({ fk: { s: '', i: 1 } }))?.fk).toEqual({ s: '', i: null, bad: true });
    expect(L.validRec(base({ fk: { s: 'sess-1', i: -1 } }))?.fk).toEqual({ s: '', i: null, bad: true });
    expect(L.validRec(base({ fk: { s: 'sess-1', i: 1.5 } }))?.fk).toEqual({ s: '', i: null, bad: true });
    expect(L.validRec(base({ fk: [] }))?.fk).toEqual({ s: '', i: null, bad: true });
    expect(L.validRec(base({ fk: { s: 'sess-1', i: null } }))?.fk).toEqual({ s: 'sess-1', i: null });
  });
  it('a stored t of null and a save that pairs a turn with a fenced key is refused whole', async () => {
    w = world();
    const old = 'hx-' + 'd'.repeat(32), k1 = 'hx-' + 'e'.repeat(32), cur = 'hx-' + '1'.repeat(32);
    const at = (over: Record<string, unknown> = {}): any => ({ ...base({ fk: undefined, ph: 'completed', k1, k2: cur }), s: 'sess-7', ...over });
    expect(await w.j.put(HANDLE, at({ s: null }))).toBe('ok');            // an at-session record with no turn comes only from the create record
    expect(await w.j.put(HANDLE, at({ na: [old], dk: [old] }))).toBe('ok');
    const read = () => Object.values(recs()).find((r: any) => r.k1 === k1) as any;
    expect(read()).toMatchObject({ t: null, k2: cur });
    expect(await w.j.put(HANDLE, at({ t: 'turn-1', ph: 'working', k2: old, na: [old], dk: [old] }))).toBe('ok');
    expect(read(), 'the fenced key never names a turn; the stored unit wins whole').toMatchObject({ t: null, k2: cur });
    expect(await w.j.put(HANDLE, at({ t: 'turn-1', ph: 'working', k2: 'hx-' + '2'.repeat(32) }))).toBe('ok');
    expect(read(), 'a key a later turn legitimately brings passes').toMatchObject({ t: 'turn-1', k2: 'hx-' + '2'.repeat(32) });
  });
  void recordsForTests; void JOURNAL_RECS;
});

describe('T13 words', () => {
  it('every key the fork can answer exists in the strings, and the kit mapping carries only words', () => {
    for (const k of ['ask.forkMade', 'ask.forkNotOpen', 'ask.forkNoTurn', 'ask.forkReopenFailed', 'ask.forkReopenGates', 'ask.forkReopenUnconfirmed', 'ask.forkStateUnread', 'ask.forkAccountMoved', 'ask.forkChanged', 'ask.forkApproval', 'ask.forkNotRead', 'ask.forkFull', 'ask.notRemembered']) expect(words(k), k).toBeTruthy();
    expect(words('ask.forkNone'), 'a Check can prove that none was made').toBeTruthy();
    expect(forkOutcome({ k: 'opened', sid: 's', k1: 'k' })).toEqual({ k: 'opened', sid: 's' });
    expect(forkOutcome({ k: 'refused', key: 'ask.forkApproval', reason: 'approval' })).toEqual({ k: 'refused', words: words('ask.forkApproval'), reason: 'approval' });
    expect(forkOutcome({ k: 'unknown', k1: 'hx-1', key: 'ask.forkMade', reason: 'lost' })).toEqual({ k: 'unknown', words: words('ask.forkMade'), reason: 'lost', k1: 'hx-1' });
    expect(forkOutcome({ k: 'refused', key: 'not.a.key', reason: 'refused' }), 'an unknown key never shows as raw text').toEqual({ k: 'refused', words: words('ask.forkMade'), reason: 'refused' });
  });
  it('a server body is never shown: the words come from the typed code', () => {
    expect(F.forkRefusal({ status: 400, code: 'bad_request', message: 'fork_turn_idx 9 out of range on host h-12' })).toEqual({ key: 'ask.forkChanged', unknown: false });
    expect(F.forkRefusal({ status: 500, code: 'x' })).toEqual({ key: 'ask.forkMade', unknown: true });
    expect(F.forkRefusal({ stale: true })).toEqual({ key: 'ask.forkMade', unknown: true });
    expect(F.forkRefusal({ status: 422, code: 'whatever' }).key).toBe('ask.failed');
  });
  it('an engine without a journal or without a session refuses with the nothing-sent words', async () => {
    w = world();
    const a = await w.dock();
    expect(await a.fork(null)).toMatchObject({ k: 'refused', key: 'ask.notRemembered' });
    expect(creates()).toHaveLength(0);
  });
  void ({} as AskEngine);
});
