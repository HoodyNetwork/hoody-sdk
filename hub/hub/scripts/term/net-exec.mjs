// net-exec.mjs: which files a fenced runner may start. The guards (test-net-guard.ts for
// Bun, net-guard-node.mjs for Node) judge the ACTUAL executable of every child, never its name: net-policy.mjs
// spawnVerdict asks `resolve` for the file the OS would run and checks it against the trusted sets made here.
// Trusted, fixed when the guard installs (from the guard process's own PATH, so a child's env cannot widen them):
//   runtimes  this process's runtime (process.execPath) and the `bun` and `node` the PATH names
//   tools     `nice`, `flock`, `bash`, `sh` as the PATH names them
// Every path is real (symlinks followed). Plain JavaScript: Node loads it without a transpiler.
import fs from 'node:fs';
import path from 'node:path';

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/** The real file `prog` names: a path against `cwd`, a bare name on `PATH` (first executable hit); null if none. */
export function resolveExecutable(prog, cwd = process.cwd(), PATH = process.env.PATH ?? '') {
  const p = String(prog ?? '');
  if (!p) return null;
  if (p.includes('/')) { const abs = path.resolve(cwd, p); return isFile(abs) ? real(abs) : null; }
  for (const dir of PATH.split(':')) {
    if (!dir) continue;
    const c = path.join(path.isAbsolute(dir) ? dir : path.resolve(cwd, dir), p);
    try { fs.accessSync(c, fs.constants.X_OK); } catch { continue; }
    if (isFile(c)) return real(c);
  }
  return null;
}

/** The trusted executables of this process (call once, when the guard installs). */
export function trustedExecutables(PATH = process.env.PATH ?? '', execPath = process.execPath) {
  const pick = (names) => new Set(names.map((n) => resolveExecutable(n, '/', PATH)).filter(Boolean));
  const runtimes = pick(['bun', 'node']);
  const self = real(execPath);
  if (self) runtimes.add(self);
  return { runtimes, tools: pick(['nice', 'flock', 'bash', 'sh']) };
}

/** The `exe` argument of spawnVerdict for one child: resolution with the child's own cwd and PATH. */
export function exeContext(trusted, opts = {}) {
  const env = opts.env && typeof opts.env === 'object' ? opts.env : process.env;
  const cwd = opts.cwd ? String(opts.cwd) : process.cwd();
  return { runtimes: trusted.runtimes, tools: trusted.tools, resolve: (prog) => resolveExecutable(prog, cwd, env.PATH ?? '') };
}
