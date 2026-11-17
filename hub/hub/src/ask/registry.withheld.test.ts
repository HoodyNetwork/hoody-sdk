// The dock engine, a pinned chat and the activity read made on server X
// keep their state when the computer's row withholds the server (the same engine, not ended: its conversation, draft files and
// unknown outcomes stay), but none of them sends a new request to X, credentials included; once a row names X again the same
// engine goes on. Over the real liveIO and core (the agent answers every request with an empty body).
import type * as Core from '@core';
import { noteComputerRows } from '@core';
import { boot, calls, onFetch, R1, TARGET, UID, type Reply } from '@core/test/env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Slot } from './engine';
import * as A from './attach';

vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), fixtureModeActive: () => false }));
const R = await import('./registry');

const X = TARGET.container.server_name!;
const C = TARGET.container.id;
const row = (server_name: unknown) => ({ id: C, project_id: TARGET.project.id, server_name });
const slotX: Slot = { account: UID, project: TARGET.project.id, computer: C, realm: R1, name: 'atlas', server: X };
const slotNone: Slot = { ...slotX, server: undefined };
const tNone = { project: TARGET.project, container: { id: C } };
const toX = () => calls.filter((c) => c.url.includes(`.${X}.`)).length;
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 2)); };

beforeEach(() => {
  boot({ realm: R1 });
  onFetch((): Reply => ({ status: 200, body: { data: {} } }));
  noteComputerRows(UID, [row(X)]);
});
afterEach(() => { R.resetRegistryForTests(); });

describe('the dock engine across a withholding row', () => {
  it('is kept (not ended), sends nothing new to X while withheld, and goes on as the same engine once X is named again', async () => {
    const eng = R.engineFor(slotX, TARGET);
    await settle();
    expect(toX(), 'the engine opened on X').toBeGreaterThan(0);
    noteComputerRows(UID, [row(null)]);
    const n = toX();
    const kept = R.engineFor(slotNone, tNone);
    expect(kept, 'the same engine').toBe(eng);
    expect(eng.getSnapshot().phase).not.toBe('ended');
    eng.checkNow();
    eng.wake();
    eng.open();
    const act = R.activitySource(slotNone, tNone);
    const off = act.subscribe(() => {});
    await settle();
    expect(toX(), 'zero new requests to X (credentials included)').toBe(n);
    off();
    noteComputerRows(UID, [row(X)]);
    expect(R.engineFor(slotX, TARGET), 'named again: the same engine').toBe(eng);
    // Try again (the band's button): nothing was resent on its own.
    eng.open();
    await settle();
    expect(toX(), 'it reaches X again').toBeGreaterThan(n);
  });

  it('readiness checks a withholding row cut off resume on their own once X is named again', async () => {
    let hold: (() => void) | null = null;
    onFetch(async (c): Promise<Reply> => {
      if (hold === null && c.url.endsWith('/health')) await new Promise<void>((r) => { hold = r; });
      return { status: 200, body: { data: {} } };
    });
    const eng = R.engineFor(slotX, TARGET);
    await settle();
    expect(hold, 'health is out on X').not.toBeNull();
    noteComputerRows(UID, [row(null)]);
    (hold as unknown as () => void)();
    await settle();
    const n = toX();
    noteComputerRows(UID, [row(X)]);
    await settle();
    expect(toX(), 'the engine checked X again without a manual Try Again').toBeGreaterThan(n);
    expect(eng.getSnapshot().phase).not.toBe('ended');
  });

  it('the resume never starts over an engine that holds the person\'s file (or message): it survives X named again', async () => {
    const eng = R.engineFor(slotX, TARGET);
    await settle();
    noteComputerRows(UID, [row(null)]);
    eng.checkNow();
    await settle();
    expect(['blocked', 'checking'], 'the engine is held back (the resume would start it over)').toContain(eng.getSnapshot().phase);
    eng.attach([A.prepare('t1', 'note.txt', new TextEncoder().encode('keep me'), () => '')], 'look');
    await settle();
    const before = eng.getSnapshot();
    expect(before.att.items.length, 'the engine holds the person\'s file').toBe(1);
    const started = vi.spyOn(eng, 'open');
    noteComputerRows(UID, [row(X)]);
    await settle();
    expect(started, 'not started over on its own: the band\'s Try Again stays the person\'s').not.toHaveBeenCalled();
    const after = eng.getSnapshot();
    expect(after.att.items.length, 'the file is still there').toBe(1);
    expect(after.phase).not.toBe('ended');
    started.mockRestore();
  });

  it('a pinned chat opened on X sends nothing new to X while withheld', async () => {
    const at = { project: TARGET.project.id, id: C, name: 'atlas', server: X };
    const h = R.openRef(UID, { computer: 'atlas.' + C.slice(-4), realm: R1, sid: 'sess-1' }, at)!;
    expect(h).not.toBeNull();
    await settle();
    noteComputerRows(UID, [row(null)]);
    const n = toX();
    const h2 = R.openRef(UID, { computer: 'atlas.' + C.slice(-4), realm: R1, sid: 'sess-1' }, { ...at, server: undefined })!;
    expect(h2.current(), 'the same pinned engine').toBe(h.current());
    h.current().checkNow();
    await settle();
    expect(toX()).toBe(n);
    h.release(); h2.release();
  });
});
