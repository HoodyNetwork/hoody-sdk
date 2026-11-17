// The detector's scan cache (scripts/lint/anatomy.cjs): with HUB_CACHE_DIR set, a whole-tree scan is kept
// under <HUB_CACHE_DIR>/anatomy-scan/<key>.json and served to every later scan of the very same inputs. Each case runs the
// detector in a child process (as a lint run or a test worker does). A served result is told apart from a computed one by a
// marker the test writes into the stored file: `marker: 'CACHED'` in the answer = served from the cache. So "the cache misses"
// is proved by a stored, marked result that a changed input does NOT return, and every miss must still find the planted hit.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ANATOMY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../scripts/lint/anatomy.cjs');
const ROOT = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'anatcache-'));
// Its own timeout: on a loaded host removing the scratch tree outlasts the 10 s hook default, a red with every test green.
afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }), 120_000);

const DRIVER = path.join(ROOT, 'driver.cjs');
fs.writeFileSync(
  DRIVER,
  `const [mod, src, exc, mode] = process.argv.slice(2);
const A = require(mod);
const files = A.readTree(src);
const registry = A.loadRegistry(undefined, exc);
const off = ['layout.heading'];
const ne = { registry };
Object.defineProperty(ne, 'disabled', { value: off, enumerable: false });
let reads = 0;
const opts = {
  '': { registry },
  fn: { registry, readSrc: () => null },
  disabled: { registry, disabled: off },
  inh: Object.assign(Object.create({ disabled: off }), { registry }),
  nonenum: ne,
  getter: { registry, get disabled() { return reads++ === 0 ? [] : off; } },
  rev: { registry },
  // no registry: the hash then spreads the copy, which drops what an assigned __proto__ made inherited
  proto: JSON.parse('{"__proto__":{"disabled":["layout.heading"]}}'),
  noreg: {},
}[mode];
const input = mode === 'rev' ? Object.fromEntries(Object.entries(files).reverse()) : files;
const c0 = process.cpuUsage();
const r = A.scan(input, opts);
const c = process.cpuUsage(c0);
const { marker = null, ...rest } = r;
const digest = require('node:crypto').createHash('sha256').update(JSON.stringify(rest)).digest('hex');
process.stdout.write(JSON.stringify({ heading: r.hits.filter((h) => h.rule === 'layout.heading').map((h) => h.file), hits: r.hits.length, digest, marker, cpuMs: (c.user + c.system) / 1000 }));
`,
);

