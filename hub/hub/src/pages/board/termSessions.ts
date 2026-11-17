// A computer's live terminal sessions: read once for the picker's session step, through core's Board
// requests (boardSend), never kept.
//
// Contract, in plain words:
//   - sessionsOf(body) → the sessions hoody-terminal lists (a JSON array), one per Board number (BOARD_IDS), sorted.
//     A daemon program's terminal and a short-lived (ephemeral) one are never offered as a row, but their number
//     still counts as taken (`offered: false`), so "New session" never lands on one. Anything that is not such a
//     list gives [], and a row without a usable number is skipped.
//   - Each fact is what the row says, or null when it says nothing usable: shell (its last path part), cwd, ssh
//     (user@host, port added when it is not 22: for showing only), sshTo (the same three fields apart, port 22 when
//     the row names none: what a read back compares), viewers (open windows, 0 or more), lastActivity (ms), running (the
//     shell still runs; false only when the row says so), incarnation (32 lowercase hex, new for every shell the
//     session starts: how a read back tells "the same shell" from "a new one").
//   - readSessions(computer, signal) → one read, as sessionsOf; rejects as boardSend does (the caller decides).
//   - readSessionsChecked(computer, signal) → {rows, multi}: the same read for a decision that rests on what is listed
//     (a restart's read back: "not listed" or "no shell" settles it). It rejects ({code: 'UNREADABLE_LIST'}) unless the
//     answer is a list whose every row is an object naming its terminal (an integer, or a decimal without leading
//     zeros, as the terminal writes it: any range, so a number it keeps is never dropped by sessionsOf) and carrying an
//     incarnation field that is null (the terminal's "no shell runs") or 32 lowercase hex; a row without the field
//     says nothing, so the read is unreadable. multi: the Board numbers listed more than once (rows tells one of them
//     only, so a decision about such a number cannot rest on this read). A malformed answer is never "not listed" or
//     "no shell".
//   - nextFree(taken, top?) → the next number after the highest taken one (at least 1), or, past the last number (top:
//     the Board's last terminal number unless given, e.g. the browser range's), the lowest one nobody holds; null when
//     every number is held. Numbers above top are not counted.
//   - bandOf(body) → the numbers in the launch band (core RUN_BAND, 8001-9999) a row names (terminal_id or id, as
//     listedNumber reads them), whatever else the row says: what "Open by number" accepts there (sessionNumber.ts).
//     Anything that is not a list gives none.
//   - useLiveSessions(computer) → {rows, band} from one read, as useTermSessions; useTermSessions(computer) is its rows.
//   - useTermSessions(computer) → the live sessions, or null while reading, when the read failed, and for no
//     computer or one that is not running (nothing is read then). An answer belongs to the read that got it: leaving
//     (a computer change, null, a stop, unmount) drops it and aborts the read, so coming back (A→B→A, or the same
//     computer again) shows nothing until a new read answers, and a failed read shows nothing.
import { BOARD_IDS, boardSend, computerState, inRunBand } from '@core';
import { useEffect, useState } from 'react';
import type { BoardComputer } from './computers';
import type { Ssh } from './sshRules';

export const SESSIONS_PATH = '/api/v1/terminal/sessions';

export interface TermSession {
  readonly n: number;
  /** False for a daemon program's or an ephemeral terminal: its number is taken, the picker does not offer it. */
  readonly offered: boolean;
  readonly shell: string | null;
  readonly cwd: string | null;
  readonly ssh: string | null;
  readonly sshTo: SshTo | null;
  readonly viewers: number;
  readonly lastActivity: number | null;
  readonly running: boolean;
  readonly incarnation: string | null;
}

/** Where a session's ssh goes, as the row says (user null when it names none). */
export interface SshTo { readonly host: string; readonly user: string | null; readonly port: number }

/** A listed ssh session as a tile's ssh destination; null without a user (the gate could not compare it). */
export const sshOfSession = (to: SshTo | null | undefined): Ssh | null => (to && to.user !== null ? { host: to.host, user: to.user, port: to.port } : null);

