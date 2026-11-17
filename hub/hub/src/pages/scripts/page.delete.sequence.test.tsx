// Vitest, mounted on core's real change source: the delete sequence (links off, the script, its saved tests) as one unit, so a
// press, a switch or a lost answer never splits it. The real Settings tab, real mutation hooks and the real core run; the three reads of the tab and the toast are
// replaced and the network answers by hand, with gates that hold a request open so a second press or a computer switch can land
// between two steps.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';

type Toast = { title: string; tone?: string; body?: string; action?: { label: string; onAction: () => unknown } };
const world = vi.hoisted(() => ({
  alias: 200,
  del: 200,
  tests: 200,
  settle: 'unknown' as string,
  listed: true,
  gate: {} as Record<string, Promise<void> | undefined>,
  toasts: [] as Array<{ title: string; tone?: string; body?: string; action?: { label: string; onAction: () => unknown } }>,
  testsDoc: undefined as unknown,
  throwOn: '' as string,
}));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: Toast) => { world.toasts.push(c); if (world.throwOn && c.title === world.throwOn) throw new Error('toast failed'); return 'toast-1'; } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useTests: () => ({ data: world.testsDoc, refetch: async () => undefined }),
}));

import { useAliasState, useRemove, useTestsDelete } from './data';
import { resetSequencesForTests, sequenceKey, sequenceOf } from './deleteSequence';
import { SettingsTab } from './parts/SettingsTab';
import strings from './strings.en.json';

const REV = 'abcdef0123456789';
const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const link = (id: string, enabled: boolean) => ({ id, url: `https://${id}.example`, target_path: '/a', enabled, program: 'exec', index: 1 });
const comp = (aliases: unknown[], extra: object = {}) => ({ id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, ownerRealm: R1, instances: {}, rows: [], summary: {}, aliases, deleted: [], ...extra } as never);
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const status = (n: number): Reply => (n === 200 ? { status: 200, body: { data: {} } } : { status: n, body: { error: { code: 'BAD_REQUEST' } } });
const gated = async (name: string, r: Reply): Promise<Reply> => { await world.gate[name]; return r; };
const reply = (c: Call): Reply | Promise<Reply> => {
  // The delete asks Exec who answers each link first (this script: its own link goes off).
  if (c.url.includes('/exec/route/resolve')) return { status: 200, body: { matched: true, scriptPath: 'default/1/a.ts', type: 'static' } };
  if (c.url.includes('/proxy/aliases/')) return gated('alias', status(world.alias));
  if (c.url.includes('/exec/scripts/delete') || c.url.includes('/script-instances/delete')) return gated('remove', status(world.del));
  if (c.url.includes('/exec/tests/delete')) return gated('tests', status(world.tests));
  if (c.url.includes('/exec/ops/settle')) return { status: 200, body: { opId: 'x', state: world.settle } };
  if (c.url.includes('/exec/scripts/list')) return { status: 200, body: { scripts: world.listed ? [{ path: 'default/1/a.ts' }, { path: 'default/1/b.ts' }] : [{ path: 'default/1/b.ts' }] } };
  return { status: 200, body: { data: {} } };
};
const sent = () => calls.filter((c) => c.method !== 'GET' && !c.url.includes('/route/resolve')).map((c) => (c.url.includes('/proxy/aliases/') ? 'alias' : c.url.includes('/scripts/delete') ? 'remove' : c.url.includes('/tests/delete') ? 'testsDelete' : c.url.includes('/ops/settle') ? 'settle' : c.url));
const hold = (name: string): (() => void) => {
  let open = () => undefined as void;
  world.gate[name] = new Promise<void>((res) => { open = res; });
  return () => { world.gate[name] = undefined; open(); };
};

let held: { alias: ReturnType<typeof useAliasState>; remove: ReturnType<typeof useRemove>; tests: ReturnType<typeof useTestsDelete> } | undefined;
function Probe() { held = { alias: useAliasState(), remove: useRemove(), tests: useTestsDelete() }; return null; }
const done = { current: 0 };
const tree = (aliases: unknown[], extra: object = {}) => <><Probe /><SettingsTab item={item} comp={comp(aliases, extra)} onChanged={() => undefined} onDeleted={() => { done.current++; }} /></>;
const mount = (aliases: unknown[], extra: object = {}) => render(tree(aliases, extra), { wrapper: CoreQueryProvider });
const click = async (name: string) => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); }); };
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const managedItem = { ...(item as object), managed: { template: 'x', elsewhere: false } } as never;
const OTHER_COMPUTER = { project: { id: 'p1' }, container: { id: 'c2', server_name: 'sv2' } };

