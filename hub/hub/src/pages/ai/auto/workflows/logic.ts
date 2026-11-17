// Workflows: the list answer read into rows, the answer routes read from a
// workflow's definition, and its steps laid out as a graph. Pure: no React, no requests.
//
// The list answer carries each step's brief: its next_steps edges (conditional, loop) and the daemon's own facts
// "parallel" (the step fans out to branches that run at once) and "unreachable" (the entry walk, which also follows a
// question's answer routes, cannot reach it). A question step's answer routes are not in the brief; the definition
// (getWorkflow, read for the detail) has them.
//
// A row says whether the workflow is hidden only when the agent reports the
// workflow_hidden capability (`WF_HIDDEN_CAP`, a page constant, not one of core's CAPS); without it `hidden` is left
// out, so nothing claims a workflow is shown or hidden.

/** The agent capability under which the list's `hidden` is read. */
export const WF_HIDDEN_CAP = 'workflow_hidden';

/** One outgoing edge of a step, as the agent states it. */
export interface Edge {
  readonly to: string;
  /** Guarded by a condition (execute_if): the run may not take it. */
  readonly conditional: boolean;
  /** Part of a cycle: its target can reach this step again (the agent flags every edge of a cycle). */
  readonly loop: boolean;
}

export interface Step {
  readonly id: string;
  /** agent | tool | bash | workflow | foreach (another value is kept as said). */
  readonly type: string;
  /** The agent's base label: "agent: explore", "tool: github", "bash", "workflow: x", "foreach: x". */
  readonly detail: string;
  /** The author's one line about the step. */
  readonly explanation: string;
  readonly readOnly: boolean;
  /** The agent's fact: the entry walk cannot reach this step (an authoring mistake). */
  readonly unreachable: boolean;
  /** The agent's fact: this step fans out to branches that run at once. */
  readonly parallel: boolean;
  readonly next: readonly Edge[];
}

export interface Param {
  readonly name: string;
  readonly required: boolean;
  readonly default: string | null;
}

export type Origin = 'yours' | 'project' | 'system' | 'customized';

export interface Workflow {
  readonly name: string;
  readonly summary: string;
  readonly origin: Origin;
  /** The realm the agent listed it in ('global' or a 24-hex id); null when not said. */
  readonly realm: string | null;
  readonly entry: string;
  readonly stepCount: number;
  readonly steps: readonly Step[];
  readonly params: readonly Param[];
  readonly timeoutSec: number | null;
  readonly maxConcurrency: number | null;
  /** Hidden from the agent's own list; present only when the agent reports `WF_HIDDEN_CAP`. */
  readonly hidden?: boolean;
}

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const text = (x: unknown): string => (typeof x === 'string' ? x : '');
const count = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : null);
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const REALM = /^(global|[0-9a-f]{24})$/;

/** A shipped workflow with a customized copy reads "customized"; else shipped "system", the project's file
 *  "project", the rest the person's own. */
export function originOf(w: Record<string, unknown>): Origin {
  if (w.system === true) return w.customized === true ? 'customized' : 'system';
  return w.project === true ? 'project' : 'yours';
}

function stepOf(x: unknown): Step | null {
  const s = rec(x);
  const id = text(s.id);
  if (!id) return null;
  const next: Edge[] = [];
  for (const e of list(s.next)) {
    const r = rec(e);
    const to = text(r.to);
    if (to && to !== 'stop') next.push({ to, conditional: r.conditional === true, loop: r.loop === true });
  }
  return {
    id,
    type: text(s.type),
    detail: text(s.detail),
    explanation: text(s.explanation),
    readOnly: s.read_only === true,
    unreachable: s.unreachable === true,
    parallel: s.parallel === true,
    next,
  };
}

/** The list answer ({items: [...]}) as workflows, in the agent's order. A row without a name, or one whose name
 *  an earlier row already used, is dropped (the name is the row's identity). `hiddenCap`: the agent reports
 *  `WF_HIDDEN_CAP`, so each row's `hidden` is read (only a literal true is hidden); otherwise no row carries it. */
