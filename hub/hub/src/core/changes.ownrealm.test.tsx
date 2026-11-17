// A change that names its own realm on every call (`explicitRealm`: the page's own choice, such as
// the Memory page's Global store, which the top bar never shows) is filed, held, read back and dismissed in that realm
// whatever realm the top bar shows: its hold counts in every realm view, is never sent again after a realm switch, and
// only reads that name its realm judge it. Without the option nothing changes: a change of a realm not shown is left
// out, as before.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from './changes';
import { initCore, setIdentity, setRealm } from './ctx';
import { defineMutation, defineQuery, queryClient, type MutationHook, type QueryDef } from './query';
import { defineRoute } from './routes';
import { coreSource, type SourceMutation } from './source';
import type { Target } from './ctx';
import { useRunner } from './storage/runner';
import { boot, calls, onFetch, R1, R2, settle, UID } from './test/env';
import { resetToken } from './token';

type Vars = { realm: string; id: string };
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const realmOf = (url: string): string | null => new URL(url).searchParams.get('realm');
const sends = () => calls.filter((c) => c.method === 'PATCH');
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

// The store: `applied` is what a GET of a realm answers (each realm its own). A PATCH always loses its answer (502).
let applied: Record<string, boolean> = {};
/** The store's answers (installed again after a test boots its own tab: boot() puts the default handler back). */
const answerStore = (): void => onFetch((c) => (c.method === 'GET' ? { status: 200, body: { on: applied[realmOf(c.url) ?? ''] === true } } : { status: 502, body: {} }));
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  applied = {};
  answerStore();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Applied when a fresh answer of the change's realm says on. */
