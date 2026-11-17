// The contract of the shared Playwright pages in e2e.ts: a spec that takes `hubPage` / `hubPageCoarse`
// borrows one worker-wide context, so it may not change what a new context would not have. The fixture wipes storage,
// cookies, permissions, routes, media and viewport at every lend; init scripts, exposed bindings, geolocation, grants,
// extra headers, offline mode and per-file `test.use` options are not undoable, so a spec that needs one takes the
// built-in `page` instead. The scan reads the borrower's own syntax tree only, so a borrower may name no module that runs code
// but `@playwright/test`, the e2e.ts fixtures and JSON data files (see dataModule): a helper could install what the scan
// forbids. A JSON import is data only when its specifier ends in `.json` AND the file it names (resolved from the borrower,
// or through one of four aliases) lies under hub/src, has no symlink anywhere on its path, and is a regular file
// (dataFileProblem): a `../` that leaves src, a directory or fifo named `x.json`, or a symlinked folder on the way would
// otherwise let a `.json` specifier reach code. Left open: a spec may mutate an imported JSON object, which reaches only
// that Node worker's later specs, never the shared browser page.
// Event listeners a test adds are not forbidden: the lend removes them (e2e.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..');
const FORBIDDEN = /(\.(addInitScript|exposeBinding|exposeFunction|route|routeFromHAR|setGeolocation|grantPermissions|setExtraHTTPHeaders|setOffline|setDefaultTimeout|setDefaultNavigationTimeout)|\btest\.use)\s*\(/;
const BORROWS = /\bhubPage(Coarse)?\b/;
const FIXTURE_MODULES = new Set(['@playwright/test', '@app/e2e']);
const ALIAS = /^@(kit|core|app|shell)\//;

/** A JSON data file named by a relative path (leading './' or '../' only) or an alias path, with no '.', '..' or empty segment after that start. Any other shape (a query, a bare package, a computed name, another extension) is not one. */
function dataModule(from: string): boolean {
  if (!/^[\w@./-]+\.json$/.test(from)) return false;
  const alias = ALIAS.exec(from);
  const start = alias ?? /^(\.\/|(\.\.\/)+)/.exec(from);
  if (!start) return false;
  const parts = from.slice(start[0].length).split('/');
  return parts.every((p) => p !== '' && p !== '.' && p !== '..') && parts[parts.length - 1] !== '.json';
}

/** Where a borrower sits: its file and the source root its imports must stay under (hub/src, or a test fixture's). */
interface Where { file: string; root: string }

/** Why the file a data specifier names is not plain data, or null. Resolved the way Node and Vite do: from the borrower's real folder, or under the alias's folder in the root. */
function dataFileProblem(from: string, where: Where): string | null {
  const root = realpathSync(where.root);
  const alias = ALIAS.exec(from);
  const path = alias ? join(root, alias[1]!, from.slice(alias[0].length)) : resolve(realpathSync(dirname(where.file)), from);
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return 'leaves hub/src';
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return 'does not exist';
  }
  if (real !== path) return 'has a symlink on its path';
  return lstatSync(path).isFile() ? null : 'is not a regular file';
}

