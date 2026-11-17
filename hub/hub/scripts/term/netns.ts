// netns.ts: the Bun/Node side of the OS boundary (netns.sh, network, processes, files).
// Every test entry imports netns-first.ts FIRST: when the process is not inside the boundary it re-runs its own command
// line under netns.sh and exits with that run's status; the outer process runs nothing else. The re-run is SYNCHRONOUS
// on purpose: a sibling import of an entry module evaluates while an earlier sibling awaits (Bun TLA), so an async check
// would let the rest of the entry run outside the boundary. A signal reaches the re-run through its process group
// (terminal, timeout(1), check.ts child-group), which it shares; netns.sh's pid 1 forwards it to the command.
// Gate runners (check.ts) start every child through netns.sh as well (confine()).
// Never a silent fallback: a re-run that cannot start, or a re-run that is still not confined, fails with a fixed reason
// code. "Confined" is read from the kernel (/proc/self/net/dev, /proc/self/mountinfo), never from the environment.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Node-safe (vitest imports test helpers that may import this): no import.meta.dir, no Bun global.
export const NETNS_SH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'netns.sh');
/** Marks the re-run, only so a re-run that is somehow not confined refuses instead of looping. Never trusted as proof. */
const REEXEC = 'HUB_NETNS_REEXEC';
/** The source name of the boundary's root tmpfs (netns.sh TAG). */
export const ROOT_TAG = 'hub-term-root';

/** The interface names of this process's network namespace (from /proc/self/net/dev). */
export function interfaces(text: string = fs.readFileSync('/proc/self/net/dev', 'utf8')): string[] {
  return text.split('\n').slice(2).map((l) => l.split(':')[0]!.trim()).filter(Boolean);
}
/** Inside the network boundary: at least one interface, and every one is `lo`. */
export const confinedBy = (names: readonly string[]): boolean => names.length > 0 && names.every((n) => n === 'lo');
/** Whether this process's root is the boundary's tmpfs (mountinfo: mount point "/", fs tmpfs, source ROOT_TAG). */
export function rootIsBoundary(text: string = fs.readFileSync('/proc/self/mountinfo', 'utf8')): boolean {
  return text.split('\n').some((l) => {
    const [pre, post] = l.split(' - ');
    if (!pre || !post) return false;
    const [fsType, src] = post.split(' ');
    return pre.split(' ')[4] === '/' && fsType === 'tmpfs' && src === ROOT_TAG;
  });
}
/** Inside the boundary: network AND files (netns.sh confined()). */
export function confined(): boolean {
  try { return confinedBy(interfaces()) && rootIsBoundary(); } catch { return false; }
}

export class NetnsRefused extends Error {
  constructor(readonly code: 'TERM_NETNS_REEXEC_NOT_CONFINED' | 'TERM_NETNS_NO_CMDLINE' | 'TERM_NETNS_SPAWN_FAILED') {
    super(`netns: refused: ${code}`);
  }
}

/** This process's real command line (bun test rewrites process.argv), with the runtime pinned to process.execPath. */
export function ownCommand(): string[] {
  const raw = fs.readFileSync('/proc/self/cmdline', 'utf8').split('\0');
  if (raw.at(-1) === '') raw.pop();
  if (!raw.length) throw new NetnsRefused('TERM_NETNS_NO_CMDLINE');
  return [process.execPath, ...raw.slice(1)];
}

/** `cmd` run inside the boundary (a gate runner's child): netns.sh in a privileged-mode shell, every path pinned. */
export const confine = (cmd: readonly string[]): string[] => ['/bin/bash', '-p', NETNS_SH, ...cmd];

/**
 * Inside already: returns. Otherwise re-runs this command line under netns.sh (stdio inherited, same process group) and
 * exits with its status, never returning. Synchronous: nothing else of the entry runs meanwhile. netns.sh rebuilds the
 * environment from named keys (env -i) and closes descriptors above 2 before anything of the re-run starts.
 */
export function ensureConfined(): void {
  if (confined()) return;
  if (process.env[REEXEC] === '1') throw new NetnsRefused('TERM_NETNS_REEXEC_NOT_CONFINED');
  const [file, ...args] = confine(ownCommand());
  const r = spawnSync(file!, args, { cwd: process.cwd(), env: { ...process.env, [REEXEC]: '1' }, stdio: 'inherit' });
  if (r.error) throw new NetnsRefused('TERM_NETNS_SPAWN_FAILED');
  process.exit(r.status ?? 128 + (r.signal ? 15 : 1));
}
