// The stop-everything sweep: the headline is per-item outcomes, `complete` never means "all stopped",
// `after` is only a cursor this sweep got back (once), failures never loop, nothing new offers nothing more.
import { describe, expect, it } from 'vitest';
import type { agent } from '@core';
import { createStopRun, MAX_PAGES } from './stop';

type Answer = Awaited<ReturnType<agent.StopApi['stop']>>;
// The route always sends the three arrays; a fixture names only what the case is about.
const ok = (b: unknown): Answer => ({ ok: true, body: { started_during_call: [], behind_cursor: [], not_covered: [], ...(b as object) } });
const err = (kind: 'pending' | 'failed' | 'not_sent' | 'stale', status = 0, code = ''): Answer => ({ ok: false, err: { kind, code, status, retryAfter: null, details: {} } });
const item = (id: string, outcome: string, detail?: string) => ({ kind: 'session', id, outcome, ...(detail ? { detail } : {}) });
function fake(...answers: Answer[]) {
  const sent: Array<{ after?: string; realm?: string }> = [];
  let i = 0;
  const api: agent.StopApi = { stop: (after, realm) => { sent.push({ ...(after === undefined ? {} : { after }), ...(realm ? { realm } : {}) }); return Promise.resolve(answers[Math.min(i++, answers.length - 1)]!); } };
  return { api, sent };
}

