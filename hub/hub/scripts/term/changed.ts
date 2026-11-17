// changed.ts: what a change touches, for `check.ts --changed` (no version control needed: content hashes).
//   treeHashes()        content hash of every source file under src/ and scripts/term/ (code, styles, JSON)
//   changedFiles(a, b)  the files whose hash differs between two such maps (added and removed included)
//   scopeOf(changed)    the changed files, their importers (two levels, never through a barrel), and the terminal
//                       tests among them or beside them
// Importers are found by text first (a file naming the changed file's stem), then confirmed by resolving its import
// specifiers with the terminal and the web resolution (resolve.ts), so a mention in a comment is not an importer.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { HUB, termResolver } from './resolve';

const SOURCE = /\.(tsx?|mts|cts|js|mjs|cjs|css|scss|json)$/;
const CODE = /\.(tsx?|mts|cts|js|mjs|cjs)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.term-cache', '__golden__', 'goldens']);
/** Barrels: re-export everything, so "imports the barrel" says nothing about one module (pages' closures do). */
export const BARRELS = new Set(['src/kit/index.ts', 'src/core/index.ts', 'src/core/index.live.ts', 'src/core/index.fixtures.ts', 'src/term/kit/index.ts', 'src/term/prim/index.ts']);
const TEST = /\.term\.test\.(ts|tsx)$/;

function walk(dir: string, out: string[]): void {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.') || SKIP_DIR.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.isFile() && SOURCE.test(e.name)) out.push(f);
  }
}

/** Every source file of the hub that the gates read, relative to hub/. */
export function sourceFiles(hub: string = HUB): string[] {
  const out: string[] = [];
  walk(path.join(hub, 'src'), out);
  walk(path.join(hub, 'scripts', 'term'), out);
  return out.map((f) => path.relative(hub, f).split(path.sep).join('/')).sort();
}

export function treeHashes(hub: string = HUB): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of sourceFiles(hub)) {
    try { out[f] = Bun.hash(fs.readFileSync(path.join(hub, f))).toString(36); } catch { /* vanished mid-walk */ }
  }
  return out;
}

export function changedFiles(before: Record<string, string>, now: Record<string, string>): string[] {
  const out = new Set<string>();
  for (const [f, h] of Object.entries(now)) if (before[f] !== h) out.add(f);
  for (const f of Object.keys(before)) if (!(f in now)) out.add(f);
  return [...out].sort();
}

const stemOf = (rel: string): string => path.basename(rel).replace(/\.(term\.)?(test\.)?(tsx?|mts|cts|js|mjs|cjs|module\.css|module\.scss|css|scss|json)$/, '');

/** The files that import one of `targets` (directly), confirmed by resolution. */
export function directImporters(targets: ReadonlySet<string>, files: readonly string[], hub: string = HUB, read: (rel: string) => string = (r) => fs.readFileSync(path.join(hub, r), 'utf8')): Set<string> {
  const stems = [...new Set([...targets].map(stemOf))].filter((s) => s.length > 0);
  const out = new Set<string>();
  if (!stems.length) return out;
  const absTargets = new Set([...targets].map((t) => path.join(hub, t)));
  for (const f of files) {
    if (!CODE.test(f) || targets.has(f)) continue;
    let text: string;
    try { text = read(f); } catch { continue; }
    // index files are imported by their directory name.
    if (!stems.some((s) => text.includes(s === 'index' ? '/' : s))) continue;
    const abs = path.join(hub, f);
    for (const imp of ts.preProcessFile(text, true, true).importedFiles) {
      let hit = false;
      for (const r of [termResolver.resolve(imp.fileName, abs, { typeOnly: true }), termResolver.resolveWeb(imp.fileName, abs)]) {
        const p = 'path' in r && typeof r.path === 'string' ? r.path : r.kind === 'twin' ? r.base : null;
        if (p && absTargets.has(p)) { hit = true; break; }
      }
      if (hit) { out.add(f); break; }
    }
  }
  return out;
}

export interface Scope {
  changed: string[];
  /** Changed files plus their importers (two levels; barrels are not walked through). */
  files: string[];
  /** Terminal test files to run: those in `files`, plus `X.term.test.*` beside a changed `X.*`. */
  tests: string[];
}

export function scopeOf(changed: readonly string[], hub: string = HUB): Scope {
  const files = sourceFiles(hub);
  const all = new Set(files);
  const present = changed.filter((f) => all.has(f));
  const scope = new Set(present);
  let frontier = new Set(present.filter((f) => !BARRELS.has(f)));
  for (let level = 0; level < 2 && frontier.size; level++) {
    const next = directImporters(frontier, files, hub);
    frontier = new Set([...next].filter((f) => !scope.has(f) && !BARRELS.has(f)));
    for (const f of next) scope.add(f);
  }
  const tests = new Set([...scope].filter((f) => TEST.test(f)));
  for (const f of present) {
    const dir = path.posix.dirname(f);
    const stem = stemOf(f);
    for (const ext of ['tsx', 'ts']) { const t = `${dir}/${stem}.term.test.${ext}`; if (all.has(t)) tests.add(t); }
  }
  return { changed: [...changed].sort(), files: [...scope].sort(), tests: [...tests].sort() };
}
