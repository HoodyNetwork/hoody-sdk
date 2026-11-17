// Vitest (New script): a draft is bound to the computer the Hub showed when it was
// made. While the Hub shows another computer, every wizard send (validate, resolve, write, idea, settle, the assistant's create,
// turn, check and stop) is not sent and nothing reaches either computer. While the bound computer is shown, each send names
// it explicitly. A stored build's reads, and a Being built row's Stop, go to the record's own computer whatever the Hub shows.
// A computer missing from a whole list is gone; missing from a part of the list it is "can't tell yet".
// The send condition reaches core's transport (`still`): a switch after the call, while core waits, or between the
// assistant's create and turn, leaves the next request unsent. An attempt's place names its project, so another project's
// container of the same id never continues, reads or stops it. The stored-build readers check the daemon's own shapes.
// A build opens no session stream (polled reads only); a create that may have reached the agent keeps the attempt
// pending through later checks; replay entries and listed rows are checked one by one.
// A start also needs its attempt to be the draft's current one, read at each send: a Discard or Build again from another
// tab after this tab reserved the attempt, and before its ask is stored, leaves the session create and the turn unsent.
import { CoreQueryProvider, dropDraftRecord, dropScriptAsks, queryClient, readDraftRecords, readScriptAsks, type DraftRecord, type Target } from '@core';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';
import { act, renderHook as render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ shown: null as unknown }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => world.shown };
});

import { bindingOfRecord, replayWindowOf, storedBuildReads, stopStoredBuild, useAiTurn, useBoundSends, useBoundShown, useBuildApi, type Binding } from './data';
import { attemptOf, attemptPath, forgetRuns, restoreRun, timing } from './writer';
import { discardDraft, nextAttempt, openRecord, readDraftRecord } from './new/records';

const renderHook = <T,>(fn: () => T) => render(fn, { wrapper: CoreQueryProvider });
const B_COMP: Target = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv2' } };
const BOUND: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
// Another project whose container has the same id as the bound one.
const P9: Target = { project: { id: 'p9' }, container: { id: 'c1', server_name: 'sv1' } };
const BOUND9: Binding = { target: P9, realm: R1, owner: 'fp1', exec: 1 };
const show = (t: Target): void => { world.shown = t; setTarget(t); };
const toA = (c: Call): boolean => c.url.includes('p1-c1-');
const toB = (c: Call): boolean => c.url.includes('p1-c2-');
const toP9 = (c: Call): boolean => c.url.includes('p9-c1-');
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await settle(); };
const agentPath = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const draft = (): DraftRecord => readDraftRecord('abcdefghij') as DraftRecord;
// The draft's next attempt reserved, as the wizard does before each start.
const reserve = async (): Promise<number> => { const m = await nextAttempt(draft(), false); if (!m.ok) throw new Error(m.why); return m.record.current; };

