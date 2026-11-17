// F4 / F5 conformance: ONE case table, run through every consumer of the canonical resolver (resolve.ts TermResolver):
// the graph tool (graph/modres.ts), the runtime loader's syntax rewrite (loader.ts rewriteImports), the typecheck's
// module-resolution hook (typecheck.ts termModuleResolution) and the ship bundler's plugin (build/plugin.ts). Each must
// land on the same file (or refuse the same import). The fixture hub is built under tmp/term-build; packages
// resolve through a node_modules symlink to the real install.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { TermResolver, SRC as REAL_SRC } from './resolve';
import { ModuleResolver } from './graph/modres';
import { walk } from './graph/build';
import { rewriteImports, transform, TermLoadError } from './loader';
import { termModuleResolution } from './typecheck';
import { newLedger, termBuildPlugin } from './build/plugin';
import { transformContext } from './loader';

const SCRATCH = path.join(path.resolve(import.meta.dirname, '../../../..'), 'tmp', 'term-build', 'conformance-' + process.pid);
const HUB = path.join(SCRATCH, 'hub');
const S = (p: string): string => path.join(HUB, 'src', p);

const TREE: Record<string, string> = {
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, resolveJsonModule: true, allowImportingTsExtensions: true, noEmit: true, verbatimModuleSyntax: true, baseUrl: '.', paths: { '@kit': ['./src/kit/index.ts'], '@kit/*': ['./src/kit/*'] } }, include: ['src'] }),
  'src/kit/index.ts': `export * from './Widget';\nexport { thing } from './deep/thing';\n`,
  'src/kit/Widget.tsx': `import 'react-dom';\nexport const Widget = () => 'web';\n`,
  'src/kit/Widget.term.tsx': `import type { } from './Widget';\nexport const Widget = () => 'term';\n`,
  'src/kit/Orphan.term.tsx': `export const Orphan = 1;\n`,
  'src/kit/deep/thing.ts': `export const thing = 'deep';\n`,
  'src/kit/Button.module.css': `.root { color: red }\n`,
  'src/kit/notes.txt': `hello\n`,
  'src/kit/icon.svg': `<svg/>\n`,
  'src/pages/p/lib/index.ts': `export const lib = 1;\n`,
  'src/pages/p/util.ts': `export const util = 1;\n`,
  'src/pages/p/data.json': `{ "a": 1 }\n`,
  'src/pages/p/view.tsx': `export const v = 1;\n`,
  'src/term/jsx/jsx-runtime.ts': `export * from 'react/jsx-runtime';\n`,
  'src/term/jsx/jsx-dev-runtime.ts': `export * from 'react/jsx-dev-runtime';\n`,
  'src/term/prim/Box.tsx': `export const Box = 1;\n`,
  // The X.web.ts / X.web.term.ts pair (core/chat-attention): the importer names `./x.web`, which looks like a file
  // with a `.web` extension; the terminal must still land on the .web.term.ts sibling.
  'src/core/att.ts': `import { useVisible } from './att.web';\nexport const a = useVisible;\n`,
  'src/core/att.web.ts': `export const useVisible = () => document.visibilityState;\n`,
  'src/core/att.web.term.ts': `import type * as Web from './att.web';\nexport const useVisible: typeof Web.useVisible = () => 'visible';\n`,
};

beforeAll(() => {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  for (const [f, c] of Object.entries(TREE)) { fs.mkdirSync(path.dirname(path.join(HUB, f)), { recursive: true }); fs.writeFileSync(path.join(HUB, f), c); }
  fs.symlinkSync(path.resolve(REAL_SRC, '..', '..', 'node_modules'), path.join(SCRATCH, 'node_modules'));
  fs.symlinkSync(S('kit/deep/thing.ts'), S('pages/p/link.ts'));
});
afterAll(() => { fs.rmSync(SCRATCH, { recursive: true, force: true }); });

