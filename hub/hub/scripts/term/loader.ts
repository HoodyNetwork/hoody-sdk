// The Bun loader of the terminal Hub: one runtime plugin that loads every file under hub/src by the rules of
// resolve.ts (the one resolver). Bun calls a runtime plugin's onLoad for each module but its onResolve only for the
// entry (checked on Bun 1.4.4), so each file's import specifiers are rewritten to the resolved absolute paths as it
// loads. The ship bundler (build.ts) uses the same transform().
//
//   import { installTermLoader } from './loader';
//   installTermLoader({ flavour: 'fixture', fixtures: true });
//
// Flavours:
//   'fixture' (dev runner, render, tests; 'dev' is an old name for it): a web-only file without a sibling, and what a
//     partial sibling lacks, become stand-ins (placeholder.ts: components draw a labelled box, every other export
//     throws TERM_UNSUPPORTED when used); each is recorded.
//   'strict' (and the ship build): any stand-in is an error naming the module (TERM_WEB_ONLY, TERM_SIBLING_PARTIAL).
// In every flavour: a sibling importing a web-only package is TERM_WEB_ONLY_SIBLING; require() and a dynamic import
// with a non-literal argument are TERM_IMPORT_FORM; an unresolvable import is TERM_UNRESOLVED.
//
// Rewriting is by syntax (the TypeScript AST of the emitted JavaScript): only real module specifier literals change, so
// a string that merely looks like an import stays as written. Defines are applied by Bun's transpiler (syntax, not
// text), also on the classic-JSX fallback. Every option (flavour, fixtures, page, mode) keys an immutable transform
// context: two option sets in one process never share a transpiler.
import fs from 'node:fs';
import path from 'node:path';
import { plugin } from 'bun';
import ts from 'typescript';
import { HUB, JSX_DIR, PACKAGE_ALIASES, PRIM_DIR, SRC, TwinValueImport, cssModuleSource, isSibling, resolverFor, stemOf, termResolver, webOnlyReason, type Resolved, type TermResolver } from './resolve';
import { fillSibling, readAllowances, synthesize } from './placeholder';
import { historyBlockers, LIB_DOM_JSX, libDomJsx, TANSTACK_HISTORY } from './fork-deltas';
import { PROBE_FILES, rewriteProbes } from '../../src/term/env/strict-probes';
import { codeStamp, hashText, TransformCache, transformCacheOn, type CachedTransform } from './transform-cache';

export type Flavour = 'fixture' | 'strict';
export interface TermLoaderOptions {
  /** 'dev' is accepted as the old name of 'fixture'. */
  flavour: Flavour | 'dev';
  /** The value of __HUB_FIXTURES__. */
  fixtures: boolean;
  /** hub:dev --page: the value of __HUB_PAGE__. */
  page?: string;
  /** import.meta.env.MODE; default: 'test' under NODE_ENV=test, else 'development' (fixture) / 'production' (strict). */
  mode?: 'development' | 'production' | 'test';
}

export interface LoadRecord {
  file: string;
  kind: 'shared' | 'sibling' | 'placeholder';
  reason?: string;
  /** A sibling: the web twin's exports it lacks (names, 'default', '* from <spec>'). */
  missing?: string[];
}

const records: LoadRecord[] = [];
/** Every hub/src module loaded so far, in load order (the coverage board reads this). */
export const loadRecords = (): readonly LoadRecord[] => records;
const stylesheets = new Set<string>();
/** Every hub/src CSS module imported so far (absolute paths): goldens' --affected selects a page by the stylesheets its
 *  modules import. */
export const stylesheetRecords = (): readonly string[] => [...stylesheets];

export const ASSET_STUB = path.join(SRC, 'term', 'asset-stub.ts');
const CLASSIC = path.join(JSX_DIR, 'classic.ts');

