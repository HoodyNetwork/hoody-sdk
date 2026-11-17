// @vitest-environment node
// The kit's own module graph (kit/index.ts and every module it loads, the shell and Ask included) holds
// no page module that imports the '@kit' barrel. Such a module closes a cycle back into the kit while the kit is still
// loading: a test's vi.mock('@kit') factory then hands it the real kit, not the mock. Page
// modules the kit reaches stay pure link and model modules; a page component reaches the shell through the router
// (app/router.tsx).
//
// The walk reads every import a module runs at load, parsed by TypeScript (any quote style, any line layout): `import …
// from`, a bare `import '…'`, `export … from` and `export * from`. Only `import type` and `export type` are skipped: under
// verbatimModuleSyntax (tsconfig.json) an `import { type A }` still loads its module. A dynamic `import()` runs later,
// never at load, so it is not an edge, and neither is an import with one of Vite's asset queries (`?raw`, `?url`, `?worker`,
// `?sharedworker`: text, an address or a worker, never the module run here). Any other query (`?v=1`) still loads the
// module, so it is an edge. Specifiers resolve through the Hub's own aliases, read from vite.config.mts, in Vite's own order
// (vite.config.mts sets no resolve.extensions): the file as written, a .js/.mjs/.cjs/.jsx spelling of a .ts/.mts/.cts/.tsx
// file, then Vite's default extensions .mjs, .js, .mts, .ts, .jsx, .tsx, .json, then the same index files.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..');
const HUB = path.resolve(SRC, '..');

/** The Hub's resolve.alias entries as written in vite.config.mts (`'@x': path.join(HUB, 'src/…')`), longest key first. */
function viteAliases(): [string, string][] {
  const text = fs.readFileSync(path.join(HUB, 'vite.config.mts'), 'utf8');
  // resolve.alias is an array of { find, replacement } (string finds only; the exact /^@core$/ barrel rule is a RegExp
  // and '@core' below covers the directory).
  const out = [...text.matchAll(/\{\s*find:\s*'(@[\w/.-]+)',\s*replacement:\s*path\.join\(HUB,\s*'src\/([^']*)'\)\s*\}/g)].map((m): [string, string] => [m[1]!, m[2]!]);
  return out.sort((a, b) => b[0].length - a[0].length);
}

/** The specifiers a module loads at load time. */
function loadedSpecifiers(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      if (st.importClause?.isTypeOnly) continue;
      if (ts.isStringLiteral(st.moduleSpecifier)) out.push(st.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(st) && st.moduleSpecifier) {
      if (st.isTypeOnly) continue;
      if (ts.isStringLiteral(st.moduleSpecifier)) out.push(st.moduleSpecifier.text);
    }
  }
  return out;
}

const CODE = /\.(?:[cm]?[jt]sx?)$/;
/** Vite's SPECIAL_QUERY_RE: these imports yield text, an address or a worker, never the module run in this graph. */
const ASSET_QUERY = /[?&](?:worker|sharedworker|raw|url)\b/;
/** Vite's DEFAULT_EXTENSIONS, in its order. */
const EXTS = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];

/** A specifier as a path under src/ (a file that exists), or null for a package, a file outside src/ or an asset-query import. */
function resolveIn(exists: (p: string) => boolean, aliases: readonly [string, string][], from: string, spec: string): string | null {
  if (ASSET_QUERY.test(spec)) return null;
  const bare = spec.replace(/[?#].*$/, '');
  let base: string | null = null;
  if (bare.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), bare));
  else {
    for (const [key, dir] of aliases) {
      if (bare === key || bare.startsWith(`${key}/`)) { base = path.posix.join(dir, bare.slice(key.length)); break; }
    }
  }
  if (base === null || base.startsWith('..')) return null;
  const out = /\.(js|mjs|cjs|jsx)$/.exec(base)?.[1];
  const tsOf = out ? [base.slice(0, -out.length) + out.replace('js', 'ts'), ...(out === 'js' ? [`${base.slice(0, -2)}tsx`] : [])] : [];
  for (const c of [base, ...tsOf, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) {
    if (exists(c)) return c;
  }
  return null;
}

/** Every module `start` loads, with the specifiers each one names. */
function moduleGraph(start: string, read: (p: string) => string, exists: (p: string) => boolean, aliases: readonly [string, string][]): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [start];
  while (queue.length) {
    const f = queue.shift()!;
    if (seen.has(f)) continue;
    const specs = CODE.test(f) ? loadedSpecifiers(f, read(f)) : [];
    seen.set(f, specs);
    for (const s of specs) {
      const t = resolveIn(exists, aliases, f, s);
      if (t && !seen.has(t)) queue.push(t);
    }
  }
  return seen;
}

