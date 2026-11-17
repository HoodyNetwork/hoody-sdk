// New workflow's first side: the real drawer over a fake starter, under a real router, with New chat's phases.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line no-restricted-imports -- a test harness, not page code
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports -- a router harness for the links this drawer draws
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRealm } from '@core/ctx';
import { boot, R1, R2 } from '@core/test/env';
import { ASK_MAX_TEXT, provideActiveConversations, type ActiveConversationProvider, type StartAt, type StartDoor, type StartOpts, type StartPhase, type StartState, type Starter } from '@kit';
import { createCreateAttempts } from './createAttempts';
import { parseWorkflows } from './logic';
import { NewWorkflow, type NewWorkflowProps } from './New';
import { firstMessage } from './newAsk';
import type { WorkflowCreateApi } from './sourceApi';
import strings from './New.strings.en.json';

const words = (k: keyof typeof strings, v: Record<string, string> = {}) => strings[k].replace(/\{\{(\w+)\}\}/g, (_, n: string) => v[n] ?? '');
const listed = parseWorkflows({ items: [{ name: 'src', entry_point: 'go' }] }, { hiddenCap: false });
const REF = { computer: 'box.c1aa', realm: R1, sid: 'sess-new-1' };

function fakeStarter(door: StartDoor = { ok: true }, first: StartPhase = { k: 'none' }) {
  const subs = new Set<() => void>();
  let state: StartState = { door, phase: first };
  const log = { starts: [] as { text: string; opts: StartOpts }[], checks: 0, settles: 0, order: [] as string[], at: [] as StartAt[], refuse: false };
  const set = (next: Partial<StartState>) => { state = { ...state, ...next }; for (const f of [...subs]) f(); };
  const starter: Starter = {
    state: () => state,
    subscribe: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    start: (text, opts) => {
      if (log.refuse) return false;
      log.starts.push({ text, opts });
      set({ phase: { k: 'starting' } });
      return true;
    },
    check: () => { log.checks++; },
    settle: (shown) => {
      if (shown !== state.phase) return false;
      log.settles++;
      log.order.push('settle');
      set({ phase: { k: 'none' } });
      return true;
    },
    release: () => {},
  };
  const provider: ActiveConversationProvider = { open: () => null, starter: (_a, at) => { log.at.push(at); return starter; } };
  provideActiveConversations(provider);
  return { log, phase: (p: StartPhase) => act(() => set({ phase: p })) };
}

let closed = 0;
const puts: string[] = [];
const makeApi = (name: string): WorkflowCreateApi => ({
  create: () => { puts.push(name); return Promise.resolve({ ok: true, body: { output: 'created', is_error: false } }); },
  get: () => Promise.resolve({ ok: false, err: { kind: 'pending', code: '', status: 0, notApplied: false } }),
});
const START = '/ai/workflows';
async function mount(o: Partial<NewWorkflowProps> = {}) {
  const store = createCreateAttempts();
  const client = new QueryClient();
  const root = createRootRoute({
    component: () => <NewWorkflow computer="box" realm={null} listed={listed} onClose={() => { closed++; }} onCreated={() => {}} store={store} makeApi={makeApi} {...o} />,
  });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: [START] }) });
  render(<QueryClientProvider client={client}><RouterProvider router={router as never} /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  return router;
}
const askBox = () => screen.getByRole('textbox', { name: new RegExp(words('new.ai.ask').replace('?', '\\?')) });
const nameBox = () => screen.queryByRole('textbox', { name: words('new.name') });
const write = () => screen.getByRole('button', { name: words('new.ai.write') });
// The drawer's one switch: Write it | Ask the agent.
const toSource = () => screen.getByRole('radio', { name: words('new.mode.write') });
const toAsk = () => screen.getByRole('radio', { name: words('new.mode.ask') });
const isOff = (b: HTMLElement) => b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true';
const offWith = (why: string) => { expect(isOff(write())).toBe(true); expect(write()).toHaveAccessibleDescription(why); };

