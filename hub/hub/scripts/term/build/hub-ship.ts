#!/usr/bin/env bun
// Builds the terminal Hub as ONE executable (the `hoody hub` binary) and proves it.
//
//   bun scripts/term/build/hub-ship.ts --out <dir> [--bundle <ship build dir>] [--target linux-arm64] [--prove] [--json report.json]
//
// --bundle: a finished ship build (bun scripts/term/build.ts --minify --out <dir>); absent = built here, minified.
// The executable's entry is the launcher (build/hub-cache.ts), then build/hub-main.ts on the bundle. Until the live
// client exists, the client compiled in here is a fake EMPTY account
// (build/demo-client.ts): this executable is a DEMO build, named so, and never talks to an API. `--measure` (demo entry
// only) mounts on an in-memory terminal and prints one MEASURE line.
// --target: the platform the BUNDLE was built for (its native library is in --bundle; required with --bundle then);
// the executable is cross-compiled and cannot be proved here.
// --prove (run it inside scripts/term/netns.sh): the executable copied alone into an empty directory, cold start,
// the private cache (0700, one library, this build's bytes), a planted same-size library not loaded, an older
// release's copy pruned, a user's BUN_TMPDIR not written to, an unsafe cache refused, no home, no terminal.
import '../netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HOST_PLATFORM as HOST, bunTarget, otherPlatforms, parseTarget, type NativePlatform } from './platforms';
import { COMPILE_NO_AUTOLOAD } from './measure-run';

const HERE = import.meta.dirname;
const arg = (n: string): string | undefined => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : undefined; };
const flag = (n: string): boolean => process.argv.includes('--' + n);
const sha256 = (f: string): string => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
export const exeName = (target: string = HOST): string => `hoody-hub-${target}`;

export const demoEntry = (): string => [
  `import { runInHubCache, extractDirOf } from ${JSON.stringify(path.join(HERE, 'hub-cache.ts'))};`,
  `await runInHubCache(async () => {`,
  `  const argv = process.argv.slice(2);`,
  `  if (argv.includes('--measure')) {`,
  `    const dir = extractDirOf(process.env);`,
  `    const hub = await import('./hub-term.js');`,
  `    const { measureMount } = await import(${JSON.stringify(path.join(HERE, 'measure.ts'))});`,
  `    const r = await measureMount(hub as never, 0);`,
  `    const fs = await import('node:fs');`,
  `    const cpu = process.cpuUsage();`,
  `    process.stdout.write('MEASURE ' + JSON.stringify({ ...r, firstFrameEpochMs: r.firstFrameMs === null ? null : Math.round(performance.timeOrigin + (r.firstFrameMs as number)), cpuMs: Math.round((cpu.user + cpu.system) / 1000), extractDir: dir, extracted: dir ? fs.readdirSync(dir) : [] }) + '\\n');`,
  `    return 0;`,
  `  }`,
  `  const { hubMain } = await import(${JSON.stringify(path.join(HERE, 'hub-main.ts'))});`,
  // The client comes from demo-client.ts, never from measure.ts: that module refuses to load outside the test
  // boundary, and this branch is the one a person's terminal runs.
  // The sample account on the demo mount (demo: true), as `hoody hub --demo` does it: a demo client is taken only by
  // the demo mount, and the live mount refuses one.
  `  const { demoClient, DEMO_CONTEXT } = await import(${JSON.stringify(path.join(HERE, 'demo-client.ts'))});`,
  `  return hubMain({ load: () => import('./hub-term.js') as never, client: () => demoClient(), context: { ...DEMO_CONTEXT }, demo: true });`,
  `});`,
  '',
].join('\n');

/** bun build --compile of the demo entry over a finished ship build directory. */
export function compileHub(bundleDir: string, outfile: string, tmp: string, target: string = HOST): { ok: boolean; ms: number; error?: string } {
  const entry = path.join(bundleDir, 'hoody-hub-entry.ts');
  fs.writeFileSync(entry, demoEntry());
  const assets = fs.readdirSync(bundleDir).filter((f) => /\.(so|dylib|dll|json)$/.test(f));
  const t0 = performance.now();
  const b = Bun.spawnSync({
    cmd: [process.execPath, 'build', '--compile', ...COMPILE_NO_AUTOLOAD, ...assets.flatMap((a) => ['--asset', a]), ...otherPlatforms(target).flatMap((p) => ['--external', p]), ...(target === HOST ? [] : [`--target=${bunTarget(target as NativePlatform)}`]), entry, '--outfile', outfile],
    cwd: bundleDir, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: tmp }, stdout: 'pipe', stderr: 'pipe', timeout: 300_000,
  });
  return { ok: b.exitCode === 0, ms: Math.round(performance.now() - t0), ...(b.exitCode === 0 ? {} : { error: b.stderr.toString().slice(-1500) }) };
}

