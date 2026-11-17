// Fake agent answers for the AI tab's screens, for hub:dev, the shots and the specs: the Automations
// lists (workflows, loops with their changes (each answered ok, a new loop made), TODOs with
// their actions, each answered ok; `many` adds rows past one page of 50), Agents (read only, with the tool
// catalogue its tools editor reads) and Rules & safety (one pause per computer that a PUT changes, and a one-page
// stop). Names from the fixture world (atlas, Ada).
import { agent, answers, reply, versionRoute, type FixtureRequest, type FixtureRule } from '@core';
import { loopRoutes } from './auto/loops/data';
import { editRoutes } from './auto/loops/edit';
import { routes } from './routes';
import { actionRoutes } from './auto/todos/actions';
import { todoRoutes } from './auto/todos/data';
import { workflowRoutes } from './auto/workflows/data';
import { WF_HIDDEN_CAP } from './auto/workflows/logic';
import { actionRoutes as runActionRoutes } from './auto/workflows/runActions';
import { runRoutes } from './auto/workflows/runsData';
import { toolsRoutes } from './agents/toolsApi';
import { TOOL_CATALOGUE } from './agents/toolsFixtures';

/** The last path segment: the id of a by-id read. */
const lastPart = (r: FixtureRequest) => decodeURIComponent(r.path.split('/').pop() ?? '');
/** The fixture world's own words (data the agent would send, never Hub copy). */
const WORDS = {
  checkout: 'Fix the checkout total rounding',
  release: 'Decide the release date',
  orders: 'Migrate the orders table',
  changelog: 'Write the changelog',
  banner: 'Update the holiday banner',
  refund: 'Answer the refund email',
  notes: 'Notes from Ada.',
  started: 'Started.',
  general: 'The everyday working agent',
  reviewer: 'Reviews a change before it ships',
  shop: 'Answers shop questions',
};
const pad = (i: number) => String(i).padStart(2, '0');
const AGO = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

// ── Loops ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const loop = (o: Record<string, unknown>): Record<string, unknown> => ({
  interval_ms: 1_800_000, max_runs: 50, run_count: 7, paused: false, state: 'running', realm: 'global', spent_usd: 0.04,
  created_at: AGO(600), last_run_at: AGO(12), next_in_ms: 1_080_000, ...o,
});

/** The default world: one loop of each group (active, paused, over). */
export function loopSeed(many = false) {
  const base = [
    loop({ id: 'loop_ci', session_id: 'sess_ci', prompt: 'Check CI on main and fix a red build' }),
    loop({ id: 'loop_deps', session_id: 'sess_deps', prompt: 'Look for dependency updates', paused: true, state: 'paused', run_count: 3 }),
    loop({ id: 'loop_docs', session_id: 'sess_docs', prompt: 'Proofread the docs', state: 'ended', stop_reason: 'max_runs', run_count: 50 }),
  ];
  if (!many) return base;
  return [...base, ...Array.from({ length: 57 }, (_, i) => loop({ id: `loop_${pad(i + 1)}`, session_id: `sess_${pad(i + 1)}`, prompt: `Report on the shop build ${pad(i + 1)}` }))];
}

const CHATS: Record<string, string> = { sess_ci: 'Keep main green', sess_deps: 'Dependency updates', sess_docs: 'Docs pass' };

/** `fail`: the loops listing answers a server error (the list's error view). */
export function loopRules(o: { many?: boolean; fail?: boolean } = {}): FixtureRule[] {
  return [
    reply(loopRoutes.loops, () => (o.fail ? answers.refused(503, 'server_error') : answers.ok({ items: loopSeed(o.many) }))),
    // Only the loops' own chats (`sess_…`): the AI pane's chats (`s-…`, fixtures.chats.ts) answer with their whole row, model included.
    reply(agent.agentRoutes.session, (r) => {
      const id = lastPart(r);
      return answers.ok({ session: { id, name: CHATS[id] ?? '', first_message: `Loop chat ${id}` } });
    }, { when: (r) => lastPart(r).startsWith('sess_') }),
    // A chat's own loops, and every change answered ok (the list does not move: a reply is the proof).
    reply(agent.sessionRoutes.loops, (r) => {
      // The kit list envelope, whole (limit 0): the change store refuses a listing whose meta.total disagrees.
      const items = loopSeed(o.many).filter((l) => l.session_id === r.path.split('/').at(-2));
      return answers.ok({ items, meta: { total: items.length } });
    }),
    reply(editRoutes.update, answers.ok({ status: 'ok' })),
    reply(editRoutes.runNow, answers.ok({ status: 'ok' })),
    reply(editRoutes.remove, answers.ok({ status: 'ok' })),
    reply(editRoutes.create, (r) => answers.ok({ status: 'ok', loop: loop({ id: 'loop_new', session_id: r.path.split('/').at(-2), prompt: String((r.body as { prompt?: unknown } | null)?.prompt ?? ''), created_at: new Date().toISOString() }) })),
  ];
}