const STARTED = { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'fp1', tool_ceiling: 'script-writer' };
let sessions = 0;
// Runs inside the fake transport when a session create arrives (a switch the shell makes while the create is out).
let onCreate: ((n: number) => Reply | void) | null = null;
let cancelReply: Reply = { status: 202, body: { ok: true } };
let replayBody: unknown = { session_id: 's1', incarnation: 'inc1', min_seq: 3, max_seq: 4, events: [{ seq: 3, event: { type: 'text' } }, { seq: 4, incarnation: 'inc1', event: { type: 'text' } }] };
beforeEach(async () => {
  boot({ realm: R1 });
  queryClient.clear();
  forgetRuns();
  const stored = readScriptAsks();
  if (Array.isArray(stored)) await dropScriptAsks(stored);
  const drafts = readDraftRecords();
  if (Array.isArray(drafts)) for (const r of drafts) await dropDraftRecord(r);
  // The draft every start below builds, its attempt 1 reserved.
  if (!(await openRecord('abcdefghij', 'ai', BOUND)).ok) throw new Error('no draft record');
  await reserve();
  Object.assign(timing, { everyMs: 5, wakeMs: 2, maxMs: 40 });
  sessions = 0;
  onCreate = null;
  cancelReply = { status: 202, body: { ok: true } };
  replayBody = { session_id: 's1', incarnation: 'inc1', min_seq: 3, max_seq: 4, events: [{ seq: 3, event: { type: 'text' } }, { seq: 4, incarnation: 'inc1', event: { type: 'text' } }] };
  calls.length = 0;
  onFetch((c: Call): Reply => {
    const p = agentPath(c);
    if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; const r = onCreate?.(sessions); if (r) return r; return { status: 201, body: { session_id: `s${sessions}`, started: toP9(c) ? { ...STARTED } : STARTED } }; }
    if (c.method === 'POST' && /^\/sessions\/s\d\/turns$/.test(p)) return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
    if (c.method === 'GET' && /^\/sessions\/s\d\/turns\/t1$/.test(p)) return { status: 200, body: { turn_id: 't1', state: 'dispatched' } };
    if (c.method === 'POST' && /\/cancel$/.test(p)) return cancelReply;
    if (c.method === 'GET' && p === '/sessions/s1/replay') return { status: 200, body: replayBody };
    if (c.method === 'GET' && p === '/sessions/s1/state') return { status: 200, body: { session_id: 's1', live: true, state: 'running', current_step: { kind: 'tool', tool: 'bash' } } };
    if (c.method === 'GET' && p === '/sessions/s1') return { status: 200, body: { session: { id: 's1' }, attached: true, incarnation: 'inc1' } };
    if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: { messages: [] } };
    if (c.url.includes('/exec/')) return { status: 200, body: { data: { ok: true } } };
    return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
  });
});

describe('the draft\'s exec and idea sends (useBoundSends)', () => {
  it('while the Hub shows another computer, validate, resolve, write and idea are not sent, to either computer', async () => {
    show(B_COMP);
    const { result } = renderHook(() => ({ sends: useBoundSends(BOUND), shown: useBoundShown(BOUND) }));
    expect(result.current.shown).toBe(false);
    expect(result.current.sends.shown).toBe(false);
    const got = await Promise.all([
      result.current.sends.validate('export default 1;'),
      result.current.sends.resolve('/probe'),
      result.current.sends.write({ path: 'default/1/probe.ts', content: 'x', ifRevision: null, opId: 'op-s3-0000-0001' }),
      result.current.sends.instantiate({ name: 'hello', path: 'default/1/probe.ts', vars: {} }),
    ]);
    await flush();
    for (const r of got) expect(r).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(calls).toHaveLength(0);
  });

  it('while the bound computer is shown each send names it; a switch after the press leaves the send unsent', async () => {
    show(TARGET);
    const { result, rerender } = renderHook(() => useBoundSends(BOUND));
    expect(result.current.shown).toBe(true);
    await act(async () => {
      await result.current.validate('export default 1;');
      await result.current.resolve('/probe');
      await result.current.write({ path: 'default/1/probe.ts', content: 'x', ifRevision: null, opId: 'op-s3-0000-0002' });
      await flush();
    });
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.every(toA)).toBe(true);
    calls.length = 0;
    // the person pressed while A was shown; the shell switched to B before the send: nothing goes anywhere
    const pressed = result.current.write;
    show(B_COMP);
    rerender();
    expect(await pressed({ path: 'default/1/probe.ts', content: 'x', ifRevision: null, opId: 'op-s3-0000-0003' })).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('each send carries the bound computer itself: core\'s own shell target is never what it is sent to', async () => {
    // the page sees A (the bound computer) while core's shell target is B: an explicit target is the only way to reach A
    world.shown = TARGET;
    setTarget(B_COMP);
    const { result } = renderHook(() => useBoundSends(BOUND));
    await act(async () => {
      await result.current.validate('export default 1;');
      await result.current.resolve('/probe');
      await result.current.write({ path: 'default/1/probe.ts', content: 'x', ifRevision: null, opId: 'op-s3-0000-0004' });
      await result.current.instantiate({ name: 'hello', path: 'default/1/probe.ts', vars: {} });
      await flush();
    });
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.filter(toB)).toEqual([]);
    expect(calls.some((c) => c.url.includes('/script-templates/hello/instantiate'))).toBe(true);
  });

  it('a same container id in another project is not the bound computer', async () => {
    show({ project: { id: 'p9' }, container: { id: 'c1', server_name: 'sv1' } });
    const { result } = renderHook(() => useBoundSends(BOUND));
    expect(result.current.shown).toBe(false);
    expect(await result.current.validate('x')).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(calls).toHaveLength(0);
  });
});

