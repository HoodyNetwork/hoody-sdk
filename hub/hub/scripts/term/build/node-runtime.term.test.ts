// The Node build's launcher (node-runtime.ts), the npm package's `hoody hub`: which libraries a Node build carries, the
// library pinned by its bytes and opened as /proc/self/fd/<n>, and the launcher's `hoody logout` answer (the Hub's kept
// boot keys revoked, build/hub-store-logout.ts). What needs Node itself (node:ffi, the descriptor
// handed to the engine, the caller's library switches gone, the refusals of `load`, the store lock) runs in a `node`
// child, and the test fence (test-net-guard.ts) refuses subprocesses inside tests: that proof is
// scripts/term/build/node-runtime-proof.ts (`NODE_ENV=test bun scripts/term/build/node-runtime-proof.ts`, exit 0 =
// proven; needs Node 26 on PATH).
import { expect, test } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { packageDir, nodeNatives } from '../build';
import { NativePackageError, type NativePlatform } from './platforms';
import { HubNodeError, hubCompileCacheDir, nodeHub, openPinnedLibrary } from './node-runtime';
import { hubStoreDir, openHubStore, systemTryLock } from './hub-store';
import { BOOT_KEYS_KEY, type BootKey } from '../../../src/term/app/boot-keys';

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');
const fdOf = (p: string): number => Number(/^\/proc\/self\/fd\/(\d+)$/.exec(p)![1]);

test('nodeNatives: one library per Linux platform asked for (installed, else from the vendored tarball); others and none refused', () => {
  const core = packageDir('@opentui/core', path.resolve(import.meta.dirname, '..', '..', '..'));
  const refused = (p: readonly NativePlatform[]): string => { try { nodeNatives(core, p).drop(); return 'built'; } catch (e) { return e instanceof NativePackageError ? e.message : String(e); } };
  expect(refused([])).toContain('needs at least one platform');
  expect(refused(['win32-x64'])).toContain('not win32-x64');
  expect(refused(['linux-x64-musl'])).toContain('not linux-x64-musl');
  const n = nodeNatives(core, ['linux-x64', 'linux-arm64', 'linux-x64']);
  try {
    expect(n.libs.map((l) => l.platform)).toEqual(['linux-x64', 'linux-arm64']);
    for (const l of n.libs) expect(fs.statSync(l.file).size > 1_000_000 && l.file.endsWith('.so')).toBe(true);
    expect(n.libs[0]!.file === n.libs[1]!.file).toBe(false);
    expect(/^\d+\.\d+\.\d+/.test(n.version)).toBe(true);
  } finally {
    n.drop();
  }
  // An extraction of the vendored tarball is gone after drop; an installed package is never touched.
  for (const l of n.libs) expect(fs.existsSync(l.file)).toBe(l.file.includes(`${path.sep}node_modules${path.sep}`));
});

