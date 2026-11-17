// Vitest: an idea draft's Make it live is one instantiate whose Idempotency-Key is
// stored in the draft record before it is sent. No answer frees the reservation: an answer lost, or
// core holding an earlier send of the change, leaves it "may have gone through" (C9), never failed, and nothing is sent for it
// again: no replay, no settle; a refusal is shown as such and kept the same way; a not_sent with nothing held may be tried
// again once, under the same key, by the stored record's compare-and-set. Only a fresh read showing the script at its path marks it deployed; the person's warned Discard ends it.
import { dropDraftRecord, readDraftRecords, type DraftRecord } from '@core';
import { boot, R1, TARGET } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Binding, BoundSends } from '../data';
import { confirmDeployed, deployInstantiate } from './deploy';
import { discardDraft, openRecord, readDraftRecord } from './records';

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const ID = 'ideaideaid';
type I = Awaited<ReturnType<BoundSends['instantiate']>>;
// `exists`: what a fresh read of a path answers.
const sends = (answer: (n: number) => I, o: { exists?: boolean | null } = {}) => {
  const sent: Array<Record<string, unknown>> = [];
  const s = {
    sent,
    write: async () => ({ outcome: 'not_sent' }) as never,
    clock: async () => 1_700_000_000_000,
    exists: async () => (o.exists === undefined ? null : o.exists),
    instantiate: async (v: Record<string, unknown>) => {
      // the key is in the record before the request leaves
      const r = readDraftRecord(ID) as DraftRecord;
      expect(r.state).toBe('deploying');
      expect(r.deploy?.opId).toBe(v.idem);
      sent.push(JSON.parse(JSON.stringify(v)) as Record<string, unknown>);
      return answer(sent.length);
    },
  };
  return s as unknown as Pick<BoundSends, 'write' | 'clock' | 'exists' | 'instantiate'> & { sent: typeof sent };
};
const go = (s: ReturnType<typeof sends>, vars: Record<string, string> = { WHO: 'x' }) =>
  deployInstantiate({ sends: s }, { draftId: ID, project: TARGET.project.id, compId: TARGET.container.id, exec: 1, name: 'cron-hello', path: 'default/1/hello.ts', vars });
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
const reset = async (): Promise<void> => {
  const recs = readDraftRecords();
  if (Array.isArray(recs)) for (const r of recs) await dropDraftRecord(r);
};

beforeEach(async () => { boot({ realm: R1 }); await openRecord(ID, 'idea', B); });
afterEach(reset);

