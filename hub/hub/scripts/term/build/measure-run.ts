// Runs the ship artifact's measurement (measure.ts) in a fresh process, and the --compile proof.
import fs from 'node:fs';
import path from 'node:path';
import { OTHER_PLATFORMS } from './platforms';

const HERE = import.meta.dirname;
/** A compiled terminal Hub never loads configuration from the directory it is started in. */
export const COMPILE_NO_AUTOLOAD = ['--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--no-compile-autoload-tsconfig', '--no-compile-autoload-package-json'];
/** A scratch dir for the compiled binary's extracted native library (Bun writes it to $TMPDIR and keeps it). */
const scratch = (outdir: string): string => { const d = path.join(outdir, 'tmp'); fs.mkdirSync(d, { recursive: true }); return d; };

/** An empty working directory away from the bundle: nothing may be found relative to the working directory. */
const elsewhere = (outdir: string): string => { const d = path.join(outdir, 'cwd-elsewhere'); fs.mkdirSync(d, { recursive: true }); return d; };

function parse(out: string): Record<string, unknown> | null {
  const line = out.split('\n').find((l) => l.startsWith('MEASURE '));
  return line ? JSON.parse(line.slice(8)) as Record<string, unknown> : null;
}

/** Cold start of the built module in a new process, started from another, empty directory (no .env there, and a file
 *  found only relative to the working directory fails). Three runs, all kept. */
export async function measureShip(bundle: string, runs = 3): Promise<{ runs: (Record<string, unknown> | { error: string })[] }> {
  const out: (Record<string, unknown> | { error: string })[] = [];
  for (let i = 0; i < runs; i++) {
    const p = Bun.spawnSync({ cmd: [process.execPath, path.join(HERE, 'measure.ts'), bundle], cwd: elsewhere(path.dirname(bundle)), env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: scratch(path.dirname(bundle)) }, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
    out.push(parse(p.stdout.toString()) ?? { error: `exit ${p.exitCode}: ${p.stderr.toString().slice(-600)}` });
  }
  return { runs: out };
}

/** bun build --compile of the measurement harness with the bundle inside: one executable; run it once. */
export async function compileShip(outdir: string): Promise<Record<string, unknown>> {
  const entry = path.join(outdir, 'compile-entry.ts');
  // The launcher (launcher.ts) runs the measurement in a child with a private TMPDIR and removes it; the engine (and
  // its embedded native library) loads only in the child, through the dynamic imports.
  fs.writeFileSync(entry, [
    `import { runInPrivateTmp } from ${JSON.stringify(path.join(HERE, 'launcher.ts'))};`,
    `await runInPrivateTmp(async () => {`,
    `  const hub = await import('./hub-term.js');`,
    `  const { measureMount } = await import(${JSON.stringify(path.join(HERE, 'measure.ts'))});`,
    `  const r = await measureMount(hub as never, 0);`,
    `  process.stdout.write('MEASURE ' + JSON.stringify({ ...r, tmpdir: process.env.TMPDIR, nativeInTmp: (await import('node:fs')).readdirSync(process.env.TMPDIR!).length }) + '\\n');`,
    `  return 0;`,
    `});`,
    '',
  ].join('\n'));
  const bin = path.join(outdir, 'hub-term-measure');
  const t0 = performance.now();
  // Every asset beside the bundle (native library, packed style tables) is embedded under its own name, reachable from
  // import.meta.dir as in the plain bundle; the executable reads no .env, bunfig, tsconfig or package.json at start.
  const assets = fs.readdirSync(outdir).filter((f) => /\.(so|dylib|dll|json)$/.test(f));
  const b = Bun.spawnSync({ cmd: [process.execPath, 'build', '--compile', ...COMPILE_NO_AUTOLOAD, ...assets.flatMap((a) => ['--asset', a]), ...OTHER_PLATFORMS.flatMap((p) => ['--external', p]), entry, '--outfile', bin], cwd: outdir, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: scratch(outdir) }, stdout: 'pipe', stderr: 'pipe', timeout: 300_000 });
  const buildMs = Math.round(performance.now() - t0);
  if (b.exitCode !== 0) return { ok: false, buildMs, error: b.stderr.toString().slice(-1500) };
  // The outer TMPDIR starts empty and must be empty again after the run (the launcher removed its private dir).
  const outer = path.join(outdir, 'tmp-launch');
  fs.rmSync(outer, { recursive: true, force: true });
  fs.mkdirSync(outer, { recursive: true });
  const run = Bun.spawnSync({ cmd: [bin], cwd: elsewhere(outdir), env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', TMPDIR: outer }, stdout: 'pipe', stderr: 'pipe', timeout: 60_000 });
  const left = fs.readdirSync(outer);
  const r = parse(run.stdout.toString());
  return { ok: run.exitCode === 0 && left.length === 0 && r !== null, buildMs, bytes: fs.statSync(bin).size, binary: bin, leftInTmp: left, run: r ?? run.stderr.toString().slice(-800) };
}
