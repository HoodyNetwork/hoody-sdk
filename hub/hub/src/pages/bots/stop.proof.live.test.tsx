// Vitest on a live page: a stop whose answer was lost. Check again reads the Bot's tasks fresh and frees the stop only on a positive read:
// the task listed closed on ANY page of the closed list (a Bot with more than 500 closed tasks has several), or, for a stop that does not
// close it, an idle open task. A task missing from the open list proves nothing. The closed list is read only while a stop is held.
import { CoreQueryProvider, queryClient } from '@core';
import { boot, calls, onFetch, settle } from '@core/test/env';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROVES, registerTargets, useDelegates, useStopDelegate } from './data';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = `c1~${R1}~chief`;
const OTHER_KEY = `c1~${R1}~scout`;
const flush = async () => {
  for (let i = 0; i < 20; i++) await settle();
};

interface World {
  /** Open tasks as the agent lists them. */
  open?: object[];
  /** Closed task ids, oldest first, served by page like the agent. */
  closed?: string[];
  /** Fail the closed list. */
  closedFails?: boolean;
}
function serve(w: World) {
  onFetch((c) => {
    const u = new URL(c.url);
    if (c.method === 'POST') return { status: 0, network: true };
    if (/\/bots\/[^/]+\/delegates$/.test(u.pathname)) {
      if (u.searchParams.get('state') === 'closed') {
        if (w.closedFails) return { status: 500, body: { error: { code: 'internal_error', message: 'x' } } };
        const all = w.closed ?? [];
        const page = Number(u.searchParams.get('page') ?? '1');
        const limit = Number(u.searchParams.get('limit') ?? '50');
        return { status: 200, body: { items: all.slice((page - 1) * limit, page * limit).map((id) => ({ session_id: id, title: id, state: 'closed' })), meta: { total: all.length, page, limit } } };
      }
      return { status: 200, body: { items: w.open ?? [], meta: { total: (w.open ?? []).length } } };
    }
    return { status: 200, body: { data: { id: 'chief', uid: 'u1', name: 'Chief' } } };
  });
}
const task = (id: string, extra: object = {}) => ({ session_id: id, title: id, state: 'open', open_gates: [], current_step: { kind: 'tool' }, ...extra });
const closedReads = () => calls.filter((c) => c.method === 'GET' && /state=closed/.test(c.url) && /limit=500/.test(c.url)).map((c) => new URL(c.url).searchParams.get('page'));

beforeEach(() => {
  // One realm shown: core judges a change by the reads of the realm it was sent in (the All realms view never matches a Bot's own realm: unknown, safe).
  boot({ realm: R1 });
  queryClient.clear();
  registerTargets([{ id: 'c1', project_id: 'p1', server_name: 'sv1' }]);
});

async function held(close: boolean, provedAtOnce = false) {
  // The Work tab mounts the open list beside the stop: Check again re-reads it with the rest.
  const h = renderHook(() => ({ stop: useStopDelegate(KEY, []), open: useDelegates(KEY) }), { wrapper: CoreQueryProvider });
  await act(flush);
  await act(async () => {
    await h.result.current.stop.run({ sessionId: 's1', close });
  });
  await act(flush);
  // A stop the open list already proves is freed by core's own read-back after the lost answer: no "may have gone through" note stays.
  expect(h.result.current.stop.outcome).toBe(provedAtOnce ? 'idle' : 'pending');
  return h;
}
const check = async (h: Awaited<ReturnType<typeof held>>): Promise<boolean> => {
  let ok = false;
  await act(async () => {
    ok = await h.result.current.stop.readBack();
  });
  await act(flush);
  return ok;
};

describe('the stop proof\'s answers keep their provenance', () => {
  const row = (state: string, idle = false) => ({ sessionId: 's1', state, idle });
  const proof = (answers: unknown[], close = true) => PROVES.stopDelegate?.({ botKey: KEY, sessionId: 's1', close }, [answers]);
  it('a closed row in the open list is no closed-list proof, whatever the closed pages say', () => {
    expect(proof([{ [KEY]: [row('closed')] }, { [`closed:${KEY}`]: [] }])).toBeUndefined();
    expect(proof([{ [KEY]: [row('closed')] }])).toBeUndefined();
  });
  it('the same task closed on a tagged closed page proves it', () => {
    expect(proof([{ [KEY]: [] }, { [`closed:${KEY}`]: [row('closed')] }])).toBe('applied');
  });
  it('a closed row beside an idle open row does not hide it for a stop that does not close the task', () => {
    expect(proof([{ [KEY]: [row('idle', true), { sessionId: 's9', state: 'closed', idle: false }] }], false)).toBe('applied');
  });
  it('another Bot\'s closed page, with the same session id, proves nothing for this Bot', () => {
    expect(proof([{ [KEY]: [] }, { [`closed:${OTHER_KEY}`]: [row('closed')] }, { [OTHER_KEY]: [row('closed')] }])).toBeUndefined();
  });
});

describe('Check again after a stop whose answer was lost', () => {
  it('the closed list is not read before a stop is held', async () => {
    serve({ closed: ['s1'] });
    renderHook(() => ({ stop: useStopDelegate(KEY, []), open: useDelegates(KEY) }), { wrapper: CoreQueryProvider });
    await act(flush);
    expect(closedReads()).toEqual([]);
  });

  it('a task listed closed on the last of three pages (1200 closed tasks) frees a stop that closes', async () => {
    serve({ closed: Array.from({ length: 1199 }, (_, i) => `t${i}`).concat('s1') });
    const h = await held(true);
    expect(await check(h)).toBe(true);
    expect(h.result.current.stop.outcome).not.toBe('pending');
    expect(closedReads()).toEqual(expect.arrayContaining(['1', '2', '3']));
  });

  it('a task that is nowhere (not open, not closed) proves nothing: the stop stays held', async () => {
    serve({ open: [task('other')], closed: ['t1', 't2'] });
    const h = await held(true);
    expect(await check(h)).toBe(false);
    expect(h.result.current.stop.outcome).toBe('pending');
  });

  it('a task still open and working proves nothing, even when the stop does not close it', async () => {
    serve({ open: [task('s1', { current_step: { kind: 'tool' } })] });
    const h = await held(false);
    expect(await check(h)).toBe(false);
    expect(h.result.current.stop.outcome).toBe('pending');
  });

  it('an open task that reported an idle step with no open gate proves a stop that does not close it', async () => {
    serve({ open: [task('s1', { current_step: { kind: 'idle' } })] });
    const h = await held(false, true);
    expect(h.result.current.stop.held() ?? []).toHaveLength(0);
    expect(await check(h)).toBe(true);
  });

  it('an open task that has reported no step at all is not idle: a stop that does not close it stays held', async () => {
    serve({ open: [task('s1', { current_step: undefined })] });
    const h = await held(false);
    expect(await check(h)).toBe(false);
    expect(h.result.current.stop.outcome).toBe('pending');
  });

  it('an idle open task does not prove a stop that closes it', async () => {
    serve({ open: [task('s1', { current_step: { kind: 'idle' } })] });
    const h = await held(true);
    expect(await check(h)).toBe(false);
    expect(h.result.current.stop.outcome).toBe('pending');
  });

  it('a closed list that cannot be read proves nothing', async () => {
    serve({ closedFails: true });
    const h = await held(true);
    expect(await check(h)).toBe(false);
    expect(h.result.current.stop.outcome).toBe('pending');
  });
});
