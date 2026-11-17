#!/usr/bin/env bun
// Every test file is run by some runner, and by one that can run it. A test file no runner's pattern matches never
// runs and never fails (scripts/term/graph/graph.test.ts sat there); a bun:test file under vitest's pattern (or the
// reverse) fails for the wrong reason or is silently skipped.
//   bun scripts/term/test-runners.ts [--json]          exit 1 on any finding
// Runners and their patterns, read from their configs where they live:
//   vitest      vite.config.mts: src/**/*.test.{ts,tsx} minus **/*.term.test.*, plus vitest.lists.mts (node projects)
//   term        scripts/term/check.ts tests gate: {src,scripts}/**/*.term.test.{ts,tsx} (bun test, --preload)
//   playwright  playwright.config.ts testMatch under src; playwright.shots.config.ts scripts/shots.spec.ts
// Test files: *.test.* and *.spec.* (ts, tsx, mts) under src and scripts. templates/ holds page templates copied by
// the page wizard, not tests of this tree: not judged.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from './resolve';
// `.mjs` names vitest.lists.mts for both TypeScript (bundler resolution) and Bun.
import { NODE_ISOLATED, NODE_SHARED } from '../../vitest.lists.mjs';

export type Runner = 'vitest' | 'term' | 'playwright';
export interface RunnerFinding { file: string; rule: 'unmatched' | 'wrong-runner'; message: string }

const glob = (p: string): Bun.Glob => new Bun.Glob(p);
const VITEST_INCLUDE = [glob('src/**/*.test.{ts,tsx}'), ...[...NODE_SHARED, ...NODE_ISOLATED].map(glob)];
const VITEST_EXCLUDE = glob('**/*.term.test.*');
const TERM = glob('{src,scripts}/**/*.term.test.{ts,tsx}');
const PLAYWRIGHT = [glob('src/pages/*/*.spec.ts'), glob('src/kit/**/*.spec.ts'), glob('src/shell/**/*.spec.ts'), glob('src/standalone/**/*.spec.ts'), glob('scripts/shots.spec.ts')];

export function runnersOf(rel: string): Runner[] {
  const out: Runner[] = [];
  if (VITEST_INCLUDE.some((g) => g.match(rel)) && !VITEST_EXCLUDE.match(rel)) out.push('vitest');
  if (TERM.match(rel)) out.push('term');
  if (PLAYWRIGHT.some((g) => g.match(rel))) out.push('playwright');
  return out;
}

/** Which runner the file's own imports say it is written for (null: cannot tell). */
export function writtenFor(source: string): Runner | null {
  if (/from ['"]bun:test['"]/.test(source)) return 'term';
  if (/from ['"]vitest['"]/.test(source)) return 'vitest';
  if (/from ['"]@playwright\/test['"]/.test(source)) return 'playwright';
  return null;
}

export function judge(rel: string, source: string): RunnerFinding[] {
  const runs = runnersOf(rel);
  const want = writtenFor(source);
  const doc = 'src/term/docs/gates.md';
  if (runs.length === 0) {
    const name = want === 'term' ? `${rel.replace(/\.test\.(tsx?)$/, '.term.test.$1')} (bun test, term gate)` : want === 'vitest' ? 'a src/**/*.test.ts(x) path' : 'a name a runner matches';
    return [{ file: rel, rule: 'unmatched', message: `no runner runs this test file; rename it to ${name} (docs: ${doc})` }];
  }
  // A bun:test file is runnable only by the term runner; vitest/playwright files only by theirs.
  if (want && !runs.includes(want)) {
    return [{ file: rel, rule: 'wrong-runner', message: `written for ${want === 'term' ? 'bun test' : want} but matched only by ${runs.join(', ')}; rename it so ${want === 'term' ? 'the term gate (*.term.test.ts)' : want} runs it (docs: ${doc})` }];
  }
  return [];
}

export function testFiles(hub = HUB): string[] {
  const out: string[] = [];
  for (const dir of ['src', 'scripts']) {
    for (const f of new Bun.Glob(`${dir}/**/*.{test,spec}.{ts,tsx,mts}`).scanSync(hub)) if (!f.includes('node_modules')) out.push(f);
  }
  return out.sort();
}

if (import.meta.main) {
  const findings = testFiles().flatMap((f) => judge(f, fs.readFileSync(path.join(HUB, f), 'utf8')));
  if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(findings, null, 1) + '\n');
  else for (const f of findings) process.stdout.write(`${f.file}  [${f.rule}]  ${f.message}\n`);
  process.stdout.write(`test runners: ${testFiles().length} test files, ${findings.length} findings\n`);
  process.exitCode = findings.length ? 1 : 0;
}