beforeEach(() => { boot({ realm: R1 }); closed = 0; puts.length = 0; });
afterEach(() => { cleanup(); provideActiveConversations(null); });

describe('the drawer opens on asking', () => {
  it('shows the question, focus in it, Write it with AI, and the source form only behind its button', async () => {
    fakeStarter();
    await mount();
    await waitFor(() => expect(askBox()).toHaveFocus());
    expect(write()).toBeInTheDocument();
    expect(toSource()).toBeInTheDocument();
    expect(nameBox()).toBeNull();
  });
  it('says what happens, in words true of the default path and of the switch turned on', async () => {
    fakeStarter();
    await mount();
    expect(screen.getByText(words('new.ai.body', { computer: 'box' }))).toBeInTheDocument();
    expect(strings['new.ai.body']).toContain('writes the workflow');
    expect(strings['new.ai.body']).toContain('decide whether saving asks you first');
    expect(strings['new.ai.body']).not.toContain('shows you the workflow before saving');
  });
  it('names its agent, and links to that agent\'s page', async () => {
    fakeStarter();
    await mount();
    expect(screen.getByText(words('new.ai.agent', { agent: 'workflow-editor' }))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: words('new.ai.agentEdit') }).getAttribute('href')).toContain('/ai/agents/workflow-editor');
  });
  it('Make a copy… opens on the source form', async () => {
    fakeStarter();
    await mount({ copyOf: 'src' });
    expect(nameBox()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: words('new.ai.write') })).toBeNull();
  });
  it('switching sides keeps what was typed on each', async () => {
    fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(toSource());
    await userEvent.type(nameBox()!, 'mine');
    await userEvent.click(toAsk());
    expect(askBox()).toHaveValue('run my tests');
    await userEvent.click(toSource());
    expect(nameBox()).toHaveValue('mine');
  });
});

describe('the press', () => {
  it('is one start, exactly: the first message, workflow-editor, not strict, Off for this start, New workflow\'s, no model, and no PUT', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), '  run my tests ');
    await userEvent.click(write());
    expect(f.log.starts).toEqual([{ text: firstMessage('run my tests'), opts: { agent: 'workflow-editor', strict: false, askFirst: true, from: 'workflow' } }]);
    expect(Object.keys(f.log.starts[0]!.opts)).not.toContain('model');
    expect(puts).toEqual([]);
  });
  it('goes to the computer and realm the drawer opened on', async () => {
    const f = fakeStarter();
    await mount();
    expect(f.log.at[0]).toEqual({ computer: { project: 'p1', id: 'c1', name: 'box', server: 'sv1' }, realm: R1 });
  });
  it('goes to the realm the page names when it names one', async () => {
    const f = fakeStarter();
    await mount({ realm: R2 });
    expect(f.log.at[0]!.realm).toBe(R2);
  });
  it('a second press while it starts sends nothing', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    await userEvent.click(write());
    expect(f.log.starts).toHaveLength(1);
    offWith(words('new.start.busy'));
  });
  it('nothing typed, or only spaces: the button says why and nothing starts', async () => {
    const f = fakeStarter();
    await mount();
    offWith(words('new.ai.empty'));
    await userEvent.type(askBox(), '   ');
    offWith(words('new.ai.empty'));
    await userEvent.click(write());
    expect(f.log.starts).toEqual([]);
  });
  it('past what a first message holds: the button says by how much; at the limit it starts', async () => {
    const f = fakeStarter();
    await mount();
    const room = ASK_MAX_TEXT - firstMessage('').length;
    await userEvent.click(askBox());
    await userEvent.paste('x'.repeat(room + 2));
    offWith(words('new.ai.long', { over: '2' }));
    await userEvent.click(write());
    expect(f.log.starts).toEqual([]);
    await userEvent.click(askBox());
    await userEvent.keyboard('{Backspace}{Backspace}');
    expect(isOff(write())).toBe(false);
    await userEvent.click(write());
    expect(f.log.starts).toHaveLength(1);
  });
  it('the starter refusing at the press says Not sent, keeps the words', async () => {
    const f = fakeStarter();
    f.log.refuse = true;
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    expect(screen.getByText(words('new.start.notSent'))).toBeInTheDocument();
    expect(askBox()).toHaveValue('run my tests');
  });
});

