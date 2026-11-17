// THE resolver of the terminal Hub. Every consumer asks this module what a specifier means, so they cannot disagree:
//   - the runtime loader (loader.ts: dev runner, render, tests) rewrites each import to the file chosen here;
//   - the module-graph tool (graph/modres.ts) is an adapter over TermResolver;
//   - the ship bundler (build.ts) calls it from its onResolve/onLoad;
//   - the terminal typecheck (typecheck.ts) feeds it to the TypeScript program as its module resolution.
// resolve.conformance.term.test.ts runs one case table through all four.
//
// Rules, in order:
// 1. Base resolution is the WEB build's, done by TypeScript's own resolver (bundler mode, the hub tsconfig's `paths`
//    aliases, explicit `.js` -> TS source, directories / index files, JSON, absolute paths), then the real path.
// 2. Platform siblings: the base resolved, a file X.term.tsx / X.term.ts beside X.tsx / X.ts replaces it for every
//    importer (X.web.ts -> X.web.term.ts is the same rule). A sibling with no base is never selected (R1 reports it).
// 3. A sibling may import its own base for TYPES only (`typeOnly`: the base, so `typeof Web.X` works); a value import
//    of its own base is a `twin` result: the loader throws TERM_TWIN_VALUE_IMPORT, the typecheck reports it.
// 4. react/jsx-runtime and react/jsx-dev-runtime imported from hub/src are the compat runtime (src/term/jsx), except
//    from the compat runtime itself and the primitives (src/term/prim), which build real elements with React's own.
// 5. A CSS module is a class-name table ("<path under src>#<class>"); `x?raw` is the file's text; other stylesheets and
//    Vite asset queries are an empty stub.
// 6. Bare specifiers are packages, left to Bun, except PACKAGE_ALIASES (TanStack's isServer switch: the terminal is a
//    client). A module importing a WEB_ONLY_PACKAGES entry is web-only.
// Unsupported import forms (require(), a dynamic import whose argument is not a literal) are refused by the consumers
// that see syntax (loader.ts rewriteImports, build.ts) with TERM_IMPORT_FORM.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const realDir = (p: string): string => { try { return fs.realpathSync(p); } catch { return p; } };

export const HUB = realDir(path.resolve(import.meta.dirname, '..', '..'));
export const SRC = path.join(HUB, 'src');
export const JSX_DIR = path.join(SRC, 'term', 'jsx');
export const PRIM_DIR = path.join(SRC, 'term', 'prim');

/** Packages that need a browser: a module importing one directly is web-only. (graph.ts reads this literal.)
 *  react-stately / @react-stately are state hooks with no DOM (useControlledState's one probe is answered by
 *  src/term/env/strict-probes.ts): terminal-safe, declared at 3.51.0 in package.json. */
export const WEB_ONLY_PACKAGES: readonly string[] = [
  'react-dom', 'react-aria', 'react-aria-components', '@react-aria/', '@react-types/',
  '@internationalized/', '@tanstack/react-virtual', '@tanstack/virtual-core',
];

/** Package specifiers the terminal maps to another module of the same package (the bundler's alias; the runtime
 *  loader serves the aliased file's exports in place of the original's, loader.ts). */
export const PACKAGE_ALIASES: Readonly<Record<string, { to: string; why: string; files: RegExp }>> = {
  '@tanstack/router-core/isServer': {
    to: '@tanstack/router-core/dist/esm/isServer/client.js',
    why: "Bun's export conditions pick TanStack's server (or development) build of isServer, which renders nothing after the first pass; the terminal is a client",
    files: /@tanstack\/router-core\/dist\/esm\/isServer\/(server|development)\.js$/,
  },
};

export const isWebOnlyPackage = (spec: string): boolean =>
  WEB_ONLY_PACKAGES.some((p) => (p.endsWith('/') ? spec.startsWith(p) : spec === p || spec.startsWith(p + '/')));
export const isStyleSpec = (spec: string): boolean => /\.(css|scss)(\?.*)?$/.test(spec);
/** A `.term` sibling (test files are not). */
export const isSibling = (file: string): boolean => /\.term\.tsx?$/.test(file);
/** The path stem shared by a base and its sibling: .../Button.term.tsx -> .../Button, .../x.web.ts -> .../x.web */
export const stemOf = (file: string): string => file.replace(/(\.term)?\.(tsx|ts|mts|cts|js|mjs|cjs|jsx|json)$/, '');

