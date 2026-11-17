// The `hoody hub` private library cache (build/hub-cache.ts). The end-to-end proof on the compiled executable
// (a planted same-size library is NOT loaded) is build/hub-ship.ts --prove; these are the rules it rests on.
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HUB_CACHE_MARKER, HubCacheError, SYSTEM_LIBRARY_DIR, assertSafeAncestors, dropCacheEnv, cacheStartError, cachePlan, foreignOwnerUid, hubCacheDir, installSystemLibrary, libraryPathFor, openSystemLibrary, prepareHubCache, runInHubCache, sha256File, systemLibrary, systemLibraryDirExists, useSystemLibrary, userPrivateGroup } from './hub-cache';

let root = '';
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-cache-test-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

const put = (dir: string, name: string, body: string | Buffer, mode = 0o600): string => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, body, { mode });
  return f;
};
const code = (fn: () => unknown): string => { try { fn(); } catch (e) { return e instanceof HubCacheError ? e.code : String(e); } return 'no throw'; };

describe('hub cache directory', () => {
  test('XDG_CACHE_HOME, else ~/.cache; relative or missing homes give none', () => {
    expect(hubCacheDir({ XDG_CACHE_HOME: '/x/cache', HOME: '/home/u' })).toBe('/x/cache/hoody/hub');
    expect(hubCacheDir({ HOME: '/home/u' })).toBe('/home/u/.cache/hoody/hub');
    expect(hubCacheDir({ XDG_CACHE_HOME: 'rel', HOME: '/home/u' })).toBe('/home/u/.cache/hoody/hub');
    expect(hubCacheDir({ HOME: 'rel' })).toBeNull();
    expect(hubCacheDir({ HOME: '/' })).toBeNull();
    expect(hubCacheDir({})).toBeNull();
  });

  test('created 0700, parents included; a looser existing directory is tightened', () => {
    const dir = path.join(root, 'c', 'hoody', 'hub');
    prepareHubCache(dir, new Set());
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    fs.chmodSync(dir, 0o755);
    prepareHubCache(dir, new Set());
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
  });

  test('a link, a file, or another user\'s directory in its place stops the start', () => {
    const real = path.join(root, 'real');
    fs.mkdirSync(real);
    const link = path.join(root, 'link');
    fs.symlinkSync(real, link);
    expect(code(() => prepareHubCache(link, new Set()))).toBe('TERM_HUB_CACHE_UNSAFE');
    const file = put(root, 'file', 'x');
    expect(code(() => prepareHubCache(file, new Set()))).toBe('TERM_HUB_CACHE_UNWRITABLE');
    expect(code(() => prepareHubCache(real, new Set(), { uid: (process.getuid?.() ?? 0) + 1 }))).toBe('TERM_HUB_CACHE_UNSAFE');
  });
});

