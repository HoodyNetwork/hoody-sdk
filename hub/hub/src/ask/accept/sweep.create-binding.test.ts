// A create reply is judged by its `started` evidence BEFORE the journal settles it.
//   B1  evidence that is absent or ill-typed (MISSING) is unknown: nothing is settled, no record moves, the key stays, no turn is sent
//   B2  evidence that names another binding (MISMATCH) is refused, and no record (create or session address) can route a turn
//   B3  a reload after a refusal finds no record: a typed message makes a new chat, never a turn to the refused session
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import * as C from '../conv';
import { ACCOUNT, JOURNAL, posts, storedKeys, users, world, type World } from './env';

let w: World | null = null;
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const agent = (): any => w!.agent as any;
const recs = (): Record<string, any> => { try { return JSON.parse(w!.fs.peek(JOURNAL)!)?.a?.[ACCOUNT] ?? {}; } catch { return {}; } };
/** The next create's reply is rewritten by `fix`; returns the session the agent made. */
function rewriteCreate(fix: (r: any) => any): { sid: () => string } {
  const real = agent().create.bind(agent());
  let sid = '';
  agent().create = async (...a: unknown[]) => { const r = await real(...a); sid = r.session_id; return fix(r); };
  return { sid: () => sid };
}
const withStarted = (s: Record<string, unknown>) => (r: any) => ({ ...r, started: { ...r.started, ...s } });

describe('B1 a reply without the evidence is unknown', () => {
  const cases: Array<[string, (r: any) => any]> = [
    ['no started', (r) => ({ session_id: r.session_id })],
    ['started is not an object', (r) => ({ ...r, started: 'yes' })],
    ['realm_selector absent', withStarted({ realm_selector: undefined })],
    ['realm_selector empty', withStarted({ realm_selector: '' })],
    ['realm_selector a number', withStarted({ realm_selector: 7 })],
    ['computer_id a number', withStarted({ computer_id: 7 })],
    ['computer_id null', withStarted({ computer_id: null })],
    ['owner_fingerprint absent', withStarted({ owner_fingerprint: undefined })],
    // The retired container_id is not identity evidence. The base answered MISMATCH for another id; the rename must not read it as "this computer".
    ['retired container_id naming another computer', withStarted({ container_id: 'computer-B' })],
    ['retired container_id alone, computer_id absent', (r) => { const { computer_id: _c, ...rest } = r.started; return { ...r, started: { ...rest, container_id: 'computer-B' } }; }],
    ['retired container_id a number', withStarted({ container_id: 7 })],
    ['both spellings present, equal', (r) => ({ ...r, started: { ...r.started, container_id: r.started.computer_id ?? 'c-self' } })],
  ];
  for (const [name, fix] of cases) {
    it(`${name}: the row is unknown, the key stays, nothing moves, no turn is sent`, async () => {
      w = world();
      const made = rewriteCreate(fix);
      const eng = await w.dock();
      eng.send('hello');
      await w.flush(1500);
      const row = users(eng.getSnapshot(), C)[0];
      expect(row.state, 'unknown, never refused').toBe('unknown');
      expect(row.reason ?? '').not.toBe('ask.bindingFailed');
      expect(storedKeys(w.fs), 'the create entry is still there (Check again)').toHaveLength(1);
      const keys = Object.keys(recs());
      expect(keys.some((k) => k.endsWith('|' + made.sid())), 'no record names the session').toBe(false);
      expect(posts(w.agent, 'turn')).toHaveLength(0);
    });
  }
  it('absent computer_id is the agent\'s self spelling and opens', async () => {
    w = world();
    rewriteCreate((r) => { const { computer_id: _c, ...rest } = r.started; return { ...r, started: rest }; });
    const eng = await w.dock();
    eng.send('hello');
    await w.flush(1500);
    expect(posts(w.agent, 'turn')).toHaveLength(1);
    expect(users(eng.getSnapshot(), C)[0].state).toBe('sent');
  });
});

describe('B1b a gateway below session protocol 3 or without computer_binding gets no computer-targeted request', () => {
  for (const [name, o] of [
    ['protocol 2 with the other three capabilities', { protocol: 2 }],
    ['protocol 3 without computer_binding', { caps: ['turn_idempotency', 'session_state', 'gate_envelope'] }],
  ] as const) {
    it(`${name}: not ready, no create, no turn`, async () => {
      w = world(o as any);
      const eng = await w.dock();
      eng.send('hello');
      await w.flush(1500);
      expect(posts(w.agent, 'create'), 'nothing was sent that names a computer').toHaveLength(0);
      expect(posts(w.agent, 'turn')).toHaveLength(0);
      expect(storedKeys(w.fs), 'no create key was minted').toHaveLength(0);
      expect(Object.keys(recs())).toEqual([]);
    });
  }
});

