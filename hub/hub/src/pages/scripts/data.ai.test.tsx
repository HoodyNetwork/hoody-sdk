// Vitest on the live ask hook (data.ts, useAiTurn) over core's real request path, a fake agent standing in for the network: an
// ask belongs to the store, not to the hook instance that made it, so a press made again at its place (a view opened again, a
// second press, another hook instance) continues it instead of sending another turn, whatever words the new press carries (C9).
// The answer is taken by one claim; the warned close ends the ask the same way, whichever comes first.
import { renderHook } from '@app/testing';
import { dropScriptAsks, readScriptAsks } from '@core';
import { AGENT, boot, calls, onFetch, R1, TARGET, type Call, type Reply } from '@core/test/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ computer: 'c1' }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => ({ project: { id: 'p1' }, container: { id: world.computer, server_name: 'sv1' } }) };
});

import { useAiTurn } from './data';
import { forgetRuns, timing } from './writer';

const route = (c: Call): string => new URL(c.url).pathname.replace('/api/v1/agent', '');
const sent = (method: string, path: string): Call[] => calls.filter((c) => c.url.startsWith(AGENT) && c.method === method && route(c) === path);
const STARTED = { realm_selector: R1, computer_id: 'c1', owner_fingerprint: 'fp1', tool_ceiling: 'script-writer' };
const ANSWER = 'Summary: ok\n```ts\nreturn 1;\n```';
let receipt: Record<string, unknown> = { turn_id: 't1', state: 'dispatched' };
let sessions = 0;
const fake = (): void => {
  sessions = 0;
  onFetch((c): Reply => {
    const p = route(c);
    if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: 's1', started: STARTED } }; }
    if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
    if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: receipt };
    if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } };
    return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
  });
};
const vars = (text: string, extra: Record<string, unknown> = {}) => ({ compId: 'c1', path: null as string | null, text, realm: R1, owner: 'fp1', ...extra });
const place = { compId: 'c1', path: null as string | null, realm: R1, owner: 'fp1' };