const on = (_identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined =>
  (answers[0] ?? []).some((a) => (a as { on?: boolean } | undefined)?.on === true) ? 'applied' : undefined;

let n = 0;
function sourceDef(explicitRealm: boolean, shared = true) {
  const id = ++n;
  const item = defineRoute<{ on: boolean }>({ method: 'GET', path: `/own/${id}/item`, scope: 'agent', realm: 'realm' });
  const edit = defineRoute<unknown>({ method: 'PATCH', path: `/own/${id}/item`, scope: 'agent', realm: 'realm', body: ['on'], idem: true });
  const lock = `own.s${id}`;
  const src = coreSource(`own-src-${id}`, {
    reads: { item: { route: item, input: (p: { realm: string }) => ({ realm: p.realm }) } },
    changes: {
      edit: {
        route: edit, ...(shared ? { lock } : {}), input: (v: Vars) => ({ ...(v.realm ? { realm: v.realm } : {}), body: { on: true } }), lockKey: (v: Vars) => ({ realm: v.realm, id: v.id }),
        reads: ['item'], proves: on, ...(explicitRealm ? { explicitRealm: true } : {}),
      },
    },
  } as never);
  return { src, lock: shared ? lock : null };
}
/** A token session pinned to `realm` (core/ctx.ts initCore): pinned to one realm, its agent calls act in it whatever realm
 *  they name. Only the pin changes (the stored session stays the account's): enough for a press refused before the
 *  liveness check, never for one that must be sent (its context would be gone: shared.js holdsIdentity). */
const tokenPinnedTo = (realm: string): void => initCore({ page: { kind: 'token', uid: 'u-token', sid: null }, tokenRealm: realm });
const TOKEN = 'hdy_' + 'a'.repeat(24) + '_' + 'b'.repeat(48);
/** A real tab whose session is an access key with no realm limit (pinned 'all'; kit.test.ts keyTab): the stored session and
 *  the shown account are the key's, so a press's context stays alive and its call is sent. The top bar shows R1. With
 *  the pin on every realm, its agent calls act in the realm they name (kit.ts agentRealm). */
function keyTabAll(): void {
  const rec = JSON.stringify({ v: 1, token: TOKEN, realm: 'all', sid: 'tsid000000000001', at: 1, owner: { id: UID, username: 'owner' } });
  boot({ realm: R1, signedIn: false, identity: false, storage: { hub_token_session_v1: rec } });
  resetToken();
  setIdentity({ id: UID, banned: false });
  queryClient.clear();
  answerStore();
}
/** Mounts the change and a read of each realm in `reads` (the Global page reads Global while the top bar shows R1). */
function mountSource(src: ReturnType<typeof sourceDef>['src'], reads: string[]): () => SourceMutation<unknown, Vars> {
  let last!: SourceMutation<unknown, Vars>;
  function Read({ realm }: { realm: string }) { src.useQuery('item', { realm }); return null; }
  function Probe() { last = src.useMutation<unknown, Vars>('edit'); return <>{reads.map((r) => <Read key={r} realm={r} />)}</>; }
  render(<Probe />, { wrapper: wrap });
  return () => last;
}
const G: Vars = { realm: 'global', id: 'm1' };
/** Check again on the send a band shows (the runner's readBack({ hold }); ChangeControls types only the bare call). */
const checkHold = (m: SourceMutation<unknown, Vars>, hold: string): Promise<boolean> => (m.readBack as (o?: { hold: string }) => Promise<boolean>)({ hold });

describe('coreSource explicitRealm: a Global change while the top bar shows a realm', () => {
  it('its lost answer is held in the realm view, filed under Global, and the PATCH names Global', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, ['global']);
    await act(async () => { await flush(); });
    let r!: { outcome: string };
    await act(async () => { r = await m().mutateAsync(G); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(sends().map((c) => realmOf(c.url))).toEqual(['global']);
    const held = C.heldChanges(lock!, { realm: R1 });
    expect(held.map((h) => h.identity), 'a Global hold is left out of the realm view').toEqual([{ realm: 'global', id: 'm1' }]);
    expect(C.pendingOf(C.lockBase(lock!)).map((c) => c.realm)).toEqual(['global']);
  });

  it('after a realm switch it is still held there, and a second press is refused, never sent again', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, ['global']);
    await act(async () => { await flush(); await m().mutateAsync(G); await flush(); });
    await act(async () => { setRealm(R2); await flush(); });
    expect(C.heldChanges(lock!, { realm: R2 }).map((h) => h.identity)).toEqual([{ realm: 'global', id: 'm1' }]);
    let again!: { outcome: string; code?: string };
    await act(async () => { again = await m().mutateAsync(G); await flush(); });
    expect(again.outcome).toBe('not_sent');
    expect(again.code).toBe('READ_BACK_FIRST');
    expect(sends()).toHaveLength(1);
  });

  it('Check again in the realm view reads Global and frees the hold the band shows when Global proves it', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, ['global']);
    await act(async () => { await flush(); await m().mutateAsync(G); await flush(); });
    const hold = C.heldChanges(lock!, { realm: R1 })[0]?.hold;
    expect(hold, 'no Global hold in the realm view to check').toBeTruthy();
    applied = { global: true };
    let ok!: boolean;
    await act(async () => { ok = await checkHold(m(), hold as string); await flush(); });
    expect(ok).toBe(true);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
    expect(sends()).toHaveLength(1);
  });

  it('only a read of Global judges it: the realm view\'s own read saying on frees nothing', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, ['global', R1]);
    await act(async () => { await flush(); await m().mutateAsync(G); await flush(); });
    const hold = C.heldChanges(lock!, { realm: null })[0]?.hold as string;
    applied = { [R1]: true };
    let ok!: boolean;
    await act(async () => { ok = await checkHold(m(), hold); await flush(); });
    expect(ok).toBe(false);
    expect(C.heldChanges(lock!, { realm: null })).toHaveLength(1);
    // No GET of R1 was asked for the read-back (only the Global instance can show the change).
    const before = calls.length;
    await act(async () => { await checkHold(m(), hold); await flush(); });
    expect(calls.slice(before).filter((c) => c.method === 'GET').map((c) => realmOf(c.url))).toEqual(['global']);
  });

  it('a warned Dismiss in the realm view frees the Global send it names', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, ['global']);
    await act(async () => { await flush(); await m().mutateAsync(G); await flush(); });
    const hold = C.heldChanges(lock!, { realm: R1 })[0]?.hold;
    expect(hold).toBeTruthy();
    let freed!: boolean;
    await act(async () => { freed = await m().dismiss(G, hold as string); await flush(); });
    expect(freed).toBe(true);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
  });

  it('pending reads true for the mount that sent it while the top bar shows a realm', async () => {
    const { src } = sourceDef(true);
    const m = mountSource(src, ['global']);
    await act(async () => { await flush(); await m().mutateAsync(G); await flush(); });
    expect(m().pending).toBe(true);
  });

  it('the runner on the Global page shows it pending (held), and Check again ends it', async () => {
    const { src, lock } = sourceDef(true);
    let runner!: ReturnType<typeof useRunner<Vars>>;
    function Page() {
      src.useQuery('item', { realm: 'global' });
      const m = src.useMutation<unknown, Vars>('edit');
      runner = useRunner<Vars>(m as never, { lock: lock!, pick: (i) => i.realm === 'global' && i.id === 'm1', vars: (i) => i as Vars });
      return null;
    }
    render(<Page />, { wrapper: wrap });
    await act(async () => { await flush(); await runner.run(G); await flush(); });
    expect(runner.outcome?.kind).toBe('pending');
    expect(runner.held).toEqual({ realm: 'global', id: 'm1' });
    applied = { global: true };
    let ok!: boolean;
    await act(async () => { ok = await runner.check(); await flush(); });
    expect(ok).toBe(true);
    expect(runner.outcome?.kind).not.toBe('pending');
  });

  it('without explicitRealm nothing changes: a Global change is left out of the realm view, as before', async () => {
    const { src, lock } = sourceDef(false);
    const m = mountSource(src, ['global']);
    let r!: { outcome: string };
    await act(async () => { await flush(); r = await m().mutateAsync(G); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(sends()).toHaveLength(1);
    expect(C.heldChanges(lock!, { realm: null })).toHaveLength(1);
    expect(C.heldChanges(lock!, { realm: R1 })).toEqual([]);
  });

  it('after a remount (no last press of its own) pending still reads true, with or without a shared lock', async () => {
    for (const shared of [true, false]) {
      const { src } = sourceDef(true, shared);
      let m = mountSource(src, ['global']);
      await act(async () => { await flush(); await m().mutateAsync(G); await flush(); });
      expect(m().pending).toBe(true);
      cleanup();
      m = mountSource(src, ['global']);
      await act(async () => { await flush(); });
      expect(m().pending, `a remount lost the Global hold (shared lock: ${String(shared)})`).toBe(true);
      cleanup();
    }
  });

  it('a token session pinned to a realm refuses a Global press unsent: its hold could never be proved', async () => {
    const { src, lock } = sourceDef(true);
    tokenPinnedTo(R1);
    const m = mountSource(src, ['global']);
    let r!: { outcome: string; code?: string };
    await act(async () => { await flush(); r = await m().mutateAsync(G); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'TOKEN_SESSION_REFUSED' });
    expect(sends()).toEqual([]);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
  });

  it('a token session pinned to every realm sends a Global press in Global and holds it there, as an account session does', async () => {
    keyTabAll();
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, ['global']);
    let r!: { outcome: string; code?: string };
    await act(async () => { await flush(); r = await m().mutateAsync(G); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(sends().map((c) => realmOf(c.url))).toEqual(['global']);
    expect(C.pendingOf(C.lockBase(lock!)).map((c) => c.realm)).toEqual(['global']);
  });

  it('a press that names no realm is refused unsent (INPUT_INVALID)', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, []);
    let r!: { outcome: string; code?: string };
    await act(async () => { await flush(); r = await m().mutateAsync({ realm: '', id: 'm3' }); await flush(); });
    expect(r).toMatchObject({ outcome: 'not_sent', code: 'INPUT_INVALID' });
    expect(sends()).toEqual([]);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
  });

  it('an explicit change of another realm id is judged only by that realm\'s reads, never the shown one\'s', async () => {
    const { src, lock } = sourceDef(true);
    const m = mountSource(src, [R2, R1]);
    await act(async () => { await flush(); await m().mutateAsync({ realm: R2, id: 'm2' }); await flush(); });
    expect(C.heldChanges(lock!, { realm: R1 }).map((h) => h.identity)).toEqual([{ realm: R2, id: 'm2' }]);
    const hold = C.heldChanges(lock!, { realm: R1 })[0]!.hold as string;
    applied = { [R1]: true };
    expect(await checkHold(m(), hold)).toBe(false);
    applied = { [R2]: true };
    let ok!: boolean;
    await act(async () => { ok = await checkHold(m(), hold); await flush(); });
    expect(ok).toBe(true);
  });

  it('is refused at declaration where the call carries no realm of its own (an account route, an agent route without one)', () => {
    const acct = defineRoute<unknown>({ method: 'POST', path: '/own/acct', scope: 'base' });
    const none = defineRoute<unknown>({ method: 'POST', path: '/own/none', scope: 'agent', realm: 'none' });
    for (const route of [acct, none]) {
      expect(() => coreSource(`own-bad-${++n}`, { changes: { k: { route, input: () => ({}), explicitRealm: true } } } as never)).toThrow(/explicitRealm/);
      expect(() => defineMutation(route, { input: () => ({}), explicitRealm: true } as never)).toThrow(/explicitRealm/);
    }
  });
});

