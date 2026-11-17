// Vitest: Delete note's rules (remove.ts) over a fake Api: the answer table, the read-back, and the attempt record
// (one send per note, an unknown answer never sent again, Check again only reads).
import { describe, expect, it } from 'vitest';
import type { RemoveApi, Settled } from './api';
import { createRemoveAttempts, presentOf, removeOutcome, sessionRemoveAttempts, type RemoveAttempt, type RemoveEnd, type RemoveTarget } from './remove';
import { routes } from './routes';
import type { Computer, Rejection } from './types';

const NB = 'b2c3d4e5f6a7b8c9d0e1f2a3';
const ID = '0a1b2c3d4e5f6a7b8c9d0e1f';
const computer: Computer = { id: 'c-atlas', projectId: 'p-1', name: 'atlas', state: 'running' };
const target: RemoveTarget = { key: `${computer.id}~${ID}`, computer, nb: NB, id: ID, title: 'Weekly plan' };

/** A refusal as Notes itself sends it (logic.ts notesCode: the body's code is the rejection's code). */
const notes = (status: number, code: string, kind = 'bad_request'): Settled => ({ ok: false, err: { kind, status, code, data: { code, message: 'refused' } } });
/** A refusal with no Notes body (an edge or the proxy in between). */
const bare = (status: number, kind = 'unavailable'): Settled => ({ ok: false, err: { kind, status } });
const lost: Settled = { ok: false, err: { kind: 'unreachable', code: 'NETWORK', pending: true } };
const done: Settled = { ok: true, body: { success: true } };

describe('the route', () => {
  it('is one DELETE of one node on the computer\'s Notes, with no query and no body', () => {
    expect(routes.remove.method).toBe('DELETE');
    expect(routes.remove.path).toBe('/api/v1/notes/notebooks/:nb/nodes/:id');
    expect(routes.remove.scope).toBe('kit');
    expect(routes.remove.kit).toBe('notes');
    expect(routes.remove.index).toBe(1);
    expect(routes.remove.path).toBe(routes.node.path);
  });
});

describe('removeOutcome', () => {
  it('only Notes\' own success is "removed"', () => {
    expect(removeOutcome(done)).toBe('removed');
    expect(removeOutcome({ ok: true, body: {} })).toBe('unknown');
    expect(removeOutcome({ ok: true, body: { success: false } })).toBe('unknown');
    expect(removeOutcome({ ok: true, body: null })).toBe('unknown');
  });
  it('nothing sent is notSent; a lost, dropped or still-running answer is unknown', () => {
    expect(removeOutcome({ ok: false, err: { notSent: true } })).toBe('notSent');
    expect(removeOutcome(lost)).toBe('unknown');
    expect(removeOutcome({ ok: false, err: { stale: true } })).toBe('unknown');
    expect(removeOutcome({ ok: false, err: { kind: 'unavailable', status: 500, pending: true, code: 'unknown', data: { code: 'unknown', message: 'x' } } })).toBe('unknown');
    expect(removeOutcome({ ok: false, err: {} })).toBe('unknown');
    // An Api that settles with no rejection object at all (outside the type): still unknown, never "not deleted".
    expect(removeOutcome({ ok: false, err: null as unknown as Rejection })).toBe('unknown');
    expect(presentOf({ ok: false, err: null as unknown as Rejection }, ID)).toBe('unsure');
  });
  it('a refusal counts only with a code Notes itself sends', () => {
    expect(removeOutcome(notes(403, 'forbidden', 'private'))).toBe('cantRemove');
    expect(removeOutcome(notes(403, 'notebook_readonly', 'private'))).toBe('cantRemove');
    expect(removeOutcome(notes(403, 'notebook_no_access', 'private'))).toBe('cantRemove');
    expect(removeOutcome(bare(403, 'private'))).toBe('protected');
    expect(removeOutcome(bare(403))).toBe('unknown');
    expect(removeOutcome(notes(404, 'not_found', 'not_found'))).toBe('gone');
    // The notebook cannot be found: a refusal of its own, never "gone" and never "deleted".
    expect(removeOutcome(notes(404, 'notebook_not_found', 'not_found'))).toBe('noNotebook');
    expect(removeOutcome(bare(404, 'not_found'))).toBe('unknown');
    expect(removeOutcome(notes(400, 'bad_request'))).toBe('refused');
    // A body whose code is not one of Notes' is not Notes' answer.
    expect(removeOutcome(notes(404, 'route_not_found', 'not_found'))).toBe('unknown');
  });
});

describe('presentOf', () => {
  it('there only for this very note, gone only on Notes\' own not found for the note, the notebook apart, else unsure', () => {
    expect(presentOf(notes(404, 'notebook_not_found', 'not_found'), ID)).toBe('noNotebook');
    expect(presentOf({ ok: true, body: { id: ID, type: 'page' } }, ID)).toBe('there');
    expect(presentOf({ ok: true, body: { id: 'another', type: 'page' } }, ID)).toBe('unsure');
    expect(presentOf({ ok: true, body: {} }, ID)).toBe('unsure');
    expect(presentOf(notes(404, 'not_found', 'not_found'), ID)).toBe('gone');
    expect(presentOf(bare(404, 'not_found'), ID)).toBe('unsure');
    expect(presentOf(notes(403, 'forbidden', 'private'), ID)).toBe('unsure');
    expect(presentOf(lost, ID)).toBe('unsure');
    expect(presentOf({ ok: false, err: { stale: true, status: 404, code: 'not_found', data: { code: 'not_found', message: 'x' } } }, ID)).toBe('unsure');
  });
});