type Want = { file: string } | { pkg: string } | { kind: 'cssModule' | 'raw' | 'asset' } | { refused: true };
const VIEW = 'src/pages/p/view.tsx';
const CASES: Array<[name: string, importer: string, spec: string | (() => string), want: Want]> = [
  ['directory index', VIEW, './lib', { file: 'src/pages/p/lib/index.ts' }],
  ['deep alias', VIEW, '@kit/deep/thing', { file: 'src/kit/deep/thing.ts' }],
  ['.js names the TS source', VIEW, './util.js', { file: 'src/pages/p/util.ts' }],
  ['JSON', VIEW, './data.json', { file: 'src/pages/p/data.json' }],
  ['absolute path', VIEW, () => S('kit/deep/thing.ts'), { file: 'src/kit/deep/thing.ts' }],
  ['symlink normalises to the real file', VIEW, './link', { file: 'src/kit/deep/thing.ts' }],
  ['sibling selected after the base resolves (alias)', VIEW, '@kit/Widget', { file: 'src/kit/Widget.term.tsx' }],
  ['sibling selected after the base resolves (relative, with extension)', 'src/kit/index.ts', './Widget.tsx', { file: 'src/kit/Widget.term.tsx' }],
  ['barrel stays the barrel', VIEW, '@kit', { file: 'src/kit/index.ts' }],
  ['a sibling with no base is never selected', VIEW, '@kit/Orphan', { refused: true }],
  ['JSX of shared code is the compat runtime', VIEW, 'react/jsx-runtime', { file: 'src/term/jsx/jsx-runtime.ts' }],
  ['JSX of prim is React\'s own', 'src/term/prim/Box.tsx', 'react/jsx-runtime', { pkg: 'react' }],
  ['JSX of the jsx dir is React\'s own', 'src/term/jsx/jsx-runtime.ts', 'react/jsx-runtime', { pkg: 'react' }],
  ['a package', VIEW, 'react', { pkg: 'react' }],
  ['CSS module', VIEW, '@kit/Button.module.css', { kind: 'cssModule' }],
  ['?raw text', VIEW, '@kit/notes.txt?raw', { kind: 'raw' }],
  ['asset', VIEW, '@kit/icon.svg', { kind: 'asset' }],
  ['a missing module', VIEW, './nope', { refused: true }],
  ['a missing asset with a query', VIEW, './nope.svg?url', { refused: true }],
  ['X.web names its .web.term sibling', 'src/core/att.ts', './att.web', { file: 'src/core/att.web.term.ts' }],
  ['X.web.ts by extension names its .web.term sibling', 'src/core/att.ts', './att.web.ts', { file: 'src/core/att.web.term.ts' }],
];

const rel = (f: string): string => path.relative(HUB, fs.realpathSync(f));
const specOf = (s: string | (() => string)): string => typeof s === 'function' ? s() : s;

