// Vite config of the Hub v3 app. The hub:* scripts (hub/scripts) drive it.
//
// Modes:
//   build (hub:build; not part of `npm run build`): the production bundle, base /auth/hub/.
//     __HUB_FIXTURES__ is false, so fixture branches fold away, and devOnly() lets the build drop
//     the fixture world, the fixture boot, the demo page and the kit gallery once nothing live uses
//     them (proof: hub:build output carries no fixture account; see app/pages.ts).
//   fixtures (hub:dev, hub:shots, page specs): pages read their fixtures.ts through the fake
//     transport; the live-only <head> block (boot gate, shared.js) is stripped.
// Environment set by the scripts:
//   HUB_PAGE       hub:dev --page <id>: the router keeps that page plus the shell.
//   HUB_CACHE_DIR  the Vite cache folder, set per run so that parallel runs do not share one.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { coreBarrelFor, hubFixturesFor } from './vite.modes';
import { configDefaults } from 'vitest/config';
import { bootStrings } from './scripts/page-boot-strings.ts';
import { checkHosts, pageFiles, readSrc, searchIndex, searchIndexModule, SRC_DIR } from './scripts/search-index-gen.ts';
import { NODE_ISOLATED, NODE_SHARED } from './vitest.lists.mts';

const HUB = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HUB, '..');
const PUBLIC_AUTH = path.join(API_ROOT, 'public', 'auth');
const HUB_OUT_DIR = path.join(API_ROOT, 'dist', 'public', 'auth', 'hub');

/**
 * Tests read public/auth/shared.js?raw (the auth pages' session library), which sits outside HUB.
 * Vitest adds only the config folder, its own folder and the workspace root it finds above HUB, so a
 * tree with no package.json above hub/ (or with public/ linked in) refused it ("Denied ID"). Allowed by
 * path and by real path.
 */
function testFsAllow(): string[] {
  const dirs = [PUBLIC_AUTH];
  try {
    dirs.push(fs.realpathSync(PUBLIC_AUTH));
  } catch {
    // No public/auth in this tree: the tests that read it fail on the import itself.
  }
  return dirs;
}

const LIVE_BLOCK = /<!--\s*hub:live\s*-->[\s\S]*?<!--\s*\/hub:live\s*-->/g;

/** Fixtures mode never loads the live boot scripts: they would bounce a visitor without a session. */
function liveBlock(fixtures: boolean): Plugin {
  return {
    name: 'hub-live-block',
    transformIndexHtml(html) {
      // Fixtures mode: no live scripts, and no server placeholders (nothing substitutes them).
      return fixtures
        ? html.replace(LIVE_BLOCK, '').replace(/\{\{\s*[A-Z_]+\s*\}\}/g, '')
        : html.replace(/<!--\s*\/?hub:live\s*-->\n?/g, '');
    },
  };
}

/**
 * Dev-only modules are marked side-effect free, so the build drops them when only folded-away
 * fixture branches import them. A live path that really uses one keeps it (and the grep shows it).
 */
const DEV_ONLY = [
  /\/src\/core\/(world|fixtures|fixture-boot|index\.fixtures)\.ts$/,
  /\/src\/pages\/demo\//,
  /\/src\/kit\/gallery\//,
];
function devOnly(): Plugin {
  return {
    name: 'hub-dev-only',
    apply: 'build',
    transform(code, id) {
      return DEV_ONLY.some((re) => re.test(id.split('?')[0] ?? '')) ? { code, map: null, moduleSideEffects: false } : null;
    },
  };
}

/**
 * Kit modules only define things at load, so the build marks them side-effect free: a kit module nothing uses is
 * dropped even though the '@kit' barrel imports it (with the CSS module it binds). A module counts as pure only when
 * it is made of the forms the conformance test allowlists; every other module keeps the default and is listed here.
 * src/kit/kitpure.conformance.test.ts parses every kit module and fails on an unlisted module or a stale entry.
 */
