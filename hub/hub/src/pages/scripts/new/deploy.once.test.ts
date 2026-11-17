// Vitest: one draft goes live once. Two tabs pressing Make it live at
// once, with different addresses: one write is sent. After done, a second deploy is not sent. Unknown keeps the reservation and
// the record (and the attempts), and nothing is sent for it again (no hold lookup, settle or replay): only a
// fresh read showing the script at its path marks it deployed, or the person's warned Discard ends it. The finalizer marks the
// draft live before it cleans up, and a cleanup it cannot prove leaves "live, cleanup pending", which sends nothing again.
import { dropDraftRecord, dropScriptAsks, putScriptAsk, readDraftRecords, readScriptAsks, type DraftRecord, type ScriptAsk } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Binding, BoundSends } from '../data';
import type { Verdict } from '../logic';
import { askIdOf, attemptPath } from '../writer';
import { confirmDeployed, deployWrite } from './deploy';
import { canTryAgain, DEPLOY_BEAT_MS, DEPLOY_BEAT_STALE_MS, discardDraft, finishDeploy, nextAttempt, openRecord, readDraftRecord } from './records';
import { snapshotOf, verdictFor, type Snapshot } from './snapshot';

const flags = vi.hoisted(() => ({ failClose: false }));
vi.mock('../writer', async (orig) => {
  const real = await orig<{ closeAsk: (p: unknown) => Promise<'ok' | 'unknown'> }>();
  return { ...real, closeAsk: (p: unknown) => (flags.failClose ? Promise.resolve('unknown' as const) : real.closeAsk(p)) };
});
const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const ID = 'abcdefghij';
const READY: Verdict = { verdict: 'ready', errors: [], missing: [] };
type W = Awaited<ReturnType<BoundSends['write']>>;
type Sends = Pick<BoundSends, 'write' | 'clock' | 'exists'> & Partial<Pick<BoundSends, 'heldOf' | 'heldAt' | 'release' | 'settle'>>;
// `exists`: what a fresh read of a path answers (each read recorded).
// `bound`: a tab's own bound sends (the draft's page): core's hold lookups and hoody-exec's journal, which settles the op committed.
const sends = (write: (v: unknown) => Promise<W>, o: { clock?: number | null; exists?: boolean | null; bound?: boolean } = {}): Sends & { writes: unknown[]; reads: string[]; settled: Array<[string, number]> } => {
  const writes: unknown[] = [];
  const reads: string[] = [];
  // Each op this tab asked hoody-exec's journal about, with its sentAfter.
  const settled: Array<[string, number]> = [];
  const bound: Partial<Pick<BoundSends, 'heldOf' | 'heldAt' | 'release' | 'settle'>> = {
    heldOf: async () => undefined,
    heldAt: async () => [],
    release: async () => true,
    settle: async (opId, sentAfter) => { settled.push([opId, sentAfter]); return { state: 'done', revision: null }; },
  };
  return {
    writes,
    reads,
    settled,
    write: (v) => { writes.push(v); return write(v); },
    exists: async (path) => { reads.push(path); return o.exists === undefined ? null : o.exists; },
    clock: async () => (o.clock === undefined ? 1_700_000_000_000 : o.clock),
    ...(o.bound ? bound : {}),
  };
};
// The page's store through core only: every stored ask and draft record removed.
const clearStore = async (): Promise<void> => {
  const asks = readScriptAsks();
  if (Array.isArray(asks)) await dropScriptAsks(asks);
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
};
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
let snap: Snapshot;
const storeAsk = (n: number) => {
  const p = { compId: 'c1', path: attemptPath('p1', ID, n), realm: R1, owner: 'fp1' };
  const a: ScriptAsk = { askId: askIdOf(p), ...p, sessionId: `s${n}`, turnId: `t${n}`, phase: 'read', sentAt: 1, createKey: `ck${n}`, turnKey: `tk${n}` };
  return putScriptAsk(a, null);
};

beforeEach(async () => {
  boot({ realm: R1 });
  await openRecord(ID, 'ai', B);
  await nextAttempt(rec(), false);
  await storeAsk(1);
  const s = await snapshotOf('export default 1;\n', '0 8 * * 1', { project: 'p1', compId: 'c1', exec: 1 });
  if (!s.ok) throw new Error('snapshot');
  snap = s.snapshot;
});
afterEach(async () => { vi.useRealTimers(); flags.failClose = false; await clearStore(); });

