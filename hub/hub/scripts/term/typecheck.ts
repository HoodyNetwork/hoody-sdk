// Type-checks the graph the terminal EXECUTES: bun scripts/term/typecheck.ts [--json out.json] [--quiet]
//
// One TypeScript program whose module resolution is THE terminal resolver (resolve.ts): a `.term` sibling replaces its
// base for every importer, so pages and kit code are checked against the sibling's real exports. A sibling's
// type-only import of its own base resolves to the base (`import type * as Web from './X'` works; this is what
// `moduleSuffixes` could not express: it sent `./X` back to the sibling itself, TS2303). A sibling's VALUE import of
// its own base is reported as TERM_TWIN_VALUE_IMPORT.
// Roots: the live and fixture entries, every sibling, every *.term.test.ts(x). Types: the web tsconfig's options with
// Bun's types (bun-types 1.4.4, matching the runtime) and vite/client (import.meta.env / glob / CSS-module typings);
// no vitest / jest-dom globals. The one deliberate difference from run time: JSX is typed against React's own
// jsx-runtime (the compat runtime implements that contract at run time; it has no JSX namespace of its own).
// EVERY diagnostic (options, global, syntactic, semantic, of every non-library file in the program) fails the run:
// exit 1, each printed through the diagnostic sanitiser.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { HUB, TermResolver, fixtureResolver, termPaths } from './resolve';

/** Where bun-types are looked for, in order: HUB_TERM_BUN_TYPES, a `types-bun/node_modules/@types` beside any
 *  directory above the hub (a local install of @types/bun@1.4.4, found from a copy too), the hub's node_modules. */
export const BUN_TYPE_CANDIDATES: string[] = (() => {
  const out = [process.env.HUB_TERM_BUN_TYPES ?? ''];
  for (let d = path.dirname(HUB); ; d = path.dirname(d)) {
    out.push(path.join(d, 'types-bun', 'node_modules', '@types'));
    if (path.dirname(d) === d) break;
  }
  out.push(path.join(HUB, '..', 'node_modules', '@types'));
  return out.filter(Boolean);
})();
export const BUN_TYPE_ROOTS = BUN_TYPE_CANDIDATES.filter((d) => fs.existsSync(path.join(d, 'bun')));

const extOf = (f: string): ts.Extension => {
  if (f.endsWith('.d.ts')) return ts.Extension.Dts;
  const e = path.extname(f);
  return ({ '.ts': ts.Extension.Ts, '.tsx': ts.Extension.Tsx, '.js': ts.Extension.Js, '.jsx': ts.Extension.Jsx, '.json': ts.Extension.Json, '.mts': ts.Extension.Mts, '.mjs': ts.Extension.Mjs, '.cts': ts.Extension.Cts, '.cjs': ts.Extension.Cjs } as Record<string, ts.Extension>)[e] ?? ts.Extension.Ts;
};

/** Whether a module-specifier literal is used for types only (erased: never loaded at run time). */
export function isTypeOnlyLiteral(lit: ts.StringLiteralLike): boolean {
  const p = lit.parent;
  if (ts.isImportDeclaration(p)) {
    const c = p.importClause;
    if (!c) return false;
    if (c.isTypeOnly) return true;
    return !c.name && !!c.namedBindings && ts.isNamedImports(c.namedBindings) && c.namedBindings.elements.length > 0 && c.namedBindings.elements.every((e) => e.isTypeOnly);
  }
  if (ts.isExportDeclaration(p)) return p.isTypeOnly || (!!p.exportClause && ts.isNamedExports(p.exportClause) && p.exportClause.elements.length > 0 && p.exportClause.elements.every((e) => e.isTypeOnly));
  if (ts.isLiteralTypeNode(p) && ts.isImportTypeNode(p.parent)) return true; // import('./X').T
  if (ts.isExternalModuleReference(p)) return false;
  return false;
}

export interface TwinFinding { file: string; spec: string; line: number }

