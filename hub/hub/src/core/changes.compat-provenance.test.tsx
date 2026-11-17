// The reverse compat of a definition without acrossRealms
// (changes.ts compatScopeOf) took ANY unscoped hold of its lock base and identity for its own change filed across
// realms. A naturally unscoped hold (a base/account or kit route, or a locked change, sharing the lock and identity)
// then refused a realm or agent route's press, read as its pending and was the hold its holdOf named. Each hold now
// records how it was filed (ChangeMeta.across); the reverse compat matches only a hold filed across realms, and a
// hold that records no filing (an older build's) still matches as before (fails safe). Both orders, base/realm and
// kit/agent pairs, from memory and from the stored record alone.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot, R1 } from './test/env';
import type * as C from './changes';
import type * as Ctx from './ctx';
import type * as L from './locked';
import type * as Q from './query';
import type * as Routes from './routes';
import type * as S from './source';
import type * as Env from './test/env';

type G = { C: typeof C; query: typeof Q; routes: typeof Routes; env: typeof Env; ctx: typeof Ctx; source: typeof S; locked: typeof L };
type Vars = { id: string };
type Kind = 'base' | 'realm' | 'kit' | 'agent';
const KEY = 'hub.v3.changes';

/** A build of the page on the same storage (another tab): its own module graph. */
async function graph(): Promise<G> {
  const saved: Array<[string, string]> = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; saved.push([k, localStorage.getItem(k)!]); }
  vi.resetModules();
  const env = await import('./test/env');
  env.boot({ realm: R1 });
  for (const [k, v] of saved) localStorage.setItem(k, v);
  const C2 = await import('./changes');
  C2.reloadChangesForTests();
  return { C: C2, query: await import('./query'), routes: await import('./routes'), env, ctx: await import('./ctx'), source: await import('./source'), locked: await import('./locked') };
}
const deletes = (g: G): number => g.env.calls.filter((c) => c.method === 'DELETE').length;
const fail502 = (g: G): void => g.env.onFetch(() => ({ status: 502, body: {} }));
/** A remove of `id` on a route of this kind, sharing `lock` and the identity (the id) with the other routes. */
function removeOf(g: G, kind: Kind, lock: string, across = false) {
  const keyed = kind === 'kit' || kind === 'agent';
  const rt = g.routes.defineRoute<unknown>({ method: 'DELETE', path: `/cp/${kind}/:id`, scope: kind, ...(keyed ? { idem: true } : {}), ...(kind === 'kit' ? { kit: 'run' as const, index: 1 } : {}) });
  return g.query.defineMutation<Vars>(rt, { input: (v) => ({ params: { id: v.id } }), lockKey: (v) => v.id, lock, ...(across ? { acrossRealms: true } : {}) });
}
const stored = (): Array<{ id: string; meta?: Record<string, unknown> }> => JSON.parse(localStorage.getItem(KEY) ?? '[]') as Array<{ id: string; meta?: Record<string, unknown> }>;
/** The stored records as a build without filing provenance writes them (no meta.across). */
function noProvenance(): void {
  const recs = stored();
  for (const r of recs) if (r.meta) delete r.meta.across;
  localStorage.setItem(KEY, JSON.stringify(recs));
}