describe('defineMutation explicitRealm', () => {
  function hookDef(explicitRealm: boolean) {
    const id = ++n;
    const status = defineRoute<{ on: boolean }>({ method: 'GET', path: `/own/${id}/status`, scope: 'agent', realm: 'realm' });
    const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: `/own/${id}/flip`, scope: 'agent', realm: 'realm', body: ['on'], idem: true });
    const read = defineQuery<{ on: boolean }, { on: boolean }, { realm: string }>(status, { input: (p) => ({ realm: p.realm }) });
    const lock = `own.q${id}`;
    const m = defineMutation<Vars>(flip, { input: (v: Vars) => ({ ...(v.realm ? { realm: v.realm } : {}), body: { on: true } }), lockKey: (v: Vars) => ({ realm: v.realm, id: v.id }), reads: [read], proves: on, lock, ...(explicitRealm ? { explicitRealm: true } : {}) } as never);
    return { read, m: m as ReturnType<typeof defineMutation<Vars>>, lock };
  }
  function mountHook(read: QueryDef<{ realm: string }, { on: boolean }>, m: ReturnType<typeof hookDef>['m'], realm: string): () => MutationHook<Vars, unknown> {
    let last!: MutationHook<Vars, unknown>;
    function Probe() { read.use({ realm }); last = m.use(); return null; }
    render(<Probe />, { wrapper: wrap });
    return () => last;
  }
  it('a Global hold shows in the realm view, Check again frees it, and a settle names it', async () => {
    const { read, m, lock } = hookDef(true);
    const hook = mountHook(read, m, 'global');
    await act(async () => { await flush(); expect((await hook().run(G)).outcome).toBe('pending'); await flush(); });
    const held = C.heldChanges(lock!, { realm: R1 });
    expect(held).toHaveLength(1);
    applied = { global: true };
    let ok!: boolean;
    await act(async () => { ok = await hook().readBack({ hold: held[0]!.hold as string }); await flush(); });
    expect(ok).toBe(true);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
  });
  it('a definition-level readBack(vars) in the realm view reads Global and frees it', async () => {
    const { read, m, lock } = hookDef(true);
    mountHook(read, m, 'global');
    let r!: { outcome: string };
    await act(async () => { await flush(); r = await m.run(G); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(C.heldChanges(lock!, { realm: null })).toHaveLength(1);
    const posts = calls.filter((c) => c.method === 'POST').length;
    expect(posts).toBe(1);
    applied = { global: true };
    let ok!: boolean;
    await act(async () => { ok = await m.readBack(G); await flush(); });
    expect(ok).toBe(true);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(posts);
  });
  it('without explicitRealm a Global hold stays out of the realm view, as before', async () => {
    const { read, m, lock } = hookDef(false);
    const hook = mountHook(read, m, 'global');
    let r!: { outcome: string };
    await act(async () => { await flush(); r = await hook().run(G); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(C.heldChanges(lock!, { realm: null })).toHaveLength(1);
    expect(C.heldChanges(lock!, { realm: R1 })).toEqual([]);
  });
  it('after a remount the hook still reads pending for a Global hold', async () => {
    const { read, m } = hookDef(true);
    let hook = mountHook(read, m, 'global');
    await act(async () => { await flush(); expect((await hook().run(G)).outcome).toBe('pending'); await flush(); });
    cleanup();
    hook = mountHook(read, m, 'global');
    await act(async () => { await flush(); });
    expect(hook().outcome, 'a remount lost the Global hold').toBe('pending');
  });
  it('a refused press still names the computer its variables target: lookups never fall back to the computer shown', async () => {
    const id = ++n;
    const status = defineRoute<{ on: boolean }>({ method: 'GET', path: `/own/${id}/status`, scope: 'agent', realm: 'realm' });
    const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: `/own/${id}/flip`, scope: 'agent', realm: 'realm', body: ['on'], idem: true });
    const read = defineQuery<{ on: boolean }, { on: boolean }, { realm: string }>(status, { input: (p) => ({ realm: p.realm }) });
    const lock = `own.t${id}`;
    // Computer A (TARGET) is shown; the variables target computer B.
    const B: Target = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv1' } };
    type TV = Vars & { target: Target };
    const def = (explicit: boolean) => defineMutation<TV>(flip, {
      input: (v: TV) => ({ target: v.target, ...(v.realm ? { realm: v.realm } : {}), body: { on: true } }),
      lockKey: (v: TV) => ({ realm: v.realm, id: v.id, computer: v.target.container.id }), reads: [read], proves: on, lock,
      name: explicit ? 'explicit' : 'plain', ...(explicit ? { explicitRealm: true } : {}),
    } as never) as ReturnType<typeof defineMutation<TV>>;
    const plain = def(false), explicit = def(true);
    // A hold of the same change on B, filed under the realm shown (an earlier send that named no realm).
    const v: TV = { realm: '', id: 'm9', target: B };
    expect((await plain.run(v)).outcome).toBe('pending');
    const held = C.heldChanges(lock, { realm: null });
    expect(held).toHaveLength(1);
    // The explicit definition refuses these variables unsent (they name no realm) ...
    const r = await explicit.run(v);
    expect(r).toMatchObject({ outcome: 'not_sent', error: { code: 'INPUT_INVALID' } });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    // ... but its lookups still name B's change, never computer A's.
    expect(await explicit.isPending(v)).toBe(true);
    expect(await explicit.holdOf(v)).toBe(held[0]!.hold);
    // Check again by these variables, with computer A's read mounted and saying applied: it never reads A, never answers
    // true, and B's hold stays.
    function ReadA() { read.use({ realm: R1 }); return null; }
    render(<ReadA />, { wrapper: wrap });
    await act(async () => { await flush(); });
    applied = { [R1]: true };
    const before = calls.length;
    let ok!: boolean;
    await act(async () => { ok = await explicit.readBack(v); await flush(); });
    expect(ok, 'a read of computer A answered for B\'s hold').toBe(false);
    expect(calls.slice(before).filter((c) => c.method === 'GET' && c.url.includes('p1-c1-')), 'Check again read computer A').toEqual([]);
    expect(C.heldChanges(lock, { realm: null }).map((h) => h.hold)).toEqual([held[0]!.hold]);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
  it('a token session pinned to a realm refuses a Global press unsent, from the hook and from run()', async () => {
    const { read, m, lock } = hookDef(true);
    tokenPinnedTo(R1);
    const hook = mountHook(read, m, 'global');
    let a!: unknown, b!: unknown;
    await act(async () => { await flush(); a = await hook().run(G); b = await m.run(G); await flush(); });
    for (const r of [a, b]) expect(r).toMatchObject({ outcome: 'not_sent', error: { code: 'TOKEN_SESSION_REFUSED' } });
    expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    expect(C.heldChanges(lock!, { realm: null })).toEqual([]);
  });
});
