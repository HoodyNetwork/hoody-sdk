// Vitest: a script save core holds (its answer lost) is shown on the Scripts page with a Check,
// whatever sent it, a Discarded draft's included. Through the
// page's real sends and core's own change locks, the fake transport only at the fetch. The Check asks the save's own computer
// what became of its op (hoody-exec ops/settle, sentAfter 0, as the editor's Check does): committed frees it as saved, refused
// or fenced as not saved. Nothing else frees it and no file is read (a script there, or
// none, proves nothing about whether the save may still arrive): in progress, forgotten, a save naming no op or an answer that
// proves nothing keep it, and the last three leave the warned Stop tracking. Nothing is ever sent again.
import { CoreQueryProvider, queryClient, type HeldRow, type Target } from '@core';
import { setTarget } from '@core/ctx';
import { CHANGE_STORE_KEY, readChanges, writeChanges } from '@core/change-store';
import { boot, calls, onFetch, R1, settle, TARGET, type Call, type Reply } from '@core/test/env';
import { act, render as renderUi, renderHook as render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({ shown: null as unknown }));
vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, fixtureModeActive: () => false, useCurrentComputer: () => world.shown };
});

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string }>);
vi.mock('@kit/states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
beforeEach(() => { toasts.length = 0; });
import { checkHeldWrite, settleAnswerFor, useBoundSends, useHeldWrites, type Binding, type HeldWrite } from './data';
import { HeldWrites } from './parts/HeldWrites';
import strings from './strings.en.json';

const B: Binding = { target: TARGET, realm: R1, owner: 'fp1', exec: 1 };
const OTHER: Target = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } };
const PATH = 'default/1/discard-held-probe.ts';
const flush = async (): Promise<void> => { for (let i = 0; i < 20; i++) await settle(); };
const isWrite = (c: Call): boolean => c.method === 'POST' && c.url.includes('/exec/scripts/write');
const isSettle = (c: Call): boolean => c.method === 'POST' && c.url.includes('/exec/ops/settle');
const isRead = (c: Call): boolean => c.method === 'GET' && c.url.includes('/exec/scripts/read');
const isHealth = (c: Call): boolean => c.method === 'GET' && c.url.includes('/exec/health');
/** The computer does not answer at all (stopped): every exec request fails, its health read included. */
let down = false;
let write: Reply[] = [];
let readReply: Reply = { status: 200, body: { data: { path: PATH, content: 'x', revision: 'r1' } } };
let settleReply: Reply = { status: 200, body: { state: 'forgotten' } };
const settled = (state: string, more: Record<string, unknown> = {}): Reply => ({ status: 200, body: { opId: 'c5cf451ba45101234a771daef45b4813', state, at: '2026-11-09T00:00:00.000Z', ...more } });
const execAbsent = (path = PATH): Reply => ({ status: 404, body: { error: 'Script not found', code: 'ERROR_404', details: { path }, timestamp: '2026-11-08T00:00:00.000Z' } });

const mount = () => render(() => ({ sends: useBoundSends(B), held: useHeldWrites() }), { wrapper: CoreQueryProvider });
/** A save sent with its answer lost: core holds it. */
async function lostSave(view: ReturnType<typeof mount>, op = 'c5cf451ba45101234a771daef45b4813', path = PATH): Promise<void> {
  write = [{ status: 0, network: true }];
  await act(async () => { await view.result.current.sends.write({ path, content: 'export default 1', ifRevision: null, opId: op }); await flush(); });
  view.rerender();
}
const sentAgain = () => calls.filter(isWrite);
const OP = 'c5cf451ba45101234a771daef45b4813';

