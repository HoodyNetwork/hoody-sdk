// The term gates fail when they checked nothing (fail-closed.ts): one test per case. The term harness refuses
// subprocesses (test-net-guard.ts), so the bun outputs below are what bun 1.4.4 really printed for each scratch file
// (note that it exits 0 for a file with no tests AND for one that exits mid-run).
import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
import { declaredTests, gateNames, judgeTestRun, noInputs, noTestFiles } from './fail-closed';

const NONE = { src: "import { expect } from 'bun:test';\nexpect(1).toBe(1);\n", out: 'none.test.ts:\n\n 0 pass\n 0 fail\n 1 expect() calls\nRan 0 tests across 1 file. [67.00ms]\n' };
const SKIPPED = { src: "import { test } from 'bun:test';\ntest.skip('a', () => {});\ntest.skip('b', () => {});\n", out: 'skipped.test.ts:\n(skip) a\n(skip) b\n\n 0 pass\n 2 skip\n 0 fail\nRan 2 tests across 1 file. [124.00ms]\n' };
const EARLY = { src: "import { test } from 'bun:test';\ntest('a', () => {});\ntest('b', () => { process.exit(0); });\ntest('c', () => {});\n", out: 'early.test.ts:\n(pass) a [0.03ms]\n' };
const GOOD = { src: "import { test, expect } from 'bun:test';\nfor (const n of [1, 2]) test('n' + n, () => { expect(n).toBeGreaterThan(0); });\ntest.skip('later', () => {});\n", out: 'good.test.ts:\n(pass) n1 [0.07ms]\n(pass) n2\n(skip) later\n\n 2 pass\n 1 skip\n 0 fail\n 2 expect() calls\nRan 3 tests across 1 file. [24.00ms]\n' };

describe('fail closed', () => {
  test('an unknown --only name is refused, and check.ts refuses before running any gate', () => {
    expect(gateNames(['tsts'], ['tests', 'pages'])).toEqual(['tsts']);
    expect(gateNames(['tests'], ['tests', 'pages'])).toEqual([]);
    const check = fs.readFileSync(path.join(HUB, 'scripts/term/check.ts'), 'utf8');
    const refuse = check.indexOf('process.exit(2)');
    expect(check.indexOf('gateNames(')).toBeGreaterThan(0);
    expect(refuse).toBeGreaterThan(0);
    expect(refuse).toBeLessThan(check.indexOf('await gate('));
  });

  test('zero test files fails the tests gate', () => {
    expect(noTestFiles(0)).toContain('found no');
    expect(noTestFiles(3)).toBeNull();
  });

  test('a file with no tests fails (bun exits 0 for it)', () => {
    expect(judgeTestRun(NONE.src, NONE.out)).toContain('no tests');
  });

  test('a file whose tests are all skipped fails', () => {
    expect(judgeTestRun(SKIPPED.src, SKIPPED.out)).toContain('skipped');
  });

  test('a file that exits before its tests finish fails (bun exits 0, no summary)', () => {
    expect(judgeTestRun(EARLY.src, EARLY.out)).toContain('exited before');
  });

  test('fewer tests reported than declared fails', () => {
    const src = "test('a', () => {});\ntest('b', () => {});\nit('c', () => {});\n";
    expect(judgeTestRun(src, ' 1 pass\n 0 fail\nRan 1 test across 1 file. [5.00ms]\n')).toContain('declares at least 3');
  });

  test('a file that runs what it declares passes', () => {
    expect(judgeTestRun(GOOD.src, GOOD.out)).toBeNull();
  });

  test('declared tests ignore comments and strings, count each modifier once', () => {
    const src = "// test('in a comment')\nconst s = `test('in a template')`;\nconst q = \"it('in a string')\";\ntest('a', () => {});\ntest.skip('b', () => {});\ntest.each([[1], [2]])('c %p', () => {});\ntest.if(true)('d', () => {});\nobj.test('not a test call');\n";
    expect(declaredTests(src)).toBe(4);
  });

  test('contract.ts with zero inputs fails', () => {
    expect(noInputs('contract.ts', 'term sibling with a web twin', 0)).toContain('contract.ts: found no');
    expect(noInputs('contract.ts', 'term sibling with a web twin', 1)).toBeNull();
    expect(fs.readFileSync(path.join(HUB, 'scripts/term/contract.ts'), 'utf8')).toContain("noInputs('contract.ts'");
  });

  test('scenarios.ts with zero inputs fails', () => {
    expect(noInputs('scenarios.ts', 'scenario file matching zz', 0)).toContain('found no scenario file matching zz');
    expect(noInputs('scenarios.ts', 'scenario case', 0)).toContain('scenario case');
    expect(fs.readFileSync(path.join(HUB, 'scripts/term/scenarios.ts'), 'utf8')).toContain("noInputs('scenarios.ts'");
  });

  test('secrets.ts with zero inputs fails', () => {
    expect(noInputs('secrets.ts', 'page', 0)).toContain('secrets.ts: found no page');
    expect(noInputs('secrets.ts', 'drawn case', 0)).toContain('drawn case');
    expect(fs.readFileSync(path.join(HUB, 'scripts/term/secrets.ts'), 'utf8')).toContain("noInputs('secrets.ts'");
  });
});