const fileExists = (p: string): boolean => { try { return fs.statSync(path.join(SRC, p)).isFile(); } catch { return false; } };
const readFile = (p: string): string => fs.readFileSync(path.join(SRC, p), 'utf8');

/** Page modules in the graph that import the '@kit' barrel (the barrel itself, by any spelling that reaches it). */
function pagesImportingKit(graph: Map<string, string[]>, exists: (p: string) => boolean, aliases: readonly [string, string][]): string[] {
  return [...graph]
    .filter(([f, specs]) => f.startsWith('pages/') && specs.some((s) => resolveIn(exists, aliases, f, s) === 'kit/index.ts'))
    .map(([f]) => f);
}

describe("the kit's module graph", () => {
  const aliases = viteAliases();
  const graph = moduleGraph('kit/index.ts', readFile, fileExists, aliases);

  it("reads the Hub's aliases from vite.config.mts", () => {
    expect(aliases.map(([k]) => k).sort()).toEqual(['@app', '@ask/io', '@core', '@kit', '@shell']);
  });

  it('reaches Ask through the shell (so what Ask imports is in it)', () => {
    expect(graph.has('ask/AskPanel.tsx')).toBe(true);
  });

  it("holds no page module that imports the '@kit' barrel", () => {
    expect(pagesImportingKit(graph, fileExists, aliases)).toEqual([]);
  });

  it("does not reach the Board's links.ts or BoardAddButton", () => {
    expect(graph.has('pages/board/links.ts')).toBe(false);
    expect(graph.has('pages/board/BoardAddButton.tsx')).toBe(false);
  });
});

