// Vitest: an idea's instantiate names the realm of the draft's binding, so its change lock is the one a later look-up finds
// whatever realm the Hub shows then (All realms included); a write carries the bound computer and no realm of its own.
// Replaced in '@core': the change source (a useMutation that records what each key is sent) and the shown computer.
import { renderHook } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => ({ sent: [] as Array<[string, Record<string, unknown>]> }));
const TARGET = { project: { id: 'p1' }, container: { id: 'c0a7150000000000000000a1' } };

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const mutation = (key: string) => ({
    pending: false, isPending: false,
    mutateAsync: async (v: Record<string, unknown>) => { io.sent.push([key, v]); return { outcome: 'done', data: { path: 'a.ts' } }; },
    held: () => [], holdOf: async () => undefined, complete: async () => false, discard: async () => false, settle: async () => true, dismissHeld: async () => false,
  });
  return {
    ...real,
    useCurrentComputer: () => TARGET,
    coreSource: () => ({ heldBy: () => undefined, useMutation: mutation, useQuery: () => ({ data: undefined, isPending: true, isError: false, error: null, refetch: async () => undefined }) }),
  };
});

import { useBoundSends, type Binding } from '../data';

const bound = (realm: string): Binding => ({ target: TARGET, realm, owner: 'fp1', exec: 1 } as never);

describe('the bound sends of a draft', () => {
  it('an instantiate carries the binding\'s realm and computer', async () => {
    io.sent.length = 0;
    const { result } = renderHook(() => useBoundSends(bound('r1')));
    await result.current.instantiate({ name: 'kv-note', path: 'a.ts', vars: {} });
    const [key, v] = io.sent.find(([k]) => k === 'instantiate') ?? [];
    expect(key).toBe('instantiate');
    expect(v).toMatchObject({ realm: 'r1', compId: TARGET.container.id, path: 'a.ts' });
  });

  it('a write carries the bound computer and no realm', async () => {
    io.sent.length = 0;
    const { result } = renderHook(() => useBoundSends(bound('r1')));
    await result.current.write({ path: 'a.ts', content: 'x', ifRevision: null, opId: 'o1' } as never);
    const [, v] = io.sent.find(([k]) => k === 'write') ?? [];
    expect(v).toMatchObject({ compId: TARGET.container.id, path: 'a.ts' });
    expect(v && 'realm' in v).toBe(false);
  });
});