describe('the live ask hook', () => {
  beforeEach(async () => {
    boot({ realm: R1 });
    forgetRuns();
    const stored = readScriptAsks();
    if (Array.isArray(stored)) await dropScriptAsks(stored);
    world.computer = TARGET.container.id;
    receipt = { turn_id: 't1', state: 'dispatched' };
    Object.assign(timing, { everyMs: 5, wakeMs: 2, maxMs: 40 });
    fake();
  });

  it('an ask left pending is open at its place, and a press there continues it: one session, one turn, whatever the new words', async () => {
    const { result } = renderHook(() => useAiTurn());
    expect((await result.current.mutateAsync(vars('first words'))).outcome).toBe('pending');
    expect(result.current.open(place)).toBe(true);
    expect(result.current.open({ ...place, path: 'a.ts' })).toBe(false);
    expect(result.current.open({ ...place, realm: 'bbbbbbbbbbbbbbbbbbbbbbb2' })).toBe(false);
    expect(result.current.open({ ...place, owner: 'fp2' })).toBe(false);
    receipt = { turn_id: 't1', state: 'completed' };
    const got = await result.current.mutateAsync(vars('other words'));
    expect(got).toEqual({ outcome: 'done', data: { reply: ANSWER } });
    expect(sessions).toBe(1);
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
    expect(sent('POST', '/sessions/s1/turns')[0]!.body).toEqual({ text: 'first words' });
    // the ask stays open until the view that shows the place claims the answer
    expect(result.current.open(place)).toBe(true);
    expect(await result.current.claim(got)).toBe(true);
    expect(result.current.open(place)).toBe(false);
  });

  it('a view opened again (a new hook instance) finds the same ask and reads it with Check again', async () => {
    const first = renderHook(() => useAiTurn());
    expect((await first.result.current.mutateAsync(vars('first words'))).outcome).toBe('pending');
    first.unmount();
    const again = renderHook(() => useAiTurn());
    expect(again.result.current.open(place)).toBe(true);
    receipt = { turn_id: 't1', state: 'completed' };
    expect((await again.result.current.check(place))?.outcome).toBe('done');
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
  });

  it('Check again while another computer is shown reads nothing', async () => {
    const { result } = renderHook(() => useAiTurn());
    await result.current.mutateAsync(vars('first words'));
    calls.length = 0;
    world.computer = 'c2';
    const other = renderHook(() => useAiTurn());
    expect(await other.result.current.check(place)).toBeNull();
    expect(calls.filter((c) => c.url.startsWith(AGENT))).toHaveLength(0);
  });

  it('the warned close frees the place: the next press is a new ask with a new session', async () => {
    const { result } = renderHook(() => useAiTurn());
    await result.current.mutateAsync(vars('first words'));
    await result.current.discard(place);
    expect(result.current.open(place)).toBe(false);
    receipt = { turn_id: 't1', state: 'completed' };
    expect((await result.current.mutateAsync(vars('second words'))).outcome).toBe('done');
    expect(sessions).toBe(2);
  });

  it('a view that goes away while its answer is being read leaves the finished answer for the view that comes back', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    onFetch(async (c): Promise<Reply> => {
      const p = route(c);
      if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: 's1', started: STARTED } }; }
      if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
      if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: { turn_id: 't1', state: 'completed' } };
      if (c.method === 'GET' && p === '/sessions/s1/transcript') { await gate; return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } }; }
      return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
    });
    const first = renderHook(() => useAiTurn());
    const asked = first.result.current.mutateAsync(vars('first words'));
    await vi.waitFor(() => expect(sent('GET', '/sessions/s1/transcript').length).toBeGreaterThan(0));
    first.unmount();
    const again = renderHook(() => useAiTurn());
    expect(again.result.current.open(place)).toBe(true);
    release();
    expect((await asked).outcome).toBe('done');
    // the first view is gone and nobody took the answer: the ask is still stored, and is read again
    expect(again.result.current.open(place)).toBe(true);
    const kept = await again.result.current.check(place);
    expect(kept).toEqual({ outcome: 'done', data: { reply: ANSWER } });
    // reading it again does not take it: the view that shows the place claims it
    expect(again.result.current.open(place)).toBe(true);
    expect(await again.result.current.claim(kept!)).toBe(true);
    expect(again.result.current.open(place)).toBe(false);
    expect(await again.result.current.check(place)).toBeNull();
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
  });

  it('a view that took the wait over gets the answer, and the view that left it does not: one delivery, then the next ask is a fresh session', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    onFetch(async (c): Promise<Reply> => {
      const p = route(c);
      if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: `s${sessions}`, started: STARTED } }; }
      if (c.method === 'POST' && /\/sessions\/s\d+\/turns$/.test(p)) return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
      if (c.method === 'GET' && /\/turns\/t1$/.test(p)) return { status: 200, body: { turn_id: 't1', state: 'completed' } };
      if (c.method === 'GET' && /\/transcript$/.test(p)) { await gate; return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } }; }
      return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
    });
    const first = renderHook(() => useAiTurn());
    const asked = first.result.current.mutateAsync(vars('first words'));
    await vi.waitFor(() => expect(sent('GET', '/sessions/s1/transcript').length).toBeGreaterThan(0));
    // the first view left (it shows nothing of this place now); another opens the place and joins the wait with a Check again
    first.unmount();
    const second = renderHook(() => useAiTurn());
    const joined = second.result.current.check(place);
    release();
    const mine = await joined;
    expect(mine).toEqual({ outcome: 'done', data: { reply: ANSWER } });
    expect(await asked).toBe(mine);
    // the departing view does not claim; the one that showed the answer does, once
    expect(second.result.current.open(place)).toBe(true);
    expect(await second.result.current.claim(mine!)).toBe(true);
    expect(await first.result.current.claim(mine!)).toBe(false);
    expect(second.result.current.open(place)).toBe(false);
    expect(await second.result.current.mutateAsync(vars('new words'))).toEqual({ outcome: 'done', data: { reply: ANSWER } });
    expect(sessions).toBe(2);
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
  });

  it('two Check again calls that join one wait hold the same answer: the first to claim it delivers it, the second is refused', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    onFetch(async (c): Promise<Reply> => {
      const p = route(c);
      if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: 's1', started: STARTED } }; }
      if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
      if (c.method === 'GET' && p === '/sessions/s1/turns/t1') return { status: 200, body: { turn_id: 't1', state: 'completed' } };
      if (c.method === 'GET' && p === '/sessions/s1/transcript') { await gate; return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } }; }
      return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
    });
    const x = renderHook(() => useAiTurn());
    const y = renderHook(() => useAiTurn());
    const asked = x.result.current.mutateAsync(vars('first words'));
    await vi.waitFor(() => expect(sent('GET', '/sessions/s1/transcript').length).toBeGreaterThan(0));
    const c1 = x.result.current.check(place);
    const c2 = y.result.current.check(place);
    release();
    const [a1, a2] = [await c1, await c2];
    expect(a1).toBe(a2);
    expect(await asked).toBe(a1);
    expect(await x.result.current.claim(a1!)).toBe(true);
    expect(await y.result.current.claim(a2!)).toBe(false);
    expect(x.result.current.open(place)).toBe(false);
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
  });

  it('a warned close by any hook instance ends the ask for every instance, and leaves other places alone', async () => {
    const x = renderHook(() => useAiTurn());
    const y = renderHook(() => useAiTurn());
    await x.result.current.mutateAsync(vars('first words'));
    await x.result.current.mutateAsync(vars('other script', { path: 'a.ts' }));
    expect(y.result.current.open(place)).toBe(true);
    await y.result.current.discard(place);
    expect(x.result.current.open(place)).toBe(false);
    expect(x.result.current.open({ ...place, path: 'a.ts' })).toBe(true);
  });

  it('an answer that comes in after the warned close is not delivered: its run is over, nothing is sent after the close, and the claim is refused', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    onFetch(async (c): Promise<Reply> => {
      const p = route(c);
      if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: 's1', started: STARTED } }; }
      if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
      if (c.method === 'GET' && p === '/sessions/s1/turns/t1') { await gate; return { status: 200, body: { turn_id: 't1', state: 'completed' } }; }
      if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } };
      return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
    });
    const x = renderHook(() => useAiTurn());
    const y = renderHook(() => useAiTurn());
    const asked = x.result.current.mutateAsync(vars('first words'));
    await vi.waitFor(() => expect(sent('GET', '/sessions/s1/turns/t1').length).toBeGreaterThan(0));
    await y.result.current.discard(place);
    release();
    expect(await asked).toEqual({ outcome: 'stale', code: 'SUPERSEDED' });
    expect(x.result.current.open(place)).toBe(false);
    expect(sent('GET', '/sessions/s1/transcript')).toHaveLength(0);
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
  });

  it('a press at a place that holds an answer no view took gets that answer: no second session, no second turn', async () => {
    const first = renderHook(() => useAiTurn());
    receipt = { turn_id: 't1', state: 'completed' };
    const asked = await first.result.current.mutateAsync(vars('first words'));
    // nobody claimed it (the view left): the ask is still stored, and a press there reads it again
    expect(first.result.current.open(place)).toBe(true);
    const again = await first.result.current.mutateAsync(vars('new words'));
    expect(again).toEqual(asked);
    expect(first.result.current.joined(asked)).toBe(false);
    expect(first.result.current.joined(again)).toBe(true);
    expect(sessions).toBe(1);
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
    expect(await first.result.current.claim(again)).toBe(true);
    expect(await first.result.current.claim(asked)).toBe(false);
    expect(first.result.current.open(place)).toBe(false);
  });

  it('a press while the first press is being driven joins it, whatever the new words: one answer, one session, one turn', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    onFetch(async (c): Promise<Reply> => {
      const p = route(c);
      if (c.method === 'GET' && p === '/version') return { status: 200, body: { api_version: '1', session_protocol_version: 3, capabilities: ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding', 'script_writer'].map((name) => ({ name, supported: true, available: true })) } };
    if (c.method === 'POST' && p === '/sessions') { sessions++; return { status: 201, body: { session_id: 's1', started: STARTED } }; }
      if (c.method === 'POST' && p === '/sessions/s1/turns') return { status: 202, body: { turn_id: 't1', state: 'accepted' } };
      if (c.method === 'GET' && p === '/sessions/s1/turns/t1') { await gate; return { status: 200, body: { turn_id: 't1', state: 'completed' } }; }
      if (c.method === 'GET' && p === '/sessions/s1/transcript') return { status: 200, body: { messages: [{ role: 'user', blocks: [{ kind: 'text', text: 'x' }] }, { role: 'assistant', blocks: [{ kind: 'text', text: ANSWER }] }] } };
      return { status: 200, text: '', headers: { 'content-type': 'text/event-stream' } };
    });
    const { result } = renderHook(() => useAiTurn());
    const HIDDEN = { map: [{ ph: '__HOODY_SECRET_0__', value: 'hidden-value-1' }] };
    const first = result.current.mutateAsync({ ...vars('first words'), values: HIDDEN });
    await vi.waitFor(() => expect(sent('GET', '/sessions/s1/turns/t1').length).toBeGreaterThan(0));
    const second = result.current.mutateAsync({ ...vars('other words'), values: { map: [] } });
    release();
    const a1 = await first;
    const a2 = await second;
    expect(a2).toEqual(a1);
    expect(a1.outcome).toBe('done');
    // the press that made the ask is not told it joined; the press that found it out is, and both name the same ask
    expect(result.current.joined(a1)).toBe(false);
    expect(result.current.joined(a2)).toBe(true);
    // both name the same ask, so both read what the first press hid (the joining press's own values were never held)
    expect(result.current.valuesOf(a1)).toBe(HIDDEN);
    expect(result.current.valuesOf(a2)).toBe(HIDDEN);
    // either answer claims the one stored record, once; the claim ends the ask and deletes what was hidden for it
    expect(await result.current.claim(a2)).toBe(true);
    expect(await result.current.claim(a1)).toBe(false);
    expect(result.current.valuesOf(a1)).toBeUndefined();
    expect(result.current.valuesOf(a2)).toBeUndefined();
    expect(sessions).toBe(1);
    expect(sent('POST', '/sessions/s1/turns')).toHaveLength(1);
  });

  it('a store that cannot be read sends nothing: not sent, with its own code', async () => {
    // storage the browser refuses to read: whether an earlier ask is out cannot be known
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => undefined, removeItem: () => undefined });
    const { result } = renderHook(() => useAiTurn());
    expect(await result.current.mutateAsync(vars('x'))).toEqual({ outcome: 'not_sent', code: 'NO_RECORD' });
    vi.unstubAllGlobals();
    expect(calls.filter((c) => c.url.startsWith(AGENT))).toHaveLength(0);
  });

  it('an ask for another computer than the one shown is not sent', async () => {
    world.computer = 'c2';
    const { result } = renderHook(() => useAiTurn());
    expect(await result.current.mutateAsync(vars('x'))).toEqual({ outcome: 'not_sent', code: 'NOT_WIRED' });
    expect(calls.filter((c) => c.url.startsWith(AGENT))).toHaveLength(0);
  });
});