// The walk on a small made-up tree: kit/index.ts → shell/s.ts → ask/a.ts, where ask/a.ts reaches the page module
// pages/p.ts by one import form, and pages/p.ts imports the kit barrel. Each form must close the cycle the guard finds;
// a type-only import must not.
describe('the walk sees every import form that runs at load', () => {
  const aliases: [string, string][] = [['@ask/io', 'ask/io.ts'], ['@shell', 'shell'], ['@core', 'core'], ['@kit', 'kit'], ['@app', 'app']];
  const tree = (askSource: string, extra: Record<string, string> = {}): Map<string, string> => new Map(Object.entries({
    'kit/index.ts': "export { s } from '../shell/s';\n",
    'shell/s.ts': "import { a } from '../ask/a';\nexport const s = a;\n",
    'ask/a.ts': askSource,
    'ask/io.ts': "export * from '../pages/p';\n",
    'pages/p.ts': "import { Button } from '@kit';\nexport const p = Button;\n",
    'pages/q.tsx': "import { Button } from '@kit';\nexport const q = Button;\n",
    'pages/j.js': "import { Button } from '@kit';\nexport const j = Button;\n",
    'pages/x.jsx': "import { Button } from '@kit';\nexport const x = Button;\n",
    'pages/k/index.js': "import { Button } from '@kit';\nexport const k = Button;\n",
    ...extra,
  }));
  const found = (files: Map<string, string>): string[] => {
    const exists = (p: string): boolean => files.has(p);
    const graph = moduleGraph('kit/index.ts', (p) => files.get(p)!, exists, aliases);
    return pagesImportingKit(graph, exists, aliases);
  };

  it.each([
    ['single quotes', "import { p } from '../pages/p';\nexport const a = p;\n"],
    ['double quotes', 'import { p } from "../pages/p";\nexport const a = p;\n'],
    ['a bare import', "import '../pages/p';\nexport const a = 1;\n"],
    ['an explicit .ts extension', "import { p } from '../pages/p.ts';\nexport const a = p;\n"],
    ['a .js extension for a .ts file', "import { p } from '../pages/p.js';\nexport const a = p;\n"],
    ['the @ask/io alias', "import { p } from '@ask/io';\nexport const a = p;\n"],
    ['export … from', "export { p as a } from '../pages/p';\n"],
    ['export * from', "export * from '../pages/p';\n"],
    ['an import over several lines', "import {\n  p,\n} from\n  '../pages/p';\nexport const a = p;\n"],
    ['an inline type beside a value', "import { type P, p } from '../pages/p';\nexport const a: P = p;\n"],
    ['only inline types (still loaded under verbatimModuleSyntax)', "import { type P } from '../pages/p';\nexport type A = P;\n"],
    ['a .tsx page', "import { q } from '../pages/q';\nexport const a = q;\n"],
    ['an extensionless import of a .js page', "import { j } from '../pages/j';\nexport const a = j;\n"],
    ['an extensionless import of a .jsx page', "import { x } from '../pages/x';\nexport const a = x;\n"],
    ['a .js index file', "import { k } from '../pages/k';\nexport const a = k;\n"],
  ])('%s', (_name, src) => {
    expect(found(tree(src))).not.toEqual([]);
  });

  it('a page reaching the barrel by a relative path or a .ts index is still the barrel', () => {
    expect(found(tree("import { p } from '../pages/p';\nexport const a = p;\n", { 'pages/p.ts': "import { Button } from '../kit/index.ts';\nexport const p = Button;\n" }))).toEqual(['pages/p.ts']);
  });

  it('import type and export type load nothing', () => {
    expect(found(tree("import type { P } from '../pages/p';\nexport type { Q } from '../pages/q';\nexport const a = 1;\n"))).toEqual([]);
  });

  it('a ?raw, ?url or ?worker import loads text, an address or a worker, never the module', () => {
    expect(found(tree("import text from '../pages/p.ts?raw';\nimport href from '../pages/q.tsx?url';\nimport W from '../pages/j.js?worker';\nexport const a = [text, href, W];\n"))).toEqual([]);
  });

  it.each([
    ['a ?v= query', "import { p } from '../pages/p.ts?v=1';\nexport const a = p;\n"],
    ['an extensionless import with a query', "import { p } from '../pages/p?version=2';\nexport const a = p;\n"],
    ['an extensionless import of a .mts page', "import { m } from '../pages/m';\nexport const a = m;\n"],
  ])('%s still loads the module', (_name, src) => {
    expect(found(tree(src, { 'pages/m.mts': "import { Button } from '@kit';\nexport const m = Button;\n" }))).not.toEqual([]);
  });

  it('a dynamic import() runs later, not at load', () => {
    expect(found(tree("export const a = () => import('../pages/p');\n"))).toEqual([]);
  });
});

// Resolution in Vite's order: when two files could answer one specifier, the guard walks the one Vite loads.
describe("the walk resolves a specifier to the file Vite loads", () => {
  const files = new Set(['pages/e.ts', 'pages/e.js', 'pages/f.mts', 'pages/f.ts', 'pages/g.js', 'pages/g.ts', 'pages/h.mjs', 'pages/h.mts', 'pages/i.jsx', 'pages/i.tsx', 'pages/n.tsx', 'pages/d/index.js', 'pages/d/index.ts', 'pages/o.json']);
  const resolve = (spec: string): string | null => resolveIn((p) => files.has(p), [], 'ask/a.ts', spec);
  it.each([
    ['../pages/e', 'pages/e.js'],
    ['../pages/f', 'pages/f.mts'],
    ['../pages/g.js', 'pages/g.js'],
    ['../pages/h.mjs', 'pages/h.mjs'],
    ['../pages/i.jsx', 'pages/i.jsx'],
    ['../pages/n.js', 'pages/n.tsx'],
    ['../pages/d', 'pages/d/index.js'],
    ['../pages/o', 'pages/o.json'],
    ['../pages/e?v=3', 'pages/e.js'],
    ['../pages/e.ts#x', 'pages/e.ts'],
  ])('%s -> %s', (spec, file) => {
    expect(resolve(spec)).toBe(file);
  });
});