test('openPinnedLibrary: the pinned bytes open as /proc/self/fd/<n>; other bytes, a link, a folder, a device, a missing file or platform refuse', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-node-pin-'));
  try {
    fs.writeFileSync(path.join(dir, 'lib.so'), 'the library');
    fs.symlinkSync(path.join(dir, 'lib.so'), path.join(dir, 'link.so'));
    const good = { 'linux-x64': { file: 'lib.so', sha256: sha('the library') } };
    const p = openPinnedLibrary(dir, good, 'linux-x64');
    expect(fs.readlinkSync(p)).toBe(path.join(fs.realpathSync(dir), 'lib.so')); // the kernel names the resolved path
    expect(fs.readFileSync(p, 'utf8')).toBe('the library');
    fs.closeSync(fdOf(p));
    const code = (f: () => unknown): string | null => { try { f(); return null; } catch (e) { return e instanceof HubNodeError ? e.code : String(e); } };
    expect(code(() => openPinnedLibrary(dir, { 'linux-x64': { file: 'lib.so', sha256: sha('another library') } }, 'linux-x64'))).toBe('TERM_HUB_NODE_LIBRARY');
    expect(code(() => openPinnedLibrary(dir, { 'linux-x64': { file: 'link.so', sha256: sha('the library') } }, 'linux-x64'))).toBe('TERM_HUB_NODE_LIBRARY');
    expect(code(() => openPinnedLibrary(dir, { 'linux-x64': { file: 'gone.so', sha256: sha('the library') } }, 'linux-x64'))).toBe('TERM_HUB_NODE_LIBRARY');
    // Not a regular file: refused, the descriptor closed (a FIFO, which must not block the open: the proof script).
    fs.mkdirSync(path.join(dir, 'folder.so'));
    const before = fs.readdirSync('/proc/self/fd').length;
    expect(code(() => openPinnedLibrary(dir, { 'linux-x64': { file: 'folder.so', sha256: sha('the library') } }, 'linux-x64'))).toBe('TERM_HUB_NODE_LIBRARY');
    expect(code(() => openPinnedLibrary('/dev', { 'linux-x64': { file: 'null', sha256: sha('') } }, 'linux-x64'))).toBe('TERM_HUB_NODE_LIBRARY');
    expect(fs.readdirSync('/proc/self/fd').length).toBe(before);
    expect(code(() => openPinnedLibrary(dir, good, 'linux-arm64'))).toBe('TERM_HUB_NODE_PLATFORM');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the launcher answers `hoody logout` (revokeBootKeysAtLogout), as the release binary\'s entry: the kept keys revoked; no store, nothing made', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-node-home-'));
  fs.chmodSync(home, 0o700);
  try {
    const api = 'https://api.example.invalid';
    const uid = '64f0ada00000000000000001';
    const at = Date.now(); // the launcher reads the real clock: a fixed date would expire these keys one day
    const kept: BootKey[] = [1, 2].map((i) => ({ id: `tok${i}`, alias: `hoody-agent auto term ${String(i).padStart(10, 'a')}`, expires_at: new Date(at + 60 * 86_400_000).toISOString(), at: at + i }));
    const tryLock = await systemTryLock();
    const seed = openHubStore(hubStoreDir(home, api, uid)!, { home, tryLock, now: () => at });
    seed.set(BOOT_KEYS_KEY, JSON.stringify(kept));
    seed.close();
    const launcher = await nodeHub(home, {}, () => home).launcher();
    const asked: string[] = [];
    const revoke = async (id: string): Promise<'gone' | 'failed'> => { asked.push(id); return 'gone'; };
    expect(await launcher.revokeBootKeysAtLogout({ apiOrigin: api, uid, revoke })).toEqual({ state: 'done', revoked: 2, left: 0, open: 0 });
    expect(asked).toEqual(['tok1', 'tok2']);
    // Another account with no Hub data here: nothing sent, no store made.
    const before = fs.readdirSync(home, { recursive: true }).length;
    expect(await launcher.revokeBootKeysAtLogout({ apiOrigin: api, uid: '64f0ada00000000000000002', revoke })).toEqual({ state: 'none', revoked: 0, left: 0, open: 0 });
    expect(asked).toEqual(['tok1', 'tok2']);
    expect(fs.readdirSync(home, { recursive: true }).length).toBe(before);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('hubCompileCacheDir: node-compile in the per-user cache, made 0700; no home, a link, a directory not 0700 or one others can change: none', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-ncc-'));
  try {
    fs.chmodSync(root, 0o700);
    const xdg = path.join(root, 'cache');
    const dir = hubCompileCacheDir({ XDG_CACHE_HOME: xdg });
    expect(dir).toBe(path.join(xdg, 'hoody', 'hub', 'node-compile'));
    expect(fs.statSync(dir!).mode & 0o777).toBe(0o700);
    expect(hubCompileCacheDir({ XDG_CACHE_HOME: xdg })).toBe(dir);
    fs.chmodSync(dir!, 0o755);
    expect(hubCompileCacheDir({ XDG_CACHE_HOME: xdg })).toBeNull();
    expect(fs.statSync(dir!).mode & 0o777).toBe(0o755);
    fs.chmodSync(dir!, 0o700);
    expect(hubCompileCacheDir({})).toBeNull();
    expect(hubCompileCacheDir({ HOME: 'relative' })).toBeNull();
    const linked = path.join(root, 'linked');
    fs.mkdirSync(path.join(linked, 'hoody', 'hub'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(root, 'elsewhere'), { mode: 0o700 });
    fs.symlinkSync(path.join(root, 'elsewhere'), path.join(linked, 'hoody', 'hub', 'node-compile'));
    expect(hubCompileCacheDir({ XDG_CACHE_HOME: linked })).toBeNull();
    const open = path.join(root, 'open');
    fs.mkdirSync(open, { mode: 0o700 });
    fs.chmodSync(open, 0o777);
    expect(hubCompileCacheDir({ XDG_CACHE_HOME: open })).toBeNull();
    expect(hubCompileCacheDir({ XDG_CACHE_HOME: xdg }, { uid: process.getuid!() + 1 })).toBeNull();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