/** The session's ssh goes to exactly these host, user and port (each compared on its own, never the label). */
export const sameSsh = (a: SshTo | null, b: Ssh): boolean => !!a && a.host === b.host && a.user === b.user && a.port === b.port;

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max = 512): string | null => (typeof v === 'string' && v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : null);

function boardNumber(v: unknown): number | null {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '';
  if (!/^[0-9]{1,5}$/.test(s)) return null;
  const n = Number(s);
  return n >= BOARD_IDS[0] && n <= BOARD_IDS[1] ? n : null;
}

function sshToOf(r: Record<string, unknown>): SshTo | null {
  const host = text(r.ssh_host, 255);
  if (!host) return null;
  const raw = typeof r.ssh_port === 'number' ? r.ssh_port : typeof r.ssh_port === 'string' && /^[0-9]{1,5}$/.test(r.ssh_port) ? Number(r.ssh_port) : null;
  return { host, user: text(r.ssh_user, 64), port: raw !== null && Number.isInteger(raw) && raw >= 1 && raw <= 65535 ? raw : 22 };
}
const sshText = (x: SshTo | null): string | null => (x ? (x.user ? x.user + '@' : '') + x.host + (x.port !== 22 ? ':' + x.port : '') : null);

export function sessionsOf(body: unknown): TermSession[] {
  if (!Array.isArray(body)) return [];
  const byN = new Map<number, TermSession>();
  for (const it of body) {
    const r = rec(it);
    const n = boardNumber(r.terminal_id ?? r.id);
    if (n === null) continue;
    const offered = r.daemon_program !== true && r.is_ephemeral !== true;
    const prev = byN.get(n);
    // One number, two rows (a session a program claims): it stays taken, and offered only if every row is.
    if (prev && (!prev.offered || !offered)) { byN.set(n, { ...prev, offered: false }); continue; }
    if (prev) continue;
    const shell = text(r.shell, 255);
    const sshTo = sshToOf(r);
    const last = typeof r.last_activity === 'number' && Number.isFinite(r.last_activity) && r.last_activity > 0 ? r.last_activity * 1000 : null;
    byN.set(n, {
      n,
      offered,
      shell: shell ? shell.split('/').filter(Boolean).pop() ?? null : null,
      cwd: text(r.cwd, 1024),
      ssh: sshText(sshTo),
      sshTo,
      viewers: typeof r.client_count === 'number' && Number.isInteger(r.client_count) && r.client_count > 0 ? r.client_count : 0,
      lastActivity: last,
      running: r.is_active !== false,
      incarnation: typeof r.incarnation === 'string' && /^[0-9a-f]{32}$/.test(r.incarnation) ? r.incarnation : null,
    });
  }
  return [...byN.values()].sort((a, b) => a.n - b.n);
}

export function nextFree(taken: Iterable<number>, top: number = BOARD_IDS[1]): number | null {
  const held = new Set<number>();
  let max = 0;
  for (const n of taken) { if (Number.isInteger(n) && n >= BOARD_IDS[0] && n <= top) { held.add(n); if (n > max) max = n; } }
  if (max < top) return Math.max(BOARD_IDS[0], max + 1);
  for (let n = BOARD_IDS[0]; n <= top; n++) if (!held.has(n)) return n;
  return null;
}

/** The computer as core's target (the computer a Board request goes to). */
export const boardTarget = (c: BoardComputer) => ({ project: { id: c.project_id }, container: { id: c.id, ...(c.server_name ? { server_name: c.server_name } : {}) } });

const sendList = (computer: BoardComputer, signal?: AbortSignal): Promise<unknown> =>
  boardSend({ kit: 'terminal', index: 1 }, 'GET', SESSIONS_PATH, { target: boardTarget(computer), ...(signal ? { signal } : {}) });

