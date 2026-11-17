// node-test-env.mjs: the Node/vitest test process's environment isolation,
// the counterpart of the Bun test fence's isolateEnvironment (test-net-guard.ts). Separate from network containment
// (net-guard-node.mjs): vitest-narrow.sh imports both, this one second:
//   NODE_OPTIONS="--import …/net-guard-node.mjs --import …/node-test-env.mjs"
// On import it
//   - drops every environment variable the test keep-list (net-policy.mjs ENV_KEEP, ENV_KEEP_PREFIXES, plus the web
//     tests' own knobs below) does not keep: a caller's tokens, profiles and URLs never reach a test or its children;
//   - points HOME_KEYS (HOME, XDG_*, HOODY_CONFIG_DIR) at one fresh empty directory under the hub's
//     .term-cache/test-homes, made by the first process (vitest itself) and removed when it exits; its children
//     (vitest workers, forks) inherit and reuse it;
//   - makes os.homedir() and os.userInfo().homedir answer that directory, named imports included (syncBuiltinESMExports);
//   - reuses an inherited HOME only when it is a real test home of this run (test-homes.mjs isTestHome, `inherit`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { envKept, HOME_KEYS, NODE_TEST_RULES, SECRETISH } from './net-policy.mjs';
import { isTestHome, makeTestHome, TEST_HOME_ROOT } from './test-homes.mjs';

export { TEST_HOME_ROOT };
/** The web tests' own knobs (settings, never credentials) and vitest's variables, kept on top of the shared list. */
// Named keys with value shapes, like the shared list. VITEST* are vitest's own
// worker variables (pool id, worker id, mode): short words or numbers.
const SHORT = /^[\w.,:/@+=-]{0,256}$/;
/** The Node test keep-list beyond ENV_RULES: net-policy NODE_TEST_RULES (one list for test processes and runner children). */
export { NODE_TEST_RULES };
export const NODE_TEST_KEEP = Object.freeze(Object.keys(NODE_TEST_RULES));
/** Whether a Node test process keeps this variable with this value. */
export const nodeTestKept = (k, v) => envKept(k, v) || (Object.hasOwn(NODE_TEST_RULES, k) && typeof v === 'string' && NODE_TEST_RULES[k](v));

/**
 * Isolates `env` (process.env by default) in place and returns the home directory. A HOME already inside `root` that
 * exists is reused (a child of an isolated process); else a new one is made and, when `own`, removed at exit.
 */
export function isolateNodeTestEnv(env = process.env, o = {}) {
  const root = o.root ?? TEST_HOME_ROOT;
  const inherited = isTestHome(env.HOME, root, { inherit: true }) ? env.HOME : '';
  for (const k of Object.keys(env)) if (!nodeTestKept(k, env[k])) delete env[k];
  let home = inherited;
  if (!home) home = makeTestHome(root, o.own !== false);
  for (const k of HOME_KEYS) env[k] = home;
  env.NODE_ENV = 'test';
  return home;
}

if (!globalThis.__hubNodeTestEnv) {
  const home = isolateNodeTestEnv();
  globalThis.__hubNodeTestEnv = home;
  Object.defineProperty(os, 'homedir', { configurable: true, writable: true, value: () => home });
  const userInfo = os.userInfo;
  Object.defineProperty(os, 'userInfo', { configurable: true, writable: true, value: (o) => ({ ...userInfo(o), homedir: home }) });
  syncBuiltinESMExports();
}