/** The terminal module resolution as a TypeScript host hook (exported for the conformance test). */
export function termModuleResolution(resolver: TermResolver, options: ts.CompilerOptions, twins: TwinFinding[]): NonNullable<ts.CompilerHost['resolveModuleNameLiterals']> {
  const sys: ts.ModuleResolutionHost = { fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, realpath: (p) => resolver.real(p), directoryExists: ts.sys.directoryExists, getCurrentDirectory: () => resolver.hub };
  const cache = ts.createModuleResolutionCache(resolver.hub, (x) => x, options);
  const pkg = (spec: string, from: string): ts.ResolvedModuleWithFailedLookupLocations => ts.resolveModuleName(spec, from, options, sys, cache);
  return (literals, containingFile) => literals.map((lit) => {
    const spec = lit.text;
    // JSX is typed against React's runtime (see the header). Outside hub/src (libraries' own declarations) TypeScript's
    // resolution applies unchanged: the terminal rules govern hub/src importers only.
    if (/^react\/jsx-(dev-)?runtime$/.test(spec) || !resolver.inSrc(resolver.real(containingFile))) return pkg(spec, containingFile);
    const r = resolver.resolve(spec, containingFile, { typeOnly: isTypeOnlyLiteral(lit) });
    const file = (f: string, external = false): ts.ResolvedModuleWithFailedLookupLocations => ({ resolvedModule: { resolvedFileName: f, extension: extOf(f), isExternalLibraryImport: external } });
    switch (r.kind) {
      case 'file': return file(r.path);
      case 'twin': {
        const sf = lit.getSourceFile();
        twins.push({ file: containingFile, spec, line: sf.getLineAndCharacterOfPosition(lit.getStart(sf)).line + 1 });
        return file(r.base);
      }
      case 'jsx': return file(r.path);
      case 'external': return /\/node_modules\//.test(r.path) ? pkg(spec, containingFile) : file(r.path);
      case 'package': return pkg(r.alias ?? spec, containingFile);
      // CSS modules, ?raw and assets: vite/client's ambient module declarations type them.
      case 'cssModule': case 'raw': case 'asset': return { resolvedModule: undefined };
      case 'missing': return { resolvedModule: undefined };
    }
  });
}

export interface CheckResult { diagnostics: { file: string | null; line: number; code: string; message: string }[]; files: number; roots: number; ms: number }

/** The roots of the terminal program under `hub`. */
export function termRoots(hub: string): string[] {
  const src = path.join(hub, 'src');
  const out = new Set<string>();
  for (const e of ['term/entry.live.ts', 'term/entry.fixture.ts', 'term/entry.ts']) if (fs.existsSync(path.join(src, e))) out.add(path.join(src, e));
  for (const f of new Bun.Glob('**/*.term.{ts,tsx}').scanSync(src)) out.add(path.join(src, f));
  for (const f of new Bun.Glob('**/*.term.test.{ts,tsx}').scanSync(src)) out.add(path.join(src, f));
  // The terminal's own build and runner code (it runs under the same Bun types).
  const scripts = path.join(hub, 'scripts', 'term');
  for (const e of ['build.ts', 'dev.ts', 'render.ts', 'build/measure.ts', 'build/measure-run.ts', 'build/ship-entry.ts']) if (fs.existsSync(path.join(scripts, e))) out.add(path.join(scripts, e));
  for (const f of new Bun.Glob('**/*.term.test.{ts,tsx}').scanSync(scripts)) out.add(path.join(scripts, f));
  return [...out].sort();
}