export const KIT_IMPURE: readonly string[] = [
  'kit/agent/ConvHeader.tsx',
  'kit/agent/SessionView.tsx',
  'kit/agent/SplitLayout.tsx',
  'kit/agent/approver-custody.ts',
  'kit/agent/code.ts',
  'kit/agent/decisionEvidence.ts',
  'kit/agent/displayShot.ts',
  'kit/agent/sessionImage.ts',
  'kit/agent/states/AgentStates.tsx',
  'kit/ask.ts',
  'kit/controls/Button.tsx',
  'kit/controls/Kbd.tsx',
  'kit/controls/Link.tsx',
  'kit/controls/Tabs.tsx',
  'kit/data/DataTable.tsx',
  'kit/data/DataTableViewLogic.ts',
  'kit/data/FilterChips.tsx',
  'kit/data/Ids.tsx',
  'kit/data/IpInfo.tsx',
  'kit/data/codeLang.ts',
  'kit/data/drag.tsx',
  'kit/data/highlight.ts',
  'kit/format.ts',
  'kit/forms/CodeEditor.tsx',
  'kit/forms/ColorPicker.tsx',
  'kit/forms/Form.tsx',
  'kit/forms/NumberField.tsx',
  'kit/forms/PathField.tsx',
  'kit/forms/RadioGroup.tsx',
  'kit/forms/Secret.tsx',
  'kit/forms/Select.tsx',
  'kit/forms/TimeField.tsx',
  'kit/forms/sshKey.ts',
  'kit/icons.tsx',
  'kit/layouts/CardEdge.tsx',
  'kit/layouts/Layouts.tsx',
  'kit/layouts/ListDetailPage.tsx',
  'kit/layouts/PageHeader.tsx',
  'kit/overlays/Dialog.tsx',
  'kit/overlays/Drawer.tsx',
  'kit/overlays/Menu.tsx',
  'kit/overlays/Popover.tsx',
  'kit/perf.ts',
  'kit/pickers/modelPaging.ts',
  'kit/pickers/modelViews.ts',
  'kit/states/Toast.tsx',
  'kit/states/errorWords.ts',
  'kit/strings.ts',
];
function kitPure(): Plugin {
  return {
    name: 'hub-kit-pure',
    apply: 'build',
    transform(code, id) {
      const rel = /\/src\/(kit\/.+\.tsx?)$/.exec(id.split('?')[0] ?? '')?.[1];
      return rel && !rel.startsWith('kit/gallery/') && !KIT_IMPURE.includes(rel) ? { code, map: null, moduleSideEffects: false } : null;
    },
  };
}

/**
 * Vitest's module cache (test.fsModuleCache) keys a transformed module on its id, its own text, NODE_ENV and parts of
 * the Vite config, and skips a module whose text holds the exact string `import.meta.glob(`. Three inputs it misses
 * would let a test run against a stale transform, so this plugin closes them:
 * - A glob it does not spot. A typed call (`import.meta.glob<T>(`, as app/pages.ts does for page discovery) or a spaced
 *   one (`import.meta . glob(`, which the TypeScript transform turns into a call before Vite's glob transform) would be
 *   cached with the file list of the run that wrote it. Any module whose text has `glob` (other than in `global...`), or
 *   a `\u` escape (an escaped identifier can spell glob), is never cached. No plugin of this config adds a glob call
 *   to a module's code; one that did would need the same rule.
 * - The define values (__HUB_PAGE__, __HUB_FIXTURES__).
 * - The tsconfig files Vite's TypeScript transform reads (jsx and other compiler options): every tsconfig*.json under
 *   hub/ (tsconfigDigest), with what they extend and reference. When that set can not be established completely, the
 *   cache is off for the run (the config's fsModuleCache), never keyed on a partial set.
 */