beforeEach(() => {
  boot({ realm: R1 });
  queryClient.clear();
  world.shown = TARGET;
  setTarget(TARGET as Target);
  write = [];
  readReply = { status: 200, body: { data: { path: PATH, content: 'x', revision: 'r1' } } };
  settleReply = settled('forgotten');
  calls.length = 0;
  down = false;
  onFetch((c: Call): Reply => {
    if (down && (isSettle(c) || isHealth(c) || isRead(c))) return { status: 502, body: '' };
    if (isWrite(c)) return write.shift() ?? { status: 200, body: { data: { revision: 'r1' } } };
    if (isSettle(c)) return settleReply;
    if (isRead(c)) return readReply;
    return { status: 200, body: { data: {} } };
  });
});

describe('a held save on the Scripts page', () => {
  it('is listed with its path and the computer it went to', async () => {
    const view = mount();
    await lostSave(view);
    expect(view.result.current.held.rows).toHaveLength(1);
    expect(view.result.current.held.rows[0]).toMatchObject({ path: PATH, opId: OP, target: { container: { id: TARGET.container.id }, project: { id: TARGET.project.id } } });
  });

  it('while it is held, another save of the same path (another draft, another op id) is refused and sends nothing: no competing send can start while a Check reads', async () => {
    const view = mount();
    await lostSave(view);
    calls.length = 0;
    let got: { outcome: string; code?: string } | undefined;
    await act(async () => { got = await view.result.current.sends.write({ path: PATH, content: 'export default 2', ifRevision: null, opId: 'd00000000000000000000000000000d2' }) as typeof got; await flush(); });
    expect(got).toMatchObject({ outcome: 'not_sent' });
    expect(calls.filter(isWrite)).toEqual([]);
  });

  it('lists every held save, one per path', async () => {
    const view = mount();
    await lostSave(view);
    await lostSave(view, 'e00000000000000000000000000000e2', 'default/1/second.ts');
    expect(view.result.current.held.rows.map((r) => r.path).sort()).toEqual(['default/1/discard-held-probe.ts', 'default/1/second.ts']);
  });

  it("Check reads the shared store again before it frees: another tab's newer send of the path, not announced here yet, keeps it, though the op committed", async () => {
    const view = mount();
    await lostSave(view);
    settleReply = settled('committed', { revision: 'r2' });
    const h = view.result.current.held.rows[0]!;
    // Another tab took the path's change over (its own send, another token) and has not told this tab yet (no storage event).
    writeChanges((readChanges() ?? []).map((r) => (r.pending ? { ...r, t: r.t + 1, inc: 'another-tab-inc', nonce: 'another-tab-nonce' } : r)));
    calls.length = 0;
    let got: { outcome: string; code?: string } | undefined;
    await act(async () => { got = await view.result.current.held.check(h); await flush(); });
    expect(got).toMatchObject({ outcome: 'kept', code: 'KEPT' });
    expect(view.result.current.held.rows).toHaveLength(1);
    expect(sentAgain()).toEqual([]);
  });

  it("a held save whose record names no script (an older build's, converted) is listed as unnamed, and Stop tracking frees it", async () => {
    const view = mount();
    await lostSave(view);
    // The conversion of an older build's record keeps its sender and page and drops its identity (core changes.ts converted()).
    writeChanges((readChanges() ?? []).map((r) => (r.pending && r.meta ? { ...r, t: r.t + 1, meta: { ...r.meta, identity: null } } : r)));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); });
    await act(async () => { await flush(); });
    view.rerender();
    expect(view.result.current.held.rows).toEqual([]);
    expect(view.result.current.held.unnamed).toHaveLength(1);
    calls.length = 0;
    let freed = false;
    await act(async () => { freed = await view.result.current.held.dismiss(view.result.current.held.unnamed[0]!); await flush(); });
    view.rerender();
    expect(freed).toBe(true);
    expect(view.result.current.held.unnamed).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  it("a held save whose record names its path but no op (sent before saves named one) asks nothing and reads nothing: kept, then Stop tracking frees it", async () => {
    const view = mount();
    await lostSave(view);
    writeChanges((readChanges() ?? []).map((r) => (r.pending && r.meta ? { ...r, t: r.t + 1, meta: { ...r.meta, identity: { path: PATH } } } : r)));
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); });
    await act(async () => { await flush(); });
    view.rerender();
    expect(view.result.current.held.rows).toHaveLength(1);
    expect(view.result.current.held.rows[0]!.opId).toBeNull();
    calls.length = 0;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    expect(got).toEqual({ outcome: 'kept', code: 'NO_OP' });
    expect(calls.filter((c) => isSettle(c) || isRead(c))).toEqual([]);
    let freed = false;
    await act(async () => { freed = await view.result.current.held.dismiss(view.result.current.held.rows[0]!.row); await flush(); });
    view.rerender();
    expect(freed).toBe(true);
    expect(view.result.current.held.rows).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  it('is listed whichever computer the shell shows now (Home may send the person here from another)', async () => {
    const view = mount();
    await lostSave(view);
    world.shown = OTHER;
    setTarget(OTHER);
    view.rerender();
    expect(view.result.current.held.rows).toHaveLength(1);
  });

  it('Check asks the save\'s own computer about its op: committed frees it as saved, without reading the file, nothing sent again', async () => {
    const view = mount();
    await lostSave(view);
    const sentTo = new URL(calls.find(isWrite)!.url).host;
    world.shown = OTHER;
    setTarget(OTHER);
    settleReply = settled('committed', { revision: 'r2' });
    calls.length = 0;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    expect(got).toEqual({ outcome: 'saved' });
    expect(view.result.current.held.rows).toEqual([]);
    const asked = calls.filter(isSettle);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.body).toEqual({ opId: OP, sentAfter: 0 });
    expect(new URL(asked[0]!.url).host).toBe(sentTo);
    expect(calls.filter(isRead)).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  it('Check, the op fenced (never admitted, and now never can be): freed as not sent, even with no script there', async () => {
    const view = mount();
    await lostSave(view);
    settleReply = settled('fenced');
    readReply = execAbsent();
    calls.length = 0;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    expect(got).toEqual({ outcome: 'not_sent' });
    expect(view.result.current.held.rows).toEqual([]);
    expect(calls.filter(isRead)).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  it('Check, the op refused (an overwrite whose revision moved): freed as refused with its code, although an older script reads there', async () => {
    const view = mount();
    await lostSave(view);
    settleReply = settled('refused', { code: 'REVISION_MISMATCH' });
    calls.length = 0;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    expect(got).toEqual({ outcome: 'refused', code: 'REVISION_MISMATCH' });
    expect(view.result.current.held.rows).toEqual([]);
    expect(calls.filter(isRead)).toEqual([]);
  });

  for (const [what, reply, code] of [
    ['still in progress', settled('in_progress'), 'IN_PROGRESS'],
    ['forgotten (no longer recorded), a script there', settled('forgotten'), 'NOT_RECORDED'],
    ['left in a state no writer makes (unknown)', settled('unknown'), 'NOT_KNOWN'],
    ['a malformed answer', settled('done'), 'NOT_KNOWN'],
    ['committed for another op', { status: 200, body: { opId: 'f00000000000000000000000000000f0', state: 'committed', revision: 'r2' } }, 'NOT_KNOWN'],
    ['committed without its revision', { status: 200, body: { opId: OP, state: 'committed' } }, 'NOT_KNOWN'],
    ['refused without its code', { status: 200, body: { opId: OP, state: 'refused' } }, 'NOT_KNOWN'],
    ['fenced naming no op', { status: 200, body: { state: 'fenced', at: 'x' } }, 'NOT_KNOWN'],
    ['fenced without its time', { status: 200, body: { opId: OP, state: 'fenced' } }, 'NOT_KNOWN'],
    ['unknown with a conflicting outcome fenced', { status: 200, body: { opId: OP, state: 'unknown', outcome: 'fenced', at: 'x' } }, 'NOT_KNOWN'],
    ['in progress with a conflicting outcome forgotten', { status: 200, body: { opId: OP, state: 'in_progress', outcome: 'forgotten' } }, 'NOT_KNOWN'],
    ['a 503', { status: 503, body: { error: 'down' } }, 'NOT_KNOWN'],
    ['no answer', { status: 0, network: true }, 'NOT_KNOWN'],
  ] as const) {
    it(`Check, the computer's op answer ${what}: kept, still listed, the file not read`, async () => {
      const view = mount();
      await lostSave(view);
      settleReply = reply as Reply;
      calls.length = 0;
      let got: { outcome: string; code?: string } | undefined;
      await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
      view.rerender();
      expect(got).toMatchObject({ outcome: 'kept', code });
      expect(view.result.current.held.rows).toHaveLength(1);
      expect(calls.filter(isRead)).toEqual([]);
      expect(sentAgain()).toEqual([]);
    });
  }

  it('Check, forgotten and no script there: kept as not recorded, never freed, the file not read (no fence, the save may still arrive)', async () => {
    const view = mount();
    await lostSave(view);
    readReply = execAbsent();
    calls.length = 0;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    expect(got).toEqual({ outcome: 'kept', code: 'NOT_RECORDED' });
    expect(view.result.current.held.rows).toHaveLength(1);
    expect(calls.filter(isRead)).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  it('after a Check that kept it, Stop tracking (core\'s warned dismiss) frees a named save, nothing sent', async () => {
    const view = mount();
    await lostSave(view);
    await act(async () => { await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    calls.length = 0;
    let freed = false;
    await act(async () => { freed = await view.result.current.held.dismiss(view.result.current.held.rows[0]!.row); await flush(); });
    view.rerender();
    expect(freed).toBe(true);
    expect(view.result.current.held.rows).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  it("a Check whose own settle answer was lost keeps it; the next Check, the computer back, asks again and frees it (the lost settle read back first, never a stuck \"not known\")", async () => {
    const view = mount();
    await lostSave(view);
    down = true;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    expect(got).toEqual({ outcome: 'kept', code: 'NOT_KNOWN' });
    down = false;
    settleReply = settled('committed', { revision: 'r2' });
    calls.length = 0;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    view.rerender();
    expect(got).toEqual({ outcome: 'saved' });
    expect(calls.filter(isSettle)).toHaveLength(1);
    expect(calls.filter(isHealth)).toHaveLength(1); // its own lost settle, read back first
    expect(view.result.current.held.rows).toEqual([]);
    expect(sentAgain()).toEqual([]);
  });

  // As the Scripts page's own settle: only this Check's own held settle is read back. With
  // none held, a Check makes no health read of its own and waits for no other settle's read-back.
  it('a Check with no settle of its own held reads nothing back: no health read, one settle', async () => {
    const view = mount();
    await lostSave(view);
    settleReply = settled('committed', { revision: 'r2' });
    calls.length = 0;
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(view.result.current.held.rows[0]!); await flush(); });
    expect(got).toEqual({ outcome: 'saved' });
    expect(calls.filter(isHealth)).toEqual([]);
    expect(calls.filter(isSettle)).toHaveLength(1);
  });

  it('a second Check of a save already freed frees nothing more', async () => {
    const view = mount();
    await lostSave(view);
    settleReply = settled('committed', { revision: 'r2' });
    const row = view.result.current.held.rows[0]!;
    await act(async () => { await view.result.current.held.check(row); await flush(); });
    let got: unknown;
    await act(async () => { got = await view.result.current.held.check(row); await flush(); });
    expect(got).toEqual({ outcome: 'kept', code: 'KEPT' });
  });
});

describe('checkHeldWrite: only the op\'s own answer frees, never the file', () => {
  const row = (hold: string, opId: string | null = 'o'): HeldRow => ({ hold, at: 1, identity: opId === null ? { path: PATH } : { path: PATH, opId }, target: TARGET, account: 'a' }) as HeldRow;
  const h: HeldWrite = { row: row('h1'), path: PATH, opId: 'o', target: TARGET };
  const noOp: HeldWrite = { row: row('h0', null), path: PATH, opId: null, target: TARGET };
  type V = Awaited<ReturnType<Parameters<typeof checkHeldWrite>[0]['settle']>>;
  const deps = (o: { op?: V; at?: readonly HeldRow[] | null; free?: boolean; log?: string[]; asked?: unknown[] }) => ({
    settle: async (target: Target, path: string, opId: string) => { o.log?.push('settle'); o.asked?.push({ target, path, opId }); return o.op ?? ({ state: 'unknown', forgotten: true } as V); },
    heldAt: () => { o.log?.push('heldAt'); return o.at === undefined ? [h.row] : o.at; },
    free: async () => { o.log?.push('free'); return o.free ?? true; },
  });

  it('asks the op on the save\'s own computer; committed frees it as saved', async () => {
    const log: string[] = [], asked: unknown[] = [];
    expect(await checkHeldWrite(deps({ op: { state: 'done', revision: 'r2' }, log, asked }), h)).toEqual({ outcome: 'saved' });
    expect(log).toEqual(['settle', 'heldAt', 'free']);
    expect(asked).toEqual([{ target: TARGET, path: PATH, opId: 'o' }]);
  });
  it('fenced frees it as not sent and refused as refused with its code', async () => {
    for (const [op, out] of [[{ state: 'not_sent' }, { outcome: 'not_sent' }], [{ state: 'failed', code: 'REVISION_MISMATCH' }, { outcome: 'refused', code: 'REVISION_MISMATCH' }]] as const) {
      const log: string[] = [];
      expect(await checkHeldWrite(deps({ op: op as V, log }), h)).toEqual(out);
      expect(log).toEqual(['settle', 'heldAt', 'free']);
    }
  });
  it("the op's own answer is about that op alone: another held send of the path does not keep it", async () => {
    expect(await checkHeldWrite(deps({ op: { state: 'done', revision: null }, at: [h.row, row('h2')] }), h)).toEqual({ outcome: 'saved' });
  });
  it('in progress, forgotten and an answer that proves nothing keep it, each with its code, and free nothing', async () => {
    for (const [op, code] of [[{ state: 'checking' }, 'IN_PROGRESS'], [{ state: 'unknown', forgotten: true }, 'NOT_RECORDED'], [{ state: 'unknown', forgotten: false }, 'NOT_KNOWN']] as const) {
      const log: string[] = [];
      expect(await checkHeldWrite(deps({ op: op as V, log }), h)).toEqual({ outcome: 'kept', code });
      expect(log).toEqual(['settle']);
    }
  });
  it('a save that names no op asks nothing and keeps it as NO_OP', async () => {
    const log: string[] = [];
    expect(await checkHeldWrite(deps({ log }), noOp)).toEqual({ outcome: 'kept', code: 'NO_OP' });
    expect(log).toEqual([]);
  });
  it('a list core could not read keeps it', async () => {
    expect(await checkHeldWrite(deps({ op: { state: 'done', revision: 'r2' }, at: null }), h)).toEqual({ outcome: 'kept', code: 'KEPT' });
  });
  it('a free core refuses keeps it', async () => {
    expect(await checkHeldWrite(deps({ op: { state: 'not_sent' }, free: false }), h)).toEqual({ outcome: 'kept', code: 'KEPT' });
  });
});

describe('settleAnswerFor: only an answer for exactly the op asked, with what its state must carry, proves anything', () => {
  const nothing = { state: 'unknown', forgotten: false };
  it.each([
    [{ opId: 'o', state: 'committed', revision: 'r2', at: 'x' }, { state: 'done', revision: 'r2' }],
    [{ opId: 'o', state: 'committed', revision: null, at: 'x' }, { state: 'done', revision: null }],
    [{ opId: 'o', outcome: 'committed', revision: 'r2', at: 'x' }, { state: 'done', revision: 'r2' }],
    [{ opId: 'o', state: 'committed', outcome: 'committed', revision: 'r2', at: 'x' }, { state: 'done', revision: 'r2' }],
    [{ opId: 'o', state: 'refused', code: 'REVISION_MISMATCH', at: 'x' }, { state: 'failed', code: 'REVISION_MISMATCH' }],
    [{ opId: 'o', state: 'fenced', at: 'x' }, { state: 'not_sent' }],
    [{ opId: 'o', state: 'in_progress' }, { state: 'checking' }],
    [{ opId: 'o', state: 'forgotten' }, { state: 'unknown', forgotten: true }],
    [{ opId: 'o', state: 'unknown' }, nothing],
  ])('%j reads %j', (raw, view) => { expect(settleAnswerFor(raw, 'o')).toEqual(view); });
  it.each([
    [null], ['committed'], [{ state: 'committed', revision: 'r2' }], [{ opId: 'p', state: 'fenced' }], [{ opId: 'o', state: 'committed' }],
    [{ opId: 'o', state: 'committed', revision: 7 }], [{ opId: 'o', state: 'refused' }], [{ opId: 'o', state: 'refused', code: '' }],
    [{ opId: 'o', state: 'done' }], [{ opId: 'o' }], [{ opId: 'p', state: 'forgotten' }],
    [{ opId: 'o', state: 'fenced' }], [{ opId: 'o', state: 'committed', revision: 'r2' }], [{ opId: 'o', state: 'refused', code: 'X' }],
    [{ opId: 'o', state: 'unknown', outcome: 'fenced', at: 'x' }], [{ opId: 'o', state: 'in_progress', outcome: 'forgotten' }],
    [{ opId: 'o', state: 'fenced', at: '' }],
  ])('%j proves nothing', (raw) => { expect(settleAnswerFor(raw, 'o')).toEqual(nothing); });
});

describe('the notice', () => {
  const none = { unnamed: [] as HeldRow[], dismiss: async () => false };
  it('a held save that names no script (an older build\'s) is shown with Stop tracking only, which frees it through core\'s warned dismiss', async () => {
    const urow = { hold: 'u1', at: 1, identity: null, target: null, account: 'a' } as unknown as HeldRow;
    const dismiss = vi.fn(async () => true);
    renderUi(<HeldWrites held={{ rows: [], unnamed: [urow], check: async () => ({ outcome: 'saved' as const }), dismiss }} computers={[]} />);
    expect(screen.getByText(strings['heldWrite.unnamedTitle'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^check/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /stop tracking/i }));
    // The kit asks first; confirming frees it.
    const confirm = await screen.findAllByRole('button', { name: /stop tracking/i });
    await userEvent.click(confirm[confirm.length - 1]!);
    await vi.waitFor(() => expect(dismiss).toHaveBeenCalledWith(urow));
  });
  const row: HeldRow = { hold: 'h1', at: 1, identity: { path: PATH, opId: 'o' }, target: TARGET, account: 'a' } as HeldRow;
  const one: HeldWrite = { row, path: PATH, opId: 'o', target: TARGET };
  it('names the script and its computer by name, says what Check does, and shows why a Check kept it', async () => {
    const check = vi.fn(async () => ({ outcome: 'kept' as const, code: 'NOT_KNOWN' as const }));
    renderUi(<HeldWrites held={{ ...none, rows: [one], check }} computers={[{ id: TARGET.container.id, name: 'atlas' }]} />);
    expect(screen.getByText('Saving script discard-held-probe.ts on atlas was not confirmed')).toBeInTheDocument();
    expect(screen.getByText(strings['heldWrite.checkLine'])).toBeInTheDocument();
    expect(screen.queryByText(TARGET.container.id, { exact: false })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(check).toHaveBeenCalledWith(one);
    expect(await screen.findByText(strings['heldWrite.kept.NOT_KNOWN'])).toBeInTheDocument();
  });
  const toastOf = async (r: Awaited<ReturnType<typeof checkHeldWrite>>) => {
    renderUi(<HeldWrites held={{ ...none, rows: [one], check: async () => r }} computers={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    await vi.waitFor(() => expect(toasts).toHaveLength(1));
    return toasts[0];
  };
  it('a Check the computer answers committed says it was saved', async () => {
    expect(await toastOf({ outcome: 'saved' })).toEqual({ title: 'discard-held-probe.ts was saved on the computer', body: strings['heldWrite.savedBody'], tone: 'ok' });
  });
  it('a fenced Check says the save never reached the computer and now never can', async () => {
    expect(await toastOf({ outcome: 'not_sent' })).toEqual({ title: 'Saving discard-held-probe.ts did not reach the computer', body: strings['heldWrite.notSentBody'], tone: 'warn' });
  });
  it('a refused Check names the computer\'s code in the body, never in the title', async () => {
    const t = await toastOf({ outcome: 'refused', code: 'REVISION_MISMATCH' });
    expect(t).toEqual({ title: 'The computer refused saving discard-held-probe.ts', body: 'It was not saved (REVISION_MISMATCH). Save it again if you still need it.', tone: 'warn' });
  });
  for (const code of ['NOT_RECORDED', 'NO_OP', 'NOT_KNOWN'] as const) {
    it(`a Check that keeps it as ${code}, nothing left to ask, says why and offers Stop tracking, which asks first and frees it through core's warned dismiss`, async () => {
      const dismiss = vi.fn(async () => true);
      renderUi(<HeldWrites held={{ unnamed: [], dismiss, rows: [one], check: async () => ({ outcome: 'kept' as const, code }) }} computers={[]} />);
      expect(screen.queryByRole('button', { name: /stop tracking/i })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: /check/i }));
      expect(await screen.findByText(strings[`heldWrite.kept.${code}`])).toBeInTheDocument();
      expect(toasts).toEqual([]);
      await userEvent.click(screen.getByRole('button', { name: /stop tracking/i }));
      expect(dismiss).not.toHaveBeenCalled();
      const confirm = await screen.findAllByRole('button', { name: /stop tracking/i });
      await userEvent.click(confirm[confirm.length - 1]!);
      await vi.waitFor(() => expect(dismiss).toHaveBeenCalledWith(row));
    });
  }
  it('the forgotten line claims no record: the computer answers forgotten for an op it never saw too, once its journal has evicted', () => {
    expect(strings['heldWrite.kept.NOT_RECORDED']).not.toMatch(/record|no longer|kept|was saved|received/i);
  });
  it('no text sends the person to make the script again while the save could still land', () => {
    expect(JSON.stringify(strings)).not.toMatch(/make it again with New script/);
  });
  it('a Check that finds the op still in progress says so on the line, with no Stop tracking (the computer will answer)', async () => {
    renderUi(<HeldWrites held={{ ...none, rows: [one], check: async () => ({ outcome: 'kept' as const, code: 'IN_PROGRESS' as const }) }} computers={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(await screen.findByText(strings['heldWrite.kept.IN_PROGRESS'])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /stop tracking/i })).toBeNull();
  });
  it('a computer the page does not list is left unnamed', () => {
    renderUi(<HeldWrites held={{ ...none, rows: [one], check: async () => ({ outcome: 'saved' as const }) }} computers={[]} />);
    expect(screen.getByText('Saving script discard-held-probe.ts was not confirmed')).toBeInTheDocument();
  });
  it('shows nothing with no held save', () => {
    const { container } = renderUi(<HeldWrites held={{ ...none, rows: [], check: async () => ({ outcome: 'saved' as const }) }} computers={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