// ── TODOs ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

const todo = (o: Record<string, unknown>): Record<string, unknown> => ({ state: 'ready', priority: 2, realm: 'global', tags: [], comment_count: 0, updated_at: AGO(30), ...o });

/** The first TODO's proposed runs: [id, agent]. */
const PROPOSALS: ReadonlyArray<readonly [string, string]> = [['prop_1', 'implementer'], ['prop_2', 'reviewer']];

export function todoSeed(many = false) {
  const base = [
    // Its two proposed runs (PROPOSALS, in its thread) wait for a person: the list row's count puts it on Waiting for you.
    // todoRules recounts it from the decisions made, as the agent does (it omits the count when none waits).
    todo({ id: 'todo_1', num: 1, title: WORDS.checkout, priority: 1, tags: ['shop'], pending_proposals: PROPOSALS.length }),
    todo({ id: 'todo_2', num: 2, title: WORDS.release, needs_human: true, question_for_human: 'Ship on Friday or Monday?' }),
    todo({ id: 'todo_3', num: 3, title: WORDS.orders, state: 'in_progress', lease: { holder: 'worker' } }),
    todo({ id: 'todo_4', num: 4, title: WORDS.changelog, state: 'done', closed_at: AGO(90) }),
    todo({ id: 'todo_5', num: 5, title: WORDS.banner, priority: 3 }),
    todo({ id: 'todo_6', num: 6, title: WORDS.refund, priority: 2, tags: ['support'] }),
  ];
  if (!many) return base;
  return [...base, ...Array.from({ length: 56 }, (_, i) => todo({ id: `todo_x${pad(i + 1)}`, num: 10 + i, title: `Tidy the shop page ${pad(i + 1)}`, priority: 3 }))];
}

export function todoRules(o: { many?: boolean } = {}): FixtureRule[] {
  // The held TODO's run, and its run_end once Cancel run is answered (cancel's outcome is that entry); each
  // proposal reads as it was decided (a decided proposal is no longer offered).
  let cancelled = false;
  const decided: Record<string, string> = {};
  // The list row and the thread count from the same decisions: approving or denying one shows 1, then 0 (the row
  // leaves Waiting for you).
  const seed = () => todoSeed(o.many).map((t) => (t.id === 'todo_1' ? { ...t, pending_proposals: PROPOSALS.filter(([pid]) => !decided[pid]).length } : t));
  const decide = (status: string) => (r: FixtureRequest) => ((decided[decodeURIComponent(r.path.split('/').slice(-2)[0] ?? '')] = status), answers.ok({ status: 'ok' }));
  return [
    reply(todoRoutes.revision, () => answers.ok({ revision: 7 })),
    reply(todoRoutes.list, () => answers.ok({ items: seed(), revision: 7 })),
    reply(todoRoutes.todo, (r) => {
      const id = lastPart(r);
      const t = seed().find((x) => x.id === id);
      if (!t) return answers.refused(404, 'not_found');
      // The first TODO has two runs waiting for approval.
      const prop = (pid: string, agent: string) => ({ id: pid, action: 'run_worker', agent, prompt: WORDS.checkout, status: decided[pid] ?? 'pending', todo_revision: 0, created_at: AGO(20), expires_at: AGO(-600) });
      const proposals = id === 'todo_1' ? PROPOSALS.map(([pid, who]) => prop(pid, who)) : undefined;
      const timeline: Array<Record<string, unknown>> = [{ id: 'e1', ts: AGO(30), kind: 'comment', actor: { kind: 'human' }, body: WORDS.started }];
      let lease = t.lease;
      if (id === 'todo_3') {
        timeline.push({ id: 'e2', ts: AGO(10), kind: 'run_start', actor: { kind: 'worker' }, meta: { session: 'sess_w3' } });
        // As the agent writes it today: the release's run_end names no session, so the Hub cannot
        // tell it is this run's and the cancel stays unsure until the agent's run_end names its session.
        if (cancelled) timeline.push({ id: 'e3', ts: AGO(0), kind: 'run_end', actor: { kind: 'human' }, meta: { outcome: 'cancelled' } });
        lease = cancelled ? undefined : { daemon_id: 'd1', session_id: 'sess_w3', acquired_at: AGO(10), expires_at: AGO(-2) };
      }
      // As the agent answers getTodo (status ok and the record): the actions read no evidence from an
      // answer without it (actions.ts seenOf).
      return answers.ok({ status: 'ok', todo: { ...t, lease, body: WORDS.notes, proposals, timeline } });
    }),
    // Every action answered ok; Run and Approve by their reply, Cancel run by the run_end it writes.
    reply(actionRoutes.run, answers.ok({ job_id: 'job_fx', session_id: 'sess_worker' })),
    reply(actionRoutes.cancelRun, () => ((cancelled = true), answers.ok({ status: 'ok' }))),
    reply(actionRoutes.approve, decide('approved')),
    reply(actionRoutes.deny, decide('denied')),
  ];
}

