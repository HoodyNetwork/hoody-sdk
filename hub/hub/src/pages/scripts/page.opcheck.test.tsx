// Vitest, mounted on core's real change source: every place that sends a change the computer journals by operation id offers the
// same Check again as the editor: the computer's own answer for that op first (committed frees the hold as done;
// never sent or refused frees it as not done), and only when it proves nothing the place's own read and the warned close. The
// real Recently deleted drawer, saved-tests tab and settings tab run with the real mutation hooks; only the three reads of those
// tabs (file, env, saved tests) and the toast are replaced, and the network answers by hand.
// It also covers the last saved test removed through tests/delete. The key and the other settings are the Magic
// comments panel's, tested in page.magic.test.tsx.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';

const B = { ...TARGET, container: { id: 'c2', server_name: 'sv1' } };

const world = vi.hoisted(() => ({
  status: 200,
  settle: 'unknown' as string,
  settleCode: undefined as string | undefined,
  toasts: [] as Array<{ title: string; tone?: string; body?: string; action?: unknown }>,
  errors: [] as Array<{ title: string; error: unknown; opts?: { change?: boolean } }>,
  cases: [] as unknown[],
}));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string; body?: string; action?: unknown }) => { world.toasts.push(c); return 'toast-1'; }, showErrorToast: (title: string, error: unknown, opts?: { change?: boolean }) => { world.errors.push({ title, error, opts }); return 'toast-2'; } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useTests: () => ({ data: { revision: 'abcdef0123456789', cases: world.cases }, refetch: async () => undefined }),
}));

import { useAliasState, useRestore, useSetComments, useTestsPut } from './data';
import { DeletedDrawer } from './parts/DeletedDrawer';
import { TestTab } from './parts/TestTab';
import strings from './strings.en.json';
import type { CompScripts } from './types';

const PATH = 'default/1/a.ts';
const item = (extra: object = {}) => ({ id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: PATH, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok', ...extra } as never);
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, instances: {}, rows: [{ path: PATH }], summary: {}, aliases: [], deleted: [{ path: PATH, version: 1, retainedUntil: '2026-12-01T00:00:00Z' }] } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const reply = (c: Call): Reply => {
  if (c.url.includes('/exec/ops/settle')) return { status: 200, body: { opId: 'x', state: world.settle, ...(world.settleCode ? { code: world.settleCode } : {}) } };
  // The computer still lists the script and still has it deleted: a read proves nothing about a change that may have gone through.
  if (c.url.includes('/exec/scripts/list')) return { status: 200, body: { scripts: [{ path: PATH }] } };
  if (c.url.includes('/exec/scripts/history/deleted')) return { status: 200, body: { entries: [{ path: PATH, version: 1 }] } };
  if (c.method === 'GET') return { status: 200, body: { data: {} } };
  return world.status === 200 ? { status: 200, body: { data: {} } } : { status: world.status, body: { error: { code: 'BAD_REQUEST' } } };
};
const click = async (name: string) => { await act(async () => { fireEvent.click(await screen.findByRole('button', { name })); await flush(); }); };
const post = (part: string) => calls.filter((c) => c.method !== 'GET' && c.url.includes(part));
// Remove a saved test: the row's Remove asks first; only the dialog's Remove sends.
const removeTest = async (i = 0) => {
  await act(async () => { fireEvent.click((await screen.findAllByRole('button', { name: strings['test.remove'] }))[i]!); await flush(); });
  const ask = await screen.findByRole('alertdialog');
  await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: strings['test.remove'] })); await flush(); });
};
const opIdOf = (c: Call): string | null => (c.body && typeof c.body === 'object' && 'opId' in c.body ? String((c.body as { opId: unknown }).opId) : new URL(c.url, 'https://x').searchParams.get('opId'));
const warnedClose = async () => { await click(strings['force.label']); await click(strings['force.confirm']); };

let probe: { restore: ReturnType<typeof useRestore>; comments: ReturnType<typeof useSetComments>; put: ReturnType<typeof useTestsPut>; alias: ReturnType<typeof useAliasState> } | undefined;
function Probe() { probe = { restore: useRestore(), comments: useSetComments(), put: useTestsPut(), alias: useAliasState() }; return null; }

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  calls.length = 0;
  world.status = 200;
  world.settle = 'unknown';
  world.settleCode = undefined;
  world.toasts.length = 0;
  world.errors.length = 0;
  world.cases = [];
  onFetch(reply);
  setTarget(TARGET);
});

