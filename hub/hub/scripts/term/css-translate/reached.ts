// The source files the terminal build loads, for the report's "reached" split (report.ts, refs.ts): the terminal
// import graph (graph/build.ts, terminal resolution: a `.term` sibling replaces its base file) walked from the
// terminal entry and every page's page.ts, dynamic imports followed. Static: a file that is loaded and never drawn
// still counts.
import fs from 'node:fs';
import path from 'node:path';
import { ModuleGraph } from '../graph/build';
import { reachAll } from '../graph/rules';
import { readStrictGlobals } from '../graph/scan';

/** Paths relative to `src` of every file the terminal reaches. `src` is `<hub>/src`. */
export function terminalReached(src: string): Set<string> {
  const hub = path.dirname(path.resolve(src));
  const globalsFile = path.join(hub, 'src/term/env/strict-globals.ts');
  const globals = readStrictGlobals(fs.existsSync(globalsFile) ? fs.readFileSync(globalsFile, 'utf8') : null);
  const g = new ModuleGraph({ hub, scan: { globals }, handoff: new Set() });
  const pagesDir = path.join(hub, 'src/pages');
  const entries = ['src/term/entry.ts'];
  if (fs.existsSync(pagesDir)) for (const d of fs.readdirSync(pagesDir).sort()) if (fs.existsSync(path.join(pagesDir, d, 'page.ts'))) entries.push(`src/pages/${d}/page.ts`);
  const starts = [...new Set(entries.filter((e) => g.mods.has(e)).flatMap((e) => g.whole('term', g.termOf(e))))];
  const out = new Set<string>();
  for (const id of reachAll(g, starts).visited) if (id.startsWith('src/')) out.add(id.slice(4));
  return out;
}
