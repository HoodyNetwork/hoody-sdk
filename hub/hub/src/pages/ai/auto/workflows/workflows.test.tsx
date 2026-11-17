// Workflows: the list answer read into workflows, the definition's answer routes,
// the graph's rows in run order (fan-outs, merges, answers, ways back), and the list-detail page on useDataView: the
// open row in the URL, a deep link, a gone row, the paused detail (the definition read is the gated one).
// The origin as long words with a tip, "5 steps", line 2 of a list row; the detail as a
// header (origin and Hidden tags, the ActionBar) over Sections: Steps as an ItemList with order marks (4a, 4b for a row
// of several), kind badges and the branches as facts, kept when the answer-routes read fails.
// eslint-disable-next-line no-restricted-imports -- a router harness for the list's URL state, not page code (as loops/List.test.tsx)
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { CoreQueryProvider } from '@core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DataModule from './data';
import { detailState, type DetailKey, type DetailRead, type ListRead } from './data';
import { Workflows } from './List';
import { parseRuns, type Pins } from './runs';
import type * as RunsDataModule from './runsData';
import type { RunsRead } from './runsData';
import runStrings from './Runs.strings.en.json';
import { answerRoutes, graphOf, parseWorkflows, stepKind, type AnswerRoute, type Workflow } from './logic';
import strings from './strings.en.json';

const io = vi.hoisted(() => ({
  list: null as unknown as ListRead,
  detail: (_k: DetailKey | null): DetailRead => ({ state: 'ready', answers: new Map() }),
  keys: [] as (DetailKey | null)[],
  refreshed: 0,
  // The runs' read (runsData.ts is tested on its own): pending until a test gives it a listing.
  runs: { list: undefined, isPending: true, error: null, refetch: () => {} } as RunsRead,
  pins: { pinned: [], beyond: 0 } as Pins,
  // The agent reports workflow_hidden (data.hidden.test.tsx tests the read).
  cap: false,
}));
vi.mock('./data', async (orig) => ({
  ...(await orig<typeof DataModule>()),
  useWorkflowList: () => io.list,
  useWorkflowHiddenCap: () => io.cap,
  refreshWorkflows: () => void io.refreshed++,
  useWorkflowDetail: (k: DetailKey | null) => {
    io.keys.push(k);
    return io.detail(k);
  },
}));

vi.mock('./runsData', async (orig) => ({
  ...(await orig<typeof RunsDataModule>()),
  useRuns: () => io.runs,
  useRunLeases: () => io.pins,
}));

// List answers shaped as the agent's listWorkflows answers them. Fake names.
const SHIP_FIX = {
  name: 'ship-fix',
  realm: '0123456789abcdef01234567',
  summary: 'Reproduce a bug, fix it, run the tests and the review in parallel, then open a pull request.',
  step_count: 5,
  entry_point: 'reproduce',
  params: [{ name: 'issue', required: true }, { name: 'branch', default: 'fix/<issue>' }],
  timeout_sec: 1800,
  max_concurrency: 2,
  steps: [
    { id: 'reproduce', type: 'agent', detail: 'agent: explore', explanation: 'Find the smallest failing case for {{issue}}', read_only: true, next: [{ to: 'fix' }] },
    { id: 'fix', type: 'agent', detail: 'agent: implementer', explanation: 'Fix it; keep the change small', parallel: true, next: [{ to: 'test' }, { to: 'review' }] },
    { id: 'test', type: 'bash', detail: 'bash', explanation: 'npm test', next: [{ to: 'open-pr' }] },
    { id: 'review', type: 'agent', detail: 'agent: reviewer', explanation: 'Read-only review of the diff', next: [{ to: 'open-pr' }] },
    { id: 'open-pr', type: 'tool', detail: 'tool: github', explanation: 'Open a pull request against main' },
  ],
};

const REVIEW_PR = { name: 'review-pr', step_count: 1, entry_point: 'read', steps: [{ id: 'read', type: 'agent', detail: 'agent: reviewer' }] };
const RELEASE_NOTES = { name: 'release-notes', project: true, step_count: 1, entry_point: 'w', steps: [{ id: 'w', type: 'agent', detail: 'agent: writer' }] };
const PLAN_AND_BUILD = { name: 'plan-and-build', system: true, step_count: 1, entry_point: 'p', steps: [{ id: 'p', type: 'agent', detail: 'agent: planner' }] };

const wfAnswer = (items: readonly unknown[]) => ({ items, meta: { total: items.length } });

const one = (w: Record<string, unknown>): Workflow => parseWorkflows({ items: [w] })[0]!;
const ids = (w: Workflow, a?: ReadonlyMap<string, readonly AnswerRoute[]>) => graphOf(w, a).rows.map((r) => r.steps.map((s) => s.id));

describe('parseWorkflows', () => {
  it('keeps the agent order, drops a row without a name and a repeated name', () => {
    const ws = parseWorkflows({ items: [{ name: 'b' }, { summary: 'no name' }, { name: 'a' }, { name: 'b', summary: 'again' }, 7, null] });
    expect(ws.map((w) => w.name)).toEqual(['b', 'a']);
    expect(ws[0]!.summary).toBe('');
  });

  it('reads where each comes from: yours, project, system, and a changed system one', () => {
    const ws = parseWorkflows({ items: [{ name: 'a' }, { name: 'b', project: true }, { name: 'c', system: true }, { name: 'd', system: true, customized: true }] });
    expect(ws.map((w) => w.origin)).toEqual(['yours', 'project', 'system', 'customized']);
  });

  it('a list answer that is not one reads as no workflows', () => {
    for (const a of [null, {}, { items: 'x' }, []]) expect(parseWorkflows(a)).toEqual([]);
  });

  it('drops the "stop" end marker and edges without a target; params keep required and a default', () => {
    const w = one({
      name: 'x',
      entry_point: 'a',
      steps: [{ id: 'a', type: 'bash', next: [{ to: 'stop' }, { to: '' }, { to: 'b', conditional: true }] }, { id: 'b', type: 'bash' }],
      params: [{ name: 'issue', required: true }, { name: 'branch', default: 'fix/x' }, { name: 'empty', default: '' }, { description: 'no name' }],
    });
    expect(w.steps[0]!.next).toEqual([{ to: 'b', conditional: true, loop: false }]);
    expect(w.params).toEqual([
      { name: 'issue', required: true, default: null },
      { name: 'branch', required: false, default: 'fix/x' },
      { name: 'empty', required: false, default: null },
    ]);
  });

  it('step count falls back to the steps listed; the entry to the first step', () => {
    const w = one({ name: 'x', steps: [{ id: 'p' }, { id: 'q' }] });
    expect(w.stepCount).toBe(2);
    expect(w.entry).toBe('p');
  });
});

