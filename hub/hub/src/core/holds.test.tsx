// holds (source.ts): a change may say a refused answer leaves its outcome unknown.
// Such an answer takes the settles-false path: pending, held across a remount, refused, freed only by a proving read
// (or the warned Dismiss). Without the field every refusal answers exactly as before.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { heldChanges } from './changes';
import { queryClient } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceResult } from './source';
import { boot, calls, onFetch, R1, settle } from './test/env';

const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }
const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } };
const push = defineRoute<unknown, { message: string }>({ method: 'POST', path: '/github/commit/push', scope: 'agent', body: ['message'], cwd: true, keepDetails: true });
const log = defineRoute({ method: 'GET', path: '/github/log', scope: 'agent', cwd: true });
type Answer = { readonly code?: string; readonly status?: number; readonly details?: Record<string, unknown>; readonly detailsDropped?: true };

function table(lock: string, holds: ((a: Answer) => boolean) | undefined, made: () => boolean) {
  return {
    reads: { log: { route: log, input: () => ({ target: TARGET, realm: R1, cwd: '/srv/shop' }) } },
    changes: {
      push: {
        route: push, input: (v: { message: string }) => ({ target: TARGET, realm: R1, cwd: '/srv/shop', body: v }), reads: ['log'],
        lock, lockKey: () => ({ cwd: '/srv/shop' }), identity: () => ({ cwd: '/srv/shop' }),
        ...(holds ? { holds } : {}),
        proves: () => (made() ? ('applied' as const) : undefined),
      },
    },
  };
}

describe('coreSource: holds', () => {
  it('a refusal it marks unknown is pending and held across a remount, refused, freed only by a proving read; it sees code, status and kept details', async () => {
    for (const mode of ['true', 'throw'] as const) {
      boot({ realm: R1 });
      queryClient.clear();
      let made = false;
      const seen: Answer[] = [];
      onFetch((c) => (c.method === 'POST' ? { status: 403, body: { code: 'github_token_forbidden', message: 'x', details: { operation: { committed: true } } } } : { status: 200, body: { items: [] } }));
      const lock = 'test.holds.' + mode;
      const src = coreSource('holds-' + mode, table(lock, (a) => { seen.push(a); if (mode === 'throw') throw new Error('x'); return true; }, () => made));
      let m!: ReturnType<typeof src.useMutation<unknown, { message: string }>>;
      function Probe() { m = src.useMutation<unknown, { message: string }>('push'); src.useQuery('log'); return null; }
      const first = render(<Probe />, { wrapper: wrap });
      await act(flush);
      let r!: SourceResult<unknown>;
      await act(async () => { r = await m.mutateAsync({ message: 'm' }); await flush(); });
      expect(seen[0]).toEqual({ code: 'github_token_forbidden', status: 403, details: { operation: { committed: true } } });
      expect(r).toMatchObject({ outcome: 'pending', code: 'github_token_forbidden', details: { operation: { committed: true } } });
      expect(r.status).toBeUndefined();
      expect(typeof r.hold).toBe('string');
      expect(heldChanges(lock)).toHaveLength(1);
      first.unmount();
      render(<Probe />, { wrapper: wrap });
      await act(flush);
      expect(m.pending).toBe(true);
      let r2!: SourceResult<unknown>;
      await act(async () => { r2 = await m.mutateAsync({ message: 'm' }); await flush(); });
      expect(r2).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      made = true;
      let ok = false;
      await act(async () => { ok = await m.readBack(); await flush(); });
      expect(ok).toBe(true);
      expect(heldChanges(lock)).toEqual([]);
      cleanup();
    }
  });
  it('dropped details reach it as the marker', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    const seen: Answer[] = [];
    onFetch((c) => (c.method === 'POST' ? { status: 403, body: { code: 'github_token_forbidden', message: 'x', details: { output: 'x'.repeat(9000) } } } : { status: 200, body: { items: [] } }));
    const src = coreSource('holds-dropped', table('test.holds.dropped', (a) => { seen.push(a); return a.detailsDropped === true; }, () => false));
    let m!: ReturnType<typeof src.useMutation<unknown, { message: string }>>;
    function Probe() { m = src.useMutation<unknown, { message: string }>('push'); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ message: 'm' }); await flush(); });
    expect(seen[0]).toEqual({ code: 'github_token_forbidden', status: 403, detailsDropped: true });
    expect(r).toMatchObject({ outcome: 'pending', detailsDropped: true });
    expect(heldChanges('test.holds.dropped')).toHaveLength(1);
    cleanup();
  });
  it('false, or no holds at all: the refusal is failed exactly as before, nothing held', async () => {
    for (const holds of [() => false, undefined]) {
      boot({ realm: R1 });
      queryClient.clear();
      onFetch(() => ({ status: 403, body: { code: 'github_token_forbidden', message: 'x', details: { operation: { committed: true } } } }));
      const lock = 'test.holds.none.' + String(!!holds);
      const src = coreSource('holds-none-' + String(!!holds), table(lock, holds, () => false));
      let m!: ReturnType<typeof src.useMutation<unknown, { message: string }>>;
      function Probe() { m = src.useMutation<unknown, { message: string }>('push'); return null; }
      render(<Probe />, { wrapper: wrap });
      await act(flush);
      let r!: SourceResult<unknown>;
      await act(async () => { r = await m.mutateAsync({ message: 'm' }); await flush(); });
      expect(r).toMatchObject({ outcome: 'failed', code: 'github_token_forbidden', status: 403, details: { operation: { committed: true } } });
      expect(r.hold).toBeUndefined();
      expect(heldChanges(lock)).toEqual([]);
      cleanup();
    }
  });
  it('a pending answer (5xx) is pending whatever it says: holds is not asked', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    let asked = 0;
    onFetch(() => ({ status: 502, body: { code: 'push_failed', message: 'x', details: { committed: true } } }));
    const src = coreSource('holds-5xx', table('test.holds.5xx', () => { asked++; return false; }, () => false));
    let m!: ReturnType<typeof src.useMutation<unknown, { message: string }>>;
    function Probe() { m = src.useMutation<unknown, { message: string }>('push'); return null; }
    render(<Probe />, { wrapper: wrap });
    await act(flush);
    let r!: SourceResult<unknown>;
    await act(async () => { r = await m.mutateAsync({ message: 'm' }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(asked).toBe(0);
    cleanup();
  });
});
