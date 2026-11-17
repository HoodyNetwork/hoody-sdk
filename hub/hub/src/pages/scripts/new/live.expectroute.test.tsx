// Vitest: Make it live's write names the file it writes as the one that answers its address after the
// change. hoody-exec checks expectRoute against the tree the write leaves (its own route-effect check):
// a new script at a free address answers it itself, so `answeredBy: null` is refused 409 ROUTE_EFFECT_CHANGED
// with nothing written, on every send and every Deploy again. The sends below check it the same way.
import { act, renderHook } from '@app/testing';
import type { DraftRecord } from '@core';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Write = { path: string; expectRoute?: { route: string | null; answeredBy: string | null } };
const io = vi.hoisted(() => ({ writes: [] as Write[] }));
vi.mock('../data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return {
    ...real,
    useBoundSends: () => ({
      shown: true,
      // As the computer answers: the route must be answered by the written file itself after the change.
      write: async (v: Write) => {
        io.writes.push(v);
        return v.expectRoute && v.expectRoute.answeredBy === v.path ? { outcome: 'done', data: { path: v.path } } : { outcome: 'failed', code: 'ROUTE_EFFECT_CHANGED' };
      },
      exists: async () => null,
      clock: async () => 1000,
    }),
    useAliasCreate: () => ({ mutateAsync: async () => ({ outcome: 'done' }) }),
  };
});

import { clearScriptStore } from './flowfix';
import { beginDeploy, markDeploy, openRecord, readDraftRecord } from './records';
import { useLive } from './StepLive';
import { snapshotOf, verdictFor } from './snapshot';

const ID = 'eeeeeeeeee';
const B = { target: { project: { id: 'p1' }, container: { id: 'c0a7150000000000000000a1' } }, realm: 'global', owner: 'fp1', exec: 1 };
const rec = (): DraftRecord => readDraftRecord(ID) as DraftRecord;
const checked = async () => {
  const s = await snapshotOf('export default () => new Response("ok");', null, { project: B.target.project.id, compId: B.target.container.id, exec: 1 });
  if (!s.ok) throw new Error(s.why);
  return { snap: s.snapshot, verdict: verdictFor(s.snapshot, { verdict: 'ready', errors: [], missing: [] }) };
};

afterEach(async () => { io.writes.length = 0; await clearScriptStore(); });

describe('Make it live: the write expects its own file to answer the address', () => {
  it('a first send names the written path as answeredBy, and the script is live', async () => {
    const { snap, verdict } = await checked();
    const { result } = renderHook(() => useLive({
      way: 'write', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route: '/hour-check-how', snap, verdict,
      idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
    }));
    expect(result.current.live.k).toBe('confirm');
    await act(async () => { await result.current.send(); });
    expect(io.writes).toHaveLength(1);
    expect(io.writes[0]!.path).toBe('default/1/hour-check-how.ts');
    expect(io.writes[0]!.expectRoute).toEqual({ route: '/hour-check-how', answeredBy: 'default/1/hour-check-how.ts' });
    expect(result.current.live.k).toBe('done');
  });

  it('Deploy again of a reservation names the reservation\'s own path, never the address the draft holds now', async () => {
    await openRecord(ID, 'write', B as never);
    await beginDeploy(rec(), { kind: 'write', path: 'default/1/notes.ts', opId: 'e'.repeat(32), sentAfter: 1000, attempt: 0 });
    await markDeploy(rec(), 'e'.repeat(32), 'didnt');
    const { snap, verdict } = await checked();
    const { result } = renderHook(() => useLive({
      way: 'write', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route: '/elsewhere', snap, verdict,
      idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
    }));
    expect(result.current.live.k).toBe('didnt');
    await act(async () => { await result.current.send(); });
    expect(io.writes.map((w) => w.expectRoute)).toEqual([{ route: '/notes', answeredBy: 'default/1/notes.ts' }]);
    expect(result.current.live.k).toBe('done');
  });

  it('Try again of a reservation at an address no script can answer (made before the Hub refused it) sends nothing', async () => {
    // hoody-exec's write guard would pass default/1/notes.md.ts (answeredBy = itself), but /notes.md is served as a doc first.
    for (const [i, path] of ['default/1/notes.md.ts', 'default/1/favicon.ico.ts', 'default/1/a/pre.ts'].entries()) {
      await clearScriptStore();
      await openRecord(ID, 'write', B as never);
      const op = String(i).repeat(32);
      await beginDeploy(rec(), { kind: 'write', path, opId: op, sentAfter: 1000, attempt: 0 });
      await markDeploy(rec(), op, 'didnt');
      const { snap, verdict } = await checked();
      const { result, unmount } = renderHook(() => useLive({
        way: 'write', b: B as never, draftId: ID, computer: 'atlas', compId: B.target.container.id, route: '/elsewhere', snap, verdict,
        idea: null, fields: {}, link: null, attempt: 0, recordBinding: B as never,
      }));
      expect(result.current.live.k, path).toBe('didnt');
      await act(async () => { await result.current.send(); });
      expect(io.writes, path).toHaveLength(0);
      const live = result.current.live;
      expect(live.k, path).toBe('didnt');
      if (live.k === 'didnt') expect(live.e?.body, path).toEqual({ key: 'flow.live.resvRefused.body', vars: { route: `/${path.slice('default/1/'.length, -3)}` } });
      expect(rec().deploy?.phase, path).toBe('didnt');
      unmount();
    }
  });
});
