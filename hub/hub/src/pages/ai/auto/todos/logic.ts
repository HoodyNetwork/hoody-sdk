// The TODOs list's pure parts: a row from listTodos, which tab it belongs to, and a thread from getTodo.
// No React, no I/O.

import { stringOrEmpty as str } from '@core';

/** Open (default), Waiting for you, Running, Snoozed, Done. */
export type TodoTab = 'open' | 'waiting' | 'running' | 'snoozed' | 'done';
export const TABS: readonly TodoTab[] = ['open', 'waiting', 'running', 'snoozed', 'done'];

export interface TodoRow {
  /** realm / id. */
  key: string;
  id: string;
  num: number;
  realm: string;
  title: string;
  state: string;
  priority: number;
  tags: string[];
  needsHuman: boolean;
  question: string;
  /** How many of the todo's proposals wait for a person (the list row's pending_proposals; the agent omits it when 0). */
  pendingProposals: number;
  running: boolean;
  /** Snooze end, epoch ms (null when not snoozed). */
  wakeAt: number | null;
  closedAt: string;
  lastActivity: string;
  comments: number;
  tab: TodoTab;
}

type Rec = Record<string, unknown>;
const rec = (x: unknown): Rec | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Rec) : null);
const int = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : 0);

export interface TodoList {
  rows: TodoRow[];
  /** The store poll cursor this list was read at. */
  revision: number;
}

/** The store poll cursor (a realm's listing and getTodosRevision both carry one); anything else throws. */
export function cursorOf(x: unknown): number {
  if (typeof x !== 'number' || !Number.isInteger(x)) throw new Error('not a revision cursor');
  return x;
}

/** The listing. An answer that is not one, a member without its id or with a malformed pending_proposals, or a missing
 *  cursor throws (the read fails): a malformed answer never reads as "nothing here", and never stops the poll from noticing
 *  changes. */
export function todoList(raw: unknown, now: number): TodoList {
  const r = rec(raw);
  if (!r || !Array.isArray(r.items)) throw new Error('not a todo listing');
  const rows = (r.items as unknown[]).map((x) => {
    const t = rec(x);
    if (!t || !str(t.id)) throw new Error('not a todo');
    return todoRow(t, now);
  });
  return { rows, revision: cursorOf(r.revision) };
}

/** pending_proposals: absent is 0 (the agent omits it when no proposal waits); present, it must be a whole number of at least 0,
 *  else the row is malformed and the read fails (todoList throws), never read as "none waiting". getTodo's answer carries the
 *  proposals themselves and no count, so a thread's row reads 0 here. */
function proposalCount(x: unknown): number {
  if (x === undefined) return 0;
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0) throw new Error('not a proposal count');
  return x;
}

export function todoRow(x: Rec, now: number): TodoRow {
  const state = str(x.state);
  const wake = Date.parse(str(x.wake_at));
  const wakeAt = Number.isFinite(wake) && wake > now ? wake : null;
  const running = state === 'in_progress' || !!rec(x.lease);
  const needsHuman = x.needs_human === true;
  const pendingProposals = proposalCount(x.pending_proposals);
  const closed = state === 'done' || state === 'dropped';
  // A proposed run waits for a person as much as triage's question does: either puts an open todo on Waiting for you.
  const waiting = needsHuman || pendingProposals > 0;
  const tab: TodoTab = closed ? 'done' : running ? 'running' : waiting ? 'waiting' : wakeAt !== null ? 'snoozed' : 'open';
  const realm = str(x.realm);
  const id = str(x.id);
  return {
    key: `${realm}/${id}`,
    id,
    num: int(x.num),
    realm,
    title: str(x.title).replace(/\s+/g, ' ').trim(),
    state,
    priority: Math.min(4, int(x.priority)),
    tags: Array.isArray(x.tags) ? (x.tags as unknown[]).filter((t): t is string => typeof t === 'string') : [],
    needsHuman,
    question: str(x.question_for_human).trim(),
    pendingProposals,
    running,
    wakeAt,
    closedAt: str(x.closed_at),
    lastActivity: str(x.last_activity) || str(x.updated_at),
    comments: int(x.comment_count),
    tab,
  };
}

export interface ThreadEntry {
  id: string;
  ts: string;
  kind: string;
  actor: string;
  body: string;
}
export interface Proposal {
  id: string;
  agent: string;
  prompt: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'unknown';
  expiresAt: string;
}
export interface Thread {
  row: TodoRow;
  body: string;
  entries: ThreadEntry[];
  proposals: Proposal[];
}

const PSTATUS = ['pending', 'approved', 'denied', 'expired'] as const;

/** An optional array field: absent is empty (the agent omits empty ones); present, null included, it must be an array
 *  of objects. */
function recs(x: unknown, what: string): Rec[] {
  if (x === undefined) return [];
  if (!Array.isArray(x)) throw new Error(`not a ${what} list`);
  return x.map((e) => {
    const r = rec(e);
    if (!r) throw new Error(`not a ${what}`);
    return r;
  });
}

/** getTodo's answer as a thread. An answer that names no todo, or a timeline or proposals field of the wrong shape,
 *  throws (the read fails): it never reads as "no activity". */
export function threadOf(raw: unknown, now: number): Thread {
  const t = rec(rec(raw)?.todo);
  if (!t || !str(t.id)) throw new Error('not a todo');
  const entries = recs(t.timeline, 'timeline entry').map((e) => ({
    id: str(e.id),
    ts: str(e.ts),
    kind: str(e.kind),
    actor: str(rec(e.actor)?.kind),
    body: str(e.body),
  }));
  const proposals = recs(t.proposals, 'proposal').map((p) => {
    if (!str(p.id)) throw new Error('not a proposal');
    const st = str(p.status);
    return {
      id: str(p.id),
      agent: str(p.agent),
      prompt: str(p.prompt),
      status: ((PSTATUS as readonly string[]).includes(st) ? st : 'unknown') as Proposal['status'],
      expiresAt: str(p.expires_at),
    };
  });
  return { row: todoRow(t, now), body: str(t.body), entries, proposals };
}

/** True when the store moved past the revision the list was read at. Not read yet on either side: no claim. */
export function moved(listRev: number | undefined, polled: number | undefined): boolean {
  return listRev !== undefined && polled !== undefined && polled !== listRev;
}
