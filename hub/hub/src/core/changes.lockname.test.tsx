// A lock name holding '@', '#' or NUL could file another lock's id (across lock 'x@R1' and lock
// 'x' in realm R1 both encode 'lock:x@R1'), so every declaration and lookup of a lock name refuses one (lockBase).
// coreSource's eager check (every change's lock, before anything is declared) masks
// its later lockBase uses, so these are driven on their own: the across-realms and explicit-realm declarations file
// lockBase(name) (or the source's own s:<page>:<key> when unlocked), a change's hold is filed under lockBase(name)
// (baseOf), and a table with one bad lock declares nothing for its good changes.
import { QueryClientProvider, type UseMutationResult } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { heldChanges, lockBase, lockFilingForTests, sendingChanges } from './changes';
import { useLockedChange } from './locked';
import { defineMutation, queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceError, type SourceMutation, type SourceResult } from './source';
import { boot, onFetch, R1, settle } from './test/env';

beforeEach(() => { boot({ realm: R1 }); });

const put = (path: string) => defineRoute<unknown, { n: number }>({ method: 'PUT', path, scope: 'realm', body: ['n'] });
const BAD = ['x@R1', 'a#b', 'nul\u0000x', '@', '#'];
const GOOD = ['computer.access', 'proxy.alias', 'c8d.k2b', 'a-b_c/d:e'];

