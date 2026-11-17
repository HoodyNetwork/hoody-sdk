// Vitest: the Being built section. At the page (fixture states): shown with the list, shown while
// no computer is ready, absent with no builds, the full-store note, legacy rows, the unreadable store. On the section with a
// recording IO: each build read on its own computer, Stop's cancel to the row's own computer and turn, Discard's confirm then
// cancel then end, Open showing the build's computer, the 5 s reads paused while hidden, /state only for Building rows; a deploy
// nobody answered for: "Going live · not confirmed" (no cause claimed), its Check a fresh read of the script on the
// reservation's computer (no answer and no script there each said; nothing freed here), its Discard warned that it may be live.
import { act, render, renderPage, screen, userEvent, within } from '@app/testing';
import { snapshot } from '@core/ctx';
import { R1, TARGET } from '@core/test/env';
import type { DraftRecord, ScriptAsk } from '@core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Binding, StoredBuildReads } from './data';
import { attemptPath, type Receipt } from './writer';
import { DEPLOY_BEAT_STALE_MS } from './new/records';
import page from './page';
import { Building, buildTiming, openBuild, useBuilds, type BuildIO, type BuildLine } from './parts/Building';
import strings from './strings.en.json';
import viewSource from './view.tsx?raw';

type Shown = { title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } };
const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string; action?: { label: string; onAction: () => unknown } }>);
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: Shown) => { toasts.push(c); return 'toast-1'; } }));
const plain = (l: Shown[]) => l.map(({ title, tone }) => ({ title, tone }));

