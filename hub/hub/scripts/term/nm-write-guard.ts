// nm-write-guard.ts: proves a run in this tree writes nothing into node_modules when node_modules resolves outside the
// repo (a working copy linked to another tree's node_modules: a write there is a write into that tree).
//   NODE_ENV=test bun scripts/term/nm-write-guard.ts [--page <id>]
// Runs, with no HUB_CACHE_DIR / HUB_WORK_DIR set (the defaults are what is proven): one narrow web vitest file through
// lib.ts runTool (the path hub:check's vitest step takes), then the page gate on one page (goldens.ts --page, check
// mode, default api). Then lists every file under the real node_modules' cache dirs (.vite-temp, .vite, .vite-hub,
// .vite-hub-build, .cache) and node_modules itself (top level) changed since the start. Exit 1 when any changed.
// Another process sharing that node_modules can write there at the same time: the paths are printed, read them.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { API_ROOT, HUB, nodeModulesOutside, runToolCapture } from '../lib';

const CACHE_DIRS = ['.vite-temp', '.vite', '.vite-hub', '.vite-hub-build', '.cache'];

/** Files and directories under the cache dirs of `nm` (and nm's own entries) modified at or after `since` (ms). */
export function changedUnder(nm: string, since: number): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number): void => {
    let es: fs.Dirent[];
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      let st: fs.Stats;
      try { st = fs.lstatSync(p); } catch { continue; }
      if (st.mtimeMs >= since) out.push(p);
      if (e.isDirectory() && depth < 12) walk(p, depth + 1);
    }
  };
  try { if (fs.statSync(nm).mtimeMs >= since) out.push(nm + path.sep); } catch { /* none */ }
  for (const c of CACHE_DIRS) {
    const d = path.join(nm, c);
    try { if (fs.lstatSync(d).mtimeMs >= since) out.push(d); } catch { continue; }
    walk(d, 0);
  }
  return [...new Set(out)].sort();
}

async function main(): Promise<number> {
  if (!nodeModulesOutside()) { process.stdout.write('nm-write-guard: node_modules is inside this repo; nothing to prove.\n'); return 0; }
  const nm = fs.realpathSync(path.join(API_ROOT, 'node_modules'));
  const page = process.argv.includes('--page') ? process.argv[process.argv.indexOf('--page') + 1]! : 'api';
  const env = { ...process.env, NODE_ENV: 'test' } as Record<string, string | undefined>;
  for (const k of ['HUB_CACHE_DIR', 'HUB_WORK_DIR']) delete env[k];
  for (const k of Object.keys(process.env)) if (k === 'HUB_CACHE_DIR' || k === 'HUB_WORK_DIR') delete process.env[k];
  const since = Date.now() - 1000;
  process.stdout.write(`nm-write-guard: node_modules -> ${nm}\n  web: hub/src/core/registry.test.ts (lib.ts runTool vitest)\n`);
  const web = await runToolCapture('vitest', ['run', '--config', path.join(HUB, 'vite.config.mts'), 'hub/src/core/registry.test.ts'], { NODE_ENV: 'test' });
  process.stdout.write(`  web exit ${web.code}\n  page gate: goldens.ts --page ${page}\n`);
  const g = Bun.spawnSync(['bun', path.join(HUB, 'scripts/term/goldens.ts'), '--page', page], { cwd: HUB, env, stdout: 'pipe', stderr: 'pipe', timeout: 1_800_000 });
  process.stdout.write(`  page gate exit ${g.exitCode}\n`);
  const changed = changedUnder(nm, since);
  if (changed.length) {
    process.stdout.write(`FAIL: ${changed.length} paths under ${nm} changed during the run:\n${changed.slice(0, 40).map((p) => `   ${p}`).join('\n')}\n`);
    return 1;
  }
  if (web.code !== 0) { process.stdout.write(`FAIL: the web run itself failed (exit ${web.code}), so it proves nothing:\n${web.output.split('\n').slice(-8).join('\n')}\n`); return 1; }
  process.stdout.write('ok: nothing under node_modules changed\n');
  return 0;
}

if (import.meta.main) process.exit(await main());
