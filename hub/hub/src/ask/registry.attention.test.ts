// registry.attention.test.ts: the AI dot ORs in the shell observer's gates in chats no engine holds (anyWaiting), and the
// last holder letting go of a running chat leaves a note (core chat-attention) that opening the chat clears.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

type Hang = Record<string, boolean>;
type Held = Array<() => void>;
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    // One agent per computer for the whole test; `__hang` makes the named agent calls never answer (a request in flight).
    liveIO: (t: { container: { id: string } }) => {
      const g = globalThis as { __fake?: InstanceType<typeof FakeAgent>; __fakeOpts?: object; __hang?: Hang; __held?: Held; __fail?: Record<string, unknown> };
      g.__fake ??= new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'], ...g.__fakeOpts }, realClock);
      const agent = g.__fake;
      const wrapped = new Proxy(agent, {
        get(target, p) {
          const v = (target as any)[p];
          if (typeof v !== 'function') return v;
          // A held call is made, and its answer given, when the test lets it go (releaseHang).
          // A failed call never reaches the agent: the request may or may not have left (the answer is a pending-type fault).
          if (g.__fail && String(p) in g.__fail) return () => Promise.reject(g.__fail![String(p)]);
          return (...a: unknown[]) => (g.__hang?.[String(p)] ? new Promise((res, rej) => { (g.__held ??= []).push(() => { Promise.resolve(v.apply(target, a)).then(res, rej); }); }) : v.apply(target, a));
        },
      });
      return real.withFixtureDest(wrapped, t.container.id);
    },
  };
});

import './data';
import { chatNotes, computerHandle } from '@core';
import type { AskEngine } from './engine';
import { scripts } from './fake';
import { resetChatAttentionForTests, seedAttentionForTests } from '@core/chat-attention';
import type * as Reg from './registry';
import { ACCOUNT, REALM, slot, world, type World } from './accept/env';

let w: World | null = null;
// The fake agent's pace, the engines' timers and tick() run on a fake clock that also keeps the real pace
// (shouldAdvanceTime): tick(ms) moves it by ms at once, so a wait is never a sleep that host load stretches; vi.waitFor
// moves it too. setImmediate and microtasks stay real.
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'], shouldAdvanceTime: true }); });
afterEach(async () => {
  const R = await import('./registry');
  R.resetRegistryForTests();
  vi.restoreAllMocks();
  w?.dispose();
  w = null;
  const g = globalThis as { __fake?: unknown; __fakeOpts?: unknown; __hang?: unknown };
  delete g.__fake;
  delete g.__fakeOpts;
  delete g.__hang;
  delete (g as { __fail?: unknown }).__fail;
  delete (g as { __held?: unknown }).__held;
  vi.useRealTimers();
});
const opts = (o: object): void => { (globalThis as { __fakeOpts?: object }).__fakeOpts = o; };

const AT = { project: slot.project, id: slot.computer, name: 'atlas' };
const HANDLE = computerHandle(AT);
const target = { project: { id: slot.project }, container: { id: slot.computer, server_name: 'atlas' } } as any;
const dir = { resolve: (h: string) => (h === HANDLE ? AT : null), handleOf: (id: string) => (id === AT.id ? HANDLE : null) };
const refOf = (sid: string) => ({ computer: HANDLE, realm: REALM, sid });
const tick = (ms = 60) => vi.advanceTimersByTimeAsync(ms);
const sidOf = (e: AskEngine): string => e.record?.s ?? '';

/** The dock's engine with a conversation whose first message was sent and whose turn keeps running (a held script). */
async function dockRunning(): Promise<{ R: typeof Reg; eng: AskEngine; sid: string }> {
  opts({ script: [[scripts.dashboard[0], { k: 'hold' }]] });
  w = world();
  const R = await import('./registry');
  R.setComputerDirectory(dir);
  const eng = R.engineFor(slot, target);
  await vi.waitFor(() => expect(eng.getSnapshot().phase).toBe('ready'), { timeout: 5000 });
  eng.send('Build me a dashboard');
  await vi.waitFor(() => {
    expect(sidOf(eng)).not.toBe('');
    expect(Object.values(eng.getSnapshot().conv.users).every((u) => u.state === 'sent')).toBe(true);
  }, { timeout: 8000 });
  return { R, eng, sid: sidOf(eng) };
}

describe('chat attention (core chat-attention.ts) through the real registry', () => {
  afterEach(() => resetChatAttentionForTests());

  it('anyWaiting ORs in a gate the shell observer read in a chat no engine holds, for its own account only', async () => {
    w = world();
    const R = await import('./registry');
    expect(R.anyWaiting(ACCOUNT)).toBe(false);
    seedAttentionForTests({ account: ACCOUNT, computer: slot.computer, gates: [{ sid: 's-elsewhere', realm: REALM }] });
    expect(R.anyWaiting(ACCOUNT)).toBe(true);
    expect(R.anyWaiting('64f0c0ffee00000000000bad')).toBe(false);
    seedAttentionForTests({ account: ACCOUNT, computer: slot.computer, gates: [] });
    expect(R.anyWaiting(ACCOUNT)).toBe(false);
  });

  it('a gate in the chat an engine holds is that engine\'s to show: the observer\'s copy alone does not light the dot', async () => {
    const { R, eng, sid } = await dockRunning();
    expect(eng.getSnapshot().gate).toBeNull();
    seedAttentionForTests({ account: ACCOUNT, computer: slot.computer, gates: [{ sid, realm: REALM }] });
    expect(R.anyWaiting(ACCOUNT)).toBe(false);
  });

  it('the last holder letting go of a running chat notes it; opening it again clears the note', async () => {
    const { R, sid } = await dockRunning();
    const h = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(h).not.toBeNull();
    await vi.waitFor(() => expect(h.current().getSnapshot().status).not.toBeNull(), { timeout: 5000 });
    await tick(200);
    h.release();
    expect(chatNotes(ACCOUNT).map((n) => [n.computer, n.realm, n.sid, n.last])).toEqual([[slot.computer, REALM, sid, 'running']]);
    const again = R.openRef(ACCOUNT, refOf(sid), AT)!;
    expect(chatNotes(ACCOUNT)).toEqual([]);
    again.release();
  });
});
