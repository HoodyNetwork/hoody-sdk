// power.test.tsx: the one computer lifecycle change shared by Computers, Bots and the Board.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { bump, resetCore } from './ctx';
import { computerLifecycle, computerLifecycleRoute, computersList, lifecycleLock, lifecycleProves, lifecycleVerdict } from './power';
import { defineMutation, queryClient } from './query';
import { containersRoute } from './computer';
import { reply, startFixtureMode, type FixtureRequest, type FixtureRule } from './transport';
import { heldChanges } from './changes';

const C1 = 'aaaaaaaaaaaaaaaaaaaaaac1', C2 = 'aaaaaaaaaaaaaaaaaaaaaac2';
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
function mode(rules: readonly FixtureRule[]) {
  resetCore();
  startFixtureMode(rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } } });
  queryClient.clear();
}
beforeEach(() => { bump('test-boot'); });

// A world: a containers list whose statuses the test sets, and lifecycle POSTs it counts.
function world(o: { status?: number; delayMs?: number } = {}) {
  const st: Record<string, string> = { [C1]: 'stopped', [C2]: 'stopped' };
  const posts: string[] = [];
  const answer = { status: o.status ?? 200, delayMs: o.delayMs ?? 0 };
  mode([
    reply(containersRoute, () => ({ body: { data: { computers: Object.entries(st).map(([id, status]) => ({ id, status })) } } })),
    reply(computerLifecycleRoute, (req: FixtureRequest) => { posts.push(req.path); return { ...answer, body: {} }; }),
  ]);
  return { st, posts, answer };
}