beforeEach(() => { boot({ realm: R1 }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// The pairs: a naturally unscoped filing, then the route of the same lock filed under the realm.
const PAIRS: ReadonlyArray<readonly [Kind, Kind]> = [['base', 'realm'], ['kit', 'agent']];

describe(':521 a naturally unscoped hold is another route\'s change, never this realm route\'s across filing', () => {
  for (const [plain, scoped] of PAIRS) {
    it(`${plain} hold, then a ${scoped} press in the same tab: not pending, sent once, holdOf names nothing`, async () => {
      const g = await graph(); fail502(g);
      const lock = `cp.m.${plain}`;
      expect((await removeOf(g, plain, lock).run({ id: 'c9' })).outcome).toBe('pending');
      const other = removeOf(g, scoped, lock);
      expect(await other.isPending({ id: 'c9' })).toBe(false);
      expect(await other.holdOf({ id: 'c9' })).toBeUndefined();
      expect((await other.run({ id: 'c9' })).outcome).toBe('pending');
      expect(deletes(g)).toBe(2);
    });
    it(`${plain} hold in another tab, then a ${scoped} press from the stored record alone: sent`, async () => {
      const g1 = await graph(); fail502(g1);
      const lock = `cp.s.${plain}`;
      expect((await removeOf(g1, plain, lock).run({ id: 'c9' })).outcome).toBe('pending');
      const g2 = await graph(); fail502(g2);
      g2.C.resetChanges(); // only the stored record (read under the store lock) holds it
      expect((await removeOf(g2, scoped, lock).run({ id: 'c9' })).outcome).toBe('pending');
      expect(deletes(g2)).toBe(1);
    });
    it(`the other order (${scoped} hold, then a ${plain} press) sends as before`, async () => {
      const g = await graph(); fail502(g);
      const lock = `cp.o.${plain}`;
      expect((await removeOf(g, scoped, lock).run({ id: 'c9' })).outcome).toBe('pending');
      expect((await removeOf(g, plain, lock).run({ id: 'c9' })).outcome).toBe('pending');
      expect(deletes(g)).toBe(2);
    });
    it(`a ${plain} hold recording no filing (an older build's) still refuses the ${scoped} press (fails safe)`, async () => {
      const g1 = await graph(); fail502(g1);
      const lock = `cp.l.${plain}`;
      expect((await removeOf(g1, plain, lock).run({ id: 'c9' })).outcome).toBe('pending');
      noProvenance();
      const g2 = await graph(); fail502(g2);
      const res = await removeOf(g2, scoped, lock).run({ id: 'c9' });
      expect(res.outcome).toBe('not_sent');
      expect(deletes(g2)).toBe(0);
    });
  }
  it('every send records how it was filed: across true for an acrossRealms definition, false otherwise', async () => {
    const g = await graph(); fail502(g);
    await removeOf(g, 'realm', 'cp.f.a', true).run({ id: 'c9' });
    await removeOf(g, 'realm', 'cp.f.n').run({ id: 'c9' });
    await removeOf(g, 'base', 'cp.f.b').run({ id: 'c9' });
    const across = (base: string) => stored().find((r) => r.meta?.base === base)?.meta?.across;
    expect(across('lock:cp.f.a')).toBe(true);
    expect(across('lock:cp.f.n')).toBe(false);
    expect(across('lock:cp.f.b')).toBe(false);
  });
  it('the same change filed across realms by another build still refuses the realm-scoped press', async () => {
    const g1 = await graph(); fail502(g1);
    await removeOf(g1, 'realm', 'cp.x', true).run({ id: 'c9' });
    const g2 = await graph(); fail502(g2);
    g2.C.resetChanges();
    expect((await removeOf(g2, 'realm', 'cp.x').run({ id: 'c9' })).outcome).toBe('not_sent');
    expect(deletes(g2)).toBe(0);
  });
  it('coreSource: a base hold, then a realm-scoped source press of the same lock and identity is sent', async () => {
    const g = await graph(); fail502(g);
    expect((await removeOf(g, 'base', 'cp.src').run({ id: 'c9' })).outcome).toBe('pending');
    const rt = g.routes.defineRoute<unknown>({ method: 'DELETE', path: '/cp/src/:id', scope: 'realm' });
    const src = g.source.coreSource('cp-src', { changes: { remove: { route: rt, lock: 'cp.src', input: (v: Vars) => ({ params: { id: v.id } }), lockKey: (v: Vars) => v.id } } });
    const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={g.query.queryClient}>{children}</QueryClientProvider>;
    let last!: { mutateAsync: (v: Vars) => Promise<S.SourceResult<unknown>> };
    function Probe() { last = src.useMutation<unknown, Vars>('remove') as never; return null; }
    render(<Probe />, { wrapper: wrap });
    let r!: S.SourceResult<unknown>;
    await act(async () => { r = await last.mutateAsync({ id: 'c9' }); await g.env.settle(20); });
    expect(r.outcome).toBe('pending');
    expect(deletes(g)).toBe(2);
    expect(stored().filter((x) => x.meta?.base === 'lock:cp.src').map((x) => x.meta?.across).sort()).toEqual([false, false]);
  });
  it('a locked change (useLockedChange, filed under no realm) is a natural filing: a realm route of its lock is sent', async () => {
    const g = await graph(); fail502(g);
    let last!: { run: (v: Vars) => Promise<{ outcome: string }> };
    const send = async (): Promise<never> => { throw Object.assign(new Error('bad gateway'), { status: 502, pending: true }); };
    function Probe() { last = g.locked.useLockedChange(send, [], 'cp.lk', { lock: 'cp.lk', lockKey: (v: Vars) => v.id }) as never; return null; }
    render(<Probe />);
    await act(async () => { await last.run({ id: 'c9' }); await g.env.settle(20); });
    const held = stored().find((r) => r.meta?.base === 'lock:cp.lk');
    expect(held?.meta?.across).toBe(false);
    expect((await removeOf(g, 'realm', 'cp.lk').run({ id: 'c9' })).outcome).toBe('pending');
    expect(deletes(g)).toBe(1);
  });
});
