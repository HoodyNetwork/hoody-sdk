// Build-time translator: CSS-module class → terminal (OpenTUI/Yoga) flexbox style, for the Hub's terminal build.
//
//   bun hub/scripts/term/css-translate.ts --out <file.json> [--report <file.md>] [--width narrow|medium|wide|<cols>]
//
// Input: every *.module.css under hub/src, plus hub/src/kit/tokens.css for var() values (dark theme, the width class's
// @media blocks; accent/density/perf/toolbar-size attribute variants ignored and listed in the report).
// Output: a Table (css-translate/types.ts) keyed by class id `<path relative to hub/src>#<class>`:
//   { style: OpenTUI layout props in cells, text?: {fg, bg, bold, ...}, border?, hidden?, contents?, grid?,
//     variants?: conditional deltas, notes?, status, outcomes: per-declaration diagnostics }
// Colours keep their token (`token:--hx-muted`); the runtime maps tokens to terminal roles per colour tier.
//
// The unit model is css-translate/units.ts (one constants block, documented there); the selector policy is
// css-translate/selectors.ts; the grid policy css-translate/grid.ts; query evaluation css-translate/queries.ts.
//
// Library (node, build time):
//   buildTable({ width? }) → { table, results, tokens }      build in memory
//   loadTable(file) / useTable(table)                        set the table styleOf() reads
//   styleOf(classId) → ClassEntry | undefined                (builds the default table on first use if none was set)
//   moduleExports(cssPath) → { local: classId }              what a CSS-module import evaluates to (parses the CSS only)
//   cssModuleSource(cssPath) → 'export default {…};'         the same as module source, for a Vite `load` hook
// Runtime (no node imports): css-translate/lookup.ts createStyleLookup(table).
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { HUB_SRC, buildTable } from './css-translate/table';

// The library lives in css-translate/table.ts (no test boundary there: the live launcher imports it). Importers of this
// file keep every name.
export * from './css-translate/table';

function arg(name: string, argv: string[]): string | undefined {
  const i = argv.indexOf(name);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}

async function main(argv: string[]): Promise<number> {
  const out = arg('--out', argv);
  const report = arg('--report', argv);
  if (!out) {
    process.stderr.write('usage: bun hub/scripts/term/css-translate.ts --out <file.json> [--report <file.md>] [--width narrow|medium|wide|<cols>] [--src <hub/src>]\n');
    return 2;
  }
  const src = arg('--src', argv) ?? HUB_SRC;
  const build = buildTable({ src, width: arg('--width', argv) });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(build.table) + '\n');
  const n = Object.keys(build.table.classes).length;
  process.stdout.write(`css-translate: ${build.results.length} modules, ${n} classes → ${out}\n`);
  if (report) {
    const { writeReport } = await import('./css-translate/report');
    // The files the terminal loads, so the report can say which losses the terminal ever meets (reached.ts).
    const { terminalReached } = await import('./css-translate/reached');
    fs.mkdirSync(path.dirname(path.resolve(report)), { recursive: true });
    fs.writeFileSync(report, writeReport(build, src, terminalReached(src)));
    process.stdout.write(`css-translate: report → ${report}\n`);
  }
  return 0;
}

if ((import.meta as { main?: boolean }).main) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      process.stderr.write(`css-translate: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
      process.exit(1);
    },
  );
}