export function parseWorkflows(answer: unknown, o: { hiddenCap?: boolean } = {}): Workflow[] {
  const out: Workflow[] = [];
  const seen = new Set<string>();
  for (const it of list(rec(answer).items)) {
    const w = rec(it);
    const name = text(w.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const steps = list(w.steps).map(stepOf).filter((s): s is Step => s !== null);
    const params = list(w.params).flatMap((p): Param[] => {
      const r = rec(p);
      const n = text(r.name);
      return n ? [{ name: n, required: r.required === true, default: typeof r.default === 'string' && r.default !== '' ? r.default : null }] : [];
    });
    const realm = text(w.realm);
    out.push({
      name,
      summary: text(w.summary),
      origin: originOf(w),
      realm: REALM.test(realm) ? realm : null,
      entry: text(w.entry_point) || steps[0]?.id || '',
      stepCount: count(w.step_count) ?? steps.length,
      steps,
      params,
      timeoutSec: count(w.timeout_sec),
      maxConcurrency: count(w.max_concurrency),
      ...(o.hiddenCap ? { hidden: w.hidden === true } : {}),
    });
  }
  return out;
}

/** One answer of a question step and the steps it starts (one answer may start several, which then run). */
export interface AnswerRoute {
  readonly title: string;
  readonly to: readonly string[];
  /** The targets in `to` that the answer starts only when their `execute_if` holds; absent when none. */
  readonly guarded?: readonly string[];
}

/** The answer routes of a definition (getWorkflow's `output`: the definition as JSON, maybe after a `revision:`
 *  line): per question step (a tool step running ask_question_to_user), each answer with the steps it starts, in
 *  authored order, without repeats or the "stop" marker; an answer that starts nothing is left out. Unreadable
 *  output gives none. */
export function answerRoutes(output: unknown): Map<string, AnswerRoute[]> {
  const routes = new Map<string, AnswerRoute[]>();
  if (typeof output !== 'string') return routes;
  const body = output.startsWith('revision:') ? output.slice(output.indexOf('\n') + 1) : output;
  let def: unknown;
  try {
    def = JSON.parse(body);
  } catch {
    return routes;
  }
  for (const [id, raw] of Object.entries(rec(rec(def).steps))) {
    const s = rec(raw);
    if (s.type !== 'tool' || s.tool !== 'ask_question_to_user') continue;
    const answers: AnswerRoute[] = [];
    for (const o of list(s.options)) {
      const to: string[] = [];
      // A target is guarded only when every ref to it carries an execute_if: a plain ref starts it whatever the condition.
      const plain = new Set<string>();
      for (const r of list(rec(o).steps)) {
        const t = text(rec(r).id);
        if (!t || t === 'stop') continue;
        if (!to.includes(t)) to.push(t);
        if (!text(rec(r).execute_if)) plain.add(t);
      }
      const guarded = to.filter((t) => !plain.has(t));
      if (to.length) answers.push(guarded.length ? { title: text(rec(o).title), to, guarded } : { title: text(rec(o).title), to });
    }
    if (answers.length) routes.set(id, answers);
  }
  return routes;
}

/** How a step leads on to another: always, when a condition holds, or by the answer a person picks. */
export type How = 'always' | 'if' | 'answer';

export interface Link {
  readonly to: string;
  readonly how: How;
}

/** One row of the graph. Several steps share a row when they sit at the same depth. When the row is exactly one
 *  step's fan-out it names that step (`from`): 'parallel' when the agent says the step starts them at once, else
 *  'after' (no claim about which run: conditions and answers may start one, several or all). Otherwise 'single'
 *  (one step) or 'level' (a layout grouping only: depth is the longest forward route, so a run can reach these steps at
 *  different points; nothing is claimed about how they run). */
export interface GraphRow {
  readonly steps: readonly Step[];
  readonly kind: 'single' | 'parallel' | 'after' | 'level';
  /** The step whose fan-out this row is (kind parallel or after). */
  readonly from?: string;
}

export interface Graph {
  readonly rows: readonly GraphRow[];
  /** Per step, where it leads on to (forward links, every one, merges included), in authored order. */
  readonly then: ReadonlyMap<string, readonly Link[]>;
  /** Per step, the earlier steps it goes back to (a retry or a review round). */
  readonly back: ReadonlyMap<string, readonly string[]>;
  /** Steps the agent marks unreachable: an authoring mistake, after the rows. */
  readonly unreachable: readonly Step[];
  /** Steps the agent says the run can reach but whose route this view does not have (a question's answers before
   *  the definition is read): after the rows, without a warning. */
  readonly other: readonly Step[];
}

/** The steps laid out in run order. Links are next_steps edges plus, when given, answer routes. A link back to a step
 *  on the current walk from the entry is a way back (listed, never placing); the rest form a graph without cycles,
 *  and each step sits one row below the deepest step that leads to it, so a merge comes after every branch into
 *  it. */
export function graphOf(w: Workflow, answers?: ReadonlyMap<string, readonly AnswerRoute[]>): Graph {
  const byId = new Map(w.steps.map((s) => [s.id, s]));
  const order = new Map(w.steps.map((s, i) => [s.id, i]));
  const links = new Map<string, Link[]>();
  for (const s of w.steps) {
    const ls: Link[] = [];
    for (const e of s.next) if (byId.has(e.to) && !ls.some((l) => l.to === e.to)) ls.push({ to: e.to, how: e.conditional ? 'if' : 'always' });
    for (const a of answers?.get(s.id) ?? []) for (const to of a.to) if (byId.has(to) && !ls.some((l) => l.to === to)) ls.push({ to, how: 'answer' });
    links.set(s.id, ls);
  }
  // Depth-first from the entry (iterative): a link to a step still on the walk is a way back.
  const entry = byId.get(w.entry);
  const reached = new Set<string>();
  const back = new Map<string, string[]>();
  const forward = new Map<string, Link[]>();
  if (entry) {
    const onPath = new Set<string>();
    const stack: { id: string; i: number }[] = [{ id: entry.id, i: 0 }];
    reached.add(entry.id);
    onPath.add(entry.id);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const ls = links.get(top.id)!;
      if (top.i >= ls.length) {
        onPath.delete(top.id);
        stack.pop();
        continue;
      }
      const l = ls[top.i++]!;
      if (onPath.has(l.to)) {
        back.set(top.id, [...(back.get(top.id) ?? []), l.to]);
        continue;
      }
      forward.set(top.id, [...(forward.get(top.id) ?? []), l]);
      if (!reached.has(l.to)) {
        reached.add(l.to);
        onPath.add(l.to);
        stack.push({ id: l.to, i: 0 });
      }
    }
  }
  // Longest path from the entry over forward links (they form no cycle): each step's depth is one more than the
  // deepest step leading to it.
  const depth = new Map<string, number>();
  const into = new Map<string, number>();
  for (const id of reached) into.set(id, 0);
  for (const ls of forward.values()) for (const l of ls) into.set(l.to, (into.get(l.to) ?? 0) + 1);
  const ready = [...reached].filter((id) => into.get(id) === 0);
  for (const id of ready) depth.set(id, 0);
  while (ready.length) {
    const id = ready.shift()!;
    for (const l of forward.get(id) ?? []) {
      depth.set(l.to, Math.max(depth.get(l.to) ?? 0, depth.get(id)! + 1));
      const left = into.get(l.to)! - 1;
      into.set(l.to, left);
      if (left === 0) ready.push(l.to);
    }
  }
  const levels: Step[][] = [];
  for (const id of reached) (levels[depth.get(id) ?? 0] ??= []).push(byId.get(id)!);
  const rows: GraphRow[] = levels
    .filter((l) => l.length)
    .map((steps) => {
      steps.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      if (steps.length === 1) return { steps, kind: 'single' as const };
      const ids = new Set(steps.map((s) => s.id));
      const owner = w.steps.find((p) => {
        const f = forward.get(p.id) ?? [];
        return f.length === ids.size && f.every((l) => ids.has(l.to));
      });
      if (!owner) return { steps, kind: 'level' as const };
      return { steps, kind: owner.parallel ? ('parallel' as const) : ('after' as const), from: owner.id };
    });
  const unreachable = w.steps.filter((s) => !reached.has(s.id) && s.unreachable);
  const other = w.steps.filter((s) => !reached.has(s.id) && !s.unreachable);
  return { rows, then: forward, back, unreachable, other };
}