describe('graphOf', () => {
  it('ship-fix: two steps in a row, then test and review in parallel, then the pull request once', () => {
    const w = parseWorkflows(wfAnswer([SHIP_FIX]))[0]!;
    const g = graphOf(w);
    expect(ids(w)).toEqual([['reproduce'], ['fix'], ['test', 'review'], ['open-pr']]);
    expect(g.rows.map((r) => r.kind)).toEqual(['single', 'single', 'parallel', 'single']);
    expect(g.rows[2]!.from).toBe('fix');
    expect(g.then.get('test')).toEqual([{ to: 'open-pr', how: 'always' }]);
    expect(g.then.get('review')).toEqual([{ to: 'open-pr', how: 'always' }]);
    expect(g.unreachable).toEqual([]);
  });

  it('conditional links from a step that does not fan out at once read as "after" that step, never parallel', () => {
    const w = one({
      name: 'x',
      entry_point: 'a',
      steps: [{ id: 'a', next: [{ to: 'b', conditional: true }, { to: 'c', conditional: true }] }, { id: 'b' }, { id: 'c' }],
    });
    expect(ids(w)).toEqual([['a'], ['b', 'c']]);
    expect(graphOf(w).rows[1]).toMatchObject({ kind: 'after', from: 'a' });
  });

  it('a fan-out mixing an unconditional link with a conditional one names its step and keeps the condition on the link', () => {
    const w = one({ name: 'x', entry_point: 'a', steps: [{ id: 'a', next: [{ to: 'b' }, { to: 'c', conditional: true }] }, { id: 'b' }, { id: 'c' }] });
    expect(graphOf(w).rows[1]).toMatchObject({ kind: 'after', from: 'a' });
    expect(graphOf(w).then.get('a')).toEqual([{ to: 'b', how: 'always' }, { to: 'c', how: 'if' }]);
  });

  it('a row that is not one step\'s whole fan-out names no step (a plain level)', () => {
    const w = one({ name: 'x', entry_point: 'a', steps: [{ id: 'a', next: [{ to: 'b' }, { to: 'c' }] }, { id: 'b', next: [{ to: 'd' }] }, { id: 'c', next: [{ to: 'e' }] }, { id: 'd' }, { id: 'e' }] });
    expect(graphOf(w).rows[2]).toMatchObject({ kind: 'level' });
    expect(graphOf(w).rows[2]!.from).toBeUndefined();
  });

  it('parallel continuations are not labelled as branches; each card keeps its own link', () => {
    const w = one({
      name: 'x',
      entry_point: 'a',
      steps: [
        { id: 'a', parallel: true, next: [{ to: 'b' }, { to: 'c' }] },
        { id: 'b', next: [{ to: 'b2' }] },
        { id: 'c', next: [{ to: 'c2' }] },
        { id: 'b2' },
        { id: 'c2' },
      ],
    });
    const g = graphOf(w);
    expect(ids(w)).toEqual([['a'], ['b', 'c'], ['b2', 'c2']]);
    expect(g.rows.map((r) => r.kind)).toEqual(['single', 'parallel', 'level']);
    expect(g.rows[2]!.from).toBeUndefined();
    expect(g.then.get('b')).toEqual([{ to: 'b2', how: 'always' }]);
    expect(g.then.get('c')).toEqual([{ to: 'c2', how: 'always' }]);
  });

  it('an uneven merge comes after every branch into it, and the merge link is kept', () => {
    const w = one({
      name: 'x',
      entry_point: 'a',
      steps: [
        { id: 'a', parallel: true, next: [{ to: 'b' }, { to: 'c' }] },
        { id: 'b', next: [{ to: 'join' }] },
        { id: 'c', next: [{ to: 'd' }] },
        { id: 'd', next: [{ to: 'join' }] },
        { id: 'join' },
      ],
    });
    const g = graphOf(w);
    expect(ids(w)).toEqual([['a'], ['b', 'c'], ['d'], ['join']]);
    expect(g.then.get('b')).toEqual([{ to: 'join', how: 'always' }]);
    expect(g.then.get('d')).toEqual([{ to: 'join', how: 'always' }]);
    expect(g.back.size).toBe(0);
  });

  it('nested: a parallel fan-out inside a conditional branch keeps both labels', () => {
    const w = one({
      name: 'x',
      entry_point: 'a',
      steps: [
        { id: 'a', next: [{ to: 'fast', conditional: true }, { to: 'slow', conditional: true }] },
        { id: 'fast' },
        { id: 'slow', parallel: true, next: [{ to: 's1' }, { to: 's2' }] },
        { id: 's1' },
        { id: 's2' },
      ],
    });
    expect(ids(w)).toEqual([['a'], ['fast', 'slow'], ['s1', 's2']]);
    expect(graphOf(w).rows.map((r) => [r.kind, r.from])).toEqual([['single', undefined], ['after', 'a'], ['parallel', 'slow']]);
  });

  it('steps reached only by a question\'s answers are placed once the answer routes are read, never warned', () => {
    const w = one({
      name: 'x',
      entry_point: 'ask',
      steps: [{ id: 'ask', type: 'tool', detail: 'tool: ask_question_to_user' }, { id: 'yes' }, { id: 'no' }],
    });
    const before = graphOf(w);
    expect(ids(w)).toEqual([['ask']]);
    expect(before.unreachable).toEqual([]);
    expect(before.other.map((s) => s.id)).toEqual(['yes', 'no']);
    const answers = new Map([['ask', [{ title: 'Yes', to: ['yes'] }, { title: 'No', to: ['no'] }]]]);
    const after = graphOf(w, answers);
    expect(ids(w, answers)).toEqual([['ask'], ['yes', 'no']]);
    expect(after.rows[1]).toMatchObject({ kind: 'after', from: 'ask' });
    expect(after.then.get('ask')).toEqual([{ to: 'yes', how: 'answer' }, { to: 'no', how: 'answer' }]);
    expect(after.other).toEqual([]);
  });

  it('a way back never places a step; it is listed on the step that goes back', () => {
    const w = one({
      name: 'x',
      entry_point: 'write',
      steps: [
        { id: 'write', next: [{ to: 'check' }] },
        { id: 'check', next: [{ to: 'write', conditional: true, loop: true }, { to: 'done', conditional: true }] },
        { id: 'done' },
      ],
    });
    const g = graphOf(w);
    expect(ids(w)).toEqual([['write'], ['check'], ['done']]);
    expect(g.back.get('check')).toEqual(['write']);
    expect(g.back.has('write')).toBe(false);
    expect(g.then.get('check')).toEqual([{ to: 'done', how: 'if' }]);
  });

  it('both edges of a cycle carry the loop flag: the forward one still places its step, only the way back is listed', () => {
    const w = one({
      name: 'x',
      entry_point: 'plan',
      steps: [
        { id: 'plan', next: [{ to: 'draft' }] },
        { id: 'draft', next: [{ to: 'critique', loop: true }] },
        { id: 'critique', next: [{ to: 'draft', conditional: true, loop: true }, { to: 'ship', conditional: true }] },
        { id: 'ship' },
      ],
    });
    const g = graphOf(w);
    expect(ids(w)).toEqual([['plan'], ['draft'], ['critique'], ['ship']]);
    expect(g.unreachable).toEqual([]);
    expect(g.back.get('critique')).toEqual(['draft']);
    expect(g.back.has('draft')).toBe(false);
  });

  it('a step that goes back to itself lists itself; a cycle through a question\'s answer is a way back too', () => {
    const w = one({
      name: 'x',
      entry_point: 'poll',
      steps: [{ id: 'poll', next: [{ to: 'poll', conditional: true, loop: true }, { to: 'ask' }] }, { id: 'ask', type: 'tool' }],
    });
    const g = graphOf(w, new Map([['ask', [{ title: 'Again', to: ['poll'] }]]]));
    expect(ids(w)).toEqual([['poll'], ['ask']]);
    expect(g.back.get('poll')).toEqual(['poll']);
    expect(g.back.get('ask')).toEqual(['poll']);
  });

  it('only steps the agent marks unreachable are warned; others the view cannot place are listed without a warning', () => {
    const w = one({ name: 'x', entry_point: 'a', steps: [{ id: 'a' }, { id: 'orphan', unreachable: true }, { id: 'stray' }] });
    const g = graphOf(w);
    expect(ids(w)).toEqual([['a']]);
    expect(g.unreachable.map((s) => s.id)).toEqual(['orphan']);
    expect(g.other.map((s) => s.id)).toEqual(['stray']);
  });

  it('an entry the steps do not hold gives no rows', () => {
    const w = one({ name: 'x', entry_point: 'gone', steps: [{ id: 'a', unreachable: true }] });
    expect(graphOf(w).rows).toEqual([]);
    expect(graphOf(w).unreachable.map((s) => s.id)).toEqual(['a']);
  });

  it('an edge or answer to a step that is not listed is skipped; a repeated target is one link', () => {
    const w = one({ name: 'x', entry_point: 'a', steps: [{ id: 'a', next: [{ to: 'ghost' }, { to: 'b' }, { to: 'b', conditional: true }] }, { id: 'b' }] });
    const g = graphOf(w, new Map([['a', [{ title: 'x', to: ['ghost', 'b'] }]]]));
    expect(ids(w)).toEqual([['a'], ['b']]);
    expect(g.then.get('a')).toEqual([{ to: 'b', how: 'always' }]);
  });
});

