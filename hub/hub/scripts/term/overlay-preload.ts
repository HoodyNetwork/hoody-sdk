// overlay-preload.ts: run term tests against overlay copies without touching the checkout (before/after proofs, A/B).
//   OVERLAY_DIR=<dir> OVERLAY_SRC=<hub>/src NODE_ENV=test \
//     bun test --preload ./scripts/term/overlay-preload.ts --preload ./scripts/term/test-preload.ts <files>
// This preload goes FIRST: test-preload.ts loads src modules (env, router globals, kit/ask), and a module loaded before the
// overlay keeps its live bytes. A covered module already loaded = refused (TERM_OVERLAY_LATE), never a silent live run.
// A read of <OVERLAY_SRC>/<rel> returns <OVERLAY_DIR>/<rel> (same tree layout) or <OVERLAY_DIR>/<rel with '/' -> '_'>
// (the flat layout workers used before this file) when that exists; every other read is unchanged. The term loader reads
// sources through fs.readFileSync, so imported modules are overlaid too.
// Loud, never silent: asked for (this preload given) and not usable = the run stops before any test (TERM_OVERLAY_*);
// active = one line on stderr naming the directory and file count; after the last test, an overlay with ANY file never read
// fails the run (exit 1, TERM_OVERLAY_UNUSED): that file's "proof" ran its live copy. OVERLAY_DIR and OVERLAY_SRC are kept
// through the test fence's environment scrub (ENV_RULES, net-policy.mjs: absolute paths only).
import fs from 'node:fs';
import path from 'node:path';

/** The overlay copy standing in for a read of `p` (absolute), or null. */
export function overlayFor(p: string, src: string, dir: string): string | null {
  if (!p.startsWith(src + '/')) return null;
  const rel = p.slice(src.length + 1);
  for (const c of [path.join(dir, rel), path.join(dir, rel.replace(/\//g, '_'))]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
}
/** Overlay files (relative to their dir) with no file under `src` to stand for, in either layout (same tree, or the flat
 *  name with '/' as '_'): such a file can never be read, so the run would test only live copies. */
export function overlayWithoutTarget(files: readonly string[], src: string): string[] {
  let flat: Set<string> | null = null;
  const isFile = (p: string): boolean => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  return files.filter((f) => {
    if (isFile(path.join(src, f))) return false;
    if (f.includes('/')) return true;
    flat ??= new Set((fs.readdirSync(src, { recursive: true }) as string[]).map((r) => r.replace(/\//g, '_')));
    return !flat.has(f);
  });
}
/** Overlay files (relative to `dir`) that no read was answered with. */
export function unreadOverlayFiles(files: readonly string[], used: ReadonlySet<string>, dir: string): string[] {
  return files.filter((f) => !used.has(path.join(dir, f)));
}
/** Loaded module paths (require.cache keys) the overlay covers: those already hold the live bytes. */
export function loadedTooLate(loaded: readonly string[], src: string, dir: string): string[] {
  return loaded.filter((k) => overlayFor(k, src, dir) !== null);
}

const refuse = (code: string, what: string): never => {
  process.stderr.write(`overlay: refused: ${code} (${what})\n`);
  process.exit(3);
};
const dir = process.env.OVERLAY_DIR ?? '';
const src = (process.env.OVERLAY_SRC ?? '').replace(/\/+$/, '');
if (!dir || !src) refuse('TERM_OVERLAY_NOT_SET', 'set OVERLAY_DIR and OVERLAY_SRC, or drop this preload');
const isDir = (p: string): boolean => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
if (!path.isAbsolute(dir) || !isDir(dir)) refuse('TERM_OVERLAY_DIR', 'OVERLAY_DIR is not an absolute directory');
if (!path.isAbsolute(src) || !isDir(src)) refuse('TERM_OVERLAY_SRC', 'OVERLAY_SRC is not an absolute directory');
const files = (fs.readdirSync(dir, { recursive: true }) as string[]).filter((f) => fs.statSync(path.join(dir, f)).isFile());
if (!files.length) refuse('TERM_OVERLAY_EMPTY', 'OVERLAY_DIR holds no file');
const stray = overlayWithoutTarget(files, src);
if (stray.length) refuse('TERM_OVERLAY_NO_TARGET', `${stray.length} overlay file(s) stand for no file under OVERLAY_SRC, first ${stray[0]} `
  + `(OVERLAY_DIR must mirror OVERLAY_SRC: with OVERLAY_SRC=<hub>/src, <dir>/term/prim/focus.ts overlays src/term/prim/focus.ts)`);

const real = fs.readFileSync;
const used = new Set<string>();
const alt = (p: string): string | null => overlayFor(p, src, dir);
const late = loadedTooLate(Object.keys(require.cache), src, dir);
if (late.length) refuse('TERM_OVERLAY_LATE', `${late.length} overlaid module(s) already loaded with live bytes, first ${late[0]}: `
  + 'give --preload ./scripts/term/overlay-preload.ts BEFORE --preload ./scripts/term/test-preload.ts');
(fs as unknown as { readFileSync: unknown }).readFileSync = function readFileSync(p: unknown, ...rest: unknown[]) {
  const a = typeof p === 'string' ? alt(path.resolve(p)) : null;
  if (a) used.add(a);
  return (real as (...x: unknown[]) => unknown).call(fs, a ?? p, ...rest);
};
process.stderr.write(`overlay: active, ${files.length} file(s) from ${dir} over ${src}\n`);
// After the last test (a global hook from this preload): EVERY overlay file must have been read, else that file's proof
// ran its live copy.
const { afterAll } = await import('bun:test');
afterAll(() => {
  const unread = unreadOverlayFiles(files, used, dir);
  if (unread.length === 0) return;
  throw new Error(`overlay: refused: TERM_OVERLAY_UNUSED (${unread.length} of the ${files.length} overlay file(s) never read, first `
    + `${unread[0]}: this run tested its live copy; drop it from OVERLAY_DIR or run a test that loads it)`);
});
