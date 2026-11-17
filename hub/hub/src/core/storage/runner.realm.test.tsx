// A runner's Check again reads back, proves and
// releases only the hold its band shows. Under All realms every realm's hold is read (readsRealm), so a check that read
// back every pending change of the sender, refreshing the read in every realm, released another realm's hold with that
// realm's own answer. The automatic read-back after a send refreshes only its change's realm and still proves it.
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as C from '../changes';
import { setRealm } from '../ctx';
import { queryClient } from '../query';
import { defineRoute } from '../routes';
import { coreSource, type SourceResult } from '../source';
import { boot, calls, onFetch, R1, R2, settle } from '../test/env';
import { useRunner } from './runner';

type Vars = { realm: string };
const wrap = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
const status = defineRoute<{ on: boolean }>({ method: 'GET', path: '/rbr/status', scope: 'agent' });
/** The same status as an All realms list (realm=all is a valid ask): its key under All realms names no realm. */
const statusAll = defineRoute<{ on: boolean }>({ method: 'GET', path: '/rbr/status-all', scope: 'agent', realm: 'list' });
const flip = defineRoute<unknown, { on: boolean }>({ method: 'POST', path: '/rbr/flip', scope: 'agent', body: ['on'], idem: true });
/** Applied when a fresh status answer the read-back may judge (the change's computer and realm) says on. */
const on = (_identity: unknown, answers: readonly (readonly unknown[])[]): 'applied' | undefined =>
  (answers[0] ?? []).some((a) => (a as { on?: boolean } | undefined)?.on === true) ? 'applied' : undefined;
let n = 0;
/** A source whose change is held (its POST's outcome is unknown) and whose status read proves it went through. */
const sourceOf = (lock: string, read = status) => coreSource('rbr-' + ++n, {
  reads: { status: { route: read, input: (p: { realm?: string } | undefined) => (p?.realm ? { realm: p.realm } : {}) } },
  changes: { flip: { route: flip, lock, input: (v: Vars) => ({ realm: v.realm, body: { on: true } }), lockKey: (v: Vars) => ({ realm: v.realm }), reads: ['status'], proves: on } },
});
const realmOf = (url: string): string | null => new URL(url).searchParams.get('realm');
const gets = () => calls.filter((c) => c.method === 'GET');
async function flush(): Promise<void> { for (let i = 0; i < 20; i++) await settle(); }

type Runner = ReturnType<typeof useRunner<Vars>>;
interface Page { send: (v: Vars) => Promise<SourceResult<unknown>>; runner: Runner; shown: unknown[] }
/** A page under `src` reading `reads` (status params) with a runner over `lock` whose place picks `pick`. */
function mount(src: ReturnType<typeof sourceOf>, lock: string, reads: ReadonlyArray<{ realm?: string } | undefined>, pick?: (i: Record<string, unknown>) => boolean): { page: () => Page } {
  let last!: Page;
  function Probe() {
    const qs = src.useQueries<{ on: boolean }, { realm?: string } | undefined>('status', reads as Array<{ realm?: string } | undefined>);
    const m = src.useMutation<unknown, Vars>('flip');
    const runner = useRunner<Vars>(m, { lock, ...(pick ? { pick } : {}), vars: (i) => ({ realm: String(i.realm ?? '') }) });
    last = { send: (v) => m.mutateAsync(v), runner, shown: qs.map((q) => q.data) };
    return null;
  }
  render(<Probe />, { wrapper: wrap });
  return { page: () => last };
}
const held = (lock: string) => C.heldChanges(lock, { realm: null }).map((h) => (h.identity as Vars).realm).sort();