/** A fake Api whose answers the test gives, one per call, when it chooses. */
function fake() {
  const sends: Array<{ args: [Computer, string, string]; answer: (r: Settled) => void }> = [];
  const reads: Array<{ args: [Computer, string, string]; answer: (r: Settled) => void }> = [];
  const api: RemoveApi = {
    remove: (c, nb, id) => new Promise<Settled>((answer) => { sends.push({ args: [c, nb, id], answer }); }),
    present: (c, nb, id) => new Promise<Settled>((answer) => { reads.push({ args: [c, nb, id], answer }); }),
  };
  const ends: Array<[RemoveAttempt, RemoveEnd]> = [];
  return { api, sends, reads, ends, onEnd: (a: RemoveAttempt, end: RemoveEnd) => { ends.push([a, end]); } };
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('the attempt record', () => {
  it('sends the captured note once, and a second press while it is out sends nothing', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    const a = attempts.send(target, f.api, f.onEnd);
    expect(a?.phase).toBe('sending');
    expect(attempts.send(target, f.api, f.onEnd)).toBeNull();
    expect(f.sends).toHaveLength(1);
    expect(f.sends[0]?.args).toEqual([computer, NB, ID]);
    f.sends[0]?.answer(done);
    await tick();
    expect(f.ends).toEqual([[a, 'removed']]);
    expect(attempts.get(target.key)).toBeUndefined();
    expect(a?.phase).toBe('ended');
  });

  it('a refusal ends it with Notes\' answer kept, and the note can be tried again', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    const a = attempts.send(target, f.api, f.onEnd);
    const refusal = notes(403, 'forbidden', 'private');
    f.sends[0]?.answer(refusal);
    await tick();
    expect(f.ends).toEqual([[a, 'cantRemove']]);
    expect(a?.err).toBe((refusal as { err: unknown }).err);
    expect(attempts.send(target, f.api, f.onEnd)).not.toBeNull();
    expect(f.sends).toHaveLength(2);
  });

  it('an unknown answer stays on record: never sent again, never ended by itself', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    let published = 0;
    attempts.subscribe(() => { published += 1; });
    const a = attempts.send(target, f.api, f.onEnd);
    f.sends[0]?.answer(lost);
    await tick();
    expect(attempts.get(target.key)).toBe(a);
    expect(a?.phase).toBe('unknown');
    expect(published).toBe(2);
    expect(f.ends).toEqual([]);
    expect(attempts.send(target, f.api, f.onEnd)).toBeNull();
    expect(f.sends).toHaveLength(1);
  });

  it('Check again only reads: unsure leaves the record, gone and there end it', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    const a = attempts.send(target, f.api, f.onEnd) as RemoveAttempt;
    f.sends[0]?.answer(lost);
    await tick();

    const first = attempts.check(a, f.onEnd);
    await tick();
    expect(f.reads[0]?.args).toEqual([computer, NB, ID]);
    f.reads[0]?.answer(lost);
    expect(await first).toBe(false);
    expect(attempts.get(target.key)).toBe(a);
    expect(f.ends).toEqual([]);

    const second = attempts.check(a, f.onEnd);
    await tick();
    f.reads[1]?.answer(notes(404, 'not_found', 'not_found'));
    expect(await second).toBe(true);
    expect(f.ends).toEqual([[a, 'gone']]);
    expect(attempts.get(target.key)).toBeUndefined();
    expect(f.sends).toHaveLength(1);

    const g = fake();
    const b = attempts.send(target, g.api, g.onEnd) as RemoveAttempt;
    g.sends[0]?.answer({ ok: true, body: {} });
    await tick();
    expect(b.phase).toBe('unknown');
    const third = attempts.check(b, g.onEnd);
    await tick();
    g.reads[0]?.answer({ ok: true, body: { id: ID, type: 'page' } });
    expect(await third).toBe(true);
    expect(g.ends).toEqual([[b, 'there']]);
    expect(g.sends).toHaveLength(1);
  });

  it('a notebook Notes cannot find ends the record as its own end, on the delete and on the read', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    const a = attempts.send(target, f.api, f.onEnd) as RemoveAttempt;
    f.sends[0]?.answer(notes(404, 'notebook_not_found', 'not_found'));
    await tick();
    expect(f.ends).toEqual([[a, 'noNotebook']]);
    const b = attempts.send(target, f.api, f.onEnd) as RemoveAttempt;
    f.sends[1]?.answer(lost);
    await tick();
    const read = attempts.check(b, f.onEnd);
    await tick();
    f.reads[0]?.answer(notes(404, 'notebook_not_found', 'not_found'));
    expect(await read).toBe(true);
    expect(f.ends[1]).toEqual([b, 'noNotebook']);
    expect(f.sends).toHaveLength(2);
  });

  it('two reads of one attempt end it once', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    const a = attempts.send(target, f.api, f.onEnd) as RemoveAttempt;
    f.sends[0]?.answer(lost);
    await tick();
    const one = attempts.check(a, f.onEnd);
    const two = attempts.check(a, f.onEnd);
    await tick();
    expect(f.reads).toHaveLength(2);
    f.reads[0]?.answer(notes(404, 'not_found', 'not_found'));
    f.reads[1]?.answer({ ok: true, body: { id: ID, type: 'page' } });
    expect(await one).toBe(true);
    expect(await two).toBe(true);
    expect(f.ends).toEqual([[a, 'gone']]);
  });

  it('an Api that throws after the press is unknown, never "not deleted"', async () => {
    const attempts = createRemoveAttempts();
    const ends: RemoveEnd[] = [];
    const api: RemoveApi = { remove: () => Promise.reject(new Error('x')), present: async () => lost };
    const a = attempts.send(target, api, (_a, end) => { ends.push(end); });
    await tick();
    expect(a?.phase).toBe('unknown');
    expect(attempts.get(target.key)).toBe(a);
    expect(ends).toEqual([]);
  });

  it('another note of the same computer has its own record', async () => {
    const f = fake();
    const attempts = createRemoveAttempts();
    attempts.send(target, f.api, f.onEnd);
    const other: RemoveTarget = { ...target, key: `${computer.id}~1a1b2c3d4e5f6a7b8c9d0e1f`, id: '1a1b2c3d4e5f6a7b8c9d0e1f' };
    expect(attempts.send(other, f.api, f.onEnd)).not.toBeNull();
    expect(f.sends.map((s) => s.args[2])).toEqual([ID, other.id]);
  });
});

