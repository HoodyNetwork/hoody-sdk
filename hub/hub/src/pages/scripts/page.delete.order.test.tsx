// Vitest, mounted on core's real change source: the delete of a script is three changes in order, each its own lock and outcome
// its public links off, the script gone, its saved tests gone. The real Settings tab, real mutation hooks and the real
// core run; only the three reads of the tab (file, env, saved tests) and the toast are replaced, and the network answers by hand.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, R2, settle, TARGET, type Call, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({
  alias: 200,
  del: 200,
  tests: 200,
  settle: 'unknown' as string,
  toasts: [] as Array<{ title: string; tone?: string }>,
  testsDoc: undefined as unknown,
}));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { world.toasts.push(c); return 'toast-1'; } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useTests: () => ({ data: world.testsDoc, refetch: async () => undefined }),
}));

import { useAliasState, useRemove, useTestsDelete } from './data';
import { SettingsTab } from './parts/SettingsTab';
import strings from './strings.en.json';

const REV = 'abcdef0123456789';
const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const link = (id: string, enabled: boolean) => ({ id, url: `https://${id}.example`, target_path: '/a', enabled, program: 'exec', index: 1 });
const comp = (aliases: unknown[], extra: object = {}) => ({ id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, ownerRealm: R1, instances: {}, rows: [], summary: {}, aliases, deleted: [], ...extra } as never);
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const status = (n: number): Reply => (n === 200 ? { status: 200, body: { data: {} } } : { status: n, body: { error: { code: 'BAD_REQUEST' } } });
const reply = (c: Call): Reply => {
  // The delete asks Exec who answers each link first (this script: its own link goes off).
  if (c.url.includes('/exec/route/resolve')) return { status: 200, body: { matched: true, scriptPath: 'default/1/a.ts', type: 'static' } };
  if (c.url.includes('/proxy/aliases/')) return status(world.alias);
  if (c.url.includes('/exec/scripts/delete') || c.url.includes('/script-instances/delete')) return status(world.del);
  if (c.url.includes('/exec/tests/delete')) return status(world.tests);
  if (c.url.includes('/exec/ops/settle')) return { status: 200, body: { opId: 'x', state: world.settle } };
  // The computer still lists the script: a read-back proves nothing about a delete that may have gone through.
  if (c.url.includes('/exec/scripts/list')) return { status: 200, body: { scripts: [{ path: 'default/1/a.ts' }] } };
  return { status: 200, body: { data: {} } };
};
// The sends of the delete, in the order they left.
const sent = () => calls.filter((c) => c.method !== 'GET' && !c.url.includes('/route/resolve')).map((c) => (c.url.includes('/proxy/aliases/') ? `alias:${c.url.split('/aliases/')[1]}:${JSON.stringify(c.body)}` : c.url.includes('/scripts/delete') ? 'remove' : c.url.includes('/tests/delete') ? 'testsDelete' : c.url.includes('/ops/settle') ? 'settle' : c.url));

let held: { alias: ReturnType<typeof useAliasState>; remove: ReturnType<typeof useRemove>; tests: ReturnType<typeof useTestsDelete> } | undefined;
function Probe() { held = { alias: useAliasState(), remove: useRemove(), tests: useTestsDelete() }; return null; }
const done = { current: 0 };
function mount(aliases: unknown[], it: unknown = item, extra: object = {}) {
  return render(<><Probe /><SettingsTab item={it as never} comp={comp(aliases, extra)} onChanged={() => undefined} onDeleted={() => { done.current++; }} /></>, { wrapper: CoreQueryProvider });
}
const click = async (name: string) => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); }); };
const deleteIt = async () => { await click(strings['delete.action']); await click(strings['delete.confirm']); };

