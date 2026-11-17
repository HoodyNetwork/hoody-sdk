// The Bun bundler plugin of the terminal Hub's ship build: the same transform as the runtime loader (loader.ts
// TransformContext, strict flavour, fixtures off) and the same resolver (resolve.ts). Every hub/src module goes
// through transform(); the imports it emits are already the resolved absolute files. Package imports are checked
// here: a web-only package anywhere in hub/src fails the build; PACKAGE_ALIASES redirect for every importer (the
// bundler sees package-internal imports, which the runtime loader cannot).
import fs from 'node:fs';
import path from 'node:path';
import type { BunPlugin } from 'bun';
import { historyBlockers, LIB_DOM_JSX, libDomJsx, TANSTACK_HISTORY } from '../fork-deltas';
import { PROBE_FILES, rewriteProbes } from '../../../src/term/env/strict-probes';
import { packageAliasFile, type LoadRecord, type TransformContext } from '../loader';
import { PACKAGE_ALIASES, cssModuleSource, isWebOnlyPackage, type TermResolver } from '../resolve';
import { scanExports } from '../placeholder';
import { isExcluded } from '../graph/build';

/** Modules that exist for fixtures only (the web build's DEV_ONLY list, vite.config.mts, plus every test/fixture file
 *  INVENTORY excludes). With fixtures off they are folded: see foldedSource(). */
export const DEV_ONLY: readonly RegExp[] = [
  /^src\/core\/(world|fixtures|fixture-boot)\.ts$/, /^src\/core\/run-open\/fixtureKits\.ts$/,
  /^src\/term\/app\/boot\.ts$/, /^src\/term\/entry\.fixture\.ts$/,
  /^src\/pages\/demo\//, /^src\/kit\/gallery\//,
];
/** The fixture ENGINE the web ships live: page data modules call fixtureSource() at load, and its loaders are
 *  `__HUB_FIXTURES__ ? import.meta.glob : {}`, so with fixtures off no fixture DATA is reachable through it. The ship
 *  build folds it like every fixture module (maintainers: any fixture module in the graph fails the ship build), so
 *  the page data modules that call it at load are named as debt. Only the measurement build (--stand-ins) keeps it. */
export const LIVE_FIXTURE_ENGINES: readonly string[] = ['src/app/fixtures.ts'];
export const isDevOnly = (rel: string, keepEngines = false): boolean =>
  !(keepEngines && LIVE_FIXTURE_ENGINES.includes(rel)) && (isExcluded(rel) || DEV_ONLY.some((re) => re.test(rel)));

/**
 * The fixtures-off form of a dev-only module: the same export names, each a PURE-annotated stand-in that throws
 * TERM_FIXTURES_OFF when used. Nothing runs at load, so the bundler drops the module when live code only imports it
 * for branches __HUB_FIXTURES__ folded away (the web build gets the same from its devOnly() side-effect rule). A module
 * a live path really uses stays in the bundle, and the artifact check names it.
 */
export function foldedSource(file: string, code: string, rel: string, kind: 'fixturesOff' | 'refused' = 'fixturesOff'): string {
  const scan = scanExports(file, code);
  const names = [...new Set([...scan.names, ...scan.reexports.flatMap((r) => r.names.filter((n) => n !== '*'))])];
  const fn = kind === 'fixturesOff' ? '__fixturesOff' : '__termRefused';
  const why = kind === 'fixturesOff' ? 'is fixture-only and this build carries no fixtures' : 'was refused by the ship build (see its report)';
  const head = `function ${fn}(n, f) { const fail = () => { throw new Error("${kind === 'fixturesOff' ? 'TERM_FIXTURES_OFF' : 'TERM_REFUSED'}: " + n + " from " + f + " ${why}"); }; return new Proxy(function () {}, { get: fail, apply: fail, construct: fail }); }`;
  const lines = names.map((n) => `export const ${n} = /* @__PURE__ */ ${fn}(${JSON.stringify(n)}, ${JSON.stringify(rel)});`);
  if (scan.hasDefault) lines.push(`export default /* @__PURE__ */ ${fn}("default", ${JSON.stringify(rel)});`);
  return head + '\n' + lines.join('\n') + '\n';
}

