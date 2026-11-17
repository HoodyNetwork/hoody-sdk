// The "All computers" chat list rules: which computers the list follows, the
// change-feed frames of GET /changes/stream, and one list of every followed computer's rows.
//
// - Followed: the shown realm's computers (core useComputersAll: the agent answers that realm's list, as Files reads it),
//   the top-bar computer first, then the list's order.
//   Only running computers are read, at most ALL_MAX at once; any other computer is still listed, with its reason
//   (stopped, starting, needs attention, or past ALL_MAX), so a computer the list does not read never reads as empty.
// - Frames: `snapshot` {scope, tokens} replaces the tokens; `changed` {topic, token} moves one topic (a null token
//   drops it: unreadable now); anything else (end, unknown events, unreadable data, a change before any snapshot)
//   leaves them as they are.
// - Rows: each computer's chat rows (the same rules as one computer's list) with their computer and its handle; the key carries the
//   computer, so the same realm and sid on two computers are two rows.
import { computerHandle, computerState, routingNode, stringOrEmpty as str, type Target } from '@core';
import { tokensOf, type ChatRow, type Tokens } from './chats.logic';
import { coverage, settled, type Source } from './coverage.logic';

/** Running computers the list reads at once (each holds its own change feed and reads). */
export const ALL_MAX = 8;

/** A computer of the shown realm, as the containers list gives it. */
export interface AllComputer {
  id: string;
  name: string;
  project: string;
  server: string;
  status: string;
}

/** Why the list does not read a computer. */
export type NotRead = 'stopped' | 'starting' | 'attention' | 'cap';

export interface Followed {
  computer: AllComputer;
  target: Target;
  /** name.last4: the computer part of its chat links. */
  handle: string;
  /** Read now (running and within ALL_MAX). */
  read: boolean;
  why?: NotRead;
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** One containers row; null without an id or a project (no target can be built). */
export function allComputerOf(raw: unknown): AllComputer | null {
  const c = rec(raw);
  const id = str(c.id);
  const project = str(c.project_id);
  if (!id || !project) return null;
  return { id, name: str(c.name) || id.slice(-4), project, server: routingNode(c), status: str(c.status) };
}

export function followedComputers(rows: readonly AllComputer[], current: string | null, max = ALL_MAX): Followed[] {
  const ordered = [...rows.filter((c) => c.id === current), ...rows.filter((c) => c.id !== current)];
  let reading = 0;
  return ordered.map((computer) => {
    const target: Target = { project: { id: computer.project }, container: { id: computer.id, ...(computer.server ? { server_name: computer.server } : {}) } };
    const handle = computerHandle({ id: computer.id, name: computer.name });
    const st = computerState(computer.status);
    if (st !== 'running') return { computer, target, handle, read: false, why: st };
    if (reading >= max) return { computer, target, handle, read: false, why: 'cap' };
    reading++;
    return { computer, target, handle, read: true };
  });
}

/** What one followed computer's group says about the chats it may be missing: not read, and why;
 *  its feed refused for now; its own read not proven whole (coverage.logic's judge over its own sources); or a read
 *  still out (the group says so only after the list's grace: never a flash). null: its chats are all here. */
export type ComputerGap = { kind: 'notRead'; why: NotRead } | { kind: 'refused' } | { kind: 'partial' } | { kind: 'reading' };

export function computerGap(f: Followed, part: { refused: boolean; sources?: readonly Source[] } | undefined): ComputerGap | null {
  if (!f.read) return { kind: 'notRead', why: f.why ?? 'attention' };
  if (part?.refused) return { kind: 'refused' };
  if (!part?.sources) return { kind: 'reading' };
  if (coverage(part.sources)) return null;
  return settled(part.sources) ? { kind: 'partial' } : { kind: 'reading' };
}

/** Why the computer list does not prove which computers exist now (core useComputersAll's contract): a failed refresh
 *  (the rows shown before are kept), later pages still reading, the page cap reached, or a list that took several pages
 *  (a computer can be skipped between reads). null: one whole page, read now. */
export type ListGap = 'failed' | 'reading' | 'capped' | 'unproven';

export function listGap(l: { complete: boolean; unproven: boolean; more: boolean; capped: boolean; failed: boolean }, busy = false): ListGap | null {
  if (l.failed) return 'failed';
  // `busy`: a read of the list in flight or paused now, a refresh of a whole answer included (core keeps `complete`
  // while it refreshes), or an answer gone stale: no answer of now.
  if (l.more || busy) return 'reading';
  if (l.capped) return 'capped';
  return l.complete ? null : 'unproven';
}

/** The All computers list's coverage sources (coverage.logic): the computer list's own state (a refresh in flight or
 *  paused is `reading`; failed, capped, unproven: not proven), each containers row no computer could be built from, each
 *  computer the list does not read (stopped, starting, needs attention, past ALL_MAX) or whose feed is refused, a read
 *  computer with no answer yet, and every read computer's own sources. */
export function allSources(a: { list: ListGap | null; unbuilt: number; computers: ReadonlyArray<{ id: string; unread?: boolean; sources?: readonly Source[] }> }): Source[] {
  const out: Source[] = [];
  if (a.list) out.push({ kind: 'computers', computer: '', state: a.list === 'reading' ? 'pending' : 'failed' });
  for (let i = 0; i < a.unbuilt; i++) out.push({ kind: 'unbuilt', computer: '', state: 'failed' });
  for (const c of a.computers) {
    if (c.unread) out.push({ kind: 'computer', computer: c.id, state: 'failed' });
    else if (!c.sources) out.push({ kind: 'computer', computer: c.id, state: 'pending' });
    else for (const s of c.sources) out.push({ ...s, computer: c.id });
  }
  return out;
}

export function applyFrame(prev: Tokens | null, name: string, data: string): Tokens | null {
  if (name !== 'snapshot' && name !== 'changed') return prev;
  let v: unknown;
  try { v = JSON.parse(data); } catch { return prev; }
  const r = rec(v);
  if (name === 'snapshot') return v && typeof v === 'object' && !Array.isArray(v) && typeof r.scope === 'string' ? tokensOf(r) : prev;
  const topic = str(r.topic);
  if (!prev || !topic) return prev;
  const tokens: Record<string, string> = { ...prev.tokens };
  if (typeof r.token === 'string') tokens[topic] = r.token;
  else if (r.token === null) delete tokens[topic];
  else return prev;
  return { scope: prev.scope, tokens };
}

/** A row of the All computers list: the chat row with its computer. */
export interface AllRow extends ChatRow {
  computer: string;
  handle: string;
}

export function mergeRows(groups: ReadonlyArray<{ f: Followed; rows: readonly ChatRow[] }>): AllRow[] {
  return groups.flatMap(({ f, rows }) => rows.map((r) => ({ ...r, key: `${f.computer.id}|${r.key}`, computer: f.computer.id, handle: f.handle })));
}