function vitestCacheKeys(define: Record<string, string>, tsconfig: string | null): Plugin {
  const key = JSON.stringify({ define, tsconfig });
  return {
    name: 'hub-vitest-cache-keys',
    configureVitest({ defineCacheKeyGenerator }) {
      defineCacheKeyGenerator(({ sourceCode }) => (/glob(?!al)|\\u/.test(sourceCode) ? false : key));
    },
  };
}

/**
 * The bytes of every tsconfig*.json under hub/ and of the package root's tsconfig.json, plus every file they extend or reference,
 * or null when that set can not be established completely (an unreadable directory or tsconfig, a file that is not
 * JSONC, an `extends` naming a package): the caller then turns the cache off. hub/.check (the per-page configs hub:check
 * writes for its tsc step, never read by Vite), node_modules and build output are pruned before the walk enters them: otherwise
 * one check run would change the cache keys of every other run.
 */
function tsconfigDigest(): string | null {
  const h = crypto.createHash('sha256');
  const todo = [path.join(API_ROOT, 'tsconfig.json')];
  const skip = /^(?:\.check|node_modules|dist|\.vite.*)$/;
  const walk = (dir: string): boolean => {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of ents) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!skip.test(e.name) && !walk(f)) return false;
      } else if (/^tsconfig.*\.json$/.test(e.name)) todo.push(f);
    }
    return true;
  };
  if (!walk(HUB)) return null;
  todo.sort();
  const seen = new Set<string>();
  while (todo.length) {
    const f = todo.shift() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    let text: string;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      // A missing extends/reference target is an input too (creating it changes the key); anything else is not knowable.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT' || f === path.join(API_ROOT, 'tsconfig.json')) return null;
      h.update(`${f}\n\0missing\n`);
      continue;
    }
    h.update(`${f}\n${text}\n`);
    const json = parseJsonc(text);
    if (!json || typeof json !== 'object') return null;
    const { extends: ext, references } = json as { extends?: unknown; references?: unknown };
    for (const t of ext === undefined ? [] : Array.isArray(ext) ? ext : [ext]) {
      if (typeof t !== 'string' || !/^\.{1,2}\/|^\//.test(t)) return null; // a package (or odd) extends: not followed, cache off
      const abs = path.resolve(path.dirname(f), t);
      todo.push(abs.endsWith('.json') || fs.existsSync(abs) ? abs : `${abs}.json`);
    }
    for (const r of Array.isArray(references) ? references : references === undefined ? [] : [null]) {
      const p = (r as { path?: unknown } | null)?.path;
      if (typeof p !== 'string') return null;
      const abs = path.resolve(path.dirname(f), p);
      todo.push(abs.endsWith('.json') ? abs : path.join(abs, 'tsconfig.json'));
    }
  }
  return h.digest('hex');
}

/** JSON with comments and trailing commas (tsconfig's dialect), or null. Comments and commas inside strings are kept. */
function parseJsonc(text: string): unknown {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0) return null;
      out += ' ';
      i = j + 1;
    } else if (c === ',' && /^\s*[}\]]/.test(text.slice(i + 1).replace(/^(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*/, ''))) {
      // a trailing comma (only whitespace and comments before the closing bracket): dropped
    } else out += c;
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/**
 * The module cache's folder: one per tree and lockfile state under the Vite cache folder. Working copies that share one node_modules
 * (or one HUB_CACHE_DIR) never share a cache, and a run never meets another lockfile's metadata there: Vitest deletes the
 * whole folder when the lockfile hash it stored differs (getLockfileHash: the nearest lockfile of several formats from the
 * root up, plus its patches folder's mtime), which would pull files from under the workers of a gate of the same tree
 * running at that moment. The folder name hashes a superset of what Vitest can select: every lockfile of those formats in
 * HUB and each folder above it, and both patches folders' mtimes there, so any change Vitest sees moves to a new folder.
 */
