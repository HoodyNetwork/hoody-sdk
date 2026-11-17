// Vitest (New script): the AI build. Build it starts attempt n on the bound computer with
// the marker prompt; only a readable, usable answer is "written" and opens Check it; an unknown end says "can't tell yet"
// with Check again; Stop says "Stopped" only on the attempt's own cancelled end; a late answer of an older attempt is
// ignored; progress rows come only from a call paired with its result.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from '@kit';

type Answer = { outcome: string; data?: { reply: string }; code?: string };
const io = vi.hoisted(() => ({
  starts: [] as Array<{ compId: string; n: number; text: string }>,
  ends: new Map<number, (a: Answer) => void>(),
  cancel: (_n: number): Promise<boolean | 'unknown'> => Promise.resolve(true),
  check: (_n: number): Promise<Answer | null> => Promise.resolve(null),
  discards: [] as number[],
  run: null as null | { phase: string; sid: string | null; turnId: string | null; sentAt: number },
  replay: null as unknown,
  stream: null as null | { onEvent: (name: string, data: string, id?: string) => void; from?: unknown; target?: unknown },
}));

vi.mock('@core', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, resumableStream: (_r: unknown, input: never) => { io.stream = input; return { close: () => undefined, cursor: () => ({}) }; } };
});
// The attempt's live identity (its stored ask's session and turn) as the test sets it; the records themselves are the real draft
// records, in this test's localStorage.
vi.mock('./new/record', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return { ...real, useBuildRun: () => io.run };
});
vi.mock('./data', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const fx = await import('./new/flowfix');
  return {
    ...real,
    useAskStore: () => 0,
    useOverview: fx.overviewOf([fx.comp(fx.ATLAS, 'atlas', 'a.00a1', 'n1'), fx.comp(fx.BOREALIS, 'borealis', 'b.00b2', 'n2')]),
    useScriptsTarget: () => fx.targetOf(fx.shown.id),
    useResolve: () => ({ mutateAsync: async () => ({ outcome: 'done', data: { matched: false } }) }),
    useBuildApi: () => ({
      start: (b: { target: { container: { id: string } } }, _d: string, n: number, text: string) => { io.starts.push({ compId: b.target.container.id, n, text }); return new Promise((res) => io.ends.set(n, res)); },
      check: (_b: unknown, _d: string, n: number) => io.check(n),
      cancel: (_b: unknown, _d: string, n: number) => io.cancel(n),
      discard: async (_b: unknown, _d: string, n: number) => { io.discards.push(n); return 'ok'; },
    }),
    useBoundSends: () => ({ shown: true, validate: async () => ({ outcome: 'done', data: { publishable: true, results: { dependencies: {} } } }) }),
    storedBuildReads: { state: async () => ({}), replay: async () => io.replay ?? 'unreadable', receipt: async () => null, transcript: async () => null, session: async () => 'unreadable' },
  };
});

import page from './page';
import { clearDrafts } from './new/draft';
import { mintDraft } from './new/Flow';
import { clearScriptStore } from './new/flowfix';
import strings from './strings.en.json';
import { nextAttempt, readDraftRecord } from './new/records';
import type { DraftRecord } from '@core';

// A loaded host can take seconds to show a page: finds wait up to the test's own timeout.
const SLOW = { timeout: 14000 };

const loc = (r: { router: { state: { location: { pathname: string; searchStr: string } } } }) => r.router.state.location.pathname + r.router.state.location.searchStr;
const REPLY = 'Summary: Counts last week\'s sign-ups.\n```ts\nexport default () => new Response("42");\n```\n';
const btn = (key: keyof typeof strings) => screen.getByRole('button', { name: strings[key] });
const end = async (n: number, a: Answer) => { await act(async () => { io.ends.get(n)?.(a); }); };

