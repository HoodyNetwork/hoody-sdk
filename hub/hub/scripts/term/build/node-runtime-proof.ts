// node-runtime-proof.ts: the live proof of the npm package's Hub launcher (node-runtime.ts) under Node.
//   NODE_ENV=test bun scripts/term/build/node-runtime-proof.ts        exit 0 = proven, 1 = not (needs Node 26 on PATH)
// node-runtime.ts and hub-store.ts are bundled for Node into a scratch folder with the engine library of this machine
// beside a stand-in hub-term.js; `node` children (the gate's child environment) then show: the engine is handed the
// hashed descriptor and the caller's library switches are gone; one load per process; flock through node:ffi; no
// "experimental" warning on stderr; other bytes, a file that is no library, and a FIFO refused (the FIFO without
// blocking); a refused load leaves no descriptor of the library open; no node:ffi refused (load and the store lock);
// `hoody logout` revokes the kept key through the launcher, and without node:ffi sends nothing (busy).
// Not a *.term.test.ts: the test fence (test-net-guard.ts) refuses subprocesses inside tests. Runs as a gate child too
// (childEnv, runner fence): the only subprocesses are `node`; the FIFO is made in this process (libc mkfifo through
// bun:ffi), and every failure still removes the scratch folder and the extracted libraries.
import '../netns-first'; // the OS boundary before anything else (netns.term.test.ts 'every entry')
import { dlopen, ptr } from 'bun:ffi';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { childEnv } from '../child-env';
import { packageDir, nodeNatives } from '../build';
import { HOST_PLATFORM, type NativePlatform } from './platforms';
import { nodeLibraryFile } from './node-files';

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');
let failed = 0;
const check = (what: string, ok: boolean, seen: unknown): void => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${what}${ok ? '' : `: got ${JSON.stringify(seen)}`}\n`);
  if (!ok) failed++;
};

const version = spawnSync('node', ['--version'], { env: childEnv(), encoding: 'utf8' });
const major = Number(/^v(\d+)\./.exec(version.stdout ?? '')?.[1] ?? 0);
if (version.status !== 0 || major < 26) {
  process.stdout.write(`FAIL: this proof needs Node 26 or later as \`node\` on PATH (found: ${version.status === 0 ? version.stdout.trim() : 'none'})\n`);
  process.exit(1);
}

// A FIFO without a subprocess: the gate's runner fence admits only `bun` and `node` children.
const mkfifo = (file: string): void => {
  const libc = dlopen(process.platform === 'darwin' ? 'libSystem.B.dylib' : 'libc.so.6', { mkfifo: { args: ['ptr', 'u32'], returns: 'i32' } });
  try {
    if (libc.symbols.mkfifo(ptr(Buffer.from(`${file}\0`)), 0o600) !== 0 || !fs.lstatSync(file).isFIFO()) throw new Error('mkfifo did not make the FIFO');
  } finally {
    libc.close();
  }
};