export interface BuildLedger {
  /** hub/src modules transformed (strict: shared or sibling only). */
  loaded: LoadRecord[];
  /** Every refusal: code + message (the build fails when any exists). */
  refusals: { code: string; message: string }[];
  /** importer -> specifiers it imports (for "importers of X" in refusals). */
  importers: Map<string, Set<string>>;
  /** Dev-only modules served folded (fixtures off). */
  folded: string[];
  /** Engine assets left out (isDroppedEngineAsset). */
  droppedAssets: string[];
}

export const newLedger = (): BuildLedger => ({ loaded: [], refusals: [], importers: new Map(), folded: [], droppedAssets: [] });

/** Large engine assets the Hub never uses: OpenTUI core's tree-sitter grammars and highlight queries (the Hub has its
 *  own highlighter). Each is served as a module that fails like a missing file when loaded, so nothing is emitted;
 *  core loads them lazily and only for its Code/Markdown renderables. build/verify.ts budgets assets per class. */
export const isDroppedEngineAsset = (spec: string, importer: string | undefined): boolean =>
  !!importer && /[\\/]@opentui[\\/]core[\\/]/.test(importer) && /\.(wasm|scm)$/.test(spec);

/** The native library import of OpenTUI's platform package (`import("./libopentui.so", { with: { type: "file" } })`):
 *  served as an absolute path next to the bundle (import.meta.dir), never relative to the working directory. */
export const NATIVE_INDEX = /[\\/]@opentui[\\/]core-[a-z0-9-]+[\\/]index\.bun\.js$/;
/** What the native package's entry is served as: the library as a file asset, its path resolved beside the bundle.
 *  ONE text for the installed package (NATIVE_INDEX) and for a cross build's own copy (build.ts, nativeDirPlugin),
 *  whose directory has any name. */
export const NATIVE_ENTRY_SOURCE = 'import lib from "./libopentui.so" with { type: "file" };\nimport { resolve } from "node:path";\nexport default resolve(import.meta.dir, lib);\n';

/** The bundle's class-style tables (STYLE_TABLES_MODULE): the packed tables of the three width classes
 *  (build/style-pack.ts), one JSON file embedded as a file asset, read the first time a mount draws (ship-entry.ts). */
export const STYLE_TABLES_MODULE = 'hub-term:style-tables';
/** The packed tables file. */
export type StyleTableFiles = string;

/** `fixtureOnly`: hub-relative modules only fixture or test code reaches in the source graph (build/fixture-graph.ts),
 *  folded and refused as inputs like the named dev-only modules, whatever their file name. */
