// Connect over SSH: the field rules and the label, shared by the picker's form (SshForm, sshConnect) and the
// prefill link (links.ts boardConnectSshLink), with no core import.
//
// Contract, in plain words:
//   - sshProblems(draft) → which field is wrong, as core's Board route would refuse it (host: letters, digits and
//     . _ : [ ] -, not starting with '-', up to 253; user: letters, digits and . _ -, not starting with '-', up to
//     64; port: a whole number 1-65535). An empty host or user is 'empty'. {} when it can be sent.
//   - sshOf(draft) → the draft as sent (trimmed; port a number), or null while sshProblems finds something.
//   - sshLabel(user, host, port) → "user@host", plus ":port" when it is not 22: the tile's name, and how
//     termSessions shows an ssh session (so a read back can recognise it).

// The same rules as core's Board route (kitRoutes SSH_HOST / SSH_USER; sshConnect.test checks they agree), so the
// form names the field instead of a refusal that names nothing.
export const SSH_HOST = /^[A-Za-z0-9._:[\]][A-Za-z0-9._:[\]-]{0,252}$/;
export const SSH_USER = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,63}$/;

export interface SshDraft { readonly host: string; readonly user: string; readonly port: string }
export interface Ssh { readonly host: string; readonly user: string; readonly port: number }
export type SshProblem = 'empty' | 'bad';

export function sshProblems(d: SshDraft): { host?: SshProblem; user?: SshProblem; port?: SshProblem } {
  const host = d.host.trim(), user = d.user.trim(), port = d.port.trim();
  const out: { host?: SshProblem; user?: SshProblem; port?: SshProblem } = {};
  if (!host) out.host = 'empty'; else if (!SSH_HOST.test(host)) out.host = 'bad';
  if (!user) out.user = 'empty'; else if (!SSH_USER.test(user)) out.user = 'bad';
  if (!/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) out.port = 'bad';
  return out;
}

/** The draft as sent, or null while sshProblems finds something. */
export function sshOf(d: SshDraft): Ssh | null {
  const p = sshProblems(d);
  return p.host || p.user || p.port ? null : { host: d.host.trim(), user: d.user.trim(), port: Number(d.port.trim()) };
}

export const sshLabel = (user: string, host: string, port: number): string => user + '@' + host + (port !== 22 ? ':' + port : '');
