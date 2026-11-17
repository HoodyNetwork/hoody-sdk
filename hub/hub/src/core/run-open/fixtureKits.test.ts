// runOpenFixture: the run-open machine over the fixture transport opens an app on the SDK's kit fake, each request on
// the program it names; and the fake stays fixture data (nothing outside fixture files reaches it).
import { globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetCore } from '../ctx';
import { installTransport, startFixtureMode } from '../transport';
import { runOpenFixture } from './fixtureKits';
import { createRunOpen } from './index';
import { RUN_OPEN_DECLARED, runOpenSend } from './send';

const TARGET = { project: { id: 'p1' }, container: { id: 'c1', server_name: 's1' } };
afterEach(() => { installTransport(null); });

describe('runOpenFixture', () => {
  it('one rule per run-open route', () => {
    const fx = runOpenFixture();
    expect(fx.rules.map((r) => r.route)).toEqual(RUN_OPEN_DECLARED.map((d) => d.route));
  });

  it('a launch through the machine: created, started, read running and closed, each call on the program it names', async () => {
    resetCore();
    const fx = runOpenFixture();
    startFixtureMode(fx.rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: TARGET });
    const k = fx.kits;
    const m = createRunOpen({ send: runOpenSend({ target: TARGET }), now: k.now, sleep: k.sleep, random: k.random });
    const r = await m.open({ app: 'htop' });
    expect([r.ok, r.state, r.handle?.terminal_id]).toEqual([true, 'started', 8001]);
    expect(k.executions).toBe(1);
    expect((await m.status(r.handle!)).state).toBe('running');
    const c = await m.close(r.handle!);
    expect([c.state, c.code]).toEqual(['stopped', 'stopped']);
    // The terminal's N from the query (create, execute, workloads, a signal) and from a DELETE's path.
    expect(k.deletes).toEqual([{ n: 8001, incarnation: r.handle!.incarnation }]);
    const at = (path: string) => [...new Set(k.of(path).map((s) => `${s.target.kit}-${s.target.index}`))];
    expect(at('/api/v1/run/resolve')).toEqual(['run-1']);
    expect(at('/api/v1/terminal/capabilities')).toEqual(['terminal-0']);
    for (const p of ['/api/v1/terminal/create', '/api/v1/terminal/execute', '/api/v1/terminal/workloads', '/api/v1/terminal/8001']) {
      expect(at(p), p).toEqual(['terminal-8001']);
    }
    const signals = k.sent.filter((s) => /^\/api\/v1\/terminal\/workloads\/\d+\/signal$/.test(s.path));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.target.kit === 'terminal' && s.target.index === 8001)).toBe(true);
    expect(k.sent.every((s) => Number.isInteger(s.target.index))).toBe(true);
  });

  it('a slow kit: the answers wait delayMs', async () => {
    resetCore();
    const fx = runOpenFixture({ delayMs: 40 });
    startFixtureMode(fx.rules, { realm: 'aaaaaaaaaaaaaaaaaaaaaaa1', target: TARGET });
    const t0 = Date.now();
    await runOpenSend({ target: TARGET })({ kit: 'run', index: 1 }, 'GET', '/api/v1/run/capabilities');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
  });
});

// Fixture data only: the fake (and the barrel's runOpenFixture) is named only by fixture files, tests and the barrel's
// one export line; the Open with fixture rules that load it are imported only by the apps page's fixtures.ts. No hand
// parser: TypeScript lists each source's module names (ts.preProcessFile: imports, re-exports, import() and require,
// comments skipped) and resolves them with the Hub's own tsconfig (ts.resolveModuleName: paths aliases, '..', source
// endings, allowJs), and a module counts by the file it resolves to. Vite's import.meta.glob() is an import too (Vite
// turns it into one): its calls are found in TypeScript's syntax tree and their patterns expanded the way Vite reads
// them (relative to the file, '/' = the Hub root, a tsconfig alias), each '!' pattern taking files away. Anything this
// reading does not model fails the scan instead of being guessed: patterns that are not literal or have no such base,
// any pattern syntax beyond plain names, '*' and '**' (Vite and node:fs read groups, braces, classes, '?' and a
// trailing '/' differently), and any option other than eager, import or query (base, caseSensitive and exhaustive
// change what matches; a spread or computed key could be any of them).
const SRC = join(import.meta.dirname, '..', '..');
const HUB = join(SRC, '..');
const FAKE = join(SRC, 'core/run-open/fixtureKits.ts');
const RULES = join(SRC, 'pages/apps/launch/openWith/fixtureRules.ts');
const SOURCE = /\.(?:tsx?|mts|cts|jsx?|mjs|cjs)$/;
const NOT_SHIPPED = /\.(?:test|spec)\.[^/]+$|(?:^|\/)fixtures(?:\.[^/]*)?\.[^./]+$|\.d\.[mc]?ts$/;