describe('computerLifecycle: one lock per computer, shared by every page', () => {
  it('two hooks pressing Start on one computer send once', async () => {
    const w = world({ delayMs: 30 });
    const a = renderHook(() => computerLifecycle.use(), { wrapper: wrap });
    const b = renderHook(() => computerLifecycle.use(), { wrapper: wrap });
    let ra!: Awaited<ReturnType<typeof a.result.current.run>>, rb!: typeof ra;
    await act(async () => { [ra, rb] = await Promise.all([a.result.current.run({ id: C1, op: 'start' }), b.result.current.run({ id: C1, op: 'start' })]); });
    expect(w.posts).toHaveLength(1);
    expect([ra.outcome, rb.outcome].sort()).toEqual(['done', 'not_sent']);
    expect((ra.outcome === 'not_sent' ? ra : rb).error?.code).toBe('BUSY');
  });
  it('a pending Start holds every lifecycle press on that computer (any op, any sender), not another computer', async () => {
    const w = world({ status: 502 });
    renderHook(() => computersList.use(undefined), { wrapper: wrap });
    const a = await computerLifecycle.run({ id: C1, op: 'start' });
    expect(a.outcome).toBe('pending');
    expect(heldChanges('computer.lifecycle').map((c) => c.identity)).toEqual([{ computer: C1, op: 'start' }]);
    expect((await computerLifecycle.run({ id: C1, op: 'stop' })).error?.code).toBe('READ_BACK_FIRST');
    // A page's own definition of the same route sharing lifecycleLock (as a coreSource change spreads it).
    const pageOwn = defineMutation<{ id: string; op: string }>(computerLifecycleRoute, { input: (v) => ({ params: { id: v.id, op: v.op } }), ...lifecycleLock });
    expect((await pageOwn.run({ id: C1, op: 'start' })).error?.code).toBe('HELD_BY_OTHER'); // another sender's Start holds the lock
    expect(w.posts).toHaveLength(1);
    w.answer.status = 200;
    expect((await computerLifecycle.run({ id: C2, op: 'start' })).outcome).toBe('done');
    expect(w.posts).toHaveLength(2);
    expect(await computerLifecycle.isPending({ id: C1, op: 'start' })).toBe(true);
  });
  it('a change spreading lifecycleLock records its operation as the identity, and lifecycleProves judges it', async () => {
    const w = world({ status: 502 });
    const list = renderHook(() => computersList.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(list.result.current.data).toBeTruthy());
    const pageOwn = defineMutation<{ id: string; op: string }>(computerLifecycleRoute, { input: (v) => ({ params: { id: v.id, op: v.op } }), reads: [computersList], ...lifecycleLock, proves: lifecycleProves });
    expect((await pageOwn.run({ id: C1, op: 'stop' })).outcome).toBe('pending');
    expect(heldChanges('computer.lifecycle').map((c) => c.identity)).toEqual([{ computer: C1, op: 'stop' }]);
    w.st[C1] = 'stopped';
    expect(await pageOwn.readBack()).toBe(true);
    expect(heldChanges('computer.lifecycle')).toEqual([]);
  });
  it('a fresh list frees it only when it shows the target state (the old state right after a send proves nothing)', async () => {
    const w = world({ status: 502 });
    const list = renderHook(() => computersList.use(undefined), { wrapper: wrap });
    await waitFor(() => expect(list.result.current.data).toBeTruthy());
    expect((await computerLifecycle.run({ id: C1, op: 'start' })).outcome).toBe('pending');
    expect(await computerLifecycle.readBack()).toBe(false);
    w.st[C1] = 'starting';
    expect(await computerLifecycle.readBack()).toBe(false);
    expect(await computerLifecycle.isPending({ id: C1, op: 'start' })).toBe(true);
    w.st[C1] = 'running';
    expect(await computerLifecycle.readBack()).toBe(true);
    expect(await computerLifecycle.isPending({ id: C1, op: 'start' })).toBe(false);
    expect((await computerLifecycle.run({ id: C1, op: 'pause' })).outcome).toBe('pending');
    expect(await computerLifecycle.readBack()).toBe(false);
    expect((await computerLifecycle.run({ id: C1, op: 'pause' })).error?.code).toBe('READ_BACK_FIRST');
    // The refused press started its own read-back of the old state: let it land before the state moves.
    await new Promise((r) => setTimeout(r, 0));
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    w.st[C1] = 'paused';
    expect(await computerLifecycle.readBack()).toBe(true);
    expect(await computerLifecycle.isPending({ id: C1, op: 'pause' })).toBe(false);
    expect(w.posts).toHaveLength(2);
  });
  it('refuses malformed variables unsent', async () => {
    const w = world();
    expect((await computerLifecycle.run({ id: C1, op: 'explode' as 'start' })).error?.code).toBe('INPUT_INVALID');
    expect((await computerLifecycle.run({ id: '', op: 'start' })).error?.code).toBe('INPUT_INVALID');
    expect(w.posts).toHaveLength(0);
  });
});

describe('lifecycleVerdict', () => {
  const rows = (status: string) => [{ id: C1, status }];
  it('only the target state proves it; moving, missing or the old state prove nothing', () => {
    expect(lifecycleVerdict({ computer: C1, op: 'start' }, rows('running'))).toBe('applied');
    expect(lifecycleVerdict({ computer: C1, op: 'resume' }, rows('RUNNING'))).toBe('applied');
    // A restart reads running before and after: the list cannot prove it (held until the person dismisses it).
    expect(lifecycleVerdict({ computer: C1, op: 'restart' }, rows('running'))).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1, op: 'restart' }, rows('stopped'))).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1, op: 'stop' }, rows('stopped'))).toBe('applied');
    expect(lifecycleVerdict({ computer: C1, op: 'force-stop' }, rows('stopped'))).toBe('applied');
    expect(lifecycleVerdict({ computer: C1, op: 'pause' }, rows('paused'))).toBe('applied');
    expect(lifecycleVerdict({ computer: C1, op: 'start' }, rows('starting'))).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1, op: 'start' }, [])).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1, op: 'start' }, rows('stopped'))).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1, op: 'stop' }, rows('running'))).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1, op: 'pause' }, rows('stopped'))).toBeUndefined();
    expect(lifecycleVerdict({ computer: C1 }, rows('running'))).toBeUndefined();
    expect(lifecycleVerdict(undefined, rows('running'))).toBeUndefined();
  });
});