/** Why a borrower may not name this module, or null. */
function moduleProblem(from: string, where: Where): string | null {
  if (FIXTURE_MODULES.has(from)) return null;
  if (!dataModule(from)) return 'a borrower names only @playwright/test, @app/e2e and JSON data files';
  const problem = dataFileProblem(from, where);
  return problem ? `a JSON data file that ${problem}` : null;
}
/** Every module a file names, read from its syntax tree: import and export declarations, import(), import('x') in a type, require(). A string that is not a literal counts as '<computed>'. */
function moduleRefs(text: string): string[] {
  const refs: string[] = [];
  const literal = (n: ts.Node | undefined): string => (n && ts.isStringLiteralLike(n) ? n.text : '<computed>');
  const visit = (n: ts.Node): void => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) refs.push(literal(n.moduleSpecifier));
    else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) refs.push(literal(n.moduleReference.expression));
    else if (ts.isImportTypeNode(n)) refs.push(ts.isLiteralTypeNode(n.argument) ? literal(n.argument.literal) : '<computed>');
    else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) refs.push(literal(n.arguments[0]));
    ts.forEachChild(n, visit);
  };
  visit(ts.createSourceFile('spec.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return refs;
}

/** What a spec that borrows a shared page may not do; nothing for a spec that does not borrow one. */
function sharedPageViolations(text: string, where: Where = fixture.at): string[] {
  if (!BORROWS.test(text)) return [];
  const lines = text.split('\n').flatMap((line, i) => (FORBIDDEN.test(line) ? [`line ${i + 1}: ${line.trim()}`] : []));
  const imports = moduleRefs(text).flatMap((from) => {
    const problem = moduleProblem(from, where);
    return problem ? [`module '${from}': ${problem}`] : [];
  });
  return [...lines, ...imports];
}

/** The folder the fixture is made in: `tmp`, which must lie outside the source tree. The fixture holds the very directories and symlinks named `*.json` that the tree row below forbids under hub/src, so a TMPDIR inside it would fail that row for the wrong reason. Both sides are resolved, so a symlinked TMPDIR counts. */
function fixtureBase(tmp: string, src: string): string {
  const base = realpathSync(tmp);
  const rel = relative(realpathSync(src), base);
  if (rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel))) throw new Error(`TMPDIR (${base}) is inside hub/src: point it elsewhere, the contract fixture must not live in the scanned tree`);
  return base;
}

