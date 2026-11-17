// The test-runner gate (test-runners.ts): every test file has a runner, and the right one.
import { describe, expect, test } from 'bun:test';
import { judge, runnersOf } from './test-runners';

describe('test runners', () => {
  test('patterns: vitest, term and playwright', () => {
    expect(runnersOf('src/kit/Button.test.tsx')).toEqual(['vitest']);
    expect(runnersOf('src/kit/Button.term.test.tsx')).toEqual(['term']);
    expect(runnersOf('scripts/term/x.term.test.ts')).toEqual(['term']);
    expect(runnersOf('src/pages/home/home.spec.ts')).toEqual(['playwright']);
    expect(runnersOf('src/standalone/onefile.file.spec.ts')).toEqual(['playwright']);
    expect(runnersOf('scripts/term/graph/graph.test.ts')).toEqual([]);
  });
  test('a file no runner matches fails and names the rename', () => {
    const f = judge('scripts/term/graph/graph.test.ts', "import { test } from 'bun:test';\n");
    expect(f).toHaveLength(1);
    expect(f[0]!.rule).toBe('unmatched');
    expect(f[0]!.message).toContain('scripts/term/graph/graph.term.test.ts');
  });
  test('a bun:test file only vitest matches is the wrong runner', () => {
    expect(judge('src/term/app/fence.test.ts', "import { test } from 'bun:test';\n")[0]?.rule).toBe('wrong-runner');
    expect(judge('src/kit/a.test.ts', "import { test } from 'vitest';\n")).toEqual([]);
    expect(judge('src/kit/a.term.test.ts', "import { test } from 'bun:test';\n")).toEqual([]);
  });
});
