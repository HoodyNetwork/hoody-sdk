#!/usr/bin/env bun
// The terminal Hub's ship build: one fixture-free ES module from the LIVE entry (src/term/entry.live.ts, which exports
// mountTerminalHub), plus OpenTUI's native library beside it, then a check of the artifact itself.
//
//   bun scripts/term/build.ts [--out dir] [--json report.json] [--minify] [--compile] [--no-measure]
//                             [--stand-ins]   (measurement only: never shippable, always exits 1)
//                             [--runtime node [--natives linux-x64,linux-arm64]]
//
// --runtime node: the same bundle for Node (the npm package's `hoody hub`): target node, so the engine's Node build
// (node:ffi) is bundled and no library is embedded. Instead each platform of --natives (default: this host) gets the
// engine package's library copied beside the bundle (build/node-files.ts names; the copy's sha256 must equal the
// package's), and build/node-runtime.ts is bundled as hub-node.js with those sha256 written in (the launcher checks the
// library against them before the engine maps it). No measurement and no --compile for it (both run Bun).
//
// Engine: the @opentui packages every terminal path resolves (the vendored patched build, hub/vendor/opentui,
// declared in package.json), resolved here exactly as tests and dev resolve them, with their own dependencies
// (react-reconciler at the engine's pin). One engine for every path; no load-time edits of it.
//
// Build: the strict flavour of the runtime loader's transform (resolve.ts + loader.ts), fixtures off
// (__HUB_FIXTURES__ = false, import.meta.env.PROD, NODE_ENV production), target bun. Any refusal of the transform
// (web-only module without sibling, partial sibling, unsupported import form, unresolved import, browser package) fails
// the build, naming the module and its importers.
// Artifact check (on the emitted bundle's own module list, i.e. after tree shaking): no fixture / test / placeholder /
// testing module, no build code (scripts/**, css-translate), no dev runner, no fixture entry; exactly one copy each of
// react, react-reconciler and scheduler; the native library present. Exit 1 on any finding.
// --compile also builds a single executable of the measurement harness (scripts/term/build/measure.ts), to prove the
// native library embeds. Measurements (cold start to first frame, RSS) run the built module with a fake client.
import './netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import { stubNames } from './kit-classes';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HUB, SRC, termResolver } from './resolve';
import { transformContext } from './loader';
import { NATIVE_ENTRY_SOURCE, isDevOnly, newLedger, termBuildPlugin, type StyleTableFiles } from './build/plugin';
import { outsideHeaders, shipHeaders, verifyArtifact, type ArtifactReport } from './build/verify';
import { fixtureGraph } from './build/fixture-graph';
import { engineVersion } from './build/engine-check';
import { HOST_PLATFORM, NATIVE_PLATFORMS, NativePackageError, OTHER_PLATFORMS, nativeEntryFile, otherPlatforms, parseTarget, vendoredNativeDir, type NativePlatform } from './build/platforms';
import { NODE_LAUNCHER_FILE, NODE_PLATFORMS, nodeLibraryFile, type NativeManifest } from './build/node-files';

const arg = (n: string): string | undefined => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string): boolean => process.argv.includes('--' + n);

export { OTHER_PLATFORMS };
/** Optional development-only packages of the engine (OpenTUI's React devtools hook, imported only when DEV=true):
 *  never installed, never shipped. The plugin serves each as a module that fails like a missing package when it is
 *  evaluated (code ERR_MODULE_NOT_FOUND, which OpenTUI catches and warns about); an external would be hoisted to a
 *  static import and fail every start. */
export const DEV_ABSENT = ['react-devtools-core'];

export interface ShipBuildResult {
  ok: boolean;
  outdir: string;
  entry: string;
  files: { path: string; bytes: number }[];
  refusals: { code: string; message: string; importers?: string[] }[];
  artifact: ArtifactReport | null;
  /** Fixture / dev-only modules that were IN the module graph and served folded (the graph assertion's evidence). */
  folded: string[];
  logs: string[];
  ms: number;
}