export type StepKind = 'bash' | 'agent' | 'fork' | 'tool' | 'workflow' | 'foreach';
const KINDS: ReadonlySet<string> = new Set(['bash', 'agent', 'tool', 'workflow', 'foreach']);

/** What a step is, for its kind badge: the kind from its type (an agent step the agent labels "fork:" is an agent
 *  copy) and the name its base label gives ("agent: reviewer" → reviewer). A type the Hub does not know has no kind
 *  and is named as the agent said it. */
export function stepKind(s: Step): { kind: StepKind | null; name: string } {
  const m = /^(agent|tool|workflow|foreach|fork):\s*(.*)$/.exec(s.detail);
  const name = m ? m[2]!.trim() : '';
  if (m?.[1] === 'fork') return { kind: 'fork', name };
  if (KINDS.has(s.type)) return { kind: s.type as StepKind, name };
  return { kind: null, name: s.type };
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
/** The longest order mark (ItemList takes at most 4 characters). */
const MARK_MAX = 4;

/** Each placed step's order mark: its row's number in run order, and for a row of several steps a letter after it
 *  ("3a", "3b"). A mark that would need more than one letter or run past 4 characters is left out, so that step
 *  has none; steps the rows do not place (not reached, or reached by a route not shown) have none. */
export function stepMarks(g: Graph): Map<string, string> {
  const marks = new Map<string, string>();
  g.rows.forEach((row, i) => {
    const n = String(i + 1);
    if (row.steps.length === 1) {
      if (n.length <= MARK_MAX) marks.set(row.steps[0]!.id, n);
      return;
    }
    row.steps.forEach((step, j) => {
      const mark = j < LETTERS.length ? n + LETTERS[j] : '';
      if (mark && mark.length <= MARK_MAX) marks.set(step.id, mark);
    });
  });
  return marks;
}
