// Send again through the activated source on a REAL engine (real journal over the production-faithful storage, the FakeAgent).
// The proof that matters (C9, X5): a message the agent refused is sent again under a NEW key, the refused key is never asked again,
// the agent runs it once, and the outcome is read from the row the engine moved to that new key.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApproversForTests } from '@kit/agent/approver-live';
import { engineActive, type ActiveDeps } from '../active';
import * as C from '../conv';
import { HANDLE, REALM, storedEntries, users, world, type World } from './env';

let w: World | null = null;
// The page's approver manager is shared by every test of the file (world() resets the page, not it): a handle one test's engine left open
// would be found by the next test's engine for the same session id. Every other accept file that opens real handles resets it the same way.
beforeEach(() => { resetApproversForTests(); });
afterEach(() => { w?.dispose(); w = null; resetApproversForTests(); });

const rows = (e: any) => users(e.getSnapshot(), C) as C.UserMsg[];
const deps = (): ActiveDeps => ({
  // An unread approval mode counts as Strict (engine.activation), so the approver lease reads as HELD here: the send prerequisites are met.
  approvers: { state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  leases: { track: () => ({ set: () => undefined, close: () => undefined }), state: () => ({ phase: 'held' }), subscribe: () => () => undefined } as any,
  pending: () => [], onPending: () => () => undefined,
  set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as any), decode: () => new Uint8Array(), waitMs: 2000,
});
const turnsAsked = (): any[][] => w!.agent.log.filter((x: any) => x[0] === 'turn');

/** A chat with a session, whose first turn the agent refuses as busy: one Not sent row. */
async function refusedRow() {
  w = world({ busy: true });
  const dock = await w.dock();
  dock.send('Build me a dashboard');
  await w.flush(800);
  const row = rows(dock).at(-1)!;
  return { dock, row };
}

describe('Send again on a real engine', () => {
  it('the refused row is Not sent, and the kit block offers Send again for exactly that request', async () => {
    const { dock, row } = await refusedRow();
    expect(row.state, JSON.stringify([row.state, row.reason])).toBe('notSent');
    const src = engineActive({ current: () => dock, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: dock.record?.s ?? '' }, () => ({ computer: 'atlas', realm: 'Personal' }), deps());
    const b: any = src.snapshot().blocks.find((x: any) => x.k === 'user');
    expect(b.actions).toContain('resend');
    expect(b.req).toMatchObject({ kind: 'turn' });
    expect(typeof b.req.key).toBe('string');
    src.release();
  });

  it('goes out under a NEW key once the agent stops refusing: the tried key is not asked again, the agent runs it once, the outcome is done', async () => {
    const { dock, row } = await refusedRow();
    const tried = row.key;
    const asked0 = turnsAsked().length;
    expect(asked0, 'the refused attempt reached the agent once').toBeGreaterThan(0);
    const src = engineActive({ current: () => dock, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: dock.record?.s ?? '' }, () => ({ computer: 'atlas', realm: 'Personal' }), deps());
    const b: any = src.snapshot().blocks.find((x: any) => x.k === 'user');
    (w!.agent as any).o.busy = false;
    expect(src.can('resend')).toEqual({ ok: true });
    const p = src.resend!(b.req);
    await w!.flush(800);
    const out = await p;
    expect(out, JSON.stringify(out)).toEqual({ k: 'done' });
    const after = rows(dock).find((u) => u.id === row.id)!;
    expect(after.key, 'a tried key is never reused with a journal').not.toBe(tried);
    const keysAsked = turnsAsked().map((x) => JSON.stringify(x[1]));
    expect(keysAsked.filter((k) => k.includes(tried)).length, 'the refused key was asked once, before').toBe(asked0);
    expect(turnsAsked().length - asked0, 'exactly one new request').toBe(1);
    expect(storedEntries(w!.fs).filter((e: any) => e.kind === 'turn' && e.k === tried), 'the tried key left the journal as refused').toHaveLength(0);
    src.release();
  });

  it('the new key is published at once: what a caller reads right after the engine took the resend is the key the request goes under', async () => {
    const { dock, row } = await refusedRow();
    const tried = row.key;
    (w!.agent as any).o.busy = false;
    dock.resend(row.id);
    const now = rows(dock).find((u) => u.id === row.id)!;
    expect(now.state, 'taken: sending').toBe('sending');
    expect(now.key, 'published under the NEW key, not the refused one').not.toBe(tried);
    await w!.flush(800);
  });

  it('the re-key is published BEFORE the request is routed: a route that waits (the approval mode is read first) leaves no snapshot with the refused key', async () => {
    const { dock, row } = await refusedRow();
    const route = vi.spyOn(dock as any, 'routeOut').mockImplementation(() => undefined);
    dock.resend(row.id);
    expect(route, 'routing is what waits; it has not run its first step here').toHaveBeenCalledTimes(1);
    const now = rows(dock).find((u) => u.id === row.id)!;
    expect(now.state).toBe('sending');
    expect(now.key, 'what a caller reads now is the key the request goes under, not the refused one').not.toBe(row.key);
  });

  it('while the agent still refuses it, the outcome is the row\'s own settled state: never done; Not sent is refused, unknown stays unknown', async () => {
    const { dock } = await refusedRow();
    const src = engineActive({ current: () => dock, release: () => undefined }, { computer: HANDLE, realm: REALM, sid: dock.record?.s ?? '' }, () => ({ computer: 'atlas', realm: 'Personal' }), deps());
    const b: any = src.snapshot().blocks.find((x: any) => x.k === 'user');
    const p = src.resend!(b.req);
    await w!.flush(800);
    const out = await p;
    const state = rows(dock).at(-1)!.state;
    expect(out.k, 'a refused resend is never done').not.toBe('done');
    // C9: the engine decides what became of the request (the journal door proves a refusal or leaves it unknown); the door only reports it.
    expect(['notSent', 'unknown'], state).toContain(state);
    expect(out).toEqual(state === 'notSent' ? { k: 'refused', code: 'not_sent' } : { k: 'unknown' });
    src.release();
  });
});
