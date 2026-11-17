import path from 'node:path';
import { guardEnv, RUNNER_EXTRA, runnerKept } from './net-policy.mjs';

const HUB = path.resolve(import.meta.dir, '../..');
// child-env.ts: the environment every gate child runs with (scripts/term/check.ts, hub/scripts/check.ts term step).
// Minimal on purpose: only what a Bun child needs to run, never the caller's tokens, profiles, URLs or a
// .env's values; NODE_ENV is always test. The same NAMED, value-checked keys as the test fence (net-policy.mjs
// No prefix-wide retention) plus RUNNER_EXTRA (HOME, TERMSHOT, COLORTERM, HUB_NETNS_REEXEC).
/** The keys a gate child keeps beyond the test keep-list: net-policy RUNNER_EXTRA (one list for runners and children). */
export const CHILD_ENV_EXTRA = RUNNER_EXTRA;
/** Whether a gate child keeps this variable with this value. */
export const childKept = (k: string, v: string): boolean => runnerKept(k, v);

/** A heavy copy under an optional IO lock, when HUB_TERM_IO_LOCK names one (an absolute path; flock, waiting at most
 *  300 s); unset, empty or relative, the command runs without a lock. */
export function ioLocked(cmd: string[], from: NodeJS.ProcessEnv = process.env): string[] {
  const lock = from.HUB_TERM_IO_LOCK;
  return lock && path.isAbsolute(lock) ? ['flock', '-w', '300', lock, ...cmd] : cmd;
}

/** The environment of a gate child: the keep-list, NODE_ENV=test, and the network fence (net-policy guardEnv:
 *  BUN_OPTIONS preloads net-guard-runner.ts, NODE_OPTIONS imports net-guard-node.mjs; startup hooks dropped), so every
 *  Bun or Node process of the gate tree, at any depth, runs fenced. The caller's BUN_OPTIONS /
 *  NODE_OPTIONS are never passed on. */
export function childEnv(extra: Record<string, string> = {}, from: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(from)) if (v !== undefined && k !== 'NODE_OPTIONS' && k !== 'BUN_OPTIONS' && childKept(k, v)) out[k] = v;
  delete out.HUB_NET_FENCE;
  return guardEnv(HUB, { ...out, NODE_ENV: 'test', ...extra }) as Record<string, string>;
}