/** A loader error with a stable code (the build and the runners print `code: message`). */
export class TermLoadError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`); this.name = 'TermLoadError'; }
}
const rel = (f: string): string => path.relative(HUB, f);

// ---------------------------------------------------------------------------------------------------------------------
// Transform contexts

interface Normalized { flavour: Flavour; fixtures: boolean; page: string; mode: 'development' | 'production' | 'test' }
type Transpiler = InstanceType<typeof Bun.Transpiler>;

export class TransformContext {
  readonly key: string;
  readonly options: Readonly<Normalized>;
  private readonly tsx: Transpiler;
  private readonly tsT: Transpiler;
  private readonly js: Transpiler;
  readonly allow: ReadonlySet<string>;

  constructor(o: TermLoaderOptions) {
    this.options = Object.freeze(normalize(o));
    this.key = contextKey(this.options);
    const define = defines(this.options);
    const tsconfig = JSON.stringify({ compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react', verbatimModuleSyntax: true } });
    this.tsx = new Bun.Transpiler({ loader: 'tsx', target: 'bun', autoImportJSX: true, define, tsconfig });
    this.tsT = new Bun.Transpiler({ loader: 'ts', target: 'bun', autoImportJSX: true, define, tsconfig });
    this.js = new Bun.Transpiler({ loader: 'js', target: 'bun', define });
    this.allow = this.options.flavour === 'fixture' ? readAllowances() : new Set();
  }

  /** One hub/src source file to the JavaScript the terminal runs. */
  transform(file: string, source: string, resolver: TermResolver = resolverFor(this.options.fixtures)): { code: string; record: LoadRecord } {
    const o = this.options;
    const sibling = isSibling(file);
    let record: LoadRecord = { file, kind: sibling ? 'sibling' : 'shared' };
    let src = source;
    // An X.web.ts is the web half of a pair by its name: it reaching the terminal means its X.web.term.ts is missing
    // (the resolver selects the neighbour whenever it exists). Strict refuses it whatever its imports look like.
    if (!sibling && o.flavour === 'strict' && /\.web\.(tsx?|mts)$/.test(file)) throw new TermLoadError('TERM_WEB_NEIGHBOUR', `${rel(file)} is a web-only file by name and has no ${path.basename(file).replace(/\.web\.(tsx?|mts)$/, '.web.term.$1')} neighbour`);
    const reason = webOnlyReason(valueImportSpecs(file, source));
    if (reason && sibling) throw new TermLoadError('TERM_WEB_ONLY_SIBLING', `${rel(file)} is a terminal sibling but imports a browser package (${reason})`);
    if (reason) {
      if (o.flavour === 'strict') throw new TermLoadError('TERM_WEB_ONLY', `${rel(file)} (${reason}) has no .term sibling`);
      src = synthesize(file, source, reason, { allow: this.allow });
      record = { file, kind: 'placeholder', reason };
    }
    if (sibling) {
      const web = termResolver.baseOf(file);
      if (web) {
        const fill = fillSibling(web, fs.readFileSync(web, 'utf8'), source, { allow: this.allow });
        if (fill.missing.length && o.flavour === 'strict') throw new TermLoadError('TERM_SIBLING_PARTIAL', `${rel(file)} lacks ${fill.missing.join(', ')}`);
        src = source + fill.append;
        if (fill.missing.length) record.missing = fill.missing;
      }
    }
    const js = this.transpile(file, expandGlobs(file, src));
    return { code: rewriteImports(file, js, resolver), record };
  }

  /** Bun's transpiler refuses `<X {...p} key={k} />` in the automatic runtime; such a file goes through TypeScript with
   *  the classic factory (src/term/jsx/classic.ts, the same DOM-tag rule), then through Bun's JS transpiler for the
   *  defines (syntax, never text replacement). */
  private transpile(file: string, code: string): string {
    // A classic script (.js with no module syntax, e.g. core/run-open/run-open-core.js, an IIFE on globalThis) is served
    // as written plus `export {}`: Bun treats plugin-served code without module syntax that names top-level `this` or
    // `exports` as CommonJS and never runs it for a side-effect import (the global stayed undefined; Bun 1.4.4, probe
    // in loader.term.test). As a module its top-level `this` is undefined, which such scripts already handle
    // (`typeof globalThis !== 'undefined' ? globalThis : this`). The Bun transpiler is skipped: it rewrites `this` to
    // `exports`.
    if (/\.[cm]?js$/.test(file) && isClassicScript(file, code)) return code + '\nexport {};\n';
    const t = /\.[cm]?tsx$/.test(file) ? this.tsx : this.tsT;
    try {
      return t.transformSync(code);
    } catch (e) {
      if (!/spread/.test(String((e as Error)?.message ?? e))) throw e;
      const out = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: { jsx: ts.JsxEmit.React, jsxFactory: '__hubH', jsxFragmentFactory: '__hubF', module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, verbatimModuleSyntax: true },
      }).outputText;
      const real = file.startsWith(PRIM_DIR + path.sep) || file.startsWith(JSX_DIR + path.sep);
      const factory = real ? `import { createElement as __hubH, Fragment as __hubF } from "react";\n` : `import { h as __hubH, Fragment as __hubF } from ${JSON.stringify(CLASSIC)};\n`;
      return this.js.transformSync(factory + out);
    }
  }
}

function normalize(o: TermLoaderOptions): Normalized {
  const flavour: Flavour = o.flavour === 'dev' ? 'fixture' : o.flavour;
  if (flavour !== 'fixture' && flavour !== 'strict') throw new TermLoadError('TERM_LOADER_OPTIONS', `unknown flavour ${String(o.flavour)}`);
  const mode = o.mode ?? (process.env.NODE_ENV === 'test' ? 'test' : flavour === 'fixture' ? 'development' : 'production');
  return { flavour, fixtures: o.fixtures === true, page: o.page ?? '', mode };
}
const contextKey = (n: Normalized): string => JSON.stringify([n.flavour, n.fixtures, n.page, n.mode]);

function defines(o: Normalized): Record<string, string> {
  return {
    __HUB_FIXTURES__: String(o.fixtures),
    __HUB_PAGE__: JSON.stringify(o.page),
    'import.meta.env.DEV': String(o.mode !== 'production'),
    'import.meta.env.PROD': String(o.mode === 'production'),
    'import.meta.env.MODE': JSON.stringify(o.mode),
  };
}

const contexts = new Map<string, TransformContext>();
/** The (cached, immutable) context of exactly these options. */
export function transformContext(o: TermLoaderOptions): TransformContext {
  const key = contextKey(normalize(o));
  let c = contexts.get(key);
  if (!c) { c = new TransformContext(o); contexts.set(key, c); }
  return c;
}

/** One hub/src source file to the JavaScript the terminal runs, under these options. */
export function transform(file: string, source: string, o: TermLoaderOptions): { code: string; record: LoadRecord } {
  return transformContext(o).transform(file, source);
}

// ---------------------------------------------------------------------------------------------------------------------
// Syntax

const kindOf = (file: string): ts.ScriptKind => (/\.[cm]?tsx$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?jsx$/.test(file) ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);

/** The specifiers a TS/TSX source imports for VALUES (type-only imports and exports left out). */
export function valueImportSpecs(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kindOf(file));
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      const typeOnly = !!c && (c.isTypeOnly || (!c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typeOnly) out.push(n.moduleSpecifier.text);
      return;
    }
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const typeOnly = n.isTypeOnly || (!!n.exportClause && ts.isNamedExports(n.exportClause) && n.exportClause.elements.length > 0 && n.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typeOnly) out.push(n.moduleSpecifier.text);
      return;
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) out.push(n.arguments[0].text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

interface Edit { start: number; end: number; text: string }
function applyEdits(code: string, edits: Edit[]): string {
  edits.sort((a, b) => b.start - a.start);
  let s = code;
  for (const e of edits) s = s.slice(0, e.start) + e.text + s.slice(e.end);
  return s;
}

/** A literal argument's value (strings, arrays, plain objects, booleans, numbers), or throws TERM_IMPORT_FORM. */
function literal(n: ts.Expression, file: string, what: string): unknown {
  if (ts.isStringLiteralLike(n)) return n.text;
  if (n.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (n.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isNumericLiteral(n)) return Number(n.text);
  if (ts.isArrayLiteralExpression(n)) return n.elements.map((e) => literal(e, file, what));
  if (ts.isObjectLiteralExpression(n)) {
    const o: Record<string, unknown> = {};
    for (const p of n.properties) {
      if (!ts.isPropertyAssignment(p) || !(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) throw new TermLoadError('TERM_IMPORT_FORM', `${rel(file)}: ${what} takes literal options only`);
      o[p.name.text] = literal(p.initializer, file, what);
    }
    return o;
  }
  if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n) || ts.isParenthesizedExpression(n)) return literal(n.expression, file, what);
  throw new TermLoadError('TERM_IMPORT_FORM', `${rel(file)}: ${what} takes literal arguments only (found ${ts.SyntaxKind[n.kind]})`);
}

const isImportMetaGlob = (n: ts.Node): n is ts.CallExpression =>
  ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'glob'
  && ts.isMetaProperty(n.expression.expression) && n.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword;

/** import.meta.glob(patterns, { eager?, import? }) with literal arguments, expanded as Vite does (by syntax). */
export function expandGlobs(file: string, code: string): string {
  if (!code.includes('import.meta.glob')) return code;
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, kindOf(file));
  const head: string[] = [];
  const edits: Edit[] = [];
  let n = 0;
  const dir = path.dirname(file);
  const visit = (node: ts.Node): void => {
    if (isImportMetaGlob(node)) {
      const [patArg, optArg] = node.arguments;
      if (!patArg) throw new TermLoadError('TERM_IMPORT_FORM', `${rel(file)}: import.meta.glob() without a pattern`);
      const pat = literal(patArg, file, 'import.meta.glob') as string | string[];
      const opt = (optArg ? literal(optArg, file, 'import.meta.glob') : {}) as { eager?: boolean; import?: string };
      const pats = Array.isArray(pat) ? pat : [pat];
      const neg = pats.filter((p) => p.startsWith('!')).map((p) => new Bun.Glob(path.resolve(dir, p.slice(1))));
      const hits = new Set<string>();
      for (const p of pats.filter((x) => !x.startsWith('!'))) {
        // Bun.Glob does not walk '..': scan from the pattern's fixed directory prefix.
        const abs = path.resolve(dir, p);
        const star = abs.search(/[*?{[]/);
        const root = star < 0 ? path.dirname(abs) : abs.slice(0, abs.lastIndexOf('/', star));
        for (const m of new Bun.Glob(abs.slice(root.length + 1)).scanSync({ cwd: root, absolute: true })) hits.add(m);
      }
      const files = [...hits].filter((f) => !neg.some((g) => g.match(f)) && !isSibling(f)).sort();
      const relOf = (f: string): string => { const r = path.relative(dir, f); return r.startsWith('.') ? r : './' + r; };
      const id = n++;
      const pick = opt.import ? '.' + opt.import : '';
      const entries = files.map((f, i) => {
        const key = JSON.stringify(relOf(f));
        if (opt.eager) { head.push(`import * as __glob${id}_${i} from ${key};`); return `${key}: __glob${id}_${i}${pick}`; }
        return `${key}: () => import(${key})${opt.import ? `.then((m) => m${pick})` : ''}`;
      });
      edits.push({ start: node.getStart(sf), end: node.end, text: `({ ${entries.join(', ')} })` });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) return code;
  return head.join('\n') + (head.length ? '\n' : '') + applyEdits(code, edits);
}

const aliasFile = new Map<string, string>();
/** The absolute file a PACKAGE_ALIASES target names. */
export function packageAliasFile(to: string): string {
  let f = aliasFile.get(to);
  if (!f) {
    // The target is a file inside the package (its exports map may not list it): resolve the package root first.
    const parts = to.split('/');
    const name = to.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
    const root = path.dirname(Bun.resolveSync(name + '/package.json', SRC));
    f = fs.realpathSync(path.join(root, to.slice(name.length + 1)));
    aliasFile.set(to, f);
  }
  return f;
}

/** The specifier the emitted code should carry for a resolution, or null for "drop this import statement". */
function target(r: Resolved, spec: string, file: string, typeResidue: boolean): string | null {
  switch (r.kind) {
    case 'file': case 'jsx': case 'cssModule': case 'raw': case 'external': return r.path;
    case 'asset': return ASSET_STUB;
    case 'package': return r.alias ? packageAliasFile(r.alias) : spec;
    case 'twin': if (typeResidue) return null; throw new TwinValueImport(r.sibling);
    case 'missing': throw new TermLoadError('TERM_UNRESOLVED', `${spec} from ${rel(file)}`);
  }
}

/** Rewrites the module specifiers of emitted JavaScript to the files the terminal loads (by syntax). */
export function rewriteImports(file: string, js: string, resolver: TermResolver = termResolver): string {
  const sf = ts.createSourceFile(file + '.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits: Edit[] = [];
  const put = (lit: ts.StringLiteralLike, to: string): void => { if (to !== lit.text) edits.push({ start: lit.getStart(sf), end: lit.end, text: JSON.stringify(to) }); };
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const c = n.importClause;
      // `import { type A } from './X'` keeps an empty `import {}` under verbatimModuleSyntax: no runtime binding.
      const residue = !!c && !c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length === 0;
      const spec = n.moduleSpecifier.text;
      // A residue of the file's own twin is dropped (target() returns null for 'twin'); resolving it typeOnly would
      // keep `import {}` of the WEB base, a side-effect import that loads it.
      const r = resolver.resolve(spec, file);
      const to = target(r, spec, file, residue);
      if (to === null) { edits.push({ start: n.getStart(sf), end: n.end, text: '' }); return; }
      put(n.moduleSpecifier, to);
      if (r.kind === 'raw' && !n.attributes) edits.push({ start: n.moduleSpecifier.end, end: n.moduleSpecifier.end, text: ' with { type: "text" }' });
      return;
    }
    if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      const r = resolver.resolve(spec, file);
      put(n.moduleSpecifier, target(r, spec, file, false)!);
      if (r.kind === 'raw' && !n.attributes) edits.push({ start: n.moduleSpecifier.end, end: n.moduleSpecifier.end, text: ' with { type: "text" }' });
      return;
    }
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const a = n.arguments[0];
      if (!a || !ts.isStringLiteralLike(a)) throw new TermLoadError('TERM_IMPORT_FORM', `${rel(file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: import() with a non-literal argument bypasses sibling selection; import a literal path (or use import.meta.glob)`);
      const r = resolver.resolve(a.text, file);
      put(a, target(r, a.text, file, false)!);
      if (r.kind === 'raw') throw new TermLoadError('TERM_IMPORT_FORM', `${rel(file)}: import() of ?raw text is not supported; use a static import`);
    } else if (ts.isCallExpression(n) && isRequire(n.expression)) {
      throw new TermLoadError('TERM_IMPORT_FORM', `${rel(file)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.expression.getText(sf)}() bypasses the terminal resolver; use an import`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return applyEdits(js, edits);
}

/** No import / export syntax and no import.meta: a classic script (by syntax). */
export function isClassicScript(file: string, code: string): boolean {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  let mod = false;
  const visit = (n: ts.Node): void => {
    if (mod) return;
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n) || ts.isExportAssignment(n) || ts.isImportEqualsDeclaration(n)
      || (ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
      || (ts.isMetaProperty(n) && n.keywordToken === ts.SyntaxKind.ImportKeyword)) { mod = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return !mod;
}

function isRequire(e: ts.Expression): boolean {
  if (ts.isIdentifier(e)) return e.text === 'require';
  if (ts.isPropertyAccessExpression(e)) {
    const o = e.expression;
    if (ts.isIdentifier(o) && o.text === 'require' && e.name.text === 'resolve') return true;
    if (ts.isIdentifier(o) && o.text === 'module' && e.name.text === 'require') return true;
    if (ts.isMetaProperty(o) && e.name.text === 'require') return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------------
// The runtime plugin

// The transform cache (transform-cache.ts): the loader's code as THIS process loaded it names the pack, so a process
// started before an edit of the loader never writes its old transform under the new code's name.
// Every module of ours that loader.ts imports is in the stamp, so a step that moves between them still renames the pack.
const LOADER_CODE = codeStamp(['loader.ts', 'resolve.ts', 'placeholder.ts', 'fork-deltas.ts', '../../src/term/env/strict-probes.ts', 'transform-cache.ts'].map((f) => path.join(import.meta.dirname, f)));
/** The cache directory, as style-table.ts has it (HUB_TERM_CACHE overrides). */
const cacheDir = (): string => process.env.HUB_TERM_CACHE || path.join(HUB, '.term-cache');

/** The pack of a context: everything a transform depends on besides the file itself and its imports' resolution. */
export function transformCacheFor(ctx: TransformContext, dir = cacheDir(), code = LOADER_CODE): TransformCache<LoadRecord> {
  // A package alias is written into the code as the alias target's installed file.
  const aliases = Object.values(PACKAGE_ALIASES).map((a) => { try { return packageAliasFile(a.to); } catch { return 'unresolved:' + a.to; } });
  return new TransformCache<LoadRecord>(dir, [code, Bun.version, ts.version, ctx.key, SRC, [...ctx.allow].sort(), aliases]);
}

const answerText = (r: Resolved): string => JSON.stringify(r);

/**
 * ctx.transform(file, source) through `cache`: the stored result when the file's text, its web twin (a sibling) and
 * every import's resolution are what they were when it was stored; else a fresh transform, stored. A file that uses
 * import.meta.glob depends on a directory listing and is never cached. An error is never cached.
 */
export function cachedTransform(ctx: TransformContext, cache: TransformCache<LoadRecord>, file: string, source: string, inner: TermResolver = resolverFor(ctx.options.fixtures)): { code: string; record: LoadRecord } {
  if (source.includes('import.meta.glob')) return ctx.transform(file, source, inner);
  const web = termResolver.baseOf(file);
  const probe = {
    source: hashText(source),
    web: web ? [web, hashText(fs.readFileSync(web, 'utf8'))] as [string, string] : null,
    answer: (spec: string): string | null => { try { return answerText(inner.resolve(spec, file)); } catch { return null; } },
  };
  const hit = cache.get(file, probe);
  if (hit) return { code: hit.code, record: hit.record };
  const resolved: CachedTransform<LoadRecord>['resolved'] = [];
  const recording = Object.create(inner) as TermResolver;
  recording.resolve = (spec: string, importer: string, ...rest: never[]) => {
    const r = inner.resolve(spec, importer, ...rest);
    if (importer === file) resolved.push([spec, answerText(r)]);
    return r;
  };
  const out = ctx.transform(file, source, recording);
  cache.put(file, { source: probe.source, web: probe.web, resolved, code: out.code, sum: hashText(out.code), record: out.record });
  return out;
}

let installed: TransformContext | null = null;
/** The context the runtime loader runs with (null before installTermLoader). */
export const installedContext = (): TransformContext | null => installed;

export function installTermLoader(o: TermLoaderOptions): void {
  const ctx = transformContext(o);
  if (installed) {
    if (installed.key !== ctx.key) throw new TermLoadError('TERM_LOADER_INSTALLED', `already installed with ${installed.key}, asked for ${ctx.key}`);
    return;
  }
  installed = ctx;
  const cache = transformCacheOn() ? transformCacheFor(ctx) : null;
  const loadFile = (p: string): { contents: string; loader: 'js' | 'ts' | 'tsx' } => {
    const file = termResolver.real(p);
    // Outside hub/src nothing is changed (an object is still owed: bun test refuses an empty answer).
    if (!termResolver.inSrc(file)) return { contents: fs.readFileSync(p, 'utf8'), loader: /\.[cm]?tsx$/.test(p) ? 'tsx' : 'ts' };
    const source = fs.readFileSync(file, 'utf8');
    const { code, record } = cache ? cachedTransform(ctx, cache, file, source) : ctx.transform(file, source);
    records.push(record);
    return { contents: code, loader: 'js' };
  };
  plugin({
    name: 'hub-term',
    setup(b) {
      const srcJs = new RegExp('^' + SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/.*\\.(jsx?|mjs)$');
      b.onLoad({ filter: /\.(tsx?|mts)$/ }, (a) => loadFile(a.path));
      b.onLoad({ filter: srcJs }, (a) => loadFile(a.path));
      for (const al of Object.values(PACKAGE_ALIASES)) b.onLoad({ filter: al.files }, (a) => ({ contents: aliasServing(a.path)!, loader: 'js' }));
      b.onLoad({ filter: LIB_DOM_JSX }, (a) => ({ contents: libDomJsx(fs.readFileSync(a.path, 'utf8'), path.join(JSX_DIR, 'jsx-runtime.ts')), loader: 'js' }));
      // TanStack history: blockers first (fork-deltas.ts), then its browser probes answered (strict-probes.ts).
      b.onLoad({ filter: TANSTACK_HISTORY }, (a) => ({ contents: rewriteProbes(historyBlockers(fs.readFileSync(a.path, 'utf8'), a.path), a.path).code, loader: 'js' }));
      // Library probes of browser globals answered at load (src/term/env/strict-probes.ts): one rule per file, exact
      // counts, TERM_PROBE_STALE when a library changed. The engine itself is loaded as installed (no edits).
      b.onLoad({ filter: PROBE_FILES }, (a) => (TANSTACK_HISTORY.test(a.path) ? undefined : { contents: rewriteProbes(fs.readFileSync(a.path, 'utf8'), a.path).code, loader: 'js' }));
      b.onLoad({ filter: /\.(css|scss)$/ }, (a) => {
        const real = termResolver.real(a.path);
        const mod = /\.module\.(css|scss)$/.test(a.path) && termResolver.inSrc(real);
        if (termResolver.inSrc(real)) stylesheets.add(real);
        return { contents: mod ? cssModuleSource(real) : 'export default {};', loader: 'js' };
      });
    },
  });
}

/** PACKAGE_ALIASES at run time: a package file the alias replaces is served as the alias target's exports (the runtime
 *  plugin cannot redirect a package-internal import; the bundler redirects it in onResolve). */
export function aliasServing(file: string): string | null {
  for (const a of Object.values(PACKAGE_ALIASES)) if (a.files.test(file)) return `export * from ${JSON.stringify(packageAliasFile(a.to))};\n`;
  return null;
}

/** For tests: the web base of a sibling's stem (unused by the plugin; kept for the old import name). */
export const webTwinOf = (file: string): string | null => termResolver.baseOf(file) ?? (fs.existsSync(stemOf(file) + '.tsx') ? stemOf(file) + '.tsx' : null);