function vitestCachePath(cacheDir: string): string {
  let tree = API_ROOT;
  // Vite reads a relative cacheDir against the root (HUB).
  const base = path.resolve(HUB, cacheDir);
  try {
    tree = fs.realpathSync(API_ROOT);
  } catch {
    // Keep the spelled path.
  }
  const lockNames = ['node_modules/.package-lock.json', 'node_modules/.yarn-state.yml', '.pnp.cjs', '.pnp.js',
    'node_modules/.yarn-integrity', 'node_modules/.pnpm/lock.yaml', '.rush/temp/shrinkwrap-deps.json', 'bun.lock', 'bun.lockb'];
  const lock = crypto.createHash('sha256');
  for (let dir = HUB; ; dir = path.dirname(dir)) {
    for (const n of lockNames) {
      try {
        lock.update(`${path.join(dir, n)}\n`).update(fs.readFileSync(path.join(dir, n)));
      } catch {
        // Not there.
      }
    }
    for (const n of ['patches', '.yarn/patches']) {
      try {
        const st = fs.statSync(path.join(dir, n));
        if (st.isDirectory()) lock.update(`${path.join(dir, n)} ${st.mtimeMs}\n`);
      } catch {
        // No patches folder.
      }
    }
    if (path.dirname(dir) === dir) break;
  }
  // Vitest orders those lockfile candidates by the package manager in npm_config_user_agent and hashes the first one it
  // finds, so the same files can give two Vitest hashes; one folder per user agent keeps a mismatch from clearing a
  // folder another gate is reading.
  lock.update(`ua ${process.env.npm_config_user_agent ?? ''}\n`);
  const id = (x: string) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
  return path.join(base, 'vitest-fs', `${id(tree)}-${lock.digest('hex').slice(0, 16)}`);
}

/**
 * Workers per vitest run. Vitest's default for `vitest run` is one per core but one, and on a machine running several
 * test runs each one starts that many at once (23 each on 24 cores). A sixth of the cores (at least 2) keeps six gates at once
 * inside a machine of 12 cores or more. HUB_VT_WORKERS, or --maxWorkers on the command line, sets another count.
 */
function vitestWorkers(): number {
  const n = Number(process.env.HUB_VT_WORKERS);
  return Number.isInteger(n) && n > 0 ? n : Math.max(2, Math.floor(os.availableParallelism() / 6));
}

const PAGE_BOOT = '\0hub-page-boot:';

/**
 * Boot loads every page.ts, and the shell reads only the strings its manifest names (title, nav, navCount, commands,
 * widgets, guide, tile views). So page.ts's `import strings from './strings.en.json'` gets only the keys that page.ts
 * writes as quoted literals, with their plural forms (scripts/page-boot-strings.ts). A view imports the whole table
 * itself, so it arrives with the view's chunk. Every importer other than a page's own page.ts reads the real file. Same
 * in dev, build and vitest: no `apply`, no mode branch. A key the manifest names that this misses makes definePage throw
 * at load.
 */
function pageBootStrings(): Plugin {
  return {
    name: 'hub-page-boot-strings',
    enforce: 'pre',
    resolveId(source, importer) {
      const from = importer?.split('?')[0];
      if (source !== './strings.en.json' || !from || !/\/src\/pages\/[^/]+\/page\.ts$/.test(from)) return null;
      return PAGE_BOOT + path.join(path.dirname(from), 'strings.en.json');
    },
    load(id) {
      if (!id.startsWith(PAGE_BOOT)) return null;
      const table = id.slice(PAGE_BOOT.length);
      const page = path.join(path.dirname(table), 'page.ts');
      this.addWatchFile(table);
      this.addWatchFile(page);
      const kept = bootStrings(fs.readFileSync(page, 'utf8'), JSON.parse(fs.readFileSync(table, 'utf8')) as Record<string, string>);
      // JSON text: Vite's JSON plugin turns it into a module, as for the real file.
      return JSON.stringify(kept);
    },
  };
}

const SEARCH_INDEX = 'virtual:hub-search-index';