describe('hub cache ancestors', () => {
  test('a directory above the cache that another user can write stops the start; a sticky one does not', () => {
    const open = path.join(root, 'open');
    fs.mkdirSync(open);
    fs.chmodSync(open, 0o777);
    expect(code(() => prepareHubCache(hubCacheDir({ XDG_CACHE_HOME: path.join(open, 'cache') })!, new Set()))).toBe('TERM_HUB_CACHE_UNSAFE');
    // The same directory reached through a link from a safe place: its real path is checked too.
    fs.symlinkSync(open, path.join(root, 'via'));
    expect(code(() => prepareHubCache(path.join(root, 'via', 'c2'), new Set()))).toBe('TERM_HUB_CACHE_UNSAFE');
    // A link whose own directory is open: the path as given is checked, not only where it leads.
    const safe = path.join(root, 'safe');
    fs.mkdirSync(safe, { mode: 0o700 });
    fs.symlinkSync(safe, path.join(open, 'to-safe'));
    expect(code(() => prepareHubCache(path.join(open, 'to-safe', 'c3'), new Set()))).toBe('TERM_HUB_CACHE_UNSAFE');
    const sticky = path.join(root, 'sticky');
    fs.mkdirSync(sticky);
    fs.chmodSync(sticky, 0o1777);
    expect(prepareHubCache(path.join(sticky, 'cache'), new Set()).kept).toEqual([]);
  });

  test('an owner the namespace cannot map (shown as the overflow uid) is trusted only inside a user namespace', () => {
    // Inside the test boundary /usr belongs to the host's root, which this namespace does not map: it shows as 65534.
    const over = Number(fs.readFileSync('/proc/sys/kernel/overflowuid', 'utf8').trim());
    expect(fs.statSync('/usr').uid).toBe(over);
    expect(foreignOwnerUid()).toBe(over);
    const uid = process.getuid!(), gid = process.getgid!();
    expect(code(() => assertSafeAncestors('/usr/lib', uid, gid, over))).toBe('no throw');
    // The same owner outside a user namespace is the real account `nobody`: refused.
    expect(code(() => assertSafeAncestors('/usr/lib', uid, gid, -1))).toBe('TERM_HUB_CACHE_UNSAFE');
  });

  test('a group-writable directory above it passes only for the user\'s primary group when that group is user-private', () => {
    const g = path.join(root, 'grp');
    fs.mkdirSync(g);
    fs.chmodSync(g, 0o775);
    fs.mkdirSync(path.join(g, 'x'), { mode: 0o700 });
    const gid = fs.statSync(g).gid, uid = process.getuid!();
    const groups = path.join(root, 'group');
    const withGroups = (text: string | null) => (id: number): boolean => {
      if (text === null) return userPrivateGroup(id, { groupFile: path.join(root, 'no-such-file'), user: 'ada' });
      fs.writeFileSync(groups, text);
      return userPrivateGroup(id, { groupFile: groups, user: 'ada' });
    };
    // A user-private group (named after the user, no other member): accepted.
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, withGroups(`root:x:0:\nada:x:${gid}:\n`)))).toBe('no throw');
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, withGroups(`ada:x:${gid}:ada\n`)))).toBe('no throw');
    // A shared primary group (`users`, or one with other members): refused, naming the directory and what to do.
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, withGroups(`users:x:${gid}:\n`)))).toBe('TERM_HUB_CACHE_UNSAFE');
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, withGroups(`ada:x:${gid}:ada,bob\n`)))).toBe('TERM_HUB_CACHE_UNSAFE');
    // Group data that cannot be read, or holds no entry for the gid: refused (fail closed).
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, withGroups(null)))).toBe('TERM_HUB_CACHE_UNSAFE');
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, withGroups('root:x:0:\n')))).toBe('TERM_HUB_CACHE_UNSAFE');
    // Not the user's primary group: refused whatever the database says.
    expect(code(() => assertSafeAncestors(path.join(g, 'x'), uid, gid + 1, -1, () => true))).toBe('TERM_HUB_CACHE_UNSAFE');
    let msg = '';
    try { assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, () => false); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain(g);
    expect(msg).toContain('XDG_CACHE_HOME');
    // What the user sees: the start prints that guidance, not only the code.
    let line = '';
    try { assertSafeAncestors(path.join(g, 'x'), uid, gid, -1, () => false); } catch (e) { line = cacheStartError(e); }
    expect(line).toBe(`hoody hub: cannot start (TERM_HUB_CACHE_UNSAFE: ${g} (above the cache directory) can be changed by its group: remove its group and other write permission, or set XDG_CACHE_HOME to a directory only you can change)\n`);
    expect(cacheStartError(new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'a\x1b[2Jb'))).toBe('hoody hub: cannot start (TERM_HUB_CACHE_UNSAFE: a?[2Jb)\n');
    expect(cacheStartError(new Error('other'))).toBe('hoody hub: cannot start (TERM_HUB_CACHE_UNSAFE)\n');
  });
});