describe('the build API (useBuildApi): attempts on the bound computer', () => {
  it('while another computer is shown, the assistant\'s create, check and stop are not sent', async () => {
    show(B_COMP);
    const { result } = renderHook(() => useBuildApi());
    expect(await result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(await result.current.check(BOUND, 'abcdefghij', 1)).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(await result.current.cancel(BOUND, 'abcdefghij', 1)).toBe(false);
    await flush();
    expect(calls).toHaveLength(0);
    expect(readScriptAsks()).toEqual([]);
  });

  it('shown: attempt 1 is created on the bound computer at its own place; attempt 2 is a new ask, never a continuation of 1', async () => {
    show(TARGET);
    const { result } = renderHook(() => useBuildApi());
    expect((await result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome).toBe('pending');
    expect(sessions).toBe(1);
    const asks = readScriptAsks();
    expect(Array.isArray(asks) && asks.map((a) => a.path)).toEqual([attemptPath('p1', 'abcdefghij', 1)]);
    expect(await reserve()).toBe(2);
    expect((await result.current.start(BOUND, 'abcdefghij', 2, 'count signups, weekly')).outcome).toBe('pending');
    expect(sessions).toBe(2);
    const turns = calls.filter((c) => c.method === 'POST' && /\/turns$/.test(agentPath(c)));
    expect(turns.map((c) => (c.body as { text: string }).text)).toEqual(['count signups', 'count signups, weekly']);
    expect(calls.every(toA)).toBe(true);
    // attempt 1, no longer the current one, is not sent again: no third session, no second turn of attempt 1
    expect(await result.current.start(BOUND, 'abcdefghij', 1, 'other words')).toMatchObject({ outcome: 'not_sent', code: 'NOT_CURRENT' });
    expect(sessions).toBe(2);
  });

  it('a running attempt is not stopped while another computer is shown; shown again, its own turn is stopped there', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    expect((await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome).toBe('pending');
    calls.length = 0;
    show(B_COMP);
    view.rerender();
    expect(await view.result.current.cancel(BOUND, 'abcdefghij', 1)).toBe(false);
    expect(calls.filter((c) => /\/cancel$/.test(agentPath(c)))).toHaveLength(0);
    show(TARGET);
    view.rerender();
    expect(await view.result.current.cancel(BOUND, 'abcdefghij', 1)).toBe(true);
    const stops = calls.filter((c) => /\/cancel$/.test(agentPath(c)));
    expect(stops).toHaveLength(1);
    expect(toA(stops[0]!)).toBe(true);
    expect(stops[0]!.body).toEqual({ turn_id: 't1' });
  });
});

describe('a stored build\'s reads and a row\'s Stop go to the record\'s computer, whatever the Hub shows', () => {
  it('receipt, session, state, replay and transcript read the bound computer while B is shown', async () => {
    show(B_COMP);
    expect(await storedBuildReads.receipt(BOUND, 's1', 't1')).toMatchObject({ turnId: 't1' });
    expect(await storedBuildReads.session(BOUND, 's1')).toMatchObject({ incarnation: 'inc1' });
    expect(await storedBuildReads.state(BOUND, 's1')).toMatchObject({ session_id: 's1', current_step: { kind: 'tool' } });
    expect(await storedBuildReads.replay(BOUND, 's1')).toEqual({ events: [{ seq: 3, event: { type: 'text' } }, { seq: 4, incarnation: 'inc1', event: { type: 'text' } }], minSeq: 3, maxSeq: 4, incarnation: 'inc1', pendingGate: null });
    expect(await storedBuildReads.transcript(BOUND, 's1')).toEqual({ messages: [] });
    expect(calls.length).toBe(5);
    expect(calls.every(toA)).toBe(true);
    expect(calls.some(toB)).toBe(false);
  });

  it('a replay window that is not whole is unreadable; a malformed id is never sent', async () => {
    show(TARGET);
    replayBody = { incarnation: 'inc1', min_seq: 9, max_seq: 3, events: [] };
    expect(await storedBuildReads.replay(BOUND, 's1')).toBe('unreadable');
    replayBody = { min_seq: 1, max_seq: 2, events: [] };
    expect(await storedBuildReads.replay(BOUND, 's1')).toBe('unreadable');
    calls.length = 0;
    for (const bad of ['../x', 'a b', 's1?x=1', '']) expect(await storedBuildReads.state(BOUND, bad)).toBe('unreadable');
    expect(await storedBuildReads.receipt(BOUND, 's1', 't 1')).toBe('unreadable');
    expect(calls).toHaveLength(0);
  });

  it('Stop names the row\'s computer and turn while B is shown; a lost answer is unknown, a refusal is false', async () => {
    show(B_COMP);
    expect(await stopStoredBuild(BOUND, 's1', 't1')).toBe(true);
    const stop = calls.find((c) => /\/cancel$/.test(agentPath(c)));
    expect(stop && toA(stop)).toBe(true);
    expect(stop?.body).toEqual({ turn_id: 't1' });
    cancelReply = { status: 503, body: { code: 'unavailable', message: 'x' } };
    expect(await stopStoredBuild(BOUND, 's1', 't1')).toBe('unknown');
    cancelReply = { status: 404, body: { code: 'not_found', message: 'x' } };
    expect(await stopStoredBuild(BOUND, 's1', 't1')).toBe(false);
    expect(calls.some(toB)).toBe(false);
  });
});

describe('bindingOfRecord: the record\'s computer from the containers read', () => {
  const row = { id: 'c1', project_id: 'p1', server_name: 'sv1', status: 'running' };
  const rec = { compId: 'c1', realm: R1, owner: 'fp1' };
  it('a listed computer binds exactly the record\'s realm and owner', () => {
    expect(bindingOfRecord(rec, { data: { computers: [row] } })).toEqual({ target: TARGET, realm: R1, owner: 'fp1', exec: 1 });
    expect(bindingOfRecord({ ...rec, exec: 3 }, { data: { computers: [row] } })).toMatchObject({ exec: 3 });
  });
  it('missing from a whole list: gone; from part of a list, or no list: can\'t tell yet', () => {
    expect(bindingOfRecord(rec, { data: { computers: [], pagination: { totalPages: 1 } } })).toBeNull();
    expect(bindingOfRecord(rec, { data: { computers: [{ ...row, id: 'c9' }], pagination: { totalPages: 2 } } })).toBe('unknown');
    expect(bindingOfRecord(rec, { data: {} })).toBe('unknown');
    expect(bindingOfRecord(rec, undefined)).toBe('unknown');
    expect(bindingOfRecord(rec, { data: { computers: [{ ...row, project_id: undefined }] } })).toBe('unknown');
  });
  it('a record without its realm or owner, or with an attempt path that does not read back, cannot name its computer: unknown, never gone', () => {
    expect(bindingOfRecord({ ...rec, realm: null }, { data: { computers: [row] } })).toBe('unknown');
    expect(bindingOfRecord({ ...rec, owner: null }, { data: { computers: [] , pagination: { totalPages: 1 } } })).toBe('unknown');
    expect(bindingOfRecord({ ...rec, path: 'new:abcdefghij.1' }, { data: { computers: [row] } })).toBe('unknown');
  });
  it('a record with no attempt path cannot say which project it was made in: the same container id listed in two projects is can\'t tell, never the first row', () => {
    const p9row = { ...row, project_id: 'p9' };
    expect(bindingOfRecord(rec, { data: { computers: [p9row, row] } })).toBe('unknown');
    expect(bindingOfRecord(rec, { data: { computers: [row, p9row] } })).toBe('unknown');
    // One row of that id is still its computer.
    expect(bindingOfRecord(rec, { data: { computers: [row, { ...p9row, id: 'c7' }] } })).toMatchObject({ target: TARGET });
  });
  it('an attempt record binds only the row of its own project: another project\'s container of the same id is not it', () => {
    const p9row = { ...row, project_id: 'p9' };
    const att = { ...rec, path: attemptPath('p1', 'abcdefghij', 2) };
    expect(bindingOfRecord(att, { data: { computers: [p9row, row] } })).toEqual({ target: TARGET, realm: R1, owner: 'fp1', exec: 1 });
    expect(bindingOfRecord(att, { data: { computers: [p9row], pagination: { totalPages: 1 } } })).toBeNull();
    expect(bindingOfRecord(att, { data: { computers: [p9row], pagination: { totalPages: 3 } } })).toBe('unknown');
  });
});

describe('a start sends only for its draft\'s current attempt', () => {
  const posts = (): { sessions: number; turns: number } => ({ sessions: calls.filter((c) => c.method === 'POST' && agentPath(c) === '/sessions').length, turns: calls.filter((c) => c.method === 'POST' && /\/turns$/.test(agentPath(c))).length });

  it('a Discard from another tab between the reservation and the store: no session create, no turn, nothing stored', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    // this tab reserved attempt 1 (beforeEach); the other tab's Discard lands before this tab's start stores its ask
    expect((await discardDraft(draft())).ok).toBe(true);
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'not_sent', code: 'NOT_CURRENT' });
    await flush();
    expect(posts()).toEqual({ sessions: 0, turns: 0 });
    expect(readScriptAsks()).toEqual([]);
  });

  it('a Build again from another tab before the store: the replaced attempt sends neither request', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    expect(await reserve()).toBe(2);
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'not_sent', code: 'NOT_CURRENT' });
    await flush();
    expect(posts()).toEqual({ sessions: 0, turns: 0 });
  });

  it('a Discard while the session create is out: the turn is never sent, and the attempt gets no answer', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    let discarded: Promise<unknown> | null = null;
    onCreate = () => { discarded = discardDraft(draft()); };
    // the Discard's close of the stored ask (superseded) or the draft no longer current (not sent): never an answer
    expect(['stale', 'not_sent']).toContain((await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome);
    await discarded;
    await flush();
    expect(posts()).toEqual({ sessions: 1, turns: 0 });
    expect(readScriptAsks()).toEqual([]);
  });

  it('a Discard after a create whose answer was lost: the same-key retry of the create is not sent', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    let discarded: Promise<unknown> | null = null;
    onCreate = (n) => { if (n === 1) { discarded = discardDraft(draft()); return { status: 503, body: { code: 'unavailable', message: 'x' } }; } };
    const r = await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups');
    await discarded;
    await flush();
    // the first create may have made the session (C9): never an answer, and nothing more goes out for the discarded draft
    expect(r).toMatchObject({ outcome: 'pending', code: 'CREATE_UNKNOWN' });
    expect(posts()).toEqual({ sessions: 1, turns: 0 });
  });
});

