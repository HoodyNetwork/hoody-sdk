// TODO actions, the pure parts and the action store over a fake api: run / approve / deny / cancel run each send
// once; a lost answer is never sent again and stays unknown until a read of the TODO shows the effect or rules it out.
// Cancel run is bound to the run read at the send (the lease's worker session): its outcome is THAT run's run_end, and
// "cancelled" needs that entry read. A lost Run is never settled from a read. Every send reads
// the TODO first and sends nothing when what the confirm was opened for moved (identOf); a
// proposal's status is a closed set where missing or unrecognised is unknown, and 'approved' (provisional) settles nothing.
import { describe, expect, it } from 'vitest';
import { createActionStore, identOf, proposalState, runOf, runSeenSince, SKEW_MS, seenOf, verdict, type PState, type Seen, type Settled, type TodoApi } from './actions';

const T = Date.parse('2026-10-29T12:00:00Z');
const iso = (ms: number) => new Date(T + ms).toISOString();
const ok: Settled = { ok: true, body: { status: 'ok' } };
const lost: Settled = { ok: false, err: { kind: 'pending', code: '', status: 0 } };
const refused = (status = 400, code = 'bad_request'): Settled => ({ ok: false, err: { kind: 'failed', code, status } });
const pr = (status: PState, expiresAt = iso(3_600_000), rev = '3') => ({ status, expiresAt, rev });
const seen = (o: Partial<Seen> = {}): Seen => ({ lease: null, state: 'ready', contentRev: '3', proposals: {}, runs: [], ...o });
/** A TODO offering Run and proposals p1, p2 (what the read before a send sees unless a test says otherwise). */
const free = () => seen({ proposals: { p1: pr('pending'), p2: pr('pending') } });
const RUN = 'run\n3\nready';
const P1 = 'proposal\np1\n3';
const P2 = 'proposal\np2\n3';
const W1 = 'cancel\nw1';
type Run = Seen['runs'][number];
const start = (ts: number, session: string, body = 'worker implementer started (todos.run RPC)'): Run => ({ kind: 'run_start', ts: iso(ts), outcome: '', body, session });
const end = (ts: number, outcome: string, session = ''): Run => ({ kind: 'run_end', ts: iso(ts), outcome, body: '', session });
const held = (session: string) => ({ acquiredAt: iso(-60_000), expiresAt: iso(60_000), session });

function fakeApi(o: { replies?: Partial<Record<'run' | 'cancelRun' | 'approve' | 'deny', Settled[]>>; reads?: Array<Seen | null> } = {}) {
  const sent: Array<{ op: string; pid?: string }> = [];
  const next = (k: 'run' | 'cancelRun' | 'approve' | 'deny') => o.replies?.[k]?.shift() ?? ok;
  const api: TodoApi = {
    read: async () => (sent.push({ op: 'read' }), o.reads?.length ? o.reads.shift()! : free()),
    run: async () => (sent.push({ op: 'run' }), next('run')),
    cancelRun: async () => (sent.push({ op: 'cancelRun' }), next('cancelRun')),
    approve: async (pid) => (sent.push({ op: 'approve', pid }), next('approve')),
    deny: async (pid) => (sent.push({ op: 'deny', pid }), next('deny')),
  };
  return { api, sent, writes: () => sent.filter((x) => x.op !== 'read'), reads: () => sent.filter((x) => x.op === 'read').length };
}
const store = (api: TodoApi) => createActionStore({ api, now: () => T });