describe('the records end with the session', () => {
  /** onAuthPurge's stand-in: keeps the listeners, and `purge` runs them as core's auth purge does. */
  function session() {
    const fns: Array<() => void> = [];
    return { fns, onPurge: (fn: () => void) => { fns.push(fn); }, purge: () => { for (const fn of fns) fn(); } };
  }

  it('hooks the purge once, at the first delete sent', () => {
    const f = fake();
    const s = session();
    const attempts = sessionRemoveAttempts(s.onPurge);
    expect(s.fns).toHaveLength(0);
    attempts.send(target, f.api, f.onEnd);
    attempts.send({ ...target, key: 'c-atlas~other', id: 'other' }, f.api, f.onEnd);
    expect(s.fns).toHaveLength(1);
  });

  it('a purge drops an unknown delete: the next person sees no record, and nothing ends or is read for it', async () => {
    const f = fake();
    const s = session();
    const attempts = sessionRemoveAttempts(s.onPurge);
    let published = 0;
    attempts.subscribe(() => { published++; });
    const a = attempts.send(target, f.api, f.onEnd);
    f.sends[0]?.answer(lost);
    await tick();
    expect(attempts.get(target.key)?.phase).toBe('unknown');
    const before = published;
    s.purge();
    expect(attempts.get(target.key)).toBeUndefined();
    expect(published).toBe(before + 1);
    expect(f.ends).toEqual([]);
    // Check again on the dropped record reads nothing and ends nothing.
    expect(a && await attempts.check(a, f.onEnd)).toBe(true);
    expect(f.reads).toHaveLength(0);
    expect(f.ends).toEqual([]);
  });

  it('an answer or a read that lands after the purge says nothing', async () => {
    const f = fake();
    const s = session();
    const attempts = sessionRemoveAttempts(s.onPurge);
    // The delete's own answer lands after the purge.
    attempts.send(target, f.api, f.onEnd);
    s.purge();
    f.sends[0]?.answer(done);
    await tick();
    expect(f.ends).toEqual([]);
    expect(attempts.get(target.key)).toBeUndefined();
    // A read that was out at the purge.
    const b = attempts.send(target, f.api, f.onEnd);
    f.sends[1]?.answer(lost);
    await tick();
    const read = b ? attempts.check(b, f.onEnd) : Promise.resolve(false);
    expect(f.reads).toHaveLength(1);
    s.purge();
    f.reads[0]?.answer(notes(404, 'not_found', 'not_found'));
    expect(await read).toBe(true);
    expect(f.ends).toEqual([]);
  });

  it('after a purge the same note can be sent again (a new session, a new record)', async () => {
    const f = fake();
    const s = session();
    const attempts = sessionRemoveAttempts(s.onPurge);
    attempts.send(target, f.api, f.onEnd);
    s.purge();
    expect(attempts.send(target, f.api, f.onEnd)?.phase).toBe('sending');
    expect(f.sends).toHaveLength(2);
  });

  it('a purge hook that throws still lets the delete go', () => {
    const f = fake();
    const attempts = sessionRemoveAttempts(() => { throw new Error('no purge here'); });
    expect(attempts.send(target, f.api, f.onEnd)?.phase).toBe('sending');
    expect(f.sends).toHaveLength(1);
  });
});