interface Run { code: number | null; measure: Record<string, unknown> | null; stderr: string; wallMs: number; spawnEpochMs: number }
function run(exe: string, argv: string[], env: Record<string, string>, cwd: string): Run {
  const spawnEpochMs = Date.now();
  const t0 = performance.now();
  const p = Bun.spawnSync({ cmd: [exe, ...argv], cwd, env, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', timeout: 90_000 });
  const line = p.stdout.toString().split('\n').find((l) => l.startsWith('MEASURE '));
  return { code: p.exitCode, measure: line ? JSON.parse(line.slice(8)) as Record<string, unknown> : null, stderr: p.stderr.toString().slice(-400), wallMs: Math.round(performance.now() - t0), spawnEpochMs };
}

/** Every claim of the launcher contract, on the executable itself. */
export function prove(exe: string, libSha: string, work: string): { ok: boolean; checks: { name: string; ok: boolean; detail: unknown }[]; runs: unknown[] } {
  fs.rmSync(work, { recursive: true, force: true });
  const alone = path.join(work, 'alone');
  const home = path.join(work, 'home');
  const outerTmp = path.join(work, 'outer-tmp');
  const userBunTmp = path.join(work, 'user-bun-tmp');
  for (const d of [alone, home, outerTmp, userBunTmp]) fs.mkdirSync(d, { recursive: true });
  const bin = path.join(alone, path.basename(exe));
  fs.copyFileSync(exe, bin);
  fs.chmodSync(bin, 0o755);
  const cache = path.join(home, '.cache', 'hoody', 'hub');
  const env = { PATH: '/usr/bin:/bin', HOME: home, TMPDIR: outerTmp };
  const checks: { name: string; ok: boolean; detail: unknown }[] = [];
  const check = (name: string, ok: boolean, detail: unknown): void => { checks.push({ name, ok, detail }); };
  const libs = (): string[] => fs.existsSync(cache) ? fs.readdirSync(cache).filter((f) => f.startsWith('.bun-')) : [];
  const drew = (r: Run): boolean => r.code === 0 && typeof r.measure?.firstFrameMs === 'number' && r.measure.error === null;
  const runs: unknown[] = [];

  // 1. Alone in an empty directory, cold; then two warm starts.
  const cold = run(bin, ['--measure'], env, alone);
  runs.push({ kind: 'cold (extracts the library, re-executes once)', wallMs: cold.wallMs, toFirstFrameMs: cold.measure ? (cold.measure.firstFrameEpochMs as number) - cold.spawnEpochMs : null, ...cold.measure });
  check('alone in an empty directory: draws a frame', drew(cold) && fs.readdirSync(alone).length === 1, { code: cold.code, stderr: cold.stderr, dir: fs.readdirSync(alone) });
  const name = libs()[0] ?? '';
  check('cache: 0700, exactly this build\'s library', libs().length === 1 && (fs.statSync(cache).mode & 0o777) === 0o700 && sha256(path.join(cache, name)) === libSha, { cache, mode: fs.existsSync(cache) ? (fs.statSync(cache).mode & 0o777).toString(8) : null, libs: libs() });
  check('nothing written to the caller\'s TMPDIR', fs.readdirSync(outerTmp).length === 0, fs.readdirSync(outerTmp));
  for (let i = 0; i < 2; i++) {
    const warm = run(bin, ['--measure'], env, alone);
    runs.push({ kind: 'warm', wallMs: warm.wallMs, toFirstFrameMs: warm.measure ? (warm.measure.firstFrameEpochMs as number) - warm.spawnEpochMs : null, ...warm.measure });
  }

  // 2. A planted library under the expected name, padded to the expected SIZE (what Bun loads unread).
  const file = path.join(cache, name);
  const size = fs.statSync(file).size;
  const mark = path.join(work, 'planted-library-ran');
  let planted: Buffer | null = null;
  const cc = ['/usr/bin/cc', '/usr/bin/gcc'].find((c) => fs.existsSync(c));
  if (cc) {
    const src = path.join(work, 'planted.c');
    fs.writeFileSync(src, '#include <stdio.h>\n#include <stdlib.h>\n__attribute__((constructor)) static void init(void){ const char*m=getenv("HUB_PLANTED_MARK"); if(m){FILE*f=fopen(m,"w"); if(f){fputs("x",f);fclose(f);} } }\n');
    const so = path.join(work, 'planted.so');
    if (Bun.spawnSync({ cmd: [cc, '-shared', '-fPIC', '-o', so, src], env: { PATH: '/usr/bin:/bin', TMPDIR: outerTmp } }).exitCode === 0) planted = Buffer.concat([fs.readFileSync(so), Buffer.alloc(size)]).subarray(0, size);
    for (const f of fs.readdirSync(outerTmp)) fs.rmSync(path.join(outerTmp, f), { recursive: true, force: true });
  }
  if (!planted) { planted = Buffer.from(fs.readFileSync(file)); planted[4096] = planted[4096]! ^ 0xff; }
  fs.writeFileSync(file, planted, { mode: 0o600 });
  const tampered = run(bin, ['--measure'], { ...env, HUB_PLANTED_MARK: mark }, alone);
  check('a planted same-size library is not loaded: removed, the real one written again', drew(tampered) && !fs.existsSync(mark) && libs().length === 1 && sha256(path.join(cache, libs()[0]!)) === libSha, { code: tampered.code, stderr: tampered.stderr, plantedRan: fs.existsSync(mark), plantedIsRealLibrary: cc !== undefined, libs: libs() });

  // 2b. The engine's own "load this library instead" switches do not reach it.
  if (cc) {
    const mark2 = path.join(work, 'override-library-ran');
    const viaEnv = run(bin, ['--measure'], { ...env, OPENTUI_LIB_PATH: path.join(work, 'planted.so'), OTUI_ASSET_ROOT: work, HUB_PLANTED_MARK: mark2 }, alone);
    check('OPENTUI_LIB_PATH / OTUI_ASSET_ROOT do not redirect the library', drew(viaEnv) && !fs.existsSync(mark2), { code: viaEnv.code, stderr: viaEnv.stderr, plantedRan: fs.existsSync(mark2) });
  }

  // 3. An older release's copy is pruned.
  fs.writeFileSync(path.join(cache, `.bun-${process.getuid?.() ?? 0}-0000000000000000.so`), Buffer.alloc(1024, 3), { mode: 0o600 });
  const pruned = run(bin, ['--measure'], env, alone);
  check('an older release\'s extracted copy is pruned', drew(pruned) && libs().length === 1 && libs()[0] === name, libs());

  // 4. The user's own BUN_TMPDIR (which Bun reads before TMPDIR) gets nothing.
  const withBun = run(bin, ['--measure'], { ...env, BUN_TMPDIR: userBunTmp }, alone);
  check('a user\'s BUN_TMPDIR is not written to', drew(withBun) && fs.readdirSync(userBunTmp).length === 0 && withBun.measure?.extractDir === cache, { userBunTmp: fs.readdirSync(userBunTmp), extractDir: withBun.measure?.extractDir });

  // 5. A cache path that is a link stops the start before the engine loads.
  const home2 = path.join(work, 'home-link');
  const elsewhere = path.join(work, 'elsewhere');
  fs.mkdirSync(path.join(home2, '.cache', 'hoody'), { recursive: true });
  fs.mkdirSync(elsewhere);
  fs.symlinkSync(elsewhere, path.join(home2, '.cache', 'hoody', 'hub'));
  const unsafe = run(bin, ['--measure'], { ...env, HOME: home2 }, alone);
  check('a cache path that is a link: exit 70, fixed code, nothing extracted', unsafe.code === 70 && /TERM_HUB_CACHE_UNSAFE/.test(unsafe.stderr) && fs.readdirSync(elsewhere).length === 0 && unsafe.measure === null, { code: unsafe.code, stderr: unsafe.stderr, elsewhere: fs.readdirSync(elsewhere) });

  // 6. No home: a fresh private directory under TMPDIR, removed at exit.
  const noHome = run(bin, ['--measure'], { PATH: '/usr/bin:/bin', TMPDIR: outerTmp, BUN_TMPDIR: userBunTmp }, alone);
  check('no home directory: private temp directory, removed at exit; BUN_TMPDIR still not written to', drew(noHome) && fs.readdirSync(outerTmp).length === 0 && fs.readdirSync(userBunTmp).length === 0, { code: noHome.code, stderr: noHome.stderr, left: fs.readdirSync(outerTmp), userBunTmp: fs.readdirSync(userBunTmp) });

  // 7. No terminal: refused with a fixed line.
  const noTty = run(bin, [], env, alone);
  check('no terminal: exit 2, TERM_HUB_NO_TTY', noTty.code === 2 && /TERM_HUB_NO_TTY/.test(noTty.stderr), { code: noTty.code, stderr: noTty.stderr });

  check('the working directory is still only the executable', fs.readdirSync(alone).length === 1, fs.readdirSync(alone));
  return { ok: checks.every((c) => c.ok), checks, runs };
}

if (import.meta.main) {
  const out = path.resolve(arg('out') ?? '');
  const parsed = flag('target') ? parseTarget(arg('target')) : null;
  if (parsed && 'error' in parsed) { process.stderr.write(`hub-ship: ${parsed.error}\n`); process.exit(1); }
  const target: string = parsed?.target ?? HOST;
  if (!arg('out') || (target !== HOST && (!arg('bundle') || flag('prove')))) { process.stderr.write('usage: hub-ship.ts --out <dir> [--bundle <ship build dir>] [--prove] [--json file]\n       hub-ship.ts --out <dir> --bundle <ship build dir for the target> --target <platform>   (no --prove: it cannot run here)\n'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const bundleDir = arg('bundle') ? path.resolve(arg('bundle')!) : path.join(out, 'bundle');
  if (!arg('bundle')) {
    const { shipBuild } = await import('../build');
    const b = await shipBuild({ outdir: bundleDir, minify: true });
    if (!b.ok) { process.stderr.write(`hub-ship: the ship build failed (${b.refusals.length} refusals, ${b.artifact?.findings.length ?? 0} findings): run bun scripts/term/build.ts\n`); process.exit(1); }
  }
  const lib = fs.readdirSync(bundleDir).find((f) => /\.(so|dylib|dll)$/.test(f));
  if (!fs.existsSync(path.join(bundleDir, 'hub-term.js')) || !lib) { process.stderr.write('hub-ship: no ship build in ' + bundleDir + '\n'); process.exit(1); }
  const tmp = path.join(out, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const exe = path.join(out, exeName(target));
  const c = compileHub(bundleDir, exe, tmp, target);
  if (!c.ok) { process.stderr.write(`hub-ship: compile failed: ${c.error}\n`); process.exit(1); }
  const bytes = fs.statSync(exe).size;
  const raw = fs.readFileSync(exe);
  const report: Record<string, unknown> = {
    executable: exe, demo: true, platform: target, bun: Bun.version, compileMs: c.ms,
    bytes, sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    gzip9Bytes: Bun.gzipSync(raw, { level: 9 }).length,
    zstd19Bytes: Bun.zstdCompressSync(raw, { level: 19 }).length,
    parts: { bundleJs: fs.statSync(path.join(bundleDir, 'hub-term.js')).size, library: fs.statSync(path.join(bundleDir, lib)).size, librarySha256: sha256(path.join(bundleDir, lib)), other: fs.readdirSync(bundleDir).filter((f) => f.endsWith('.json')).map((f) => [f, fs.statSync(path.join(bundleDir, f)).size]) },
  };
  let ok = true;
  if (flag('prove')) {
    const p = prove(exe, sha256(path.join(bundleDir, lib)), path.join(out, 'prove'));
    report.prove = p;
    ok = p.ok;
    for (const k of p.checks) process.stdout.write(`${k.ok ? 'ok  ' : 'FAIL'} ${k.name}${k.ok ? '' : ' ' + JSON.stringify(k.detail)}\n`);
  }
  const json = arg('json');
  if (json) fs.writeFileSync(json, JSON.stringify(report, null, 1) + '\n');
  process.stdout.write(`hub-ship: ${exe} ${bytes} B (gzip -9 ${report.gzip9Bytes} B, zstd -19 ${report.zstd19Bytes} B)${flag('prove') ? (ok ? ', proved' : ', PROOF FAILED') : ''}\n`);
  process.exit(ok ? 0 : 1);
}