describe('seenOf', () => {
  it('reads the lease and its worker session, proposal states and run entries with their outcome and session', () => {
    const got = seenOf({
      status: 'ok',
      todo: {
        id: 'todo_1',
        lease: { acquired_at: iso(0), expires_at: iso(120_000), session_id: 'w1' },
        state: 'ready',
        content_rev: 4,
        proposals: [{ id: 'p1', status: 'pending', expires_at: iso(60_000), todo_revision: 4 }, { status: 'approved' }, { id: 'p2', status: 'approving' }, { id: 'p3' }],
        timeline: [{ kind: 'filed', ts: iso(-9e6) }, { kind: 'run_start', ts: iso(-60_000), meta: { session: 'w1' } }, { kind: 'run_end', ts: iso(0), body: 'run cancelled by user', meta: { outcome: 'cancelled' } }],
      },
    }, 'todo_1');
    expect(got).toEqual({
      lease: { acquiredAt: iso(0), expiresAt: iso(120_000), session: 'w1' },
      state: 'ready',
      contentRev: '4',
      proposals: { p1: pr('pending', iso(60_000), '4'), p2: pr('unknown', '', ''), p3: pr('unknown', '', '') },
      runs: [{ kind: 'run_start', ts: iso(-60_000), outcome: '', body: '', session: 'w1' }, { kind: 'run_end', ts: iso(0), outcome: 'cancelled', body: 'run cancelled by user', session: '' }],
    });
  });
  it('anything that is not an ok answer carrying this TODO proves nothing', () => {
    expect(seenOf(null, 'x')).toBeNull();
    expect(seenOf({ status: 'ok', todo: {} }, 'x')).toBeNull();
    expect(seenOf({ status: 'ok', todo: { id: 'x' } }, 'x')).toEqual({ lease: null, state: '', contentRev: '', proposals: {}, runs: [] });
    // another TODO's record, a missing or other status: not this one's evidence
    expect(seenOf({ status: 'ok', todo: { id: 'y', state: 'ready' } }, 'x')).toBeNull();
    expect(seenOf({ todo: { id: 'x', state: 'ready' } }, 'x')).toBeNull();
    expect(seenOf({ status: 'error', todo: { id: 'x', state: 'ready' } }, 'x')).toBeNull();
  });
  it('proposal status is one closed set: anything else, missing included, is unknown', () => {
    expect(['pending', 'approved', 'denied', 'expired'].map(proposalState)).toEqual(['pending', 'approved', 'denied', 'expired']);
    expect(['', 'Pending', 'approving', undefined, null, 3].map(proposalState)).toEqual(Array(6).fill('unknown'));
  });
});

describe('runOf: the run of one worker session', () => {
  it.each([
    ['its start, no end yet', [start(0, 'w1')], 'w1', { start: 0, end: null }],
    ['its start and the first end after it', [start(0, 'w1'), end(10, 'cancelled'), end(20, 'done')], 'w1', { start: 0, end: 'cancelled' }],
    ["an earlier run's end is not its end", [start(-90, 'w0'), end(-50, 'cancelled'), start(0, 'w1')], 'w1', { start: 0, end: null }],
    ["a later run's start is not its run", [start(0, 'w1'), end(10, 'done'), start(20, 'w2')], 'w1', { start: 0, end: 'done' }],
    ['an end naming another session is skipped', [start(0, 'w1'), end(10, 'failed', 'w9'), end(20, 'cancelled')], 'w1', { start: 0, end: 'cancelled' }],
    ['no start of that session', [start(0, 'w0'), end(10, 'cancelled')], 'w1', null],
    ['no session captured', [start(0, ''), end(10, 'cancelled')], '', null],
    // the boundary: never past the next run_start of any session
    ['end A, start A, start B, end B: B\'s unlabelled end is not A\'s', [end(-10, 'done'), start(0, 'w1'), start(10, 'w2'), end(20, 'cancelled')], 'w1', { start: 0, end: null }],
    ['a lease that expired and was taken over writes no end: none for A', [start(0, 'w1'), start(10, 'w2')], 'w1', { start: 0, end: null }],
    ['an end labelled A after another start is still not crossed to', [start(0, 'w1'), start(10, 'w2'), end(20, 'cancelled', 'w1')], 'w1', { start: 0, end: null }],
    ['B itself: its unlabelled end', [start(0, 'w1'), start(10, 'w2'), end(20, 'cancelled')], 'w2', { start: 10, end: 'cancelled' }],
  ])('%s', (_name, runs, session, want) => {
    const got = runOf(seen({ runs: runs as Run[] }), session as string);
    expect(got && { start: Date.parse(got.start.ts) - T, end: got.end?.outcome ?? null }).toEqual(want);
  });
  // a release/cancel run_end carries no session, so an unlabelled end is never named as A's
  it.each([
    ['an end labelled with its session is named', [start(0, 'w1'), end(10, 'cancelled', 'w1')], true],
    ['an unlabelled end is not named', [start(0, 'w1'), end(10, 'cancelled')], false],
    ['no end: not named', [start(0, 'w1')], false],
  ])('named: %s', (_name, runs, want) => {
    expect(runOf(seen({ runs: runs as Run[] }), 'w1')?.named).toBe(want);
  });
});