describe('the send condition reaches the transport', () => {
  it('a switch after the call, while core still waits before sending, leaves the request unsent (validate, write)', async () => {
    show(TARGET);
    const { result, rerender } = renderHook(() => useBoundSends(BOUND));
    // each call passes the check at the call (A is shown); the shell switches before core sends it
    const pv = result.current.validate('export default 1;');
    const pw = result.current.write({ path: 'default/1/probe.ts', content: 'x', ifRevision: null, opId: 'op-s3-0000-0009' });
    show(B_COMP);
    rerender();
    expect(await pv).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(await pw).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    await flush();
    expect(calls).toHaveLength(0);
  });

  it('a switch while the assistant\'s create is out: the turn is never sent (anywhere) and the attempt says not sent', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    onCreate = () => { show(B_COMP); view.rerender(); };
    const r = await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups');
    expect(r.outcome).toBe('not_sent');
    expect(sessions).toBe(1);
    expect(calls.filter((c) => c.method === 'POST' && /\/turns$/.test(agentPath(c)))).toHaveLength(0);
    expect(calls.every(toA)).toBe(true);
  });

  it('a create whose answer was lost, retried after a switch: the retry is not sent and the create stays unknown (pending)', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    onCreate = () => { show(B_COMP); view.rerender(); return { status: 503, body: { code: 'unavailable', message: 'x' } }; };
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'pending', code: 'CREATE_UNKNOWN' });
    expect(sessions).toBe(1);
    expect(readScriptAsks()).toHaveLength(1);
  });

  it('a running attempt\'s check, once another computer is shown mid-wait, reads nothing more and stays pending', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    expect((await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome).toBe('pending');
    show(B_COMP);
    view.rerender();
    calls.length = 0;
    expect(await view.result.current.check(BOUND, 'abcdefghij', 1)).toMatchObject({ outcome: 'not_sent', code: 'NOT_SHOWN' });
    expect(calls).toHaveLength(0);
  });

  it('a switch while the turn runs: the next receipt read is not made; the attempt waits (pending, not shown), nothing decided', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    let reads = 0;
    onFetch((c: Call): Reply => {
      const p = agentPath(c);
      if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: `s${sessions}`, started: STARTED } }; }
      if (c.method === 'POST' && /\/turns$/.test(p)) return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
      if (c.method === 'GET' && /\/turns\/t1$/.test(p)) { reads++; if (reads === 1) { show(B_COMP); view.rerender(); } return { status: 200, body: { turn_id: 't1', state: 'dispatched' } }; }
      return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
    });
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'pending', code: 'NOT_SHOWN' });
    expect(reads).toBe(1);
    expect(readScriptAsks()).toHaveLength(1);
  });
});

