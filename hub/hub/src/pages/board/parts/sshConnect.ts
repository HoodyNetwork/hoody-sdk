// Connect over SSH: a terminal session on a bridge computer that runs ssh to a host, started through
// core's Board requests. The Hub never handles a password or a key: ssh asks inside the tile.
//
// Contract, in plain words:
//   - The field rules and the label are sshRules.ts (links.ts shares them, without core).
//   - connectSsh(computer, taken, ssh) reads the computer's sessions, takes the next free number (after `taken` and
//     every number the computer holds), and creates that session with ssh_host, ssh_user and ssh_port (the
//     exclusive create, shellChange createSession). A number someone opened first (the create says "already there")
//     is skipped and the next one tried, up to TRIES times.
//     Result: {session} when it started; {pending: n} when the create's outcome is unknown (never resent: read it
//     back with checkSsh); {error, code?} otherwise ('read': the sessions could not be read and nothing was sent;
//     'full': no number left; 'busy': every try was taken; or the create's own outcome, failed / not_sent / stale).
//   - retrySsh(computer, n, ssh): the same attempt again, on the number it first took (never another one, so an
//     earlier create landing late cannot leave two connections): the exclusive create, and after "already there" a
//     read back. {session} when it runs that ssh (this create's or the earlier one's), {ended}/{taken} when that
//     ssh ended at once or someone else's is there, {pending: n} when it is still not known (unknown, or the read
//     back failed or found nothing), {error, code?} when this create was refused or not sent (the earlier one may
//     still land).
//   - checkSsh(computer, n, ssh) → 'started' (n runs ssh to that host, user and port, each compared on its own),
//     'ended' (n was set up for that ssh, but it is no longer running: it ended at once), 'absent' (n is not listed
//     now; it may not have started yet), 'other' (n runs something else), or null when the read failed.
import { outcomeOf } from '@core';
import type { BoardComputer } from '../computers';
import { nextFree, readSessions, sameSsh } from '../termSessions';
import type { Ssh } from '../sshRules';
import { createSession, started } from './shellChange';

export const TRIES = 3;

export type SshResult =
  | { readonly session: number }
  | { readonly pending: number }
  | { readonly ended: number }
  | { readonly taken: number }
  | { readonly error: 'read' | 'full' | 'busy' | 'failed' | 'not_sent' | 'stale'; readonly code?: string };

const codeOf = (e: unknown): string | undefined => {
  const c = e && typeof e === 'object' ? (e as { code?: unknown; status?: unknown }) : null;
  return typeof c?.code === 'string' ? c.code : typeof c?.status === 'number' ? String(c.status) : undefined;
};

export async function connectSsh(computer: BoardComputer, taken: readonly number[], ssh: Ssh): Promise<SshResult> {
  const skip = [...taken];
  for (let i = 0; i < TRIES; i++) {
    let held: number[];
    try { held = (await readSessions(computer)).map((s) => s.n); } catch { return { error: 'read' }; }
    const n = nextFree([...skip, ...held]);
    if (n === null) return { error: 'full' };
    let answer: unknown;
    try {
      answer = await createSession(computer, n, { ssh_host: ssh.host, ssh_user: ssh.user, ssh_port: ssh.port });
    } catch (e) {
      const kind = outcomeOf(e, true);
      if (kind === 'pending') return { pending: n };
      const code = codeOf(e);
      return { error: kind, ...(code ? { code } : {}) };
    }
    if (started(answer)) return { session: n };
    skip.push(n);
  }
  return { error: 'busy' };
}

export async function checkSsh(computer: BoardComputer, n: number, ssh: Ssh): Promise<'started' | 'ended' | 'absent' | 'other' | null> {
  let rows;
  try { rows = await readSessions(computer); } catch { return null; }
  const x = rows.find((s) => s.n === n);
  if (!x) return 'absent';
  if (!x.offered || !sameSsh(x.sshTo, ssh)) return 'other';
  return x.running ? 'started' : 'ended';
}

export async function retrySsh(computer: BoardComputer, n: number, ssh: Ssh): Promise<SshResult> {
  let answer: unknown;
  try {
    answer = await createSession(computer, n, { ssh_host: ssh.host, ssh_user: ssh.user, ssh_port: ssh.port });
  } catch (e) {
    const kind = outcomeOf(e, true);
    if (kind === 'pending') return { pending: n };
    const code = codeOf(e);
    return { error: kind, ...(code ? { code } : {}) };
  }
  if (started(answer)) return { session: n };
  const r = await checkSsh(computer, n, ssh);
  return r === 'started' ? { session: n } : r === 'ended' ? { ended: n } : r === 'other' ? { taken: n } : { pending: n };
}