describe('at the page', () => {
  it('three builds above the list: their labels, pills and computers; a stopped one on another computer is read there', async () => {
    await renderPage(page, { state: 'builds' });
    const s = await screen.findByRole('region', { name: 'Being built in this browser' });
    expect(within(s).getByText('Being built in this browser · 3')).toBeInTheDocument();
    expect(await within(s).findByText("Every Monday at 9:00, count last week's new signups and post the total")).toBeInTheDocument();
    expect(await within(s).findByText('Running a code check')).toBeInTheDocument();
    expect(await within(s).findByText('Ready to check')).toBeInTheDocument();
    expect(await within(s).findByText('Stopped')).toBeInTheDocument();
    expect(within(s).getByText('borealis')).toBeInTheDocument();
    // The marker's block never shows in the label.
    expect(within(s).queryByText(/Hoody New script v1/)).toBeNull();
    // The list is still there below it.
    expect((await screen.findAllByText('Weather lookup')).length).toBeGreaterThan(0);
  });

  it('shown while no computer is ready, above the no-computer state', async () => {
    await renderPage(page, { state: 'buildsNoComputer' });
    const s = await screen.findByRole('region', { name: 'Being built in this browser' });
    expect(await within(s).findByText('Warn me when the disk fills up')).toBeInTheDocument();
    // At the top: under the page's header, before the no-computer state, so a phone shows it without scrolling.
    const heading = screen.getByRole('heading', { name: strings.title });
    const state = screen.getByText(/^No computer selected$|is stopped$/);
    expect(heading.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(s.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('no builds: no section', async () => {
    await renderPage(page);
    await screen.findAllByText('Weather lookup');
    expect(screen.queryByRole('region', { name: 'Being built in this browser' })).toBeNull();
  });

  it('the full store: the note counts builds and change requests, and lists the change requests with Open', async () => {
    await renderPage(page, { state: 'buildsFull' });
    const s = await screen.findByRole('region', { name: 'Being built in this browser' });
    expect(within(s).getByText('This browser is holding 32 assistant requests: 3 for new scripts and 29 for changes to scripts. Make a script live, or discard a build or a change request, to start another.')).toBeInTheDocument();
    await userEvent.click(within(s).getByRole('button', { name: 'Show the change requests' }));
    expect(within(s).getAllByText(/jobs\/job-\d\d\.ts/)).toHaveLength(29);
  });

  it('a legacy New script ask: its own row with Open and Discard; Discard closes the stored ask', async () => {
    await renderPage(page, { state: 'buildsLegacy' });
    const s = await screen.findByRole('region', { name: 'Being built in this browser' });
    const row = (await within(s).findByText('An earlier assistant request')).closest('li')!;
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open', 'Discard']);
  });

  it("an unreadable store says so with Try again, never an empty or hidden section", async () => {
    await renderPage(page, { state: 'buildsUnreadable' });
    const s = await screen.findByRole('region', { name: 'Being built in this browser' });
    expect(within(s).getByText("Builds started in this browser can't be read right now.")).toBeInTheDocument();
    expect(within(s).getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

// ---- the section with a recording IO ----
const P = TARGET.project.id;
const OTHER = { project: { id: 'p2' }, container: { id: 'c2', server_name: 'sv2' } };
const containers = { computers: [
  { id: TARGET.container.id, project_id: P, name: 'atlas', server_name: TARGET.container.server_name },
  { id: 'c2', project_id: 'p2', name: 'borealis', server_name: 'sv2' },
], pagination: { totalPages: 1 } };
const draft = (draftId: string, o: Partial<DraftRecord> = {}): DraftRecord => ({ draftId, mode: 'ai', project: P, compId: TARGET.container.id, realm: R1, owner: 'fp1', exec: 1, current: 1, retained: null, state: 'open', deploy: null, updatedAt: 1, ...o });
const ask = (draftId: string, o: Partial<ScriptAsk> = {}): ScriptAsk => ({ askId: `a-${draftId}`, compId: TARGET.container.id, path: attemptPath(P, draftId, 1), realm: R1, owner: 'fp1', sessionId: `s-${draftId}`, turnId: `t-${draftId}`, phase: 'read', sentAt: 1, createKey: 'ck', turnKey: 'tk', ...o });
const onOther = (draftId: string) => ({ d: draft(draftId, { project: 'p2', compId: 'c2', realm: 'r2' }), a: ask(draftId, { compId: 'c2', path: attemptPath('p2', draftId, 1), realm: 'r2' }) });

function recorder(drafts: DraftRecord[], asks: ScriptAsk[], receipts: Record<string, string>, script: Awaited<ReturnType<NonNullable<StoredBuildReads['script']>>> = null) {
  const calls: Array<{ op: string; b?: Binding; sid?: string; turnId?: string; draftId?: string; path?: string; o?: unknown }> = [];
  const reads: StoredBuildReads = {
    session: async (b, sid) => { calls.push({ op: 'session', b, sid }); return { session: { id: sid, first_message: `label ${sid}` } }; },
    receipt: async (b, sid, turnId) => { calls.push({ op: 'receipt', b, sid }); return receipts[sid] ? ({ turnId, state: receipts[sid], ended: ['completed', 'failed', 'cancelled', 'interrupted'].includes(receipts[sid]!), code: receipts[sid] } as Receipt) : 'unreadable'; },
    transcript: async (b, sid) => { calls.push({ op: 'transcript', b, sid }); return 'unreadable'; },
    state: async (b, sid) => { calls.push({ op: 'state', b, sid }); return { session_id: sid, state: 'running', live: true, current_step: { kind: 'model' } }; },
    replay: async () => 'unreadable',
    script: async (b, path) => { calls.push({ op: 'script', b, path }); return script; },
  };
  const io: BuildIO = {
    records: () => ({ drafts, asks }),
    reads,
    stop: vi.fn(async (b: Binding, sid: string, turnId: string) => { calls.push({ op: 'stop', b, sid, turnId }); return true; }),
    discard: vi.fn(async (r: DraftRecord, o?: { mayBeDeployed?: boolean }) => { calls.push({ op: 'discard', draftId: r.draftId, o }); return { ok: true as const, clean: true }; }),
    close: vi.fn(async () => 'ok' as const),
  };
  return { io, calls };
}

let lines: BuildLine[] = [];
function Harness({ io, enabled = true, rows = containers, refetch }: { io: BuildIO; enabled?: boolean; rows?: unknown; refetch?: () => unknown }) {
  const view = useBuilds(io, rows, enabled, refetch);
  lines = view.lines;
  return <Building view={view} onOpen={(l) => openBuild(l, () => undefined)} onOpenChange={() => undefined} />;
}
const flush = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); }); };
const of = (calls: ReturnType<typeof recorder>['calls'], op: string) => calls.filter((c) => c.op === op);

describe('the section', () => {
  beforeEach(() => { vi.useRealTimers(); toasts.length = 0; });
  afterEach(() => { vi.useRealTimers(); buildTiming.everyMs = 5000; buildTiming.clockMs = 5000; });

  it("another computer's build is read with its own computer, realm and owner, never the computer shown", async () => {
    const o = onOther('bbbbbbbbbb');
    const { io, calls } = recorder([o.d], [o.a], { 's-bbbbbbbbbb': 'cancelled' });
    render(<Harness io={io} />);
    await flush();
    const r = of(calls, 'receipt');
    expect(r).toHaveLength(1);
    expect(r[0]!.b).toEqual({ target: OTHER, realm: 'r2', owner: 'fp1', exec: 1 });
    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('borealis')).toBeInTheDocument();
  });

  it("Stop posts the cancel to the row's own computer and turn, and names that computer", async () => {
    const o = onOther('bbbbbbbbbb');
    const { io, calls } = recorder([o.d], [o.a], { 's-bbbbbbbbbb': 'dispatched' });
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop the build on borealis' }));
    await flush();
    expect(of(calls, 'stop')).toEqual([{ op: 'stop', b: { target: OTHER, realm: 'r2', owner: 'fp1', exec: 1 }, sid: 's-bbbbbbbbbb', turnId: 't-bbbbbbbbbb' }]);
  });

  it("a stop the agent didn't confirm: can't tell, and its Check again reads only that turn's receipt", async () => {
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'dispatched' });
    io.stop = vi.fn(async () => false);
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Stop the build on atlas' }));
    await flush();
    expect(plain(toasts)).toEqual([{ title: strings['build.stopUnknownOn'].replace('{{computer}}', 'atlas'), tone: 'unknown' }]);
    const before = calls.length;
    // Still running: the toast stays as it is (undefined); nothing but reads is sent.
    expect(await toasts[0]!.action!.onAction()).toBeUndefined();
    await flush();
    expect(calls.slice(before).every((c) => c.op !== 'stop' && c.op !== 'discard')).toBe(true);
    expect(of(calls.slice(before), 'receipt').map((c) => c.sid)).toContain('s-aaaaaaaaaa');
  });

  it("a discarded build whose cancel wasn't confirmed: its Check again closes the toast once the turn ended", async () => {
    const receipts: Record<string, string> = { 's-aaaaaaaaaa': 'accepted' };
    const { io } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], receipts);
    io.stop = vi.fn(async () => false);
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(plain(toasts)).toEqual([{ title: strings['build.discardedRunningOn'].replace('{{computer}}', 'atlas'), tone: 'unknown' }]);
    expect(toasts[0]!.action!.label).toBe(strings['build.check']);
    expect(await toasts[0]!.action!.onAction()).toBeUndefined();
    receipts['s-aaaaaaaaaa'] = 'cancelled';
    expect(await toasts[0]!.action!.onAction()).toBe(true);
    // An unreadable receipt proves nothing: the toast says it couldn't check (false).
    delete receipts['s-aaaaaaaaaa'];
    expect(await toasts[0]!.action!.onAction()).toBe(false);
    // Another turn's receipt (ended or not) proves nothing about this one either.
    io.reads = { ...io.reads, receipt: async (_b, _sid) => ({ turnId: 't-other', state: 'completed', ended: true, code: 'completed' }) };
    expect(await toasts[0]!.action!.onAction()).toBe(false);
  });

  it('Discard asks first; confirmed, it cancels a running build and then ends the draft', async () => {
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'accepted' });
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Discard this build?')).toBeInTheDocument();
    expect(within(dialog).getByText(/The assistant's work is not kept\./)).toBeInTheDocument();
    expect(of(calls, 'stop')).toHaveLength(0);
    expect(of(calls, 'discard')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(calls.filter((c) => c.op === 'stop' || c.op === 'discard').map((c) => c.op)).toEqual(['stop', 'discard']);
  });

  // A legacy ask is never read (the page that settled it is retired), so its turn may still run: Discard warns, cancels its
  // recorded turn on its own computer first, and says when that cannot be confirmed.
  it('Discard of a legacy ask with a recorded turn warns that it may still run, cancels that turn on its own computer, then closes the stored ask', async () => {
    const legacy = ask('legacy0001', { askId: 'ask-legacy', path: null });
    const { io, calls } = recorder([], [legacy], {});
    (io.stop as ReturnType<typeof vi.fn>).mockImplementation(async (b: Binding, sid: string, turnId: string) => { calls.push({ op: 'stop', b, sid, turnId }); return 'unknown'; });
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/it may keep running/)).toBeInTheDocument();
    expect(io.close).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(of(calls, 'stop')).toEqual([expect.objectContaining({ sid: 's-legacy0001', turnId: 't-legacy0001', b: expect.objectContaining({ target: expect.objectContaining({ container: expect.objectContaining({ id: TARGET.container.id }) }) }) })]);
    expect(io.close).toHaveBeenCalledTimes(1);
    expect((io.close as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({ askId: 'ask-legacy' });
    expect(of(calls, 'discard')).toEqual([]);
    // The cancel was not confirmed: Discarded, may still finish, with a Check again that only reads.
    expect(toasts.map((x) => x.tone)).toEqual(['unknown']);
    expect(toasts[0]!.title).toMatch(/can't tell whether the build stopped/);
    expect(toasts[0]!.action?.label).toBe(strings['build.check']);
  });

  it('Discard of a legacy ask with no recorded turn warns, cancels nothing (nothing to address), closes it and says it may still run', async () => {
    const legacy = ask('legacy0002', { askId: 'ask-legacy2', path: null, sessionId: null, turnId: null, phase: 'turn' });
    const { io, calls } = recorder([], [legacy], {});
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/it may keep running/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(of(calls, 'stop')).toEqual([]);
    expect(io.close).toHaveBeenCalledTimes(1);
    expect(plain(toasts)).toEqual([{ title: expect.stringMatching(/^Discarded\. The build may still run on /), tone: 'unknown' }]);
  });

  it('Discard of a settled build ends the draft without a cancel', async () => {
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'failed' });
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(of(calls, 'stop')).toHaveLength(0);
    expect(of(calls, 'discard')).toHaveLength(1);
  });

  it("Open shows the build's computer when it is not the one shown", async () => {
    const o = onOther('bbbbbbbbbb');
    const { io } = recorder([o.d], [o.a], { 's-bbbbbbbbbb': 'cancelled' });
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }));
    expect(snapshot().target?.container.id).toBe('c2');
    expect(snapshot().target?.project.id).toBe('p2');
  });

  it('/state only for Building rows; settled rows are read once, unsettled ones again every 5 s, never while hidden', async () => {
    buildTiming.everyMs = 40;
    const { io, calls } = recorder([draft('aaaaaaaaaa'), draft('cccccccccc')], [ask('aaaaaaaaaa'), ask('cccccccccc', { sentAt: 2 })], { 's-aaaaaaaaaa': 'dispatched', 's-cccccccccc': 'cancelled' });
    render(<Harness io={io} />);
    await flush();
    // Only the Building row's /state is read (a 5 s tick may already have read it again on a loaded host: counts are not pinned here).
    expect(of(calls, 'state').length).toBeGreaterThan(0);
    expect(of(calls, 'state').every((c) => c.sid === 's-aaaaaaaaaa')).toBe(true);
    await act(async () => { await new Promise((r) => setTimeout(r, 130)); });
    await flush();
    const running = of(calls, 'receipt').filter((c) => c.sid === 's-aaaaaaaaaa').length;
    expect(running).toBeGreaterThan(1);
    expect(of(calls, 'receipt').filter((c) => c.sid === 's-cccccccccc')).toHaveLength(1);
    expect(of(calls, 'state').every((c) => c.sid === 's-aaaaaaaaaa')).toBe(true);
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const before = of(calls, 'receipt').length;
    await act(async () => { await new Promise((r) => setTimeout(r, 130)); });
    await flush();
    expect(of(calls, 'receipt').length).toBe(before);
    vis.mockRestore();
  });

  it('nothing is read while the section is not shown (the New script view)', async () => {
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'dispatched' });
    render(<Harness io={io} enabled={false} />);
    await flush();
    expect(calls).toEqual([]);
  });

  it("a computer gone from a whole list: can't tell yet, with Check again and Discard (no cancel is sent)", async () => {
    const gone = draft('dddddddddd', { compId: 'c9' });
    const { io, calls } = recorder([gone], [ask('dddddddddd', { compId: 'c9' })], {});
    render(<Harness io={io} />);
    await flush();
    expect(await screen.findByText("Can't tell yet")).toBeInTheDocument();
    expect(lines[0]!.binding).toBeNull();
    expect(of(calls, 'receipt')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(of(calls, 'stop')).toHaveLength(0);
    expect(of(calls, 'discard')).toHaveLength(1);
  });

  // ---- a turn recorded while the confirm is open, and abandoned reservations ----
  it('a lost ask with no turn id may still run: the confirm warns, no cancel can be addressed, and Discard goes on', async () => {
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa', { phase: 'lost', turnId: null })], {});
    render(<Harness io={io} />);
    await flush();
    expect(await screen.findByText("Can't tell yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/may keep running on atlas until it finishes/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(calls.filter((c) => c.op === 'stop' || c.op === 'discard').map((c) => c.op)).toEqual(['discard']);
    // The stop could not be confirmed: the toast says it may still run, never that it stopped. Nothing can be read for it,
    // so it says why instead of offering a Check again.
    expect(plain(toasts)).toEqual([{ title: strings['build.discardedLostOn'].replace('{{computer}}', 'atlas'), tone: 'unknown' }]);
    expect(toasts[0]!.body).toBe(strings['build.discardedLostBody']);
    expect(toasts[0]!.action).toBeUndefined();
  });

  // ---- a known turn whose computer is not resolved yet is not "never recorded" ----
  it("a discarded build whose turn is known but whose computer isn't resolved yet: Check again resolves its own computer, then reads its turn", async () => {
    const receipts: Record<string, string> = { 's-aaaaaaaaaa': 'accepted' };
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], receipts);
    io.stop = vi.fn(async () => false);
    const refetch = vi.fn(async (): Promise<unknown> => ({ data: containers }));
    render(<Harness io={io} rows={null} refetch={refetch} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    // Its turn was recorded: never the "no turn was ever recorded" copy, and a read-only Check again is offered.
    expect(plain(toasts)).toEqual([{ title: strings['build.discardedRunning'], tone: 'unknown' }]);
    expect(toasts[0]!.body).toBeUndefined();
    expect(toasts[0]!.action!.label).toBe(strings['build.check']);
    const before = calls.length;
    expect(await toasts[0]!.action!.onAction()).toBeUndefined();
    expect(refetch).toHaveBeenCalled();
    const r = of(calls.slice(before), 'receipt');
    expect(r.map((c) => c.sid)).toEqual(['s-aaaaaaaaaa']);
    expect(r[0]!.b).toEqual({ target: TARGET, realm: R1, owner: 'fp1', exec: 1 });
    receipts['s-aaaaaaaaaa'] = 'cancelled';
    expect(await toasts[0]!.action!.onAction()).toBe(true);
    // Its computer still can't be found: nothing is read anywhere else, and the toast says it couldn't check.
    refetch.mockImplementation(async () => ({ data: null }));
    const n = calls.length;
    expect(await toasts[0]!.action!.onAction()).toBe(false);
    expect(calls.slice(n).filter((c) => c.op !== 'containers')).toEqual([]);
    expect(calls.slice(before).every((c) => c.op !== 'stop' && c.op !== 'discard')).toBe(true);
  });

  // ---- a turn recorded while the confirm is open, and abandoned reservations, through the page ----
  it('a turn another tab records while the Discard confirm is open: the toast keeps Check again for exactly that turn', async () => {
    const receipts: Record<string, string> = { 's-aaaaaaaaaa': 'accepted' };
    const shown = ask('aaaaaaaaaa', { phase: 'lost', turnId: null });
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [shown], receipts);
    // The discard removes the ask as stored by then: the writer in another tab stored its turn after this row was read.
    const stored = { ...shown, phase: 'wait' as const, turnId: 't-late' };
    io.discard = vi.fn(async (r: DraftRecord) => { calls.push({ op: 'discard', draftId: r.draftId }); return { ok: true as const, clean: true, removed: [stored] }; });
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(plain(toasts)).toEqual([{ title: strings['build.discardedRunningOn'].replace('{{computer}}', 'atlas'), tone: 'unknown' }]);
    expect(toasts[0]!.body).toBeUndefined();
    expect(toasts[0]!.action!.label).toBe(strings['build.check']);
    const before = calls.length;
    io.reads = { ...io.reads, receipt: async (b, sid, turnId) => { calls.push({ op: 'receipt', b, sid, turnId }); return { turnId, state: 'cancelled', ended: true, code: 'cancelled' }; } };
    expect(await toasts[0]!.action!.onAction()).toBe(true);
    expect(calls.slice(before)).toEqual([{ op: 'receipt', b: { target: TARGET, realm: R1, owner: 'fp1', exec: 1 }, sid: 's-aaaaaaaaaa', turnId: 't-late' }]);
  });

  it('the row showed an older turn of the same ask: the toast checks the turn the discard removed, not the shown one', async () => {
    const shown = ask('aaaaaaaaaa', { turnId: 't-old' });
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [shown], { 's-aaaaaaaaaa': 'accepted' });
    io.stop = vi.fn(async () => false);
    io.discard = vi.fn(async () => ({ ok: true as const, clean: true, removed: [{ ...shown, turnId: 't-new' }] }));
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    const before = calls.length;
    io.reads = { ...io.reads, receipt: async (b, sid, turnId) => { calls.push({ op: 'receipt', b, sid, turnId }); return { turnId, state: 'cancelled', ended: true, code: 'cancelled' }; } };
    expect(await toasts[0]!.action!.onAction()).toBe(true);
    expect(calls.slice(before).map((c) => c.turnId)).toEqual(['t-new']);
  });

  it('the draft-store note shows even when no row is listed', () => {
    const view = { status: 'ok' as const, lines: [], full: null, draftsFull: true, changes: [], check: vi.fn(), stop: vi.fn(), discard: vi.fn(), discardChange: vi.fn(), retry: vi.fn() };
    render(<Building view={view} onOpen={() => undefined} onOpenChange={() => undefined} />);
    expect(screen.getByText(strings['build.draftsFull'].replace('{{max}}', '32'))).toBeInTheDocument();
  });

  it('both stores full: one note, with the ask store\'s sentence (nothing can start), never two', () => {
    const view = { status: 'ok' as const, lines: [], full: { n: 32, m: 0 }, draftsFull: true, changes: [], check: vi.fn(), stop: vi.fn(), discard: vi.fn(), discardChange: vi.fn(), retry: vi.fn() };
    render(<Building view={view} onOpen={() => undefined} onOpenChange={() => undefined} />);
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(screen.queryByText(strings['build.draftsFull'].replace('{{max}}', '32'))).toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(/32/);
  });

  it('a reserved attempt with no stored ask: Not started, and Discard ends it after the plain confirm, with no stop and no toast', async () => {
    const { io, calls } = recorder([draft('aaaaaaaaaa', { current: 1 })], [], {});
    render(<Harness io={io} />);
    await flush();
    const row = (await screen.findByText('Not started')).closest('li')!;
    expect(within(row).getByText(strings['build.labelUnknown'])).toBeInTheDocument();
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['Open', 'Discard']);
    await userEvent.click(within(row).getByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(strings['build.discardBody'])).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(calls.map((c) => c.op)).toEqual(['discard']);
    expect(toasts).toEqual([]);
  });

  it('a draft store that no draft can make room in says so, even with no ask stored', async () => {
    const drafts = Array.from({ length: 32 }, (_, i) => draft(`d${String(i).padStart(9, '0')}`, { current: 1 }));
    const { io } = recorder(drafts, [], {});
    render(<Harness io={io} />);
    await flush();
    expect(await screen.findByText(strings['build.draftsFull'].replace('{{max}}', '32'))).toBeInTheDocument();
    expect(screen.queryByText(/assistant requests/)).toBeNull();
    expect(screen.getAllByText('Not started')).toHaveLength(32);
  });

  it('an ask left starting by a draft that ended can still be discarded (its slot is freed)', async () => {
    const { io } = recorder([draft('aaaaaaaaaa', { state: 'discarded' })], [ask('aaaaaaaaaa', { phase: 'create', sessionId: null, turnId: null })], {});
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(io.close).toHaveBeenCalledTimes(1);
  });

  it('a full store of change requests whose scripts are gone: each can be discarded from the note, after a confirm', async () => {
    const chg: ScriptAsk[] = Array.from({ length: 32 }, (_, i) => ({ ...ask('aaaaaaaaaa'), askId: `c${i}`, path: `default/1/gone-${i}.ts` }));
    const { io } = recorder([], chg, {});
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Show the change requests' }));
    const item = screen.getByText('default/1/gone-3.ts').closest('li')!;
    await userEvent.click(within(item).getByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Discard this change request?')).toBeInTheDocument();
    expect(io.close).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(io.close).toHaveBeenCalledWith(chg[3]);
    expect(toasts).toEqual([]);
  });

  it('a change request the store could not show removed: a toast says so', async () => {
    const chg: ScriptAsk[] = Array.from({ length: 32 }, (_, i) => ({ ...ask('aaaaaaaaaa'), askId: `c${i}`, path: `default/1/gone-${i}.ts` }));
    const { io } = recorder([], chg, {});
    io.close = vi.fn(async () => 'unknown' as const);
    render(<Harness io={io} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Show the change requests' }));
    await userEvent.click(within(screen.getByText('default/1/gone-3.ts').closest('li')!).getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }));
    await flush();
    expect(toasts.map((x) => x.title)).toEqual([strings['build.discardChangeFailed']]);
  });

  it('the heartbeat clock runs only while a deploy is beating', async () => {
    buildTiming.clockMs = 777;
    const spy = vi.spyOn(globalThis, 'setInterval');
    const { io } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'dispatched' });
    render(<Harness io={io} />);
    await flush();
    expect(spy.mock.calls.filter((c) => c[1] === 777)).toHaveLength(0);
    spy.mockRestore();
  });

  it('the page hands the containers retry to the section', () => {
    expect(viewSource).toMatch(/useBuilds\(buildSrc\.io, buildSrc\.computers, [^,]+, buildSrc\.refetch\)/);
  });

  it('the computers are read for the section only while it is shown (never on New script)', () => {
    // One flag decides both: the section's reads and its containers read.
    expect(viewSource).toMatch(/const buildsShown = sub\[0\] !== 'new';/);
    expect(viewSource).toMatch(/useBuildSource\(buildsShown\)/);
    expect(viewSource).toMatch(/useBuilds\(buildSrc\.io, buildSrc\.computers, buildsShown, /);
  });

  it("a deploy whose sending tab stopped beating turns to can't tell yet on its own (no read, no send)", async () => {
    buildTiming.clockMs = 40;
    const rec = draft('aaaaaaaaaa', { state: 'deploying', deploy: { kind: 'write', path: '/a.ts', opId: 'op', sentAfter: 1, attempt: 1, beatAt: Date.now() - DEPLOY_BEAT_STALE_MS + 150, phase: 'sending' } });
    const { io, calls } = recorder([rec], [ask('aaaaaaaaaa')], {});
    render(<Harness io={io} />);
    await flush();
    expect(screen.getByText('Going live')).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.getByText(strings['build.pill.goingLiveUnknown'])).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  describe('a deploy nobody answered for: Going live · not confirmed, Check and a warned Discard', () => {
    const PATH = 'default/1/notes.ts';
    const held = (o: Partial<DraftRecord> = {}) => draft('aaaaaaaaaa', { mode: 'write', current: 0, state: 'deploying', deploy: { kind: 'write', path: PATH, opId: 'op1', sentAfter: 1, attempt: 0, beatAt: 1, phase: 'held' }, ...o });
    const rowOf = async () => (await screen.findByText(strings['build.pill.goingLiveUnknown'])).closest('li')!;

    it("names its own computer from the record, with Check again, Open and Discard", async () => {
      const { io, calls } = recorder([held()], [], {});
      render(<Harness io={io} />);
      await flush();
      const row = await rowOf();
      // The pill says what is known, not a cause: an unknown outcome is not always a computer that didn't answer.
      expect(within(row).getByText('Going live · not confirmed')).toBeInTheDocument();
      expect(within(row).queryByText(/didn.t answer/i)).toBeNull();
      expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual([strings['build.check'], strings['build.open'], strings['build.discard']]);
      expect(within(row).getByText('atlas')).toBeInTheDocument();
      expect(calls).toEqual([]);
    });

    it('Check reads the script on the reservation\'s computer; no answer says so with its cause and changes nothing', async () => {
      const { io, calls } = recorder([held({ project: 'p2', compId: 'c2', realm: 'r2' })], [], {}, 'timeout');
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(within(await rowOf()).getByRole('button', { name: strings['build.check'] }));
      await flush();
      expect(of(calls, 'script').map((c) => [c.b?.target.container.id, c.b?.target.project.id, c.b?.realm, c.path])).toEqual([['c2', 'p2', 'r2', PATH]]);
      expect(toasts).toEqual([{ title: strings['build.deployUnknownOn'].replace('{{computer}}', 'borealis'), body: strings['flow.live.why.timeout'].replace('{{computer}}', 'borealis'), tone: 'unknown' }]);
      expect(of(calls, 'discard')).toEqual([]);
    });

    it("Check with no cause known: the plain not-known toast", async () => {
      const { io } = recorder([held()], [], {}, null);
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(within(await rowOf()).getByRole('button', { name: strings['build.check'] }));
      await flush();
      expect(toasts).toEqual([{ title: strings['build.deployUnknownOn'].replace('{{computer}}', 'atlas'), tone: 'unknown' }]);
    });

    it("Check that finds no script there says so and points at the draft; the list frees nothing", async () => {
      const rec = held();
      const { io, calls } = recorder([rec], [], {}, false);
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(within(await rowOf()).getByRole('button', { name: strings['build.check'] }));
      await flush();
      expect(plain(toasts)).toEqual([{ title: strings['build.deployAbsentOn'].replace('{{computer}}', 'atlas').replace('{{route}}', '/notes'), tone: 'warn' }]);
      expect(io.records()).toEqual({ drafts: [rec], asks: [] });
      expect(calls.map((c) => c.op)).toEqual(['script']);
    });

    // An idea's request has no journal to fence it, so no script there yet
    // is not "hasn't made it": the list says the request may still arrive, never offers to deploy again, and changes nothing.
    it("Check that finds no script for an idea's deploy says its request may still arrive; the list frees nothing", async () => {
      const rec = held({ deploy: { kind: 'instantiate', path: PATH, opId: 'k1', sentAfter: null, attempt: 0, beatAt: 1, phase: 'held' } });
      const { io, calls } = recorder([rec], [], {}, false);
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(within(await rowOf()).getByRole('button', { name: strings['build.check'] }));
      await flush();
      expect(plain(toasts)).toEqual([{ title: strings['build.deployUnprovenOn'].replace('{{computer}}', 'atlas').replace('{{route}}', '/notes'), tone: 'unknown' }]);
      expect(io.records()).toEqual({ drafts: [rec], asks: [] });
      expect(calls.map((c) => c.op)).toEqual(['script']);
      expect(within(await rowOf()).getByText('Going live · not confirmed')).toBeInTheDocument();
    });

    // A script found at the path may be another writer's, which only the draft's own Check (hoody-exec's
    // journal) can tell: the list never makes a write live, says so and points at the draft.
    it("Check that finds a write's script there never makes it live: it points at the draft's own Check; the list changes nothing", async () => {
      const rec = held();
      const { io, calls } = recorder([rec], [], {}, true);
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(within(await rowOf()).getByRole('button', { name: strings['build.check'] }));
      await flush();
      expect(plain(toasts)).toEqual([{ title: strings['build.deployFoundOn'].replace('{{computer}}', 'atlas').replace('{{route}}', '/notes'), tone: 'unknown' }]);
      expect(io.records()).toEqual({ drafts: [rec], asks: [] });
      expect(calls.map((c) => c.op)).toEqual(['script']);
      expect(within(await rowOf()).getByText('Going live · not confirmed')).toBeInTheDocument();
    });

    it('Discard warns that it may be live, then ends the draft as one that may be deployed', async () => {
      const { io, calls } = recorder([held()], [], {});
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(within(await rowOf()).getByRole('button', { name: strings['build.discard'] }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText(strings['flow.live.discardWarn.title'])).toBeInTheDocument();
      expect(within(dialog).getByText(strings['flow.live.discardWarn.body'].replace('{{computer}}', 'atlas'))).toBeInTheDocument();
      expect(of(calls, 'discard')).toHaveLength(0);
      await userEvent.click(within(dialog).getByRole('button', { name: strings['build.discard'] }));
      await flush();
      expect(of(calls, 'discard')).toEqual([{ op: 'discard', draftId: 'aaaaaaaaaa', o: { mayBeDeployed: true } }]);
      expect(of(calls, 'stop')).toHaveLength(0);
    });

    it('an ordinary build\'s Discard still says nothing of a deploy', async () => {
      const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'failed' });
      render(<Harness io={io} />);
      await flush();
      await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).queryByText(strings['flow.live.discardWarn.title'])).toBeNull();
      await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
      await flush();
      expect(of(calls, 'discard')).toEqual([{ op: 'discard', draftId: 'aaaaaaaaaa', o: {} }]);
    });
  });

  it("Check again on a row whose computer can't be told reads the computers again", async () => {
    const refetch = vi.fn();
    const { io } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], {});
    render(<Harness io={io} rows={null} refetch={refetch} />);
    await flush();
    await userEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('a read chain started before the page was hidden starts no further read', async () => {
    let release!: () => void;
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'dispatched' });
    const session = io.reads.session;
    io.reads = { ...io.reads, session: (b, sid) => new Promise((res) => { release = () => void session(b, sid).then(res); }) };
    render(<Harness io={io} />);
    await flush();
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    release();
    await flush();
    expect(of(calls, 'receipt')).toHaveLength(0);
    expect(of(calls, 'state')).toHaveLength(0);
    vis.mockRestore();
  });

  it('a chain hidden while its receipt is read starts no /state read', async () => {
    let release!: () => void;
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'dispatched' });
    const receipt = io.reads.receipt;
    io.reads = { ...io.reads, receipt: (b, sid, tid) => new Promise((res) => { release = () => void receipt(b, sid, tid).then(res); }) };
    render(<Harness io={io} />);
    await flush();
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    release();
    await flush();
    expect(of(calls, 'receipt')).toHaveLength(1);
    expect(of(calls, 'state')).toHaveLength(0);
    vis.mockRestore();
  });

  it('a read chain started before New script was opened starts no further read', async () => {
    let release!: () => void;
    const { io, calls } = recorder([draft('aaaaaaaaaa')], [ask('aaaaaaaaaa')], { 's-aaaaaaaaaa': 'dispatched' });
    const session = io.reads.session;
    io.reads = { ...io.reads, session: (b, sid) => new Promise((res) => { release = () => void session(b, sid).then(res); }) };
    const v = render(<Harness io={io} />);
    await flush();
    v.rerender(<Harness io={io} enabled={false} />);
    release();
    await flush();
    expect(of(calls, 'receipt')).toHaveLength(0);
  });
});
