// Starting a workflow run, on the computer's agent in the realm the workflow was listed in.
//   - runWorkflow (POST /workflows/{name}/runs) opens a new chat and starts the run in it: it spends. The agent answers
//     202 {job_id, session_id, run_id: null, turn_id}; the run's id is learned later from the run listing.
//   - The agent does not deduplicate a start: it refuses an Idempotency-Key. So a start is sent ONCE, and a start whose
//     answer was lost (no answer, a server error, 503 admission_unconfirmed, a 202 without a chat id) is never sent
//     again by this page: the store goes to `unsure`, where Start sends nothing. Check again only reads the run listing
//     and offers the runs of this workflow in this realm started since the send (less RUN_SKEW_MS for clock skew) as
//     "may be yours"; the store never claims one, the person may pick one (`picked`) or Stop tracking (forget).
//   - A refusal (spend_cap named apart, workflow_not_found, turn_in_flight, bad_request) started nothing. A call core
//     never sent (not_sent, stale) started nothing either, so a new start may be sent.
//   - Every call is sent in the context the drawer passes (`ctx`): a capture of the computer, account and realms the start
//     belongs to, or null when the page no longer shows them; null sends and reads nothing. When the page shows
//     another one, nothing is sent or read, so a start, its outcome and its look-alikes always concern one computer.
//   - The body is {inputs, prompt?}: declared params only (an empty optional one is left out so the agent uses its
//     default), the prompt only when it holds more than spaces. No headless, model or session fields.
import { api, defineRoute, type CallInput, type Ctx, type Route } from '@core';
import type { Param } from './logic';
import { refusalOf, type Refusal } from './sourceApi';
import { parseRuns, type Run } from './runs';
import { runRoutes } from './runsData';

export const runStartRoutes = {
  start: defineRoute<unknown, RunBody>({
    method: 'POST', path: '/workflows/:name/runs', scope: 'agent', realm: 'realm', body: ['inputs', 'prompt'],
    refuses: ['spend_cap', 'workflow_not_found', 'turn_in_flight', 'bad_request'],
  }),
} as const;

/** How far before the send a listed run may have started and still be offered (ms): clocks of the Hub and the agent differ. */
export const RUN_SKEW_MS = 120_000;

export interface RunBody {
  inputs: Record<string, string>;
  prompt?: string;
}

