// check-args.ts: check.ts reads every argument or refuses it; --scenario narrows the scenario gates
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { argProblems, matchScenarios, scenarioScope } from './check-args';

const HUB = path.resolve(import.meta.dir, '../..');

test('a bare word is refused, with the --scenario spelling', () => {
  expect(argProblems(['--only', 'web-scenarios', 'SegmentedControl'])).toEqual(['unexpected argument "SegmentedControl" (a scenario filter is `--scenario SegmentedControl`; check.ts reads no bare words)']);
  expect(argProblems(['--only', 'web-scenarios', '--scenario', 'SegmentedControl'])).toEqual([]);
});

test('flags: values taken, unknown flags and missing values refused, --changed list optional', () => {
  expect(argProblems(['--page', 'keys', '--update', '--jobs', '2', '--json', 'o.json', '--skip', 'kit'])).toEqual([]);
  expect(argProblems(['--changed', 'a.ts,b.ts', '--record'])).toEqual([]);
  expect(argProblems(['--changed', '--only', 'tests'])).toEqual([]);
  expect(argProblems(['--scenarios', 'x'])).toEqual(['unknown flag --scenarios', 'unexpected argument "x" (a scenario filter is `--scenario x`; check.ts reads no bare words)']);
  expect(argProblems(['--page'])).toEqual(['--page needs a value']);
  expect(argProblems(['--only', '--update'])).toEqual(['--only needs a value']);
});

test('scenario matching: component name, path, path ending; an unmatched name is reported', () => {
  const all = ['src/kit/controls/SegmentedControl.scenario.ts', 'src/kit/controls/Button.scenario.ts', 'src/pages/keys/parts/KeyRow.scenario.ts'];
  expect(matchScenarios(all, ['SegmentedControl'])).toEqual({ files: ['src/kit/controls/SegmentedControl.scenario.ts'], unmatched: [] });
  expect(matchScenarios(all, ['src/pages/keys/parts/KeyRow.scenario.ts', 'Nope'])).toEqual({ files: ['src/pages/keys/parts/KeyRow.scenario.ts'], unmatched: ['Nope'] });
  expect(matchScenarios(all, ['controls/']).files).toEqual(['src/kit/controls/Button.scenario.ts', 'src/kit/controls/SegmentedControl.scenario.ts']);
});

test('scope x pick: the pick narrows a scope, never widens it', () => {
  expect(scenarioScope(null, null)).toBeNull();
  expect(scenarioScope(null, ['a'])).toEqual(['a']);
  expect(scenarioScope(['a', 'b'], null)).toEqual(['a', 'b']);
  expect(scenarioScope(['a', 'b'], ['b', 'c'])).toEqual(['b']);
});

test('check.ts refuses the bare word before running any gate', () => {
  // No subprocess under the test fence: the CLI's order is pinned instead (validation before the first gate).
  const src = fs.readFileSync(path.join(HUB, 'scripts/term/check.ts'), 'utf8');
  const at = src.indexOf('argProblems(argv)');
  expect(at).toBeGreaterThan(0);
  expect(at).toBeLessThan(src.indexOf('await gate('));
  expect(src).toContain("filters = scenarioScope(filters, scenarioPick?.files ?? null);");
});