describe('verdict', () => {
  it('run: never settled from a read, whatever the TODO shows', () => {
    expect(verdict('run', '', seen({ runs: [start(5000, 'w1')] }), '')).toBe('unknown');
    expect(verdict('run', '', seen({ lease: held('w1') }), '')).toBe('unknown');
    expect(verdict('run', '', seen(), '')).toBe('unknown');
  });
  it('runSeenSince: an observation of a person-requested run_start since the send, never a proof', () => {
    expect(runSeenSince(seen({ runs: [start(5000, 'w1')] }), T)?.session).toBe('w1');
    expect(runSeenSince(seen({ runs: [start(-SKEW_MS, 'w1')] }), T)).not.toBeNull();
    expect(runSeenSince(seen({ runs: [start(-SKEW_MS - 1000, 'w1')] }), T)).toBeNull();
    expect(runSeenSince(seen({ runs: [start(5000, 'w1', 'worker implementer started (scheduler (full-auto))')] }), T)).toBeNull();
  });
  it.each([
    // approved is provisional (a worker that fails to start puts it back to pending): it settles neither
    ['approve', 'approved', 'unknown'],
    ['approve', 'denied', 'not'],
    ['approve', 'expired', 'not'],
    ['approve', 'pending', 'unknown'],
    ['approve', 'unknown', 'unknown'],
    ['deny', 'denied', 'made'],
    ['deny', 'approved', 'unknown'],
    ['deny', 'expired', 'not'],
    ['deny', 'pending', 'unknown'],
    ['deny', 'unknown', 'unknown'],
  ] as const)('%s, proposal reads %s: %s', (a, st, want) => {
    expect(verdict(a, 'p1', seen({ proposals: { p1: pr(st) } }), '')).toBe(want);
  });
  it('approve / deny: a proposal missing from the read proves nothing', () => {
    expect(verdict('approve', 'p1', seen({ proposals: { p2: pr('denied') } }), '')).toBe('unknown');
    expect(verdict('deny', 'p1', seen(), '')).toBe('unknown');
  });
  it("cancel run: made only when ITS run's end reads cancelled", () => {
    expect(verdict('cancelRun', '', seen({ runs: [start(0, 'w1'), end(10, 'cancelled', 'w1')] }), 'w1')).toBe('made');
    // an unlabelled end never settles (another lease may have written it before its own start)
    expect(verdict('cancelRun', '', seen({ runs: [start(0, 'w1'), end(10, 'cancelled')] }), 'w1')).toBe('unknown');
    expect(verdict('cancelRun', '', seen({ runs: [start(0, 'w1'), end(10, 'done')] }), 'w1')).toBe('unknown');
    expect(verdict('cancelRun', '', seen({ runs: [start(0, 'w1')] }), 'w1')).toBe('unknown');
    // another run's cancelled end, even since the send, is not this cancel's
    expect(verdict('cancelRun', '', seen({ runs: [start(-90, 'w0'), end(10, 'cancelled'), start(20, 'w1')] }), 'w1')).toBe('unknown');
    expect(verdict('cancelRun', '', seen({ runs: [start(0, 'w0'), end(10, 'cancelled')] }), 'w1')).toBe('unknown');
  });
});

