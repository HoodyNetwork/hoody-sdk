// Vitest, mounted on core's real change source. (1) The saved-tests step of a delete that finds an earlier
// removal of the same saved tests still held (sent by another view, so no op this tab knows) says so plainly: its toast offers
// no Check again it could never answer, and nothing is sent a second time. (2) Only a delete this confirmation started keeps
// the confirmation open: an earlier attempt's outcome does not hold a newly opened one open once Delete goes off.
import { CoreQueryProvider, queryClient } from '@core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setTarget } from '@core/ctx';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';

const world = vi.hoisted(() => ({
  del: 200,
  tests: 200,
  settle: 'unknown' as string,
  toasts: [] as Array<{ title: string; body?: string; tone?: string; action?: unknown }>,
  testsDoc: undefined as unknown,
}));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: { title: string; tone?: string }) => { world.toasts.push(c); return 'toast-1'; } }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useFile: () => ({ data: { revision: 'r1', content: 'export default 1;\n' }, refetch: async () => undefined }),
  useEnv: () => ({ data: undefined, refetch: async () => undefined }),
  useTests: () => ({ data: world.testsDoc, refetch: async () => undefined }),
}));

import { useTestsDelete } from './data';
import { SettingsTab } from './parts/SettingsTab';
import strings from './strings.en.json';

const REV = 'abcdef0123456789';
const PATH = 'default/1/a.ts';
const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: PATH, name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as never;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', caps: { revisions: true, history: true, env: true, executions: true, tests: true, publishable: true }, agent: { templates: true, writer: true, guardedDelete: true }, agentRealm: null, ownerRealm: R1, instances: {}, rows: [], summary: {}, aliases: [], deleted: [] } as never;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };
const status = (n: number): Reply => (n === 200 ? { status: 200, body: { data: {} } } : { status: n, body: { error: { code: 'BAD_REQUEST' } } });
const reply = (c: Call): Reply => {
  if (c.url.includes('/exec/scripts/delete') || c.url.includes('/script-instances/delete')) return status(world.del);
  if (c.url.includes('/exec/tests/delete')) return status(world.tests);
  if (c.url.includes('/exec/ops/settle')) return { status: 200, body: { opId: 'x', state: world.settle } };
  if (c.url.includes('/exec/scripts/list')) return { status: 200, body: { scripts: [{ path: PATH }] } };
  return { status: 200, body: { data: {} } };
};
const opOf = (c: Call): string | null => new URL(c.url, 'https://x').searchParams.get('opId') ?? (c.body as { opId?: string } | undefined)?.opId ?? null;
const testsSends = () => calls.filter((c) => c.method !== 'GET' && c.url.includes('/tests/delete'));
const settles = () => calls.filter((c) => c.url.includes('/ops/settle'));

// Another view of the same saved tests (the Tests tab, another browser tab): its own sender of the same change.
let other: ReturnType<typeof useTestsDelete> | undefined;
function OtherView() { other = useTestsDelete(); return null; }
const done = { current: 0 };
const mount = () => render(<><OtherView /><SettingsTab item={item} comp={comp} onChanged={() => undefined} onDeleted={() => { done.current++; }} /></>, { wrapper: CoreQueryProvider });
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); await flush(); }); };
const clickName = async (name: string) => click(await screen.findByRole('button', { name }));
const deleteIt = async () => { await clickName(strings['delete.action']); await clickName(strings['delete.confirm']); };
/** The other view removes the saved tests and the answer is lost: a hold of the same path this tab never sent. */
const otherHoldsTests = async () => {
  world.tests = 502;
  await act(async () => { await other!.mutateAsync({ compId: 'c1', path: PATH, ifRevision: REV, opId: 'other-op' }); await flush(); });
};

describe('the saved-tests step and the confirmation of a script delete', () => {
  beforeEach(() => {
    boot({ realm: R1 });
    queryClient.clear();
    calls.length = 0;
    Object.assign(world, { del: 200, tests: 200, settle: 'unknown', testsDoc: { revision: REV, cases: [{ id: 't1', name: 'x', method: 'GET', route: '/a' }] } });
    world.toasts.length = 0;
    done.current = 0;
    onFetch(reply);
    setTarget(TARGET);
  });

  it("a proven script delete whose saved tests another view is still removing: the toast says so and offers no Check again it could not answer; nothing is sent again", async () => {
    world.del = 502;
    mount();
    await deleteIt();
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    await otherHoldsTests();
    expect(other!.held()).toHaveLength(1);
    const testsBefore = testsSends().length;
    world.settle = 'committed';
    // The script delete's own Check (its banner comes first): the computer answers committed for its op.
    await click(screen.getAllByRole('button', { name: strings['outcome.check'] })[0]!);
    // Not the toast of this delete's own removal: its Check again would ask about an op this tab never sent.
    expect(world.toasts.some((x) => x.title === strings['delete.testsPending']), 'no Check again toast for a removal sent elsewhere').toBe(false);
    const toast = world.toasts.find((x) => x.title === strings['delete.testsHeldOlder']);
    expect(toast, 'the older-removal toast').toBeTruthy();
    expect(toast!.action, 'no Check again on it').toBeUndefined();
    expect(toast!.tone).toBe('unknown');
    // Nothing more went out for the saved tests, and nothing asked about the other view's op.
    expect(testsSends()).toHaveLength(testsBefore);
    expect(settles().some((c) => opOf(c) === 'other-op')).toBe(false);
    // The hold stays for its own sender: nothing freed it.
    expect(other!.held()).toHaveLength(1);
  });

  it('control: a saved-tests removal of this delete that may have gone through keeps its Check again toast', async () => {
    world.tests = 502;
    mount();
    await deleteIt();
    expect(await screen.findByText(strings['outcome.pending.tests'])).toBeTruthy();
    const toast = world.toasts.find((x) => x.title === strings['delete.testsPending']);
    expect(toast?.action).toBeTruthy();
    expect(world.toasts.some((x) => x.title === strings['delete.testsHeldOlder'])).toBe(false);
  });

  it('an earlier attempt that failed does not keep a newly opened confirmation open: a hold that arrives closes it', async () => {
    world.del = 400;
    mount();
    await deleteIt();
    // The failed attempt is shown in the confirmation; the person closes it and opens a new one.
    await act(async () => { fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }); await flush(); });
    expect(screen.queryByRole('button', { name: strings['delete.confirm'] })).toBeNull();
    await clickName(strings['delete.action']);
    expect(await screen.findByRole('button', { name: strings['delete.confirm'] })).toBeTruthy();
    // A removal of the saved tests from another view is now held: Delete goes off, and this confirmation started nothing.
    await otherHoldsTests();
    await act(async () => { await flush(); });
    expect(screen.queryByRole('button', { name: strings['delete.confirm'] }), 'the new confirmation closes').toBeNull();
    expect((screen.getByRole('button', { name: strings['delete.action'] }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("control: this confirmation's own delete that may have gone through is not closed by the effect (its banner and hold stay)", async () => {
    world.del = 502;
    mount();
    await deleteIt();
    expect(await screen.findByText(strings['outcome.pending.delete'])).toBeTruthy();
    expect(calls.filter((c) => c.method !== 'GET' && c.url.includes('/scripts/delete'))).toHaveLength(1);
    expect(done.current).toBe(0);
  });
});