describe('an ask of another project is never continued, read or stopped', () => {
  it('attempt places name the project: the same draft and number in another project is its own ask', async () => {
    expect(attemptOf(attemptPath('p1', 'abcdefghij', 12))).toEqual({ project: 'p1', draftId: 'abcdefghij', n: 12 });
    expect(attemptOf('new:abcdefghij.1')).toBeNull();
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    expect((await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome).toBe('pending');
    show(P9);
    view.rerender();
    calls.length = 0;
    // p9's check finds no ask of its own (p1's is never read for it); its stop sends nothing
    expect(await view.result.current.check(BOUND9, 'abcdefghij', 1)).toBeNull();
    expect(await view.result.current.cancel(BOUND9, 'abcdefghij', 1)).toBe(false);
    expect(calls).toHaveLength(0);
    // p9's start is a new ask on p9, never a continuation of p1's session
    await view.result.current.start(BOUND9, 'abcdefghij', 1, 'other');
    expect(sessions).toBe(2);
    expect(calls.filter((c) => c.method === 'POST').every(toP9)).toBe(true);
    const asks = readScriptAsks();
    expect(Array.isArray(asks) && asks.map((a) => a.path).sort()).toEqual([attemptPath('p1', 'abcdefghij', 1), attemptPath('p9', 'abcdefghij', 1)]);
  });

  it('a stored attempt record is never restored for another project', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups');
    const [stored] = readScriptAsks() as Array<Parameters<typeof restoreRun>[0]>;
    expect(restoreRun(stored!, { target: P9 })).toBeNull();
    expect(restoreRun(stored!, { target: TARGET })).not.toBeNull();
  });

  it('the shown-computer ask: a run made for one project is not continued when another project\'s container of the same id is shown', async () => {
    show(TARGET);
    const view = renderHook(() => useAiTurn());
    const v = { compId: 'c1', path: 'default/1/a.ts', text: 'tidy', realm: R1, owner: 'fp1' };
    expect((await view.result.current.mutateAsync(v)).outcome).toBe('pending');
    show(P9);
    view.rerender();
    calls.length = 0;
    expect(await view.result.current.mutateAsync(v)).toEqual({ outcome: 'not_sent', code: 'OTHER_COMPUTER' });
    expect(calls).toHaveLength(0);
  });
});