/** The installed directory of a package as resolved from `from` (its package.json's directory). */
export function packageDir(name: string, from: string): string {
  let d = path.dirname(Bun.resolveSync(name, from));
  while (!fs.existsSync(path.join(d, 'package.json')) || JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).name !== name) {
    const up = path.dirname(d);
    if (up === d) throw new Error(`TERM_ENGINE_MISSING: cannot find the package directory of ${name}`);
    d = up;
  }
  return d;
}
export const NATIVE_PACKAGE = `@opentui/core-${process.platform}-${process.arch}`;

/** Fixture-only modules by the import graph (build/fixture-graph.ts), once per process: about 40 s on the full hub. */
let fixtureOnlyMemo: ReadonlySet<string> | null = null;
function fixtureOnlyModules(): ReadonlySet<string> {
  return (fixtureOnlyMemo ??= fixtureGraph(HUB).fixtureOnly);
}

/** `fixtureGraph: false` skips the import-graph fixture check (only for the build's own tests on tiny entries). */
/** Resolves the target's native package to the given copy (a cross build's own package directory), and serves that
 *  copy's entry exactly as the installed package's is served (NATIVE_ENTRY_SOURCE): the copy sits in a directory of
 *  any name (a vendored tarball's temp dir, a --native-dir), which NATIVE_INDEX does not match; as written, the entry
 *  would hand the engine a library path relative to the working directory. */
export const nativeDirPlugin = (native: { name: string; file: string }): import('bun').BunPlugin => ({
  name: 'hub-term-native-dir',
  setup(build) {
    build.onResolve({ filter: /^@opentui\/core-[a-z0-9-]+$/ }, (a) => (a.path === native.name ? { path: native.file } : undefined));
    build.onLoad({ filter: /\.(mjs|js)$/ }, (a) => (a.path === native.file ? { contents: NATIVE_ENTRY_SOURCE, loader: 'js' as const } : undefined));
  },
});
/** `target`: the platform the bundle is FOR (default: this host): its native package is bundled, every other one is
 *  external. `nativeDir`: that package's directory when it is not installed beside core (a cross build's own copy);
 *  it must be that package and its manifest must name an entry file inside it. A foreign target with no `nativeDir`
 *  whose package is not installed takes the vendored tarball of core's version (vendor/opentui/<version>, checked
 *  against its SHA256SUMS, extracted for this build only). NativePackageError when the package is none of the three:
 *  thrown before anything is written. */