const config = ts.readConfigFile(join(HUB, 'tsconfig.json'), (f) => ts.sys.readFile(f));
const options = ts.parseJsonConfigFileContent(config.config, ts.sys, HUB).options;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') out.push(...walk(p)); continue; }
    if (SOURCE.test(name) && !NOT_SHIPPED.test(name)) out.push(p);
  }
  return out;
}

/** The files a source (at path `file`) imports, as TypeScript resolves them; a package or a name that resolves to
 *  nothing is left out. `cache`, when given, is the caller's resolution cache (one per scan). */
function importsOf(file: string, src: string, cache?: ts.ModuleResolutionCache): string[] {
  const named = ts.preProcessFile(src, true, true).importedFiles
    .map((m) => ts.resolveModuleName(m.fileName, file, options, ts.sys, cache).resolvedModule?.resolvedFileName)
    .filter((f): f is string => f !== undefined)
    .map((f) => join(f));
  // Only a source that spells the name glob (or could, through a unicode escape) can call import.meta.glob(): the rest skip the parse.
  const globs = /\bglob\b|\\u/.test(src) ? globsOf(file, src) : [];
  return [...named, ...globs.flatMap((g) => (g === null ? [UNFOLLOWED] : expandGlob(file, g)))];
}

/** Marks an import.meta.glob() call whose patterns are computed: no scan can say what it loads. */
const UNFOLLOWED = '<an import.meta.glob() with computed patterns>';
// tsconfig "<alias>/*" paths, as Vite's aliases name the same folders.
const ALIAS_DIRS = Object.entries(options.paths ?? {})
  .filter(([key, to]) => key.endsWith('/*') && to[0]?.endsWith('/*'))
  .map(([key, to]) => [key.slice(0, -1), join(String(options.pathsBasePath ?? HUB), to[0]!.slice(0, -1))] as const);