/** A fresh temp folder under `base` for `build`, removed after the run (`later` takes the cleanup: the suite's afterAll). The cleanup is registered before `build` runs, and the folder goes at once if `build` throws, so a failed setup leaves nothing behind. */
function inTempDir<T>(base: string, build: (dir: string) => T, later: (cleanup: () => void) => unknown = afterAll): T {
  const dir = realpathSync(mkdtempSync(join(base, 'e2e-contract-')));
  later(() => rmSync(dir, { recursive: true, force: true }));
  try {
    return build(dir);
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

function makeFixture(): { dir: string; at: Where; fifo: boolean } {
  return inTempDir(fixtureBase(tmpdir(), SRC), buildFixture);
}

/** A small source tree in `dir` for the rows: the data files a borrower may name, and every way a .json specifier could reach something else. */
function buildFixture(dir: string): { dir: string; at: Where; fifo: boolean } {
  const root = join(dir, 'src');
  const put = (rel: string, text = '{}\n') => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  for (const f of ['pages/p/a.spec.ts', 'pages/p/strings.en.json', 'pages/p/x.json', 'pages/strings.en.json', 'pages/ai/strings.en.json', 'pages/gallery/table.strings.en.json', 'kit/strings.en.json', 'kit/pickers/ModelChooser.strings.en.json', 'shell/strings.en.json', 'core/a/b.json']) put(`src/${f}`);
  put('src/pages/p/dir.json/index.js', 'module.exports = 1;\n');
  put('outside/helper.json');
  put('outside/dir.json/index.js', 'module.exports = 1;\n');
  symlinkSync('../strings.en.json', join(root, 'pages/p/link.json'));
  symlinkSync(join(dir, 'outside'), join(root, 'kit/link'));
  const fifo = process.platform !== 'win32' && spawnSync('mkfifo', [join(root, 'pages/p/fifo.json')]).status === 0;
  return { dir, at: { file: join(root, 'pages/p/a.spec.ts'), root }, fifo };
}
const fixture = makeFixture();


const specs = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).map((f) => f.split(sep).join('/')).filter((f) => f.endsWith('.spec.ts'));
const borrowers = specs.filter((f) => BORROWS.test(readFileSync(join(SRC, f), 'utf8')));

describe('specs that borrow a shared Hub page', () => {
  it('the scan sees the specs that borrow one', () => {
    expect(borrowers).toContain('pages/logs/widths.spec.ts');
  });

  it.each(borrowers)('%s makes no call a shared context cannot undo, and imports no helper', (f) => {
    expect(sharedPageViolations(readFileSync(join(SRC, f), 'utf8'), { file: join(SRC, f), root: SRC })).toEqual([]);
  });

  it('flags each undoable call, and only in a spec that borrows', () => {
    for (const call of ['page.addInitScript(() => 1)', 'page.exposeBinding("x", () => 1)', 'page.exposeFunction("x", () => 1)', 'page.route("**", (r) => r.abort())', 'context.setGeolocation({ latitude: 1, longitude: 1 })', 'context.grantPermissions(["geolocation"])', 'page.setExtraHTTPHeaders({})', 'context.setOffline(true)', 'test.use({ locale: "de" })']) {
      expect(sharedPageViolations(`test('t', async ({ hubPage: page }) => { await ${call}; });`), call).toHaveLength(1);
      expect(sharedPageViolations(`test('t', async ({ page }) => { await ${call}; });`), call).toEqual([]);
    }
  });

  it('flags a module that could run a helper, and allows the fixtures and JSON', () => {
    const body = "test('t', async ({ hubPage: page }) => { await setup(page); });";
    for (const from of ['./helpers', '../logs/helpers', '@core', '../../kit/x']) {
      expect(sharedPageViolations(`import { setup } from '${from}';\n${body}`), from).toHaveLength(1);
    }
    expect(sharedPageViolations(`import './side-effect';\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`export { setup } from './helpers';\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`const h = await import('./helpers');\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`const h = require('./helpers');\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`import h = require('./helpers');\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`type Helper = typeof import('./helpers');\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`let h: import('./helpers').Setup;\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`type P = import('@playwright/test').Page;\n${body}`)).toEqual([]);
    expect(sharedPageViolations(`const h = await import(name);\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`import {\n  setup,\n} from './helpers';\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`import { setup } from './helpers';\ntest('t', async ({ page }) => { await setup(page); });`)).toEqual([]);
  });

  it('allows JSON data files by relative or alias path, and nothing that could be code', () => {
    const body = "test('t', async ({ hubPage: page }) => { await page.goto('x'); });";
    for (const from of ['./strings.en.json', '../strings.en.json', '../../pages/ai/strings.en.json', '../gallery/table.strings.en.json', '@kit/strings.en.json', '@kit/pickers/ModelChooser.strings.en.json', '@shell/strings.en.json', '@core/a/b.json']) {
      expect(sharedPageViolations(`import s from '${from}';\n${body}`), from).toEqual([]);
    }
    for (const from of ['./helper.json.ts', './helper.ts', '../x.json?raw', './x.json?url', 'pkg/data.json', 'data.json', '@ask/io.json', '@pages/x.json', '@kit/../x.json', '@kit/a/../x.json', '../a/../x.json', './a/./x.json', './/x.json', '../.json', './.json', '/abs/x.json', 'file:///x.json', 'https://x.test/a.json', './x json.json', './x.JSON.js']) {
      expect(sharedPageViolations(`import s from '${from}';\n${body}`), from).toHaveLength(1);
    }
    expect(sharedPageViolations(`const j = await import('./x.json');\n${body}`)).toEqual([]);
    expect(sharedPageViolations(`const j = await import(name + '.json');\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`const j = require('./x.json' + y);\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`type T = typeof import('./x.json');\n${body}`)).toEqual([]);
  });

  it('refuses a JSON specifier whose file leaves hub/src, sits behind a symlink, or is not a regular file', () => {
    const body = "test('t', async ({ hubPage: page }) => { await page.goto('x'); });";
    const cases: Record<string, string> = {
      '../../../outside/helper.json': 'leaves hub/src',
      '../../../outside/dir.json': 'leaves hub/src',
      '../../../../tmp/x.json': 'leaves hub/src',
      '@kit/link/helper.json': 'has a symlink on its path',
      './link.json': 'has a symlink on its path',
      './dir.json': 'is not a regular file',
      './missing.json': 'does not exist',
      '../p/../p/x.json': 'shape',
    };
    for (const [from, why] of Object.entries(cases)) {
      const got = sharedPageViolations(`import s from '${from}';\n${body}`);
      expect(got, from).toHaveLength(1);
      if (why !== 'shape') expect(got[0], from).toContain(why);
    }
    expect(sharedPageViolations(`const s = require('../../../outside/helper.json');\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`import s from './x.json';\n${body}`)).toEqual([]);
  });

  it.skipIf(!fixture.fifo)('refuses a JSON specifier that names a fifo (a non-regular file, skipped when the file system cannot make one)', () => {
    const got = sharedPageViolations("import s from './fifo.json';\ntest('t', async ({ hubPage: page }) => { await page.goto('x'); });");
    expect(got).toHaveLength(1);
    expect(got[0]).toContain('is not a regular file');
  });

  it('no directory or symlink under hub/src is named like a JSON file, so a .json specifier always names a regular data file', () => {
    const odd = readdirSync(SRC, { recursive: true, encoding: 'utf8', withFileTypes: true }).filter((d) => d.name.endsWith('.json') && (d.isDirectory() || d.isSymbolicLink()));
    expect(odd.map((d) => join(d.parentPath, d.name))).toEqual([]);
  });

  it('the fixture folder must lie outside hub/src: the temp folder itself, a folder inside the tree, the tree, or a symlink into it', () => {
    expect(fixtureBase(tmpdir(), SRC)).toBe(realpathSync(tmpdir()));
    expect(() => fixtureBase(join(SRC, 'app'), SRC)).toThrow(/inside hub\/src/);
    expect(() => fixtureBase(SRC, SRC)).toThrow(/inside hub\/src/);
    const viaLink = join(fixture.dir, 'into-src');
    symlinkSync(SRC, viaLink);
    expect(() => fixtureBase(viaLink, SRC)).toThrow(/inside hub\/src/);
  });

  it('the temp folder is registered for cleanup before the setup runs, and a setup that throws leaves nothing behind', () => {
    const hooks: Array<() => void> = [];
    let made = '';
    expect(() => inTempDir(fixtureBase(tmpdir(), SRC), (dir) => { made = dir; expect(hooks).toHaveLength(1); throw new Error('setup failed'); }, (fn) => hooks.push(fn))).toThrow('setup failed');
    expect(made).not.toBe('');
    expect(existsSync(made)).toBe(false);
    const kept = inTempDir(fixtureBase(tmpdir(), SRC), (dir) => dir, (fn) => hooks.push(fn));
    expect(existsSync(kept)).toBe(true);
    hooks.forEach((fn) => fn());
    expect(existsSync(kept)).toBe(false);
  });

  it('reads two declarations on one line, and ignores import-shaped text in comments and strings', () => {
    const body = "test('t', async ({ hubPage: page }) => { await page.goto('x'); });";
    expect(sharedPageViolations(`import { test } from '@app/e2e'; import './helper';\n${body}`)).toHaveLength(1);
    expect(sharedPageViolations(`import { test } from '@app/e2e'; import { a } from './h1'; import { b } from './h2';\n${body}`)).toHaveLength(2);
    expect(sharedPageViolations(`/*\nimport { setup } from './helpers';\nrequire('./helpers');\n*/\n// import './helper';\nconst s = "import x from './helpers'; import('./h')";\nconst t = \`import './helper'\`;\nimport { gotoHub, test } from '@app/e2e';\n${body}`)).toEqual([]);
    expect(sharedPageViolations(`import { type Page, expect } from '@playwright/test';\nimport { gotoHub, test } from '@app/e2e';\nimport strings from './strings.en.json';\n${body}`)).toEqual([]);
  });
});