describe('the start\'s phases', () => {
  it('waiting and starting say so, and neither leaves the page', async () => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'waiting' });
    expect(screen.getByText(words('new.start.waiting', { computer: 'box' }))).toBeInTheDocument();
    f.phase({ k: 'starting' });
    expect(screen.getByText(words('new.start.starting', { computer: 'box' }))).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(START);
    expect(closed).toBe(0);
    expect(f.log.settles).toBe(0);
  });
  it('opened: settled first, then the drawer closes and the chat opens', async () => {
    const f = fakeStarter();
    const router = await mount({ onClose: () => { closed++; f.log.order.push('close'); } });
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    f.phase({ k: 'opened', ref: REF });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ai/c/${REF.sid}`));
    expect(router.state.location.search).toMatchObject({ computer: REF.computer, realm: REF.realm });
    expect(f.log.order).toEqual(['settle', 'close']);
    expect(f.log.settles).toBe(1);
  });
  it('opened with a name typed on the form side too: closing the drawer holds nothing back, as on the real page', async () => {
    const f = fakeStarter();
    const store = createCreateAttempts();
    function Page() {
      const [open, setOpen] = useState(true);
      return open ? <NewWorkflow computer="box" realm={null} listed={listed} onClose={() => setOpen(false)} onCreated={() => {}} store={store} makeApi={makeApi} /> : <p>the list</p>;
    }
    const router = createRouter({ routeTree: createRootRoute({ component: Page }), history: createMemoryHistory({ initialEntries: [START] }) });
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router as never} /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await userEvent.click(toSource());
    await userEvent.type(nameBox()!, 'mine');
    await userEvent.click(toAsk());
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    f.phase({ k: 'opened', ref: REF });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ai/c/${REF.sid}`));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('while a start is unresolved the source form stays shut: the chat opening would close it and drop what was typed there', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    for (const p of [{ k: 'starting' }, { k: 'waiting' }, { k: 'unknown' }] as StartPhase[]) {
      f.phase(p);
      expect(isOff(toSource()), p.k).toBe(true);
      await userEvent.click(toSource());
      expect(nameBox(), p.k).toBeNull();
    }
    f.phase({ k: 'none' });
    expect(isOff(toSource())).toBe(false);
    await userEvent.click(toSource());
    expect(nameBox()).toBeInTheDocument();
  });
  it('Make a copy… open as an earlier start\'s chat opens: the form stays, closing it still asks, and the chat waits for the asking side', async () => {
    const f = fakeStarter();
    const router = await mount({ copyOf: 'src' });
    await userEvent.type(nameBox()!, 'mine');
    f.phase({ k: 'opened', ref: REF });
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
    expect(f.log.settles).toBe(0);
    expect(closed).toBe(0);
    expect(router.state.location.pathname).toBe(START);
    expect(nameBox()).toHaveValue('mine');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(closed).toBe(0);
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    // The form holds a name: Ask the agent shows the chat behind Open it, which asks first.
    await userEvent.click(toAsk());
    await waitFor(() => expect(screen.getByText(words('new.start.ready', { computer: 'box' }))).toBeInTheDocument());
    expect(f.log.settles).toBe(1);
    expect(closed).toBe(0);
    expect(router.state.location.pathname).toBe(START);
    await userEvent.click(screen.getByRole('button', { name: words('new.open') }));
    // Open it navigates: the router's blocker asks once that navigation runs, a tick after the click, so wait for the dialog by state.
    expect(await screen.findByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(closed, 'Open it leaves the drawer open, so its own guard asks first').toBe(0);
    expect(router.state.location.pathname).toBe(START);
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await userEvent.click(toSource());
    expect(nameBox()).toHaveValue('mine');
    await userEvent.click(toAsk());
    await userEvent.click(screen.getByRole('button', { name: words('new.open') }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ai/c/${REF.sid}`));
    expect(f.log.settles).toBe(1);
  });
  it.each([
    ['a changed blank', async () => { await userEvent.type(screen.getByRole('textbox', { name: words('new.definition') }), ' '); }],
    ['a workflow picked to copy', async () => {
      await userEvent.click(screen.getByRole('radio', { name: words('new.from.copy') }));
      await userEvent.type(screen.getByRole('combobox', { name: new RegExp(`^${words('new.copyOf')}`) }), 'src');
      await userEvent.click(await screen.findByRole('option', { name: 'src' }));
    }],
  ])('the form holds %s, and nothing else: an earlier start\'s chat waits for the asking side, as for a name', async (_n, edit) => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.click(toSource());
    await edit();
    f.phase({ k: 'opened', ref: REF, from: 'workflow' });
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
    expect(f.log.settles).toBe(0);
    expect(closed).toBe(0);
    await userEvent.click(toAsk());
    await waitFor(() => expect(screen.getByText(words('new.start.ready', { computer: 'box' }))).toBeInTheDocument());
    expect(router.state.location.pathname).toBe(START);
  });
  it('a new start pressed under Open it takes its place: the earlier chat\'s band goes, the new start\'s own words show', async () => {
    const f = fakeStarter();
    await mount({ copyOf: 'src' });
    await userEvent.type(nameBox()!, 'mine');
    f.phase({ k: 'opened', ref: REF });
    await userEvent.click(toAsk());
    await waitFor(() => expect(screen.getByText(words('new.start.ready', { computer: 'box' }))).toBeInTheDocument());
    await userEvent.type(askBox(), 'run my tests');
    f.log.refuse = true;
    await userEvent.click(write());
    expect(screen.getByText(words('new.start.notSent'))).toBeInTheDocument();
    expect(screen.queryByText(words('new.start.ready', { computer: 'box' }))).toBeNull();
  });
  it('Make a copy… with nothing typed on it: the earlier start\'s chat opens at the asking side, as before', async () => {
    const f = fakeStarter();
    const router = await mount({ copyOf: 'src' });
    f.phase({ k: 'opened', ref: REF, from: 'workflow' });
    await userEvent.click(toAsk());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ai/c/${REF.sid}`));
    expect(f.log.settles).toBe(1);
    expect(closed).toBe(1);
  });
  it('an earlier start whose chat opens while the form holds words and the drawer has no address for it: says so, keeps the words', async () => {
    const f = fakeStarter();
    const router = await mount({ copyOf: 'src' });
    await userEvent.type(nameBox()!, 'mine');
    await userEvent.click(toAsk());
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'opened', ref: { ...REF, sid: 'bad sid/' } });
    await waitFor(() => expect(screen.getByText(words('new.start.unlinked'))).toBeInTheDocument());
    expect(askBox()).toHaveValue('run my tests');
    expect(screen.queryByText(words('new.start.ready', { computer: 'box' }))).toBeNull();
    expect(router.state.location.pathname).toBe(START);
    expect(closed).toBe(0);
  });
  it('a chat New chat started is not this drawer\'s: its opening stays here and settles nothing; New workflow\'s own goes', async () => {
    const f = fakeStarter();
    const router = await mount();
    f.phase({ k: 'opened', ref: { ...REF, sid: 'sess-chat' }, from: '' });
    await act(async () => { await new Promise((r) => { setTimeout(r, 0); }); });
    expect(f.log.settles).toBe(0);
    expect(closed).toBe(0);
    expect(router.state.location.pathname).toBe(START);
    expect(isOff(toSource())).toBe(false);
    f.phase({ k: 'opened', ref: REF, from: 'workflow' });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ai/c/${REF.sid}`));
    expect(f.log.settles).toBe(1);
  });
  it('this drawer\'s start opened with no address a link can carry: says so, clears the words it sent, stays', async () => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    f.phase({ k: 'opened', ref: { ...REF, sid: 'bad sid/' }, from: 'workflow' });
    await waitFor(() => expect(screen.getByText(words('new.start.unlinked'))).toBeInTheDocument());
    expect(askBox()).toHaveValue('');
    expect(router.state.location.pathname).toBe(START);
    expect(closed).toBe(0);
  });
  it('a start not this drawer\'s opened with no address while the ask box holds words: says so, the words stay', async () => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'opened', ref: { ...REF, sid: 'bad sid/' } });
    await waitFor(() => expect(screen.getByText(words('new.start.unlinked'))).toBeInTheDocument());
    expect(askBox()).toHaveValue('run my tests');
    expect(f.log.settles).toBe(1);
    expect(router.state.location.pathname).toBe(START);
    expect(closed).toBe(0);
  });
  it('a New chat start this drawer showed unknown: Check again proves it, and the drawer goes to its chat', async () => {
    const f = fakeStarter();
    const router = await mount();
    f.phase({ k: 'unknown' });
    await userEvent.click(screen.getByRole('button', { name: words('new.check') }));
    expect(f.log.checks).toBe(1);
    f.phase({ k: 'opened', ref: { ...REF, sid: 'sess-chat' }, from: '' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/ai/c/sess-chat'));
    expect(f.log.settles).toBe(1);
    expect(closed).toBe(1);
  });
  it.each([
    ['not sent', async (f: ReturnType<typeof fakeStarter>) => { f.phase({ k: 'notSent', why: '' }); }],
    ['unknown, then Stop tracking', async (f: ReturnType<typeof fakeStarter>) => {
      f.phase({ k: 'unknown' });
      await userEvent.click(screen.getByRole('button', { name: words('new.stop') }));
    }],
    ['opened with no address', async (f: ReturnType<typeof fakeStarter>) => {
      f.phase({ k: 'opened', ref: { ...REF, sid: 'bad sid/' } });
      await waitFor(() => expect(screen.getByText(words('new.start.unlinked'))).toBeInTheDocument());
    }],
  ])('this drawer\'s start ends here (%s): a chat taken up later waits for the form\'s words, as an earlier start\'s', async (_n, end) => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    expect(f.log.starts).toHaveLength(1);
    await end(f);
    await userEvent.clear(askBox());
    await userEvent.click(toSource());
    await userEvent.type(nameBox()!, 'mine');
    f.phase({ k: 'opened', ref: REF });
    await userEvent.click(toAsk());
    await waitFor(() => expect(screen.getByText(words('new.start.ready', { computer: 'box' }))).toBeInTheDocument());
    expect(closed).toBe(0);
    expect(router.state.location.pathname).toBe(START);
    await userEvent.click(toSource());
    expect(nameBox()).toHaveValue('mine');
  });
  it('the ask box holds words and nothing else: a chat taken up from elsewhere waits behind Open it, and the words stay', async () => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'opened', ref: REF });
    await waitFor(() => expect(screen.getByText(words('new.start.ready', { computer: 'box' }))).toBeInTheDocument());
    expect(askBox()).toHaveValue('run my tests');
    expect(f.log.settles).toBe(1);
    expect(closed).toBe(0);
    expect(router.state.location.pathname).toBe(START);
    await userEvent.click(screen.getByRole('button', { name: words('new.open') }));
    expect(await screen.findByRole('button', { name: 'Discard' }), 'Open it asks through the router\'s blocker, a tick after the click').toBeInTheDocument();
    expect(closed).toBe(0);
  });
  it('the ask box holds only spaces: a chat taken up from elsewhere opens at once, as for an empty drawer', async () => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), '   ');
    f.phase({ k: 'opened', ref: REF });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/ai/c/${REF.sid}`));
    expect(closed).toBe(1);
  });
  it('not sent: the agent\'s words, the text kept, Send it now starts it again', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'notSent', why: 'The agent is paused.' });
    expect(screen.getByText(words('new.start.notSentWhy', { why: 'The agent is paused.' }))).toBeInTheDocument();
    expect(askBox()).toHaveValue('run my tests');
    await userEvent.click(screen.getByRole('button', { name: words('new.start.again') }));
    expect(f.log.starts).toEqual([{ text: firstMessage('run my tests'), opts: { agent: 'workflow-editor', strict: false, askFirst: true, from: 'workflow' } }]);
  });
  it('not sent with no reason: the plain words', async () => {
    const f = fakeStarter();
    await mount();
    f.phase({ k: 'notSent', why: '' });
    expect(screen.getByText(words('new.start.notSent'))).toBeInTheDocument();
  });
  it('unknown: the words kept and held, Check again only reads, it never starts', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'unknown' });
    expect(screen.getByText(words('new.start.unknown', { computer: 'box' }))).toBeInTheDocument();
    expect(askBox()).toHaveValue('run my tests');
    expect(askBox()).toBeDisabled();
    expect(isOff(write())).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: words('new.check') }));
    expect(f.log.checks).toBe(1);
    expect(f.log.starts).toEqual([]);
  });
  it('unknown taken up from elsewhere: says its message isn\'t kept here', async () => {
    fakeStarter({ ok: true }, { k: 'unknown', taken: true });
    await mount();
    expect(screen.getByText(`${words('new.start.unknown', { computer: 'box' })} ${words('new.start.unknownNoText')}`)).toBeInTheDocument();
  });
  it('Stop tracking: settled, says where it shows if it was made, and the door opens with the words kept', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    f.phase({ k: 'unknown' });
    await userEvent.click(screen.getByRole('button', { name: words('new.stop') }));
    expect(f.log.settles).toBe(1);
    expect(screen.getByText(words('new.start.untracked'))).toBeInTheDocument();
    expect(askBox()).toHaveValue('run my tests');
    expect(isOff(write())).toBe(false);
  });
});

