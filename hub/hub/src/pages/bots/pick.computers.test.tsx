// Vitest: the two computer pickers of the Bot drawers are the kit PickerPanel. Guardrails' allowed computers is a multi
// list (running computers, plus any already allowed so each can be unticked); the repoint drawer is a single pick.
// eslint-disable-next-line no-restricted-imports -- a router harness for the drawers' URL state, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, render, screen, userEvent, waitFor, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BotLink, BotView, Change, Computer, GuardrailsResult, SavedSettings, SettingsPatch } from './data';
import { RepointDrawer } from './parts/LinkDrawers';
import { SettingsDrawer } from './parts/SettingsDrawer';
import strings from './strings.en.json';

const comp = (id: string, name: string, state: Computer['state'], o: Partial<Computer> = {}): Computer => ({ id, name, server: `srv-${id}`, flag: '🇸🇬', state, listState: 'ok', suspended: 0, hasMore: false, ...o });
const computers: Computer[] = [comp('c1', 'Atlas', 'running'), comp('c2', 'Borealis', 'running'), comp('c3', 'Cirrus', 'stopped')];

const bot = {
  key: 'c1~global~chief', id: 'chief', uid: 'u-chief', name: 'Chief', role: '', instructions: '', model: 'p/a', modelLabel: 'A',
  provider: { id: 'p', label: 'P', ready: 'ready' }, yolo: false, gate: null, turnRunning: false, turnId: null, sessionModel: null,
  pausedAtLimit: false, queued: 0, tasksOpen: 0, allowedComputers: null, allowedAgents: null, guardrails: [], guardrailCheck: 'off',
  guardrailRevision: 1, checkerOk: true, routing: 'off', async: false, waitSeconds: 0, realtimeMaxItems: 0,
  speech: { enabled: false, ready: null, why: null, config: null }, workers: { known: true, backend: 'llm', allowed: ['llm'], agent: '', model: '' }, caps: { botExpect: true, botGateHttp: true, botTurnCancel: true }, attention: [], createdAt: '',
} as BotView;

type Sent = { patch: SettingsPatch; rules: string[]; uid?: string; revision?: number };
// What the next save answers (the rules route's result, with the revision it answered); undefined = a plain done with nothing said.
let answer: (v: unknown) => GuardrailsResult | undefined | Promise<GuardrailsResult | undefined> = () => undefined;
const stubChange = <R, V>(calls: V[]) =>
  ({
    run: async (v: V) => {
      calls.push(v);
      const data = await answer(v);
      return { outcome: 'done' as const, ...(data ? { data } : {}) };
    },
    outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false,
    readBack: async () => true, dismiss: () => undefined, reset: () => undefined,
  }) as unknown as Change<R, V>;

async function show(ui: ReactNode): Promise<void> {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <>{ui}</> }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
}
afterEach(() => {
  cleanup();
  answer = () => undefined;
});

function guardrails(b: BotView, calls: Sent[]) {
  const save = stubChange<SavedSettings, { patch: SettingsPatch }>([]);
  const saveRules = stubChange<GuardrailsResult, Sent>(calls);
  return show(<SettingsDrawer section="guardrails" onSection={() => undefined} onClose={() => undefined} bot={b} models={[]} computers={computers} save={save} saveRules={saveRules} />);
}
// The computers list changing while a drawer is open (a computer stops, or leaves the realm).
let setLive: (c: Computer[]) => void = () => undefined;
let setLiveBot: (b: BotView) => void = () => undefined;
function LiveGuardrails({ b, calls }: { b: BotView; calls: Sent[] }) {
  const [cs, set] = useState<Computer[]>(computers);
  const [bt, setBt] = useState<BotView>(b);
  setLive = set;
  setLiveBot = setBt;
  const save = stubChange<SavedSettings, { patch: SettingsPatch }>([]);
  const saveRules = stubChange<GuardrailsResult, Sent>(calls);
  return <SettingsDrawer section="guardrails" onSection={() => undefined} onClose={() => undefined} bot={bt} models={[]} computers={cs} save={save} saveRules={saveRules} />;
}
function LiveRepoint({ calls }: { calls: { computerId: string }[] }) {
  const [cs, set] = useState<Computer[]>(computers);
  setLive = set;
  return <RepointDrawer open onClose={() => undefined} bot={bot} computers={cs} repoint={stubChange<BotLink, { computerId: string }>(calls)} />;
}
const panel = () => within(screen.getByRole('group', { name: strings['guard.computersLabel'] }));
const saveBtn = () => screen.getByRole('button', { name: /^Save/ });