describe('hub cache contents', () => {
  const LIB = Buffer.alloc(4096, 7);
  let dir = '';
  let trusted = new Set<string>();
  beforeEach(() => {
    dir = path.join(root, 'hub');
    fs.mkdirSync(dir, { mode: 0o700 });
    trusted = new Set([sha256File(put(root, 'lib.so', LIB))]);
  });

  test('this build\'s own extracted copy stays; an older release\'s copy is pruned', () => {
    put(dir, '.bun-1001-aaaaaaaaaaaaaaaa.so', LIB);
    put(dir, '.bun-1001-bbbbbbbbbbbbbbbb.so', Buffer.alloc(5000, 1));
    put(dir, '.bun-1001-cccccccccccccccc.dylib', Buffer.alloc(10, 2));
    const r = prepareHubCache(dir, trusted);
    expect(r.kept).toEqual(['.bun-1001-aaaaaaaaaaaaaaaa.so']);
    expect(r.removed).toEqual(['.bun-1001-bbbbbbbbbbbbbbbb.so', '.bun-1001-cccccccccccccccc.dylib']);
    expect(fs.readdirSync(dir)).toEqual(['.bun-1001-aaaaaaaaaaaaaaaa.so']);
  });

  test('a planted file with the expected name and SIZE but other bytes is removed (Bun would load it unread)', () => {
    const evil = Buffer.from(LIB);
    evil[100] = 8;
    put(dir, '.bun-1001-aaaaaaaaaaaaaaaa.so', evil);
    const r = prepareHubCache(dir, trusted);
    expect(r).toMatchObject({ kept: [], removed: ['.bun-1001-aaaaaaaaaaaaaaaa.so'] });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test('a link, a hard-linked file and a directory under an extracted name are removed, the link\'s target untouched', () => {
    const target = put(root, 'target.so', LIB);
    fs.symlinkSync(target, path.join(dir, '.bun-1001-aaaaaaaaaaaaaaaa.so'));
    fs.linkSync(target, path.join(dir, '.bun-1001-bbbbbbbbbbbbbbbb.so'));
    fs.mkdirSync(path.join(dir, '.bun-1001-cccccccccccccccc.so'));
    const r = prepareHubCache(dir, trusted);
    expect(r.kept).toEqual([]);
    expect(r.removed.length).toBe(3);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(fs.readFileSync(target).equals(LIB)).toBe(true);
  });

  test('a file owned by another user is not trusted even with the right bytes', () => {
    put(dir, '.bun-1001-aaaaaaaaaaaaaaaa.so', LIB);
    // Judged as if this process were another user: directory ownership is refused first.
    expect(code(() => prepareHubCache(dir, trusted, { uid: (process.getuid?.() ?? 0) + 1 }))).toBe('TERM_HUB_CACHE_UNSAFE');
  });

  test('a fresh in-flight temp file of a concurrent start is left; a stale one and nothing else is removed', () => {
    put(dir, '.8258dc67edca79db-0.so', 'partial');
    put(dir, 'notes.txt', 'kept: not an extracted library');
    expect(prepareHubCache(dir, trusted).removed).toEqual([]);
    expect(prepareHubCache(dir, trusted, { now: Date.now() + 11 * 60_000 }).removed).toEqual(['.8258dc67edca79db-0.so']);
    expect(fs.readdirSync(dir)).toEqual(['notes.txt']);
  });
});

describe('system copy of the library', () => {
  const LIB = Buffer.alloc(4096, 7);
  const me = process.getuid?.() ?? 0;
  let dir = '';
  let trusted = new Set<string>();
  beforeEach(() => {
    const top = path.join(fs.realpathSync(root), 'sys');
    dir = path.join(top, 'hoody', 'hub');
    for (const d of [top, path.dirname(dir), dir]) fs.mkdirSync(d, { mode: 0o755 });
    trusted = new Set([sha256File(put(root, 'lib.so', LIB))]);
  });

  test('the image ships it in one fixed directory', () => {
    expect(SYSTEM_LIBRARY_DIR).toBe('/usr/lib/hoody/hub');
  });

  test('a file with this build\'s bytes is used in place; another release\'s copy and other files are passed over', () => {
    put(dir, 'a-older.so', Buffer.alloc(5000, 1), 0o644);
    put(dir, 'notes.txt', LIB, 0o644);
    expect(systemLibrary(trusted, { dir })).toBeNull();
    const f = put(dir, 'libopentui.so', LIB, 0o644);
    expect(systemLibrary(trusted, { dir })).toBe(f);
    expect(fs.readdirSync(dir).sort()).toEqual(['a-older.so', 'libopentui.so', 'notes.txt']);
  });

  test('no directory, an executable that embeds no library, or no file: none', () => {
    const f = put(dir, 'libopentui.so', LIB, 0o644);
    expect(systemLibrary(trusted, { dir: path.join(root, 'absent') })).toBeNull();
    expect(systemLibrary(new Set(), { dir })).toBeNull();
    fs.unlinkSync(f);
    expect(systemLibrary(trusted, { dir })).toBeNull();
  });

  test('a copy another user could change is not used: group- or other-writable file or directory', () => {
    const f = put(dir, 'libopentui.so', LIB, 0o644);
    for (const mode of [0o664, 0o646, 0o666]) {
      fs.chmodSync(f, mode);
      expect(systemLibrary(trusted, { dir })).toBeNull();
    }
    fs.chmodSync(f, 0o644);
    for (const mode of [0o775, 0o757]) {
      fs.chmodSync(dir, mode);
      expect(systemLibrary(trusted, { dir })).toBeNull();
    }
    fs.chmodSync(dir, 0o755);
    expect(systemLibrary(trusted, { dir })).toBe(f);
    // A directory above it that others can write: they could put their own directory in its place. Not when it is
    // sticky (they cannot rename what they do not own).
    const top = path.dirname(path.dirname(dir));
    fs.chmodSync(top, 0o777);
    expect(systemLibrary(trusted, { dir })).toBeNull();
    fs.chmodSync(top, 0o1777);
    expect(systemLibrary(trusted, { dir })).toBe(f);
  });

  test.skipIf(me === 0)('a copy that belongs to another user is not used, even with the right bytes', () => {
    put(dir, 'libopentui.so', LIB, 0o644);
    expect(systemLibrary(trusted, { dir, uid: me + 1 })).toBeNull();
  });

  test.skipIf(me === 0)('an owner the user namespace does not map is not this user, even when this process runs as that number', () => {
    const f = put(dir, 'libopentui.so', LIB, 0o644);
    expect(systemLibrary(trusted, { dir, uid: me, overflow: me + 1 })).toBe(f);
    // Everything here shows as `me`; with `me` also the overflow uid, that number proves nothing about the owner.
    expect(systemLibrary(trusted, { dir, uid: me, overflow: me })).toBeNull();
    expect(openSystemLibrary(trusted, { dir, uid: me, overflow: me })).toBeNull();
  });

  test('the copy is opened once: the descriptor that was hashed is what the engine is given', () => {
    const f = put(dir, 'libopentui.so', LIB, 0o644);
    const lib = openSystemLibrary(trusted, { dir })!;
    try {
      expect(lib.file).toBe(f);
      expect(fs.fstatSync(lib.fd).ino).toBe(fs.statSync(f).ino);
      const given = libraryPathFor(lib);
      if (fs.existsSync('/proc/self/fd')) {
        expect(given).toBe(`/proc/self/fd/${lib.fd}`);
        // The name is swapped for another file after the check: the descriptor still names the checked bytes.
        fs.renameSync(put(dir, 'other.tmp', Buffer.alloc(4096, 9), 0o644), f);
        expect(sha256File(given)).toBe([...trusted][0]!);
        expect(sha256File(f)).not.toBe([...trusted][0]!);
      }
      expect(libraryPathFor(lib, path.join(root, 'no-procfs'))).toBe(f);
    } finally { fs.closeSync(lib.fd); }
  });

  test('after the engine loaded, programs the Hub starts do not inherit the library switch', () => {
    const env: Record<string, string | undefined> = { OPENTUI_LIB_PATH: '/proc/self/fd/9', OTUI_ASSET_ROOT: '/x', PATH: '/usr/bin' };
    dropCacheEnv(env);
    expect(env).toEqual({ PATH: '/usr/bin' });
  });

  test('a system directory that is there in any form must be usable; only an absent one allows the cache', () => {
    expect(systemLibraryDirExists(path.join(root, 'absent', 'hub'))).toBe(false);
    expect(systemLibraryDirExists(dir)).toBe(true);
    const link = path.join(root, 'dangling');
    fs.symlinkSync(path.join(root, 'nowhere'), link);
    expect(systemLibraryDirExists(link)).toBe(true);
    expect(systemLibraryDirExists(put(root, 'a-file', LIB))).toBe(true);
  });

  test('a link in place of the file or of the directory is not followed', () => {
    const real = put(root, 'real.so', LIB, 0o644);
    const inDir = path.join(dir, 'libopentui.so');
    fs.symlinkSync(real, inDir);
    expect(systemLibrary(trusted, { dir })).toBeNull();
    fs.unlinkSync(inDir);
    put(dir, 'libopentui.so', LIB, 0o644);
    const link = path.join(root, 'link');
    fs.symlinkSync(dir, link);
    expect(systemLibrary(trusted, { dir: link })).toBeNull();
    expect(systemLibrary(trusted, { dir })).toBe(inDir);
  });

  test('the image build writes this executable\'s own library there, and the start then finds it', async () => {
    const target = path.join(path.dirname(dir), 'fresh', 'hub');
    const written = await installSystemLibrary(target, [{ name: 'libopentui-abc123.so', bytes: LIB }]);
    expect(written).toEqual([path.join(target, 'libopentui-abc123.so')]);
    expect(fs.readdirSync(target)).toEqual(['libopentui-abc123.so']);
    expect(fs.statSync(written[0]!).mode & 0o777).toBe(0o644);
    expect(fs.statSync(target).mode & 0o022).toBe(0);
    expect(systemLibrary(trusted, { dir: target })).toBe(written[0]!);
    // Again over the same directory: replaced in place, nothing left behind.
    await installSystemLibrary(target, [{ name: 'libopentui-abc123.so', bytes: LIB }]);
    expect(fs.readdirSync(target)).toEqual(['libopentui-abc123.so']);
  });

  test('an executable that carries no library installs nothing and says so; an odd name is refused', async () => {
    const target = path.join(path.dirname(dir), 'none');
    const said = async (files: Array<{ name: string; bytes: Uint8Array }>): Promise<string> => {
      try { await installSystemLibrary(target, files); } catch (e) { return String((e as Error).message); }
      return 'no throw';
    };
    expect(await said([])).toBe('this hoody carries no terminal Hub library');
    expect(fs.existsSync(target)).toBe(false);
    expect(await said([{ name: '.hidden.so', bytes: LIB }])).toBe('unexpected library name');
    expect(await said([{ name: 'notes.txt', bytes: LIB }])).toBe('unexpected library name');
    expect(fs.readdirSync(target)).toEqual([]);
  });

  test('more than one library is refused before anything is written', async () => {
    const target = path.join(path.dirname(dir), 'two');
    let said = 'no throw';
    try {
      await installSystemLibrary(target, [{ name: 'liba.so', bytes: LIB }, { name: 'libb.so', bytes: Buffer.from('other') }]);
    } catch (e) { said = String((e as Error).message); }
    expect(said).toBe('this hoody carries 2 native libraries; the system copy holds exactly one');
    expect(fs.existsSync(target)).toBe(false);
  });

  test('a link or a file at the target is refused before the first write', async () => {
    const real = path.join(path.dirname(dir), 'elsewhere');
    fs.mkdirSync(real, { mode: 0o755 });
    const link = path.join(path.dirname(dir), 'linked');
    fs.symlinkSync(real, link);
    const file = put(path.dirname(dir), 'plain-file', 'x', 0o644);
    for (const target of [link, file]) {
      let said = 'no throw';
      try { await installSystemLibrary(target, [{ name: 'libopentui.so', bytes: LIB }]); } catch (e) { said = String((e as Error).message); }
      expect(said).toBe(`${target} is not a plain directory at its own real path`);
    }
    expect(fs.readdirSync(real)).toEqual([]);
  });

  test('a copy the start would pass over fails the install instead of shipping', async () => {
    // The directory already exists group-writable (mkdir keeps an existing mode): systemLibrary refuses it.
    const target = path.join(path.dirname(dir), 'loose');
    fs.mkdirSync(target, { mode: 0o755 });
    fs.chmodSync(target, 0o775);
    let said = 'no throw';
    try { await installSystemLibrary(target, [{ name: 'libopentui.so', bytes: LIB }]); } catch (e) { said = String((e as Error).message); }
    expect(said).toContain('a start would not use it');
  });

  test('the engine is pointed at it, and at nothing the caller\'s environment named', () => {
    const env: Record<string, string | undefined> = { OPENTUI_LIB_PATH: '/home/u/evil.so', OTUI_ASSET_ROOT: '/home/u/assets', PATH: '/usr/bin' };
    useSystemLibrary(env, '/usr/lib/hoody/hub/libopentui.so');
    expect(env).toEqual({ OPENTUI_LIB_PATH: '/usr/lib/hoody/hub/libopentui.so', PATH: '/usr/bin' });
  });
});

describe('hub cache start plan', () => {
  const dir = '/home/u/.cache/hoody/hub';
  test('started with BUN_TMPDIR (which Bun reads before TMPDIR) at the cache: run here', () => {
    expect(cachePlan({ BUN_TMPDIR: dir, TMPDIR: '/tmp' }, dir)).toEqual({ run: true });
    expect(cachePlan({ TMPDIR: dir }, dir)).toEqual({ run: true });
  });
  test('anything else re-executes with BUN_TMPDIR at the cache, TMPDIR untouched', () => {
    const p = cachePlan({ TMPDIR: '/tmp', PATH: '/usr/bin' }, dir);
    expect(p).toEqual({ run: false, env: { TMPDIR: '/tmp', PATH: '/usr/bin', BUN_TMPDIR: dir, [HUB_CACHE_MARKER]: dir } });
    // TMPDIR at the cache does not count while BUN_TMPDIR points elsewhere: Bun would extract there.
    expect(cachePlan({ TMPDIR: dir, BUN_TMPDIR: '/elsewhere' }, dir)).toMatchObject({ run: false, env: { BUN_TMPDIR: dir } });
  });
  test('a re-execution that still does not extract into the cache stops instead of looping', () => {
    expect(code(() => cachePlan({ [HUB_CACHE_MARKER]: dir, BUN_TMPDIR: '/elsewhere' }, dir))).toBe('TERM_HUB_CACHE_LOOP');
  });
});

describe('hub start (runInHubCache)', () => {
  // The executable's first step itself, on every branch that starts no process (not the re-execution, not the private
  // temp directory). process.exit is trapped and throws, so the start stops where the real one ends the process. The
  // system directory is always a test directory and the trusted set is always given (Bun.embeddedFiles is never read).
  const LIB = Buffer.alloc(4096, 7);
  class Exited extends Error { constructor(readonly status: unknown) { super('process.exit'); } }
  const KEYS = ['OPENTUI_LIB_PATH', 'OTUI_ASSET_ROOT', 'BUN_TMPDIR', HUB_CACHE_MARKER];
  let saved: Array<[string, string | undefined]> = [];
  let undo: Array<() => void> = [];
  let fds: number[] = [];
  let exits: unknown[] = [];
  let lines: string[] = [];
  let sys = '';
  let cache = '';
  let trusted = new Set<string>();
  beforeEach(() => {
    saved = KEYS.map((k): [string, string | undefined] => [k, process.env[k]]);
    exits = [];
    lines = [];
    fds = [];
    const exit = spyOn(process, 'exit').mockImplementation((c) => { exits.push(c); throw new Exited(c); });
    const write = spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { lines.push(String(chunk)); return true; });
    undo = [() => exit.mockRestore(), () => write.mockRestore()];
    // A start that wrongly reaches the re-execution fails here instead of replacing the test process (the test fence
    // already refuses Bun.spawn).
    const px = process as unknown as { execve?: (...a: unknown[]) => never };
    if (typeof px.execve === 'function') {
      const ex = spyOn(px, 'execve').mockImplementation(() => { throw new Error('execve in a test'); });
      undo.push(() => ex.mockRestore());
    }
    const top = path.join(fs.realpathSync(root), 'sys');
    sys = path.join(top, 'hoody', 'hub');
    for (const d of [top, path.dirname(sys), sys]) fs.mkdirSync(d, { mode: 0o755 });
    cache = path.join(root, 'cache', 'hoody', 'hub');
    trusted = new Set([sha256File(put(root, 'lib.so', LIB))]);
  });
  afterEach(() => {
    for (const u of undo) u();
    for (const fd of fds) { try { fs.closeSync(fd); } catch { /* already closed */ } }
    for (const [k, v] of saved) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  });

  /** The code the start ended the process with ('no exit' when it returned). main resolves before process.exit. */
  const startHub = async (main: () => Promise<number>, o: Parameters<typeof runInHubCache>[1]): Promise<unknown> => {
    let status: unknown = 'no exit';
    await runInHubCache(main, o).catch((e: unknown) => { if (!(e instanceof Exited)) throw e; status = e.status; });
    return status;
  };
  /** What main sees of the engine's library switches: what the engine would open. */
  const switches = (): { lib: string | undefined; assets: string | undefined } => ({ lib: process.env.OPENTUI_LIB_PATH, assets: process.env.OTUI_ASSET_ROOT });

  test('a system copy with this build\'s bytes: main runs on that open file, the caller\'s switches gone, no cache made', async () => {
    const f = put(sys, 'libopentui.so', LIB, 0o644);
    process.env.OPENTUI_LIB_PATH = '/home/u/evil.so';
    process.env.OTUI_ASSET_ROOT = '/home/u/assets';
    const seen: Array<ReturnType<typeof switches>> = [];
    const main = mock(async () => { seen.push(switches()); return 7; });
    expect(await startHub(main, { systemDir: sys, trusted, dir: cache })).toBe(7);
    expect(main).toHaveBeenCalledTimes(1);
    expect(exits).toEqual([7]);
    expect(lines).toEqual([]);
    const lib = seen[0]?.lib ?? '';
    // The descriptor that was hashed (closed after the test), where procfs offers it; else the file.
    const viaFd = /^\/proc\/self\/fd\/(\d+)$/.exec(lib);
    if (viaFd) fds.push(Number(viaFd[1]));
    expect(viaFd !== null).toBe(fs.existsSync('/proc/self/fd'));
    if (viaFd) expect(fs.fstatSync(Number(viaFd[1])).ino).toBe(fs.statSync(f).ino);
    else expect(lib).toBe(f);
    expect(seen).toStrictEqual([{ lib, assets: undefined }]);
    expect(fs.existsSync(path.join(root, 'cache'))).toBe(false);
  });

  test('a system directory holding no usable copy stops the start (exit 70): main never runs, nothing extracted', async () => {
    const refused = async (): Promise<void> => {
      exits.length = 0;
      lines.length = 0;
      const main = mock(async () => 7);
      expect(await startHub(main, { systemDir: sys, trusted, dir: cache })).toBe(70);
      expect(main).not.toHaveBeenCalled();
      expect(exits).toEqual([70]);
      expect(lines).toEqual([`hoody hub: cannot start (TERM_HUB_SYSTEM_LIBRARY: ${sys} exists but holds no usable copy of this hoody's terminal Hub library; reinstall the system image, or remove that directory)\n`]);
      expect(fs.existsSync(path.join(root, 'cache'))).toBe(false);
    };
    await refused(); // empty
    const f = put(sys, 'libopentui.so', Buffer.alloc(4096, 1), 0o644);
    await refused(); // another build's library
    fs.writeFileSync(f, LIB);
    fs.chmodSync(f, 0o664);
    await refused(); // this build's bytes, in a file its group can change
  });

  test('more than one trusted library while the system directory exists: refused before any copy is opened (exit 70)', async () => {
    // A usable copy is there: the count is refused first.
    put(sys, 'libopentui.so', LIB, 0o644);
    const two = new Set([...trusted, sha256File(put(root, 'other.so', Buffer.from('other')))]);
    const main = mock(async () => 7);
    expect(await startHub(main, { systemDir: sys, trusted: two, dir: cache })).toBe(70);
    expect(main).not.toHaveBeenCalled();
    expect(exits).toEqual([70]);
    expect(lines).toEqual([`hoody hub: cannot start (TERM_HUB_SYSTEM_LIBRARY: this hoody carries 2 native libraries; the system copy in ${sys} holds exactly one)\n`]);
    expect(fs.existsSync(path.join(root, 'cache'))).toBe(false);
  });

  test('no system directory, started in the cache: main runs there, the cache made 0700, the library switches dropped', async () => {
    const absent = path.join(root, 'absent', 'hub');
    process.env.BUN_TMPDIR = cache;
    process.env.OPENTUI_LIB_PATH = '/home/u/evil.so';
    process.env.OTUI_ASSET_ROOT = '/home/u/assets';
    const seen: Array<ReturnType<typeof switches>> = [];
    const main = mock(async () => { seen.push(switches()); return 9; });
    expect(await startHub(main, { systemDir: absent, trusted, dir: cache })).toBe(9);
    expect(main).toHaveBeenCalledTimes(1);
    expect(exits).toEqual([9]);
    expect(lines).toEqual([]);
    expect(seen).toStrictEqual([{ lib: undefined, assets: undefined }]);
    expect(fs.lstatSync(cache).isDirectory()).toBe(true);
    expect(fs.statSync(cache).mode & 0o777).toBe(0o700);
    expect(fs.existsSync(absent)).toBe(false);
  });

  test('no system directory and a cache that cannot be made (a file in its place): exit 70, main never runs', async () => {
    const file = put(root, 'cache-file', 'x');
    const main = mock(async () => 9);
    expect(await startHub(main, { systemDir: path.join(root, 'absent', 'hub'), trusted, dir: file })).toBe(70);
    expect(main).not.toHaveBeenCalled();
    expect(exits).toEqual([70]);
    expect(lines).toEqual(['hoody hub: cannot start (TERM_HUB_CACHE_UNWRITABLE: the cache directory cannot be created)\n']);
    expect(fs.readFileSync(file, 'utf8')).toBe('x');
  });
});