export function termBuildPlugin(o: { ctx: TransformContext; resolver: TermResolver; ledger: BuildLedger; absent?: readonly string[]; styleTables?: StyleTableFiles; fixtureOnly?: ReadonlySet<string> }): BunPlugin {
  const { ctx, resolver, ledger } = o;
  const srcRe = new RegExp('^' + resolver.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/');
  return {
    name: 'hub-term-ship',
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        if (a.path === STYLE_TABLES_MODULE) {
          if (!o.styleTables) throw new Error(`TERM_STYLES_REQUIRED: ${STYLE_TABLES_MODULE} imported but the build made no style tables`);
          return { path: a.path, namespace: 'hub-term-styles' };
        }
        if (o.absent?.includes(a.path)) return { path: a.path, namespace: 'hub-term-absent' };
        // OpenTUI's tree-sitter parser worker: core resolves its path at load (a non-string answer means "not
        // bundled", its own fallback), so it is served as an empty default rather than a failing module.
        if (a.path === '@opentui/core/parser.worker' && a.importer && /[\\/]@opentui[\\/]core[\\/]/.test(a.importer)) {
          ledger.droppedAssets.push(a.path);
          return { path: a.path, namespace: 'hub-term-no-asset' };
        }
        if (isDroppedEngineAsset(a.path, a.importer)) {
          ledger.droppedAssets.push(a.path);
          return { path: a.path, namespace: 'hub-term-absent' };
        }
        if (!a.importer) return undefined;
        const importer = resolver.real(a.importer);
        const set = ledger.importers.get(a.path) ?? new Set<string>();
        set.add(importer);
        ledger.importers.set(a.path, set);
        const alias = PACKAGE_ALIASES[a.path];
        if (alias) return { path: packageAliasFile(alias.to) };
        if (resolver.inSrc(importer) && !a.path.startsWith('/') && !a.path.startsWith('.') && isWebOnlyPackage(a.path)) {
          ledger.refusals.push({ code: 'TERM_WEB_ONLY_PACKAGE', message: `${path.relative(resolver.hub, importer)} imports the browser package ${a.path}` });
        }
        return undefined;
      });
      const load = (p: string) => {
        const file = resolver.real(p);
        const rel = path.relative(resolver.hub, file);
        const keep = ctx.options.flavour !== 'strict';
        if (!ctx.options.fixtures && (isDevOnly(rel, keep) || (o.fixtureOnly?.has(rel) && !(keep && LIVE_FIXTURE_ENGINES.includes(rel))))) {
          ledger.folded.push(rel);
          return { contents: foldedSource(file, fs.readFileSync(file, 'utf8'), rel), loader: 'js' as const };
        }
        try {
          const { code, record } = ctx.transform(file, fs.readFileSync(file, 'utf8'));
          ledger.loaded.push(record);
          return { contents: code, loader: 'js' as const };
        } catch (e) {
          const err = e as { code?: string; message?: string };
          ledger.refusals.push({ code: err.code ?? (String(err.message).match(/^(TERM_[A-Z_]+)/)?.[1] ?? 'TERM_LOAD'), message: String(err.message) });
          // Same export names, each refusing when used: the bundle still completes, so ONE run reports every refusal
          // and every artifact finding (the build fails on the refusal regardless).
          return { contents: foldedSource(file, fs.readFileSync(file, 'utf8'), rel, 'refused'), loader: 'js' as const };
        }
      };
      b.onLoad({ filter: /\.(tsx?|mts|jsx?|mjs)$/ }, (a) => {
        if (srcRe.test(resolver.real(a.path))) return load(a.path);
        if (LIB_DOM_JSX.test(a.path)) return { contents: libDomJsx(fs.readFileSync(a.path, 'utf8'), path.join(resolver.jsxDir, 'jsx-runtime.ts')), loader: 'js' };
        if (TANSTACK_HISTORY.test(a.path)) return { contents: rewriteProbes(historyBlockers(fs.readFileSync(a.path, 'utf8'), a.path), a.path).code, loader: 'js' };
        // Browser probes answered at build, before minification (src/term/env/strict-probes.ts), same as the loader.
        if (PROBE_FILES.test(a.path.replace(/\\/g, '/'))) return { contents: rewriteProbes(fs.readFileSync(a.path, 'utf8'), a.path).code, loader: 'js' };
        if (NATIVE_INDEX.test(a.path)) {
          return { contents: NATIVE_ENTRY_SOURCE, loader: 'js' };
        }
        return undefined;
      });
      b.onLoad({ filter: /.*/, namespace: 'hub-term-styles' }, () => ({
        contents: `import tables from ${JSON.stringify(o.styleTables)} with { type: 'file' };\nexport default tables;\n`, loader: 'js',
      }));
      b.onLoad({ filter: /.*/, namespace: 'hub-term-no-asset' }, () => ({ contents: 'export default undefined;\n', loader: 'js' }));
      b.onLoad({ filter: /.*/, namespace: 'hub-term-absent' }, (a) => ({
        contents: `throw Object.assign(new Error(${JSON.stringify(`Cannot find package '${a.path}' (not part of the terminal Hub build)`)}), { code: 'ERR_MODULE_NOT_FOUND' });\nexport default undefined;\n`,
        loader: 'js',
      }));
      b.onLoad({ filter: /\.(css|scss)$/ }, (a) => {
        const f = resolver.real(a.path);
        return { contents: /\.module\.(css|scss)$/.test(f) && resolver.inSrc(f) ? cssModuleSource(f, resolver.src) : 'export default {};', loader: 'js' };
      });
    },
  };
}
