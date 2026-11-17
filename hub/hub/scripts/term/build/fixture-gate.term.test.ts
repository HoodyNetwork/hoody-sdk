// The ship build's fixture gate: a fixture-only module that is a bundle INPUT fails the build and is named with its
// importer, even when its use is tree-shaken away (the negative test).
import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { HUB } from '../resolve';
import { shipBuild } from '../build';

const TMP = path.join(HUB, '.term-cache', 'tmp', `fixture-gate-${process.pid}`);
fs.mkdirSync(TMP, { recursive: true });
afterAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

const entry = (name: string, body: string): string => {
  const f = path.join(TMP, name);
  fs.writeFileSync(f, body);
  return f;
};

describe('ship build fixture gate', () => {
  test('an entry importing a fixture module fails and names module and importer', async () => {
    const e = entry('uses-fixture.ts', `import * as kits from ${JSON.stringify(path.join(HUB, 'src/core/run-open/fixtureKits.ts'))};\nexport const n = Object.keys(kits).length;\n`);
    const r = await shipBuild({ outdir: path.join(TMP, 'out-a'), entry: e });
    expect(r.ok).toBe(false);
    const hit = r.refusals.find((x) => x.code === 'TERM_FIXTURE_INPUT');
    expect(hit?.message).toContain('src/core/run-open/fixtureKits.ts');
    expect(hit?.importers?.some((i) => i.endsWith('uses-fixture.ts'))).toBe(true);
  }, 120_000);

  test('an import only a dead branch uses still fails (input, not survival, is the rule)', async () => {
    const e = entry('dead-branch.ts', `import { runOpenFixture } from ${JSON.stringify(path.join(HUB, 'src/core/run-open/fixtureKits.ts'))};\nexport const n = __HUB_FIXTURES__ ? runOpenFixture : null;\n`);
    const r = await shipBuild({ outdir: path.join(TMP, 'out-b'), entry: e });
    expect(r.refusals.map((x) => x.code)).toEqual(['TERM_FIXTURE_INPUT']);
    // Tree shaking dropped it (no fixture finding in the artifact; a tiny entry has no React or engine, so ignore those findings).
    expect((r.artifact?.findings ?? ['no artifact']).filter((f) => !/copies in the bundle|native library|linked versions/.test(f))).toEqual([]);
    expect(r.ok).toBe(false);
  }, 120_000);

  test('a fixture-free entry has no fixture refusal', async () => {
    const e = entry('clean.ts', 'export const n = 1;\n');
    const r = await shipBuild({ outdir: path.join(TMP, 'out-c'), entry: e });
    expect(r.refusals.filter((x) => x.code === 'TERM_FIXTURE_INPUT')).toEqual([]);
    expect(r.folded).toEqual([]);
  }, 120_000);
});

describe('ship build stub gate', () => {
  test('a loaded sibling holding a term-stub marker is refused; a ported one is not', async () => {
    const { stubRefusals } = await import('../build');
    const stub = entry('X.term.tsx', "// term-stub: X\nexport const X = undefined as never;\n");
    const done = entry('Y.term.tsx', 'export const Y = 1;\n');
    const r = stubRefusals([{ file: stub, kind: 'sibling' }, { file: done, kind: 'sibling' }]);
    expect(r.map((x) => x.code)).toEqual(['TERM_STUB_INPUT']);
    expect(r[0]!.message).toContain('term-stub: X');
  });
});