describe('answerRoutes', () => {
  const def = {
    name: 'x',
    steps: {
      ask: { type: 'tool', tool: 'ask_question_to_user', options: [{ title: 'Yes', steps: [{ id: 'go' }, { id: 'stop' }] }, { title: 'No', steps: [{ id: 'halt' }, { id: 'go' }] }] },
      other: { type: 'tool', tool: 'github', options: [{ title: 'x', steps: [{ id: 'go' }] }] },
      go: { type: 'bash' },
    },
  };

  it('reads each answer of a question step with the steps it starts, without repeats or stop; other tools are not questions', () => {
    expect([...answerRoutes(JSON.stringify(def))]).toEqual([['ask', [{ title: 'Yes', to: ['go'] }, { title: 'No', to: ['halt', 'go'] }]]]);
  });

  it('an answer that starts nothing is left out; one that starts several keeps them together', () => {
    const d = { steps: { q: { type: 'tool', tool: 'ask_question_to_user', options: [{ title: 'Skip', steps: [{ id: 'stop' }] }, { title: 'Both', steps: [{ id: 'b' }, { id: 'c' }] }] } } };
    expect(answerRoutes(JSON.stringify(d)).get('q')).toEqual([{ title: 'Both', to: ['b', 'c'] }]);
  });

  it('a target with an execute_if is marked guarded; a target that is also reached plainly is not', () => {
    const d = { steps: { q: { type: 'tool', tool: 'ask_question_to_user', options: [
      { title: 'Both', steps: [{ id: 'b' }, { id: 'c', execute_if: 'false' }] },
      { title: 'Twice', steps: [{ id: 'c', execute_if: 'x' }, { id: 'c' }] },
      { title: 'Empty', steps: [{ id: 'd', execute_if: '' }] },
    ] } } };
    expect(answerRoutes(JSON.stringify(d)).get('q')).toEqual([
      { title: 'Both', to: ['b', 'c'], guarded: ['c'] },
      { title: 'Twice', to: ['c'] },
      { title: 'Empty', to: ['d'] },
    ]);
  });

  it('skips a revision line before the definition', () => {
    expect(answerRoutes('revision: abc\n' + JSON.stringify(def)).get('ask')).toEqual([{ title: 'Yes', to: ['go'] }, { title: 'No', to: ['halt', 'go'] }]);
  });

  it('unreadable output gives no routes', () => {
    for (const o of [undefined, 7, '', 'not json', 'revision: x', '[]']) expect(answerRoutes(o).size).toBe(0);
  });
});