describe('the delete sequence is one unit', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    Object.assign(world, { alias: 200, del: 200, tests: 200, settle: 'unknown', listed: true, gate: {}, testsDoc: { revision: REV, cases: [{ id: 't1', name: 'x', method: 'GET', route: '/a' }] } });
    world.toasts.length = 0;
    done.current = 0;
    resetSequencesForTests();
    world.throwOn = '';
    onFetch(reply);
    setTarget(TARGET);
  });

  it('a second press of the confirmation while a link is being turned off starts no second sequence', async () => {
    const release = hold('alias');
    mount([link('al1', true)]);
    await click(strings['delete.action']);
    // Two presses in the same tick: the second lands before any render could have disabled the button.
    await act(async () => { const b = await screen.findByRole('button', { name: strings['delete.confirm'] }); fireEvent.click(b); fireEvent.click(b); await flush(); });
    expect(sent()).toEqual(['alias']);
    release();
    await act(async () => { await flush(); });
    expect(sent()).toEqual(['alias', 'remove', 'testsDelete']);
    expect(done.current).toBe(1);
    // The second press was ignored whole: it did not read as a link that stopped the delete.
    expect(world.toasts).toEqual([]);
  });

  it('while the saved tests are being removed the confirmation cannot send the script delete again, and the page closes once', async () => {
    const release = hold('tests');
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(sent()).toEqual(['remove', 'testsDelete']);
    const again = screen.queryByRole('button', { name: strings['delete.confirm'] }) as HTMLButtonElement | null;
    if (again) await act(async () => { fireEvent.click(again); await flush(); });
    expect(sent()).toEqual(['remove', 'testsDelete']);
    expect(done.current).toBe(0);
    release();
    await act(async () => { await flush(); });
    expect(sent()).toEqual(['remove', 'testsDelete']);
    expect(done.current).toBe(1);
  });

  it('a computer switch between two steps does not move the later steps: they still go to the computer the delete was confirmed on', async () => {
    const release = hold('alias');
    mount([link('al1', true)]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    await act(async () => { setTarget(OTHER_COMPUTER); await flush(); });
    release();
    const writesOf = () => calls.filter((c) => c.url.includes('/scripts/delete') || c.url.includes('/tests/delete'));
    await act(async () => { await vi.waitFor(() => expect(writesOf()).toHaveLength(2), { timeout: 4000 }); });
    const writes = writesOf();
    expect(writes).toHaveLength(2);
    for (const w of writes) {
      // The host only: the query carries a random op id.
      const host = new URL(w.url).host;
      expect(host).toContain('-c1-');
      expect(host).not.toContain('-c2-');
    }
  });

  it('with the public links unread Delete is off and says why; nothing is sent', async () => {
    mount([], { aliasesRead: false });
    expect(button(strings['delete.action']).disabled).toBe(true);
    expect(screen.getByText(strings['delete.block.links'])).toBeTruthy();
    expect(sent()).toEqual([]);
  });

  it('links read as none (read, empty) leave Delete available', async () => {
    mount([], { aliasesRead: true });
    expect(button(strings['delete.action']).disabled).toBe(false);
    expect(screen.queryByText(strings['delete.block.links'])).toBeNull();
  });

  it("a script delete that may have gone through and whose op the computer settles as committed carries on with the saved tests, once", async () => {
    world.del = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    expect(sent()).toEqual(['remove']);
    world.settle = 'committed';
    await click(strings['outcome.check']);
    expect(sent()).toEqual(['remove', 'settle', 'testsDelete']);
    expect(new URL(calls.find((c) => c.url.includes('/tests/delete'))!.url, 'https://x').searchParams.get('ifRevision')).toBe(REV);
    expect(done.current).toBe(1);
    expect(held!.remove.held()).toEqual([]);
  });

  it('a pending delete proven by a fresh list (the script is gone) carries on with the saved tests too', async () => {
    world.del = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    world.listed = false;
    await click(strings['outcome.check']);
    expect(sent().filter((x) => x === 'testsDelete')).toEqual(['testsDelete']);
    expect(done.current).toBe(1);
  });

  it('a pending delete that is still unproven sends no saved-tests delete', async () => {
    world.del = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    await click(strings['outcome.check']);
    expect(sent().filter((x) => x === 'testsDelete')).toEqual([]);
    expect(done.current).toBe(0);
  });

  it('saved tests that may have been removed raise a toast that stays and carries its own Check again; a proof closes it', async () => {
    world.tests = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    const toast = world.toasts.find((x) => x.title === strings['delete.testsPending'])!;
    expect(toast.tone).toBe('unknown');
    expect(toast.action?.label).toBe(strings['delete.testsCheck']);
    expect(done.current).toBe(0);
    expect(held!.tests.held()).toHaveLength(1);
    // Nothing proves it yet: the toast stays (false), the hold stays.
    expect(await toast.action!.onAction()).toBe(false);
    expect(held!.tests.held()).toHaveLength(1);
    world.settle = 'committed';
    expect(await toast.action!.onAction()).toBe(true);
    expect(held!.tests.held()).toEqual([]);
    expect(sent().filter((x) => x === 'testsDelete')).toHaveLength(1);
  });

  it('a saved-tests read that never answered is said, not skipped silently', async () => {
    world.testsDoc = undefined;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(sent()).toEqual(['remove']);
    expect(world.toasts.map((x) => x.title)).toEqual([strings['delete.testsUnread']]);
    expect(done.current).toBe(1);
  });

  it('an answer with no saved set removes nothing and says nothing; a computer without saved tests likewise', async () => {
    world.testsDoc = { revision: null, cases: [] };
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(sent()).toEqual(['remove']);
    expect(world.toasts).toEqual([]);
    expect(done.current).toBe(1);
  });

  it('the toast\'s Check, answered unknown, keeps the banner and the Delete lock; it frees nothing', async () => {
    world.tests = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    const toast = world.toasts.find((x) => x.title === strings['delete.testsPending'])!;
    expect(await screen.findByText(strings['outcome.pending.tests'])).toBeTruthy();
    expect(await toast.action!.onAction()).toBe(false);
    await act(async () => { await flush(); });
    expect(screen.getByText(strings['outcome.pending.tests'])).toBeTruthy();
    expect(button(strings['delete.action']).disabled).toBe(true);
    expect(held!.tests.held()).toHaveLength(1);
    expect(sent().filter((x) => x === 'remove')).toHaveLength(1);
  });

  it('a tab left and entered again while the saved-tests step is out finds Delete off and sends no second script delete', async () => {
    const release = hold('tests');
    const first = mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(sent()).toEqual(['remove', 'testsDelete']);
    first.unmount();
    mount([]);
    await act(async () => { await flush(); });
    expect(button(strings['delete.action']).disabled).toBe(true);
    await act(async () => { fireEvent.click(button(strings['delete.action'])); await flush(); });
    expect(screen.queryByRole('button', { name: strings['delete.confirm'] })).toBeNull();
    expect(sent()).toEqual(['remove', 'testsDelete']);
    release();
    await act(async () => { await flush(); });
    expect(sent()).toEqual(['remove', 'testsDelete']);
    expect(done.current).toBe(1);
  });

  it('a guarded (managed) delete after a computer switch still goes to the computer it was confirmed on', async () => {
    const release = hold('alias');
    render(<><Probe /><SettingsTab item={managedItem} comp={comp([link('al1', true)])} onChanged={() => undefined} onDeleted={() => { done.current++; }} /></>, { wrapper: CoreQueryProvider });
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    await act(async () => { setTarget(OTHER_COMPUTER); await flush(); });
    release();
    await act(async () => { await vi.waitFor(() => expect(calls.some((c) => c.url.includes('/script-instances/delete'))).toBe(true), { timeout: 4000 }); });
    const del = calls.find((c) => c.url.includes('/script-instances/delete'))!;
    expect(new URL(del.url).host).toContain('-c1-');
    expect(new URL(del.url).host).not.toContain('-c2-');
    // Let the sequence end inside this test: its saved-tests step must not leak into the next one.
    await act(async () => { await vi.waitFor(() => expect(done.current).toBe(1), { timeout: 4000 }); });
  });

  it('a tab entered again while the script delete is held carries on with the saved tests when a fresh list proves it', async () => {
    world.del = 502;
    const first = mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    first.unmount();
    mount([]);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    world.listed = false;
    await click(strings['outcome.check']);
    expect(sent().filter((x) => x === 'testsDelete')).toEqual(['testsDelete']);
    expect(done.current).toBe(1);
  });

  it('two Checks at once run the saved-tests step once and tell the page once, after it is done', async () => {
    world.del = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    world.listed = false;
    const release = hold('tests');
    await act(async () => { const b = await screen.findByRole('button', { name: strings['outcome.check'] }); fireEvent.click(b); fireEvent.click(b); await flush(); });
    expect(sent().filter((x) => x === 'testsDelete')).toEqual(['testsDelete']);
    expect(done.current).toBe(0);
    release();
    await act(async () => { await flush(); });
    expect(sent().filter((x) => x === 'testsDelete')).toEqual(['testsDelete']);
    expect(done.current).toBe(1);
  });

  it('a held script delete found again with no sequence on record (the page was reloaded) is told over by its proof; no saved-tests delete is guessed', async () => {
    world.del = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    resetSequencesForTests();
    world.listed = false;
    await click(strings['outcome.check']);
    expect(sent().filter((x) => x === 'testsDelete')).toEqual([]);
    expect(done.current).toBe(1);
  });

  for (const [state, label] of [['fenced', 'never ran'], ['refused', 'was refused']] as const) {
    it(`a saved-tests step the computer says ${label} is over: the hold is freed, the page is told once, the sequence is closed`, async () => {
      world.tests = 502;
      mount([]);
      await click(strings['delete.action']);
      await click(strings['delete.confirm']);
      const toast = world.toasts.find((x) => x.title === strings['delete.testsPending'])!;
      world.settle = state;
      expect(await toast.action!.onAction()).toBe(true);
      expect(held!.tests.held()).toEqual([]);
      expect(done.current).toBe(1);
      expect(sequenceOf(sequenceKey('c1', 'default/1/a.ts'))).toBeUndefined();
    });
  }

  it('a saved-tests step the computer refused says the saved tests were kept, never "send it again here" (the page closes)', async () => {
    world.tests = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    const toast = world.toasts.find((x) => x.title === strings['delete.testsPending'])!;
    world.settle = 'refused';
    world.toasts.length = 0;
    expect(await toast.action!.onAction()).toBe(true);
    expect(done.current).toBe(1);
    const failed = world.toasts.filter((x) => x.title === strings['check.failed']);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ tone: 'error', body: strings['check.failedTests'].replace('{{code}}', 'REFUSED') });
    expect(failed[0]!.body).not.toBe(strings['check.failedFix'].replace('{{code}}', 'REFUSED'));
  });

  it('a step that throws after the script is gone does not leave the delete lock on for good', async () => {
    mount([]);
    world.toasts.length = 0;
    world.throwOn = strings['delete.testsLeft'];
    world.tests = 400;
    await click(strings['delete.action']);
    // The thrown toast surfaces as the rejection of the press (nothing awaits it): swallow it here, it is the thing under test.
    const swallow = () => undefined;
    process.on('unhandledRejection', swallow);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: strings['delete.confirm'] })); await flush(); });
    process.off('unhandledRejection', swallow);
    expect(sequenceOf(sequenceKey('c1', 'default/1/a.ts'))).toBeUndefined();
  });

  it('a warned close of the held script delete ends what was owed: nothing more is sent for it', async () => {
    world.del = 502;
    mount([]);
    await click(strings['delete.action']);
    await click(strings['delete.confirm']);
    await click(strings['outcome.check']);
    await click(strings['force.label']);
    await click(strings['force.confirm']);
    expect(held!.remove.held()).toEqual([]);
    expect(sent().filter((x) => x === 'testsDelete')).toEqual([]);
    expect(done.current).toBe(0);
  });
});