describe('Recently deleted: Check again asks the computer about the restore by its op first', () => {
  const mount = (onRestored: () => void) => render(<><Probe /><DeletedDrawer isOpen comps={[{ ...comp, rows: [], agentRealm: R1 } as CompScripts]} onClose={() => undefined} onRestored={onRestored} /></>, { wrapper: CoreQueryProvider });
  const pressRestore = async () => { world.status = 502; await click(strings['versions.restore']); expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy(); };

  it('committed: the hold is freed as done, the banner ends, the list refreshes and the restore is said', async () => {
    const restored = vi.fn();
    mount(restored);
    await pressRestore();
    world.settle = 'committed';
    await click(strings['outcome.check']);
    const [st] = post('/ops/settle');
    expect(st!.body.opId).toBe(opIdOf(post('/scripts/restore')[0]!));
    expect(probe!.restore.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
    expect(restored).toHaveBeenCalledTimes(1);
    expect(world.toasts.map((x) => x.title)).toContain(strings['code.restored']);
  });

  it('never sent (fenced): the hold is freed as not done, the page says so, nothing is called restored', async () => {
    const restored = vi.fn();
    mount(restored);
    await pressRestore();
    world.settle = 'fenced';
    await click(strings['outcome.check']);
    expect(probe!.restore.held()).toEqual([]);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeNull();
    expect(world.toasts).toContainEqual({ title: strings['check.notSent'], tone: 'warn' });
    expect(world.errors).toEqual([]);
    expect(restored).not.toHaveBeenCalled();
  });

  it('refused: the hold is freed as not done and the page says the computer refused it', async () => {
    mount(vi.fn());
    await pressRestore();
    world.settle = 'refused';
    await click(strings['outcome.check']);
    expect(probe!.restore.held()).toEqual([]);
    // A refusal the computer answered is a failure: an error toast that names its fix (send it again here), never a passing
    // warning, and never "may have gone through" or "no answer".
    expect(world.toasts).toEqual([{ title: strings['check.failed'], body: strings['check.failedFix'].replace('{{code}}', 'REFUSED'), tone: 'error' }]);
    expect(world.errors).toEqual([]);
  });

  it("refused with the computer's own code: the error toast's sentence names that code", async () => {
    mount(vi.fn());
    await pressRestore();
    world.settle = 'refused';
    world.settleCode = 'IF_REVISION_MISMATCH';
    await click(strings['outcome.check']);
    expect(world.toasts.find((x) => x.title === strings['check.failed'])?.body).toBe(strings['check.failedFix'].replace('{{code}}', 'IF_REVISION_MISMATCH'));
  });

  it("a Check on another computer's banner never settles the op of the computer last sent to, nor frees its hold", async () => {
    const compOn = (id: string, handle: string) => ({ ...comp, id, handle, rows: [], agentRealm: R1 } as CompScripts);
    const CA = compOn('c1', 'atlas.1111');
    const CB = compOn('c2', 'borealis.2222');
    const view = render(<><Probe /><DeletedDrawer isOpen comps={[CB]} onClose={() => undefined} onRestored={() => undefined} /></>, { wrapper: CoreQueryProvider });
    const to = async (t: typeof TARGET, c: CompScripts) => { setTarget(t); view.rerender(<><Probe /><DeletedDrawer isOpen comps={[c]} onClose={() => undefined} onRestored={() => undefined} /></>); await act(flush); };
    // B's restore is held from an earlier visit; then A's is sent, and is the one this mount remembers.
    setTarget(B);
    world.status = 502;
    await click(strings['versions.restore']);
    await to(TARGET, CA);
    await click(strings['versions.restore']);
    expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy();
    await to(B, CB);
    expect(await screen.findByText(strings['outcome.pending.restore'])).toBeTruthy();
    world.settle = 'committed';
    await click(strings['outcome.check']);
    expect(post('/ops/settle')).toEqual([]);
    expect(probe!.restore.held()).toHaveLength(2);
    expect(screen.queryByText(strings['outcome.pending.restore'])).toBeTruthy();
  });

  it('an answer that proves nothing (unknown, in progress) frees nothing; only the warned close lets it go', async () => {
    const restored = vi.fn();
    mount(restored);
    await pressRestore();
    for (const state of ['unknown', 'in_progress']) {
      world.settle = state;
      await click(strings['outcome.check']);
      expect(probe!.restore.held()).toHaveLength(1);
      expect(screen.queryByText(strings['outcome.pending.restore'])).toBeTruthy();
    }
    await warnedClose();
    expect(probe!.restore.held()).toEqual([]);
    expect(restored).not.toHaveBeenCalled();
  });
});

describe('Saved tests: Check again by op; the last case goes through tests/delete', () => {
  const mount = () => render(<><Probe /><TestTab item={item()} comp={comp} /></>, { wrapper: CoreQueryProvider });
  const c = (id: string) => ({ id, name: id, method: 'GET', route: '/a' });

  it('Run on another saved test while a send may have gone through sends nothing, and Send again resends the held request', async () => {
    world.cases = [{ id: 'held', name: 'held', method: 'POST', route: '/held', body: { value: 'B1' } }, { id: 'other', name: 'other', method: 'GET', route: '/other' }];
    mount();
    world.status = 502;
    await act(async () => { fireEvent.click((await screen.findAllByRole('button', { name: strings['test.run'] }))[0]!); await flush(); });
    expect(calls.filter((c) => c.url.includes('/held'))).toHaveLength(1);
    world.status = 200;
    // The other test's Run: refused while the first may have gone through (it says why), nothing sent.
    await act(async () => { fireEvent.click((await screen.findAllByRole('button', { name: strings['test.run'] }))[1]!); await flush(); });
    expect(calls.filter((c) => c.url.includes('/other'))).toEqual([]);
    // Send again resends the held request, never the other test's.
    await click(strings['test.sendAgain']);
    const ask = await screen.findByRole('alertdialog');
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: strings['test.sendAgainConfirm'] })); await flush(); });
    expect(calls.filter((c) => c.url.includes('/other'))).toEqual([]);
    expect(calls.filter((c) => c.url.includes('/held'))).toHaveLength(2);
  });

  it('Remove asks first: nothing is sent until the dialog\'s Remove, and Cancel sends nothing', async () => {
    world.cases = [c('t1')];
    mount();
    await act(async () => { fireEvent.click((await screen.findAllByRole('button', { name: strings['test.remove'] }))[0]!); await flush(); });
    const ask = await screen.findByRole('alertdialog');
    expect(ask.textContent).toContain(strings['test.removeTitle'].replace('{{name}}', 't1'));
    expect(post('/tests/delete')).toEqual([]);
    expect(post('/tests/put')).toEqual([]);
    await act(async () => { fireEvent.click(within(ask).getByRole('button', { name: /cancel/i })); await flush(); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(post('/tests/delete')).toEqual([]);
  });

  it('removing the last saved case removes the saved set at its revision (no put of an empty set)', async () => {
    world.cases = [c('t1')];
    mount();
    await removeTest();
    expect(post('/tests/put')).toEqual([]);
    const [del] = post('/tests/delete');
    expect(del!.method).toBe('DELETE');
    expect(del!.url).toContain('ifRevision=abcdef0123456789');
    expect(del!.url).toMatch(/opId=[A-Za-z0-9_-]{16,64}/);
  });

  it('removing one of several cases is a put of the others', async () => {
    world.cases = [c('t1'), c('t2')];
    mount();
    await removeTest();
    expect(post('/tests/delete')).toEqual([]);
    const [put] = post('/tests/put');
    expect((put!.body as { cases: unknown[] }).cases).toHaveLength(1);
  });

  it('a removal that may have gone through: committed by its op ends the banner and frees the hold', async () => {
    world.cases = [c('t1')];
    mount();
    world.status = 502;
    await removeTest();
    expect(await screen.findByText(strings['outcome.pending.tests'])).toBeTruthy();
    world.settle = 'committed';
    await click(strings['outcome.check']);
    expect(post('/ops/settle')[0]!.body.opId).toBe(opIdOf(post('/tests/delete')[0]!));
    expect(screen.queryByText(strings['outcome.pending.tests'])).toBeNull();
  });

  it('a put that may have gone through proves nothing on unknown: the banner stays, the warned close frees exactly its hold', async () => {
    world.cases = [c('t1'), c('t2')];
    mount();
    world.status = 502;
    await removeTest();
    expect(probe!.put.held()).toHaveLength(1);
    await click(strings['outcome.check']);
    expect(screen.queryByText(strings['outcome.pending.tests'])).toBeTruthy();
    await warnedClose();
    expect(probe!.put.held()).toEqual([]);
  });
});
