// Fixture-only modules by the import graph, not by file name: a mock imported only by fixtures and
// tests is fixture-only whatever it is called; a module live code also reaches is not; the verify check names one in
// the bundle. Synthetic hub trees under $GRAPH_FIXTURES_DIR (default .term-cache/graph-fixtures; as graph.term.test.ts).
import { afterAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fixtureGraph } from './fixture-graph';
import { verifyArtifact } from './verify';

const ROOT = process.env.GRAPH_FIXTURES_DIR ?? path.join(import.meta.dir, '..', '..', '..', '.term-cache', 'graph-fixtures');
fs.mkdirSync(ROOT, { recursive: true });
const made: string[] = [];
afterAll(() => { for (const d of made) fs.rmSync(d, { recursive: true, force: true }); });

const TSCONFIG = { compilerOptions: { target: 'ES2023', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, allowJs: true, noEmit: true }, include: ['src'] };
function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(ROOT, 'fixture-graph-'));
  made.push(dir);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

const HUB = () => tree({
  'src/app/main.tsx': "import { view } from '../pages/p/view';\nexport const app = view;\n",
  'src/term/entry.live.ts': "import { termView } from '../pages/p/view';\nexport const t = termView;\n",
  'src/pages/p/view.tsx': "import { shared } from './shared';\nexport const view = shared;\n",
  'src/pages/p/view.term.ts': "import { shared } from './shared';\nexport const termView = shared;\n",
  'src/pages/p/shared.ts': 'export const shared = 1;\n',
  'src/pages/p/fixtures.ts': "import { keys } from './mockKeys';\nimport { rows } from './fixtureData';\nimport { shared } from './shared';\nexport const fx = [keys, rows, shared];\n",
  'src/pages/p/mockKeys.ts': 'export const keys = ["k"];\n',
  'src/pages/p/fixtureData.ts': "import { more } from './deeper';\nexport const rows = [more];\n",
  'src/pages/p/deeper.ts': 'export const more = 2;\n',
  'src/pages/p/logic.test.ts': "import { vec } from './crypto.vectors';\nimport { helper } from './testHelper';\nexport const t = [vec, helper];\n",
  'src/pages/p/crypto.vectors.ts': 'export const vec = 3;\n',
  'src/pages/p/testHelper.ts': 'export const helper = 4;\n',
});

describe('fixture graph', () => {
  test('modules only fixtures or tests reach are fixture-only, whatever their names', () => {
    const g = fixtureGraph(HUB());
    for (const m of ['src/pages/p/mockKeys.ts', 'src/pages/p/fixtureData.ts', 'src/pages/p/deeper.ts', 'src/pages/p/crypto.vectors.ts', 'src/pages/p/testHelper.ts', 'src/pages/p/fixtures.ts']) expect(g.fixtureOnly.has(m)).toBe(true);
  });

  test('a module live code reaches is not fixture-only, even when fixtures import it too', () => {
    const g = fixtureGraph(HUB());
    for (const m of ['src/pages/p/shared.ts', 'src/pages/p/view.tsx', 'src/pages/p/view.term.ts', 'src/app/main.tsx', 'src/term/entry.live.ts']) expect(g.fixtureOnly.has(m)).toBe(false);
  });

  test('every JSX runtime the loader injects is live, even when only a test imports it by name', () => {
    const hub = tree({
      'src/app/main.tsx': 'export const app = 1;\n',
      'src/term/entry.live.ts': 'export const t = 1;\n',
      'src/term/jsx/jsx-runtime.ts': "export { dom } from './dom';\n",
      'src/term/jsx/jsx-dev-runtime.ts': "export * from './jsx-runtime';\n",
      'src/term/jsx/dom.ts': 'export const dom = 1;\n',
      'src/term/jsx/classic.ts': "import { dom } from './dom';\nexport const h = dom;\n",
      'src/term/app/anchor.term.test.tsx': "import { h } from '../jsx/classic';\nexport const x = h;\n",
    });
    const g = fixtureGraph(hub);
    // The runtimes the loader's transform names (loader.ts: the classic factory; resolve.ts: the automatic runtimes).
    const loader = fs.readFileSync(path.join(import.meta.dir, '..', 'loader.ts'), 'utf8');
    const injected = [...loader.matchAll(/path\.join\(JSX_DIR, '([\w.-]+\.ts)'\)/g)].map((m) => `src/term/jsx/${m[1]}`);
    expect(injected).toContain('src/term/jsx/classic.ts');
    for (const m of new Set([...injected, 'src/term/jsx/jsx-runtime.ts', 'src/term/jsx/jsx-dev-runtime.ts', 'src/term/jsx/dom.ts'])) expect(g.fixtureOnly.has(m)).toBe(false);
  });

  test('the artifact check names a fixture-only module in the bundle that no name rule catches', () => {
    const hub = HUB();
    const out = path.join(hub, 'out');
    fs.mkdirSync(out);
    const bundle = path.join(out, 'hub-term.js');
    fs.writeFileSync(bundle, '// src/pages/p/shared.ts\nvar shared = 1;\n\n// src/pages/p/mockKeys.ts\nvar keys = ["k"];\n');
    const r = verifyArtifact(out, bundle, { roots: [hub], fixtureOnly: fixtureGraph(hub).fixtureOnly });
    const hits = r.findings.filter((f) => f.includes('by the import graph'));
    expect(hits.map((f) => f.split(':')[0])).toEqual(['src/pages/p/mockKeys.ts']);
  });
});