describe('Guardrails: the computers its tasks may use', () => {
  it('turning "any computer" off shows the running computers to tick, and not the stopped one', async () => {
    await guardrails(bot, []);
    await userEvent.click(await screen.findByRole('switch', { name: strings['guard.anyComputer'] }));
    expect(await panel().findByText(/Atlas/)).toBeInTheDocument();
    expect(panel().getByText(/Borealis/)).toBeInTheDocument();
    expect(panel().queryByText(/Cirrus/)).toBeNull();
    expect(screen.queryByText(/srv-c1/)).toBeNull();
  });

  it('what is ticked is what Save sends, in the order ticked', async () => {
    const calls: Sent[] = [];
    await guardrails(bot, calls);
    await userEvent.click(await screen.findByRole('switch', { name: strings['guard.anyComputer'] }));
    await userEvent.click(await panel().findByRole('checkbox', { name: /Borealis/ }));
    await userEvent.click(panel().getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.patch.allowed_computers).toEqual(['c2', 'c1']);
  });

  it('a computer already allowed but stopped, or no longer listed, stays on the list so it can be unticked', async () => {
    const calls: Sent[] = [];
    await guardrails({ ...bot, allowedComputers: ['c3', 'gone-9'] }, calls);
    expect(await panel().findByRole('checkbox', { name: /Cirrus/ })).toBeChecked();
    expect(panel().getByRole('checkbox', { name: /gone-9/ })).toBeChecked();
    await userEvent.click(panel().getByRole('checkbox', { name: /gone-9/ }));
    await userEvent.click(panel().getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.patch.allowed_computers).toEqual(['c3', 'c1']);
  });

  it('already allowed computers show in their allowed order, then the other running ones, and stay put while ticking', async () => {
    await guardrails({ ...bot, allowedComputers: ['c2', 'c1'] }, []);
    await panel().findByRole('checkbox', { name: /Borealis/ });
    const names = () => panel().getAllByRole('checkbox').map((b) => b.querySelector('.label')?.textContent ?? '');
    const before = names();
    expect(before[0]).toMatch(/Borealis/);
    expect(before[1]).toMatch(/Atlas/);
    await userEvent.click(panel().getByRole('checkbox', { name: /Borealis/ }));
    expect(names()).toEqual(before);
  });

  it('restricted with nothing ticked cannot be saved (an empty list would mean any computer)', async () => {
    const calls: Sent[] = [];
    await guardrails({ ...bot, allowedComputers: ['c1'] }, calls);
    await userEvent.click(await panel().findByRole('checkbox', { name: /Atlas/ }));
    expect(saveBtn()).toBeDisabled();
    await userEvent.click(saveBtn());
    expect(calls).toHaveLength(0);
    await userEvent.click(panel().getByRole('checkbox', { name: /Borealis/ }));
    expect(saveBtn()).toBeEnabled();
  });

  it('a computer ticked now that stops meanwhile keeps its row, stays what Save sends, and can be unticked', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, allowedComputers: ['c1'] }} calls={calls} />);
    await userEvent.click(await panel().findByRole('checkbox', { name: /Borealis/ }));
    await act(async () => setLive([comp('c1', 'Atlas', 'running'), comp('c2', 'Borealis', 'stopped'), comp('c3', 'Cirrus', 'stopped')]));
    expect(panel().getByRole('checkbox', { name: /Borealis/ })).toBeChecked();
    await userEvent.click(panel().getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.patch.allowed_computers).toEqual(['c2']);
    await userEvent.click(panel().getByRole('checkbox', { name: /Borealis/ }));
    // Unticked and no longer running: nothing left to offer, and nothing left to send.
    expect(panel().queryByRole('checkbox', { name: /Borealis/ })).toBeNull();
    expect(saveBtn()).toBeDisabled();
  });

  it('a ticked computer that leaves the list keeps a masked row, never the whole id, and Save keeps the real id', async () => {
    const calls: Sent[] = [];
    const gone = '0123456789abcdef01234567';
    await guardrails({ ...bot, allowedComputers: [gone] }, calls);
    expect(await panel().findByRole('checkbox', { name: /0123…4567/ })).toBeChecked();
    expect(screen.queryByText(gone)).toBeNull();
    expect(document.body.textContent).not.toContain(gone);
    await userEvent.click(panel().getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.patch.allowed_computers).toEqual([gone, 'c1']);
  });

  it('a save carries the revision its edits were based on: another writer moving the Bot meanwhile makes it a refusal, never an overwrite', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    // Another writer restricts the Bot to c1: its revision moves and the page refreshes while these edits are pending.
    await act(async () => setLiveBot({ ...bot, guardrailRevision: 6, allowedComputers: ['c1'] }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.revision).toBe(5);
  });

  it('a form that agrees with the Bot follows its revision: the next edit is based on the new one', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5, allowedComputers: ['c1'] }} calls={calls} />);
    await userEvent.click(await panel().findByRole('checkbox', { name: /Borealis/ }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.revision).toBe(5);
    // The save landed: the Bot holds what the form says, at a newer revision.
    await act(async () => setLiveBot({ ...bot, guardrailRevision: 7, allowedComputers: ['c1', 'c2'] }));
    await userEvent.click(panel().getByRole('checkbox', { name: /Atlas/ }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revision).toBe(7);
  });

  it('another Bot under the same address (deleted and created again) starts the form over, whatever its revision', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    expect(await screen.findByRole('switch', { name: strings['guard.anyComputer'] })).toBeChecked();
    await act(async () => setLiveBot({ ...bot, uid: 'u-other', guardrailRevision: 5, allowedComputers: ['c1'] }));
    expect(screen.getByRole('switch', { name: strings['guard.anyComputer'] })).not.toBeChecked();
    expect(await panel().findByRole('checkbox', { name: /Atlas/ })).toBeChecked();
  });

  it('after "any computer" was saved and the Bot refreshed, the form agrees again and its next save carries the new revision', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5, allowedComputers: ['c1'] }} calls={calls} />);
    await userEvent.click(await screen.findByRole('switch', { name: strings['guard.anyComputer'] }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => setLiveBot({ ...bot, guardrailRevision: 7, allowedComputers: null }));
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revision).toBe(7);
  });

  it('a save whose PATCH went through but whose rules did not is retried on the revision that PATCH answered: another writer since (the live revision moved on) is not adopted', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    // The PATCH moved the Bot to 6 and the rules did not go through.
    answer = () => ({ rules: 'failed', revision: 6 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.revision).toBe(5);
    // Another writer then moved it to 7. The retry still says 6, so the server refuses it.
    await act(async () => setLiveBot({ ...bot, guardrailRevision: 7 }));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revision).toBe(6);
    expect(calls[1]?.uid).toBe('u-chief');
  });

  it('a retry of a half-saved section with no other writer sends the PATCH answer\'s revision and keeps the edit', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    answer = () => ({ rules: 'failed', revision: 6 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    answer = () => ({ rules: 'saved', revision: 8 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revision).toBe(6);
    expect(calls[1]?.rules).toEqual(['x']);
  });

  it('a second edit before the refresh of our own save is based on the revision that save answered, and goes through', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    answer = () => ({ rules: 'saved', revision: 7 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.revision).toBe(5);
    // No refresh yet: the form still shows the old Bot, and the person edits again.
    await userEvent.click(screen.getByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('y');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revision).toBe(7);
    expect(calls[1]?.uid).toBe('u-chief');
  });

  it('an older answer arriving after a newer one never lowers the fence', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    let slow: (r: GuardrailsResult) => void = () => undefined;
    answer = () => new Promise<GuardrailsResult>((resolve) => { slow = resolve; });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    answer = () => ({ rules: 'saved', revision: 7 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    await act(async () => slow({ rules: 'saved', revision: 6 }));
    answer = () => ({ rules: 'saved', revision: 8 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]?.revision).toBe(7);
  });

  it('a save answer with no revision, or one that failed outright, moves the fence nowhere', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls.map((c) => c.revision)).toEqual([5, 5]);
  });

  it('a half-saved section of Bot A does not let another Bot B, deleted and created again at the same address, be written on A\'s revision', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    answer = () => ({ rules: 'failed', revision: 6 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    // A is replaced by B (same address, revision 5, any computer): the form starts over.
    await act(async () => setLiveBot({ ...bot, uid: 'u-b', guardrailRevision: 5 }));
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('z');
    // Someone restricts B meanwhile (revision 6) while the form still shows any computer.
    await act(async () => setLiveBot({ ...bot, uid: 'u-b', guardrailRevision: 6, allowedComputers: ['c1'] }));
    answer = () => ({ rules: 'saved', revision: 8 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    // B's own opening revision and uid: the server answers 412, and the restriction survives.
    expect(calls[1]?.uid).toBe('u-b');
    expect(calls[1]?.revision).toBe(5);
  });

  it('an answer arriving late from the earlier Bot never touches the replacement Bot\'s fence', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('x');
    let late: (r: GuardrailsResult) => void = () => undefined;
    answer = () => new Promise<GuardrailsResult>((resolve) => { late = resolve; });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    await act(async () => setLiveBot({ ...bot, uid: 'u-b', guardrailRevision: 5 }));
    // A's save answers only now, with revision 9.
    await act(async () => late({ rules: 'saved', revision: 9 }));
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('z');
    answer = () => ({ rules: 'saved', revision: 10 });
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.uid).toBe('u-b');
    expect(calls[1]?.revision).toBe(5);
  });

  it('rules typed with spaces or blank lines agree with the Bot once saved: the form follows the new revision', async () => {
    const calls: Sent[] = [];
    await show(<LiveGuardrails b={{ ...bot, guardrailRevision: 5 }} calls={calls} />);
    await userEvent.click(await screen.findByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard(' x {Enter}{Enter}');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.rules).toEqual(['x']);
    await act(async () => setLiveBot({ ...bot, guardrailRevision: 7, guardrails: ['x'] }));
    await userEvent.click(screen.getByRole('textbox', { name: strings['guard.rules'] }));
    await userEvent.keyboard('y');
    await userEvent.click(saveBtn());
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revision).toBe(7);
  });

  it('with nothing ticked it still says to pick one computer', async () => {
    await guardrails({ ...bot, allowedComputers: ['c1'] }, []);
    await userEvent.click(await panel().findByRole('checkbox', { name: /Atlas/ }));
    expect(await screen.findByText(strings['guard.pickOne'])).toBeInTheDocument();
  });
});

