// The compiled terminal Hub's launcher: a `bun build --compile` executable extracts the
// embedded native library into $TMPDIR when the engine loads it, and Bun leaves it there. The launcher first re-runs
// the same executable as a child with TMPDIR set to a fresh private directory (0700), waits for it and removes that
// directory, so nothing is left in, or read from, a shared temp directory. The child (marker set) runs the Hub.
//
// The engine must not load in the parent: callers pass the Hub as a dynamic import (`() => import('./hub-term.js')`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HubCacheError, cacheStartError } from './hub-cache';

export const PRIVATE_TMP_MARKER = 'HUB_TERM_PRIVATE_TMP';
const FORWARD: NodeJS.Signals[] = ['SIGTERM', 'SIGHUP', 'SIGQUIT'];

/** The child's environment: every temp directory variable points into `dir`. Bun reads BUN_TMPDIR before TMPDIR
 *  (it reads BUN_TMPDIR first), so an inherited BUN_TMPDIR would otherwise send the extracted library to a shared directory. */
export function privateTmpEnv(env: Record<string, string | undefined>, dir: string): Record<string, string | undefined> {
  return { ...env, TMPDIR: dir, BUN_TMPDIR: dir, [PRIVATE_TMP_MARKER]: dir };
}

/** In the child: runs `main` and exits with its code. In the parent: runs the child in a private TMPDIR, forwards the
 *  termination signals (SIGINT reaches the child through the terminal's process group), removes the directory and
 *  exits with the child's code (128 + signal number when it was killed). */
export async function runInPrivateTmp(main: () => Promise<number>, o: { base?: string } = {}): Promise<never> {
  const mine = process.env[PRIVATE_TMP_MARKER];
  if (mine && process.env.TMPDIR === mine) process.exit(await main());
  let dir = '';
  try {
    dir = fs.mkdtempSync(path.join(o.base ?? os.tmpdir(), 'hub-term-'));
    fs.chmodSync(dir, 0o700);
  } catch {
    // A full disk, a temp directory this user cannot write: a fixed line (never the path) and the cache's exit code.
    if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* left as it was made */ } }
    process.stderr.write(cacheStartError(new HubCacheError('TERM_HUB_CACHE_UNWRITABLE', 'a private temporary directory cannot be created; set TMPDIR to a directory you can write')));
    process.exit(70);
  }
  let code = 1;
  try {
    // A compiled executable's argv[0] is the executable and argv[1] its own path in the embedded file system: pass on
    // only the user's arguments.
    const child = Bun.spawn({
      cmd: [process.execPath, ...process.argv.slice(2)],
      env: privateTmpEnv(process.env, dir),
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    const forward = (s: NodeJS.Signals) => () => { try { child.kill(s); } catch { /* already gone */ } };
    const handlers = FORWARD.map((s) => [s, forward(s)] as const);
    for (const [s, h] of handlers) process.on(s, h);
    process.on('SIGINT', () => { /* the child gets it from the terminal; the parent waits to clean up */ });
    code = await child.exited;
    if (child.signalCode) code = 128 + (os.constants.signals[child.signalCode as NodeJS.Signals] ?? 0);
    for (const [s, h] of handlers) process.off(s, h);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(code);
}