export type Resolved =
  /** A source file. `base` is the web build's file; `path` is what the terminal loads (the sibling when there is one). */
  | { kind: 'file'; path: string; base: string; sibling: boolean }
  /** A value import of the importer's own web twin. */
  | { kind: 'twin'; sibling: string; base: string }
  | { kind: 'jsx'; path: string }
  | { kind: 'cssModule'; path: string }
  | { kind: 'raw'; path: string }
  /** A stylesheet or a Vite asset query: an empty module. `path` when the file exists. */
  | { kind: 'asset'; spec: string; path: string | null; css: boolean }
  /** A package (left to Bun). `alias`: PACKAGE_ALIASES target. */
  | { kind: 'package'; spec: string; name: string; webOnly: boolean; alias?: string }
  /** A file outside hub/src reached by a relative, absolute or aliased path. */
  | { kind: 'external'; path: string }
  | { kind: 'missing'; spec: string };

export class TwinValueImport extends Error {
  readonly code = 'TERM_TWIN_VALUE_IMPORT';
  constructor(readonly sibling: string, hub = HUB) {
    super(`TERM_TWIN_VALUE_IMPORT: ${path.relative(hub, sibling)} imports a value from its own web file; import types only, or move what both need to a module both import`);
  }
}

export interface ResolverOptions {
  /** Absolute hub dir (holds tsconfig.json and src/). */
  hub: string;
  /** Override for file existence (the graph tool passes its file list; tests pass fixtures). */
  fileExists?: (abs: string) => boolean;
  /** Fixture mode (render, page gate, scenarios, tests, dev): a bare barrel alias names its fixture barrel. Off
   *  (default: the ship build, the graph tool): the terminal names the live barrel, the web meaning the web barrel
   *  (FIXTURE_BARRELS). */
  fixtures?: boolean;
}

/**
 * THE fixture choice of resolution, in one place, whatever the tsconfig paths name. A bare barrel alias resolves to:
 *   fixture  in fixture mode (both meanings): the web barrel plus the fixture-only states;
 *   web      the web build's meaning with fixtures off (resolveWeb): the barrel the web app imports, fixture names included;
 *   live     the terminal's meaning with fixtures off (resolve: the ship build; termPaths): no fixture name and no fixture
 *            module, so a live module importing a fixture name from '@core' fails the ship build (a missing export)
 *            instead of reaching a fixture module at run time. resolve.conformance.term.test.ts pins all three.
 */
export const FIXTURE_BARRELS: Readonly<Record<string, { fixture: string; web: string; live: string }>> = {
  '@core': { fixture: 'src/core/index.fixtures.ts', web: 'src/core/index.ts', live: 'src/core/index.live.ts' },
};

/** The terminal's own aliases, hub-relative. The web tsconfig is the SDK's (the merge keeps it): it does not name
 *  these, so the terminal never reads them from it. */
export const TERM_ALIASES: Readonly<Record<string, string>> = {
  '@term/prim': 'src/term/prim/page.ts',
  '@term/kit': 'src/term/prim/kit.ts',
};

/**
 * The compiler `paths` the terminal resolves and typechecks with: the web tsconfig's aliases (made absolute), then
 * TERM_ALIASES, then each FIXTURE_BARRELS alias set by mode (fixture barrel in fixture mode, else the live one), so
 * neither depends on what the web tsconfig says. Absolute targets: valid with or without a baseUrl.
 */
export function termPaths(options: ts.CompilerOptions, hub: string, fixtures: boolean): ts.MapLike<string[]> {
  const base = (options.pathsBasePath as string | undefined) ?? options.baseUrl ?? hub;
  const out: Record<string, string[]> = {};
  for (const [key, targets] of Object.entries(options.paths ?? {})) out[key] = targets.map((t) => path.resolve(base, t));
  for (const [key, target] of Object.entries(TERM_ALIASES)) out[key] = [path.join(hub, target)];
  for (const [key, b] of Object.entries(FIXTURE_BARRELS)) out[key] = [path.join(hub, fixtures ? b.fixture : b.live)];
  return out;
}

const ASSET_EXT = /\.(css|scss|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|wasm|txt|md|html|wav|mp3|mp4|webm)$/i;
const TERM_EXTS = ['.term.tsx', '.term.ts'] as const;

export class TermResolver {
  readonly hub: string;
  readonly src: string;
  readonly jsxDir: string;
  readonly primDir: string;
  readonly options: ts.CompilerOptions;
  /** Fixture mode (ResolverOptions.fixtures). */
  readonly fixtures: boolean;
  private readonly host: ts.ModuleResolutionHost;
  private readonly tsCache: ts.ModuleResolutionCache;
  private readonly exists: (abs: string) => boolean;
  private readonly existsMemo = new Map<string, boolean>();
  private readonly realMemo = new Map<string, string>();
  private readonly webMemo = new Map<string, Resolved>();

