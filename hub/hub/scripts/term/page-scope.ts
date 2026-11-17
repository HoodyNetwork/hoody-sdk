// page-scope.ts: what `check.ts --page <id>` checks beyond the page's goldens. The page's closure is the files its last
// golden run loaded (goldens.ts pageClosure); the scope is:
//   scenarios  the page's own *.scenario.ts, plus the scenario file beside every file of the closure (X.scenario.ts for
//              X.tsx or X.term.tsx), so a kit component the page draws brings its scenarios
//   tests      the page's own *.term.test.ts(x)
//   roots      typecheck roots: those tests, the page's .term files, every .term file of the closure under src/
// And the parsers of the two runner outputs check.ts reads (web vitest run, scenarios.ts --mutants).
import fs from 'node:fs';
import path from 'node:path';
import type { Problem } from './goldens';

export interface PageScope { closure: string[] | null; scenarios: string[]; tests: string[]; roots: string[] }

export function pageScopeOf(hub: string, id: string, closure: readonly string[] | null): PageScope {
  const dir = `src/pages/${id}/`;
  const own = (g: string): string[] => [...new Bun.Glob(`${dir}**/${g}`).scanSync(hub)].sort();
  const scen = new Set(own('*.scenario.ts'));
  for (const f of closure ?? []) {
    const t = f.replace(/(\.term)?\.(tsx?|mts)$/, '.scenario.ts');
    if (t !== f && fs.existsSync(path.join(hub, t))) scen.add(t);
  }
  const tests = [...own('*.term.test.ts'), ...own('*.term.test.tsx')].sort();
  const roots = new Set([...tests, ...own('*.term.ts'), ...own('*.term.tsx')]);
  for (const f of closure ?? []) if (/\.term\.tsx?$/.test(f) && f.startsWith('src/')) roots.add(f);
  return { closure: closure ? [...closure] : null, scenarios: [...scen].sort(), tests, roots: [...roots].sort() };
}

const WEB_TEST = 'src/term/scenario/scenarios.web.test.ts';
const WEB_FIX = '`HUB_SCENARIO=<file> /bin/bash -p scripts/term/vitest-narrow.sh hub/src/term/scenario/scenarios.web.test.ts` in a gate slot (docs: src/term/docs/scenarios.md).';

/** Problems of a web scenario run (vitest output, ANSI already stripped). Fails closed: a green run with no case. */
export function webScenarioProblems(out: string, code: number): Problem[] {
  const problems: Problem[] = [];
  for (const m of out.matchAll(/^\s*(?:×|FAIL|✗)\s+(?:\S*scenarios\.web\.test\.ts > )?(.+?) > (.+?)(?: \d+ms)?$/gm)) {
    problems.push({ file: /\((\/?src\/[^)]+)\)/.exec(m[1]!)?.[1]?.replace(/^\//, '') ?? WEB_TEST, rule: 'web-scenario', message: `web: ${m[1]!.replace(/ \(.*\)$/, '')}: ${m[2]}`, fix: WEB_FIX });
  }
  const passed = Number(/Tests\s+(\d+) passed/.exec(out)?.[1] ?? 0);
  if (code === 0 && passed === 0) problems.push({ file: WEB_TEST, rule: 'web-scenario', message: 'the web runner passed with no case run', fix: 'Check HUB_SCENARIO matches the scenario files (docs: src/term/docs/scenarios.md).' });
  if (code !== 0 && !problems.length) problems.push({ file: WEB_TEST, rule: 'web-scenario', message: `exit ${code}: ${out.trim().split('\n').slice(-3).join(' | ')}`, fix: 'Run the web scenarios alone (vitest-narrow.sh) and read the output.' });
  return problems;
}

/** Problems of `scenarios.ts --mutants`: every mutant that survived or errored, named with its component. */
export function mutantProblems(out: string, code: number): Problem[] {
  const problems: Problem[] = [];
  let comp = '';
  for (const l of out.split('\n')) {
    const c = /^(\S+)  scenarios \d+/.exec(l);
    if (c) comp = c[1]!;
    // scenarios.ts prints a survivor as "SURVIVED -> add a case to ...": the hint after SURVIVED is not part of the verdict.
    const m = /^ {4}mutant (\S+): (SURVIVED(?= ->|$)|ERROR .*?)(?: -> .*)?$/.exec(l);
    if (m) problems.push({ file: comp || 'scripts/term/scenarios.ts', rule: 'mutant', message: `${comp}: mutant ${m[1]} ${m[2] === 'SURVIVED' ? 'survived (no scenario notices the prop is ignored)' : m[2]}`, fix: `Add a scenario case that fails when ${m[1]} is ignored: \`NODE_ENV=test bun scripts/term/scenarios.ts --mutants ${comp}\` (docs: src/term/docs/scenarios.md).` });
  }
  if (code !== 0 && !problems.length) problems.push({ file: 'scripts/term/scenarios.ts', rule: 'mutant', message: `exit ${code}: ${out.trim().split('\n').slice(-3).join(' | ')}`, fix: '`NODE_ENV=test bun scripts/term/scenarios.ts --mutants` and read its output.' });
  return problems;
}