export async function shipBuild(o: { outdir: string; minify?: boolean; entry?: string; standIns?: boolean; fixtureGraph?: boolean; target?: NativePlatform; nativeDir?: string; runtime?: 'bun' | 'node'; natives?: readonly NativePlatform[] }): Promise<ShipBuildResult> {
  if (o.runtime === 'node') return nodeShipBuild(o);
  const t0 = performance.now();
  // standIns: the fixture flavour's stand-ins instead of refusals, fixtures still off. NEVER shippable (the artifact
  // check finds the placeholder runtime and the exit stays 1): only to measure size and start-up while the port is open.
  const ctx = transformContext({ flavour: o.standIns ? 'fixture' : 'strict', fixtures: false, mode: 'production' });
  const ledger = newLedger();
  // The engine as every terminal path resolves it: one 0.8.4-hoody.N build (TERM_ENGINE_VERSION otherwise).
  const core = packageDir('@opentui/core', HUB);
  const nativePackage = `@opentui/core-${o.target ?? HOST_PLATFORM}`;
  const installed = (): boolean => { try { packageDir(nativePackage, core); return true; } catch { return false; } };
  let vendored: string | null = null;
  if (!o.nativeDir && o.target && o.target !== HOST_PLATFORM && !installed()) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-term-native-'));
    try {
      vendored = vendoredNativeDir(path.join(HUB, 'vendor', 'opentui'), nativePackage, String(JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8')).version), tmp);
    } finally {
      if (vendored === null) fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  const dropVendored = (): void => { if (vendored !== null) fs.rmSync(vendored, { recursive: true, force: true }); };
  const nativeDir = o.nativeDir ?? vendored;
  let nativeFile: string | null;
  let version: string;
  try {
    nativeFile = nativeDir ? nativeEntryFile(nativeDir, nativePackage) : null;
    // A foreign target's native package that is neither given, installed nor vendored is a refusal, not a resolver
    // stack trace.
    const nativeHome = (): string => {
      if (nativeDir) return nativeDir;
      try { return packageDir(nativePackage, core); } catch (e) {
        if (!o.target) throw e;
        throw new NativePackageError(`${nativePackage} is not installed beside core; pass --native-dir <its package dir>`);
      }
    };
    version = engineVersion((pkg) => JSON.parse(fs.readFileSync(path.join(pkg === '@opentui/core' ? core : pkg === nativePackage ? nativeHome() : packageDir(pkg, HUB), 'package.json'), 'utf8')), nativePackage);
  } catch (e) {
    dropVendored();
    throw e;
  }
  const entry = o.entry ?? path.join(import.meta.dirname, 'build', 'ship-entry.ts');
  fs.rmSync(o.outdir, { recursive: true, force: true });
  fs.mkdirSync(o.outdir, { recursive: true });
  const tables = await packStyleTables();
  try {
    return await bundle(o, { t0, ctx, ledger, entry, version, styleTables: tables.file, native: nativeFile ? { name: nativePackage, file: nativeFile } : null, nodeLibs: null });
  } finally {
    fs.rmSync(tables.dir, { recursive: true, force: true });
    dropVendored();
  }
}

/** The class-style tables the ship entry mounts with (app/styles.ts: REQUIRED), from the stylesheets, packed into one
 *  file (build/style-pack.ts: diagnostics out; per module, one set of entries per width band of that module), in a
 *  fresh temp directory the caller removes. */
async function packStyleTables(): Promise<{ file: StyleTableFiles; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-term-styles-'));
  const { everyBand } = await import('./style-table');
  const { packBands } = await import('./build/style-pack');
  const file = path.join(dir, 'css-tables.json');
  const every = everyBand();
  fs.writeFileSync(file, JSON.stringify(packBands(every.bands, every.edges, every.all, every.cellPx)));
  return { file, dir };
}

/** A library of the Node build: its platform and the engine package's file. */
interface NodeLib { platform: NativePlatform; file: string }

/** The libraries of a Node build (`--runtime node`): for each platform, the engine package's library (installed beside
 *  core, else the vendored tarball of core's version, extracted for this build only) of the one engine build
 *  (engineVersion). NativePackageError for a platform outside NODE_PLATFORMS or a package with no single library.
 *  `drop` removes the extractions. */
export function nodeNatives(core: string, platforms: readonly NativePlatform[]): { libs: NodeLib[]; version: string; drop(): void } {
  const tmps: string[] = [];
  const drop = (): void => { for (const t of tmps) fs.rmSync(t, { recursive: true, force: true }); };
  try {
    if (platforms.length === 0) throw new NativePackageError('--runtime node needs at least one platform (--natives)');
    const coreVersion = String(JSON.parse(fs.readFileSync(path.join(core, 'package.json'), 'utf8')).version);
    const libs: NodeLib[] = [];
    let version = '';
    for (const platform of [...new Set(platforms)]) {
      if (!(NODE_PLATFORMS as readonly string[]).includes(platform)) throw new NativePackageError(`--runtime node carries libraries for ${NODE_PLATFORMS.join(', ')} only, not ${platform}`);
      const pkg = `@opentui/core-${platform}`;
      let dir: string | null = null;
      try { dir = packageDir(pkg, core); } catch { /* not installed here: the vendored tarball */ }
      if (dir === null) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-term-native-'));
        tmps.push(tmp);
        dir = vendoredNativeDir(path.join(HUB, 'vendor', 'opentui'), pkg, coreVersion, tmp);
        if (dir === null) throw new NativePackageError(`${pkg} is neither installed beside core nor vendored for ${coreVersion}`);
      }
      const home = dir;
      version = engineVersion((p) => JSON.parse(fs.readFileSync(path.join(p === '@opentui/core' ? core : p === pkg ? home : packageDir(p, HUB), 'package.json'), 'utf8')), pkg);
      const found = fs.readdirSync(home).filter((f) => /\.(so|dylib|dll)$/.test(f));
      if (found.length !== 1) throw new NativePackageError(`${pkg}: ${found.length} native libraries in the package, not one`);
      libs.push({ platform, file: path.join(home, found[0]!) });
    }
    return { libs, version, drop };
  } catch (e) {
    drop();
    throw e;
  }
}

/** --runtime node: the libraries are checked before anything is written, then the bundle for Node, then the libraries
 *  beside it and the launcher (bundle()). */
async function nodeShipBuild(o: Parameters<typeof shipBuild>[0]): Promise<ShipBuildResult> {
  const t0 = performance.now();
  const ctx = transformContext({ flavour: o.standIns ? 'fixture' : 'strict', fixtures: false, mode: 'production' });
  const ledger = newLedger();
  const natives = nodeNatives(packageDir('@opentui/core', HUB), o.natives ?? [HOST_PLATFORM as NativePlatform]);
  try {
    const entry = o.entry ?? path.join(import.meta.dirname, 'build', 'ship-entry.ts');
    fs.rmSync(o.outdir, { recursive: true, force: true });
    fs.mkdirSync(o.outdir, { recursive: true });
    const tables = await packStyleTables();
    try {
      return await bundle(o, { t0, ctx, ledger, entry, version: natives.version, styleTables: tables.file, native: null, nodeLibs: natives.libs });
    } finally {
      fs.rmSync(tables.dir, { recursive: true, force: true });
    }
  } finally {
    natives.drop();
  }
}

const sha256File = (f: string): string => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

/** The Node build's side files: each library copied beside the bundle (the copy's sha256 must equal the package
 *  file's), and the launcher (build/node-runtime.ts) bundled for Node as hub-node.js with their sha256 written in. */
async function writeNodeSide(outdir: string, libs: readonly NodeLib[], minify: boolean): Promise<NativeManifest> {
  const manifest: Record<string, { file: string; sha256: string }> = {};
  for (const l of libs) {
    const file = nodeLibraryFile(l.platform);
    fs.copyFileSync(l.file, path.join(outdir, file));
    const sha256 = sha256File(path.join(outdir, file));
    if (sha256 !== sha256File(l.file)) throw new Error(`TERM_NODE_NATIVE: the copy of the ${l.platform} library differs from the engine package's`);
    manifest[l.platform] = { file, sha256 };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-term-node-'));
  try {
    const entry = path.join(dir, 'hub-node-entry.ts');
    fs.writeFileSync(entry, [
      '// Written by scripts/term/build.ts --runtime node: the launcher of the Node build (build/node-runtime.ts).',
      `import { nodeHub } from ${JSON.stringify(path.join(import.meta.dirname, 'build', 'node-runtime.ts'))};`,
      `export const hub = nodeHub(import.meta.dirname, ${JSON.stringify(manifest)});`,
      '',
    ].join('\n'));
    const r = await Bun.build({
      entrypoints: [entry], outdir, target: 'node', format: 'esm', naming: { entry: NODE_LAUNCHER_FILE },
      minify: minify ? { identifiers: true, syntax: true, whitespace: false } : false, sourcemap: 'none',
      define: { 'process.env.NODE_ENV': '"production"' }, throw: false,
    });
    if (!r.success) throw new Error(`TERM_NODE_LAUNCHER: ${r.logs.map((l) => String(l.message ?? l)).join('; ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return manifest;
}

/** The entry output's inputs per the build metafile: code that survived tree shaking, and inputs emptied by it. */
function metafileModules(meta: unknown): { modules: string[]; emptied: string[] } | undefined {
  const outs = (meta as { outputs?: Record<string, { entryPoint?: string; inputs?: Record<string, { bytesInOutput: number }> }> } | undefined)?.outputs;
  const entry = outs && Object.entries(outs).find(([k]) => k.endsWith('hub-term.js'))?.[1];
  if (!entry?.inputs) return undefined;
  const modules: string[] = [];
  const emptied: string[] = [];
  for (const [k, v] of Object.entries(entry.inputs)) (v.bytesInOutput > 0 ? modules : emptied).push(k.replace(/^[\w-]+:/, ''));
  return { modules, emptied };
}

async function bundle(o: Parameters<typeof shipBuild>[0], b: { t0: number; ctx: ReturnType<typeof transformContext>; ledger: ReturnType<typeof newLedger>; entry: string; version: string; styleTables: StyleTableFiles; native: { name: string; file: string } | null; nodeLibs: readonly NodeLib[] | null }): Promise<ShipBuildResult> {
  const { t0, ctx, ledger, entry, version, styleTables } = b;
  const fixtureOnly = o.fixtureGraph === false ? undefined : fixtureOnlyModules();
  const r = await Bun.build({
    entrypoints: [entry],
    outdir: o.outdir,
    // Node: the engine's Node build (node:ffi) and no embedded library (writeNodeSide puts them beside).
    target: b.nodeLibs ? 'node' : 'bun',
    format: 'esm',
    naming: { entry: 'hub-term.js', asset: '[name]-[hash].[ext]', chunk: '[name]-[hash].js' },
    // Minified identifiers and syntax (what renames classes and functions); whitespace and the module headers stay,
    // so the artifact check reads exactly which modules shipped.
    minify: o.minify ? { identifiers: true, syntax: true, whitespace: false } : false,
    sourcemap: 'none',
    external: b.nodeLibs ? NATIVE_PLATFORMS.map((p) => `@opentui/core-${p}`) : otherPlatforms(o.target),
    define: { 'process.env.NODE_ENV': '"production"', __HUB_FIXTURES__: 'false', __HUB_ENGINE_VERSION__: JSON.stringify(version) },
    plugins: [...(b.native ? [nativeDirPlugin(b.native)] : []), termBuildPlugin({ ctx, resolver: termResolver, ledger, absent: DEV_ABSENT, styleTables, ...(fixtureOnly ? { fixtureOnly } : {}) })],
    // The module list of the artifact check comes from the metafile: a minified bundle has no module headers.
    metafile: true,
    throw: false,
  });
  const logs = r.logs.map((l) => String(l.message ?? l));
  const refusals = ledger.refusals.map((x) => ({ ...x, importers: importersOf(ledger.importers, x.message) }));
  // The fixture gate: a fixture / dev-only module that is a bundle INPUT fails the build, even when tree shaking would
  // drop it (folding is only so one run reports everything). Named with the live modules that import it.
  for (const rel of fixtureInputs(ledger)) {
    const abs = path.join(HUB, rel);
    const from = [...ledger.importers].filter(([spec]) => spec === abs || spec.replace(/\.[cm]?[tj]sx?$/, '') === abs.replace(/\.[cm]?[tj]sx?$/, ''))
      .flatMap(([, set]) => [...set]).map((x) => path.relative(HUB, x)).filter((x) => !isDevOnly(x, o.standIns) && !fixtureOnly?.has(x));
    refusals.push({ code: 'TERM_FIXTURE_INPUT', message: `${rel} is fixture-only but is an input of the ship build`, importers: from.length ? [...new Set(from)].sort() : undefined });
  }
  refusals.push(...stubRefusals(ledger.loaded).map((x) => ({ ...x, importers: undefined })));
  if (!r.success) return { ok: false, outdir: o.outdir, entry, files: [], refusals, artifact: null, folded: [...new Set(ledger.folded)].sort(), logs, ms: Math.round(performance.now() - t0) };
  let natives: NativeManifest | undefined;
  if (b.nodeLibs) {
    try { natives = await writeNodeSide(o.outdir, b.nodeLibs, o.minify === true); } catch (e) {
      refusals.push({ code: /^TERM_NODE_LAUNCHER/.test(String((e as Error).message)) ? 'TERM_NODE_LAUNCHER' : 'TERM_NODE_NATIVE', message: (e as Error).message, importers: undefined });
      return { ok: false, outdir: o.outdir, entry, files: [], refusals, artifact: null, folded: [...new Set(ledger.folded)].sort(), logs, ms: Math.round(performance.now() - t0) };
    }
  }
  const artifact = verifyArtifact(o.outdir, path.join(o.outdir, 'hub-term.js'), { keepEngines: o.standIns, roots: [process.cwd(), HUB], moduleList: metafileModules(r.metafile), ...(fixtureOnly ? { fixtureOnly } : {}), ...(natives ? { natives } : {}) });
  // The shipped headers name no build location (the checkout, a scratch copy, a temp directory): rewritten after the
  // artifact check, which reads the real paths.
  for (const f of fs.readdirSync(o.outdir).filter((x) => x.endsWith('.js'))) {
    const file = path.join(o.outdir, f);
    const code = fs.readFileSync(file, 'utf8');
    const shipped = shipHeaders(code);
    if (shipped !== code) fs.writeFileSync(file, shipped);
    for (const h of outsideHeaders(shipped)) artifact.findings.push(`${f}: a module header names a file outside the build directory (${h})`);
  }
  // Sizes as shipped (after the header rewrite).
  const files = r.outputs.map((f) => ({ path: path.relative(o.outdir, f.path), bytes: fs.statSync(f.path).size }));
  if (natives) for (const f of [NODE_LAUNCHER_FILE, ...Object.values(natives).map((e) => e.file)]) files.push({ path: f, bytes: fs.statSync(path.join(o.outdir, f)).size });
  artifact.findings = artifact.findings.map((f) => {
    const m = /^(src\/\S+): fixture-only, but live code reaches it/.exec(f);
    if (!m) return f;
    const abs = path.join(HUB, m[1]!);
    const from = [...ledger.importers].filter(([spec]) => spec === abs).flatMap(([, s]) => [...s]).map((x) => path.relative(HUB, x)).filter((x) => !isDevOnly(x));
    return from.length ? `${f}; imported by ${[...new Set(from)].sort().join(', ')}` : f;
  });
  return { ok: refusals.length === 0 && artifact.findings.length === 0, outdir: o.outdir, entry, files, refusals, artifact, folded: [...new Set(ledger.folded)].sort(), logs, ms: Math.round(performance.now() - t0) };
}

/** A sibling still under a scaffold marker (`// term-stub: <Name>`, scripts/term/new.ts) is not ported: each one the
 *  build loaded is a TERM_STUB_INPUT refusal. */
export function stubRefusals(loaded: readonly { file: string; kind: string }[]): { code: string; message: string; importers?: string[] }[] {
  const out: { code: string; message: string }[] = [];
  for (const rec of loaded) {
    if (rec.kind !== 'sibling' && !/\.term\.[cm]?tsx?$/.test(rec.file)) continue;
    let text = '';
    try { text = fs.readFileSync(rec.file, 'utf8'); } catch { continue; }
    const stubs = [...stubNames(text)];
    if (stubs.length) out.push({ code: 'TERM_STUB_INPUT', message: `${path.relative(HUB, rec.file)} still holds scaffold stubs (// term-stub: ${stubs.join(', ')}): port them and delete the markers before shipping` });
  }
  return out;
}

/** Fixture / dev-only modules the bundler loaded (served folded), each a TERM_FIXTURE_INPUT refusal. */
function fixtureInputs(ledger: { folded: string[] }): string[] {
  return [...new Set(ledger.folded)].sort();
}

/** Importers of the module a refusal names (best effort: the first hub path in the message). */
function importersOf(importers: Map<string, Set<string>>, message: string): string[] | undefined {
  const m = /(src\/[^\s:()]+)/.exec(message);
  if (!m) return undefined;
  const abs = path.join(HUB, m[1]!);
  const out = new Set<string>();
  for (const [spec, from] of importers) if (spec === abs || spec.startsWith(abs.replace(/\.[tj]sx?$/, ''))) for (const f of from) out.add(path.relative(HUB, f));
  return out.size ? [...out].sort() : undefined;
}

if (import.meta.main) {
  const { safeDiagnostic } = (await import(path.join(SRC, 'term/prim/safe.ts'))) as typeof import('../../src/term/prim/safe');
  const say = (s: string): void => { process.stdout.write(safeDiagnostic(s, 4000) + '\n'); };
  // Default inside the hub's own cache (git-ignored), never a directory of the working copy around it.
  const outdir = path.resolve(arg('out') ?? path.join(HUB, '.term-cache', 'term-ship'));
  const standIns = flag('stand-ins');
  // --target: refused here, before any build, unless it is a listed platform.
  const parsed = flag('target') ? parseTarget(arg('target')) : null;
  if (parsed && 'error' in parsed) { say(`ship build: ${parsed.error}`); process.exit(1); }
  const target = parsed?.target;
  const runtime = arg('runtime') ?? 'bun';
  if (runtime !== 'bun' && runtime !== 'node') { say(`ship build: --runtime takes bun or node, not ${JSON.stringify(runtime)}`); process.exit(1); }
  // The Node build: one bundle for every platform, a library per platform (--natives); --target and --native-dir are
  // the Bun build's (one embedded library), --compile and the measurement run Bun.
  if (runtime === 'node' && (flag('target') || flag('native-dir') || flag('compile'))) { say('ship build: --runtime node takes --natives, not --target, --native-dir or --compile'); process.exit(1); }
  if (runtime === 'bun' && flag('natives')) { say('ship build: --natives is for --runtime node'); process.exit(1); }
  const natives = (arg('natives') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of natives) {
    const p = parseTarget(n);
    if ('error' in p) { say(`ship build: --natives: ${p.error}`); process.exit(1); }
  }
  const foreign = runtime === 'node' || (target !== undefined && target !== HOST_PLATFORM);
  let res: ShipBuildResult;
  try {
    res = await shipBuild({ outdir, minify: flag('minify'), standIns, ...(target ? { target } : {}), ...(arg('native-dir') ? { nativeDir: path.resolve(arg('native-dir')!) } : {}), ...(runtime === 'node' ? { runtime, ...(natives.length ? { natives: natives as NativePlatform[] } : {}) } : {}) });
  } catch (e) {
    if (!(e instanceof NativePackageError)) throw e;
    say(`ship build: ${e.message}`);
    process.exit(1);
  }
  say(`ship build${standIns ? ' (WITH STAND-INS: not shippable, measurement only)' : ''}: ${res.ok && !standIns ? 'OK' : 'FAILED'} in ${res.ms} ms -> ${outdir}`);
  for (const f of res.files) say(`  ${f.path} ${f.bytes} B`);
  for (const l of res.logs) say(`  bun: ${l}`);
  say(`fixture / dev-only modules in the graph, folded: ${res.folded.length}${res.folded.length ? ' (' + res.folded.slice(0, 12).join(', ') + (res.folded.length > 12 ? ', ...' : '') + ')' : ''}`);
  for (const x of res.refusals) say(`  REFUSED ${x.code}: ${x.message}${x.importers ? ` (imported by ${x.importers.join(', ')})` : ''}`);
  if (res.artifact) {
    const a = res.artifact;
    say(`artifact: ${a.modules.length} modules (${a.srcModules} from hub/src), react x${a.copies.react}, react-reconciler x${a.copies['react-reconciler']}, scheduler x${a.copies.scheduler}, native ${a.native ?? 'MISSING'}`);
    for (const f of a.findings) say(`  ARTIFACT ${f}`);
  }
  let measure: unknown = null;
  // A bundle for another platform (or for Node) is not measured here: said, never skipped silently.
  if (foreign && !flag('no-measure')) say(runtime === 'node' ? 'measure: skipped (--runtime node; the measurement runs Bun)' : `measure: skipped (target ${target} is not this host)`);
  if (foreign && flag('compile')) say(`compile: skipped (target ${target} is not this host; bun scripts/term/build/hub-ship.ts --bundle ${outdir} --target ${target} --out <dir> cross-compiles it)`);
  if (res.artifact && !flag('no-measure') && !foreign) {
    const { measureShip } = await import('./build/measure-run');
    measure = await measureShip(path.join(outdir, 'hub-term.js'));
    say(`measure: ${JSON.stringify(measure)}`);
  }
  let compiled: unknown = null;
  if (flag('compile') && res.artifact && !foreign) {
    const { compileShip } = await import('./build/measure-run');
    compiled = await compileShip(outdir);
    say(`compile: ${JSON.stringify(compiled)}`);
  }
  const json = arg('json');
  if (json) fs.writeFileSync(json, JSON.stringify({ ...res, measure, compiled }, null, 1) + '\n');
  process.exit(res.ok && !standIns ? 0 : 1);
}
