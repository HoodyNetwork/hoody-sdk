// child-group.ts: the gate runners' children, each in a process group of its own, stopped with the runner.
// A signal to check.ts (SIGTERM from a caller stopping it, SIGINT, SIGHUP) used to leave its children running: a
// spawnSync child never saw it and the runner could not act while blocked. Now:
//   - every child starts detached (its own process group, pgid = pid), so the group holds it and everything it starts
//     without detaching (goldens.ts --page workers, scenario mutants, bun test processes);
//   - installGroupReaper(): on SIGTERM / SIGINT / SIGHUP the runner sends the same signal to every live group, waits
//     GRACE_MS, sends SIGKILL to any group still alive, then exits 128 + signal number; on any exit it SIGKILLs groups
//     still listed (a runner leaving by an exception leaves no child);
//   - runGroup(): async run with a timeout that stops the whole group (TERM, grace, KILL), output collected.
import type { Subprocess } from 'bun';

export const GRACE_MS = Number(process.env.TERM_CHILD_GRACE_MS ?? 5000) || 5000;
const live = new Set<Subprocess>();
const SIGNO: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };

function signalGroup(p: Subprocess, sig: NodeJS.Signals): void {
  try { process.kill(-p.pid, sig); } catch { /* group gone */ }
}
const alive = (p: Subprocess): boolean => p.exitCode === null && p.signalCode === null;

/** Stops one child's group: `sig`, then SIGKILL after `graceMs` if anything of it is still alive. */
export async function stopGroup(p: Subprocess, sig: NodeJS.Signals = 'SIGTERM', graceMs = GRACE_MS): Promise<void> {
  signalGroup(p, sig);
  const done = await Promise.race([p.exited.then(() => true), Bun.sleep(graceMs).then(() => false)]);
  // The leader may have exited while members of its group linger: the group is killed either way.
  signalGroup(p, 'SIGKILL');
  if (!done) await p.exited;
}

/** Bun.spawn in a process group of its own, listed until it exits. */
export function spawnGroup(cmd: string[], o: { cwd?: string; env?: Record<string, string | undefined>; stdout?: 'pipe' | 'inherit' | 'ignore'; stderr?: 'pipe' | 'inherit' | 'ignore' } = {}): Subprocess<'ignore', 'pipe', 'pipe'> {
  const p = Bun.spawn(cmd, { cwd: o.cwd, env: o.env, stdin: 'ignore', stdout: o.stdout ?? 'pipe', stderr: o.stderr ?? 'pipe', detached: true }) as Subprocess<'ignore', 'pipe', 'pipe'>;
  live.add(p);
  void p.exited.then(() => { signalGroup(p, 'SIGKILL'); live.delete(p); });
  return p;
}

export interface GroupRun { code: number; out: string; timedOut: boolean }
/** Runs `cmd` in its own group; past `timeoutMs` the group is stopped (TERM, grace, KILL) and code is 124. */
export async function runGroup(cmd: string[], o: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs: number }): Promise<GroupRun> {
  const p = spawnGroup(cmd, { cwd: o.cwd, env: o.env });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void stopGroup(p); }, o.timeoutMs);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  return { code: timedOut ? 124 : code ?? 1, out: out + err, timedOut };
}

/** Children still running (tests). */
export const liveGroups = (): number[] => [...live].filter(alive).map((p) => p.pid);

let reaper = false;
/** Once per runner: forwards SIGTERM / SIGINT / SIGHUP to every child group, SIGKILL after the grace, then exits. */
export function installGroupReaper(graceMs = GRACE_MS): void {
  if (reaper) return;
  reaper = true;
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(sig, () => {
      if (stopping) return;
      stopping = true;
      const ps = [...live];
      process.stderr.write(`stopping: ${sig} sent to ${ps.length} child group${ps.length === 1 ? '' : 's'}${ps.length ? ` (${ps.map((p) => p.pid).join(', ')}); SIGKILL after ${graceMs} ms` : ''}\n`);
      void Promise.all(ps.map((p) => stopGroup(p, sig, graceMs))).finally(() => process.exit(128 + SIGNO[sig]!));
    });
  }
  process.on('exit', () => { for (const p of live) signalGroup(p, 'SIGKILL'); });
}