describe('B2 evidence for another binding is refused and routes nothing', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['another owner', { owner_fingerprint: 'fp-other' }],
    ['another computer', { computer_id: 'c-other' }],
    ['another realm', { realm_selector: 'a2a2a2a2a2a2a2a2a2a2a2a2' }],
  ];
  for (const [name, s] of cases) {
    it(`${name}: refused, no record at either address, no turn`, async () => {
      w = world();
      const made = rewriteCreate(withStarted(s));
      const eng = await w.dock();
      eng.send('hello');
      await w.flush(2500);
      const row = users(eng.getSnapshot(), C)[0];
      expect(row).toMatchObject({ state: 'refused', reason: 'ask.bindingFailed' });
      expect(Object.keys(recs()).filter((k) => k.endsWith('|' + made.sid()) || k.includes('create:')), 'neither the session address nor the create address').toEqual([]);
      expect(posts(w.agent, 'turn')).toHaveLength(0);
    });
  }
});

describe('B3 a reload after a refusal', () => {
  it('finds no record: a typed message creates a new chat, never a turn to the refused session', async () => {
    w = world();
    const made = rewriteCreate(withStarted({ owner_fingerprint: 'fp-other' }));
    const eng = await w.dock();
    eng.send('hello');
    await w.flush(2500);
    const refused = made.sid();
    expect(refused).not.toBe('');
    // The agent answers normally from now on.
    agent().create = Object.getPrototypeOf(agent()).create.bind(agent());
    const again = await w.dockB();
    expect(again.record?.s ?? null, 'no record to reopen').toBeNull();
    again.send('second try');
    await w.flush(2500);
    const turns = posts(w.agent, 'turn');
    expect(turns.length).toBeGreaterThan(0);
    for (const t of turns) expect(t[1][0], 'every turn goes to the new session').not.toBe(refused);
    expect(posts(w.agent, 'create')).toHaveLength(2);
  });
});

describe('B4 a refusal that comes after the asking engine ended', () => {
  it('still takes the record away: a reload finds nothing to route a turn to', async () => {
    w = world();
    const real = agent().create.bind(agent());
    let sid = '';
    let release: () => void = () => {};
    const gate = new Promise<void>((res) => { release = res; });
    agent().create = async (...a: unknown[]) => {
      const r = await real(...a);
      sid = r.session_id;
      await gate;
      return withStarted({ owner_fingerprint: 'fp-other' })(r);
    };
    const eng = await w.dock();
    eng.send('hello');
    await w.flush(500);
    expect(sid, 'the create reached the agent and is held').not.toBe('');
    eng.end();
    release();
    await w.flush(2500);
    expect(Object.keys(recs()).filter((k) => k.endsWith('|' + sid) || k.includes('create:')), 'neither address survives the late refusal').toEqual([]);
    agent().create = Object.getPrototypeOf(agent()).create.bind(agent());
    const again = await w.dockB();
    expect(again.record?.s ?? null, 'nothing to reopen').toBeNull();
    for (const t of posts(w.agent, 'turn')) expect(t[1][0], 'no turn reached the refused session').not.toBe(sid);
  });
});

describe('B5 a removal the store refuses is tried again', () => {
  for (const mode of ['refuses', 'throws'] as const) {
    it(`the record goes once the store takes the removal (${mode} first)`, async () => {
      w = world();
      const made = rewriteCreate(withStarted({ owner_fingerprint: 'fp-other' }));
      const eng = await w.dock();
      const real = (eng as any).dropRec.bind(eng);
      let bad = 3;
      (eng as any).dropRec = (r: unknown, ...rest: unknown[]) => {
        if (bad-- > 0) return mode === 'refuses' ? Promise.resolve(false) : Promise.reject(new Error('store'));
        return real(r, ...rest);
      };
      eng.send('hello');
      await w.flush(12000);
      expect(users(eng.getSnapshot(), C)[0]).toMatchObject({ state: 'refused', reason: 'ask.bindingFailed' });
      expect(bad, 'the removals were tried again').toBeLessThan(0);
      expect(Object.keys(recs()).filter((k) => k.endsWith('|' + made.sid()) || k.includes('create:'))).toEqual([]);
    });
  }
});

describe('the removal is made in the account that asked', () => {
  it('every journal drop of a refused create names the asking account', async () => {
    w = world();
    rewriteCreate(withStarted({ owner_fingerprint: 'fp-other' }));
    const eng = await w.dock();
    const j = (eng as any).jr.j;
    const real = j.drop.bind(j);
    const seen: unknown[] = [];
    j.drop = (...a: unknown[]) => { seen.push(a[4]); return real(...a); };
    eng.send('hello');
    await w.flush(2500);
    expect(seen.length, 'both addresses were dropped').toBeGreaterThanOrEqual(2);
    for (const x of seen) expect(x).toBe(ACCOUNT);
  });
});