describe('the delete of a script: public links off, then the script, then its saved tests', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    Object.assign(world, { alias: 200, del: 200, tests: 200, settle: 'unknown', testsDoc: { revision: REV, cases: [{ id: 't1', name: 'x', method: 'GET', route: '/a' }] } });
    world.toasts.length = 0;
    done.current = 0;
    onFetch(reply);
    setTarget(TARGET);
  });

  it('turns every active link off first (a link already off is left alone), then deletes, then removes the saved tests at their revision', async () => {
    mount([link('al1', true), link('al2', false), link('al3', true)]);
    await deleteIt();
    const s = sent();
    expect(s).toEqual(['alias:al1/state:{"enabled":false}', 'alias:al3/state:{"enabled":false}', 'remove', 'testsDelete']);
    const td = calls.find((c) => c.url.includes('/tests/delete'))!;
    expect(td.url).toContain(`ifRevision=${REV}`);
    expect(td.url).toMatch(/opId=[A-Za-z0-9_-]{16,64}/);
    expect(done.current).toBe(1);
    expect(held!.alias.held()).toEqual([]);
    expect(held!.remove.held()).toEqual([]);
  });

  it('a link that could not be turned off stops the delete: nothing is deleted, the reason is said, the banner names the link', async () => {
    world.alias = 400;
    mount([link('al1', true)]);
    await deleteIt();
    expect(sent()).toEqual(['alias:al1/state:{"enabled":false}']);
    expect(world.toasts.map((x) => x.title)).toContain(strings['delete.linksStopped']);
    expect(await screen.findByText(strings['outcome.failed.links'])).toBeTruthy();
    expect(done.current).toBe(0);
  });

  it('a link that may have been turned off stops the delete too: its banner and hold stay, the confirmation closes, Delete is locked', async () => {
    world.alias = 502;
    mount([link('al1', true)]);
    await deleteIt();
    expect(sent()).toEqual(['alias:al1/state:{"enabled":false}']);
    expect(await screen.findByText(strings['outcome.pending.links'])).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['delete.confirm'] })).toBeNull();
    expect((screen.getByRole('button', { name: strings['delete.action'] }) as HTMLButtonElement).disabled).toBe(true);
    expect(held!.alias.held()).toHaveLength(1);
    // Never said as a refusal: no "nothing was deleted" toast for an unknown outcome.
    expect(world.toasts).toEqual([]);
    // Check again proves nothing here (the list still shows the link on); only the warned close frees exactly that hold.
    await click(strings['outcome.check']);
    await click(strings['force.label']);
    await click(strings['force.confirm']);
    expect(held!.alias.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.links'])).toBeNull();
    expect(sent().filter((x) => x === 'remove')).toEqual([]);
  });

  it('a delete that may have gone through sends no tests delete, and says the links went off first', async () => {
    world.del = 502;
    mount([link('al1', true)]);
    await deleteIt();
    expect(sent()).toEqual(['alias:al1/state:{"enabled":false}', 'remove']);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    expect(world.toasts.map((x) => x.title)).toEqual([strings['delete.linksOff']]);
    expect(held!.remove.held()).toHaveLength(1);
    expect(done.current).toBe(0);
  });

  it('a refused tests delete leaves the deleted script deleted, says the tests stayed, and still closes the page', async () => {
    world.tests = 400;
    mount([]);
    await deleteIt();
    expect(sent()).toEqual(['remove', 'testsDelete']);
    expect(world.toasts.map((x) => x.title)).toEqual([strings['delete.testsLeft']]);
    expect(done.current).toBe(1);
  });

  it("a tests delete that may have gone through keeps its banner; the computer's own answer for its op ends it and closes the page", async () => {
    world.tests = 502;
    mount([]);
    await deleteIt();
    expect(await screen.findByText(strings['outcome.pending.tests'])).toBeTruthy();
    expect(done.current).toBe(0);
    expect(held!.tests.held()).toHaveLength(1);
    const opId = new URL(calls.find((c) => c.url.includes('/tests/delete'))!.url, 'https://x').searchParams.get('opId');
    world.settle = 'committed';
    await click(strings['outcome.check']);
    const st = calls.filter((c) => c.url.includes('/ops/settle'));
    expect(st).toHaveLength(1);
    expect(st[0]!.body.opId).toBe(opId);
    expect(held!.tests.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.tests'])).toBeNull();
    expect(done.current).toBe(1);
  });

  it("a guarded delete on a computer in several realms with every realm shown is asked in the realm ownership was read in", async () => {
    mount([], { ...(item as object), managed: { template: 'x', elsewhere: false } }, { ownerRealm: R2 });
    await deleteIt();
    const del = calls.find((c) => c.url.includes('/script-instances/delete'))!;
    expect(del).toBeTruthy();
    expect(JSON.stringify([del.url, del.headers, del.body])).toContain(R2);
  });

  it('no saved tests, no tests delete; no links, no link change', async () => {
    world.testsDoc = { revision: null, cases: [] };
    mount([]);
    await deleteIt();
    expect(sent()).toEqual(['remove']);
    expect(done.current).toBe(1);
  });
  // Check and the lock follow the hold the send left, not the script's metadata now, on core's real source.
  for (const [from, to, route] of [[{ template: 'x', elsewhere: false }, null, '/script-instances/delete'], [null, { template: 'x', elsewhere: false }, '/exec/scripts/delete']] as const) {
    it(`a ${from ? 'guarded' : 'ordinary'} delete that may have gone through, then the script is classified the other way: Check does not clear it and no second delete is sent`, async () => {
      world.del = 502;
      const start = { ...(item as object), managed: from };
      const view = mount([], start);
      await deleteIt();
      expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
      const destructive = () => calls.filter((c) => c.method !== 'GET' && (c.url.includes('/scripts/delete') || c.url.includes('/script-instances/delete')));
      expect(destructive()).toHaveLength(1);
      expect(destructive()[0]!.url).toContain(route);
      view.rerender(<><Probe /><SettingsTab item={{ ...(item as object), managed: to } as never} comp={comp([])} onChanged={() => undefined} onDeleted={() => { done.current++; }} /></>);
      await click(strings['outcome.check']);
      expect(screen.getByText(strings['outcome.pending.delete'])).toBeTruthy();
      expect((screen.getByRole('button', { name: strings['delete.action'] }) as HTMLButtonElement).disabled).toBe(true);
      expect(destructive()).toHaveLength(1);
      expect(done.current).toBe(0);
    });
  }
});