/** Each consumer, reduced to a comparable outcome. */
function viaResolver(r: TermResolver, imp: string, spec: string): string {
  const x = r.resolve(spec, S(imp.slice(4)));
  switch (x.kind) {
    case 'file': return 'file:' + rel(x.path);
    case 'jsx': return 'file:' + rel(x.path);
    case 'package': return 'pkg:' + x.name;
    case 'external': return /node_modules\/react\//.test(x.path) ? 'pkg:react' : 'ext:' + x.path;
    case 'cssModule': case 'raw': return x.kind;
    case 'asset': return x.path ? 'asset' : 'refused';
    default: return 'refused';
  }
}
function viaGraph(m: ModuleResolver, imp: string, spec: string): string {
  const t = m.resolveTerm(spec, S(imp.slice(4))) as { kind: string; file?: string; name?: string; css?: boolean };
  if (t.kind === 'file') return 'file:' + rel(t.file!);
  if (t.kind === 'package') return 'pkg:' + t.name;
  if (t.kind === 'asset') return t.css ? 'cssModule' : /\.txt$/.test(t.file!) ? 'raw' : 'asset';
  if (t.kind === 'external') return /node_modules\/react\//.test(t.file ?? '') ? 'pkg:react' : 'ext';
  return 'refused';
}
function viaLoader(r: TermResolver, imp: string, spec: string): string {
  let out: string;
  try { out = rewriteImports(S(imp.slice(4)), `import x from ${JSON.stringify(spec)};\nexport { x };\n`, r); } catch (e) { return e instanceof TermLoadError ? 'refused' : 'threw:' + String(e); }
  const m = /from "([^"]+)"(?: with \{ type: "text" \})?/.exec(out) ?? /from '([^']+)'/.exec(out);
  const to = m?.[1] ?? '';
  if (/with \{ type: "text" \}/.test(out)) return 'raw';
  if (to.startsWith('/') && fs.existsSync(to) && to.startsWith(HUB)) return /\.module\.css/.test(spec) ? 'cssModule' : 'file:' + rel(to);
  if (/^data:|asset/i.test(to) || /\.svg$/.test(spec)) return 'asset';
  if (/^react(\/|$)/.test(to)) return 'pkg:react';
  return 'other:' + to;
}
function viaTypecheck(r: TermResolver, imp: string, spec: string): string {
  const hook = termModuleResolution(r, r.options, []);
  const file = S(imp.slice(4));
  const sf = ts.createSourceFile(file, `import x from ${JSON.stringify(spec)};`, ts.ScriptTarget.Latest, true);
  const lit = ((sf.statements[0] as ts.ImportDeclaration).moduleSpecifier) as ts.StringLiteral;
  const res = hook([lit], file, undefined, r.options, sf, undefined)[0]!.resolvedModule;
  if (!res) return 'none';
  if (/node_modules\/@types\/react\//.test(res.resolvedFileName) || /node_modules\/react\//.test(res.resolvedFileName)) return 'pkg:react';
  return 'file:' + rel(res.resolvedFileName);
}
const wantOf = (w: Want): string => 'file' in w ? 'file:' + w.file : 'pkg' in w ? 'pkg:' + w.pkg : 'kind' in w ? w.kind : 'refused';

describe('F4: one resolver, every consumer agrees', () => {
  for (const [name, imp, spec, want] of CASES) {
    test(name, () => {
      const r = new TermResolver({ hub: HUB });
      const listed: string[] = [];
      walk(path.join(HUB, 'src'), listed); // the graph tool's own file listing
      const files = new Set(listed);
      const g = new ModuleResolver(HUB, files);
      const s = specOf(spec);
      const w = wantOf(want);
      expect({ consumer: 'resolver', got: viaResolver(r, imp, s) }).toEqual({ consumer: 'resolver', got: w });
      expect({ consumer: 'graph', got: viaGraph(g, imp, s) }).toEqual({ consumer: 'graph', got: w });
      expect({ consumer: 'loader', got: viaLoader(r, imp, s) }).toEqual({ consumer: 'loader', got: w });
      // The typecheck types CSS modules, ?raw and assets through vite/client's ambient declarations, and a refused
      // import is a TS2307 diagnostic: both are "no module" to the hook.
      // The one named exception: the typecheck types JSX against React's own runtime (typecheck.ts header: the compat
      // runtime's JSX namespace IS React's, so the types are identical and the program avoids a second JSX namespace).
      const tw = /^react\/jsx-/.test(s) ? 'pkg:react' : w.startsWith('file:') || w.startsWith('pkg:') ? w : 'none';
      expect({ consumer: 'typecheck', got: viaTypecheck(r, imp, s) }).toEqual({ consumer: 'typecheck', got: tw });
    });
  }

  test('ship bundler: the barrel re-export reaches the sibling, never the web file', async () => {
    const r = new TermResolver({ hub: HUB });
    // A context bound to this fixture hub: the transform resolves through `r` via rewriteImports' resolver argument.
    const entry = S('pages/p/entry.ts');
    fs.writeFileSync(entry, `import { Widget, thing } from '@kit';\nimport { lib } from './lib';\nimport d from './data.json';\nexport const all = [Widget(), thing, lib, d];\n`);
    const ledger = newLedger();
    const ctx = transformContext({ flavour: 'strict', fixtures: false, mode: 'production' });
    const local = { ...ctx, transform: (file: string, code: string) => {
      const js = new Bun.Transpiler({ loader: file.endsWith('x') ? 'tsx' : 'ts', target: 'bun' }).transformSync(code);
      return { code: rewriteImports(file, js, r), record: { file, kind: 'shared' } as never };
    } } as unknown as typeof ctx;
    const out = await Bun.build({ entrypoints: [entry], target: 'bun', plugins: [termBuildPlugin({ ctx: local, resolver: r, ledger })], throw: false });
    expect(out.logs.map(String)).toEqual([]);
    expect(out.success).toBe(true);
    const code = await out.outputs[0]!.text();
    expect(code).toContain('"term"');
    expect(code).not.toContain('"web"');
    expect(code).not.toContain('react-dom');
    expect(ledger.refusals).toEqual([]);
  });

  test('a sibling may not import values from its own base (twin cycle); a type-only import is fine', () => {
    const r = new TermResolver({ hub: HUB });
    expect(r.resolve('./Widget', S('kit/Widget.term.tsx')).kind).toBe('twin');
    expect(r.resolve('./Widget', S('kit/Widget.term.tsx'), { typeOnly: true }).kind).toBe('file');
    // the loader drops a type residue `import {}` of the twin and refuses a value import of it
    expect(rewriteImports(S('kit/Widget.term.tsx'), `import {} from './Widget';\nexport const a = 1;\n`, r)).not.toContain('Widget');
    expect(() => rewriteImports(S('kit/Widget.term.tsx'), `import { Widget } from './Widget';\nexport const a = Widget;\n`, r)).toThrow(/TWIN/);
  });
});

describe('F4/F5: import forms are read by syntax', () => {
  const r = (): TermResolver => new TermResolver({ hub: HUB });
  const file = (): string => S('pages/p/view.tsx');
  test('require() and friends are refused with a clear error', () => {
    for (const c of [`const a = require('./util');`, `const a = require.resolve('./util');`, `const a = module.require('./util');`, `const a = import.meta.require('./util');`]) {
      expect(() => rewriteImports(file(), c, r())).toThrow(/TERM_IMPORT_FORM/);
    }
  });
  test('a non-literal import() is refused; a literal one resolves', () => {
    expect(() => rewriteImports(file(), `const n = './util'; await import(n);`, r())).toThrow(/TERM_IMPORT_FORM/);
    expect(rewriteImports(file(), `await import('@kit/Widget');`, r())).toContain('Widget.term.tsx');
  });
  test('text that only looks like an import is never rewritten', () => {
    const src = `const s = "import x from '@kit/Widget'";\nconst t = \`export * from '@kit/deep/thing'\`;\n// import y from '@kit/Widget'\nexport { s, t };\n`;
    expect(rewriteImports(file(), src, r())).toBe(src);
  });
});

describe('one definition of web-only', () => {
  test('strict refuses an X.web.ts that reaches the terminal (no X.web.term.ts): TERM_WEB_NEIGHBOUR', () => {
    const f = S('core/lonely.web.ts');
    fs.writeFileSync(f, `export const v = 1;\n`);
    expect(() => transform(f, fs.readFileSync(f, 'utf8'), { flavour: 'strict', fixtures: false, mode: 'production' })).toThrow(/TERM_WEB_NEIGHBOUR: .*lonely\.web\.ts .*lonely\.web\.term\.ts/);
    // the fixture flavour still loads it (development keeps running; the ship build and strict runs refuse)
    expect(() => transform(f, fs.readFileSync(f, 'utf8'), { flavour: 'fixture', fixtures: true })).not.toThrow();
  });
});

describe('F5: transform contexts are keyed by every option', () => {
  test('fixtures on, then off, then on again in one process: no contamination', () => {
    const f = path.join(REAL_SRC, 'app', 'fixtures.ts');
    const code = fs.readFileSync(f, 'utf8');
    const on1 = transform(f, code, { flavour: 'fixture', fixtures: true }).code;
    const off = transform(f, code, { flavour: 'fixture', fixtures: false }).code;
    const on2 = transform(f, code, { flavour: 'fixture', fixtures: true }).code;
    expect(on1).toMatch(/pages\/[a-z]+\/fixtures\.ts/);
    expect(off).not.toMatch(/pages\/[a-z]+\/fixtures\.ts/);
    expect(on2).toBe(on1);
    expect(transformContext({ flavour: 'fixture', fixtures: true })).not.toBe(transformContext({ flavour: 'fixture', fixtures: false }));
    expect(transformContext({ flavour: 'fixture', fixtures: true, page: 'a' })).not.toBe(transformContext({ flavour: 'fixture', fixtures: true, page: 'b' }));
    expect(transformContext({ flavour: 'strict', fixtures: false, mode: 'production' })).not.toBe(transformContext({ flavour: 'strict', fixtures: false, mode: 'development' }));
  });
});

describe('classic scripts', () => {
  test('a .js IIFE on globalThis runs as written under the loader (run-open core); module files are not touched', async () => {
    const { isClassicScript } = await import('./loader');
    const f = path.join(REAL_SRC, 'core', 'run-open', 'run-open-core.js');
    const code = fs.readFileSync(f, 'utf8');
    expect(isClassicScript(f, code)).toBe(true);
    expect(isClassicScript('/x.js', 'export const a = 1;')).toBe(false);
    expect(isClassicScript('/x.js', 'const u = import.meta.url;')).toBe(false);
    const out = transform(f, code, { flavour: 'fixture', fixtures: true }).code;
    expect(out.startsWith(code)).toBe(true); // `this` kept (Bun's transpiler would make it `exports`)
    expect(out.trimEnd().endsWith('export {};')).toBe(true);
  });
});

describe('fixture barrels: the one fixture choice of resolution (FIXTURE_BARRELS)', () => {
  // The real hub (its tsconfig names '@core' -> core/index.ts, the web barrel), not the scratch tree above.
  const HUB = path.dirname(REAL_SRC);
  const from = path.join(HUB, 'src', 'shell', 'probe.ts');
  test("fixtures off (ship build, graph tool): the terminal's '@core' is the live barrel; the web meaning is the web barrel", () => {
    const r = new TermResolver({ hub: HUB });
    const t = r.resolve('@core', from);
    expect(t.kind === 'file' ? path.relative(HUB, t.path) : t.kind).toBe('src/core/index.live.ts');
    expect(path.relative(HUB, (r.resolveWeb('@core', from) as { path: string }).path)).toBe('src/core/index.ts');
    const g = new ModuleResolver(HUB, new Set(['index.ts', 'index.live.ts', 'index.fixtures.ts'].map((f) => path.join(HUB, 'src/core', f))));
    const gt = g.resolve('@core', from);
    expect(gt.kind === 'file' ? path.relative(HUB, gt.file) : gt.kind).toBe('src/core/index.ts');
    const gl = g.resolveTerm('@core', from);
    expect(gl.kind === 'file' ? path.relative(HUB, gl.file) : gl.kind).toBe('src/core/index.live.ts');
  });
  test("fixtures on (render, page gate, scenarios, tests): '@core' is the fixture barrel in both meanings", () => {
    const r = new TermResolver({ hub: HUB, fixtures: true });
    const t = r.resolve('@core', from);
    expect(t.kind === 'file' ? path.relative(HUB, t.path) : t.kind).toBe('src/core/index.fixtures.ts');
    expect(path.relative(HUB, (r.resolveWeb('@core', from) as { path: string }).path)).toBe('src/core/index.fixtures.ts');
  });
  test("'@core/<file>' is that file in both modes", () => {
    for (const fixtures of [false, true]) {
      const t = new TermResolver({ hub: HUB, fixtures }).resolve('@core/errors', from);
      expect(t.kind === 'file' ? path.relative(HUB, t.path) : t.kind).toBe('src/core/errors.ts');
    }
  });
  test('the ship transform (fixtures off) rewrites @core to the live barrel; the fixture transform to the fixture barrel', () => {
    const f = path.join(HUB, 'src', 'shell', 'probe-x.ts');
    const ship = transform(f, "import { queryClient } from '@core';\nexport const q = queryClient;\n", { flavour: 'strict', fixtures: false, mode: 'production' }).code;
    const dev = transform(f, "import { queryClient } from '@core';\nexport const q = queryClient;\n", { flavour: 'fixture', fixtures: true }).code;
    expect(ship).toContain('src/core/index.live.ts"');
    expect(ship).not.toContain('index.fixtures');
    expect(ship).not.toContain('src/core/index.ts"');
    expect(dev).toContain('src/core/index.fixtures.ts"');
  });
});
