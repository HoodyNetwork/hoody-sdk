// Workflows' detail read through core: the pause state is the authority. An older gateway
// answers a paused definition read as a plain 400, so most tests answer it that way: the pause read decides. A
// resume (a new pause generation) reads the definition again; Refresh reads every key again. The typed daemon_paused
// refusal (503) is answered by `refuse`, also while the pause read says running (the agent paused between them).
import { act, renderHook } from '@testing-library/react';
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle, R1 } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAUSE_POLL_MS, refreshWorkflows, useWorkflowDetail, type DetailKey } from './data';

const path = (u: string) => new URL(u).pathname;
const realmOf = (u: string) => new URL(u).searchParams.get('realm');
const pauseCalls = () => calls.filter((c) => path(c.url).endsWith('/agent/pause'));
const defCalls = () => calls.filter((c) => path(c.url).endsWith('/agent/workflows/ask'));

const DEF = { name: 'ask', steps: { q: { type: 'tool', tool: 'ask_question_to_user', options: [{ title: 'Yes', steps: [{ id: 'go' }] }] }, go: { type: 'bash' } } };
let pause: { paused: boolean; since_ms: number; gen: number } | 'fail' | 'unreadable' = { paused: false, since_ms: 0, gen: 1 };
let refuse: boolean | 'fail' | 'once' = false;
// A pause reply held until released, so a render sees the read in flight (isFetching) before its answer lands.
let held: Promise<void> | null = null;

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  pause = { paused: false, since_ms: 0, gen: 1 };
  refuse = false;
  held = null;
  onFetch((c) => {
    const p = path(c.url);
    const pauseReply = () => (pause === 'fail' ? { status: 500, body: { error: 'boom', code: 'internal' } } : { status: 200, body: pause === 'unreadable' ? { paused: 'no' } : pause });
    if (p.endsWith('/agent/pause')) return held ? held.then(pauseReply) : pauseReply();
    if (p.endsWith('/agent/workflows/ask')) {
      if (refuse === 'fail') return { status: 500, body: { error: 'boom', code: 'internal' } };
      if (refuse === 'once') { refuse = false; return { status: 503, body: { error: 'agents are paused', code: 'daemon_paused' } }; }
      if (refuse === true) return { status: 503, body: { error: 'agents are paused', code: 'daemon_paused' } };
      // An older gateway: a paused gated tool run comes back as a plain 400.
      if (typeof pause === 'object' && pause.paused) return { status: 400, body: { error: 'the daemon is paused', code: 'bad_request' } };
      return { status: 200, body: { output: JSON.stringify(DEF), is_error: false } };
    }
    return { status: 404, body: { error: 'not here', code: 'not_found' } };
  });
});

const KEY: DetailKey = { name: 'ask', realm: R1 };
async function mount(key: DetailKey | null = KEY) {
  const h = renderHook(() => useWorkflowDetail(key), { wrapper: CoreQueryProvider });
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
  return h;
}
const flush = async () => {
  for (let i = 0; i < 10; i++) await act(async () => { await settle(); });
};

describe('workflows detail: the pause state decides', () => {
  it('while a detail is open the pause state is polled every 10 s', async () => {
    const h = await mount();
    const q = queryClient.getQueryCache().findAll().find((x) => JSON.stringify(x.queryKey).includes('pause'));
    expect(q?.observers.map((o) => o.options.refetchInterval)).toEqual([PAUSE_POLL_MS]);
    expect(PAUSE_POLL_MS).toBe(10_000);
    h.unmount();
  });

  it('running: reads the pause state without a realm, then the definition in the workflow\'s realm', async () => {
    const h = await mount();
    expect(h.result.current).toMatchObject({ state: 'ready' });
    if (h.result.current.state === 'ready') expect([...h.result.current.answers]).toEqual([['q', [{ title: 'Yes', to: ['go'] }]]]);
    expect(pauseCalls().map((c) => realmOf(c.url))).toEqual([null]);
    expect(defCalls().map((c) => realmOf(c.url))).toEqual([R1]);
  });

  it('paused: the paused state, and the definition is not read (it would be refused)', async () => {
    pause = { paused: true, since_ms: 1, gen: 2 };
    const h = await mount();
    expect(h.result.current.state).toBe('paused');
    expect(defCalls()).toHaveLength(0);
  });

  it('the gateway\'s plain 400 while paused reads as paused once the pause state says so, never as failed', async () => {
    const h = await mount();
    expect(h.result.current.state).toBe('ready');
    pause = { paused: true, since_ms: 1, gen: 2 };
    await act(async () => refreshWorkflows());
    await flush();
    expect(h.result.current.state).toBe('paused');
  });

  it('after a resume, Check again reads the pause state and then the definition again', async () => {
    pause = { paused: true, since_ms: 1, gen: 2 };
    const h = await mount();
    expect(h.result.current.state).toBe('paused');
    pause = { paused: false, since_ms: 0, gen: 3 };
    await act(async () => {
      if (h.result.current.state === 'paused') h.result.current.recheck();
    });
    await flush();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(1);
  });

  it('a pause and resume seen by the pause poll (no Refresh, the answer still fresh) reads the definition again', async () => {
    const h = await mount();
    expect(defCalls()).toHaveLength(1);
    // The poll: the pause read alone, as its interval re-reads it.
    const poll = async () => {
      await act(async () => {
        await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('pause') });
      });
      await flush();
    };
    pause = { paused: true, since_ms: 1, gen: 2 };
    await poll();
    expect(h.result.current.state).toBe('paused');
    pause = { paused: false, since_ms: 0, gen: 3 };
    await poll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('Refresh reads the pause state and the open definition again', async () => {
    await mount();
    const [p, d] = [pauseCalls().length, defCalls().length];
    await act(async () => refreshWorkflows());
    await flush();
    expect(pauseCalls().length).toBe(p + 1);
    expect(defCalls().length).toBe(d + 1);
  });

  it('a failed pause read does not block the definition', async () => {
    pause = 'fail';
    const h = await mount();
    expect(h.result.current.state).toBe('ready');
  });

  it('nothing open: nothing is read', async () => {
    await mount(null);
    expect(calls).toHaveLength(0);
  });
});

