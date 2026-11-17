// Vitest on core's real change source: the Check of an op belongs to the place and the computer the op was sent from. A Check
// made from another place frees nothing and asks nobody; one made after the shell switched computers is asked of the computer
// the op was sent to (the hold's own record), never the one the shell shows now, which would answer "never seen" for it.
import { CoreQueryProvider, queryClient } from '@core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Reply } from '@core/test/env';
import { useWrite } from './data';
import { sentOf, useOpCheck } from './parts/opcheck';

const A = TARGET;
const B = { ...TARGET, container: { id: 'c2', server_name: 'sv1' } };
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const world = { state: 'committed' };
const reply = (c: { url: string; method: string }): Reply => {
  if (c.url.includes('/ops/settle')) return { status: 200, body: { opId: 'x', state: world.state } };
  if (c.method === 'GET') return { status: 200, body: {} };
  return { status: 502, body: {} };
};
const settles = () => calls.filter((c) => c.url.includes('/ops/settle'));

async function sendOnA() {
  const hook = renderHook(() => ({ write: useWrite(), op: useOpCheck() }), { wrapper: CoreQueryProvider });
  let r: Awaited<ReturnType<typeof hook.result.current.write.mutateAsync>> | undefined;
  await act(async () => { r = await hook.result.current.write.mutateAsync({ compId: 'c1', path: 'default/1/a.ts', content: 'x', ifRevision: null, opId: 'op0123456789abcdef' }); await flush(); });
  expect(r!.outcome).toBe('pending');
  const rec = sentOf(hook.result.current.write, { compId: 'c1', path: 'default/1/a.ts', opId: 'op0123456789abcdef', vars: { compId: 'c1', path: 'default/1/a.ts' } }, r);
  hook.result.current.op.remember(rec, 'place-A');
  return hook;
}

describe('the Check of an op', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    world.state = 'committed';
    onFetch(reply);
    setTarget(A);
  });

  it("is asked of the computer the op was sent to, even after the shell switched computers", async () => {
    const hook = await sendOnA();
    setTarget(B);
    let v: string | undefined;
    await act(async () => { v = await hook.result.current.op.check('place-A'); await flush(); });
    expect(v).toBe('done');
    expect(settles()).toHaveLength(1);
    expect(settles()[0]!.url).toContain('p1-c1-');
    expect(settles()[0]!.url).not.toContain('p1-c2-');
    expect(hook.result.current.write.held()).toEqual([]);
  });

  it("from another place proves nothing: nobody is asked and the hold stays", async () => {
    const hook = await sendOnA();
    let v: string | undefined;
    await act(async () => { v = await hook.result.current.op.check('place-B'); await flush(); });
    expect(v).toBe('unknown');
    expect(settles()).toEqual([]);
    expect(hook.result.current.write.held()).toHaveLength(1);
  });

  it('a send that was replaced is not checked by the older one', async () => {
    const hook = await sendOnA();
    hook.result.current.op.remember(null);
    let v: string | undefined;
    await act(async () => { v = await hook.result.current.op.check('place-A'); await flush(); });
    expect(v).toBe('unknown');
    expect(settles()).toEqual([]);
  });

  it('an answer that proves nothing frees nothing', async () => {
    world.state = 'forgotten';
    const hook = await sendOnA();
    let v: string | undefined;
    await act(async () => { v = await hook.result.current.op.check('place-A'); await flush(); });
    expect(v).toBe('unknown');
    expect(hook.result.current.write.held()).toHaveLength(1);
  });
});
