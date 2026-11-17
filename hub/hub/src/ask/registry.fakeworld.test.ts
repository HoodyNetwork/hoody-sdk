// In the fixtures preview a chat started from /ai/new opened as "This chat is gone or not
// reachable". The start ran on the dock engine's scripted agent, and the pinned engine the chat page opens took a new scripted agent
// that never made the session. In fixtures every engine of one slot reaches the same agent.
import type * as Core from '@core';
import { boot, R1, TARGET, UID } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentIO } from './data';
import type { AskEngine, Slot } from './engine';
import type * as Fake from './fake';
import * as L from './logic';

const made = vi.hoisted(() => [] as Fake.FakeAgent[]);
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), fixtureModeActive: () => true }));
vi.mock('./fake', async (orig) => {
  const m = await orig<typeof Fake>();
  class Counted extends m.FakeAgent {
    constructor(...a: ConstructorParameters<typeof m.FakeAgent>) { super(...a); made.push(this); }
  }
  return { ...m, FakeAgent: Counted };
});
const R = await import('./registry');
const { computerHandle } = await import('@core');

const C = TARGET.container.id;
const at = { project: TARGET.project.id, id: C, name: 'atlas' };
const slot: Slot = { account: UID, project: at.project, computer: C, realm: R1, name: at.name };
// The engine's io (behind its journal guard): reads pass through to the scripted agent.
const ioOf = (e: AskEngine): AgentIO => (e as unknown as { io: AgentIO }).io;

beforeEach(() => { boot({ realm: R1 }); made.length = 0; });
afterEach(() => { R.resetRegistryForTests(); });

describe('the fixtures preview: one scripted agent per slot', () => {
  it('a chat the dock engine started is found by the pinned engine the chat page opens', async () => {
    R.engineFor(slot, TARGET);
    expect(made, 'the dock engine made the slot\'s scripted agent').toHaveLength(1);
    const { session_id: sid } = await made[0]!.create(L.createBody(R1, C)!, 'k-start-1', R1) as { session_id: string };
    const h = R.openRef(UID, { computer: computerHandle(at), realm: R1, sid }, at);
    expect(h, 'the chat opens').not.toBeNull();
    const pinned = h!.current();
    expect(made, 'the pinned engine reaches the same agent, not a new one').toHaveLength(1);
    const st = await ioOf(pinned).state(sid, R1).then((v) => v, (e: unknown) => e) as { status?: number; session_id?: string };
    expect(st.status, 'not the uniform 404 of an unknown session').toBeUndefined();
    expect(st.session_id).toBe(sid);
    h!.release();
  });

  it('the agent is kept for the slot (a dock engine made again reaches it) and forgotten with the registry', () => {
    const first = R.engineFor(slot, TARGET);
    first.end();
    const again = R.engineFor(slot, TARGET);
    expect(again, 'an ended engine is made again').not.toBe(first);
    expect(made, 'on the same scripted agent').toHaveLength(1);
    R.resetRegistryForTests();
    R.engineFor(slot, TARGET);
    expect(made, 'a new one after the registry is forgotten').toHaveLength(2);
  });
});