describe('stepKind', () => {
  it('reads the kind from the type and the name from the base label', () => {
    const w = parseWorkflows(wfAnswer([SHIP_FIX]))[0]!;
    const by = (id: string) => stepKind(w.steps.find((s) => s.id === id)!);
    expect(by('reproduce')).toEqual({ kind: 'agent', name: 'explore' });
    expect(by('test')).toEqual({ kind: 'bash', name: '' });
    expect(by('open-pr')).toEqual({ kind: 'tool', name: 'github' });
  });

  it('a step without a label still has its kind', () => {
    expect(stepKind(one({ name: 'x', steps: [{ id: 'a', type: 'bash' }] }).steps[0]!)).toEqual({ kind: 'bash', name: '' });
  });
});

const PAUSED = { code: 'daemon_paused', status: 503 };
const ALL = [SHIP_FIX, REVIEW_PR, RELEASE_NOTES, PLAN_AND_BUILD];
const listOf = (items: readonly unknown[], o: Partial<ListRead> = {}): ListRead => ({
  data: parseWorkflows(wfAnswer(items), { hiddenCap: io.cap }),
  isPending: false,
  error: null,
  refetch: () => undefined,
  readAt: 0,
  ...o,
});

// The Workflows view under a memory router, as the AI tab mounts it; the reads are the mocks above.
async function mount(search = '', chatHref?: (sid: string, realm: string) => string) {
  const router = createRouter({ routeTree: createRootRoute({ component: () => <Workflows computer="atlas" chatHref={chatHref} /> }), history: createMemoryHistory({ initialEntries: ['/' + search] }) });
  await act(async () => {
    render(<CoreQueryProvider><RouterProvider router={router} /></CoreQueryProvider>);
    await router.load();
  });
  return { router };
}
const table = () => screen.getByRole('table', { name: strings['wf.title'] });
const rowOf = (name: string) => within(table()).getByRole('row', { name: new RegExp(name) });
const heading = (name: string) => screen.queryByRole('heading', { level: 2, name: new RegExp(name) });
/** The open detail's header (DetailHeader: name, tags, meta, actions). */
const header = (name: string) => heading(name)!.closest('header') as HTMLElement;
const steps = (count = 5) => screen.getByRole('list', { name: count === 1 ? '1 step' : `${count} steps` });
const item = (id: string) => document.querySelector(`[data-hub-item="${id}"]`) as HTMLElement;
const itemIds = (el: HTMLElement) => [...el.querySelectorAll('[data-hub-item]')].map((li) => li.getAttribute('data-hub-item'));
const markOf = (id: string) => item(id).querySelector('[data-hub-item-mark]')?.textContent ?? null;
/** A step's fact value by its label, or null. */
function fact(id: string, label: string): string | null {
  const dt = [...item(id).querySelectorAll('dt')].find((d) => d.textContent === label);
  return dt?.nextElementSibling?.textContent ?? null;
}

beforeEach(() => {
  io.cap = false;
  io.list = listOf(ALL);
  io.detail = () => ({ state: 'ready', answers: new Map() });
  io.keys = [];
  io.refreshed = 0;
  io.runs = { list: { runs: [], skipped: 0 }, isPending: false, error: null, refetch: () => {} };
  io.pins = { pinned: [], beyond: 0 };
});