describe('stored-build readers check the daemon\'s shapes and the identities asked for', () => {
  it('another turn\'s receipt, another session\'s read or state, and a missing session envelope are unreadable', async () => {
    show(TARGET);
    onFetch((c: Call): Reply => {
      const p = agentPath(c);
      if (/\/turns\/t1$/.test(p)) return { status: 200, body: { turn_id: 't2', state: 'dispatched' } };
      if (p === '/sessions/s1/state') return { status: 200, body: { session_id: 's2', live: true, state: 'idle' } };
      if (p === '/sessions/s1') return { status: 200, body: { session_id: 's1', incarnation: 'inc1' } };
      if (p === '/sessions/s2') return { status: 200, body: { session: { id: 's9' } } };
      if (p === '/sessions/s2/state') return { status: 200, body: { session_id: 's2', state: 'idle' } };
      return { status: 200, body: {} };
    });
    expect(await storedBuildReads.receipt(BOUND, 's1', 't1')).toBe('unreadable');
    expect(await storedBuildReads.state(BOUND, 's1')).toBe('unreadable');
    expect(await storedBuildReads.session(BOUND, 's1')).toBe('unreadable');
    expect(await storedBuildReads.session(BOUND, 's2')).toBe('unreadable');
    expect(await storedBuildReads.state(BOUND, 's2')).toBe('unreadable');
  });

  it('replay: the gateway\'s empty ring is a window; another session\'s, or one with more events than seqs, is not', () => {
    expect(replayWindowOf({ session_id: 's1', incarnation: 'inc1', min_seq: 1, max_seq: 0, events: [] }, 's1')).toEqual({ events: [], minSeq: 1, maxSeq: 0, incarnation: 'inc1', pendingGate: null });
    expect(replayWindowOf({ session_id: 's1', incarnation: 'inc1', min_seq: 1, max_seq: 0, events: [{}] }, 's1')).toBe('unreadable');
    expect(replayWindowOf({ session_id: 's2', incarnation: 'inc1', min_seq: 3, max_seq: 9, events: [] }, 's1')).toBe('unreadable');
    expect(replayWindowOf({ session_id: 's1', incarnation: 'inc1', min_seq: 3, max_seq: 4, events: [{}, {}, {}] }, 's1')).toBe('unreadable');
    expect(replayWindowOf({ session_id: 's1', incarnation: 'inc1', min_seq: 3, max_seq: 4, events: [], pending_gate: 'x' }, 's1')).toBe('unreadable');
  });
});