/** The start body, or the first required param left empty (`problem`, its name). */
export function runBodyOf(params: readonly Param[], values: Readonly<Record<string, string>>, prompt: string): { body: RunBody } | { problem: string } {
  const inputs: Record<string, string> = {};
  for (const p of params) {
    const v = Object.hasOwn(values, p.name) ? values[p.name] ?? '' : '';
    if (v.trim() === '') {
      if (p.required) return { problem: p.name };
      continue;
    }
    // An own property whatever the name (`__proto__` included): a plain assignment would hit the inherited setter.
    Object.defineProperty(inputs, p.name, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return { body: prompt.trim() === '' ? { inputs } : { inputs, prompt } };
}

/** The runs a lost start may have made: this workflow, this realm, started at or after `sentAt - RUN_SKEW_MS`, newest first. */
export function runCandidates(runs: readonly Run[], workflow: string, realm: string, sentAt: number): Run[] {
  return runs
    .filter((r) => r.workflow === workflow && r.realm === realm && r.startedAt >= sentAt - RUN_SKEW_MS)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export type StartSettled = { ok: true; body: unknown } | { ok: false; err: Pick<Refusal, 'kind' | 'code' | 'status'> };
export type ListSettled = { ok: true; runs: Run[]; skipped: number } | { ok: false };

export interface RunApi {
  /** Sends the start in `ctx`. The caller sends it at most once per start. */
  start(body: RunBody, ctx: Ctx | null): Promise<StartSettled>;
  /** The realm's run listing, read in `ctx`. */
  list(ctx: Ctx | null): Promise<ListSettled>;
}

/** The calls for starting workflow `name` in `realm`, each in the context it is given (null: nothing sent or read). */
export function workflowRunApi(name: string, realm: string): RunApi {
  return {
    start: async (body, ctx) => {
      if (!ctx) return { ok: false, err: { kind: 'not_sent', code: '', status: 0 } };
      try {
        return { ok: true, body: (await api(runStartRoutes.start as Route, { params: { name }, body, realm, ctx } as CallInput)) ?? {} };
      } catch (e) {
        return { ok: false, err: refusalOf(e, true) };
      }
    },
    list: async (ctx) => {
      if (!ctx) return { ok: false };
      try {
        // The same listing the runs page reads, parsed by the same parser.
        const l = parseRuns(await api(runRoutes.list as Route, { query: { limit: 0 }, realm, ctx } as CallInput));
        return { ok: true, runs: l.runs.slice(), skipped: l.skipped };
      } catch {
        return { ok: false };
      }
    },
  };
}

export type RunView =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; sessionId: string; runId: string | null; picked: boolean }
  | { phase: 'refused'; code: string; spendCap: boolean; notSent: boolean }
  | {
      phase: 'unsure';
      /** Why: no answer ('lost'), an error answer that does not say ('error'), an accepted start without its chat ('unread'). */
      why: 'lost' | 'error' | 'unread';
      sentAt: number;
      observed: 'unchecked' | 'checking' | 'read' | 'failed';
      candidates: Run[];
      /** Listed rows the page could not read: one of them may be the run. */
      skipped: number;
    };

export interface RunStore {
  view(): RunView;
  subscribe(fn: () => void): () => void;
  /** Sends `body` unless a start is out or unsure (then nothing is sent). */
  start(body: RunBody, ctx?: Ctx | null): Promise<void>;
  /** Unsure only: reads the listing and offers look-alikes. Sends no start. */
  check(ctx?: Ctx | null): Promise<void>;
  /** Unsure only: the person says the offered run `runId` is theirs. */
  pick(runId: string): void;
  /** Unsure only: Stop tracking. Nothing is sent. */
  forget(): void;
  /** Done or refused: back to idle. */
  clear(): void;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** True when a failed start may still have started a run (outcome unknown). */
function mayHaveStarted(err: Pick<Refusal, 'kind' | 'code' | 'status'>): boolean {
  if (err.kind === 'not_sent' || err.kind === 'stale') return false;
  if (err.kind === 'pending') return true;
  if (err.code === 'admission_unconfirmed') return true;
  // A gateway or proxy error, or no answer at all, says nothing about whether the agent started it.
  return err.status === 0 || err.status >= 500;
}

export function createRunStore(o: { api: RunApi; workflow: string; realm: string; now?: () => number }): RunStore {
  const now = o.now ?? Date.now;
  let v: RunView = { phase: 'idle' };
  let checks = 0;
  const subs = new Set<() => void>();
  const set = (n: RunView) => { v = n; for (const f of [...subs]) f(); };
  return {
    view: () => v,
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    async start(body, ctx = null) {
      if (v.phase === 'running' || v.phase === 'unsure') return;
      const sentAt = now();
      set({ phase: 'running' });
      const r = await o.api.start(body, ctx);
      if (r.ok) {
        const b = obj(r.body) ? r.body : {};
        const sid = typeof b.session_id === 'string' && ID.test(b.session_id) ? b.session_id : null;
        const rid = typeof b.run_id === 'string' && ID.test(b.run_id) ? b.run_id : null;
        set(sid ? { phase: 'done', sessionId: sid, runId: rid, picked: false } : { phase: 'unsure', why: 'unread', sentAt, observed: 'unchecked', candidates: [], skipped: 0 });
        return;
      }
      if (mayHaveStarted(r.err)) { set({ phase: 'unsure', why: r.err.kind === 'pending' || r.err.status === 0 ? 'lost' : 'error', sentAt, observed: 'unchecked', candidates: [], skipped: 0 }); return; }
      const notSent = r.err.kind === 'not_sent' || r.err.kind === 'stale';
      set({ phase: 'refused', code: r.err.code, spendCap: !notSent && r.err.code === 'spend_cap', notSent });
    },
    async check(ctx = null) {
      if (v.phase !== 'unsure') return;
      const at = v;
      const mine = ++checks;
      set({ ...at, observed: 'checking' });
      const r = await o.api.list(ctx);
      // A newer check, a pick or a forget since: this answer is not shown.
      if (mine !== checks || v.phase !== 'unsure' || v.sentAt !== at.sentAt) return;
      set(r.ok
        ? { ...at, observed: 'read', candidates: runCandidates(r.runs, o.workflow, o.realm, at.sentAt), skipped: r.skipped }
        : { ...at, observed: 'failed', candidates: [], skipped: 0 });
    },
    pick(runId) {
      if (v.phase !== 'unsure') return;
      const run = v.candidates.find((c) => c.id === runId);
      if (!run) return;
      checks++;
      set({ phase: 'done', sessionId: run.sid, runId: run.id, picked: true });
    },
    forget() {
      if (v.phase !== 'unsure') return;
      checks++;
      set({ phase: 'idle' });
    },
    clear() {
      if (v.phase === 'done' || v.phase === 'refused') set({ phase: 'idle' });
    },
  };
}
