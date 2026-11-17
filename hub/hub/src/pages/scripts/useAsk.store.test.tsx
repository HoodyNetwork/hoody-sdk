// Vitest on several views of one place over the real store of asks (data.ts and writer.ts over core's request path, a fake agent
// standing in for the network): the ask belongs to the store, not to the hook instance that made it. What is pinned (C9): an ask
// out at a place is pending in every view of it, an answer is delivered by one claim (the winner shows it, the loser shows nothing
// and unlocks nothing), the warned close ends the ask for every view and leaves no late answer to show, and a reload finds the
// stored ask and reads it, never sending its turn again.
import { act, renderHook } from '@app/testing';
import { dropScriptAsks, putScriptAsk, readScriptAsks, type ScriptAsk } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ computer: 'c1' }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: world.computer, server_name: 'sv1' } }) };
});

import type { CompScripts } from './types';
import { askIdOf, forgetRuns, heldCount, timing } from './writer';
import { useAsk } from './parts/useAsk';

const route = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const sent = (method: string, re: RegExp): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === method && re.test(route(c)));
const STARTED = { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'fp1', tool_ceiling: 'script-writer' };
const ANSWER = 'Summary: ok\n```ts\nreturn 1;\n```';
const comp = (): CompScripts => ({ id: 'c1', agentRealm: R1, agent: { writer: true, writerOwner: 'fp1' } }) as never;
let sessions = 0;
/** The receipt the fake agent answers for every turn, and a gate that holds the first session's receipt reads until the test lets them go. */
let state = 'dispatched';
let gate: Promise<void> = Promise.resolve();
let gate2: Promise<void> = Promise.resolve();
let gate3: Promise<void> = Promise.resolve();
const fake = (): void => {
  sessions = 0;
  onFetch(async (c): Promise<Reply> => {
    const p = route(c);
    if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: `s${sessions}`, started: STARTED } }; }
    if (c.method === 'POST' && /^\/sessions\/s\d+\/turns$/.test(p)) return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
    if (c.method === 'GET' && /^\/sessions\/s\d+\/turns\/t1$/.test(p)) { if (p.startsWith('/sessions/s1/')) await gate; else if (p.startsWith('/sessions/s2/')) await gate2; return { status: 200, body: { turn_id: 't1', state } }; }
    if (c.method === 'GET' && /\/transcript$/.test(p)) { await gate3; return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } }; }
    return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
  });
};
const hold = (): (() => void) => {
  let go: () => void = () => undefined;
  gate = new Promise<void>((r) => { go = r; });
  return go;
};
const hold2 = (): (() => void) => {
  let go: () => void = () => undefined;
  gate2 = new Promise<void>((r) => { go = r; });
  return go;
};
const view = (scope = 's') => renderHook(() => useAsk(scope, comp(), null));
const pendingNow = (r: { current: ReturnType<typeof useAsk> }) => vi.waitFor(() => expect(r.current.out?.kind).toBe('pending'));
const turns = (): number => sent('POST', /\/turns$/).length;