/**
 * Jump to's deep index (settings sections and rows, page tabs, FAQ questions), read from the pages' sources by
 * scripts/search-index-gen.ts each time the module loads: built with the bundle, again in dev when a page file changes,
 * and in every test run. Never committed, so it cannot go stale. Only the palette imports it, lazily: not in boot.
 */
function searchIndexPlugin(): Plugin {
  return {
    name: 'hub-search-index',
    resolveId(source) {
      return source === SEARCH_INDEX ? '\0' + SEARCH_INDEX : null;
    },
    load(id) {
      if (id !== '\0' + SEARCH_INDEX) return null;
      const files = pageFiles();
      checkHosts(files);
      // Every file the reader opened, the strings tables included, is a dependency: an edit to one serves a new index.
      // Only files that exist (a probe for a missing faq.ts is no dependency; Vite would try to load it). A new page file
      // reaches the index through an edit to a file that imports it, or at the next load.
      const read = new Set<string>();
      const index = searchIndex(files, (rel) => {
        const text = readSrc(rel);
        if (text !== undefined) read.add(rel);
        return text;
      });
      for (const f of read) this.addWatchFile(path.join(SRC_DIR, f));
      return searchIndexModule(index);
    },
  };
}

/**
 * The dev server answers /auth/<font, stylesheet, icon or the install manifest> from public/auth (read-only), so
 * what the built page takes from the real server also loads in hub:dev and the page specs.
 */
