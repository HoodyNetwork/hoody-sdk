// Workflows' reads, on the computer's agent in the realm shown. Reads only:
// running, editing and hiding are sent elsewhere (runApi.ts, runActions.ts, sourceApi.ts).
// - The list (listWorkflows) is not pause-gated: it lists while the agent is paused.
// - The detail reads the definition (getWorkflow), a gated tool run, for a question step's answer routes. While the
//   agent is paused it is refused: as a typed daemon_paused (503, or a 200 envelope), or by an older gateway as a
//   plain 400, which alone cannot tell "paused".
// - The pause state (getPauseState, daemon-wide, no realm) is the authority: read while a detail is open, every
//   10 s (PAUSE_POLL_MS), and at once on Check again or Refresh. While paused the definition read is off; a resume
//   turns it on again, and the read (stale at once, as every source read) runs again. A paused agent shows the
//   paused state, never the old detail and never a failure.
// - A definition refused as daemon_paused while the pause read still said running (the agent paused between the two
//   reads and resumed before the next pause read) never turned the definition read off, so a resume cannot turn it on
//   again: the next pause answer that says running reads the definition again, once (the poll, Check again, Refresh).
//   A refusal again stays paused until the following answer.
// - Whether a workflow is hidden is read only when the agent's version answer reports `WF_HIDDEN_CAP` (core's
//   parseVersion/cap; reported unavailable counts as absent). While the version read is loading or failed, no row says
//   hidden. The read has its own key, apart from the AI tab's `version`.
import { agent, coreSource, defineRoute, errorInfo, providers, versionRoute } from '@core';
import { useEffect, useMemo, useRef } from 'react';
import { answerRoutes, parseWorkflows, WF_HIDDEN_CAP, type AnswerRoute, type Workflow } from './logic';

export const workflowRoutes = {
  // limit 0 is the agent's "no pagination": the whole list in one answer.
  list: defineRoute({ method: 'GET', path: '/workflows', scope: 'agent', realm: 'realm', query: ['page', 'limit'] }),
  get: defineRoute({ method: 'GET', path: '/workflows/:name', scope: 'agent', realm: 'realm', envelope: true, refuses: ['daemon_paused'] }),
} as const;

/** The detail read's key: the workflow and the realm it was listed in (null: the realm shown). */
export interface DetailKey {
  readonly name: string;
  readonly realm: string | null;
}

export type Answers = ReadonlyMap<string, readonly AnswerRoute[]>;

/** The pause as core reads it (core/agent/pause.ts: daemon-wide, no realm; null when the answer does not say). */
export type Pause = agent.PauseState;

const source = coreSource('ai', {
  reads: {
    workflows: {
      route: workflowRoutes.list,
      input: (realm?: string | null) => ({ realm: realm ?? undefined, query: { limit: 0 } }),
    },
    workflow: {
      route: workflowRoutes.get,
      input: (k?: DetailKey) => (k ? { params: { name: k.name }, realm: k.realm ?? undefined } : {}),
      select: (r: unknown) => answerRoutes(r && typeof r === 'object' ? (r as { output?: unknown }).output : undefined),
    },
    pause: { route: agent.pauseRoutes.get, select: (r: unknown) => agent.pauseOf(r) },
    agentVersion: { route: versionRoute },
  },
});

/** The list read as DataTable takes it. */
export interface ListRead {
  readonly data: readonly Workflow[] | undefined;
  readonly isPending: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
  /** When the list was last read (each successful read moves it, even one bringing the same rows). */
  readonly readAt: number;
}

/** The agent reports `WF_HIDDEN_CAP` (false while its version read is loading or failed). */
export function useWorkflowHiddenCap(enabled = true): boolean {
  const q = source.useQuery<unknown>('agentVersion', undefined, { enabled });
  return providers.cap(providers.parseVersion(q.data), WF_HIDDEN_CAP);
}

export function useWorkflowList(realm: string | null, enabled = true): ListRead {
  const hiddenCap = useWorkflowHiddenCap(enabled);
  const q = source.useQuery<unknown, string | null>('workflows', realm, { enabled });
  // Parsed here, so the capability (a second read) decides whether `hidden` is read; the same answer and capability
  // give the same row objects.
  const data = useMemo(() => (q.data === undefined ? undefined : parseWorkflows(q.data, { hiddenCap })), [q.data, hiddenCap]);
  return { data, isPending: q.isPending, error: q.error ?? null, refetch: () => void q.refetch(), readAt: q.dataUpdatedAt };
}

