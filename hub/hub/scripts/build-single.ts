// bun run hub:build-single [--out <file>]
// The standalone Hub: the whole Hub as ONE self-contained HTML file (hoody-sdk ships it). Opened from any origin or as a
// file, it signs in to the Hoody it is built for (shared.js STANDALONE_ORIGIN; nobody types an address) and
// then is the Hub, over HTTP.
//
// Steps: vite build with vite.single.config.mts (one JS chunk, one CSS file, the upload worker inline) into a stage
// folder, then this script writes dist/hub-single/hoody-hub.html with
//   - a meta Content-Security-Policy carrying the sha256 of every inline script and style (no 'unsafe-inline');
//   - first the memory-only guard for a page opened as a file (src/standalone/fileMemory.ts: on file:// nothing is
//     stored on the computer), then
//   - the auth scripts the served Hub loads from /auth/ inline, in their served order: fouc.js, shared.js, then the two
//     the Hub needs that the served page loads on demand (token-auth.js, hub-boot-token.js). Each goes through Bun's
//     transpiler first (no comments, no spare white space; `'use strict'` kept by keepStrict), as the API does for the
//     copies it serves: the source comments name server files and are over half of these scripts;
//   - the Hub fonts (hub-fonts.css with each woff2 as a data: URL) and the icon as data: URLs;
//   - the CSS as one <style>, the bundle as one <script type="module">, each voice worklet as a blob: URL made in the page;
//   - one comment after the CSP meta with the notices the file must carry (noticeFiles): the package's
//     THIRD-PARTY-NOTICES.md beside hub/ (what the file bundles, the MIT and ISC texts), the Apache License 2.0 and the
//     license of each inlined font. A missing or empty one refuses the file.
// `--api` is gone: the Hoody is built in, so it is refused (exit 2) rather than silently ignored.
// Then it refuses the file when anything still loads from outside it (a src/href that is not data:, a stylesheet
// link, an asset path, a /auth/ script), when fixture markers are present, or when it is over SIZE_BUDGET; it prints
// the size raw, gzip and brotli, and writes <file>.sha256.
// The served build (hub:build) is separate and unchanged.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fixtureScanProblems, scanFixtureMarkers } from '../e2e-live/fixture-markers';
import { API_ROOT, HUB, parseArgs, runTool, str } from './lib';

const PUBLIC_AUTH = path.join(API_ROOT, 'public', 'auth');
const OUT_DIR = path.join(API_ROOT, 'dist', 'hub-single');
const STAGE = path.join(OUT_DIR, '.stage');
/** The file must stay usable as a package asset: about 9 MB today. */
export { SIZE_BUDGET, INLINE_SCRIPTS, rawTextProblem, inlineFonts, buildCsp, assemble, externalRefs, minifyPlainCss, keepStrict, type Assembled } from './build-single-assemble';
import { SIZE_BUDGET, INLINE_SCRIPTS, FONT_LICENSES, assemble, inlineFonts, keepStrict, minifyPlainCss } from './build-single-assemble';

/** The notices the file carries, as [name shown in the file, path]: the package's THIRD-PARTY-NOTICES.md (hub/ sits in
 *  the hoody-sdk package, so it is one level up), the Hub's LICENSE (Apache-2.0, also the text for its Apache-2.0
 *  libraries) and the license of each inlined font family (FONT_LICENSES). */
function noticeFiles(): Array<readonly [string, string]> {
  return [
    ['THIRD-PARTY-NOTICES.md', path.join(API_ROOT, '..', 'THIRD-PARTY-NOTICES.md')],
    ['LICENSE', path.join(API_ROOT, 'LICENSE')],
    ...FONT_LICENSES.map((n) => [`public/auth/fonts/LICENSES/${n}`, path.join(PUBLIC_AUTH, 'fonts', 'LICENSES', n)] as const),
  ];
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.api !== undefined) {
    console.error('hub:build-single: --api was removed: the file is built for its Hoody (shared.js STANDALONE_ORIGIN)');
    return 2;
  }
  const out = path.resolve(str(args.out) ?? path.join(OUT_DIR, 'hoody-hub.html'));
  const stage = process.env.HUB_SINGLE_STAGE ?? STAGE;

  // NODE_ENV production, always (the API's .env sets development; see build.ts).
  const code = await runTool('vite', ['build', '--config', path.join(HUB, 'vite.single.config.mts'), '--logLevel', 'warn'], {
    HUB_CACHE_DIR: process.env.HUB_CACHE_DIR ?? path.join(API_ROOT, 'node_modules', '.vite-hub-single'),
    HUB_SINGLE_STAGE: stage,
    NODE_ENV: 'production',
  });
  if (code !== 0) return code;

  const htmlPath = path.join(stage, 'src', 'standalone', 'hub.html');
  const assets = new Map<string, string>();
  for (const f of walk(path.join(stage, 'assets'))) assets.set(path.basename(f), fs.readFileSync(f, 'utf8'));
  // The auth scripts minified: parsed and printed by Bun's transpiler (a parser, so `//` in a string or a regex is safe).
  const minifier = new Bun.Transpiler({ loader: 'js', target: 'browser', minifyWhitespace: true });
  const minifyProblems: string[] = [];
  const scripts = INLINE_SCRIPTS.map((n) => {
    const src = fs.readFileSync(path.join(PUBLIC_AUTH, n), 'utf8');
    const kept = keepStrict(n, src, minifier.transformSync(src));
    if ('problem' in kept) minifyProblems.push(kept.problem);
    return [n, 'text' in kept ? kept.text : src] as const;
  });
  const fontsCss = inlineFonts(minifyPlainCss(fs.readFileSync(path.join(PUBLIC_AUTH, 'hub-fonts.css'), 'utf8')), (rel) => fs.readFileSync(path.join(PUBLIC_AUTH, rel)));
  const files = noticeFiles();
  // A missing file is read as empty, which assemble() refuses by name; its path is named here.
  const noticeProblems = files.filter(([, file]) => !fs.existsSync(file)).map(([, file]) => `notices: ${file} not found`);
  const notices = files.map(([name, file]) => [name, fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''] as const);
  const { html, problems } = assemble({
    stageHtml: fs.readFileSync(htmlPath, 'utf8'),
    assets,
    scripts,
    fontsCss,
    faviconSvg: fs.readFileSync(path.join(PUBLIC_AUTH, 'favicon.svg')),
    notices,
  });
  problems.push(...minifyProblems);
  problems.push(...noticeProblems);
  // The bundle's own files (the scan counts .js files) and the assembled page, which also holds the inline auth scripts.
  problems.push(...fixtureScanProblems(scanFixtureMarkers([...assets, [path.basename(out), html]])));
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > SIZE_BUDGET) problems.push(`${bytes} bytes, over the ${SIZE_BUDGET} budget`);
  if (problems.length > 0) {
    console.error(`hub:build-single: refused:\n  ${problems.join('\n  ')}`);
    return 1;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  const digest = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
  fs.writeFileSync(`${out}.sha256`, `${digest}  ${path.basename(out)}\n`);
  const gz = zlib.gzipSync(html, { level: 9 }).length;
  const br = zlib.brotliCompressSync(html, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  const mb = (n: number): string => `${(n / 1024 / 1024).toFixed(2)} MB`;
  console.log(`hub:build-single: ${path.relative(API_ROOT, out)}  ${mb(bytes)} raw, ${mb(gz)} gzip, ${mb(br)} brotli  sha256 ${digest.slice(0, 16)}…`);
  return 0;
}

if (import.meta.main) {
  main()
    .then((c) => process.exit(c))
    .catch((e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