function devAuthAssets(): Plugin {
  const allowed = /^\/auth\/(hub-fonts\.css|fonts\/[\w.-]+\.woff2|favicon[\w.-]*\.(svg|ico|png)|apple-touch-icon\.png|pwa\/[\w.-]+\.(webmanifest|png))$/;
  const types: Record<string, string> = { '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
  return {
    name: 'hub-dev-auth-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (!allowed.test(url)) return next();
        const file = path.join(PUBLIC_AUTH, url.slice('/auth/'.length));
        if (!file.startsWith(PUBLIC_AUTH) || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

function nmOutside(): boolean {
  try {
    const nm = fs.realpathSync(path.join(API_ROOT, 'node_modules'));
    const r = fs.realpathSync(API_ROOT);
    return nm !== r && !nm.startsWith(r + path.sep);
  } catch { return false; }
}

export default defineConfig(({ command, mode }) => {
  const fixtures = hubFixturesFor(command, mode);
  // node_modules linked from outside the repo (a working copy): the cache stays in the copy (hub/.term-cache).
  const cacheDir = process.env.HUB_CACHE_DIR ?? (nmOutside() ? path.join(HUB, '.term-cache', 'vite-hub') : path.join(API_ROOT, 'node_modules', '.vite-hub'));
  const define = {
    __HUB_FIXTURES__: JSON.stringify(fixtures),
    __HUB_PAGE__: JSON.stringify(process.env.HUB_PAGE ?? ''),
  };
  // The module cache is opt-in: on only with HUB_FS_CACHE=1 and when its
  // tsconfig inputs can be established (tsconfigDigest not null); off, neither the tsconfig walk nor the lockfile hashing runs.
  const fsCacheWanted = process.env.HUB_FS_CACHE === '1';
  const tsconfig = fsCacheWanted ? tsconfigDigest() : null;
  const fsCache = fsCacheWanted && tsconfig !== null;
  return {
    root: HUB,
    base: command === 'build' ? '/auth/hub/' : '/',
    cacheDir,
    publicDir: false,
    plugins: [react(), liveBlock(fixtures), devAuthAssets(), devOnly(), kitPure(), pageBootStrings(), searchIndexPlugin(), vitestCacheKeys(define, tsconfig)],
    define,
    resolve: {
      alias: [
        { find: '@kit', replacement: path.join(HUB, 'src/kit') },
        // '@core' itself: the fixture barrel only where fixtures run, the live barrel in a production build (coreBarrelFor);
        // '@core/<file>' is that file. The terminal ship build resolves '@core' to the live barrel too (scripts/term/resolve.ts).
        { find: /^@core$/, replacement: coreBarrelFor(HUB, fixtures) },
        { find: '@core', replacement: path.join(HUB, 'src/core') },
        { find: '@app', replacement: path.join(HUB, 'src/app') },
        { find: '@shell', replacement: path.join(HUB, 'src/shell') },
        // The one read-only way a page reaches Ask's agent IO (src/ask/io.ts: data.ts + logic.ts).
        { find: '@ask/io', replacement: path.join(HUB, 'src/ask/io.ts') },
      ],
    },
    css: {
      modules: {
        // Dev names keep the readable <file>-module__<class> prefix (specs select with [class*=...]) and add a hash of
        // the file's path and the class: many pages share parts.module.css and a class name, and one dev server loads
        // them all, so without it one page's rule applied to another's element. Production names are unchanged.
        generateScopedName: command === 'build' ? 'h[hash:base64:6]' : '[name]__[local]_[hash:base64:5]',
      },
    },
    server: {
      host: '127.0.0.1',
      strictPort: true,
      fs: { allow: [HUB, ...(mode === 'test' ? testFsAllow() : [])] },
    },
    build: {
      outDir: HUB_OUT_DIR,
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: false,
      target: 'es2022',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 4096,
      rolldownOptions: {
        output: {
          comments: false,
          // Everything the entry imports statically goes in one `boot` chunk: 3 JS + 1 CSS requests at first load instead
          // of about 15 + 8, which paints #hub-main 0.4-0.6 s sooner on a slow link (chore-perf boot-chunk-1). The entry
          // itself (index.html and main.tsx) stays its own chunk: main.tsx awaits bootCore() at top level (in the fixtures
          // build that imports each page's fixtures chunk), and those lazy chunks import boot, so with the entry inside boot each
          // would wait on the other and the Hub would never draw.
          codeSplitting: {
            groups: [{ name: 'boot', tags: ['$initial'], test: (id: string) => !/index\.html|[\\/]src[\\/]app[\\/]main\.tsx$/.test(id.replace(/\?.*$/, '')), priority: 100 }],
          },
        },
      },
    },
    test: {
      root: HUB,
      environment: 'happy-dom',
      globals: true,
      setupFiles: [path.join(HUB, 'src/app/test-setup.ts')],
      css: { modules: { classNameStrategy: 'non-scoped' } },
      testTimeout: 15000,
      // The persistent module cache: a module whose key matches a stored transform (vitestCacheKeys says what joins the
      // key and which modules are never stored, vitestCachePath where it lives) is not transformed again. Only
      // HUB_FS_CACHE=1 turns it on, and a tsconfig set tsconfigDigest can not establish keeps it off.
      fsModuleCache: fsCache,
      ...(fsCache ? { fsModuleCachePath: vitestCachePath(cacheDir) } : {}),
      maxWorkers: vitestWorkers(),
      // Terminal tests (`*.term.test.*`) run under bun test (scripts/term/check.ts), never in vitest. Every project
      // extends this, so none of the three can pick one up.
      exclude: [...configDefaults.exclude, '**/*.term.test.*'],
      // Three projects (vitest.lists.mts says which file goes where and how a file moves; `extends: true` concatenates
      // include/exclude arrays, so the web include lives in its project, never here): pure-logic
      // files skip happy-dom's window (about 0.2-1 s per file under load), and the proven ones also share one worker's
      // module graph instead of a fresh worker per file. Everything else stays in happy-dom, one worker per file, as before.
      projects: [
        { extends: true, test: { name: 'web', include: ['src/**/*.test.{ts,tsx}'], exclude: [...configDefaults.exclude, ...NODE_SHARED, ...NODE_ISOLATED] } },
        { extends: true, test: { name: 'node', environment: 'node', include: [...NODE_ISOLATED] } },
        { extends: true, test: { name: 'node-shared', environment: 'node', isolate: false, include: [...NODE_SHARED] } },
      ],
    },
  };
});