describe('identOf: what a confirm is bound to', () => {
  it.each([
    ['run, free', 'run', '', free(), RUN],
    ['run, held', 'run', '', seen({ lease: held('w1') }), null],
    ['run, closed', 'run', '', seen({ state: 'done' }), null],
    ['run, another content revision', 'run', '', seen({ contentRev: '4' }), 'run\n4\nready'],
    ['cancel, held by w1', 'cancelRun', '', seen({ lease: held('w1') }), W1],
    ['cancel, held by w2', 'cancelRun', '', seen({ lease: held('w2') }), 'cancel\nw2'],
    ['cancel, free', 'cancelRun', '', free(), null],
    ['approve, pending', 'approve', 'p1', free(), P1],
    ['approve, pending, past its expires_at', 'approve', 'p1', seen({ proposals: { p1: pr('pending', iso(0)) } }), null],
    ['approve, pending, unparseable expires_at', 'approve', 'p1', seen({ proposals: { p1: pr('pending', 'soon') } }), P1],
    ['approve, approved', 'approve', 'p1', seen({ proposals: { p1: pr('approved') } }), null],
    ['approve, unknown status', 'approve', 'p1', seen({ proposals: { p1: pr('unknown') } }), null],
    ['approve, missing', 'approve', 'p1', seen(), null],
    ['deny, on a held TODO', 'deny', 'p1', seen({ lease: held('w1'), proposals: { p1: pr('pending') } }), null],
    ['approve, made against another revision', 'approve', 'p1', seen({ proposals: { p1: pr('pending', iso(3_600_000), '2') } }), 'proposal\np1\n2'],
  ] as const)('%s', (_n, a, pid, s, want) => {
    expect(identOf(a, pid, s, T)).toBe(want);
  });
});

