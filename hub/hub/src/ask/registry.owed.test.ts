// a dock engine asked for another server while busy moves on its own only once it holds nothing the
// person wrote. Here the busy send's create is refused by the agent: the message row (its words and its file, kept for Edit and Retry)
// stays on the engine, which is neither ended nor moved and sends nothing again on its own; once the person starts a new conversation
// the owed move happens. Over the real registry and engine, the scripted agent refusing the first create.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Data from './data';

const creates: string[] = [];
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const { FakeAgent } = await import('./fake');
  const { realClock } = await import('./engine');
  return {
    ...real,
    liveIO: (t: { container: { id: string; server_name?: string } }) => {
      const fake = new FakeAgent({ account: '64f0c0ffee0000000000c0de', pace: 10, realms: ['f1f1f1f1f1f1f1f1f1f1f1f1'], createRefuse: { status: 403, code: 'forbidden' } } as any, realClock);
      const io = real.withFixtureDest(fake, t.container.id) as any;
      const create = io.create?.bind(io);
      if (create) io.create = (...a: unknown[]) => { creates.push(t.container.server_name ?? ''); return create(...a); };
      return io;
    },
  };
});

import { targetOf, type Slot } from './engine';
import * as A from './attach';
import { slot as BASE, world, type World } from './accept/env';

const R = await import('./registry');
const X = 'node-amber';
const Y = 'node-orca';
const sX: Slot = { ...BASE, server: X };
const sY: Slot = { ...BASE, server: Y };
const tX = targetOf(sX.project, sX.computer, X);
const tY = targetOf(sY.project, sY.computer, Y);
const settle = async (n = 40) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 5)); };

let w: World | null = null;
afterEach(() => { R.resetRegistryForTests(); w?.dispose(); w = null; creates.length = 0; });

describe('an owed server move and a message the agent refused', () => {
  it('keeps the refused message (words and file) on its engine, sends nothing again, and moves once the person starts over', async () => {
    w = world();
    const moves = renderHook(() => R.useOwedMoves());
    // The dock: asks for its engine again each time it is told of a move (AskPanel's memo on useOwedMoves).
    let dock = R.engineFor(sX, tX);
    const eng = dock;
    await settle();
    expect(eng.canSend()).toBe(true);
    eng.attach([A.prepare('t1', 'note.txt', new TextEncoder().encode('keep me'), () => '')], 'look');
    dock = R.engineFor(sY, tY);
    expect(dock, 'busy (a draft file): kept, the move owed').toBe(eng);
    expect(eng.send('hello there')).toBe(true);
    await act(async () => { await settle(); });
    const rows = Object.values((eng as any).conv.users) as Array<{ state: string; text: string; files?: unknown[]; imgs?: unknown[] }>;
    expect(rows.map((u) => [u.state, u.text]), 'the agent refused the create: the message is not sent').toEqual([['notSent', 'hello there']]);
    expect((rows[0]!.files?.length ?? 0) + (rows[0]!.imgs?.length ?? 0), 'its file is kept with it for Retry').toBe(1);
    const rev = moves.result.current;
    expect(rev, 'the dock is not told: the engine holds the person\'s message').toBe(0);
    dock = R.engineFor(sY, tY);
    expect(dock, 'not moved').toBe(eng);
    expect(eng.getSnapshot().phase).not.toBe('ended');
    await act(async () => { await settle(); });
    expect(creates, 'nothing sent again on its own').toEqual([X]);
    // The person starts over: the engine holds nothing now, the dock is told and the move happens.
    act(() => { eng.newConversation(); });
    expect(moves.result.current, 'told once').toBe(rev + 1);
    dock = R.engineFor(sY, tY);
    expect(dock, 'moved').not.toBe(eng);
    expect(dock.slot.server).toBe(Y);
  });
});