describe('Repoint: pick the computer the Bot moves to', () => {
  const link = {} as BotLink;
  function repoint(calls: { computerId: string }[]) {
    const change = stubChange<BotLink, { computerId: string }>(calls);
    return show(<RepointDrawer open onClose={() => undefined} bot={bot} computers={[...computers, comp('c4', 'Dune', 'running', { listState: 'other_realm' })]} repoint={change} />);
  }
  void link;
  const list = () => within(screen.getByRole('radiogroup', { name: strings['picker.computer.label'] }));

  it('lists only running computers of this realm, one pick, and Move sends the picked computer', async () => {
    const calls: { computerId: string }[] = [];
    await repoint(calls);
    expect(await list().findByRole('radio', { name: /Atlas/ })).toBeInTheDocument();
    expect(list().queryByText(/Cirrus/)).toBeNull();
    expect(list().queryByText(/Dune/)).toBeNull();
    expect(screen.queryByText(/srv-c1/)).toBeNull();
    const go = screen.getByRole('button', { name: strings['repoint.go'] });
    expect(go).toBeDisabled();
    await userEvent.click(list().getByRole('radio', { name: /Borealis/ }));
    await userEvent.click(list().getByRole('radio', { name: /Atlas/ }));
    expect(list().getByRole('radio', { name: /Atlas/ })).toBeChecked();
    expect(list().getByRole('radio', { name: /Borealis/ })).not.toBeChecked();
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(calls).toEqual([{ computerId: 'c1' }]));
  });

  it('with no running computer in this realm it says so, and Move stays off', async () => {
    const change = stubChange<BotLink, { computerId: string }>([]);
    await show(<RepointDrawer open onClose={() => undefined} bot={bot} computers={[comp('c1', 'Atlas', 'running', { listState: 'other_realm' }), comp('c3', 'Cirrus', 'stopped')]} repoint={change} />);
    expect(await screen.findByText(strings['repoint.noComputers'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['repoint.go'] })).toBeDisabled();
  });

  it('a computer picked that stops meanwhile is no pick: Move goes off and nothing is sent for it', async () => {
    const calls: { computerId: string }[] = [];
    await show(<LiveRepoint calls={calls} />);
    await userEvent.click(await list().findByRole('radio', { name: /Borealis/ }));
    expect(screen.getByRole('button', { name: strings['repoint.go'] })).toBeEnabled();
    await act(async () => setLive([comp('c1', 'Atlas', 'running'), comp('c2', 'Borealis', 'stopped')]));
    expect(list().queryByText(/Borealis/)).toBeNull();
    expect(screen.getByRole('button', { name: strings['repoint.go'] })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: strings['repoint.go'] }));
    expect(calls).toHaveLength(0);
  });
});