describe('workflows: list and detail', () => {
  it('lists every workflow with where it comes from; nothing is open until one is picked', async () => {
    await mount();
    for (const n of ['ship-fix', 'review-pr', 'release-notes', 'plan-and-build']) expect(rowOf(n)).toBeTruthy();
    expect(within(rowOf('release-notes')).getByText('From the project')).toBeTruthy();
    expect(within(rowOf('plan-and-build')).getByText('Comes with the agent')).toBeTruthy();
    expect(within(rowOf('ship-fix')).getByText('5 steps')).toBeTruthy();
    expect(within(rowOf('review-pr')).getByText('1 step')).toBeTruthy();
    expect(heading('ship-fix')).toBeNull();
    expect(io.keys.every((k) => k === null) || io.keys.length === 0).toBe(true);
  });

  it('opening a row puts it in the URL and shows its detail: header, steps in run order with marks, parallel steps together', async () => {
    const user = userEvent.setup();
    const { router } = await mount();
    await user.click(within(rowOf('ship-fix')).getByText('ship-fix'));
    expect(router.state.location.search).toMatchObject({ sel: 'ship-fix' });
    const head = header('ship-fix');
    expect(within(head).getByText('Yours')).toBeTruthy();
    expect(head.textContent).toContain('Inputs: issue (required), branch (default: fix/<issue>)');
    expect(head.textContent).toContain(SHIP_FIX.summary);
    expect(io.keys.at(-1)).toEqual({ name: 'ship-fix', realm: '0123456789abcdef01234567' });
    expect(itemIds(steps())).toEqual(['reproduce', 'fix', 'test', 'review', 'open-pr']);
    expect(['reproduce', 'fix', 'test', 'review', 'open-pr'].map(markOf)).toEqual(['1', '2', '3a', '3b', '4']);
    // The kind badge in words, and the step's own line.
    expect(within(item('reproduce')).getByText('Agent: explore')).toBeTruthy();
    expect(within(item('test')).getByText('Command')).toBeTruthy();
    expect(within(item('open-pr')).getByText('Tool: github')).toBeTruthy();
    expect(within(item('reproduce')).getByText('Find the smallest failing case for {{issue}}')).toBeTruthy();
    expect(item('reproduce').textContent).toContain('Read-only');
    expect(within(item('test')).getByText('3a, 3b · run together')).toBeTruthy();
    // test and review both lead to open-pr, the one step of the next row: no Then fact needed.
    for (const id of ['reproduce', 'fix', 'test', 'review', 'open-pr']) expect(fact(id, 'Then')).toBeNull();
    expect(screen.getByText('30 min for the whole run')).toBeTruthy();
    expect(screen.getByText('Up to 2 steps at once')).toBeTruthy();
  });

  it('the origin says what it means: its tip names this origin', async () => {
    const user = userEvent.setup();
    await mount('?sel=plan-and-build');
    await user.click(within(header('plan-and-build')).getByRole('button', { name: /Comes with the agent/ }));
    expect(await screen.findByText(strings['wf.originTip.system'])).toBeTruthy();
    expect(screen.queryByText(strings['wf.originTip.yours'])).toBeNull();
  });

  it('the header holds Edit source and "..."; a shipped workflow never offers Delete', async () => {
    const user = userEvent.setup();
    await mount('?sel=plan-and-build');
    const head = header('plan-and-build');
    expect(within(head).getByRole('button', { name: 'Edit source' })).toBeTruthy();
    await user.click(within(head).getByRole('button', { name: 'More actions' }));
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
    expect(names.some((n) => n.startsWith('Hide from the list'))).toBe(true);
    expect(names.some((n) => n.startsWith('Delete'))).toBe(false);
    expect(names.some((n) => n.startsWith('Edit source'))).toBe(false);
  });

  it('with the workflow_hidden capability a hidden workflow says so in its row and header, and offers Show only', async () => {
    io.cap = true;
    io.list = listOf([{ ...PLAN_AND_BUILD, hidden: true }, SHIP_FIX]);
    const user = userEvent.setup();
    await mount('?sel=plan-and-build');
    expect(within(rowOf('plan-and-build')).getByText('Hidden')).toBeTruthy();
    expect(within(rowOf('ship-fix')).queryByText('Hidden')).toBeNull();
    const head = header('plan-and-build');
    expect(within(head).getByText('Hidden')).toBeTruthy();
    await user.click(within(head).getByRole('button', { name: 'More actions' }));
    const names = screen.getAllByRole('menuitem').map((m) => m.textContent ?? '');
    expect(names.some((n) => n.startsWith('Show in the list again'))).toBe(true);
    expect(names.some((n) => n.startsWith('Hide from the list'))).toBe(false);
  });

  it('without the capability nothing says Hidden, even a row the agent marks', async () => {
    io.list = listOf([{ ...PLAN_AND_BUILD, hidden: true }]);
    await mount('?sel=plan-and-build');
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('while the answer routes are read the steps section is loading: no steps, never an empty list', async () => {
    io.detail = () => ({ state: 'loading' }) as DetailRead;
    await mount('?sel=ship-fix');
    const sec = document.getElementById('wf-steps')!;
    expect(sec.getAttribute('data-hub-state')).toBe('loading');
    expect(sec.querySelectorAll('[data-hub-item]')).toHaveLength(0);
  });

  it('a deep link opens its workflow; a link\'s search applies once and leaves the URL, the open row stays', async () => {
    const { router } = await mount('?sel=plan-and-build&q=plan');
    expect(within(header('plan-and-build')).getByText('Comes with the agent')).toBeTruthy();
    expect(within(table()).queryByRole('row', { name: /ship-fix/ })).toBeNull();
    expect(screen.getByRole('searchbox')).toHaveValue('plan');
    await waitFor(() => expect(router.state.location.search).toEqual({ sel: 'plan-and-build' }));
  });

  it('search matches the summary as well as the name', async () => {
    await mount('?q=pull%20request');
    expect(rowOf('ship-fix')).toBeTruthy();
    expect(within(table()).queryByRole('row', { name: /review-pr/ })).toBeNull();
  });

  it('a merge that is not plain from the rows says Then on each step, with how', async () => {
    io.list = listOf([
      {
        name: 'merge',
        entry_point: 'a',
        steps: [
          { id: 'a', parallel: true, next: [{ to: 'b' }, { to: 'c' }] },
          { id: 'b', next: [{ to: 'join', conditional: true }] },
          { id: 'c', next: [{ to: 'd' }] },
          { id: 'd', next: [{ to: 'join' }] },
          { id: 'join' },
        ],
      },
    ]);
    await mount('?sel=merge');
    expect(fact('b', 'Then')).toBe('join (if its condition holds)');
    expect(fact('c', 'Then')).toBeNull();
    expect(fact('d', 'Then')).toBeNull();
  });

  it('a question\'s answer routes come from the definition read; when it fails, the steps still show under a band with Try again', async () => {
    io.list = listOf([{ name: 'ask', entry_point: 'q', steps: [{ id: 'q', type: 'tool', detail: 'tool: ask_question_to_user' }, { id: 'yes' }, { id: 'no' }] }]);
    const retry = vi.fn();
    io.detail = () => ({ state: 'failed', error: { code: 'unreachable', status: 502 }, retry, retrying: false });
    await mount('?sel=ask');
    const sec = document.getElementById('wf-steps')!;
    expect(within(sec).getByText(strings['wf.detailFailed'])).toBeTruthy();
    expect(itemIds(steps(3))).toEqual(['q']);
    expect(markOf('q')).toBe('1');
    await userEvent.setup().click(within(sec).getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(strings['wf.other.title'])).toBeTruthy();
    expect(itemIds(document.getElementById('wf-other')!)).toEqual(['yes', 'no']);
    expect(markOf('yes')).toBeNull();
    expect(screen.queryByText(strings['wf.unreachable.title'])).toBeNull();
  });

  it('a way back is a fact on the step that goes back', async () => {
    io.list = listOf([{ name: 'loop', entry_point: 'a', steps: [{ id: 'a', next: [{ to: 'b' }] }, { id: 'b', next: [{ to: 'a', loop: true }] }] }]);
    await mount('?sel=loop');
    expect(fact('b', 'Goes back to')).toBe('a');
    expect(fact('a', 'Goes back to')).toBeNull();
  });

  it('answers are listed with the steps each starts; their row names the question, never "one of these"', async () => {
    io.list = listOf([{ name: 'ask', entry_point: 'q', steps: [{ id: 'q', type: 'tool', detail: 'tool: ask_question_to_user' }, { id: 'b' }, { id: 'c' }] }]);
    io.detail = () => ({ state: 'ready', answers: new Map([['q', [{ title: 'Both', to: ['b', 'c'] }]]]) });
    await mount('?sel=ask');
    expect(itemIds(steps(3))).toEqual(['q', 'b', 'c']);
    expect(['b', 'c'].map(markOf)).toEqual(['2a', '2b']);
    expect(within(item('b')).getByText('After q')).toBeTruthy();
    expect(fact('q', 'By answer')).toBe('Both → b, c together');
    expect(screen.queryByText(strings['wf.other.title'])).toBeNull();
  });

  it('"together" names only the unguarded targets; a guarded one says it runs only if its condition holds', async () => {
    io.list = listOf([{ name: 'ask', entry_point: 'q', steps: [{ id: 'q', type: 'tool', detail: 'tool: ask_question_to_user' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }]);
    io.detail = () => ({ state: 'ready', answers: new Map([['q', [{ title: 'Both', to: ['b', 'c'], guarded: ['c'] }, { title: 'All', to: ['b', 'c', 'd'], guarded: ['d'] }, { title: 'Maybe', to: ['d'], guarded: ['d'] }]]]) });
    await mount('?sel=ask');
    expect(fact('q', 'By answer')).toBe('Both → b, c (if its condition holds) · All → b, c together, d (if its condition holds) · Maybe → d (if its condition holds)');
  });

  it('a parallel fan-out with a conditional link keeps the condition; a later fan-out names its own step', async () => {
    io.list = listOf([
      {
        name: 'mixed',
        entry_point: 'a',
        steps: [
          { id: 'a', parallel: true, next: [{ to: 'b' }, { to: 'c', conditional: true }] },
          { id: 'b', parallel: true, next: [{ to: 'd' }, { to: 'e' }] },
          { id: 'c' },
          { id: 'd' },
          { id: 'e' },
        ],
      },
    ]);
    await mount('?sel=mixed');
    expect(within(item('b')).getByText('2a, 2b · run together')).toBeTruthy();
    expect(fact('a', 'Then')).toBe('b, c (if its condition holds)');
    expect(within(item('d')).getByText('3a, 3b · run together')).toBeTruthy();
    expect(fact('b', 'Then')).toBeNull();
  });

  it('a row of steps led to from different steps claims nothing about how they run', async () => {
    io.list = listOf([
      {
        name: 'split',
        entry_point: 'a',
        steps: [
          { id: 'a', next: [{ to: 'b' }, { to: 'c' }] },
          { id: 'b', next: [{ to: 'd' }] },
          { id: 'c', next: [{ to: 'e' }] },
          { id: 'd' },
          { id: 'e' },
        ],
      },
    ]);
    await mount('?sel=split');
    expect(markOf('d')).toBe('3a');
    expect(markOf('e')).toBe('3b');
    for (const id of ['d', 'e']) {
      expect(within(item(id)).queryByText(/depending on the result|run together|^After |run order/)).toBeNull();
    }
    expect('wf.level' in strings).toBe(false);
    expect(strings['wf.stepsInfo']).not.toMatch(/decides|run order|same point/);
    expect(within(item('b')).getByText('After a')).toBeTruthy();
  });

  it('an open workflow the list no longer holds says so; it never shows another one', async () => {
    io.list = listOf([SHIP_FIX]);
    await mount('?sel=review-pr');
    expect(screen.getByText('This workflow is no longer on atlas.')).toBeTruthy();
    expect(heading('ship-fix')).toBeNull();
    expect(io.keys.filter((k) => k !== null)).toEqual([]);
  });

  it('the table\'s Refresh re-reads every key (list, open detail, pause state), not the list alone', async () => {
    await mount('?sel=ship-fix');
    await userEvent.setup().click(screen.getByRole('button', { name: /refresh/i }));
    expect(io.refreshed).toBe(1);
  });

  it('no workflows: the list says how they get there and how to make one, under the line that says what one is', async () => {
    io.list = listOf([]);
    await mount();
    expect(screen.getByText(strings['wf.empty.title'])).toBeTruthy();
    expect(screen.getByText(strings['wf.empty.body'])).toBeTruthy();
    expect(screen.getByText(strings['wf.desc'])).toBeTruthy();
  });

  it('under the title the page says what a workflow is and how one runs', async () => {
    await mount();
    expect(screen.getByText(strings['wf.desc'])).toBeTruthy();
    expect(rowOf('ship-fix')).toBeTruthy();
  });

  it('paused: the detail says so with Check again, never a failure or the steps', async () => {
    const recheck = vi.fn();
    io.detail = () => detailState({ error: { code: 'bad_request', status: 400 } }, { paused: true, recheck });
    await mount('?sel=ship-fix');
    expect(screen.getByText('Workflows cannot be read while agents on atlas are paused')).toBeTruthy();
    expect(screen.queryByRole('list', { name: '5 steps' })).toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: strings['wf.paused.check'] }));
    expect(recheck).toHaveBeenCalledTimes(1);
  });
});

describe('workflows: the detail read state', () => {
  const answers = new Map([['q', [{ title: 'Go', to: ['a'] }]]]);

  it('paused wins over an earlier answer: the pause read says so, or a typed daemon_paused refusal', () => {
    expect(detailState({ data: answers }, { paused: true }).state).toBe('paused');
    expect(detailState({ data: answers, error: PAUSED }).state).toBe('paused');
    expect(detailState({ data: answers }, { paused: false }).state).toBe('ready');
  });

  it('another refusal after an answer keeps the answer', () => {
    expect(detailState({ data: answers, error: { code: 'unreachable', status: 502 } })).toEqual({ state: 'ready', answers });
  });

  it('no answer and no refusal is loading; a refusal alone is failed, and Try again re-reads', () => {
    expect(detailState({}).state).toBe('loading');
    const refetch = vi.fn();
    const d = detailState({ error: new Error('x'), refetch });
    expect(d.state).toBe('failed');
    if (d.state === 'failed') d.retry();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

// ---- runs ----

const R_GLOBAL = 'global';
const runRow = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  run_id: 'run-1', workflow_name: 'review-pr', session_id: 'sess-aaaaaaaa1', started_at: new Date(Date.now() - 5 * 60_000).toISOString(), current_idx: 1, total_steps: 3,
  status: 'running', realm: R_GLOBAL, current_step: 'read', ...o,
});
// After every start time a test uses (a finish before the start is a contradiction the parser drops).
const finished = { finished_at: '2099-01-01T00:00:00Z' };
const runsOfRows = (rows: Record<string, unknown>[], o: Partial<RunsRead> = {}): RunsRead => ({
  list: parseRuns({ items: rows, meta: { total: rows.length } }), isPending: false, error: null, refetch: () => {}, ...o,
});
const chatHref = (sid: string, realm: string) => `/ai/c/${realm}/${sid}`;
const rt = (k: keyof typeof runStrings, v?: Record<string, string | number>) => {
  let out = runStrings[k] as string;
  for (const [a, b] of Object.entries(v ?? {})) out = out.replace(`{{${a}}}`, String(b));
  return out;
};

const NOTHING = /nothing here yet/i;
const bodyRows = (t: HTMLElement) => within(t).getAllByRole('row').slice(1);

describe('workflows: runs in the detail', () => {
  it('lists the open workflow\'s runs only, newest first: state, the step it is on, when, and a link to its chat', async () => {
    io.runs = runsOfRows([
      runRow({ run_id: 'a', workflow_name: 'review-pr', status: 'failed', ...finished, started_at: new Date(Date.now() - 3_600_000).toISOString(), current_step: 'post', session_id: 'sess-aaaaaaaa1' }),
      runRow({ run_id: 'b', workflow_name: 'review-pr', session_id: 'sess-bbbbbbbb2' }),
      runRow({ run_id: 'c', workflow_name: 'ship-fix', session_id: 'sess-cccccccc3' }),
    ]);
    await mount('?sel=review-pr', chatHref);
    const rows = bodyRows(screen.getByRole('table', { name: runStrings.head }));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(runStrings['st.running'])).toBeTruthy();
    expect(within(rows[0]!).getByText('read')).toBeTruthy();
    expect(within(rows[0]!).getByRole('link', { name: runStrings.chat }).getAttribute('href')).toBe('/ai/c/global/sess-bbbbbbbb2');
    expect(within(rows[1]!).getByText(runStrings['st.failed'])).toBeTruthy();
    expect(within(rows[1]!).getByText('post')).toBeTruthy();
    expect(within(rows[1]!).getByRole('link', { name: runStrings.chat }).getAttribute('href')).toBe('/ai/c/global/sess-aaaaaaaa1');
  });
  it('without a chat link the run names its chat', async () => {
    io.runs = runsOfRows([runRow()]);
    await mount('?sel=review-pr');
    expect(screen.getByText(rt('chat.none', { id: 'sess-aaa' }))).toBeTruthy();
    expect(screen.queryByRole('link', { name: runStrings.chat })).toBeNull();
  });
  it('the same workflow name in another realm is not this workflow\'s run: the detail lists its own realm only', async () => {
    const R = '0123456789abcdef01234567'; // SHIP_FIX is listed in this realm
    io.runs = runsOfRows([
      runRow({ run_id: 'mine', workflow_name: 'ship-fix', session_id: 'sess-mine', realm: R, realm_id: R }),
      runRow({ run_id: 'other', workflow_name: 'ship-fix', session_id: 'sess-other' }),
    ]);
    await mount('?sel=ship-fix', chatHref);
    const rows = bodyRows(screen.getByRole('table', { name: runStrings.head }));
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByRole('link', { name: runStrings.chat }).getAttribute('href')).toBe(`/ai/c/${R}/sess-mine`);
  });
  it('no runs of this workflow: the table says so', async () => {
    io.runs = runsOfRows([runRow({ workflow_name: 'ship-fix' })]);
    await mount('?sel=review-pr');
    expect(screen.getByText(NOTHING)).toBeTruthy();
  });
  it('past ten runs it lists ten and says how many there are', async () => {
    io.runs = runsOfRows(Array.from({ length: 12 }, (_, i) => runRow({ run_id: `r${i}`, session_id: `s${i}`, status: 'completed', ...finished, started_at: new Date(Date.now() - i * 1000 - 60_000).toISOString() })));
    await mount('?sel=review-pr');
    expect(bodyRows(screen.getByRole('table', { name: runStrings.head }))).toHaveLength(10);
    expect(screen.getByText(rt('newest', { n: 10, total: 12 }))).toBeTruthy();
  });
  it('rows the page could not read are counted, not hidden', async () => {
    io.runs = runsOfRows([runRow(), runRow({ run_id: 'x', status: 'paused' })]);
    await mount('?sel=review-pr');
    expect(screen.getByText(rt('skipped_one', { count: 1 }))).toBeTruthy();
  });
  it('a failed read says so and offers Try again; it never says there are no runs', async () => {
    const refetch = vi.fn();
    io.runs = { list: undefined, isPending: false, error: { code: 'server' } as never, refetch };
    await mount('?sel=review-pr');
    expect(screen.queryByText(NOTHING)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
  it('while the runs are being read it shows neither runs nor "no runs"', async () => {
    io.runs = { list: undefined, isPending: true, error: null, refetch: () => {} };
    await mount('?sel=review-pr');
    expect(screen.queryByText(NOTHING)).toBeNull();
    expect(screen.queryByText(runStrings['st.running'])).toBeNull();
  });
});

describe('workflows: All runs', () => {
  it('the switch shows Workflows | All runs; All runs puts view in the URL and lists every run', async () => {
    io.runs = runsOfRows([runRow(), runRow({ run_id: 'b', workflow_name: 'ship-fix', session_id: 'sess-b', status: 'completed', ...finished })]);
    const user = userEvent.setup();
    const { router } = await mount('', chatHref);
    await user.click(screen.getByRole('radio', { name: runStrings['view.runs'] }));
    expect(router.state.location.search).toMatchObject({ view: 'runs' });
    const t = screen.getByRole('table', { name: runStrings.title });
    expect(within(t).getAllByRole('row').length).toBe(3);
    expect(within(t).getByText(runStrings['st.running'])).toBeTruthy();
    expect(within(t).getByText(runStrings['st.completed'])).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: runStrings['view.list'] }));
    expect(router.state.location.search).not.toHaveProperty('view');
    expect(screen.getByRole('table', { name: strings['wf.title'] })).toBeTruthy();
  });
  it('a deep link opens All runs; a row opens its facts beside it under its own selection key', async () => {
    io.runs = runsOfRows([
      runRow({ run_id: 'b', status: 'failed', ...finished, error: 'step test failed', last_step: 'test', cwd: '/home/user/app', cost: 0.5, resumed_from: 'run-0000000009', realm: '0123456789abcdef01234567', realm_id: '0123456789abcdef01234567' }),
    ]);
    const user = userEvent.setup();
    const { router } = await mount('?view=runs', chatHref);
    await user.click(within(screen.getByRole('table', { name: runStrings.title })).getByText('review-pr'));
    expect(router.state.location.search).toMatchObject({ view: 'runs', runsel: 'b' });
    expect(router.state.location.search).not.toHaveProperty('sel'); // the workflows' own selection key stays free
    expect(within(screen.getByRole('table', { name: runStrings.title })).getByRole('link', { name: runStrings.chat }).getAttribute('href')).toBe('/ai/c/0123456789abcdef01234567/sess-aaaaaaaa1');
    expect(screen.getByText('step test failed')).toBeTruthy();
    expect(screen.getByText('/home/user/app')).toBeTruthy();
    expect(screen.getAllByText('$0.50')).toHaveLength(2); // the row's cell and the facts
    expect(screen.getByText(rt('d.resumedId', { id: 'run-0000' }))).toBeTruthy();
  });
  it('Esc closes the run\'s facts under the run\'s own key and leaves the workflow selection alone', async () => {
    io.runs = runsOfRows([runRow({ run_id: 'b' })]);
    const user = userEvent.setup();
    const { router } = await mount('?view=runs&runsel=b&sel=review-pr', chatHref);
    await user.click(within(screen.getByRole('table', { name: runStrings.title })).getByText('review-pr'));
    await user.keyboard('{Escape}');
    expect(router.state.location.search).not.toHaveProperty('runsel');
    expect(router.state.location.search).toMatchObject({ sel: 'review-pr' });
  });
  it('a selected run the next read no longer lists says so instead of showing another', async () => {
    io.runs = runsOfRows([runRow()]);
    await mount('?view=runs&runsel=gone');
    expect(screen.getByText(runStrings['d.notFound'])).toBeTruthy();
  });
  it('no runs: the table shows the kit\'s own empty state', async () => {
    await mount('?view=runs');
    expect(screen.getByText(NOTHING)).toBeTruthy();
  });
  it('says how many running chats it keeps open, and when it cannot keep more open', async () => {
    const running = Array.from({ length: 10 }, (_, i) => runRow({ run_id: `r${i}`, session_id: `s${i}` }));
    io.runs = runsOfRows(running);
    io.pins = { pinned: parseRuns({ items: running.slice(0, 8), meta: { total: 8 } }).runs, beyond: 2 };
    await mount('?view=runs');
    expect(screen.getByText(rt('kept_other', { count: 8 }))).toBeTruthy();
    expect(screen.getByText(rt('beyond_other', { count: 2 }))).toBeTruthy();
  });
  it('rows it could not read are counted', async () => {
    io.runs = runsOfRows([runRow(), 'junk' as never]);
    await mount('?view=runs');
    expect(screen.getByText(rt('skipped_one', { count: 1 }))).toBeTruthy();
  });
  it('the state filter narrows the table', async () => {
    io.runs = runsOfRows([runRow(), runRow({ run_id: 'b', workflow_name: 'ship-fix', session_id: 'sb', status: 'failed', ...finished })]);
    await mount('?view=runs&runstate=failed');
    const t = screen.getByRole('table', { name: runStrings.title });
    expect(within(t).getByText('ship-fix')).toBeTruthy();
    expect(within(t).queryByText('review-pr')).toBeNull();
  });
});