describe('several views of one place over one store of asks', () => {
  beforeEach(async () => {
    boot({ realm: R1 });
    forgetRuns();
    const stored = readScriptAsks();
    if (Array.isArray(stored)) await dropScriptAsks(stored);
    world.computer = TARGET.container.id;
    state = 'dispatched';
    gate = Promise.resolve();
    gate2 = Promise.resolve();
    gate3 = Promise.resolve();
    Object.assign(timing, { everyMs: 5, wakeMs: 2, maxMs: 3000 });
    fake();
  });

  it('an ask out in one view is pending in another view of the place, and a press there sends nothing', async () => {
    const release = hold();
    const x = view();
    const y = view('other-scope');
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = x.result.current.ask('first words'); });
    await vi.waitFor(() => expect(sent('GET', /\/turns\/t1$/).length).toBeGreaterThan(0));
    await pendingNow(y.result);
    state = 'completed';
    await act(async () => { release(); });
    expect(await asked).toMatchObject({ outcome: 'done', reply: ANSWER });
    expect(sessions).toBe(1);
    expect(turns()).toBe(1);
    // delivered: nothing is open at the place any more, in either view
    await vi.waitFor(() => { expect(x.result.current.out).toBeNull(); expect(y.result.current.out).toBeNull(); });
  });

  it('two Check again calls of two views that hold the same answer: one claim wins and shows it, the other shows nothing and is freed', async () => {
    state = 'dispatched';
    timing.maxMs = 30;
    const x = view();
    const y = view();
    await act(async () => { await x.result.current.ask('first words'); });
    await pendingNow(x.result);
    await pendingNow(y.result);
    state = 'completed';
    let a: unknown = null;
    let b: unknown = null;
    await act(async () => { [a, b] = await Promise.all([x.result.current.check(), y.result.current.check()]); });
    expect([a, b].filter((r) => r !== null)).toHaveLength(1);
    expect([a, b].find((r) => r !== null)).toMatchObject({ outcome: 'done' });
    await vi.waitFor(() => { expect(x.result.current.out).toBeNull(); expect(y.result.current.out).toBeNull(); });
    expect(x.result.current.locked).toBe(false);
    expect(y.result.current.locked).toBe(false);
    expect(turns()).toBe(1);
  });

  it('a warned close by one view ends the ask for every view: a late Check again of another shows nothing and the banners follow the place', async () => {
    timing.maxMs = 30;
    const x = view();
    const y = view();
    await act(async () => { await x.result.current.ask('first words'); });
    await pendingNow(x.result);
    await pendingNow(y.result);
    const release = hold();
    state = 'completed';
    let late: Promise<unknown> = Promise.resolve();
    await act(async () => { late = x.result.current.check(); });
    await act(async () => { y.result.current.force(); });
    await act(async () => { release(); });
    expect(await late).toBeNull();
    await vi.waitFor(() => { expect(x.result.current.out).toBeNull(); expect(y.result.current.out).toBeNull(); });
    expect(x.result.current.locked).toBe(false);
    expect(sent('GET', /\/transcript$/)).toHaveLength(0);
  });

  it('a late press whose ask another view closed knowingly neither settles nor replaces the banner of the newer ask at the place', async () => {
    const release = hold();
    const x = view();
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = x.result.current.ask('first words'); });
    await vi.waitFor(() => expect(sent('GET', /\/turns\/t1$/).length).toBeGreaterThan(0));
    const y = view();
    await pendingNow(y.result);
    await act(async () => { y.result.current.force(); });
    await vi.waitFor(() => expect(sent('POST', /\/turns$/)).toHaveLength(1));
    state = 'dispatched';
    timing.maxMs = 30;
    // the person asks again at the place: a new ask, with a new session, which stays pending
    let again: unknown = null;
    await act(async () => { again = await y.result.current.ask('again'); });
    expect(again).toMatchObject({ outcome: 'pending' });
    expect(sessions).toBe(2);
    await pendingNow(y.result);
    state = 'completed';
    await act(async () => { release(); });
    // the first press's run is over: it shows nothing, delivers nothing, and the newer ask's banner is untouched
    expect(await asked).toBeNull();
    expect(y.result.current.out?.kind).toBe('pending');
    expect(y.result.current.locked).toBe(true);
    // the first press's own view follows the place too: it freed its banner, and the newer ask holds it again
    await vi.waitFor(() => expect(x.result.current.out?.kind).toBe('pending'));
    expect(x.result.current.locked).toBe(true);
  });

  it('a reload finds the stored ask: pending in the new view, read with Check again, its turn never sent again', async () => {
    timing.maxMs = 30;
    const first = view();
    await act(async () => { await first.result.current.ask('first words'); });
    await pendingNow(first.result);
    first.unmount();
    // a new page of the same browser: nothing in memory, the store is what is left
    forgetRuns();
    const z = view();
    await pendingNow(z.result);
    state = 'completed';
    let got: unknown = null;
    await act(async () => { got = await z.result.current.check(); });
    expect(got).toMatchObject({ outcome: 'done' });
    await vi.waitFor(() => expect(z.result.current.out).toBeNull());
    expect(sessions).toBe(1);
    expect(turns()).toBe(1);
  });

  it('an answer that arrives for a view that left the place stays stored: the next view there reads it and delivers it once', async () => {
    const release = hold();
    const x = view();
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = x.result.current.ask('first words'); });
    await vi.waitFor(() => expect(sent('GET', /\/turns\/t1$/).length).toBeGreaterThan(0));
    x.unmount();
    state = 'completed';
    await act(async () => { release(); });
    expect(await asked).toBeNull();
    const z = view();
    await pendingNow(z.result);
    let got: unknown = null;
    await act(async () => { got = await z.result.current.check(); });
    expect(got).toMatchObject({ outcome: 'done' });
    await vi.waitFor(() => expect(z.result.current.out).toBeNull());
    expect(turns()).toBe(1);
  });

  it('a late Check again of an ask closed knowingly leaves the banner of the newer press of the same view alone, and that press records its own outcome', async () => {
    timing.maxMs = 30;
    const x = view();
    await act(async () => { await x.result.current.ask('A'); });
    await pendingNow(x.result);
    timing.maxMs = 3000;
    const releaseA = hold();
    state = 'completed';
    let late: Promise<unknown> = Promise.resolve();
    await act(async () => { late = x.result.current.check(); });
    await act(async () => { x.result.current.force(); });
    await vi.waitFor(() => expect(x.result.current.out).toBeNull());
    const releaseB = hold2();
    let b: Promise<unknown> = Promise.resolve();
    await act(async () => { b = x.result.current.ask('B'); });
    await vi.waitFor(() => expect(x.result.current.out?.kind).toBe('busy'));
    await act(async () => { releaseA(); });
    expect(await late).toBeNull();
    // B is still out: its banner is neither pending nor free, and the late read of A took nothing from it
    expect(x.result.current.out?.kind).toBe('busy');
    expect(x.result.current.locked).toBe(true);
    await act(async () => { releaseB(); });
    expect(await b).toMatchObject({ outcome: 'done' });
    await vi.waitFor(() => expect(x.result.current.out).toBeNull());
    expect(x.result.current.locked).toBe(false);
    expect(sessions).toBe(2);
    expect(turns()).toBe(2);
  });

  it('a view that checks after another view delivered the answer is not left pending or locked', async () => {
    timing.maxMs = 30;
    const x = view();
    const y = view();
    await act(async () => { await x.result.current.ask('first words'); });
    await pendingNow(x.result);
    await pendingNow(y.result);
    state = 'completed';
    await act(async () => { await x.result.current.check(); });
    let got: unknown = 'unset';
    await act(async () => { got = await y.result.current.check(); });
    expect(got).toBeNull();
    await vi.waitFor(() => expect(y.result.current.out).toBeNull());
    expect(y.result.current.locked).toBe(false);
    expect(sessions).toBe(1);
    expect(turns()).toBe(1);
  });

  it('a view that leaves while its claim waits for the store does not consume the answer: it stays stored for the next view', async () => {
    const stored: ScriptAsk = { askId: askIdOf({ compId: 'c1', path: null, realm: R1, owner: 'fp1' }), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: 's1', turnId: 't1', phase: 'read', sentAt: Date.now(), createKey: 'ck', turnKey: 'tk' };
    expect(await putScriptAsk(stored, null)).toBe('ok');
    state = 'completed';
    const x = view();
    await pendingNow(x.result);
    let open: () => void = () => undefined;
    const gateLock = new Promise<void>((r) => { open = r; });
    void navigator.locks.request('hub_changes', () => gateLock); // the store's own lock (underChangeStore refuses an async callback and lets go at once)
    let got: Promise<unknown> = Promise.resolve();
    await act(async () => { got = x.result.current.check(); });
    // the transcript was read; the claim of the answer is queued behind the lock
    await vi.waitFor(() => expect(sent('GET', /\/transcript$/).length).toBeGreaterThan(0));
    x.unmount();
    await act(async () => { open(); });
    expect(await got).toBeNull();
    const left = readScriptAsks();
    expect(Array.isArray(left) ? left.length : -1).toBe(1);
    // the next view there reads it and delivers it once
    const z = view();
    await pendingNow(z.result);
    let again: unknown = null;
    await act(async () => { again = await z.result.current.check(); });
    expect(again).toMatchObject({ outcome: 'done' });
    expect(turns()).toBe(0);
  });

  it('a store that cannot be read keeps a pending banner pending: it proves neither that the ask is out nor that it is gone', async () => {
    timing.maxMs = 30;
    const x = view();
    await act(async () => { await x.result.current.ask('first words'); });
    await pendingNow(x.result);
    vi.stubGlobal('localStorage', { getItem: () => { throw new DOMException('denied', 'SecurityError'); }, setItem: () => undefined, removeItem: () => undefined, key: () => null, length: 0, clear: () => undefined });
    try {
      await act(async () => { x.rerender(); });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(x.result.current.out?.kind).toBe('pending');
      expect(x.result.current.locked).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    // readable again, the ask is still stored: the banner is still pending
    await act(async () => { x.rerender(); });
    expect(x.result.current.out?.kind).toBe('pending');
    expect(turns()).toBe(1);
  });

  it('a press whose view leaves while the claim of its answer waits for the store does not consume the answer', async () => {
    state = 'completed';
    let openTranscript: () => void = () => undefined;
    gate3 = new Promise<void>((r) => { openTranscript = r; });
    const x = view();
    let asked: Promise<unknown> = Promise.resolve();
    await act(async () => { asked = x.result.current.ask('first words'); });
    await vi.waitFor(() => expect(sent('GET', /\/transcript$/).length).toBeGreaterThan(0));
    // the store is busy when the answer comes in: its claim queues behind the lock
    let openLock: () => void = () => undefined;
    const lock = new Promise<void>((r) => { openLock = r; });
    void navigator.locks.request('hub_changes', () => lock); // the store's own lock (underChangeStore refuses an async callback and lets go at once)
    await act(async () => { openTranscript(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    x.unmount();
    await act(async () => { openLock(); });
    expect(await asked).toBeNull();
    const left = readScriptAsks();
    expect(Array.isArray(left) ? left.length : -1).toBe(1);
    expect(turns()).toBe(1);
  });

  it('what a press hid comes back with the answer of its ask, on the press and on a later Check again, and is gone once the answer is taken', async () => {
    timing.maxMs = 30;
    const x = view();
    const HIDDEN = { map: [{ ph: '__HOODY_SECRET_0__', value: 'hidden-value-1' }] };
    let first: { values?: unknown } | null = null;
    await act(async () => { first = (await x.result.current.ask('first words', HIDDEN)) as never; });
    // the press is still pending (no answer to put them into): they are not handed out, and stay with the stored ask
    expect(first).toMatchObject({ outcome: 'pending' });
    expect(first!.values).toBeUndefined();
    expect(heldCount()).toBe(1);
    state = 'completed';
    let second: { values?: unknown } | null = null;
    await act(async () => { second = (await x.result.current.check()) as never; });
    expect(second).not.toBeNull();
    expect(second!.values).toBe(HIDDEN);
    expect(heldCount()).toBe(0);
  });
  it('a Check again that finds the ask failed hands no values out: there is no answer to put them into, and the ask ends with them', async () => {
    timing.maxMs = 30;
    const x = view();
    await act(async () => { await x.result.current.ask('first words', { map: [] }); });
    expect(heldCount()).toBe(1);
    state = 'failed';
    let got: { outcome: string; values?: unknown } | null = null;
    await act(async () => { got = (await x.result.current.check()) as never; });
    expect(got).toMatchObject({ outcome: 'failed' });
    expect(got!.values).toBeUndefined();
    expect(heldCount()).toBe(0);
  });

  it('a press that finds an ask already out at its place continues it and says so: its result is not of the prompt it made', async () => {
    timing.maxMs = 30;
    const y = view('other-scope');
    // another tab stored an ask at this place and this view has not heard of it yet (no storage event): the press finds it in the store
    const stored: ScriptAsk = { askId: askIdOf({ compId: 'c1', path: null, realm: R1, owner: 'fp1' }), compId: 'c1', path: null, realm: R1, owner: 'fp1', sessionId: 's1', turnId: 't1', phase: 'wait', sentAt: Date.now(), createKey: 'ck-theirs', turnKey: 'tk-theirs' };
    expect(await putScriptAsk(stored, null)).toBe('ok');
    state = 'completed';
    let other: { outcome: string; joined: boolean; values?: unknown } | null = null;
    await act(async () => { other = (await y.result.current.ask('second words', { map: [] })) as never; });
    expect(other).toMatchObject({ outcome: 'done', joined: true });
    // an ask of another tab: this tab holds nothing hidden for it, and what this press hid is of no ask
    expect(other!.values).toBeUndefined();
    // it sent nothing of its own: no session, no turn
    expect(sessions).toBe(0);
    expect(turns()).toBe(0);
    // a press at a place that holds nothing makes its own ask: not joined
    let own: { outcome: string; joined: boolean } | null = null;
    await act(async () => { own = (await y.result.current.ask('third words')) as never; });
    expect(own).toMatchObject({ outcome: 'done', joined: false });
    expect(sessions).toBe(1);
  });
});