interface Answer {
  heading: string[];
  hits: number;
  digest: string;
  marker: string | null;
  cpuMs: number;
}
let n = 0;
/** A fresh case: a tree of `count` pages (a planted raw <h1> in pages/p0), an exceptions file and a cache dir. */
function tree(count = 240, plant: number[] = [0]) {
  const dir = path.join(ROOT, `t${n++}`);
  const src = path.join(dir, 'src');
  for (let i = 0; i < count; i++) {
    fs.mkdirSync(path.join(src, 'pages', `p${i}`), { recursive: true });
    const body = plant.includes(i) ? '<h1>Title</h1>' : '<ul>{[1, 2].map((x) => <li key={x}>{x}</li>)}</ul>';
    fs.writeFileSync(path.join(src, 'pages', `p${i}`, 'view.tsx'), `export default function V${i}() {\n  return <main>${body}</main>;\n}\n`);
  }
  const exc = path.join(dir, 'exceptions.ts');
  fs.writeFileSync(exc, "export const EXCEPTIONS = [{ path: 'pages/p1/', rules: ['ui.pageLook'] }];\n");
  return { dir, src, exc, cache: path.join(dir, 'vc') };
}
type Tree = ReturnType<typeof tree>;
const env = (t: Tree, extra: Record<string, string | undefined> = {}) => {
  const e: Record<string, string | undefined> = { ...process.env, HUB_CACHE_DIR: t.cache, ...extra };
  for (const [k, v] of Object.entries(e)) if (v === undefined) delete e[k];
  return e as NodeJS.ProcessEnv;
};
function run(t: Tree, opts: { mod?: string; mode?: string; extra?: Record<string, string | undefined> } = {}): Answer {
  const r = spawnSync(process.execPath, [DRIVER, opts.mod ?? ANATOMY, t.src, t.exc, opts.mode ?? ''], { env: env(t, opts.extra), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`driver failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as Answer;
}
const stored = (t: Tree) => {
  const d = path.join(t.cache, 'anatomy-scan');
  return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => path.join(d, f)) : [];
};
/** Rewrites every stored result through `edit` (the result's JSON text), with a matching sha256 unless `keepSum`. */
function rewrite(t: Tree, edit: (json: string) => string, keepSum = false) {
  const files = stored(t);
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.json = edit(j.json);
    if (!keepSum) j.sum = crypto.createHash('sha256').update(j.json).digest('hex');
    fs.writeFileSync(f, JSON.stringify(j));
  }
}
/** Marks every stored result, so an answer served from the cache says so. */
const mark = (t: Tree) => rewrite(t, (json) => JSON.stringify({ ...JSON.parse(json), marker: 'CACHED' }));
/** A cold run, then the stored result marked: the next answer for the same inputs must be the marked one. */
function warm(t: Tree) {
  const a = run(t);
  expect(a.marker).toBeNull();
  expect(a.heading).toEqual(['pages/p0/view.tsx']);
  mark(t);
  return a;
}

describe('anatomy scan cache', () => {
  it('serves the same inputs from the cache, with the same answer', () => {
    const t = tree();
    const cold = warm(t);
    const hit = run(t);
    expect(hit.marker).toBe('CACHED');
    expect({ ...hit, marker: null, cpuMs: 0 }).toEqual({ ...cold, cpuMs: 0 }); // the digest covers the whole result
  }, 120_000);

  it('options are judged as the scan reads them: an inherited, non-enumerable, getter or own __proto__ option is uncached and never poisons a plain run', () => {
    for (const [mode, plain] of [['inh', ''], ['nonenum', ''], ['getter', ''], ['proto', 'noreg'], ['disabled', '']]) {
      const t = tree();
      const odd = run(t, { mode });
      expect(odd.marker, mode).toBeNull();
      expect(odd.heading, `${mode}: the same answer as with the cache off`).toEqual(run(t, { mode, extra: { HUB_CACHE_DIR: undefined } }).heading);
      const want = run(t, { mode: plain, extra: { HUB_CACHE_DIR: undefined } }).heading;
      expect(want, `${mode}: the plain run finds the planted hit`).toContain('pages/p0/view.tsx');
      expect(run(t, { mode: plain }), mode).toMatchObject({ marker: null, heading: want });
      if (mode !== 'disabled') expect(stored(t).length, `${mode}: only the plain run is stored`).toBe(1);
    }
  }, 240_000);

  it('the files\' own order is part of the key: the same files in another order miss and keep their own hit order', () => {
    const t = tree(240, [0, 7]);
    const a = run(t);
    expect(a.heading).toEqual(['pages/p0/view.tsx', 'pages/p7/view.tsx']);
    mark(t);
    const rev = run(t, { mode: 'rev' });
    expect(rev.marker).toBeNull();
    expect(rev.heading).toEqual(run(t, { mode: 'rev', extra: { HUB_CACHE_DIR: undefined } }).heading);
    expect(rev.heading).toEqual(['pages/p7/view.tsx', 'pages/p0/view.tsx']);
  }, 120_000);

  it('misses on a changed byte, a renamed, added or removed file, an exceptions change and a detector change; each miss finds the planted hit', () => {
    const cases: [string, (t: Tree) => string | void][] = [
      ['a changed byte', (t) => fs.appendFileSync(path.join(t.src, 'pages/p5/view.tsx'), ' ')],
      ['a renamed file', (t) => fs.renameSync(path.join(t.src, 'pages/p5/view.tsx'), path.join(t.src, 'pages/p5/view2.tsx'))],
      ['an added file', (t) => fs.writeFileSync(path.join(t.src, 'pages/p5/extra.ts'), 'export const x = 1;\n')],
      ['a removed file', (t) => fs.unlinkSync(path.join(t.src, 'pages/p5/view.tsx'))],
      ['an exceptions change', (t) => fs.writeFileSync(t.exc, "export const EXCEPTIONS = [{ path: 'pages/p2/', rules: ['ui.pageLook'] }];\n")],
      [
        'a detector change',
        (t) => {
          const lint = copyHub(t);
          const mod = path.join(lint, 'anatomy.cjs');
          fs.writeFileSync(mod, `${fs.readFileSync(ANATOMY, 'utf8')}\n// a comment changes the detector's bytes\n`);
          fs.copyFileSync(path.join(path.dirname(ANATOMY), 'anatomy-ui.cjs'), path.join(lint, 'anatomy-ui.cjs'));
          return mod;
        },
      ],
      [
        'an anatomy-ui.cjs change',
        (t) => {
          const lint = copyHub(t);
          fs.copyFileSync(ANATOMY, path.join(lint, 'anatomy.cjs'));
          fs.writeFileSync(path.join(lint, 'anatomy-ui.cjs'), `${fs.readFileSync(path.join(path.dirname(ANATOMY), 'anatomy-ui.cjs'), 'utf8')}\n// a comment\n`);
          return path.join(lint, 'anatomy.cjs');
        },
      ],
    ];
    for (const [what, change] of cases) {
      const t = tree();
      warm(t);
      const mod = change(t) || undefined;
      const a = run(t, { mod, extra: mod ? { HUB_TYPESCRIPT: require_ts() } : {} });
      expect(a.marker, what).toBeNull();
      expect(a.heading, what).toEqual(['pages/p0/view.tsx']);
    }
  }, 240_000);

  it('a detector copy outside a Hub tree (a pinned copy) never reads or writes the cache, same bytes or not', () => {
    const t = tree();
    warm(t);
    const before = stored(t);
    const pinned = path.join(t.dir, 'pinned');
    fs.mkdirSync(pinned);
    fs.copyFileSync(ANATOMY, path.join(pinned, 'anatomy.cjs'));
    fs.copyFileSync(path.join(path.dirname(ANATOMY), 'anatomy-ui.cjs'), path.join(pinned, 'anatomy-ui.cjs'));
    const a = run(t, { mod: path.join(pinned, 'anatomy.cjs'), extra: { HUB_TYPESCRIPT: require_ts() } });
    expect(a.marker).toBeNull();
    expect(a.heading).toEqual(['pages/p0/view.tsx']);
    expect(stored(t)).toEqual(before);
  }, 120_000);

  it('a planted violation in a cached tree is found on the next scan', () => {
    const t = tree();
    warm(t);
    fs.writeFileSync(path.join(t.src, 'pages/p7/view.tsx'), 'export default function V7() {\n  return <main><h2>Late</h2></main>;\n}\n');
    const a = run(t);
    expect(a.marker).toBeNull();
    expect(a.heading.sort()).toEqual(['pages/p0/view.tsx', 'pages/p7/view.tsx']);
  }, 120_000);

  it('stays off without HUB_CACHE_DIR, for fixture-sized trees and for a function option', () => {
    const off = tree();
    expect(run(off, { extra: { HUB_CACHE_DIR: undefined } }).heading).toEqual(['pages/p0/view.tsx']);
    expect(fs.existsSync(off.cache)).toBe(false);
    const small = tree(20);
    expect(run(small).heading).toEqual(['pages/p0/view.tsx']);
    expect(stored(small)).toEqual([]);
    const fn = tree();
    warm(fn);
    expect(run(fn, { mode: 'fn' }).marker).toBeNull();
  }, 120_000);

  it('fails open: a corrupt entry, an unwritable cache dir, a dead or old lock holder all compute normally', () => {
    const corrupt = tree();
    warm(corrupt);
    for (const f of stored(corrupt)) fs.writeFileSync(f, '{"v":1,"key":');
    expect(run(corrupt)).toMatchObject({ marker: null, heading: ['pages/p0/view.tsx'] });
    // valid JSON with a stale sum (a result emptied in place), and a matching sum over a result of the wrong shape
    for (const [what, edit, keepSum] of [
      ['stale sum', () => '{"hits":[],"counts":{},"overlays":[],"usedExceptions":[]}', true],
      ['wrong shape', () => '{}', false],
    ] as const) {
      const t = tree();
      warm(t);
      rewrite(t, edit, keepSum);
      expect(run(t), what).toMatchObject({ marker: null, heading: ['pages/p0/view.tsx'] });
    }

    const ro = tree();
    fs.mkdirSync(ro.cache);
    fs.chmodSync(ro.cache, 0o555);
    try {
      expect(run(ro)).toMatchObject({ marker: null, heading: ['pages/p0/view.tsx'] });
    } finally {
      fs.chmodSync(ro.cache, 0o755);
    }

    // a lock whose holder is dead (a finished child's PID), and one older than the wait: no waiting, a computed answer
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    for (const [what, pid, age] of [['dead holder', Number(dead.stdout), 0], ['old lock', process.pid, 400]] as const) {
      const t = tree();
      run(t); // learns the key's file name
      const [file] = stored(t);
      if (file === undefined) throw new Error(`${what}: the first run stored nothing`);
      fs.unlinkSync(file);
      const lock = file.replace(/\.json$/, '.lock');
      fs.writeFileSync(lock, `${pid} ${Date.now()}\n`);
      if (age) fs.utimesSync(lock, new Date(Date.now() - age * 1000), new Date(Date.now() - age * 1000));
      const t0 = Date.now();
      expect(run(t), what).toMatchObject({ marker: null, heading: ['pages/p0/view.tsx'] });
      expect(Date.now() - t0, what).toBeLessThan(60_000);
    }
  }, 240_000);

  it('three processes on a cold cache compute it once; the others wait for that result', async () => {
    const t = tree(900);
    const one = () =>
      new Promise<Answer>((resolve, reject) => {
        const c = spawn(process.execPath, [DRIVER, ANATOMY, t.src, t.exc, ''], { env: env(t) });
        let out = '';
        c.stdout.on('data', (d) => (out += d));
        c.on('error', reject);
        c.on('close', (code) => (code === 0 ? resolve(JSON.parse(out) as Answer) : reject(new Error(`exit ${code}`))));
      });
    const answers = await Promise.all([one(), one(), one()]);
    for (const a of answers) expect(a.heading).toEqual(['pages/p0/view.tsx']);
    const [most, second, third] = answers.map((a) => a.cpuMs).sort((a, b) => b - a);
    if (most === undefined || second === undefined || third === undefined) throw new Error('three answers expected');
    // one computes; the two that waited spent a small part of that (sleeping in Atomics.wait between polls)
    expect(second).toBeLessThan(most / 3);
    expect(third).toBeLessThan(most / 3);
    expect(fs.readdirSync(path.join(t.cache, 'anatomy-scan')).filter((f) => f.endsWith('.lock'))).toEqual([]);
  }, 240_000);
});

/** A Hub-shaped folder (hub/vite.config.mts, hub/scripts/lint/) for a detector copy that may use the cache; returns the lint folder. */
function copyHub(t: Tree): string {
  const lint = path.join(t.dir, 'hub', 'scripts', 'lint');
  fs.mkdirSync(lint, { recursive: true });
  fs.writeFileSync(path.join(t.dir, 'hub', 'vite.config.mts'), 'export default {};\n');
  return lint;
}

/** The typescript the detector itself loads, so a copied detector in another folder finds the same one. */
function require_ts(): string {
  const r = spawnSync(process.execPath, ['-e', `process.stdout.write(require.resolve('typescript', { paths: [${JSON.stringify(path.dirname(ANATOMY))}] }))`], { encoding: 'utf8' });
  return r.stdout;
}