// Resolved: the child compares /proc/self/fd links (resolved by the kernel) against it; a TMPDIR through a symbolic
// link would otherwise make the open-descriptor check count nothing and pass.
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-node-proof-')));
let natives: ReturnType<typeof nodeNatives> | null = null;
try {
  natives = nodeNatives(packageDir('@opentui/core', path.resolve(import.meta.dirname, '..', '..', '..')), [HOST_PLATFORM as NativePlatform]);
  const lib = nodeLibraryFile(HOST_PLATFORM);
  fs.copyFileSync(natives.libs[0]!.file, path.join(dir, lib));
  const manifest = { [HOST_PLATFORM]: { file: lib, sha256: sha(fs.readFileSync(path.join(dir, lib))) } };
  // A stand-in bundle: what the engine would read on import.
  fs.writeFileSync(path.join(dir, 'hub-term.js'), 'export const seen = { lib: process.env.OPENTUI_LIB_PATH ?? null, assets: process.env.OTUI_ASSET_ROOT ?? null };\n');
  fs.writeFileSync(path.join(dir, 'lockme'), '');
  fs.writeFileSync(path.join(dir, 'not-elf.so'), 'not a library');
  mkfifo(path.join(dir, 'fifo.so'));
  const entry = path.join(dir, 'child.ts');
  fs.writeFileSync(entry, [
    `import fs from 'node:fs';`,
    `import { nodeHub } from ${JSON.stringify(path.join(import.meta.dirname, 'node-runtime.ts'))};`,
    `import { hubStoreDir, openHubStore, systemTryLock } from ${JSON.stringify(path.join(import.meta.dirname, 'hub-store.ts'))};`,
    `import { BOOT_KEYS_KEY } from ${JSON.stringify(path.join(import.meta.dirname, '..', '..', '..', 'src', 'term', 'app', 'boot-keys.ts'))};`,
    `const [dir, manifestJson, home] = process.argv.slice(2);`,
    `process.env.OPENTUI_LIB_PATH = '/planted/lib.so';`,
    `process.env.OTUI_ASSET_ROOT = '/planted';`,
    `const hub = nodeHub(dir, JSON.parse(manifestJson), () => home);`,
    `const out = {};`,
    // \`hoody logout\` through the launcher, before anything is loaded: one kept key in a fresh store (seeded without
    // the lock call, which may be missing here), revoked through the store lock of this Node.
    `const api = 'https://api.example.invalid', uid = '64f0ada00000000000000001';`,
    `const seed = openHubStore(hubStoreDir(home, api, uid), { home, tryLock: () => true });`,
    `seed.set(BOOT_KEYS_KEY, JSON.stringify([{ id: 'tok1', alias: 'hoody-agent auto term aaaaaaaaa1', expires_at: new Date(Date.now() + 86_400_000).toISOString(), at: 1 }]));`,
    `seed.close();`,
    `const asked = [];`,
    `try { out.logout = await (await hub.launcher()).revokeBootKeysAtLogout({ apiOrigin: api, uid, revoke: async (id) => { asked.push(id); return 'gone'; } }); } catch (e) { out.logout = 'threw ' + String(e.message).split(':')[0]; }`,
    `out.asked = asked;`,
    `try { const m = await hub.load(); out.seen = m.seen; out.again = (await hub.load()) === m; } catch (e) { out.refused = String(e.message).split(':')[0]; }`,
    // Descriptors still naming a file of the scratch folder after the load (a refused load must leave none).
    `out.open = fs.readdirSync('/proc/self/fd').filter((n) => { try { return fs.readlinkSync('/proc/self/fd/' + n).startsWith(dir + '/'); } catch { return false; } }).length;`,
    `out.libPath = process.env.OPENTUI_LIB_PATH ?? null;`,
    `try { const tryLock = await systemTryLock(); const a = fs.openSync(dir + '/lockme', 'r'); const b = fs.openSync(dir + '/lockme', 'r'); out.lock = [tryLock(a), tryLock(a), tryLock(b)]; } catch (e) { out.lock = String(e.message).split(':')[0]; }`,
    `process.stdout.write(JSON.stringify(out));`,
  ].join('\n'));
  const built = await Bun.build({ entrypoints: [entry], outdir: dir, target: 'node', format: 'esm', naming: 'child.mjs' });
  if (!built.success) throw new Error(`the Node child did not build: ${built.logs.map(String).join(' | ')}`);
  let homes = 0;
  const run = (m: unknown, flags: string[] = []): { out: Record<string, unknown>; stderr: string } => {
    const home = path.join(dir, `home-${++homes}`);
    fs.mkdirSync(home, { mode: 0o700 });
    const r = spawnSync('node', [...flags, path.join(dir, 'child.mjs'), dir, JSON.stringify(m), home], { env: childEnv(), encoding: 'utf8', timeout: 60_000 });
    let out: Record<string, unknown> = {};
    try { out = JSON.parse(r.stdout) as Record<string, unknown>; } catch { out = { exit: r.status, signal: r.signal, stdout: (r.stdout ?? '').slice(0, 200) }; }
    return { out, stderr: r.stderr ?? '' };
  };

  // Pinned: the engine is handed the hashed descriptor, the planted switches are gone; one load per process.
  const good = run(manifest);
  const seen = good.out.seen as { lib?: string; assets?: string | null } | undefined;
  check('the engine is handed /proc/self/fd/<n>', /^\/proc\/self\/fd\/\d+$/.test(seen?.lib ?? ''), good.out);
  check('the caller\'s OTUI_ASSET_ROOT is gone', seen?.assets === null, seen);
  check('one load per process', good.out.again === true, good.out.again);
  // flock through node:ffi: the same descriptor again is granted, another open of the file is refused.
  check('the store lock: same descriptor twice granted, another refused', JSON.stringify(good.out.lock) === '[true,true,false]', good.out.lock);
  // `hoody logout` from the npm package: the launcher revokes the kept key under this Node's store lock.
  check('hoody logout: the kept key revoked (done)', JSON.stringify(good.out.logout) === '{"state":"done","revoked":1,"left":0,"open":0}' && JSON.stringify(good.out.asked) === '["tok1"]', { logout: good.out.logout, asked: good.out.asked });
  // Node's one-time warning for node:ffi is not printed above the Hub.
  check('no ExperimentalWarning on stderr', !good.stderr.includes('ExperimentalWarning'), good.stderr.slice(0, 200));
  // Refusals before the bundle is imported; none leaves a descriptor of the library or its path behind.
  for (const [what, m] of [
    ['other bytes than the pinned ones', { [HOST_PLATFORM]: { file: lib, sha256: sha('not this') } }],
    ['a pinned file that is no library (the probe)', { [HOST_PLATFORM]: { file: 'not-elf.so', sha256: sha('not a library') } }],
    ['a FIFO at the library path (no block)', { [HOST_PLATFORM]: { file: 'fifo.so', sha256: sha('') } }],
  ] as const) {
    const r = run(m);
    check(`${what}: TERM_HUB_NODE_LIBRARY`, r.out.refused === 'TERM_HUB_NODE_LIBRARY', r.out);
    check(`${what}: no descriptor of it left open, and OPENTUI_LIB_PATH names none`, r.out.open === 0 && !String(r.out.libPath).startsWith('/proc/self/fd/'), { open: r.out.open, libPath: r.out.libPath });
  }
  // No node:ffi in this Node: refused, and the store lock says so too.
  const off = run(manifest, ['--no-experimental-ffi']);
  check('no node:ffi: load refused TERM_HUB_NODE_FFI', off.out.refused === 'TERM_HUB_NODE_FFI', off.out);
  check('no node:ffi: the store lock refused TERM_HUB_NODE_FFI', off.out.lock === 'TERM_HUB_NODE_FFI', off.out.lock);
  // ... and `hoody logout` cannot take the lock: busy, nothing sent, the key still listed.
  check('no node:ffi: hoody logout busy, nothing sent', JSON.stringify(off.out.logout) === '{"state":"busy","revoked":0,"left":1,"open":0}' && JSON.stringify(off.out.asked) === '[]', { logout: off.out.logout, asked: off.out.asked });
} catch (e) {
  // Counted, then the folder goes (a process.exit here would skip the finally and leave it).
  const why = e instanceof AggregateError ? [e.message, ...e.errors.map(String)].join(' | ') : e instanceof Error ? e.message : String(e);
  process.stdout.write(`FAIL: ${why.slice(0, 600)}\n`);
  failed++;
} finally {
  try { natives?.drop(); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
process.stdout.write(failed ? `${failed} failed\n` : 'proven\n');
process.exit(failed ? 1 : 0);