// The options that do not change which files a glob loads.
const PLAIN_OPTIONS = new Set(['eager', 'import', 'query']);
/** True when a glob's options argument is absent, or an object literal naming only PLAIN_OPTIONS. */
function optionsFollowable(opts: ts.Expression | undefined): boolean {
  if (opts === undefined) return true;
  if (!ts.isObjectLiteralExpression(opts)) return false;
  return opts.properties.every((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
    && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && PLAIN_OPTIONS.has(p.name.text));
}

/** The patterns of every import.meta.glob() call in a source (null: a call whose patterns are not literal). */
function globsOf(file: string, src: string): (string[] | null)[] {
  const kind = /\.[jt]sx$/.test(file) ? ts.ScriptKind.TSX : /\.[mc]?jsx?$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const lit = (n: ts.Node): string | null => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
  const out: (string[] | null)[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'glob'
      && ts.isMetaProperty(n.expression.expression) && n.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword) {
      const [arg, opts] = n.arguments;
      const one = arg === undefined ? null : lit(arg);
      const many = arg !== undefined && ts.isArrayLiteralExpression(arg) ? arg.elements.map(lit) : null;
      const patterns = one !== null ? [one] : many !== null && many.every((x) => x !== null) ? (many as string[]) : null;
      out.push(n.arguments.length <= 2 && optionsFollowable(opts) ? patterns : null);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// The pattern grammar both readers agree on: path segments of plain name characters and '*' / '**', no trailing '/'.
// Everything else (groups, braces, classes, '?', '+', a trailing '/') is not followed.
const PLAIN_PATTERN = /^\/?(?:[\w.~@*-]+\/)*[\w.~@*-]+$/;

/** The files one call's patterns match, read as Vite reads them; a pattern with no base Vite accepts is not followed. */
function expandGlob(file: string, patterns: readonly string[]): string[] {
  const absolute = (p: string): string | null => {
    if (p.startsWith('./') || p.startsWith('../')) return join(dirname(file), p);
    if (p.startsWith('/')) return join(HUB, p);
    const alias = ALIAS_DIRS.find(([prefix]) => p.startsWith(prefix));
    return alias ? join(alias[1], p.slice(alias[0].length)) : null;
  };
  // Unfollowed is kept apart from the matched files, so a '!' pattern can never take it away.
  let unfollowed = false;
  const take = (list: readonly string[]) => list.flatMap((p) => {
    const a = PLAIN_PATTERN.test(p) ? absolute(p) : null;
    if (a === null) { unfollowed = true; return []; }
    return globSync(a).map((f) => join(f));
  });
  const removed = new Set(take(patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1))));
  const kept = take(patterns.filter((p) => !p.startsWith('!'))).filter((f) => !removed.has(f));
  return unfollowed ? [...kept, UNFOLLOWED] : kept;
}

describe('the import scan', () => {
  const at = (path: string) => join(SRC, path);
  const USE = at('pages/apps/launch/openWith/useOpenWith.ts');
  it.each([
    ['a double-quoted relative import', USE, 'import { openWithFixtureRules } from "./fixtureRules";', RULES],
    ['a .ts ending', USE, "import { x } from './fixtureRules.ts';", RULES],
    ['an alias with a .js ending', USE, "import * as fake from '@core/run-open/fixtureKits.js';", FAKE],
    ['an alias with .. inside', USE, "import * as fake from '@core/run-open/../run-open/fixtureKits.js';", FAKE],
    ['a comment inside import()', USE, "const rules = await import(/* @vite-ignore */ './fixtureRules');", RULES],
    ['a side-effect import', at('pages/apps/logic.ts'), 'import "../../core/run-open/fixtureKits";', FAKE],
    ['a dynamic import', at('shell/x.tsx'), 'const m = await import(`../core/run-open/fixtureKits`);', FAKE],
    ['a re-export', at('core/index.ts'), "export * from './run-open/fixtureKits.js';", FAKE],
    ['a require', at('core/run-open/x.cjs'), "const f = require('./fixtureKits');", FAKE],
    ['a re-export from an .mts source', at('pages/apps/launch/openWith/liveRules.mts'), "export { openWithFixtureRules } from './fixtureRules';", RULES],
    ['an eager glob', USE, "const r = import.meta.glob('./fixtureRules.ts', { eager: true, import: 'openWithFixtureRules' });", RULES],
    ['a lazy glob through an alias', at('pages/apps/logic.ts'), "const f = import.meta.glob('@core/run-open/fixture*.ts');", FAKE],
    ['a glob from the Hub root', at('shell/x.tsx'), "const f = import.meta.glob<{ x: 1 }>(['/src/core/run-open/*.ts', '!/src/core/run-open/*.test.ts']);", FAKE],
    ['a glob in a .js source', at('core/run-open/x.js'), 'export const f = import.meta.glob(`./fixtureKits.ts`, { eager: true });', FAKE],
  ])('finds %s', (_name, from, src, want) => {
    expect(importsOf(from, src)).toContain(want);
  });
  it("a glob's '!' pattern takes its file away", () => {
    expect(importsOf(USE, "import.meta.glob(['./*.ts', '!./fixtureRules.ts']);")).not.toContain(RULES);
    expect(importsOf(USE, "import.meta.glob(['./*.ts']);")).toContain(RULES);
  });
  it('a glob it cannot follow is reported, never passed over', () => {
    expect(importsOf(USE, 'const p = "./fixtureRules.ts"; import.meta.glob(p);')).toContain(UNFOLLOWED);
    expect(importsOf(USE, "import.meta.glob(['./a.ts', p]);")).toContain(UNFOLLOWED);
    expect(importsOf(USE, "import.meta.glob('fixtureRules.ts');")).toContain(UNFOLLOWED);
  });
  it.each([
    ['a base option', "import.meta.glob('./fixtureKits.ts', { base: '/src/core/run-open', eager: true });"],
    ['a caseSensitive option', "import.meta.glob('./fixturerules.ts', { caseSensitive: false, eager: true });"],
    ['an exhaustive option', "import.meta.glob('./*.ts', { exhaustive: true });"],
    ['spread options', 'import.meta.glob("./*.ts", { ...o });'],
    ['options that are not an object literal', 'import.meta.glob("./*.ts", o);'],
    ['an extglob in a \'!\' pattern', "import.meta.glob(['./fixtureRules.ts', '!./+(fixtureRules).ts'], { eager: true });"],
    ['a bare group naming the rules', "import.meta.glob('./(fixtureRules|argv).ts', { eager: true });"],
    ['a bare group naming the fake from the root', "import.meta.glob('/src/core/run-open/(fixtureKits|send).ts', { eager: true });"],
    ['a trailing slash', "import.meta.glob('./fixture*.ts/', { eager: true });"],
    ['braces', "import.meta.glob('./{fixtureRules,argv}.ts');"],
    ['a class', "import.meta.glob('./fixture[R]ules.ts');"],
    ["a '?'", "import.meta.glob('./fixtureRule?.ts');"],
    ["an unbased pattern beside a '!' pattern", "import.meta.glob(['**/fixtureRules.ts', '!**/*.test.ts'], { eager: true });"],
  ])('%s is reported as unfollowed', (_name, src) => {
    expect(importsOf(USE, src)).toContain(UNFOLLOWED);
  });
  it('eager, import and query options are followed', () => {
    expect(importsOf(USE, "import.meta.glob('./fixtureRules.ts', { eager: true, import: 'x', query: '?raw' });")).toEqual([RULES]);
  });
  it('a near name, the barrel and a package are not the guarded modules', () => {
    const got = importsOf(USE, "import a from './fixtureRulesX';\nimport { b } from '@core';\nimport c from 'react';");
    expect(got.filter((f) => f.startsWith(SRC))).toEqual([join(SRC, 'core/index.ts')]); // react resolves into node_modules
  });
});

describe('the launch fake is fixture data', () => {
  const files = walk(SRC).map((f) => [f, readFileSync(f, 'utf8')] as const);
  const rel = (f: string) => relative(SRC, f);
  // One scan per describe (it costs seconds under load, so it runs in beforeAll, outside any test's own timeout): every
  // source's imports are read once, with one resolution cache; importersOf only filters that graph.
  const resolution = ts.createModuleResolutionCache(HUB, (f) => (ts.sys.useCaseSensitiveFileNames ? f : f.toLowerCase()), options);
  let graph: (readonly [string, string[]])[] | undefined;
  beforeAll(() => { graph = files.map(([f, src]) => [f, importsOf(f, src, resolution)] as const); }, 120_000);
  const importersOf = (target: string) => graph!.filter(([, imports]) => imports.includes(target)).map(([f]) => rel(f));

  it('the scan sees the Hub (a walk that silently stopped matching would pass)', () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files.some(([f]) => rel(f) === 'core/run-open/run-open-core.js')).toBe(true);
    expect(files.find(([f]) => f === RULES)?.[1]).toMatch(/runOpenFixture/);
    expect(files.some(([f]) => /\.(?:test|spec)\./.test(f) || rel(f) === 'pages/apps/fixtures.ts')).toBe(false);
  });

  it('nothing outside fixture files names runOpenFixture', () => {
    const allowed = new Set([join(SRC, 'core/index.ts'), FAKE, RULES]);
    expect(files.filter(([f, src]) => !allowed.has(f) && /\brunOpenFixture\b/.test(src)).map(([f]) => rel(f))).toEqual([]);
  });

  it('only the barrel imports the fake, once, and nothing outside fixtures.ts imports the fixture rules', () => {
    expect(importersOf(FAKE)).toEqual(['core/index.ts']);
    expect(files.find(([f]) => rel(f) === 'core/index.ts')![1].match(/fixtureKits/g)).toHaveLength(1);
    expect(importersOf(RULES)).toEqual([]);
  });

  it("every shipped import.meta.glob() can be followed, and the scan follows the Hub's own (the page list)", () => {
    expect(importersOf(UNFOLLOWED)).toEqual([]);
    const pages = files.find(([f]) => rel(f) === 'app/pages.ts')!;
    expect(importsOf(pages[0], pages[1])).toContain(join(SRC, 'pages/apps/page.ts'));
  });
});