describe('one call', () => {
  it('counts per-item outcomes; complete:true with a failed item still shows the failure and never "all stopped"', async () => {
    const f = fake(ok({ items: [item('a', 'stopped'), item('b', 'already_done'), item('c', 'failed', 'did not return')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    const v = r.view();
    expect(v.phase).toBe('ready');
    expect(v.counts).toEqual({ stopped: 1, alreadyDone: 1, failed: 1 });
    expect(v.items.find((i) => i.id === 'c')).toMatchObject({ outcome: 'failed', detail: 'did not return' });
    expect(v.complete).toBe(true);
    expect(v.canContinue).toBe(false);
    expect(v.again).toBe(true);
    expect(v.nothingNew).toBe(false);
  });
  it('a sweep whose only item failed is not "nothing new": it offers Stop all again', async () => {
    const f = fake(ok({ items: [item('a', 'failed')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ nothingNew: false, again: true, counts: { stopped: 0, alreadyDone: 0, failed: 1 } });
  });
  it('an outcome the page does not know counts as may-still-be-running, never stopped', async () => {
    const f = fake(ok({ items: [item('a', 'cancelled')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view().counts).toEqual({ stopped: 0, alreadyDone: 0, failed: 1 });
  });
  it('the realm is passed when given; the first call has no cursor', async () => {
    const f = fake(ok({ items: [], complete: true }));
    const r = createStopRun({ api: f.api, realm: 'r1' });
    await r.start();
    expect(f.sent).toEqual([{ realm: 'r1' }]);
  });
  it('not_covered is kept with its reason and count', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: true, not_covered: [{ kind: 'sync_request', reason: 'stop it from its computer' }, { kind: 'x', reason: 'old', count: 3 }] }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view().notCovered).toEqual([{ kind: 'sync_request', reason: 'stop it from its computer' }, { kind: 'x', reason: 'old', count: 3 }]);
  });
  it('a sweep that stopped nothing new and failed nothing says so and offers nothing more', async () => {
    const f = fake(ok({ items: [item('a', 'already_done')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ nothingNew: true, again: false, canContinue: false });
    await r.next();
    expect(f.sent.length).toBe(1);
  });
  it('items behind the cursor, or started during the call, offer Stop all again; the again call has no after', async () => {
    const f = fake(
      ok({ items: [item('a', 'stopped')], behind_cursor: [{ kind: 'task', id: 't1' }], started_during_call: [{ kind: 'session', id: 'n1' }], complete: true }),
      ok({ items: [item('t1', 'stopped'), item('n1', 'stopped')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ again: true, behind: [{ kind: 'task', id: 't1' }], started: [{ kind: 'session', id: 'n1' }] });
    await r.start();
    expect(f.sent).toEqual([{}, {}]);
    expect(r.view()).toMatchObject({ pages: 1, again: false, behind: [], started: [], counts: { stopped: 2, alreadyDone: 0, failed: 0 } });
  });
});

describe('paging', () => {
  it('complete:false with a cursor offers Continue; the next call sends exactly that cursor; items accumulate', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), ok({ items: [item('b', 'stopped')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view().canContinue).toBe(true);
    await r.next();
    expect(f.sent).toEqual([{}, { after: 'c1' }]);
    expect(r.view()).toMatchObject({ pages: 2, canContinue: false, counts: { stopped: 2, alreadyDone: 0, failed: 0 } });
    expect(r.view().items.map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('complete:false without a cursor offers no Continue', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view().canContinue).toBe(false);
    await r.next();
    expect(f.sent.length).toBe(1);
  });
  it('a cursor that comes back again is not followed twice', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), ok({ items: [item('b', 'stopped')], complete: false, next_cursor: 'c1' }));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.next();
    expect(r.view().canContinue).toBe(false);
    await r.next();
    expect(f.sent.length).toBe(2);
  });
  it('a page with a failure offers no Continue: repeated failures never loop', async () => {
    const f = fake(ok({ items: [item('a', 'failed')], complete: false, next_cursor: 'c1' }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ canContinue: false, again: true });
    await r.next();
    expect(f.sent.length).toBe(1);
  });
  it(`stops offering after ${MAX_PAGES} pages`, async () => {
    let n = 0;
    const api: agent.StopApi = { stop: () => Promise.resolve(ok({ items: [item('i' + n, 'stopped')], complete: false, next_cursor: 'c' + ++n })) };
    const r = createStopRun({ api });
    await r.start();
    while (r.view().canContinue) await r.next();
    expect(r.view().pages).toBe(MAX_PAGES);
    expect(n).toBe(MAX_PAGES);
  });
  it('a fresh sweep forgets the old cursors and rows', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), ok({ items: [item('z', 'stopped')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.start();
    expect(f.sent).toEqual([{}, {}]);
    expect(r.view().items.map((i) => i.id)).toEqual(['z']);
    expect(r.view().pages).toBe(1);
  });
});

describe('unknown and refused', () => {
  it('a lost answer is unsure: nothing is resent, Stop all again is offered, no Continue', async () => {
    const f = fake(err('pending'));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ phase: 'unsure', again: true, canContinue: false, counts: { stopped: 0, alreadyDone: 0, failed: 0 } });
    expect(f.sent.length).toBe(1);
  });
  it('a lost follow-up keeps the earlier pages and cannot continue', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), err('pending'));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.next();
    expect(r.view()).toMatchObject({ phase: 'unsure', canContinue: false, counts: { stopped: 1, alreadyDone: 0, failed: 0 }, pages: 1 });
    await r.next();
    expect(f.sent.length).toBe(2);
  });
  it('an unreadable answer is unsure, not "nothing to stop"', async () => {
    const f = fake(ok({ nope: 1 }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ phase: 'unsure', nothingNew: false, again: true });
  });
  it('a refusal shows its code; the sweep can be started again', async () => {
    const f = fake(err('failed', 400, 'realm_scope_unsupported'));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view()).toMatchObject({ phase: 'refused', error: { code: 'realm_scope_unsupported', status: 400 }, again: true });
  });
});

describe('one call at a time', () => {
  it('a second start while one is out sends nothing; reset drops a late answer', async () => {
    let done!: (a: Answer) => void;
    const sent: number[] = [];
    const api: agent.StopApi = { stop: () => { sent.push(1); return new Promise<Answer>((res) => { done = res; }); } };
    const r = createStopRun({ api });
    const p = r.start();
    void r.start();
    expect(sent.length).toBe(1);
    expect(r.view().phase).toBe('running');
    r.reset();
    done(ok({ items: [item('a', 'stopped')], complete: true }));
    await p;
    expect(r.view().phase).toBe('idle');
    expect(r.view().items).toEqual([]);
  });
});

describe('requests that outlive a reset, and what later pages settle', () => {
  it('a call out before a reset cannot free the guard of the call after it: no cursor is sent twice', async () => {
    const waits: Array<(a: Answer) => void> = [];
    const sent: Array<string | undefined> = [];
    const api: agent.StopApi = { stop: (after) => { sent.push(after); return new Promise<Answer>((res) => waits.push(res)); } };
    const r = createStopRun({ api });
    void r.start(); // A
    r.reset();
    const p1 = r.start(); // B
    waits[1]!(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }));
    await p1;
    const p2 = r.next(); // C along c1
    waits[0]!(ok({ items: [], complete: true })); // A answers late
    await Promise.resolve();
    void r.next(); // C is still out: nothing is sent
    void r.start();
    expect(sent).toEqual([undefined, undefined, 'c1']);
    waits[2]!(ok({ items: [item('b', 'stopped')], complete: false, next_cursor: 'c2' }));
    await p2;
    expect(r.view().pages).toBe(2);
  });
  it('a cursor whose call ended stale (the page moved on) is not sent a second time', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), err('stale'));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.next();
    expect(r.view().phase).toBe('ready');
    await r.next();
    expect(f.sent.map((s) => s.after)).toEqual([undefined, 'c1']);
  });
  it('a cursor already used is never sent again', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), ok({ items: [item('b', 'stopped')], complete: false, next_cursor: 'c1' }));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.next();
    await r.next();
    expect(f.sent.map((s) => s.after)).toEqual([undefined, 'c1']);
  });
  it('work reported as started during a call, then stopped by a later page, is no longer listed as not stopped', async () => {
    const f = fake(
      ok({ items: [item('a', 'stopped')], started_during_call: [{ kind: 'session', id: 'x' }], complete: false, next_cursor: 'c1' }),
      ok({ items: [item('x', 'stopped')], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view().started).toEqual([{ kind: 'session', id: 'x' }]);
    await r.next();
    expect(r.view().counts.stopped).toBe(2);
    expect(r.view().started).toEqual([]);
    expect(r.view().again).toBe(false);
  });
  it('a later turn on a session this very page stopped is still reported as started and not stopped', async () => {
    const f = fake(ok({ items: [item('s1', 'stopped')], started_during_call: [{ kind: 'session', id: 's1' }], complete: false }));
    const r = createStopRun({ api: f.api });
    await r.start();
    expect(r.view().started).toEqual([{ kind: 'session', id: 's1' }]);
    expect(r.view().again).toBe(true);
  });
  it('a restart on a session an earlier page stopped stays reported when a later page names it started', async () => {
    const f = fake(
      ok({ items: [item('s1', 'stopped')], complete: false, next_cursor: 'c1' }),
      ok({ items: [item('b', 'stopped')], started_during_call: [{ kind: 'session', id: 's1' }], complete: true }));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.next();
    expect(r.view().started).toEqual([{ kind: 'session', id: 's1' }]);
    expect(r.view().again).toBe(true);
  });
  it(`at the ${MAX_PAGES}-page cap with more left: no Continue, but a fresh sweep is offered`, async () => {
    let n = 0;
    const api: agent.StopApi = { stop: () => Promise.resolve(ok({ items: [item('i' + n, 'stopped')], complete: false, next_cursor: 'c' + ++n })) };
    const r = createStopRun({ api });
    await r.start();
    while (r.view().canContinue) await r.next();
    expect(r.view()).toMatchObject({ pages: MAX_PAGES, canContinue: false, again: true, complete: false });
  });
  it('a refused continuation keeps what the earlier pages stopped', async () => {
    const f = fake(ok({ items: [item('a', 'stopped')], complete: false, next_cursor: 'c1' }), err('failed', 403, 'forbidden'));
    const r = createStopRun({ api: f.api });
    await r.start();
    await r.next();
    expect(r.view()).toMatchObject({ phase: 'refused', pages: 1, counts: { stopped: 1, alreadyDone: 0, failed: 0 }, error: { code: 'forbidden', status: 403 }, again: true });
    expect(r.view().items.map((i) => i.id)).toEqual(['a']);
  });
});