async function toBuild() {
  const user = userEvent.setup();
  const r = await renderPage(page, { state: 'many', path: '/scripts/new/aaaaaaaaaa' });
  await user.type(await screen.findByRole('textbox', { name: strings['flow.what.describe'] }, SLOW), 'Count sign-ups');
  await user.click(btn('flow.continue'));
  await waitFor(() => expect(loc(r)).toMatch(/step=where/));
  const address = screen.getByRole('textbox', { name: strings['new.address'] });
  await user.clear(address);
  await user.type(address, '/signups');
  await user.click(btn('flow.where.build'));
  await waitFor(() => expect(loc(r)).toMatch(/step=build/));
  await waitFor(() => expect(io.starts.length).toBe(1));
  return { r, user };
}

beforeEach(async () => {
  clearDrafts(); mintDraft('aaaaaaaaaa');
  await clearScriptStore();
  io.starts.length = 0;
  io.ends.clear();
  io.discards.length = 0;
  io.cancel = () => Promise.resolve(true);
  io.check = () => Promise.resolve(null);
  io.run = null;
  io.replay = null;
  io.stream = null;
});

describe('New script flow: Build it', () => {
  it('Build it starts attempt 1 on the bound computer with the description first and the marker block after it', async () => {
    await toBuild();
    const s = io.starts[0]!;
    expect(s.n).toBe(1);
    expect(s.compId).toBe('c0a7150000000000000000a1');
    expect(s.text.startsWith('Count sign-ups\n\n[Hoody New script v1]\n')).toBe(true);
    expect(s.text).toContain('/signups');
    expect(btn('flow.built.stop')).toBeTruthy();
    expect((btn('flow.built.checkIt') as HTMLButtonElement).disabled || btn('flow.built.checkIt').getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('a usable answer is written: its summary shows, Check it opens Check', async () => {
    const { r, user } = await toBuild();
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    expect(await screen.findByText(strings['flow.built.ready'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText('Counts last week\'s sign-ups.')).toBeTruthy();
    await user.click(btn('flow.built.checkIt'));
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
  });

  it('a usable answer of an attempt another tab has moved past is not written: it says the draft changed elsewhere', async () => {
    await toBuild();
    // Another tab starts the next attempt of the same draft (the stored record moves on).
    const moved = await nextAttempt(readDraftRecord('aaaaaaaaaa') as DraftRecord, false);
    expect(moved.ok).toBe(true);
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    expect(await screen.findByText(strings['flow.built.refused.stale'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.built.ready'])).toBeNull();
    expect(screen.queryByText('Counts last week\'s sign-ups.')).toBeNull();
  });

  it('an answer without usable code says so with the reason; Build again starts attempt 2', async () => {
    const { user } = await toBuild();
    await end(1, { outcome: 'done', data: { reply: 'Sorry, I could not.' } });
    expect(await screen.findByText(strings['flow.built.noScript'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['ai.err.no_block'])).toBeTruthy();
    await user.click(btn('flow.built.again'));
    await waitFor(() => expect(io.starts.map((x) => x.n)).toEqual([1, 2]));
  });

  it('a failed build says the assistant could not finish, never that anything was written', async () => {
    await toBuild();
    await end(1, { outcome: 'failed', code: 'NOT_WIRED' });
    expect(await screen.findByText(strings['flow.built.failed'], undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.built.ready'])).toBeNull();
    expect(btn('flow.built.writeMyself')).toBeTruthy();
    // The build's control row is the kit's inline row, in its order: Build again, then Write it myself.
    const row = screen.getByRole('group', { name: strings['flow.built.actions'] });
    expect([...row.querySelectorAll('[data-action-id]')].map((b) => b.getAttribute('data-action-id'))).toEqual(['build', 'write-myself']);
    expect(row).toHaveAttribute('data-hub-inline-actions');
  });

  it('an unknown end is "can\'t tell yet" with Check again; a readable answer then writes it', async () => {
    const { user } = await toBuild();
    await end(1, { outcome: 'pending' });
    expect(await screen.findByText(strings['flow.built.unknown'].replace('{{computer}}', 'atlas'), undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(strings['flow.built.failed'])).toBeNull();
    io.check = async () => ({ outcome: 'done', data: { reply: REPLY } });
    await user.click(btn('flow.built.checkAgain'));
    expect(await screen.findByText(strings['flow.built.ready'], undefined, SLOW)).toBeTruthy();
  });

  it('Stop says "Stopping…", and "Stopped" only on the attempt\'s own cancelled end', async () => {
    const { user } = await toBuild();
    let release: (v: boolean) => void = () => undefined;
    io.cancel = () => new Promise((res) => { release = res; });
    await user.click(btn('flow.built.stop'));
    expect(await screen.findByText(strings['flow.built.stopping'], undefined, SLOW)).toBeTruthy();
    await act(async () => { release(true); });
    expect(screen.queryByText(strings['flow.built.stopped'])).toBeNull();
    await end(1, { outcome: 'failed', code: 'cancelled' });
    expect(await screen.findByText(strings['flow.built.stopped'], undefined, SLOW)).toBeTruthy();
  });

  it('a cancel whose outcome is unknown says "can\'t tell yet whether it stopped"', async () => {
    const { user } = await toBuild();
    io.cancel = async () => 'unknown';
    await user.click(btn('flow.built.stop'));
    expect(await screen.findByText(strings['flow.built.stopUnknown'], undefined, SLOW)).toBeTruthy();
  });

  it('an answer that comes after Stop was pressed shows the code with "It finished before it could stop"', async () => {
    const { user } = await toBuild();
    io.cancel = () => new Promise(() => undefined);
    await user.click(btn('flow.built.stop'));
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    expect(await screen.findByText(strings['flow.built.finishedFirst'], undefined, SLOW)).toBeTruthy();
    expect(screen.getByText(strings['flow.built.ready'])).toBeTruthy();
  });

  it('Build again over an end it cannot tell asks first; yes ends the last one, and its late answer is ignored', async () => {
    const { user } = await toBuild();
    // Attempt 1 is still running; its Stop cannot be told.
    io.cancel = async () => 'unknown';
    await user.click(btn('flow.built.stop'));
    await user.click(await screen.findByRole('button', { name: strings['flow.built.again'] }, SLOW));
    await user.click(await screen.findByRole('button', { name: strings['flow.built.replaceGo'] }, SLOW));
    await waitFor(() => expect(io.starts.map((x) => x.n)).toEqual([1, 2]));
    expect(io.discards).toEqual([1]);
    // Attempt 1 answers late: nothing is written from it.
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    expect(screen.queryByText(strings['flow.built.ready'])).toBeNull();
    await end(2, { outcome: 'done', data: { reply: REPLY.replace('42', '43') } });
    expect(await screen.findByText(strings['flow.built.ready'], undefined, SLOW)).toBeTruthy();
  });

  it('Check names build inputs changed after the build: Keep this code keeps it, Build again starts attempt 2', async () => {
    const { r, user } = await toBuild();
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    await user.click(await screen.findByRole('button', { name: strings['flow.built.checkIt'] }, SLOW));
    await waitFor(() => expect(loc(r)).toMatch(/step=check/));
    expect(await screen.findByText(strings['flow.check.ready'], undefined, SLOW)).toBeTruthy();
    const band = () => screen.queryByText(strings['flow.check.changed'].replace('{{what}}', strings['flow.check.input.route']));
    expect(band()).toBeNull();
    // Back to Where, a new address, then forward again: the code was built for the old one.
    r.router.history.back();
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=where/));
    const address = screen.getByRole('textbox', { name: strings['new.address'] });
    await user.clear(address);
    await user.type(address, '/signups-week');
    await user.click(btn('flow.where.build'));
    await user.click(await screen.findByRole('button', { name: strings['flow.built.checkIt'] }, SLOW));
    expect(await screen.findByText(strings['flow.check.changed'].replace('{{what}}', strings['flow.check.input.route']), undefined, SLOW)).toBeTruthy();
    const cont = () => screen.getByRole('button', { name: strings['flow.continue'] });
    expect((cont() as HTMLButtonElement).disabled || cont().getAttribute('aria-disabled') === 'true').toBe(true);
    expect(io.starts.length).toBe(1);
    await user.click(btn('flow.check.keep'));
    await waitFor(() => expect(band()).toBeNull());
    await waitFor(() => expect((cont() as HTMLButtonElement).disabled || cont().getAttribute('aria-disabled') === 'true').toBe(false));
  });

  it('Build again from the changed-inputs band starts attempt 2 with the new address', async () => {
    const { r, user } = await toBuild();
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    await user.click(await screen.findByRole('button', { name: strings['flow.built.checkIt'] }, SLOW));
    r.router.history.back();
    r.router.history.back();
    await waitFor(() => expect(loc(r)).toMatch(/step=where/));
    const address = screen.getByRole('textbox', { name: strings['new.address'] });
    await user.clear(address);
    await user.type(address, '/signups-week');
    await user.click(btn('flow.where.build'));
    await user.click(await screen.findByRole('button', { name: strings['flow.built.checkIt'] }, SLOW));
    await screen.findByText(strings['flow.check.changed'].replace('{{what}}', strings['flow.check.input.route']), undefined, SLOW);
    await user.click(screen.getAllByRole('button', { name: strings['flow.built.again'] })[0]!);
    await waitFor(() => expect(io.starts.map((x) => x.n)).toEqual([1, 2]));
    expect(io.starts[1]?.text).toContain('/signups-week');
    await waitFor(() => expect(loc(r)).toMatch(/step=build/));
  });

  it('progress: a call shows a row only once its result arrives, from the replay and then the stream', async () => {
    const env = (seq: number, type: string, data: unknown) => ({ seq, incarnation: 'inc1', turn_id: 't1', event: { type, data } });
    io.run = { phase: 'wait', sid: 's1', turnId: 't1', sentAt: Date.now() };
    io.replay = { events: [env(1, 'event.tool_call', { tool_id: 'a', name: 'hoody_exec_routes', arguments: {} })], minSeq: 1, maxSeq: 1, incarnation: 'inc1', pendingGate: null };
    await toBuild();
    expect(await screen.findByText(strings['flow.build.routes.now'].replace('{{computer}}', 'atlas'), undefined, SLOW)).toBeTruthy();
    expect(screen.queryByText(new RegExp(strings['flow.build.routes.ok'].replace('{{computer}}', 'atlas')))).toBeNull();
    await waitFor(() => expect(io.stream).not.toBeNull());
    expect(io.stream?.from).toEqual({ since: '1', incarnation: 'inc1' });
    expect((io.stream?.target as { container: { id: string } }).container.id).toBe('c0a7150000000000000000a1');
    await act(async () => { io.stream?.onEvent('tool_result', JSON.stringify(env(2, 'event.tool_result', { tool_id: 'a', is_error: false }))); });
    expect(await screen.findByText(new RegExp(strings['flow.build.routes.ok'].replace('{{computer}}', 'atlas')), undefined, SLOW)).toBeTruthy();
    // One line per call in a kit list, never the rail's two-column grid. The row's own words say what
    // became of the call; nothing claims "Done" for a failed one, its icon differs from a call that ran, and no row opens.
    const list = screen.getByRole('list', { name: strings['flow.built.done'] });
    expect(list.className).not.toMatch(/railList/);
    const rows = () => within(list).getAllByRole('listitem');
    expect(rows().map((x) => x.textContent)).toEqual([strings['flow.build.routes.ok'].replace('{{computer}}', 'atlas')]);
    await act(async () => { io.stream?.onEvent('tool_call', JSON.stringify(env(3, 'event.tool_call', { tool_id: 'b', name: 'hoody_exec_routes', arguments: {} }))); });
    await act(async () => { io.stream?.onEvent('tool_result', JSON.stringify(env(4, 'event.tool_result', { tool_id: 'b', is_error: true }))); });
    await waitFor(() => expect(rows()).toHaveLength(2));
    const [ran, failed] = rows() as [HTMLElement, HTMLElement];
    expect(failed.textContent).toBe(strings['flow.build.routes.err']);
    expect(failed.textContent).not.toMatch(/Done/);
    // The icons by identity (the failed row draws the kit's error icon, never the check; the call that ran draws the
    // check), and the failed row's whole accessible output, attributes included, claims nothing done.
    const iconBody = (name: 'check' | 'error') => { const d = document.createElement('div'); d.innerHTML = renderToStaticMarkup(<Icon name={name} />); return d.querySelector('svg')?.innerHTML; };
    expect(iconBody('check')).not.toBe(iconBody('error'));
    expect(failed.querySelector('svg')?.innerHTML).toBe(iconBody('error'));
    expect(ran.querySelector('svg')?.innerHTML).toBe(iconBody('check'));
    expect(failed.querySelectorAll('svg')).toHaveLength(1);
    expect(failed.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const said = [failed, ...failed.querySelectorAll('*')].flatMap((el) => ['aria-label', 'aria-description', 'title', 'alt'].map((a) => el.getAttribute(a) ?? ''));
    expect(said.filter((x) => /done|✓/i.test(x))).toEqual([]);
    expect(failed.querySelectorAll('[aria-describedby],[aria-labelledby]')).toHaveLength(0);
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
  });

  // How the build ended is one kit Verdict, the step's top plate, above the call
  // rows and the controls. Its sentence is the end's own words; the one coloured phrase is a broken end only (failed, no
  // usable script); an end it cannot tell, a stop, or nothing sent is never coloured (rule 6, C9); the reason or the stop
  // race is its one muted line.
  const verdict = () => screen.getByRole('group', { name: strings['flow.built.verdict'] });
  const mark = () => verdict().querySelector('[data-verdict-mark]');

  it('verdict: a written script is the plate\'s sentence, uncoloured; the summary and the code follow it', async () => {
    await toBuild();
    // While it runs the plate says only that it is building: no ending is claimed before the answer.
    expect(within(verdict()).getByText(strings['flow.built.running'])).toBeTruthy();
    expect(mark()).toBeNull();
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    await screen.findByText(strings['flow.built.ready'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.ready'])).toBeTruthy();
    expect(mark()).toBeNull();
    const summary = screen.getByText('Counts last week\'s sign-ups.');
    expect(verdict().compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(verdict()).queryByText('Counts last week\'s sign-ups.')).toBeNull();
    const code = screen.getByRole('button', { name: strings['flow.built.seeCode'] });
    expect(summary.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const again = btn('flow.built.again');
    expect(verdict().compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('verdict: an answer after Stop says it finished first on the plate\'s muted line', async () => {
    const { user } = await toBuild();
    io.cancel = () => new Promise(() => undefined);
    await user.click(btn('flow.built.stop'));
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    await screen.findByText(strings['flow.built.finishedFirst'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.ready'])).toBeTruthy();
    expect(within(verdict()).getByText(strings['flow.built.finishedFirst'])).toBeTruthy();
    expect(mark()).toBeNull();
  });

  it('verdict: a failed build is the one danger phrase, with its reason as the muted line', async () => {
    await toBuild();
    await end(1, { outcome: 'failed', code: 'TURN_FAILED' });
    await screen.findByText(strings['flow.built.failed'], undefined, SLOW);
    expect(mark()).toHaveAttribute('data-verdict-mark', 'danger');
    expect(mark()?.textContent).toBe(strings['flow.built.failed']);
    expect(verdict().querySelectorAll('[data-verdict-mark]')).toHaveLength(1);
    // A real failure (not NOT_WIRED, which the build API answers as not_sent); its reason is the generic one.
    expect(within(verdict()).getByText(strings['ai.err.unknown'])).toBeTruthy();
  });

  it('verdict: a build the agent ended for want of a model key says so, with what to do', async () => {
    await toBuild();
    await end(1, { outcome: 'failed', code: 'no_credentials' });
    await screen.findByText(strings['flow.built.failed'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['ai.err.noCredentials'])).toBeTruthy();
  });

  it('verdict: an agent code with no sentence of its own is named in the line', async () => {
    await toBuild();
    await end(1, { outcome: 'failed', code: 'provider_error' });
    await screen.findByText(strings['flow.built.failed'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['ai.err.unknownCode'].replace('{{code}}', 'provider_error'))).toBeTruthy();
  });

  it('verdict: no usable script is the danger phrase, with the reason under it', async () => {
    await toBuild();
    await end(1, { outcome: 'done', data: { reply: 'Sorry, I could not.' } });
    await screen.findByText(strings['flow.built.noScript'], undefined, SLOW);
    expect(mark()).toHaveAttribute('data-verdict-mark', 'danger');
    expect(mark()?.textContent).toBe(strings['flow.built.noScript']);
    expect(within(verdict()).getByText(strings['ai.err.no_block'])).toBeTruthy();
  });

  it('verdict: an end it cannot tell, a stop and nothing sent are never coloured (C9)', async () => {
    const { user } = await toBuild();
    await end(1, { outcome: 'pending' });
    await screen.findByText(strings['flow.built.unknown'].replace('{{computer}}', 'atlas'), undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.unknown'].replace('{{computer}}', 'atlas'))).toBeTruthy();
    expect(mark()).toBeNull();
    io.check = async () => ({ outcome: 'not_sent' });
    await user.click(btn('flow.built.checkAgain'));
    await screen.findByText(strings['flow.built.notSent'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.notSent'])).toBeTruthy();
    expect(mark()).toBeNull();
  });

  it('verdict: a stopped build is the plate\'s uncoloured sentence', async () => {
    const { user } = await toBuild();
    await user.click(btn('flow.built.stop'));
    await end(1, { outcome: 'failed', code: 'cancelled' });
    await screen.findByText(strings['flow.built.stopped'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.stopped'])).toBeTruthy();
    expect(mark()).toBeNull();
  });

  it('verdict: the plate sits above the call rows once the build has ended', async () => {
    const env = (seq: number, type: string, data: unknown) => ({ seq, incarnation: 'inc1', turn_id: 't1', event: { type, data } });
    io.run = { phase: 'wait', sid: 's1', turnId: 't1', sentAt: Date.now() };
    io.replay = { events: [env(1, 'event.tool_call', { tool_id: 'a', name: 'hoody_exec_routes', arguments: {} }), env(2, 'event.tool_result', { tool_id: 'a', is_error: false })], minSeq: 1, maxSeq: 2, incarnation: 'inc1', pendingGate: null };
    await toBuild();
    const list = await screen.findByRole('list', { name: strings['flow.built.done'] }, SLOW);
    // While it runs the plate says only that it is building: no ending is claimed before the answer.
    expect(within(verdict()).getByText(strings['flow.built.running'])).toBeTruthy();
    expect(mark()).toBeNull();
    await end(1, { outcome: 'failed', code: 'TURN_FAILED' });
    await screen.findByText(strings['flow.built.failed'], undefined, SLOW);
    expect(verdict().compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('verdict: a stop it cannot tell is the plate\'s uncoloured sentence (C9)', async () => {
    const { user } = await toBuild();
    io.cancel = async () => 'unknown';
    await user.click(btn('flow.built.stop'));
    await screen.findByText(strings['flow.built.stopUnknown'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.stopUnknown'])).toBeTruthy();
    expect(mark()).toBeNull();
  });

  it('verdict: an answer another tab moved past is refused in the plate, uncoloured', async () => {
    await toBuild();
    expect((await nextAttempt(readDraftRecord('aaaaaaaaaa') as DraftRecord, false)).ok).toBe(true);
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    await screen.findByText(strings['flow.built.refused.stale'], undefined, SLOW);
    expect(within(verdict()).getByText(strings['flow.built.refused.stale'])).toBeTruthy();
    expect(mark()).toBeNull();
  });

  it('verdict: a written script\'s summary and code come before the call rows', async () => {
    const env = (seq: number, type: string, data: unknown) => ({ seq, incarnation: 'inc1', turn_id: 't1', event: { type, data } });
    io.run = { phase: 'wait', sid: 's1', turnId: 't1', sentAt: Date.now() };
    io.replay = { events: [env(1, 'event.tool_call', { tool_id: 'a', name: 'hoody_exec_routes', arguments: {} }), env(2, 'event.tool_result', { tool_id: 'a', is_error: false })], minSeq: 1, maxSeq: 2, incarnation: 'inc1', pendingGate: null };
    await toBuild();
    const list = await screen.findByRole('list', { name: strings['flow.built.done'] }, SLOW);
    await end(1, { outcome: 'done', data: { reply: REPLY } });
    await screen.findByText(strings['flow.built.ready'], undefined, SLOW);
    const code = screen.getByRole('button', { name: strings['flow.built.seeCode'] });
    expect(verdict().compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(code.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