describe('no stream for a build; create uncertainty across checks; replay entries; a row without its project', () => {
  it('a build never opens the session stream (core opens it later, when its budget grants a slot): only polled reads, each asking the condition', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    expect((await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome).toBe('pending');
    await flush();
    expect(calls.filter((c) => /\/stream|\/events/.test(agentPath(c)))).toEqual([]);
    expect(calls.some((c) => c.method === 'GET' && /\/turns\/t1$/.test(agentPath(c)))).toBe(true);
  });

  it('after a create whose answer was lost, a later Check again whose create is refused or unsent stays pending, record kept', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    onCreate = () => ({ status: 503, body: { code: 'unavailable', message: 'x' } });
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'pending', code: 'CREATE_UNKNOWN' });
    // the next press of the same attempt (same run): the agent now refuses the create
    onCreate = () => ({ status: 403, body: { code: 'forbidden', message: 'x' } });
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'pending', code: 'CREATE_UNKNOWN' });
    expect(readScriptAsks()).toHaveLength(1);
    // and with the bound computer no longer shown at the transport: still pending, never "not sent"
    onCreate = () => { show(B_COMP); view.rerender(); return { status: 503, body: { code: 'unavailable', message: 'x' } }; };
    show(TARGET);
    view.rerender();
    expect(await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).toMatchObject({ outcome: 'pending', code: 'CREATE_UNKNOWN' });
    expect(readScriptAsks()).toHaveLength(1);
  });

  it('a create refused with no earlier lost answer still ends the attempt (nothing was made)', async () => {
    show(TARGET);
    const view = renderHook(() => useBuildApi());
    onCreate = () => ({ status: 403, body: { code: 'forbidden', message: 'x' } });
    expect((await view.result.current.start(BOUND, 'abcdefghij', 1, 'count signups')).outcome).toBe('failed');
    expect(readScriptAsks()).toEqual([]);
  });

  it('replay entries: each an object with seq in order, first at min and last at max, its incarnation the window\'s, its event an object', () => {
    const w = (events: unknown[], min = 3, max = 4) => replayWindowOf({ session_id: 's1', incarnation: 'inc1', min_seq: min, max_seq: max, events }, 's1');
    const ev = (seq: number, o: Record<string, unknown> = {}) => ({ seq, event: { type: 'x' }, ...o });
    expect(w([ev(3), ev(4, { incarnation: 'inc1' })])).toMatchObject({ minSeq: 3, maxSeq: 4 });
    expect(w([null])).toBe('unreadable');
    expect(w([ev(3), { seq: 4 }])).toBe('unreadable');
    expect(w([ev(4), ev(3)])).toBe('unreadable');
    expect(w([ev(3), ev(3)])).toBe('unreadable');
    expect(w([ev(3), ev(4, { incarnation: 'inc2' })])).toBe('unreadable');
    expect(w([ev(3)])).toBe('unreadable');
    expect(w([ev(4)])).toBe('unreadable');
    expect(w([ev(3), ev(99)])).toBe('unreadable');
    expect(w([ev(3), { ...ev(4), seq: 4.5 }])).toBe('unreadable');
    // order inside a window whose ends are right: a repeated or a backward entry
    expect(w([ev(3), ev(5), ev(5)], 3, 5)).toBe('unreadable');
    expect(w([ev(3), ev(2), ev(5)], 3, 5)).toBe('unreadable');
    expect(w([ev(3), ev(4), ev(5)], 3, 5)).toMatchObject({ minSeq: 3, maxSeq: 5 });
    // a gap inside a window whose ends are right: 4 is missing, so the cursor at 5 would skip it
    expect(w([ev(3), ev(5)], 3, 5)).toBe('unreadable');
    // a null entry at seq 0 is unreadable, never a throw
    expect(w([null], 0, 0)).toBe('unreadable');
  });

  it('an attempt record whose container id is listed without a project: can\'t tell yet, never gone', () => {
    const att = { compId: 'c1', path: attemptPath('p1', 'abcdefghij', 1), realm: R1, owner: 'fp1' };
    expect(bindingOfRecord(att, { data: { computers: [{ id: 'c1' }], pagination: { totalPages: 1 } } })).toBe('unknown');
    expect(bindingOfRecord(att, { data: { computers: [{ id: 'c1', project_id: 'p9' }, { id: 'c1' }], pagination: { totalPages: 1 } } })).toBe('unknown');
  });
});
