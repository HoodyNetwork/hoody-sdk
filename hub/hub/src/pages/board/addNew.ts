// A "new terminal" Add link (links.ts boardAddPath { kind: 'terminal', session: 'new' }; Computers' New
// terminal): the number the Board gives it when it takes the link.
//
// Contract, in plain words:
//   - newTerminalNumber(state, cid, live) → the number the picker's New session would take on that computer (termSessions
//     nextFree, terminal 1 counted as the computer's own): past every terminal of that computer on any Board of the
//     realm, in its recents, and in its live sessions when they were read (null: not read). null when every Board number
//     is held.
//   - readLiveFor(computer, signal, waitMs) → the computer's live sessions, or null when it is not running, the read
//     fails, or it is unanswered after waitMs (the link then goes past what the Boards and recents know, as the picker
//     does after a failed read). Never rejects.
import { computerState } from '@core';
import type { BoardComputer } from './computers';
import { isProgramTile, type RealmBoards } from './model/boards';
import { nextFree, readSessions, type TermSession } from './termSessions';

export function newTerminalNumber(state: RealmBoards, cid: string, live: readonly TermSession[] | null): number | null {
  const taken = [1];
  for (const b of state.boards) for (const t of Object.values(b.tiles)) if (t && isProgramTile(t) && t.computer === cid && t.program === 'terminal') taken.push(t.session);
  for (const r of state.recents) if (r.computer === cid && r.program === 'terminal') taken.push(r.session);
  for (const x of live ?? []) taken.push(x.n);
  return nextFree(taken);
}

export function readLiveFor(computer: BoardComputer, signal: AbortSignal, waitMs: number): Promise<readonly TermSession[] | null> {
  if (computerState(computer.status) !== 'running') return Promise.resolve(null);
  const ac = new AbortController();
  const stop = () => ac.abort();
  signal.addEventListener('abort', stop);
  const id = setTimeout(stop, waitMs);
  return readSessions(computer, ac.signal).then(
    (rows) => (ac.signal.aborted ? null : rows),
    () => null,
  ).finally(() => { clearTimeout(id); signal.removeEventListener('abort', stop); });
}