describe('Make it live once', () => {
  it('two tabs at once, different addresses: one write is sent; the other is told it is being made live elsewhere', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const tabA = sends(async () => { await gate; return { outcome: 'done', data: { revision: 'r1' } as never }; });
    const tabB = sends(async () => { await gate; return { outcome: 'done', data: { revision: 'r2' } as never }; });
    const v = verdictFor(snap, READY);
    const pA = deployWrite({ sends: tabA }, { draftId: ID, snapshot: snap, verdict: v, path: 'default/1/monday-a.ts' });
    const pB = deployWrite({ sends: tabB }, { draftId: ID, snapshot: snap, verdict: v, path: 'default/1/monday-b.ts' });
    await new Promise((r) => setTimeout(r, 20));
    release();
    const got = await Promise.all([pA, pB]);
    expect(tabA.writes.length + tabB.writes.length).toBe(1);
    expect(got.map((g) => g.outcome).sort()).toEqual(['done', 'not_sent']);
    expect(got.find((g) => g.outcome === 'not_sent')).toEqual({ outcome: 'not_sent', code: 'DEPLOYING' });
    // the bytes sent are exactly the checked bytes
    const sent = (tabA.writes[0] ?? tabB.writes[0]) as { content: string; opId: string };
    expect(sent.content).toBe(snap.bytes);
    expect(rec().state).toBe('consumed');
    expect(readScriptAsks()).toEqual([]);
  });

  it('after done, a second deploy (this tab or another, any address) is not sent', async () => {
    const tab = sends(async () => ({ outcome: 'done' }));
    expect((await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).outcome).toBe('done');
    const again = sends(async () => ({ outcome: 'done' }));
    expect(await deployWrite({ sends: again }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/b.ts' })).toEqual({ outcome: 'not_sent', code: 'ALREADY_LIVE' });
    expect(again.writes).toHaveLength(0);
  });

  it('the deploy\'s metadata is stored before the write is sent', async () => {
    let seen: DraftRecord | null = null;
    const tab = sends(async () => { seen = rec(); return { outcome: 'done' }; }, { clock: 1234 });
    await deployWrite({ sends: tab, rand: (n) => new Uint8Array(n).fill(7) }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
    expect(seen).toMatchObject({ state: 'deploying', deploy: { kind: 'write', path: 'default/1/a.ts', opId: '07'.repeat(16), sentAfter: 1234, attempt: 1 } });
  });

  it('unknown keeps the reservation, the record and the attempt; nothing is sent for it again; only a read showing the script releases it', async () => {
    const tab = sends(async () => ({ outcome: 'pending', code: 'OP_OUTCOME_UNKNOWN' }));
    expect(await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'pending', code: 'OP_OUTCOME_UNKNOWN' });
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { kind: 'write', path: 'default/1/a.ts', opId: expect.any(String), sentAfter: 1_700_000_000_000 } });
    expect(readScriptAsks()).toHaveLength(1);
    const again = sends(async () => ({ outcome: 'done' }));
    expect((await deployWrite({ sends: again }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/b.ts' })).outcome).toBe('pending');
    expect(again.writes).toHaveLength(0);
    // a read that does not show it, from a caller with no hold lookup (ABSENT_SEEN), or one that cannot tell, frees nothing:
    // still reserved, still nothing sent
    const absent = sends(async () => ({ outcome: 'done' }), { exists: false });
    expect(await confirmDeployed({ sends: absent }, ID)).toEqual({ outcome: 'pending', code: 'ABSENT_SEEN' });
    const unsure = sends(async () => ({ outcome: 'done' }), { exists: null });
    expect(await confirmDeployed({ sends: unsure }, ID)).toEqual({ outcome: 'pending', code: 'NOT_KNOWN' });
    expect(rec().state).toBe('deploying');
    // a read that shows it from a caller with no hold lookup (the Scripts list) can't settle the op, so it moves nothing
    // (FOUND_SEEN: a script found may be another writer's)
    const list = sends(async () => ({ outcome: 'done' }), { exists: true });
    expect(await confirmDeployed({ sends: list }, ID)).toEqual({ outcome: 'pending', code: 'FOUND_SEEN' });
    expect(rec().state).toBe('deploying');
    // another tab's fresh read shows it at the deploy's path and the journal settles the op committed: the draft is marked
    // deployed (attempts closed)
    const rec0 = rec();
    const other = sends(async () => ({ outcome: 'done' }), { exists: true, bound: true });
    expect(await confirmDeployed({ sends: other }, ID)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(other.reads).toEqual(['default/1/a.ts']);
    // Its done is the journal's committed answer, never the inconclusive arm: the settle was asked, once, for
    // this deploy's own op.
    expect(other.settled).toEqual([[rec0.deploy!.opId, 1_700_000_000_000]]);
    expect(list.settled).toEqual([]);
    expect(absent.writes.concat(unsure.writes, list.writes, other.writes)).toHaveLength(0);
    expect(readScriptAsks()).toEqual([]);
  });

  it('a record that moved while the read was out (the person discarded it, warned) is not marked deployed', async () => {
    await deployWrite({ sends: sends(async () => ({ outcome: 'pending', code: 'NETWORK' })) }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
    const racing = sends(async () => ({ outcome: 'done' }), { exists: true, bound: true });
    racing.exists = async () => { await discardDraft(rec(), { mayBeDeployed: true }); return true; };
    expect(await confirmDeployed({ sends: racing }, ID)).toEqual({ outcome: 'pending', code: 'RECORD_MOVED' });
    expect(rec()).toMatchObject({ state: 'discarded' });
  });

  it('a deploy nobody beats for is unknown (never freed by time); the person\'s warned Discard ends it, the plain Discard does not', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const tab = sends(async () => ({ outcome: 'pending', code: 'NETWORK' }));
    await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
    vi.setSystemTime(Date.now() + DEPLOY_BEAT_STALE_MS + 1);
    expect(await deployWrite({ sends: sends(async () => ({ outcome: 'done' })) }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/b.ts' })).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    expect(rec().state).toBe('deploying');
    expect(await discardDraft(rec())).toEqual({ ok: false, why: 'state' });
    expect(rec().state).toBe('deploying');
    expect(await discardDraft(rec(), { mayBeDeployed: true })).toEqual({ ok: true, clean: true, removed: [] });
    expect(rec()).toMatchObject({ state: 'discarded', deploy: null });
    expect(readScriptAsks()).toEqual([]);
  });

  it('a refused first write frees the draft (nothing written under a fresh op id); a refused resend keeps the reservation (held); a stale verdict or another computer sends nothing', async () => {
    const stale = sends(async () => ({ outcome: 'done' }));
    const other = await snapshotOf('export default 2;\n', '0 8 * * 1', { project: 'p1', compId: 'c1', exec: 1 });
    if (!other.ok) throw new Error('x');
    expect(await deployWrite({ sends: stale }, { draftId: ID, snapshot: other.snapshot, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'not_sent', code: 'NOT_CHECKED' });
    const elsewhere = await snapshotOf('export default 1;\n', '0 8 * * 1', { project: 'p1', compId: 'c2', exec: 1 });
    if (!elsewhere.ok) throw new Error('x');
    expect(await deployWrite({ sends: stale }, { draftId: ID, snapshot: elsewhere.snapshot, verdict: verdictFor(elsewhere.snapshot, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'not_sent', code: 'STALE' });
    expect(await deployWrite({ sends: sends(async () => ({ outcome: 'done' }), { clock: null }) }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'not_sent', code: 'NO_CLOCK' });
    expect(stale.writes).toHaveLength(0);
    expect(rec()).toMatchObject({ state: 'open', deploy: null });
    const tab = sends(async () => ({ outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' }));
    expect(await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' });
    // A first send: its op id was fresh, so nothing of it can have landed. The draft is open again, at any address.
    expect(rec()).toMatchObject({ state: 'open', deploy: null });
    expect(canTryAgain(rec())).toBe(false);
    const next = sends(async () => ({ outcome: 'failed', code: 'REVISION_MISMATCH' }));
    expect(await deployWrite({ sends: next }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/b.ts' })).toEqual({ outcome: 'failed', code: 'REVISION_MISMATCH' });
    expect(next.writes).toHaveLength(1);
    expect((next.writes[0] as { opId: string }).opId).not.toBe((tab.writes[0] as { opId: string }).opId);
    expect(rec()).toMatchObject({ state: 'open', deploy: null });
    // A resend (Try again of a send known not sent) refused: an earlier request of the reservation exists, so it stays held.
    const lost = sends(async () => ({ outcome: 'not_sent', code: 'OFFLINE' }));
    expect(await deployWrite({ sends: lost }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/c.ts' })).toEqual({ outcome: 'not_sent', code: 'OFFLINE' });
    expect(canTryAgain(rec())).toBe(true);
    const resend = sends(async () => ({ outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' }));
    expect(await deployWrite({ sends: resend }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/c.ts' })).toEqual({ outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' });
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { path: 'default/1/c.ts', phase: 'held' } });
    expect(canTryAgain(rec())).toBe(false);
    expect(await deployWrite({ sends: stale }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/c.ts' })).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    expect(stale.writes).toHaveLength(0);
  });

  it('only a definite refusal frees a first send; unknown, 5xx and held not_sent keep the reservation', async () => {
    for (const [answer, phase] of [[{ outcome: 'pending', code: 'OP_OUTCOME_UNKNOWN' }, 'held'], [{ outcome: 'pending' }, 'held'], [{ outcome: 'not_sent', code: 'BUSY' }, 'held'], [{ outcome: 'not_sent', code: 'OFFLINE' }, 'didnt']] as const) {
      await clearStore();
      await openRecord(ID, 'ai', B);
      await nextAttempt(rec(), false);
      const tab = sends(async () => answer as W);
      await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
      expect(rec(), JSON.stringify(answer)).toMatchObject({ state: 'deploying', deploy: { phase } });
    }
  });

  it('a cleanup that cannot be proven leaves live_cleanup (no second write); a later finalize finishes it', async () => {
    flags.failClose = true;
    const tab = sends(async () => ({ outcome: 'done' }));
    expect(await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'done', live: 'live_cleanup' });
    expect(rec().state).toBe('live_cleanup');
    expect(readScriptAsks()).toHaveLength(1);
    const again = sends(async () => ({ outcome: 'done' }));
    expect(await deployWrite({ sends: again }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/b.ts' })).toEqual({ outcome: 'not_sent', code: 'ALREADY_LIVE' });
    expect(again.writes).toHaveLength(0);
    // a draft made live is never discarded, warned or not
    expect(await discardDraft(rec(), { mayBeDeployed: true })).toEqual({ ok: false, why: 'state' });
    flags.failClose = false;
    expect(await confirmDeployed({ sends: again }, ID)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(again.writes.length + again.reads.length).toBe(0);
    expect(readScriptAsks()).toEqual([]);
    expect(await finishDeploy(rec())).toEqual({ state: 'consumed' });
  });

  it('a not_sent because core holds an earlier send of the change keeps the draft deploying with its metadata (C9)', async () => {
    for (const code of ['READ_BACK_FIRST', 'BUSY', 'HELD_BY_OTHER']) {
      const tab = sends(async () => ({ outcome: 'not_sent', code }));
      expect(await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'pending', code });
      expect(rec()).toMatchObject({ state: 'deploying', deploy: { kind: 'write', path: 'default/1/a.ts' } });
      const again = sends(async () => ({ outcome: 'done' }));
      expect(rec().deploy?.phase).toBe('held');
      expect(await deployWrite({ sends: again }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
      expect(again.writes).toHaveLength(0);
      expect(await discardDraft(rec(), { mayBeDeployed: true })).toMatchObject({ ok: true });
      await clearStore();
      await openRecord(ID, 'ai', B);
      await nextAttempt(rec(), false);
    }
    // no not_sent frees it, whoever made it: stored didnt, Try again takes the same reservation
    const away = sends(async () => ({ outcome: 'not_sent', code: 'NOT_SHOWN' }));
    const opOf = (w: unknown): string => (w as { opId: string }).opId;
    const got = await deployWrite({ sends: away }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
    expect(got).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { kind: 'write', path: 'default/1/a.ts', opId: opOf(away.writes[0]), phase: 'didnt' } });
    expect(canTryAgain(rec())).toBe(true);
    // Try again takes the reservation by its compare-and-set: a tab that read it before another tab's Discard sends nothing
    const stale = rec();
    expect(await discardDraft(stale, { mayBeDeployed: true })).toMatchObject({ ok: true });
    const late = sends(async () => ({ outcome: 'done' }));
    expect(await deployWrite({ sends: late, read: () => stale }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'not_sent', code: 'RECORD_MOVED' });
    expect(late.writes).toHaveLength(0);
    expect(rec().state).toBe('discarded');
    await clearStore();
    await openRecord(ID, 'ai', B);
    await nextAttempt(rec(), false);
    const away2 = sends(async () => ({ outcome: 'not_sent', code: 'NOT_SHOWN' }));
    await deployWrite({ sends: away2 }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
    // Try again is for the reservation's own kind and path only
    const elsewhere = sends(async () => ({ outcome: 'done' }));
    expect(await deployWrite({ sends: elsewhere }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/b.ts' })).toEqual({ outcome: 'not_sent', code: 'RESERVED_PATH' });
    expect(elsewhere.writes).toHaveLength(0);
    const tryAgain = sends(async () => ({ outcome: 'done' }));
    expect(await deployWrite({ sends: tryAgain }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' })).toMatchObject({ outcome: 'done' });
    expect(tryAgain.writes.map(opOf)).toEqual([opOf(away2.writes[0])]);
    expect(rec().state).toBe('consumed');
  });

  describe('Try again after a held or unknown outcome, and two at once', () => {
    const opOf = (w: unknown): string => (w as { opId: string }).opId;
    const go = (s: ReturnType<typeof sends>) => deployWrite({ sends: s }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/1/a.ts' });
    for (const [name, answer] of [['unknown', { outcome: 'pending', code: 'WRITE_UNKNOWN' }], ['held', { outcome: 'not_sent', code: 'READ_BACK_FIRST' }]] as const) {
      it(`not sent, Try again answered ${name}: every later Try again is refused before the sender`, async () => {
        const first = sends(async () => ({ outcome: 'not_sent', code: 'NOT_SHOWN' }));
        await go(first);
        const again = sends(async () => answer);
        expect(await go(again)).toEqual({ outcome: 'pending', code: answer.code });
        expect(again.writes.map(opOf)).toEqual([opOf(first.writes[0])]);
        expect(rec()).toMatchObject({ state: 'deploying', deploy: { opId: opOf(first.writes[0]), phase: 'held' } });
        const third = sends(async () => ({ outcome: 'done' }));
        expect(await go(third)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
        expect(third.writes).toHaveLength(0);
        expect(canTryAgain(rec())).toBe(false);
      });
    }
    it('an answer arriving while the sender\'s own beat is being written is still stored (the beat is awaited first)', async () => {
      // The change-store lock is FIFO across tabs; the beat's write is made slow and queued ahead of anything after it.
      const locks = (globalThis.navigator as unknown as { locks: { request: (n: string, cb: () => unknown) => Promise<unknown> } }).locks;
      const real = locks.request.bind(locks);
      let queue: Promise<unknown> = Promise.resolve();
      let slowNext = false;
      const spy = vi.spyOn(locks, 'request').mockImplementation((n: string, cb: () => unknown) => {
        const slow = slowNext;
        slowNext = false;
        const run = queue.then(() => (slow ? new Promise((r) => setTimeout(r, 20)) : undefined)).then(() => real(n, cb));
        queue = run.catch(() => undefined);
        return run;
      });
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      try {
        const tab = sends(async () => { slowNext = true; vi.advanceTimersByTime(DEPLOY_BEAT_MS); await Promise.resolve(); return { outcome: 'not_sent', code: 'NOT_SHOWN' }; });
        expect(await go(tab)).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
        expect(rec().deploy?.phase).toBe('didnt');
      } finally {
        vi.useRealTimers();
        spy.mockRestore();
      }
    });

    it('two Try agains at once: one enters the sender, the other is refused while it is out', async () => {
      await go(sends(async () => ({ outcome: 'not_sent', code: 'NOT_SHOWN' })));
      let release: (v: { outcome: 'pending'; code: string }) => void = () => undefined;
      const a = sends(() => new Promise((r) => { release = r as never; }));
      const b = sends(async () => ({ outcome: 'done' }));
      const pa = go(a);
      const pb = go(b);
      const rb = await pb;
      expect(rb.outcome === 'not_sent' && (rb.code === 'DEPLOYING' || rb.code === 'RECORD_MOVED')).toBe(true);
      expect(await go(sends(async () => ({ outcome: 'done' })))).toEqual({ outcome: 'not_sent', code: 'DEPLOYING' });
      release({ outcome: 'pending', code: 'WRITE_UNKNOWN' });
      expect(await pa).toEqual({ outcome: 'pending', code: 'WRITE_UNKNOWN' });
      expect(a.writes.length + b.writes.length).toBe(1);
      expect(rec().deploy?.phase).toBe('held');
    });
  });

  it('a check of another project\'s container of the same id, or a path outside the checked folder, sends nothing', async () => {
    const tab = sends(async () => ({ outcome: 'done' }));
    const p2 = await snapshotOf('export default 1;\n', '0 8 * * 1', { project: 'p2', compId: 'c1', exec: 1 });
    if (!p2.ok) throw new Error('x');
    expect(await deployWrite({ sends: tab }, { draftId: ID, snapshot: p2.snapshot, verdict: verdictFor(p2.snapshot, READY), path: 'default/1/a.ts' })).toEqual({ outcome: 'not_sent', code: 'STALE' });
    expect(await deployWrite({ sends: tab }, { draftId: ID, snapshot: snap, verdict: verdictFor(snap, READY), path: 'default/2/a.ts' })).toEqual({ outcome: 'not_sent', code: 'BAD_PATH' });
    expect(tab.writes).toHaveLength(0);
    expect(rec().state).toBe('open');
  });
});