/** Refresh: the list, the open detail and the pause state, read again. */
export function refreshWorkflows(): void {
  void source.invalidate(['workflows', 'workflow', 'pause']);
}

export type DetailRead =
  | { readonly state: 'loading' }
  /** The agent is paused: the definition cannot be read until it resumes. `recheck` reads the pause state now. */
  | { readonly state: 'paused'; readonly recheck: () => void }
  | { readonly state: 'failed'; readonly error: unknown; readonly retry: () => void; readonly retrying: boolean }
  /** Read: each question step's answer routes (none for most workflows). */
  | { readonly state: 'ready'; readonly answers: Answers };

/** The detail's facts as one state. Paused (the pause read says so, or the read was refused as daemon_paused) wins
 *  over a kept earlier answer; any other refusal after an answer keeps that answer. */
export function detailState(
  q: { data?: Answers; error?: unknown; isFetching?: boolean; refetch?: () => unknown },
  pause?: { paused?: boolean; recheck?: () => void },
): DetailRead {
  const recheck = pause?.recheck ?? (() => void q.refetch?.());
  if (pause?.paused === true || (q.error != null && errorInfo(q.error).code === 'daemon_paused')) return { state: 'paused', recheck };
  if (q.data) return { state: 'ready', answers: q.data };
  if (q.error != null) return { state: 'failed', error: q.error, retry: () => void q.refetch?.(), retrying: q.isFetching === true };
  return { state: 'loading' };
}

/** How often the pause state is read while a detail is open. */
export const PAUSE_POLL_MS = 10_000;

/** The open workflow's detail read; nothing is read without one. */
export function useWorkflowDetail(key: DetailKey | null): DetailRead {
  const open = key !== null;
  const p = source.useQuery<Pause | null>('pause', undefined, { enabled: open, refetchInterval: open ? PAUSE_POLL_MS : false });
  const pause = p.data ?? null;
  // The definition is read once the pause read has answered (a failed or unreadable pause read counts as not known
  // paused). While paused nothing reads it (it would be refused).
  const settled = p.data !== undefined || p.error != null;
  const q = source.useQuery<Answers, DetailKey | undefined>('workflow', key ?? undefined, {
    enabled: open && settled && pause?.paused !== true,
  });
  // A daemon_paused refusal owes one definition read to the next pause answer that says running (paused: false).
  // Order comes from the renders, never from clock order: a refusal (a new error object) arms it, and a pause answer
  // seen since the effect last ran (a new answer time, or a read that ended: isFetching back to false, status success)
  // settles it, in the same run when both land together: running reads the definition again, paused drops it (the
  // resume turns the definition read on again by itself), an unreadable answer keeps it. A refusal again arms it
  // again, so each pause answer reads the definition at most once. Check again settles from its own answer (the
  // read's promise), so it needs no render to show the read ending (batched) nor a clock that moved.
  const refused = q.error != null && errorInfo(q.error).code === 'daemon_paused' ? q.error : null;
  const answerAt = p.dataUpdatedAt;
  const answerDone = !p.isFetching && p.status === 'success';
  const said = pause?.paused;
  const owe = useRef<{ refused: unknown; owed: boolean; at: number; done: boolean; read: () => unknown }>({
    refused: null, owed: false, at: 0, done: false, read: () => undefined,
  });
  const { refetch } = q;
  useEffect(() => {
    const o = owe.current;
    o.read = refetch;
    const fresh = answerDone && (answerAt !== o.at || !o.done);
    o.at = answerAt;
    o.done = answerDone;
    if (refused !== o.refused) {
      o.refused = refused;
      o.owed = refused !== null;
    }
    if (!open || !fresh || !o.owed || said === undefined) return;
    o.owed = false;
    if (said === false) void refetch();
  }, [open, refused, answerAt, answerDone, said, refetch]);
  return detailState(
    { data: q.data, error: q.error, isFetching: q.isFetching, refetch: q.refetch },
    {
      paused: pause?.paused,
      recheck: () => {
        void p.refetch().then((r) => {
          const o = owe.current;
          if (r.status !== 'success' || r.data == null || !o.owed) return;
          o.owed = false;
          if (r.data.paused === false) void o.read();
        });
      },
    },
  );
}