describe('workflows detail: a typed daemon_paused refusal while the pause read said running', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const poll = async () => {
    await act(async () => {
      await queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('pause') });
    });
    await flush();
  };
  const raced = async () => {
    refuse = true;
    const h = await mount();
    expect(h.result.current.state).toBe('paused');
    expect(defCalls()).toHaveLength(1);
    return h;
  };

  it('Check again after the resume reads the definition again, though the pause read never saw the pause', async () => {
    const h = await raced();
    refuse = false;
    await act(async () => {
      if (h.result.current.state === 'paused') h.result.current.recheck();
    });
    await flush();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('the pause poll alone (no Check again) reads the definition again once it says running', async () => {
    const h = await raced();
    refuse = false;
    await poll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('refused again: still paused, one definition read per pause answer and none without one', async () => {
    const h = await raced();
    await poll();
    expect(h.result.current.state).toBe('paused');
    expect(defCalls()).toHaveLength(2);
    await flush();
    expect(defCalls()).toHaveLength(2);
    await poll();
    expect(defCalls()).toHaveLength(3);
    refuse = false;
    await poll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(4);
  });

  it('a pause answer that says paused does not read the definition; the resume after it does', async () => {
    const h = await raced();
    pause = { paused: true, since_ms: 1, gen: 2 };
    await poll();
    expect(h.result.current.state).toBe('paused');
    expect(defCalls()).toHaveLength(1);
    refuse = false;
    pause = { paused: false, since_ms: 0, gen: 3 };
    await poll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('any other failure is not read again by the pause poll (it keeps its own Try again)', async () => {
    refuse = 'fail';
    const h = await mount();
    expect(h.result.current.state).toBe('failed');
    expect(defCalls()).toHaveLength(1);
    await poll();
    expect(h.result.current.state).toBe('failed');
    expect(defCalls()).toHaveLength(1);
  });

  it('a clock that does not move (refusal and answer in the same millisecond) still reads the definition again', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const h = await raced();
    refuse = false;
    await act(async () => {
      if (h.result.current.state === 'paused') h.result.current.recheck();
    });
    await flush();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('an unreadable pause answer reads nothing; the next answer saying running does', async () => {
    const h = await raced();
    refuse = false;
    pause = 'unreadable';
    await poll();
    expect(defCalls()).toHaveLength(1);
    pause = { paused: false, since_ms: 0, gen: 1 };
    await poll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('a failed pause read is no answer: it reads nothing, the next answer saying running does', async () => {
    const h = await raced();
    refuse = false;
    pause = 'fail';
    await poll();
    expect(defCalls()).toHaveLength(1);
    pause = { paused: false, since_ms: 0, gen: 1 };
    await poll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('Refresh where the definition is refused again and the pause answer says running, landing together, still recovers', async () => {
    const h = await raced();
    refuse = 'once';
    await act(async () => refreshWorkflows());
    await flush();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(3);
  });

  // The poll with the read in flight drawn first (its reply held), as a slow network shows it.
  const slowPoll = async () => {
    let release = () => {};
    held = new Promise<void>((r) => { release = r; });
    let done: Promise<unknown> = Promise.resolve();
    await act(async () => {
      done = queryClient.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('pause') });
    });
    await flush();
    held = null;
    await act(async () => { release(); await done; });
    await flush();
  };

  it('a failed pause read seen in flight is no answer either: it reads nothing', async () => {
    const h = await raced();
    refuse = false;
    pause = 'fail';
    await slowPoll();
    expect(defCalls()).toHaveLength(1);
    pause = { paused: false, since_ms: 0, gen: 1 };
    await slowPoll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });

  it('the poll under a clock that does not move still reads the definition again once the read is seen to end', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    const h = await raced();
    refuse = false;
    await slowPoll();
    expect(h.result.current.state).toBe('ready');
    expect(defCalls()).toHaveLength(2);
  });
});