  constructor(o: ResolverOptions) {
    this.hub = realDir(path.resolve(o.hub));
    this.src = path.join(this.hub, 'src');
    this.jsxDir = path.join(this.src, 'term', 'jsx');
    this.primDir = path.join(this.src, 'term', 'prim');
    this.fixtures = o.fixtures === true;
    const configPath = path.join(this.hub, 'tsconfig.json');
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) throw new Error(`TERM_RESOLVER_CONFIG: cannot read ${configPath}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`);
    const parsed = ts.parseJsonConfigFileContent(read.config, { ...ts.sys, readDirectory: () => [] }, this.hub, undefined, configPath);
    this.options = { ...parsed.options, paths: termPaths(parsed.options, this.hub, this.fixtures), noEmit: true, moduleResolution: ts.ModuleResolutionKind.Bundler, resolveJsonModule: true, allowJs: true };
    const given = o.fileExists;
    this.exists = (f) => {
      let v = this.existsMemo.get(f);
      if (v === undefined) {
        v = given ? given(f) : isFileOnDisk(f);
        this.existsMemo.set(f, v);
      }
      return v;
    };
    this.host = {
      fileExists: (f) => this.exists(path.resolve(f)),
      readFile: ts.sys.readFile,
      directoryExists: ts.sys.directoryExists,
      realpath: (p) => this.real(p),
      getCurrentDirectory: () => this.hub,
    };
    this.tsCache = ts.createModuleResolutionCache(this.hub, (x) => x, this.options);
  }

  /** Tests that create files between calls. */
  clear(): void { this.existsMemo.clear(); this.realMemo.clear(); this.webMemo.clear(); this.tsCache.clear(); }

  /** The real path (symlinks followed; a path that does not exist on disk is kept, normalised). */
  real(p: string): string {
    const abs = path.resolve(p);
    let v = this.realMemo.get(abs);
    if (v === undefined) {
      try { v = fs.realpathSync(abs); } catch { v = abs; }
      this.realMemo.set(abs, v);
    }
    return v;
  }

  inSrc(file: string): boolean { return file.startsWith(this.src + path.sep); }

  /** The `.term` sibling of a base file under src, or null. */
  siblingOf(file: string): string | null {
    if (!this.inSrc(file) || isSibling(file) || file.endsWith('.d.ts') || !/\.(tsx?|mts)$/.test(file)) return null;
    const stem = stemOf(file);
    for (const e of TERM_EXTS) if (this.exists(stem + e)) return stem + e;
    return null;
  }

  /** The base file a sibling replaces, or null when it has none. */
  baseOf(sibling: string): string | null {
    if (!isSibling(sibling)) return null;
    const stem = stemOf(sibling);
    for (const e of ['.tsx', '.ts']) if (this.exists(stem + e)) return stem + e;
    return null;
  }

  private aliasTargets(spec: string): string[] | null {
    const base = (this.options.pathsBasePath as string | undefined) ?? this.options.baseUrl ?? this.hub;
    for (const [key, targets] of Object.entries(this.options.paths ?? {})) {
      const star = key.endsWith('*');
      const prefix = star ? key.slice(0, -1) : key;
      if (star ? spec.startsWith(prefix) : spec === prefix) {
        const rest = star ? spec.slice(prefix.length) : '';
        return targets.map((t) => path.resolve(base, star ? t.replace('*', rest) : t));
      }
    }
    return null;
  }

  /** The WEB build's meaning of `spec` imported from `importer` (no sibling selection). */
  resolveWeb(spec: string, importer: string): Resolved {
    const from = this.real(importer);
    const key = from + '\0' + spec;
    const hit = this.webMemo.get(key);
    if (hit) return hit;
    const r = this.resolveWebUncached(spec, from);
    this.webMemo.set(key, r);
    return r;
  }

  private resolveWebUncached(spec: string, from: string): Resolved {
    if (/^react\/jsx-(dev-)?runtime$/.test(spec)) return { kind: 'package', spec, name: 'react', webOnly: false };
    const q = spec.search(/[?#]/);
    const bare = q >= 0 ? spec.slice(0, q) : spec;
    const query = q >= 0 ? spec.slice(q) : '';
    const local = bare.startsWith('.') || path.isAbsolute(bare);
    const barrel = local ? undefined : FIXTURE_BARRELS[bare];
    if (barrel && !query) return this.barrelFile(spec, this.fixtures ? barrel.fixture : barrel.web);
    const alias = local ? null : this.aliasTargets(bare);
    if (!local && !alias) {
      const parts = bare.split('/');
      const name = bare.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
      const a = PACKAGE_ALIASES[bare];
      return { kind: 'package', spec, name, webOnly: isWebOnlyPackage(bare), ...(a ? { alias: a.to } : {}) };
    }
    const cands = local ? [path.resolve(path.dirname(from), bare)] : alias!;
    const onDisk = (): string | null => { for (const c of cands) if (this.exists(c)) return this.real(c); return null; };
    if (/\.module\.(css|scss)$/.test(bare) && !query) { const f = onDisk(); return f ? { kind: 'cssModule', path: f } : { kind: 'missing', spec }; }
    if (query === '?raw') { const f = onDisk(); return f ? { kind: 'raw', path: f } : { kind: 'missing', spec }; }
    if (query) { const f = onDisk(); return f || isStyleSpec(bare) ? { kind: 'asset', spec, path: f, css: isStyleSpec(bare) } : { kind: 'missing', spec }; }
    if (ASSET_EXT.test(bare) && !/\.json$/.test(bare)) { const f = onDisk(); return f || isStyleSpec(bare) ? { kind: 'asset', spec, path: f, css: isStyleSpec(bare) } : { kind: 'missing', spec }; }
    const r = ts.resolveModuleName(bare, from, this.options, this.host, this.tsCache).resolvedModule;
    if (!r) return { kind: 'missing', spec };
    const file = this.real(r.resolvedFileName);
    if (r.isExternalLibraryImport || !this.inSrc(file)) return { kind: 'external', path: file };
    // A declaration file under src has no run-time module behind it.
    if (file.endsWith('.d.ts')) return { kind: 'missing', spec };
    return { kind: 'file', path: file, base: file, sibling: false };
  }

  /** A barrel of FIXTURE_BARRELS, by its hub-relative path (never a sibling: barrels have none). */
  private barrelFile(spec: string, rel: string): Resolved {
    const abs = path.join(this.hub, rel);
    if (!this.exists(abs)) return { kind: 'missing', spec };
    const f = this.real(abs);
    return { kind: 'file', path: f, base: f, sibling: false };
  }

  /** The TERMINAL build's meaning of `spec` imported from `importer`. */
  resolve(spec: string, importer: string, o: { typeOnly?: boolean } = {}): Resolved {
    const from = this.real(importer);
    // Fixtures off: the terminal's live barrel, never the web barrel (FIXTURE_BARRELS).
    const barrel = this.fixtures ? undefined : FIXTURE_BARRELS[spec];
    if (barrel) return this.barrelFile(spec, barrel.live);
    if (/^react\/jsx-(dev-)?runtime$/.test(spec)) {
      // The compat runtime and the primitives build real elements: they keep React's own runtime. So does code outside src.
      if (!this.inSrc(from) || from.startsWith(this.jsxDir + path.sep) || from.startsWith(this.primDir + path.sep)) return { kind: 'package', spec, name: 'react', webOnly: false };
      return { kind: 'jsx', path: path.join(this.jsxDir, spec.includes('dev') ? 'jsx-dev-runtime.ts' : 'jsx-runtime.ts') };
    }
    const w = this.resolveWeb(spec, from);
    if (w.kind !== 'file') return w;
    if (isSibling(from) && stemOf(from) === stemOf(w.base) && from !== w.base) {
      return o.typeOnly ? w : { kind: 'twin', sibling: from, base: w.base };
    }
    if (isSibling(w.base)) return w; // a direct import of a sibling file by its own name
    const sib = this.siblingOf(w.base);
    return sib && sib !== from ? { kind: 'file', path: sib, base: w.base, sibling: true } : w;
  }
}

function isFileOnDisk(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

/** The resolver of this hub with fixtures off (the ship build, the graph tool): '@core' is the live barrel. */
export const termResolver = new TermResolver({ hub: HUB });
/** The same with fixtures on (the loader in fixture mode, the typecheck of the executed graph). */
export const fixtureResolver = new TermResolver({ hub: HUB, fixtures: true });
/** The resolver for a fixture mode: the one switch every caller goes through. */
export const resolverFor = (fixtures: boolean): TermResolver => (fixtures ? fixtureResolver : termResolver);

/** Tests that create files between calls clear the caches. */
export function clearResolveCache(): void { termResolver.clear(); fixtureResolver.clear(); }
export const inSrc = (file: string): boolean => termResolver.inSrc(termResolver.real(file));
export const siblingOf = (file: string): string | null => termResolver.siblingOf(termResolver.real(file));
/** Compatibility: the terminal resolution of `spec` from `importer` (throws TwinValueImport for a twin value import). */
export function resolveSpec(spec: string, importer: string, o: { typeOnly?: boolean } = {}): Resolved {
  const r = termResolver.resolve(spec, importer, o);
  if (r.kind === 'twin') throw new TwinValueImport(r.sibling);
  return r;
}

/** Why a file with these import specifiers is web-only (it imports a browser package directly), or null. */
export function webOnlyReason(specs: readonly string[]): string | null {
  for (const s of specs) if (isWebOnlyPackage(s)) return 'package ' + s;
  return null;
}

/** The class-name table module of a CSS module file: every class reads as "<path under src>#<class>". */
export function cssModuleSource(file: string, src = SRC): string {
  const prefix = path.relative(src, file).split(path.sep).join('/') + '#';
  return `export default new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? ${JSON.stringify(prefix)} + k : undefined) });\n`;
}