// ── Workflows ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const wf = (name: string, summary: string, o: Record<string, unknown> = {}): Record<string, unknown> => ({
  name, summary, entry_point: 'plan', step_count: 2,
  steps: [{ id: 'plan', type: 'agent', next: [{ to: 'check' }] }, { id: 'check', type: 'bash', next: [] }],
  ...o,
});

export function workflowSeed(many = false) {
  const base = [
    wf('release', 'Cut a release of the shop'),
    wf('review-pr', 'Review a pull request', { project: true }),
    wf('fix-ci', 'Find and fix a red build', { system: true }),
    wf('triage', 'Sort new issues', { system: true, customized: true }),
  ];
  if (!many) return base;
  return [...base, ...Array.from({ length: 56 }, (_, i) => wf(`report-${pad(i + 1)}`, `Weekly report ${pad(i + 1)}`))];
}

/** `hiddenCap`: the agent reports workflow_hidden (its version answer carries only that capability, so a
 *  world that needs others does not take it) and fix-ci is hidden from its list. Off by default: today's agent. */
export function workflowRules(o: { many?: boolean; hiddenCap?: boolean } = {}): FixtureRule[] {
  const seed = () => workflowSeed(o.many).map((w) => (o.hiddenCap && w.name === 'fix-ci' ? { ...w, hidden: true } : w));
  return [
    ...(o.hiddenCap ? [reply(versionRoute, answers.ok({ capabilities: [{ name: WF_HIDDEN_CAP, supported: true, available: true }] }))] : []),
    reply(workflowRoutes.list, () => answers.ok({ items: seed() })),
    reply(workflowRoutes.get, (r) => {
      const name = lastPart(r);
      return seed().some((w) => w.name === name) ? answers.ok({ output: { name } }) : answers.refused(404, 'not_found');
    }),
  ];
}

// ── Workflow runs: the agent's snapshot, oldest first; the chats are the chat list's own sessions ───────────

export function runSeed(): Record<string, unknown>[] {
  const base = { current_idx: 1, total_steps: 2, realm: 'global' };
  return [
    { ...base, run_id: 'run-fix', workflow_name: 'fix-ci', session_id: 's-old', started_at: AGO(300), finished_at: AGO(296), status: 'failed', current_step: 'check', last_step: 'check', error: 'check exited with status 1', cost: 0.18 },
    { ...base, run_id: 'run-review', workflow_name: 'review-pr', session_id: 's-claude', started_at: AGO(90), finished_at: AGO(85), status: 'completed', current_step: 'check', cost: 0.04 },
    { ...base, run_id: 'run-release', workflow_name: 'release', session_id: 's-today', started_at: AGO(12), status: 'running', current_step: 'plan', cwd: '/home/ada/projects/shop' },
  ];
}

