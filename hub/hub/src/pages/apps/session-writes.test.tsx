// Vitest: an answer the launcher (launch/useApps.ts) gets after the store's reset writes nothing. The store is reset
// when the session ends or the account or realm changes (parts/ops.ts reset, run by the purge and by a switch), and
// the next session may list a row under the same key: an old Stop, Check, Restart or Forget never leaves its note,
// state, selection or settled busy mark on it. Fixture mode, each action's answer held by the test; the live
// machine's side is session-writes.live.test.tsx.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageManifest } from '@kit';
import { act, renderPage, screen } from '@app/testing';
import type * as Data from './data';
import type { OpenApp } from './logic';

const S = vi.hoisted(() => {
  const held = new Map<string, { resolve: (a: unknown) => void; reject: (e: unknown) => void }>();
  return {
    held,
    /** A page action whose answer the test gives: the last call of each is held until resolved or rejected. */
    m: (name: string) => ({
      mutateAsync: () => new Promise((resolve, reject) => void held.set(name, { resolve, reject })),
      isPending: false,
    }),
  };
});

vi.mock('./data', async (orig) => ({
  ...(await orig<typeof Data>()),
  LIVE: false,
  useStopApp: () => S.m('stop'),
  useCheckApp: () => S.m('check'),
  useRestartApp: () => S.m('restart'),
  useForgetApp: () => S.m('forget'),
}));

const { harness } = await import('./launch/harness');
const { ops } = await import('./parts/ops');
const { useApps } = await import('./launch/useApps');

let A!: ReturnType<typeof useApps>;
const selects: (string | undefined)[] = [];
function Hook() {
  A = useApps({ nav: { select: (key) => void selects.push(key) } });
  return <p>hook</p>;
}
const page: PageManifest = { ...harness, load: () => Promise.resolve({ default: Hook }) };

const row = (key: string): OpenApp => ({
  key, name: 'htop', app: 'htop', opensIn: 'terminal', state: 'running', code: '', terminal: 15004, handle: 'h1', source: '', command: '', settings: [], urls: {}, startedAt: 1,
});
/** The session ends while the action is out; the next one lists a row under the same key (with its own busy mark). */
const nextSession = (key: string, busy?: 'stop' | 'check' | 'restart') => {
  ops.reset();
  ops.addLaunch(row(key));
  if (busy) ops.patch(key, { busy });
};
const answer = async (name: string, how: { resolve: unknown } | { reject: unknown }, done: Promise<unknown>) => {
  await act(async () => {
    const h = S.held.get(name)!;
    if ('resolve' in how) h.resolve(how.resolve);
    else h.reject(how.reject);
    await done.catch(() => undefined);
  });
};

beforeEach(async () => {
  S.held.clear();
  selects.length = 0;
  await renderPage(page, { path: '/apps' });
  await screen.findByText('hook');
  act(() => {
    ops.reset();
    ops.addLaunch(row('k1'));
  });
});

describe('an answer after the reset', () => {
  it('control: in the same session a refused Stop leaves its note and settles its busy mark', async () => {
    let done!: Promise<unknown>;
    act(() => void (done = A.stop(row('k1'))));
    expect(ops.get().patches.get('k1')?.busy).toBe('stop');
    await answer('stop', { resolve: { outcome: 'failed', code: 'stop_failed' } }, done);
    expect(ops.get().patches.get('k1')).toEqual({ note: 'stopFailed' });
  });

  it('a refused Stop: the next session row keeps its busy mark and gets no note', async () => {
    let done!: Promise<unknown>;
    act(() => void (done = A.stop(row('k1'))));
    act(() => nextSession('k1', 'stop'));
    await answer('stop', { resolve: { outcome: 'failed', code: 'stop_failed' } }, done);
    expect(ops.get().patches.get('k1')).toEqual({ busy: 'stop' });
  });

  it('a Stop that threw: the next session row is not marked unconfirmed', async () => {
    let done!: Promise<unknown>;
    act(() => void (done = A.stop(row('k1'))));
    act(() => nextSession('k1'));
    await answer('stop', { reject: new Error('lost') }, done);
    expect(ops.get().patches.get('k1')).toBeUndefined();
  });

  it('a Check: the next session row keeps its state and its own Check busy mark', async () => {
    let done!: Promise<unknown>;
    act(() => void (done = A.check(row('k1'))));
    act(() => nextSession('k1', 'check'));
    await answer('check', { resolve: { outcome: 'done', data: { state: 'stopped' } } }, done);
    expect(ops.get().patches.get('k1')).toEqual({ busy: 'check' });
  });

  it('a Restart: the next session row keeps its state and its busy mark', async () => {
    let done!: Promise<unknown>;
    act(() => void (done = A.restart(row('k1'))));
    act(() => nextSession('k1', 'restart'));
    await answer('restart', { resolve: { outcome: 'done', data: { state: 'starting', accessCode: 'x1y2' } } }, done);
    expect(ops.get().patches.get('k1')).toEqual({ busy: 'restart' });
  });

  it('control: in the same session a Forget that failed brings the row back with its note, selected', async () => {
    act(() => A.forget(row('k1')));
    expect(ops.get().forgotten.has('k1')).toBe(true);
    selects.length = 0;
    await act(async () => {
      S.held.get('forget')!.reject(new Error('lost'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(ops.get().forgotten.has('k1')).toBe(false);
    expect(ops.get().patches.get('k1')?.note).toBe('notForgotten');
    expect(selects).toEqual(['k1']);
  });

  it('a Forget that failed: the next session row is not brought back, noted or selected', async () => {
    act(() => A.forget(row('k1')));
    expect(ops.get().forgotten.has('k1')).toBe(true);
    act(() => {
      nextSession('k1');
      ops.forget('k1');
    });
    selects.length = 0;
    await act(async () => {
      S.held.get('forget')!.reject(new Error('lost'));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(ops.get().forgotten.has('k1')).toBe(true);
    expect(ops.get().patches.get('k1')).toBeUndefined();
    expect(selects).toEqual([]);
  });
});