export function readSessions(computer: BoardComputer, signal?: AbortSignal): Promise<TermSession[]> {
  return sendList(computer, signal).then(sessionsOf);
}

export function bandOf(body: unknown): ReadonlySet<number> {
  const out = new Set<number>();
  if (!Array.isArray(body)) return out;
  for (const it of body) {
    const n = it && typeof it === 'object' && !Array.isArray(it) ? listedNumber(it as Record<string, unknown>) : null;
    if (n !== null && inRunBand(n)) out.add(n);
  }
  return out;
}

export interface LiveSessions { readonly rows: readonly TermSession[]; readonly band: ReadonlySet<number> }

/** One id field as the terminal writes it (an integer, or a decimal without leading zeros), else null. */
function idValue(id: unknown): number | null {
  if (typeof id === 'number') return Number.isInteger(id) && id >= 0 && id <= 999_999_999 ? id : null;
  return typeof id === 'string' && /^(?:0|[1-9][0-9]{0,8})$/.test(id) ? Number(id) : null;
}

/** A row's terminal number, else null. The terminal writes `id` and `terminal_id` from the same number (http.c ~5403):
 *  every one of the two the row has must read, and both must name the same terminal; one missing is fine. */
function listedNumber(r: Record<string, unknown>): number | null {
  const own = (k: string) => Object.prototype.hasOwnProperty.call(r, k);
  const got = (['terminal_id', 'id'] as const).filter(own).map((k) => idValue(r[k]));
  if (got.length === 0 || got.some((n) => n === null)) return null;
  return got.every((n) => n === got[0]) ? got[0]! : null;
}

/** Whether a sessions answer is a list a decision may rest on (readSessionsChecked). */
export function wellFormedSessions(body: unknown): boolean {
  if (!Array.isArray(body)) return false;
  return body.every((it) => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return false;
    const r = it as Record<string, unknown>;
    const inc = r.incarnation;
    return listedNumber(r) !== null && Object.prototype.hasOwnProperty.call(r, 'incarnation') && (inc === null || (typeof inc === 'string' && /^[0-9a-f]{32}$/.test(inc)));
  });
}

export interface CheckedSessions {
  readonly rows: TermSession[];
  /** Board numbers listed more than once. */
  readonly multi: ReadonlySet<number>;
}

export function readSessionsChecked(computer: BoardComputer, signal?: AbortSignal): Promise<CheckedSessions> {
  return boardSend({ kit: 'terminal', index: 1 }, 'GET', SESSIONS_PATH, { target: boardTarget(computer), ...(signal ? { signal } : {}) }).then((body) => {
    if (!wellFormedSessions(body)) throw { code: 'UNREADABLE_LIST' };
    const seen = new Set<number>();
    const multi = new Set<number>();
    for (const it of body as Record<string, unknown>[]) {
      const n = listedNumber(it) as number;
      if (seen.has(n)) multi.add(n);
      seen.add(n);
    }
    return { rows: sessionsOf(body), multi };
  });
}

export function useTermSessions(computer: BoardComputer | null): readonly TermSession[] | null {
  return useLiveSessions(computer)?.rows ?? null;
}

export function useLiveSessions(computer: BoardComputer | null): LiveSessions | null {
  const on = !!computer && computerState(computer.status) === 'running';
  const key = on ? computer.project_id + '\n' + computer.id + '\n' + (computer.server_name ?? '') : '';
  const [got, setGot] = useState<{ key: string; live: LiveSessions } | null>(null);
  useEffect(() => {
    if (!key || !computer) return;
    const ac = new AbortController();
    sendList(computer, ac.signal).then(
      (body) => { if (!ac.signal.aborted) setGot({ key, live: { rows: sessionsOf(body), band: bandOf(body) } }); },
      () => { if (!ac.signal.aborted) setGot(null); },
    );
    return () => { ac.abort(); setGot(null); };
    // The key names the computer; the object itself changes on every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return got && got.key === key ? got.live : null;
}
