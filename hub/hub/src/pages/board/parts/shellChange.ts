// Change shell: the two sends and how a read back settles a send whose outcome is unknown.
//
// Contract, in plain words:
//   - shellTarget lives in tileInfo.ts (which tile offers Change shell).
//   - endSession(computer, n, incarnation) closes terminal-n only while it runs that shell (DELETE ?incarnation=;
//     its programs end, its windows wait). Any other shell there, a later one included, answers 409
//     INCARNATION_MISMATCH (replaced) and nothing ends, so an ending whose outcome is unknown can never end a shell
//     started after it. startShell(computer, n, shell) starts terminal-n on that shell (create). Both go through
//     boardSend, never retried here.
//   - createSession(computer, n, fields) is the Board's one create: always exclusive (the terminal changes nothing
//     when terminal-n holds any session, running or not, and answers 409 SESSION_EXISTS). Without it, a create on a
//     number whose ssh had exited would fail and clear that session's ssh settings. SESSION_EXISTS comes back as
//     the "already there" answer, so a retry after an unknown outcome is safe: one create lands, the other is
//     refused, and the read back tells whose session is there.
//   - started(answer) is false for a create answered "already there" (SESSION_EXISTS, or already_active from a
//     terminal without exclusive: terminal-n was there first and keeps what it has; the caller reads back to tell an
//     earlier create of its own from someone else's), true for any other success.
//   - afterEnd(n, before, now): a read back after an ending whose outcome is unknown. 'gone' (n is not listed),
//     'same' (n still runs the shell it ran before: the ending has not landed, or not yet), 'reopened' (n runs
//     another shell), 'unknown' (listed, but nothing tells which shell). 'gone' and 'reopened' do not prove the
//     ending has landed; they prove it can no longer end anything else, because it names the old shell.
//   - afterStart(n, shell, now): a read back after a start whose outcome is unknown. 'started' (n runs that shell),
//     'ended' (n was started on that shell, but it is no longer running), 'absent' (n is not listed: the start has
//     not happened, or not yet), 'other' (n runs something else: someone else's).
//   - restartSession(computer, n, incarnation, shell) restarts terminal-n's shell (execute ?reset=true with
//     the fixed no-op command): the terminal checks the incarnation before it resets, so any other shell there, a
//     later one included, answers 409 INCARNATION_MISMATCH (replaced) and nothing is reset. A reset rebuilds the
//     session from the request alone: it starts the shell named here (restartShell: the one it runs now, when it is
//     one of the Board's shells; otherwise none is named and the computer's default starts), and its start folder and
//     user go back to the computer's defaults. Through boardSend, never retried here.
//   - afterRestart(n, before, now): a read back after a restart whose outcome is unknown (from readSessionsChecked:
//     never a malformed answer): 'restarted' (n runs a shell of another incarnation: the restart landed, or someone
//     else's change did; either way the shell it named is gone, so it can no longer reset anything), 'same' (the same
//     shell: the restart has not landed, or not yet), 'stopped' (n is listed with no shell running: the shell it named
//     is gone and the terminal refuses a reset that names it), 'gone' (n is not listed: nothing left to reset).
//   - A settled change names its terminal by computer and session (ShellAt), never by slot: tilesShowing(tiles, at)
//     is the slots that still show that terminal (a plain terminal tile on that computer and number; an ssh tile or
//     anything else is left alone), sameTerminal(shown, at) whether a program view still shows it.
import { BOARD_SHELLS, boardSend } from '@core';
import type { BoardComputer } from '../computers';
import { isProgramTile, type Tile } from '../model/boards';
import { boardTarget, type TermSession } from '../termSessions';

/** The terminal a settled change was for. */
export interface ShellAt { readonly computer: string; readonly session: number }
export const sameTerminal = (shown: ShellAt | null, at: ShellAt): boolean => !!shown && shown.computer === at.computer && shown.session === at.session;
export function tilesShowing(tiles: Readonly<Record<string, Tile | null>>, at: ShellAt): string[] {
  return Object.entries(tiles)
    .filter(([, x]) => isProgramTile(x) && x.program === 'terminal' && !x.ssh && sameTerminal({ computer: x.computer, session: x.session }, at))
    .map(([slot]) => slot);
}

/** The terminal a Change shell dialog is for: its computer, its session and the tile's name as shown. */
export interface ShellTarget {
  readonly computer: BoardComputer;
  readonly session: number;
  readonly name: string;
}

export function endSession(computer: BoardComputer, n: number, incarnation: string): Promise<unknown> {
  return boardSend({ kit: 'terminal', index: n }, 'DELETE', '/api/v1/terminal/' + n, { target: boardTarget(computer), query: { incarnation } });
}

/** A DELETE refused because terminal-n runs another shell (or none) than the one named: nothing ended. */
export function replaced(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { code?: unknown }).code === 'INCARNATION_MISMATCH';
}

export async function createSession(computer: BoardComputer, n: number, fields: Readonly<Record<string, string | number>>): Promise<unknown> {
  try {
    return await boardSend({ kit: 'terminal', index: n }, 'POST', '/api/v1/terminal/create', { target: boardTarget(computer), query: { terminal_id: n }, body: { terminal_id: n, exclusive: true, ...fields } });
  } catch (e) {
    if (e && typeof e === 'object' && (e as { code?: unknown }).code === 'SESSION_EXISTS') return { code: 'already_active' };
    throw e;
  }
}

export function startShell(computer: BoardComputer, n: number, shell: string): Promise<unknown> {
  return createSession(computer, n, { shell });
}

export function started(answer: unknown): boolean {
  return !(answer && typeof answer === 'object' && (answer as { code?: unknown }).code === 'already_active');
}

export type AfterEnd = 'gone' | 'same' | 'reopened' | 'unknown';

export function afterEnd(n: number, before: TermSession | null, now: readonly TermSession[]): AfterEnd {
  const x = now.find((s) => s.n === n);
  if (!x) return 'gone';
  if (!before?.incarnation || !x.incarnation) return 'unknown';
  return x.incarnation === before.incarnation ? 'same' : 'reopened';
}

export type AfterStart = 'started' | 'ended' | 'absent' | 'other';

export function afterStart(n: number, shell: string, now: readonly TermSession[]): AfterStart {
  const x = now.find((s) => s.n === n);
  if (!x) return 'absent';
  if (!x.offered || x.ssh || x.shell !== shell) return 'other';
  return x.running ? 'started' : 'ended';
}

/** The shell a restart names: the one terminal-n runs now when it is one of the Board's shells, else null. */
export const restartShell = (s: TermSession): string | null => (s.shell && BOARD_SHELLS.includes(s.shell) ? s.shell : null);

export function restartSession(computer: BoardComputer, n: number, incarnation: string, shell: string | null): Promise<unknown> {
  const query = { terminal_id: n, reset: true, ...(shell ? { shell } : {}) };
  return boardSend({ kit: 'terminal', index: n }, 'POST', '/api/v1/terminal/execute', { target: boardTarget(computer), query, body: { command: 'true', incarnation } });
}

export type AfterRestart = 'restarted' | 'same' | 'stopped' | 'gone';

/** before always names a shell (Restart is offered only then). */
export function afterRestart(n: number, before: TermSession, now: readonly TermSession[]): AfterRestart {
  const x = now.find((s) => s.n === n);
  if (!x) return 'gone';
  if (!x.incarnation) return 'stopped';
  return x.incarnation === before.incarnation ? 'same' : 'restarted';
}
