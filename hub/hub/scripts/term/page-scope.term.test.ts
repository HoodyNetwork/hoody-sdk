import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { mutantProblems, pageScopeOf, webScenarioProblems } from './page-scope';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `page-scope-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));
const put = (rel: string, text = 'x\n'): void => { fs.mkdirSync(path.dirname(path.join(TMP, rel)), { recursive: true }); fs.writeFileSync(path.join(TMP, rel), text); };

test('--page scope: own tests, own and closure scenario files, typecheck roots of the closure', () => {
  for (const f of ['src/pages/p/view.tsx', 'src/pages/p/parts/A.term.tsx', 'src/pages/p/parts/A.scenario.ts', 'src/pages/p/parts/A.term.test.tsx',
    'src/kit/B.tsx', 'src/kit/B.term.tsx', 'src/kit/B.scenario.ts', 'src/kit/C.tsx', 'src/kit/C.scenario.ts', 'src/kit/D.tsx', 'src/kit/D.scenario.ts', 'src/kit/E.term.test.tsx']) put(f);
  const s = pageScopeOf(TMP, 'p', ['src/pages/p/view.tsx', 'src/kit/B.term.tsx', 'src/kit/C.tsx', 'scripts/term/x.ts']);
  expect(s.scenarios).toEqual(['src/kit/B.scenario.ts', 'src/kit/C.scenario.ts', 'src/pages/p/parts/A.scenario.ts']);
  expect(s.tests).toEqual(['src/pages/p/parts/A.term.test.tsx']);
  expect(s.roots).toEqual(['src/kit/B.term.tsx', 'src/pages/p/parts/A.term.test.tsx', 'src/pages/p/parts/A.term.tsx']);
  // Never run: the page folder only.
  expect(pageScopeOf(TMP, 'p', null).scenarios).toEqual(['src/pages/p/parts/A.scenario.ts']);
});

test('web scenario output: failures named, a green run with no case fails, a red exit never passes', () => {
  expect(webScenarioProblems(' Test Files  1 passed (1)\n      Tests  12 passed (12)\n', 0)).toEqual([]);
  expect(webScenarioProblems(' Test Files  1 passed (1)\n      Tests  no tests\n', 0)[0]!.message).toContain('no case run');
  const f = webScenarioProblems(' × Button (/src/kit/controls/Button.scenario.ts) > presses once 12ms\n      Tests  1 failed | 3 passed (4)\n', 1);
  expect(f[0]!.file).toBe('src/kit/controls/Button.scenario.ts');
  expect(f[0]!.message).toBe('web: Button: presses once');
  expect(webScenarioProblems('Error: config\n', 1)[0]!.message).toStartWith('exit 1');
});

test('mutant output: a survivor and an error fail with their component; killed ones pass', () => {
  const out = 'Button  scenarios 3  term 3/3  web not run\n    mutant disabled: killed by 2 (disabled stops presses)\n    mutant onPress: SURVIVED\nField  scenarios 1  term 1/1  web not run\n    mutant readOnly: ERROR baseline failed\n';
  const p = mutantProblems(out, 1);
  expect(p.map((x) => x.message)).toEqual(['Button: mutant onPress survived (no scenario notices the prop is ignored)', 'Field: mutant readOnly ERROR baseline failed']);
  expect(mutantProblems('Button  scenarios 3\n    mutant disabled: killed by 1 (x)\n', 0)).toEqual([]);
});

test('mutant output as scenarios.ts prints it: a survivor with its "-> add a case" hint is named, not the last lines', () => {
  const out = [
    'EnvRows  scenarios 8  term 8/8  web not run',
    '    mutant help: killed by 1 (EnvRows: helpBelow still shows the help)',
    '    mutant legend: SURVIVED -> add a case to src/kit/forms/EnvRows.scenario.ts that sets legend and expects what it changes (calls, nodes or focus)',
    'NavPending  scenario has no terminal result (src/shell/pageHost.term.tsx)',
    '3 components, 29 cases, 1 failing, 1.0 s',
  ].join('\n');
  const p = mutantProblems(out, 1);
  expect(p.map((x) => x.message)).toEqual(['EnvRows: mutant legend survived (no scenario notices the prop is ignored)']);
  expect(p[0]!.file).toBe('EnvRows');
});