describe('when it can\'t start', () => {
  it('no starter (no provider): says so, and the source form is still reachable', async () => {
    provideActiveConversations(null);
    await mount();
    offWith(words('new.start.unavailable', { computer: 'box' }));
    await userEvent.click(toSource());
    expect(nameBox()).toBeInTheDocument();
  });
  it('the door closed: its own words', async () => {
    fakeStarter({ ok: false, why: 'The agent is signing in.' });
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    offWith('The agent is signing in.');
  });
  it('the context moved off the drawer\'s realm: says so, and nothing starts', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    act(() => { setRealm(R2); });
    await waitFor(() => expect(screen.getAllByText(words('new.moved', { computer: 'box' })).length).toBeGreaterThan(0));
    offWith(words('new.moved', { computer: 'box' }));
    await userEvent.click(write());
    expect(f.log.starts).toEqual([]);
  });
  it('the context moved while the start was on its way: the chat it opened does not pull this page away', async () => {
    const f = fakeStarter();
    const router = await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    expect(f.log.starts).toHaveLength(1);
    act(() => { setRealm(R2); });
    await waitFor(() => expect(screen.getAllByText(words('new.moved', { computer: 'box' })).length).toBeGreaterThan(0));
    f.phase({ k: 'opened', ref: REF });
    await act(async () => { await Promise.resolve(); });
    expect(f.log.settles).toBe(0);
    expect(closed).toBe(0);
    expect(router.state.location.pathname).toBe(START);
  });
});

describe('closing', () => {
  const cancel = () => screen.getByRole('button', { name: 'Cancel' });
  it('with nothing typed closes at once', async () => {
    fakeStarter();
    await mount();
    await userEvent.click(cancel());
    expect(closed).toBe(1);
  });
  it('with words typed asks first', async () => {
    fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(cancel());
    expect(closed).toBe(0);
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });
  it('with words on the asking side, from the source side, asks too', async () => {
    fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(toSource());
    await userEvent.click(cancel());
    expect(closed).toBe(0);
  });
  it('while it starts closes at once, and the start goes on', async () => {
    const f = fakeStarter();
    await mount();
    await userEvent.type(askBox(), 'run my tests');
    await userEvent.click(write());
    await userEvent.click(cancel());
    expect(closed).toBe(1);
    expect(f.log.settles).toBe(0);
    expect(f.log.starts).toHaveLength(1);
  });
});