describe('the action store', () => {
  describe('the read before the send: nothing is sent unless the TODO still offers what was confirmed', () => {
    it.each([
      ['cancel confirmed for w1, the lease is now w2', 'cancelRun', '', W1, seen({ lease: held('w2'), runs: [start(-60_000, 'w2')] })],
      ['run confirmed at content rev 3, now 4', 'run', '', RUN, seen({ contentRev: '4' })],
      ['run confirmed, a worker took it', 'run', '', RUN, seen({ lease: held('w1') })],
      ['approve confirmed, the proposal now past its expires_at', 'approve', 'p1', P1, seen({ proposals: { p1: pr('pending', iso(-1)) } })],
      ['approve confirmed, the proposal now reads unknown', 'approve', 'p1', P1, seen({ proposals: { p1: pr('unknown') } })],
      ['approve confirmed, the proposal was replaced (another revision)', 'approve', 'p1', P1, seen({ proposals: { p1: pr('pending', iso(3_600_000), '4') } })],
      ['deny (unconfirmed), the proposal expired meanwhile', 'deny', 'p1', null, seen({ proposals: { p1: pr('expired') } })],
    ] as const)('%s', async (_n, a, pid, want, now) => {
      const f = fakeApi({ reads: [now] });
      const s = store(f.api);
      await s.run(a, pid, want);
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'changed' });
    });
    it('the same identity is sent, and a cancel binds the session read there', async () => {
      const f = fakeApi({ reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ runs: [start(-60_000, 'w1'), end(5, 'cancelled', 'w1')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(f.writes()).toEqual([{ op: 'cancelRun' }]);
      expect(s.view()).toMatchObject({ phase: 'done' });
    });
  });

  it('a lost approve that reads approved stays unknown and shows it as what the TODO reads now', async () => {
    const f = fakeApi({ replies: { approve: [lost] }, reads: [free(), seen({ proposals: { p1: pr('approved') } })] });
    const s = store(f.api);
    await s.run('approve', 'p1', P1);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same', proposalNow: 'approved', ruledOut: false });
  });

  it('a lost deny that reads approved is not ruled out (approved can go back to pending)', async () => {
    const f = fakeApi({ replies: { deny: [lost] }, reads: [free(), seen({ proposals: { p1: pr('approved') } }), seen({ proposals: { p1: pr('denied') } })] });
    const s = store(f.api);
    await s.run('deny', 'p1', null);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', proposalNow: 'approved', ruledOut: false });
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'done', fromRead: true });
  });

  it('a lost approve or deny whose proposal reads unknown or missing stays unknown', async () => {
    for (const later of [seen({ proposals: { p1: pr('unknown') } }), seen()]) {
      const f = fakeApi({ replies: { approve: [lost] }, reads: [free(), later] });
      const s = store(f.api);
      await s.run('approve', 'p1', P1);
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', ruledOut: false });
    }
  });

  it('run sends once and reads done on a 2xx', async () => {
    const f = fakeApi();
    const s = store(f.api);
    await s.run('run', '', RUN);
    expect(f.writes()).toEqual([{ op: 'run' }]);
    expect(s.view()).toMatchObject({ phase: 'done', action: 'run', fromRead: false });
    expect(f.reads()).toBe(1);
  });

  it('approve and deny need their proposal; each names it', async () => {
    const f = fakeApi();
    const s = store(f.api);
    await s.run('approve', '', null);
    expect(f.writes()).toEqual([]);
    await s.run('approve', 'p1', P1);
    s.clear();
    await s.run('deny', 'p2', P2);
    expect(f.writes()).toEqual([{ op: 'approve', pid: 'p1' }, { op: 'deny', pid: 'p2' }]);
  });

  it('a lost run is never sent again, and never settled: a run_start since the send is only shown', async () => {
    const f = fakeApi({ replies: { run: [lost] }, reads: [free(), seen(), null, seen({ lease: held('w1') }), seen({ runs: [start(500, 'w1')] })] });
    const s = store(f.api);
    await s.run('run', '', RUN);
    expect(s.view().phase).toBe('unsure');
    expect(s.holds()).toBe(true);
    await s.run('run', '', RUN);
    await s.run('cancelRun', '', W1);
    expect(f.writes()).toEqual([{ op: 'run' }]);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same', runSeen: null });
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'failed' });
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same', runSeen: null });
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same', runSeen: { ts: iso(500) } });
    expect(f.writes()).toEqual([{ op: 'run' }]);
  });

  it('a lost approve whose proposal reads denied is ruled out, not done', async () => {
    const f = fakeApi({ replies: { approve: [lost] }, reads: [free(), seen({ proposals: { p1: pr('denied') } })] });
    const s = store(f.api);
    await s.run('approve', 'p1', P1);
    await s.check();
    expect(s.view()).toMatchObject({ phase: 'refused', ruledOut: true, fromRead: true });
  });

  it('a 4xx is refused; forget drops an unsure action without sending', async () => {
    const f = fakeApi({ replies: { run: [refused(), lost] } });
    const s = store(f.api);
    await s.run('run', '', RUN);
    expect(s.view()).toMatchObject({ phase: 'refused', refusal: { status: 400 } });
    s.clear();
    await s.run('run', '', RUN);
    s.clear();
    expect(s.view().phase).toBe('unsure');
    s.forget();
    expect(s.view().phase).toBe('idle');
    expect(f.writes()).toHaveLength(2);
  });

  it('a read that answers after Stop tracking settles nothing', async () => {
    let answer!: (r: Seen | null) => void;
    const f = fakeApi({ replies: { approve: [lost] } });
    const s = store(f.api);
    await s.run('approve', 'p1', P1);
    f.api.read = () => new Promise((res) => (answer = res));
    const late = s.check();
    s.forget();
    answer(seen({ proposals: { p1: pr('denied') } }));
    await late;
    expect(s.view()).toMatchObject({ phase: 'idle', action: null, ruledOut: false, observed: null });
  });

  describe("cancel run: bound to the run read at the send; its outcome is that run's run_end", () => {
    it('reads the TODO first; no run there: nothing is sent', async () => {
      const f = fakeApi({ reads: [seen()] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'noRun' });
    });

    it('the first read fails: nothing is sent', async () => {
      const f = fakeApi({ reads: [null] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(f.writes()).toEqual([]);
      expect(s.view()).toMatchObject({ phase: 'refused', notSent: 'readFailed' });
    });

    it("answered, and the read shows its run ended cancelled under its session: Run cancelled", async () => {
      const f = fakeApi({ reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ runs: [start(-60_000, 'w1'), end(200, 'cancelled', 'w1')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(f.writes()).toEqual([{ op: 'cancelRun' }]);
      expect(s.view()).toMatchObject({ phase: 'done', ended: { outcome: 'cancelled' }, fromRead: false, reading: false });
    });

    it("answered, but no end of its run read yet: unknown, never Run cancelled", async () => {
      const f = fakeApi({ reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ runs: [start(-60_000, 'w1'), end(900, 'cancelled', 'w1')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(s.view()).toMatchObject({ phase: 'unsure', answered: true, ended: null, observed: 'same' });
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'done', ended: { outcome: 'cancelled' } });
      expect(f.writes()).toEqual([{ op: 'cancelRun' }]);
    });

    it("answered, another run's cancelled end since the send is not its outcome", async () => {
      const f = fakeApi({ reads: [seen({ lease: held('w1'), runs: [start(-90_000, 'w0'), start(-60_000, 'w1')] }), seen({ runs: [start(-90_000, 'w0'), end(100, 'cancelled', 'w0'), start(-60_000, 'w1')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(s.view()).toMatchObject({ phase: 'unsure', answered: true, ended: null });
    });

    it('answered, its run ended another way: that end is shown and the cancel stays unknown', async () => {
      const f = fakeApi({ reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ runs: [start(-60_000, 'w1'), end(100, 'done')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(s.view()).toMatchObject({ phase: 'unsure', ended: { outcome: 'done' } });
    });

    it("refused: shows how ITS run ended, never an earlier run's end", async () => {
      const f = fakeApi({ replies: { cancelRun: [refused()] }, reads: [seen({ lease: held('w1'), runs: [start(-9e6, 'w0'), end(-8e6, 'failed'), start(-60_000, 'w1')] }), seen({ runs: [start(-9e6, 'w0'), end(-8e6, 'failed'), start(-60_000, 'w1'), end(-10, 'done')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(s.view()).toMatchObject({ phase: 'refused', ended: { outcome: 'done' } });
    });

    it('refused while its run still runs (another daemon): no end is shown', async () => {
      const f = fakeApi({ replies: { cancelRun: [refused()] }, reads: [seen({ lease: held('w1'), runs: [start(-9e6, 'w0'), end(-8e6, 'done'), start(-60_000, 'w1')] }), seen({ lease: held('w1'), runs: [start(-9e6, 'w0'), end(-8e6, 'done'), start(-60_000, 'w1')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(s.view()).toMatchObject({ phase: 'refused', ended: null });
    });

    it('lost: unknown, no read until Check; Check settles on its run ending cancelled under its own session', async () => {
      const f = fakeApi({ replies: { cancelRun: [lost] }, reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ runs: [start(-60_000, 'w1'), end(300, 'cancelled', 'w1')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(f.reads()).toBe(1);
      expect(s.view()).toMatchObject({ phase: 'unsure', answered: false });
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', observed: 'same' });
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'done', fromRead: true, ended: { outcome: 'cancelled', named: true } });
      expect(f.writes()).toEqual([{ op: 'cancelRun' }]);
    });

    it('lost, then start A, an unlabelled cancelled end, start B (a takeover): never Run cancelled', async () => {
      const after = seen({ runs: [start(-60_000, 'w1'), end(300, 'cancelled'), start(400, 'w2')], lease: held('w2') });
      const f = fakeApi({ replies: { cancelRun: [lost] }, reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), after, after] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      await s.check();
      await s.check();
      expect(s.view()).toMatchObject({ phase: 'unsure', answered: false, ended: { outcome: 'cancelled', named: false } });
      expect(f.writes()).toEqual([{ op: 'cancelRun' }]);
    });

    it('answered, its run ends with an unlabelled cancelled end: still unsure, never Run cancelled', async () => {
      const f = fakeApi({ reads: [seen({ lease: held('w1'), runs: [start(-60_000, 'w1')] }), seen({ runs: [start(-60_000, 'w1'), end(200, 'cancelled')] })] });
      const s = store(f.api);
      await s.run('cancelRun', '', W1);
      expect(s.view()).toMatchObject({ phase: 'unsure', answered: true, ended: { outcome: 'cancelled', named: false } });
    });
  });
});