/** A run's steps (getWorkflowRun): the seed's own rows, the steps they finished. */
const RUN_STEPS: Record<string, Record<string, unknown>[]> = {
  'run-fix': [
    { step_id: 'plan', success: true, duration_ms: 41_000, input_tokens: 5120, output_tokens: 830 },
    { step_id: 'check', success: false, duration_ms: 2_300, error: 'check exited with status 1' },
  ],
  'run-review': [{ step_id: 'plan', success: true, duration_ms: 20_000, input_tokens: 2048, output_tokens: 310 }, { step_id: 'check', success: true, duration_ms: 900 }],
  'run-release': [],
};

export function runRules(): FixtureRule[] {
  return [
    reply(runRoutes.list, () => answers.ok({ items: runSeed(), meta: { total: runSeed().length } })),
    reply(runActionRoutes.get, (r) => {
      const id = lastPart(r);
      const row = runSeed().find((x) => x.run_id === id);
      return row ? answers.ok({ run: { ...row, steps: RUN_STEPS[id] ?? [] } }) : answers.refused(404, 'not_found');
    }),
  ];
}

// ── Agents ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export const agentSeed = () => [
  { name: 'general', labels: ['core'], provenance: 'shipped default (embedded)', description: WORDS.general, tools: ['read_file', 'bash', 'grep', 'skill'], is_configured_default: true },
  { name: 'bot', labels: ['core'], provenance: 'product-owned (read-only)', strict_tools: true, model: 'hoody-ai/hoody-free' },
  { name: 'reviewer', labels: ['coding'], provenance: 'user (shipped default)', description: WORDS.reviewer, skills: [] },
  { name: 'shop-support', labels: ['core'], provenance: 'user', description: WORDS.shop, tools: [] },
];

/** The agents list, and the agent's tool catalogue (GET /tools) the agent page's tools editor groups. */
export function agentRules(): FixtureRule[] {
  return [
    reply(routes.agents, () => answers.ok({ items: agentSeed() })),
    reply(toolsRoutes.catalogue, () => answers.ok({ items: TOOL_CATALOGUE, meta: { total: TOOL_CATALOGUE.length } })),
  ];
}

// ── Pause and stop ────────────────────────────────────────────────────────────────────────────────────────────────────

/** `refuse`: every PUT /pause is refused (409 pause_busy), from a running (`'pause'`) or a paused (`'resume'`) start. */
export function safetyRules(o: { refuse?: 'pause' | 'resume' | 'read' } = {}): FixtureRule[] {
  // One pause per computer: the pause is process-wide.
  const pauses = new Map<string, { paused: boolean; since_ms: number; gen: number }>();
  const of = (r: FixtureRequest) => {
    const id = r.target?.container.id ?? '';
    if (!pauses.has(id)) pauses.set(id, o.refuse === 'resume' ? { paused: true, since_ms: 1_700_000_000_000, gen: 1 } : { paused: false, since_ms: 0, gen: 1 });
    return pauses.get(id)!;
  };
  return [
    // 'read': the pause read fails, so the state is unknown ("Pause state unknown", Try again).
    reply(agent.pauseRoutes.get, (r) => (o.refuse === 'read' ? answers.refused(503, 'unavailable') : answers.ok({ ...of(r) }))),
    reply(agent.pauseRoutes.set, (r) => {
      const p = of(r);
      if (o.refuse === 'pause' || o.refuse === 'resume') return answers.refused(409, 'pause_busy');
      const want = (r.body as { paused?: unknown } | null)?.paused === true;
      if (p.paused !== want) Object.assign(p, { paused: want, since_ms: want ? Date.now() : 0, gen: p.gen + 1 });
      return answers.ok({ ...p });
    }),
    reply(agent.stopRoutes.stop, () =>
      answers.ok({
        items: [{ kind: 'turn', id: 'sess_ci', outcome: 'stopped' }, { kind: 'loop', id: 'loop_ci', outcome: 'stopped' }],
        started_during_call: [], behind_cursor: [], complete: true, not_covered: [],
      }),
    ),
  ];
}