describe('lockBase: one spelling of a shared lock, no @ # or NUL in the name', () => {
  it('gives lock:<name> for every plain name', () => {
    for (const n of GOOD) expect(lockBase(n)).toBe('lock:' + n);
  });
  it('throws for a name holding @, # or NUL', () => {
    for (const n of BAD) expect(() => lockBase(n), n).toThrow(/a lock name holds no @, # or NUL/);
  });
  it('the across lock x@R1 and lock x can no longer both be declared', () => {
    expect(() => defineMutation(put('/ln/across'), { lock: 'x@R1', input: (v: { n: number }) => ({ body: v }) })).toThrow(/no @, # or NUL/);
    expect(() => defineMutation(put('/ln/plain'), { lock: 'x', input: (v: { n: number }) => ({ body: v }) })).not.toThrow();
  });
});

describe('every declaration and lookup of a lock name goes through lockBase', () => {
  it('defineMutation refuses a bad lock when the definition is made', () => {
    for (const [i, n] of BAD.entries()) expect(() => defineMutation(put('/ln/dm' + i), { lock: n, input: (v: { n: number }) => ({ body: v }) }), n).toThrow(/no @, # or NUL/);
  });
  it('coreSource refuses a bad lock when the page declares it, across realms or not', () => {
    for (const [i, n] of BAD.entries()) {
      expect(() => coreSource('ln-src-' + i, { reads: {}, changes: { put: { route: put('/ln/cs' + i), lock: n, input: (v: { n: number }) => ({ body: v }) } } }), n).toThrow(/no @, # or NUL/);
      expect(() => coreSource('ln-src-a' + i, { reads: {}, changes: { put: { route: put('/ln/ca' + i), lock: n, acrossRealms: true, input: (v: { n: number }) => ({ body: v }) } } }), n).toThrow(/no @, # or NUL/);
    }
    expect(() => coreSource('ln-src-ok', { reads: {}, changes: { put: { route: put('/ln/ok'), lock: 'ln.ok', input: (v: { n: number }) => ({ body: v }) } } })).not.toThrow();
  });
  it('heldChanges and sendingChanges refuse a bad lock name', () => {
    for (const n of BAD) {
      expect(() => heldChanges(n), n).toThrow(/no @, # or NUL/);
      expect(() => sendingChanges(n), n).toThrow(/no @, # or NUL/);
    }
    expect(heldChanges('ln.none')).toEqual([]);
    expect(sendingChanges('ln.none')).toEqual([]);
  });
  it('useLockedChange refuses a bad lock name', () => {
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const n of BAD) {
        function Probe() { useLockedChange(async () => null, [], 'ln.locked', { lock: n }); return null; }
        expect(() => render(<Probe />, { wrapper: wrap }), n).toThrow(/no @, # or NUL/);
      }
      function Fine() { useLockedChange(async () => null, [], 'ln.locked.ok', { lock: 'ln.ok' }); return null; }
      expect(() => render(<Fine />, { wrapper: wrap })).not.toThrow();
    } finally { err.mockRestore(); }
  });
});

describe('coreSource files its lock under lockBase at every later use, and a rejected table declares nothing', () => {
  const agentPut = (path: string) => defineRoute<unknown, { n: number }>({ method: 'PUT', path, scope: 'agent', body: ['n'] });
  const input = (v: { n: number }) => ({ body: v, realm: R1 });
  it('the across-realms declaration files lockBase(name); unlocked, the source\'s own base', () => {
    coreSource('ln-across', { reads: {}, changes: { a: { route: put('/ln/x1'), lock: 'ln.across', acrossRealms: true, input }, b: { route: put('/ln/x2'), acrossRealms: true, input } } });
    expect(lockFilingForTests(lockBase('ln.across'))).toEqual({ across: true, explicit: false });
    expect(lockFilingForTests('s:ln-across:b')).toEqual({ across: true, explicit: false });
    expect(lockFilingForTests('ln.across').across, 'never the bare name').toBe(false);
  });
  it('the explicit-realm declaration files lockBase(name); unlocked, the source\'s own base', () => {
    coreSource('ln-explicit', { reads: {}, changes: { a: { route: agentPut('/ln/e1'), lock: 'ln.explicit', explicitRealm: true, input }, b: { route: agentPut('/ln/e2'), explicitRealm: true, input } } });
    expect(lockFilingForTests(lockBase('ln.explicit'))).toEqual({ across: false, explicit: true });
    expect(lockFilingForTests('s:ln-explicit:b')).toEqual({ across: false, explicit: true });
    expect(lockFilingForTests('ln.explicit').explicit, 'never the bare name').toBe(false);
  });
  it('a table with one bad lock throws before declaring any of its good changes', () => {
    for (const [i, n] of BAD.entries()) {
      const good = 'ln.rej' + i;
      expect(() => coreSource('ln-rej-' + i, { reads: {}, changes: {
        a: { route: put('/ln/ra' + i), lock: good, acrossRealms: true, input },
        e: { route: agentPut('/ln/re' + i), lock: good + '.e', explicitRealm: true, input },
        u: { route: put('/ln/ru' + i), acrossRealms: true, input },
        z: { route: put('/ln/rz' + i), lock: n, input },
      } }), n).toThrow(/no @, # or NUL/);
      expect(lockFilingForTests(lockBase(good)), n).toEqual({ across: false, explicit: false });
      expect(lockFilingForTests(lockBase(good + '.e')), n).toEqual({ across: false, explicit: false });
      expect(lockFilingForTests('s:ln-rej-' + i + ':u'), n).toEqual({ across: false, explicit: false });
    }
  });
  it('a change\'s hold is filed under lockBase(name) (baseOf): heldChanges of the lock name finds it', async () => {
    onFetch((c) => (c.method === 'GET' ? { status: 200, body: { data: [] } } : { status: 502, body: {} }));
    const route = defineRoute({ method: 'POST', path: '/ln/held', scope: 'agent', body: ['n'], idem: true });
    const src = coreSource('ln-held', { reads: {}, changes: { put: { route, lock: 'ln.held', lockKey: (v: { n: number }): unknown => ({ n: v.n }), input: (v: { n: number }) => ({ body: v, idem: 'LN1' }) } } });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    let last!: UseMutationResult<SourceResult<unknown>, SourceError, { n: number }> & SourceMutation<unknown, { n: number }>;
    function Probe() { last = src.useMutation<unknown, { n: number }>('put') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ n: 1 }); for (let i = 0; i < 20; i++) await settle(); });
    expect(r.outcome).toBe('pending');
    expect(heldChanges('ln.held').length, 'the lock name finds the source\'s hold').toBe(1);
    expect(last.held().length, 'and the source reads the same hold').toBe(1);
  });
});
