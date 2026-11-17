// test-homes.mjs: the isolated HOME directories of test processes (Bun: test-net-guard.ts isolateEnvironment; Node:
// node-test-env.mjs), one place. A home is `home-<owner pid>-<random>` under hub/.term-cache/test-homes. Its owner
// removes it at exit; a process that dies first (killed, timed out) leaves it, so every new home first sweeps the
// stale ones: older than STALE_MS AND whose owner pid is not alive (a name without a pid: age alone).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** Where the isolated homes live (never the top level of /tmp). */
export const TEST_HOME_ROOT = path.join(HUB, '.term-cache', 'test-homes');
export const STALE_MS = 60 * 60 * 1000;

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };
/** The owner pid in a home's name, or null (older names had none). */
export const ownerOf = (name) => { const m = /^home-(\d+)-/.exec(name); return m ? Number(m[1]) : null; };
const removeTree = (p) => fs.rmSync(p, { recursive: true, force: true });

/** Removes stale homes under `root`; returns the names removed. Never throws; only `home-*` directories. */
export function sweepStaleHomes(root = TEST_HOME_ROOT, now = Date.now(), isAlive = alive) {
  const gone = [];
  let names = [];
  try { names = fs.readdirSync(root); } catch { return gone; }
  for (const n of names) {
    if (!n.startsWith('home-')) continue;
    const p = path.join(root, n);
    try {
      const st = fs.lstatSync(p);
      if (!st.isDirectory() || now - st.mtimeMs < STALE_MS) continue;
      const pid = ownerOf(n);
      if (pid !== null && pid !== process.pid && isAlive(pid)) continue;
      removeTree(p);
      gone.push(n);
    } catch { /* raced with its owner or another sweep */ }
  }
  return gone;
}

/** A new empty home for this process (stale ones swept first), removed when the process exits when `own`. */
export function makeTestHome(root = TEST_HOME_ROOT, own = true) {
  fs.mkdirSync(root, { recursive: true });
  sweepStaleHomes(root);
  const home = fs.mkdtempSync(path.join(root, `home-${process.pid}-`));
  if (own) process.on('exit', () => { try { removeTree(home); } catch { /* best effort */ } });
  return home;
}

/** This process and its ancestors, nearest first (from /proc; at most 64). */
export function ancestors(pid = process.pid) {
  const out = [];
  for (let p = pid, n = 0; p > 1 && n < 64; n++) {
    out.push(p);
    let stat;
    try { stat = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); } catch { break; }
    const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    if (!Number.isInteger(ppid) || ppid <= 0) break;
    p = ppid;
  }
  return out;
}

/**
 * Whether `p` is a test home under `root` that this process may use: a real directory (no symlink,
 * lexically AND by real path directly under the root), named `home-<pid>-<random>`, owned by this uid and writable by
 * no one else. With `inherit` (a child reusing its parent's home), its owner pid must also be this process or one of
 * its ancestors: a HOME pointing at another run's directory is not reused.
 */
export function isTestHome(p, root = TEST_HOME_ROOT, o = {}) {
  if (!p || typeof p !== 'string') return false;
  try {
    const name = path.basename(p);
    if (!/^home-\d+-[A-Za-z0-9]+$/.test(name) || path.dirname(p) !== root) return false;
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink() || !st.isDirectory()) return false;
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return false;
    if ((st.mode & 0o022) !== 0) return false;
    if (fs.realpathSync(p) !== path.join(fs.realpathSync(root), name)) return false;
    if (o.inherit && !ancestors().includes(ownerOf(name))) return false;
    return true;
  } catch { return false; }
}
