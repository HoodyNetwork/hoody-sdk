// Checks the ship artifact itself (scripts/term/build.ts): the module list Bun wrote into the unminified bundle (one
// `// <path>` header per module it kept after tree shaking), against what a shipped terminal Hub may contain.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isExcluded } from '../graph/build';
import { NODE_LAUNCHER_FILE, type NativeManifest } from './node-files';
import { isDevOnly, LIVE_FIXTURE_ENGINES } from './plugin';

export interface ArtifactReport {
  /** Every module header in the bundle (paths as Bun wrote them, relative to the build's cwd). */
  modules: string[];
  /** Headers left with an empty body (folded / shaken away: no code). */
  emptied: string[];
  /** How many of them are hub/src modules. */
  srcModules: number;
  /** Distinct installed copies (package directories) of the engine's React stack. */
  copies: Record<'react' | 'react-reconciler' | 'scheduler', number>;
  /** The native library emitted beside the bundle (file name), or null; for the Node build, its libraries' names, joined. */
  native: string | null;
  findings: string[];
}

/** Modules a shipped build must never carry, by path (hub-relative or as Bun writes it). */
export const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/(^|\/)src\/term\/placeholder\.ts$/, 'placeholder runtime'],
  [/(^|\/)src\/term\/entry\.fixture\.ts$/, 'fixture entry'],
  [/(^|\/)src\/term\/app\/boot\.ts$/, 'fixture boot'],
  [/(^|\/)src\/term\/prim\/testing\.ts$/, 'test renderer'],
  [/(^|\/)src\/term\/(test|scenario)\//, 'terminal test / scenario code'],
  [/(^|\/)src\/core\/(world|fixtures|fixture-boot)\.ts$/, 'fixture world'],
  [/(^|\/)src\/pages\/[^/]+\/(.*\/)?(fixtures|.*-fixtures|world)\.ts$/, 'page fixture data'],
  [/(^|\/)src\/pages\/demo\//, 'demo page'],
  [/(^|\/)src\/kit\/gallery\//, 'kit gallery'],
  [/^(\.\.\/)*(hub\/)?scripts\/(?!term\/build\/(ship-entry|engine-check|style-pack)\.ts$|term\/css-translate\/caps\.ts$)/, 'build / dev script'],
  // caps.ts is the one runtime-data file of the translator (RUNTIME_STYLE_CAPS, read by src/term/jsx/css-table.ts):
  // exempt until it moves under src/term. Every other translator module is build code.
  [/css-translate\/(?!caps\.ts$)/, 'CSS translator (build code)'],
  [/@opentui\/core\/testing|test-renderer|test-utils/, 'OpenTUI test renderer'],
  // A peer of @opentui/react, imported only when DEV=true: it opens a websocket to a devtools server. The build serves
  // the specifier as an absent module (build.ts DEV_ABSENT); the real package in the bundle means that was bypassed.
  [/(^|\/)node_modules\/react-devtools-core\//, 'React devtools client (opens a websocket to a devtools server)'],
];

/** The module headers of a Bun bundle (unminified, or minified with whitespace kept: build.ts). A header whose whole body is an empty lazy initialiser
 *  (`var init_x = () => {};`, what Bun leaves of a module it emptied by tree shaking) carries no code: it is listed
 *  under `emptied`, not `modules`. */
export function bundleModules(code: string): string[] { return bundleModuleList(code).modules; }
export function bundleModuleList(code: string): { modules: string[]; emptied: string[] } {
  const modules = new Set<string>();
  const emptied = new Set<string>();
  const re = /^\/\/ (\S[^\n]*\.(?:[cm]?[jt]sx?|json|css|so|node))\n((?:(?!^\/\/ \S)[^\n]*\n?)*)/gm;
  for (const m of code.matchAll(re)) {
    const body = m[2]!.trim();
    // `var init_x = () => {};`; minified identifiers rename it (`var IQ = () => {};`), same shape.
    (/^var [\w$]+ = \(\) => \{\};$/.test(body) ? emptied : modules).add(m[1]!.trim());
  }
  for (const m of modules) emptied.delete(m);
  return { modules: [...modules], emptied: [...emptied] };
}

/** A module header naming a file outside the build's working directory (`// ../…` or `// /…`): Bun writes such a path
 *  relative to the working directory, so it spells out where the build ran (the checkout, a scratch copy, a linked
 *  node_modules' real directory, a temp directory). The path may hold spaces (a directory named `my builds`). */
const OUTSIDE_HEADER_RE = /^\/\/ ((?:\.\.\/|\/)[^\n]*\.(?:[cm]?[jt]sx?|json|css|so|node))$/gm;

/** Any line-start comment naming a path outside the working directory, whatever the file type: what is still there after
 *  shipHeaders fails the build (fail closed: a header shipHeaders does not know is never shipped). */
const OUTSIDE_ANY_RE = /^\/\/ (?:\.\.\/|\/)[^\n]*$/gm;

/** A shipped header's path: from the first `node_modules/` on (the package and its nesting stay readable), else the
 *  file name alone. */
export function shippedHeaderPath(p: string): string {
  const i = p.indexOf('node_modules/');
  return i >= 0 ? p.slice(i) : path.posix.basename(p);
}

/** The bundle text with every module header that names a file outside the working directory rewritten by
 *  shippedHeaderPath. Code and every other comment (licence banners included) stay byte for byte. Run after
 *  verifyArtifact (which reads the real paths: linkedVersions, the React copy count). */
export function shipHeaders(code: string): string {
  return code.replace(OUTSIDE_HEADER_RE, (_m, p: string) => `// ${shippedHeaderPath(p)}`);
}

/** Line-start comments still naming a path outside the working directory, any file type (none after shipHeaders). */
export function outsideHeaders(code: string): string[] {
  return [...code.matchAll(OUTSIDE_ANY_RE)].map((m) => m[0].slice(3));
}

/** Asset budgets per class (bytes). An asset of no class, or over its budget, fails the build: a large file nobody
 *  uses (OpenTUI's tree-sitter grammars were 5 MB) must be left out at build time, not shipped. */
export const ASSET_BUDGETS: ReadonlyArray<{ cls: string; re: RegExp; maxEach: number; maxTotal: number; maxCount: number }> = [
  { cls: 'native library', re: /\.(so|dylib|dll)$/, maxEach: 8_000_000, maxTotal: 8_000_000, maxCount: 1 },
  // 1.5 MB: the per-band pack v2 is about 1.21 MB.
  { cls: 'class-style tables', re: /^css-tables-[a-z0-9]+\.json$/, maxEach: 1_500_000, maxTotal: 1_500_000, maxCount: 1 },
  { cls: 'wasm / grammar', re: /\.(wasm|scm)$/, maxEach: 0, maxTotal: 0, maxCount: 0 },
  // The Node build's launcher (build/node-runtime.ts with the demo account): about 0.2 MB.
  { cls: 'node launcher', re: /^hub-node\.js$/, maxEach: 1_000_000, maxTotal: 1_000_000, maxCount: 1 },
];

/** `natives`: how many native libraries the build carries (the Node build: one per platform; each within the native
 *  library budget, the total within that many times it). */
export function assetFindings(outdir: string, natives = 1): string[] {
  const out: string[] = [];
  const files = fs.readdirSync(outdir).filter((f) => f !== 'hub-term.js' && fs.statSync(path.join(outdir, f)).isFile() && !/\.(ts|map)$/.test(f) && !f.startsWith('hub-term-measure'));
  const used = new Map<string, { n: number; total: number }>();
  for (const f of files) {
    const size = fs.statSync(path.join(outdir, f)).size;
    const b = ASSET_BUDGETS.find((x) => x.re.test(f));
    if (!b) { if (size > 64_000) out.push(`asset ${f} (${size} B) has no budget class; add one in build/verify.ts ASSET_BUDGETS or leave it out of the build`); continue; }
    if (size > b.maxEach) out.push(`asset ${f} (${size} B) is over the ${b.cls} budget of ${b.maxEach} B each`);
    const u = used.get(b.cls) ?? { n: 0, total: 0 };
    used.set(b.cls, { n: u.n + 1, total: u.total + size });
  }
  for (const b of ASSET_BUDGETS) {
    const u = used.get(b.cls);
    if (!u) continue;
    const per = b.cls === 'native library' ? natives : 1;
    if (u.n > b.maxCount * per) out.push(`${u.n} ${b.cls} files; the budget is ${b.maxCount * per}`);
    if (u.total > b.maxTotal * per) out.push(`${b.cls}: ${u.total} B in total, over the budget of ${b.maxTotal * per} B`);
  }
  return out;
}

interface LinkedPackage { version: string; dir: string; pkg: { version: string; dependencies?: Record<string, string>; peerDependencies?: Record<string, string> } }
/** The package.json of each package the bundle's module headers name (paths are relative to the build's root). */
export function linkedVersions(modules: readonly string[], roots: readonly string[]): Record<string, LinkedPackage> {
  const out: Record<string, LinkedPackage> = {};
  for (const m of modules) {
    const hit = /^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(m);
    if (!hit || out[hit[2]!]) continue;
    for (const r of roots) {
      const dir = path.resolve(r, hit[1]!);
      const f = path.join(dir, 'package.json');
      if (!fs.existsSync(f)) continue;
      const pkg = JSON.parse(fs.readFileSync(f, 'utf8')) as LinkedPackage['pkg'];
      out[hit[2]!] = { version: pkg.version, dir, pkg };
      break;
    }
  }
  return out;
}

/** A class or function NAME in shipped hub code: any read of `x.constructor.name` (a comparison silently stops
 *  matching once minification renames the class; a label or message shows the minified name), and a comparison of
 *  `fn.name !== 'Bar'` style. Identify by instanceof, a tag property or the object's own members (shipped code
 *  refuses `constructor.name` everywhere, since a helper such as layoutcheck's isScrollBox can reach the bundle). */
const NAME_COMPARE: readonly RegExp[] = [
  /\.constructor\.name\b/,
  /\.constructor\.name\s*[!=]==?/,
  /[!=]==?\s*[\w$.]*\.constructor\.name\b/,
  /\.test\(\s*[\w$.]+\.constructor\.name\s*\)/,
  /\.constructor\.name\.(startsWith|endsWith|includes|match)\(/,
  /\b(?:type|fn|func|component|Component|elementType|ctor)\.name\s*[!=]==?\s*['"`]/,
];

/** Name comparisons in the hub/src modules of a bundle, one finding per source line (bundle text, so only code that
 *  ships is judged). `src` lines are looked up in the source under `hub` to give a line number. */
export function nameComparisonFindings(code: string, hub?: string): string[] {
  const out: string[] = [];
  const lines = code.split('\n');
  let mod: string | null = null;
  for (const l of lines) {
    const h = /^\/\/ (\S+)$/.exec(l);
    if (h) { const i = h[1]!.indexOf('src/'); mod = i >= 0 && !h[1]!.includes('node_modules') ? h[1]!.slice(i) : null; continue; }
    if (!mod || !NAME_COMPARE.some((re) => re.test(l))) continue;
    const text = l.trim();
    let where = mod;
    if (hub) {
      try {
        const src = fs.readFileSync(path.join(hub, mod), 'utf8').split('\n');
        const key = /constructor\.name|\.name\s*[!=]/.exec(text)?.[0] ?? '';
        const n = src.findIndex((x) => x.includes(key) && NAME_COMPARE.some((re) => re.test(x)));
        if (n >= 0) where = `${mod}:${n + 1}`;
      } catch { /* source not readable: name the module only */ }
    }
    out.push(`${where}: reads or compares a class or function name (${text.slice(0, 120)}); minification renames them: use instanceof, a tag property, the object's own members or a registered id`);
  }
  return [...new Set(out)];
}

/** `fixtureOnly`: hub-relative modules only fixture or test code reaches in the source graph (fixture-graph.ts); one in
 *  the bundle is a finding whatever its name. */
/** `natives`: the Node build (build.ts --runtime node): each library it names must be beside the bundle with those
 *  bytes, the launcher must pin each sha256, no other library may be there, and the bundle must import no `bun:`
 *  module (Node cannot load one). */
export function verifyArtifact(outdir: string, bundle: string, o: { keepEngines?: boolean; roots?: readonly string[]; moduleList?: { modules: string[]; emptied: string[] }; fixtureOnly?: ReadonlySet<string>; natives?: NativeManifest } = {}): ArtifactReport {
  const code = fs.readFileSync(bundle, 'utf8');
  // The module headers; the build's metafile only when there are none (a whitespace-minified bundle).
  const headers = bundleModuleList(code);
  const fromMeta = headers.modules.length === 0 && !!o.moduleList;
  const { modules, emptied } = fromMeta ? o.moduleList! : headers;
  const findings: string[] = [];
  const srcOf = (m: string): string | null => { const i = m.indexOf('src/'); return i >= 0 && !m.includes('node_modules') ? m.slice(i) : null; };
  let srcModules = 0;
  for (const m of modules) {
    const s = srcOf(m);
    if (s) {
      srcModules++;
      if (isExcluded(s) && !(o.keepEngines && LIVE_FIXTURE_ENGINES.includes(s))) findings.push(`${s}: a test / fixture / harness module is in the bundle`);
    }
    for (const [re, what] of FORBIDDEN) if (re.test(s ?? m)) findings.push(`${s ?? m}: ${what} is in the bundle`);
    if (s && isDevOnly(s, o.keepEngines) && !isExcluded(s)) findings.push(`${s}: a dev-only module (demo / gallery / fixture world) is in the bundle: a live path uses it`);
    // By the graph, not the name: only fixture or test code reaches it in the source, yet the build kept it.
    if (s && o.fixtureOnly?.has(s) && !isExcluded(s) && !FORBIDDEN.some(([re]) => re.test(s)) && !(o.keepEngines && LIVE_FIXTURE_ENGINES.includes(s))) findings.push(`${s}: fixture or test code only, by the import graph (no live path in the source reaches it), yet the bundle has it: find what pulls it in (a define that did not fold, a computed import, a glob)`);
  }
  const copies = { react: 0, 'react-reconciler': 0, scheduler: 0 } as ArtifactReport['copies'];
  for (const pkg of Object.keys(copies) as (keyof typeof copies)[]) {
    const dirs = new Set(modules.map((m) => new RegExp(`^(.*node_modules/${pkg})/`).exec(m)?.[1]).filter(Boolean));
    copies[pkg] = dirs.size;
    if (dirs.size !== 1) findings.push(`${pkg}: ${dirs.size} copies in the bundle (${[...dirs].join(', ') || 'none'}); want exactly one`);
  }
  // Versions, not only copies: the reconciler the bundle links must be the one the engine declares (an API-side pin of
  // another reconciler crashed every commit), and React must satisfy the reconciler's peer range.
  const versions = linkedVersions(modules, o.roots ?? [process.cwd()]);
  const engineReact = versions['@opentui/react'];
  const range = engineReact?.pkg.dependencies?.['react-reconciler'];
  const rec = versions['react-reconciler'];
  if (!engineReact || !rec || !range) findings.push(`cannot read the linked versions of @opentui/react / react-reconciler (${Object.keys(versions).join(', ') || 'none found'})`);
  else if (!Bun.semver.satisfies(rec.version, range)) findings.push(`react-reconciler ${rec.version} is linked, but @opentui/react ${engineReact.version} declares ${range}`);
  const reactPeer = rec?.pkg.peerDependencies?.react;
  const react = versions.react;
  if (rec && react && reactPeer && !Bun.semver.satisfies(react.version, reactPeer)) findings.push(`react ${react.version} is linked, but react-reconciler ${rec.version} needs ${reactPeer}`);
  let native: string | null;
  if (o.natives) {
    const named = Object.values(o.natives).map((e) => e.file);
    native = named.length ? [...named].sort().join(', ') : null;
    if (!native) findings.push('the Node build names no native library');
    const launcherFile = path.join(outdir, NODE_LAUNCHER_FILE);
    const launcher = fs.existsSync(launcherFile) ? fs.readFileSync(launcherFile, 'utf8') : null;
    if (launcher === null) findings.push(`the Node build has no launcher (${NODE_LAUNCHER_FILE})`);
    for (const [platform, e] of Object.entries(o.natives)) {
      const f = path.join(outdir, e.file);
      if (!fs.existsSync(f)) findings.push(`the ${platform} library ${e.file} is not beside the bundle`);
      else if (crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') !== e.sha256) findings.push(`the ${platform} library ${e.file} is not the bytes the launcher pins`);
      if (launcher !== null && !launcher.includes(e.sha256)) findings.push(`the launcher does not pin the ${platform} library`);
    }
    for (const f of fs.readdirSync(outdir).filter((x) => /\.(so|dylib|dll)$/.test(x))) if (!named.includes(f)) findings.push(`${f}: a native library the Node build does not name`);
    if (/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']bun(?::[\w-]+)?["']/.test(code)) findings.push('the Node bundle imports a bun: module');
  } else {
    native = fs.readdirSync(outdir).find((f) => /\.(so|dylib|dll)$/.test(f)) ?? null;
    if (!native) findings.push('the OpenTUI native library is not beside the bundle');
  }
  for (const f of assetFindings(outdir, o.natives ? Math.max(1, Object.keys(o.natives).length) : 1)) findings.push(f);
  const hubDir = (o.roots ?? []).find((r) => fs.existsSync(path.join(r, 'src')));
  // Minified code has no headers: judge the shipped hub modules' sources instead (same rule, same messages).
  const judged = fromMeta && hubDir
    ? modules.map((m) => { const i = m.indexOf('src/'); return i >= 0 && !m.includes('node_modules') ? m.slice(i) : null; }).filter((m): m is string => !!m)
      .map((m) => { try { return `// ${m}\n${fs.readFileSync(path.join(hubDir, m), 'utf8')}`; } catch { return ''; } }).join('\n')
    : code;
  for (const f of nameComparisonFindings(judged, hubDir)) findings.push(f);
  if (/__HUB_FIXTURES__/.test(code)) findings.push('__HUB_FIXTURES__ survives in the bundle (a define did not apply)');
  // A folded fixture module whose stand-ins survive tree shaking is used by live code: name each such export.
  // (A module Bun wraps in a lazy initialiser keeps all its stand-ins once any live module reaches it: the finding names
  // the module's exports, the build report names its importers.)
  const kept = new Map<string, string[]>();
  for (const m of code.matchAll(/__fixturesOff\("([^"]+)", "([^"]+)"\)/g)) kept.set(m[2]!, [...(kept.get(m[2]!) ?? []), m[1]!]);
  for (const [f, names] of kept) findings.push(`${f}: fixture-only, but live code reaches it (folded stand-ins kept: ${names.join(', ')})`);
  return { modules, emptied, srcModules, copies, native: native && !o.natives ? path.basename(native) : native, findings };
}
