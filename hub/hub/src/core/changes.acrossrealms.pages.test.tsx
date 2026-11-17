// The acrossRealms fixes (changes.acrossrealms.test.tsx) on the Computers page's own definitions (computersTable):
// project.create and project.update are filed across realms today; computer.rename/remove turn it on once these
// fixes are in. A refused repeat press reads back in the realm the held send was made in, and
// a hold filed under the old realm-scoped id holds, shows in every realm view and is freed only by warned Dismiss
// or a proof.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computersTable } from '../pages/computers/data';
import * as C from './changes';
import { setRealm } from './ctx';
import { queryClient } from './query';
import { coreSource, type LiveChange, type SourceResult, type SourceTable } from './source';
import { boot, calls, onFetch, R1, R2, settle } from './test/env';
import type * as QueryMod from './query';
import type * as SourceMod from './source';
import type * as EnvMod from './test/env';

type Hook<V> = { mutateAsync: (v: V) => Promise<SourceResult<unknown>>; dismiss: (v: V, hold: string) => Promise<boolean>; holdOf: (v: V) => Promise<string | undefined> };
const wrapWith = (client: typeof queryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const sent = (method: string): number => calls.filter((c) => c.method === method).length;
const gets = (): number => sent('GET');
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

// R1 lists project p1 "Blog" and computer c9; R2 lists neither (another computer, cX, so its list is not empty).
let r1Has = true;
function serve(): void {
  onFetch((c) => {
    if (c.method !== 'GET') return { status: 502, body: {} };
    const inR1 = c.url.includes(R1);
    if (c.url.includes('/projects')) return { status: 200, body: { data: { projects: inR1 && r1Has ? [{ id: 'p1', alias: 'Blog', color: '#112233' }] : [] } } };
    return { status: 200, body: { data: { computers: inR1 && r1Has ? [{ id: 'c9', name: 'c9' }] : [{ id: 'cX', name: 'cX' }] } } };
  });
}
/** computersTable with these changes filed across realms (as computers-r turns them on). */
function tableWith(across: readonly string[], src = computersTable): SourceTable {
  const changes: Record<string, LiveChange<unknown>> = { ...(src.changes as Record<string, LiveChange<unknown>>) };
  for (const k of across) changes[k] = { ...changes[k]!, acrossRealms: true };
  return { ...src, changes };
}
function mount<V>(src: ReturnType<typeof coreSource>, key: string, client = queryClient): () => Hook<V> {
  let last!: Hook<V>;
  function Probe() { last = src.useMutation<unknown, V>(key) as never; return null; }
  render(<Probe />, { wrapper: wrapWith(client) });
  return () => last;
}

beforeEach(() => { boot({ realm: R1 }); queryClient.clear(); r1Has = true; serve(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('acrossRealms on the Computers definitions: a refused repeat press never frees the hold', () => {
  it('project.create pending from R1, pressed twice more in R2: read back in R1 only (not shown), never sent again', async () => {
    const hook = mount<{ name: string; color: string }>(coreSource('ar-pages-pc', computersTable), 'projectCreate');
    const v = { name: 'Docs', color: '#445566' };
    let r!: SourceResult<unknown>;
    await act(async () => { r = await hook().mutateAsync(v); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { setRealm(R2); await flush(); });
    const read = gets();
    for (let i = 0; i < 2; i++) {
      await act(async () => { r = await hook().mutateAsync(v); await flush(); });
      expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    }
    expect(gets()).toBe(read);
    expect(C.heldChanges('project.create', { realm: R2 })).toHaveLength(1);
    expect(sent('POST')).toBe(1);
  });
  it('project.update: back in R1 the refused press reads back there, and only the proof frees it', async () => {
    const hook = mount<{ id: string; name: string; color: string }>(coreSource('ar-pages-pu', computersTable), 'projectUpdate');
    const v = { id: 'p1', name: 'Blog', color: '#112233' };
    r1Has = false; // the update's answer is lost and R1's list does not show it yet
    let r!: SourceResult<unknown>;
    await act(async () => { r = await hook().mutateAsync(v); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { setRealm(R2); await flush(); });
    await act(async () => { r = await hook().mutateAsync(v); await flush(); });
    expect(r.code).toBe('READ_BACK_FIRST');
    expect(C.heldChanges('project.update', { realm: null })).toHaveLength(1);
    await act(async () => { setRealm(R1); await flush(); });
    r1Has = true; // R1's list now shows the sent name and colour on p1
    await act(async () => { r = await hook().mutateAsync(v); await flush(); });
    expect(r.code).toBe('READ_BACK_FIRST');
    expect(C.heldChanges('project.update', { realm: null })).toEqual([]);
    expect(sent('PUT')).toBe(1);
  });
  it('computer.remove filed across realms: pending from R1, refused in R2 (whose list lacks it), the hold stays; a third press sends nothing', async () => {
    const hook = mount<{ id: string }>(coreSource('ar-pages-rm', tableWith(['remove'])), 'remove');
    let r!: SourceResult<unknown>;
    await act(async () => { r = await hook().mutateAsync({ id: 'c9' }); await flush(); });
    expect(r.outcome).toBe('pending');
    await act(async () => { setRealm(R2); await flush(); });
    await act(async () => { r = await hook().mutateAsync({ id: 'c9' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'READ_BACK_FIRST' });
    await act(async () => { await flush(); await flush(); });
    expect(C.heldChanges('computer.remove', { realm: null })).toHaveLength(1);
    await act(async () => { r = await hook().mutateAsync({ id: 'c9' }); await flush(); });
    expect(r.outcome).toBe('not_sent');
    expect(sent('DELETE')).toBe(1);
  });
});

describe('acrossRealms on the Computers definitions: a hold from before the flag turned on', () => {
  async function afterDeploy(): Promise<{ C: typeof C; S: typeof SourceMod; Q: typeof QueryMod; env: typeof EnvMod; table: SourceTable }> {
    const saved: Array<[string, string]> = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; saved.push([k, localStorage.getItem(k)!]); }
    cleanup();
    vi.resetModules();
    const env = await import('./test/env');
    env.boot({ realm: R1 });
    for (const [k, v] of saved) localStorage.setItem(k, v);
    const C2 = await import('./changes');
    C2.reloadChangesForTests();
    const { computersTable: t2 } = await import('../pages/computers/data');
    return { C: C2, S: await import('./source'), Q: await import('./query'), env, table: tableWith(['remove', 'rename'], t2) };
  }
  it('a remove realm-filed in R1 before the deploy: after it, in R2, it is shown held, refused, and a warned Dismiss frees it', async () => {
    const hook = mount<{ id: string }>(coreSource('ar-pages-legacy', computersTable), 'remove');
    let r!: SourceResult<unknown>;
    await act(async () => { r = await hook().mutateAsync({ id: 'c9' }); await flush(); });
    expect(r.outcome).toBe('pending');
    const { C: C2, S, Q, env, table } = await afterDeploy();
    env.onFetch(() => ({ status: 502, body: {} }));
    const hook2 = mount<{ id: string }>(S.coreSource('ar-pages-legacy', table), 'remove', Q.queryClient);
    const ctx = await import('./ctx');
    await act(async () => { ctx.setRealm(R2); await env.settle(40); });
    // Shown in R2's view (a page's held warning and its Dismiss find it), never hidden as another realm's.
    expect(C2.heldChanges('computer.remove', { realm: R2 })).toHaveLength(1);
    await act(async () => { r = await hook2().mutateAsync({ id: 'c9' }); await env.settle(40); });
    expect(r.outcome).toBe('not_sent');
    expect(env.calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    let hold: string | undefined;
    await act(async () => { hold = await hook2().holdOf({ id: 'c9' }); });
    expect(hold).toBeTruthy();
    let freed = false;
    await act(async () => { freed = await hook2().dismiss({ id: 'c9' }, hold!); await env.settle(40); });
    expect(freed).toBe(true);
    expect(C2.heldChanges('computer.remove', { realm: null })).toEqual([]);
  });
  it('a rename realm-filed in R1 before the deploy is refused after it in R1 too (the same change, never sent twice)', async () => {
    const hook = mount<{ id: string; name: string }>(coreSource('ar-pages-legacy-rn', computersTable), 'rename');
    let r!: SourceResult<unknown>;
    await act(async () => { r = await hook().mutateAsync({ id: 'c9', name: 'web' }); await flush(); });
    expect(r.outcome).toBe('pending');
    const { S, Q, env, table } = await afterDeploy();
    env.onFetch(() => ({ status: 502, body: {} }));
    const hook2 = mount<{ id: string; name: string }>(S.coreSource('ar-pages-legacy-rn', table), 'rename', Q.queryClient);
    await act(async () => { r = await hook2().mutateAsync({ id: 'c9', name: 'web' }); await env.settle(40); });
    expect(r.outcome).toBe('not_sent');
    expect(env.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });
});