describe('idea draft: one instantiate with its stored key', () => {
  it('done: one request, the draft consumed', async () => {
    const s = sends(() => ({ outcome: 'done', data: { path: 'default/1/hello.ts' } }) as I);
    expect(await go(s)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]).toMatchObject({ name: 'cron-hello', path: 'default/1/hello.ts', vars: { WHO: 'x' } });
    expect(rec().state).toBe('consumed');
  });

  it('answer lost: may have gone through, reservation kept; a second Make it live sends nothing; only a read showing the script releases it', async () => {
    const s = sends(() => ({ outcome: 'pending', code: 'UNKNOWN' }) as I);
    expect(await go(s)).toEqual({ outcome: 'pending', code: 'UNKNOWN' });
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { kind: 'instantiate', path: 'default/1/hello.ts', opId: s.sent[0]?.idem } });
    expect(await go(s)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    for (const seen of [false, null]) {
      const read = sends(() => ({ outcome: 'done' }) as I, { exists: seen });
      expect((await confirmDeployed({ sends: read }, ID)).outcome).toBe('pending');
      expect(read.sent).toHaveLength(0);
    }
    expect(rec().state).toBe('deploying');
    const shown = sends(() => ({ outcome: 'done' }) as I, { exists: true });
    expect(await confirmDeployed({ sends: shown }, ID)).toEqual({ outcome: 'done', live: 'consumed' });
    expect(shown.sent).toHaveLength(0);
    expect(s.sent).toHaveLength(1);
  });

  it('the send refused by core because an earlier send of the change is held proves nothing: may have gone through, not failed', async () => {
    for (const code of ['READ_BACK_FIRST', 'BUSY', 'HELD_BY_OTHER']) {
      const s = sends(() => ({ outcome: 'not_sent', code }) as I);
      expect(await go(s)).toEqual({ outcome: 'pending', code });
      expect(rec().state).toBe('deploying');
      await reset();
      await openRecord(ID, 'idea', B);
    }
    // nothing left and nothing held (switched away before the send): still kept, its key offered for Try again
    const away = sends(() => ({ outcome: 'not_sent', code: 'NOT_SHOWN' }) as I);
    const got = await go(away);
    expect(got).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(rec().deploy?.phase).toBe('didnt');
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { kind: 'instantiate', path: expect.any(String) } });
  });

  it('a refusal answered for the key is shown, and keeps the reservation (held): no Try again, a fresh read or Discard', async () => {
    const s = sends(() => ({ outcome: 'failed', code: 'INVALID' }) as I);
    expect(await go(s)).toEqual({ outcome: 'failed', code: 'INVALID' });
    expect(rec()).toMatchObject({ state: 'deploying', deploy: { phase: 'held' } });
    expect(await go(s)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
    expect(s.sent).toHaveLength(1);
  });

  describe('Try again after a held or unknown outcome, and two at once', () => {
    for (const [name, answer] of [['unknown', { outcome: 'pending', code: 'UNKNOWN' }], ['held', { outcome: 'not_sent', code: 'READ_BACK_FIRST' }]] as const) {
      it(`not sent, Try again answered ${name}: every later Try again is refused before the sender, same key throughout`, async () => {
        const s = sends((n) => (n === 1 ? { outcome: 'not_sent', code: 'NOT_SHOWN' } : n === 2 ? answer : { outcome: 'done' }) as I);
        expect(await go(s)).toEqual({ outcome: 'not_sent', code: 'NOT_SHOWN' });
        expect(await go(s)).toEqual({ outcome: 'pending', code: answer.code });
        expect(await go(s)).toEqual({ outcome: 'pending', code: 'DEPLOY_UNKNOWN' });
        expect(s.sent).toHaveLength(2);
        expect(s.sent[1]!.idem).toBe(s.sent[0]!.idem);
        expect(rec().deploy).toMatchObject({ opId: s.sent[0]!.idem, phase: 'held' });
      });
    }
    it('two Try agains at once: one request, the other refused', async () => {
      const first = sends(() => ({ outcome: 'not_sent', code: 'NOT_SHOWN' }) as I);
      await go(first);
      let release: (v: I) => void = () => undefined;
      const a = sends(() => new Promise<I>((res) => { release = res; }) as never);
      const b = sends(() => ({ outcome: 'done' }) as I);
      const pa = go(a);
      const rb = await go(b);
      expect(rb.outcome === 'not_sent' && (rb.code === 'DEPLOYING' || rb.code === 'RECORD_MOVED')).toBe(true);
      release({ outcome: 'pending', code: 'UNKNOWN' } as I);
      expect(await pa).toEqual({ outcome: 'pending', code: 'UNKNOWN' });
      expect(a.sent.length + b.sent.length).toBe(1);
      expect(rec().deploy?.phase).toBe('held');
    });
  });

  it('the person\'s Discard ends a deploy that may have gone through only when warned', async () => {
    await go(sends(() => ({ outcome: 'pending', code: 'UNKNOWN' }) as I));
    expect(await discardDraft(rec())).toEqual({ ok: false, why: 'state' });
    expect(await discardDraft(rec(), { mayBeDeployed: true })).toEqual({ ok: true, clean: true, removed: [] });
    expect(rec()).toMatchObject({ state: 'discarded', deploy: null });
  });

  it('the request sent is the one reserved: a change of the caller\'s variables while it is out does not reach it', async () => {
    const vars = { WHO: 'x' };
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const s = sends(() => ({ outcome: 'done', data: { path: 'p' } }) as I);
    const inner = s.instantiate;
    s.instantiate = async (v) => { await gate; return inner(v); };
    const p = go(s, vars);
    vars.WHO = 'changed';
    release();
    await p;
    expect(s.sent[0]?.vars).toEqual({ WHO: 'x' });
  });

  it('another project\'s container of the same id, or a path outside the folder, sends nothing', async () => {
    const s = sends(() => ({ outcome: 'done', data: { path: 'p' } }) as I);
    expect(await deployInstantiate({ sends: s }, { draftId: ID, project: 'p2', compId: TARGET.container.id, exec: 1, name: 'n', path: 'default/1/a.ts', vars: {} })).toEqual({ outcome: 'not_sent', code: 'STALE' });
    expect(await deployInstantiate({ sends: s }, { draftId: ID, project: TARGET.project.id, compId: TARGET.container.id, exec: 1, name: 'n', path: 'default/3/a.ts', vars: {} })).toEqual({ outcome: 'not_sent', code: 'BAD_PATH' });
    expect(s.sent).toHaveLength(0);
  });
});
