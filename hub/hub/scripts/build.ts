// bun run build   (from the package root, hub/; also `bun run hub:build`)
// Production bundle: vite build to dist/public/auth/hub/ (served by the /auth/ static root),
// then the page template moves to dist/hub/index.html (outside every static root, so it is only
// ever served through serveAuthPage with placeholder substitution and the Hub CSP), then every
// asset gets .br, .gz and .deflate siblings (the server's static plugin, preCompressed, needs all
// three on dist files).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isHubHashedName } from '../../src/utils/auth-static';
import { bundleTexts, fixtureScanProblems, scanFixtureMarkers } from '../e2e-live/fixture-markers';
import { LOCK_BUSY, lockOutcome } from './build-lock';
import { API_ROOT, HUB, cacheBase, runTool } from './lib';

const OUT = path.join(API_ROOT, 'dist', 'public', 'auth', 'hub');
const TEMPLATE_DIR = path.join(API_ROOT, 'dist', 'hub');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

// One build of dist/ at a time: vite empties dist/public/auth/hub first, and a Hoody API build that embeds the Hub
// copies that directory out. Both take <package root>/.build-lock (flock); a caller that already holds it says so with
// HUB_BUILD_LOCK_HELD=1. Without flock (macOS) the build runs unlocked (build-lock.ts).
const LOCK = path.join(API_ROOT, '.build-lock');
const LOCK_WAIT_S = 600;
/** Run this script again as a child of flock(1) holding LOCK: the child's exit code, or null when there is no flock. */
function runLocked(): number | null {
  const r = spawnSync('flock', ['-w', String(LOCK_WAIT_S), '-E', String(LOCK_BUSY), LOCK, process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, HUB_BUILD_LOCK_HELD: '1' },
  });
  const o = lockOutcome(r, LOCK, LOCK_WAIT_S);
  if (o.message) console.error(o.message);
  return o.kind === 'unlocked' ? null : o.code;
}

async function main(): Promise<number> {
  if (process.env.HUB_BUILD_LOCK_HELD !== '1') {
    const code = runLocked();
    if (code !== null) return code;
  }
  // NODE_ENV production, always: `bun run hub:build` loads the API's .env (Bun reads the cwd's), whose
  // NODE_ENV=development the vite child inherits, and Vite then builds React's development bundle with jsxDEV
  // (source paths shipped, slower).
  const code = await runTool('vite', ['build', '--config', path.join(HUB, 'vite.config.mts'), '--logLevel', 'warn'], {
    HUB_CACHE_DIR: process.env.HUB_CACHE_DIR ?? cacheBase('.vite-hub-build'),
    NODE_ENV: 'production',
  });
  if (code !== 0) return code;

  fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  fs.renameSync(path.join(OUT, 'index.html'), path.join(TEMPLATE_DIR, 'index.html'));

  // The server caches every hashed-looking name under assets/ for a year (src/utils/auth-static.ts): nothing else may
  // be there, or a file that changes under the same name would stay stale in browsers.
  const unhashed = walk(path.join(OUT, 'assets')).filter((f) => !isHubHashedName(f));
  if (unhashed.length > 0) {
    console.error(`hub:build: assets without a content hash: ${unhashed.map((f) => path.basename(f)).join(', ')}`);
    return 1;
  }

  // No fixture-only code or data in the bundle or the template (e2e-live/fixture-markers.ts; hub-live checks the same list).
  const template = path.join(TEMPLATE_DIR, 'index.html');
  const fixtureProblems = fixtureScanProblems(scanFixtureMarkers([
    ...bundleTexts([OUT], API_ROOT),
    [path.relative(API_ROOT, template), fs.readFileSync(template, 'utf8')],
  ]));
  if (fixtureProblems.length > 0) {
    console.error(`hub:build: fixture markers in the production bundle:\n  ${fixtureProblems.join('\n  ')}`);
    return 1;
  }

  let n = 0;
  for (const file of walk(OUT)) {
    if (/\.(br|gz|deflate)$/.test(file)) continue;
    const buf = fs.readFileSync(file);
    fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));
    fs.writeFileSync(`${file}.gz`, zlib.gzipSync(buf, { level: 9 }));
    fs.writeFileSync(`${file}.deflate`, zlib.deflateSync(buf, { level: 9 }));
    n++;
  }
  console.log(`hub:build: ${n} assets (+ .br/.gz/.deflate) in dist/public/auth/hub, template dist/hub/index.html`);
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