export function checkTerm(o: { hub?: string; resolver?: TermResolver; roots?: string[] } = {}): CheckResult {
  const t0 = performance.now();
  // The executed graph includes tests and fixture runs: fixture mode ('@core' = its fixture barrel, as tsconfig says).
  const resolver = o.resolver ?? (o.hub ? new TermResolver({ hub: o.hub, fixtures: true }) : fixtureResolver);
  const hub = resolver.hub;
  const configPath = path.join(hub, 'tsconfig.json');
  const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, hub, undefined, configPath);
  const options: ts.CompilerOptions = {
    ...cfg.options,
    // The terminal's aliases and fixture barrel come from the resolver (termPaths), never from the web tsconfig.
    paths: termPaths(cfg.options, hub, resolver.fixtures),
    noEmit: true,
    types: [],
  };
  // The ambient type libraries, as root files (resolved here so a missing one is a clear error, not a silent gap).
  const typeFiles: string[] = [];
  for (const [name, from] of [['vite/client', path.join(hub, 'tsconfig.json')], ['bun', path.join(BUN_TYPE_ROOTS[0] ?? hub, 'x')]] as const) {
    const t = ts.resolveTypeReferenceDirective(name, from, { ...options, typeRoots: BUN_TYPE_ROOTS }, ts.sys).resolvedTypeReferenceDirective?.resolvedFileName;
    if (!t) throw new Error(`TERM_TYPECHECK_TYPES: cannot find the type library '${name}'`);
    typeFiles.push(t);
  }
  // The web config's own declaration files under src (globals such as __HUB_FIXTURES__, asset modules).
  const ambient = cfg.fileNames.filter((f) => f.endsWith('.d.ts'));
  // Local declarations for untyped packages the scripts use (scripts/term/types), with any roots.
  const local = [...new Bun.Glob('scripts/term/types/*.d.ts').scanSync(hub)].map((f) => path.join(hub, f));
  const roots = [...typeFiles, ...ambient, ...local, ...(o.roots ?? termRoots(hub))];
  const twins: TwinFinding[] = [];
  const host = ts.createCompilerHost(options, true);
  host.resolveModuleNameLiterals = termModuleResolution(resolver, options, twins);
  const program = ts.createProgram({ rootNames: roots, options, host, configFileParsingDiagnostics: cfg.errors });
  const diags: ts.Diagnostic[] = [...program.getConfigFileParsingDiagnostics(), ...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
  let files = 0;
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile && (options.skipLibCheck || program.isSourceFileDefaultLibrary(sf))) continue;
    if (program.isSourceFileFromExternalLibrary(sf)) continue;
    files++;
    diags.push(...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf));
  }
  const out: CheckResult['diagnostics'] = diags.map((d) => ({
    file: d.file ? path.relative(hub, d.file.fileName) : null,
    line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
    code: 'TS' + d.code,
    message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
  for (const t of twins) out.push({ file: path.relative(hub, t.file), line: t.line, code: 'TERM_TWIN_VALUE_IMPORT', message: `'${t.spec}' value-imports this sibling's own web file; import types only, or move what both need to a module both import` });
  return { diagnostics: out, files, roots: roots.length, ms: Math.round(performance.now() - t0) };
}

/** A known lib clash: web code typed against DOM AND Bun globals at once (the terminal runs under Bun). */
export interface TypecheckAllow { file: string; code: string; why: string }

export function readTypecheckAllow(file: string): TypecheckAllow[] {
  if (!fs.existsSync(file)) return [];
  const j = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: TypecheckAllow[] };
  for (const e of j.entries ?? []) if (!e.file || !/^TS\d+$/.test(e.code) || (e.why ?? '').length < 10) throw new Error(`TERM_TYPECHECK_ALLOW_INVALID: ${e.file}`);
  return j.entries ?? [];
}

/** Drops allowed diagnostics (matched by file + code, never line); an entry that matched nothing is itself an error. */
export function applyTypecheckAllow(diags: CheckResult['diagnostics'], allow: TypecheckAllow[]): CheckResult['diagnostics'] {
  const used = new Set<TypecheckAllow>();
  const out = diags.filter((d) => {
    const hit = allow.find((a) => a.file === d.file && a.code === d.code);
    if (hit) used.add(hit);
    return !hit;
  });
  for (const a of allow) if (!used.has(a)) out.push({ file: 'scripts/term/typecheck.allow.json', line: 0, code: 'TERM_TYPECHECK_ALLOW_STALE', message: `${a.file} ${a.code} no longer fails: remove the entry` });
  return out;
}

if (import.meta.main) {
  const { safeDiagnostic } = (await import(path.join(HUB, 'src/term/prim/safe.ts'))) as typeof import('../../src/term/prim/safe');
  const arg = (n: string): string | undefined => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
  if (!BUN_TYPE_ROOTS.length) {
    process.stderr.write(`TERM_TYPECHECK_TYPES: no bun-types found; looked in:\n${BUN_TYPE_CANDIDATES.map((d) => `  ${d}`).join('\n')}\n-> install @types/bun@1.4.4 into one of them (\`bun add @types/bun@1.4.4\` in a types-bun directory beside the api/ checkout), or set HUB_TERM_BUN_TYPES=<that>/node_modules/@types\n`);
    process.exit(2);
  }
  // --roots a,b (hub-relative): check those files and what they import, not every terminal root (check.ts --changed).
  const given = arg('roots')?.split(',').filter(Boolean).map((f) => path.resolve(HUB, f));
  const raw = checkTerm(given ? { roots: given } : {});
  const applied = applyTypecheckAllow(raw.diagnostics, readTypecheckAllow(path.join(HUB, 'scripts/term/typecheck.allow.json')));
  // A partial program (--roots) cannot tell a stale allow entry from one whose file it did not load: whole runs judge those.
  const r = { ...raw, diagnostics: given ? applied.filter((d) => d.code !== 'TERM_TYPECHECK_ALLOW_STALE') : applied };
  for (const d of r.diagnostics) process.stdout.write(safeDiagnostic(`${d.file ?? '(program)'}:${d.line}: ${d.code} ${d.message}`, 600) + '\n');
  const json = arg('json');
  if (json) fs.writeFileSync(json, JSON.stringify(r, null, 1) + '\n');
  process.stdout.write(`${r.diagnostics.length} errors in ${r.files} files (${r.roots} roots, ${r.ms} ms)\n`);
  process.exit(r.diagnostics.length ? 1 : 0);
}