let applied = false;
let seen: unknown[] = [];
beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  applied = false;
  onFetch((c) => (c.method === 'POST' ? { status: 502, body: {} } : { status: 200, body: { on: applied } }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** Two holds of one lock, one per realm (the status read said off then), under All realms. */
async function twoHolds(lock: string, pick?: (i: Record<string, unknown>) => boolean): Promise<() => Page> {
  await act(async () => { setRealm('all'); });
  const { page } = mount(sourceOf(lock), lock, [{ realm: R1 }, { realm: R2 }], pick);
  await act(async () => { await flush(); });
  for (const realm of [R1, R2]) {
    let r!: SourceResult<unknown>;
    await act(async () => { r = await page().send({ realm }); await flush(); });
    expect(r.outcome, `the ${realm} send is held`).toBe('pending');
  }
  expect(held(lock)).toEqual([R1, R2].sort());
  return page;
}

describe('a runner\'s Check again reads back only the hold it shows (:1578)', () => {
  it('under All realms: the shown hold is proved and released; the other realm\'s hold stays and its realm is never read', async () => {
    const page = await twoHolds('rbr.all');
    const shown = (page().runner.held as Vars).realm;
    const other = shown === R1 ? R2 : R1;
    applied = true; // both went through: only the shown one may be proved by this press
    const before = gets().length;
    let ok!: boolean;
    await act(async () => { ok = await page().runner.check(); await flush(); });
    expect(ok).toBe(true);
    expect(held('rbr.all'), 'Check again on one hold released another realm\'s hold').toEqual([other]);
    const asked = gets().slice(before).map((c) => realmOf(c.url));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked, 'Check again on one hold asked another realm').not.toContain(other);
    expect(page().runner.held, 'the band now shows the other hold, still unknown').toEqual({ realm: other });
    expect(page().runner.outcome).toEqual({ kind: 'pending' });
  });

  it('a place that shows no hold reads nothing back and releases nothing: false, and the band stays unknown, never failed or done (C9)', async () => {
    const page = await twoHolds('rbr.none', () => false);
    expect(page().runner.held).toBeNull();
    applied = true;
    const before = calls.length;
    let ok!: boolean;
    await act(async () => { ok = await page().runner.check(); await flush(); });
    expect(ok).toBe(false);
    expect(calls.length, 'a check with no shown hold sent a request').toBe(before);
    expect(held('rbr.none')).toEqual([R1, R2].sort());
    expect(page().runner.outcome, 'a check with no shown hold claimed an outcome').toBeUndefined();
  });

  it('a band showing a hold without its send token reads nothing back: false, both holds stay, the band stays unknown (C9)', async () => {
    const real = C.heldChanges;
    vi.spyOn(C, 'heldChanges').mockImplementation((lock, o) => real(lock, o).map((h) => ({ ...h, hold: undefined })));
    const page = await twoHolds('rbr.token');
    expect(page().runner.held).not.toBeNull();
    expect(page().runner.hold).toBeUndefined();
    applied = true;
    const before = calls.length;
    let ok!: boolean;
    await act(async () => { ok = await page().runner.check(); await flush(); });
    expect(ok).toBe(false);
    expect(calls.length, 'a check of a band without a token sent a request').toBe(before);
    expect(real('rbr.token', { realm: null })).toHaveLength(2);
    expect(page().runner.outcome, 'the band left unknown').toEqual({ kind: 'pending' });
  });
});

describe('the automatic read-back after a send still proves its own change, reading only its realm', () => {
  const sendProved = async (lock: string, reads: ReadonlyArray<{ realm?: string } | undefined>, realm: string, read = status, then?: (page: () => Page) => void): Promise<Array<string | null>> => {
    const { page } = mount(sourceOf(lock, read), lock, reads);
    await act(async () => { await flush(); });
    if (then) await act(async () => { then(page); await flush(); });
    applied = true; // the POST's answer is lost, the change went through
    const before = gets().length;
    let r!: SourceResult<unknown>;
    await act(async () => { r = await page().send({ realm }); await flush(); });
    expect(r.outcome).toBe('pending');
    expect(held(lock), 'the read-back after the send did not prove it').toEqual([]);
    seen = page().shown;
    return gets().slice(before).map((c) => realmOf(c.url));
  };

  it('one realm shown, a read that names its realm (key slot 9)', async () => {
    expect(await sendProved('rbr.auto1', [{ realm: R1 }], R1)).toEqual([R1]);
  });
  it('one realm shown, a read that names none (slot 9 empty: the key\'s shown realm)', async () => {
    expect(await sendProved('rbr.auto2', [undefined], R1)).toEqual([R1]);
  });
  it('one realm shown, the page\'s own read with params but no realm is the one re-read (it shows the fresh answer)', async () => {
    expect(await sendProved('rbr.auto2b', [{}], R1)).toEqual([R1]);
    expect(seen, 'the page\'s read was not re-read in place').toEqual([{ on: true }]);
  });
  it('a read that names no realm, kept from another realm\'s view, is not re-read for this realm\'s change', async () => {
    await act(async () => { setRealm(R2); });
    // Mounted in R2 (its key's realm is R2, slot 9 empty), then R1 is shown: the R2 key stays cached, enabled.
    expect(await sendProved('rbr.auto2c', [{}], R1, status, () => setRealm(R1))).toEqual([R1]);
  });
  it('All realms shown, reads naming each realm: only the change\'s realm is asked', async () => {
    await act(async () => { setRealm('all'); });
    expect(await sendProved('rbr.auto3', [{ realm: R1 }, { realm: R2 }], R2)).toEqual([R2]);
  });
  it('All realms shown, a list read that names none (slot 9 empty: the All realms key reads every realm)', async () => {
    await act(async () => { setRealm('all'); });
    expect(await sendProved('rbr.auto4', [undefined], R2, statusAll)).toEqual(['all']);
  });
});
