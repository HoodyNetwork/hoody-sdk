// The `hoody hub` executable's private library cache.
//
// What Bun 1.4.4 does (measured): a `bun build --compile` executable copies each embedded
// native library to `<tmp>/.bun-<uid>-<hash>.so` when the engine opens it, where <tmp> is BUN_TMPDIR, else TMPDIR,
// else /tmp, read from the environment the process STARTED with (setting process.env later changes nothing). It never
// deletes the copy. When a regular file of that name and the SAME SIZE is already there it loads that file WITHOUT
// reading it: a planted library of the right size runs inside the Hub. A file of another size, or a link, is replaced
// (temp file + rename).
//
// So before the engine loads, the executable (runInHubCache):
//  1. picks one directory per user: $XDG_CACHE_HOME/hoody/hub, else ~/.cache/hoody/hub; it must be a real directory
//     owned by this user, and is made 0700 (hubCacheDir, prepareHubCache); every directory above it, on the path as
//     given and on its real path, must be one no other user can rename it out of (assertSafeAncestors);
//  2. removes every extracted-library file in it whose content is not byte-identical (sha256) to a library embedded
//     in THIS executable: one rule that both prunes older releases' copies and refuses a file this build did not
//     write. What stays is exactly what Bun would write;
//  3. re-executes itself with BUN_TMPDIR set to that directory when it was not started that way. TMPDIR stays the
//     user's own; the Hub drops BUN_TMPDIR from its environment once the engine is loaded (hub-main.ts).
//  4. drops the engine's "load the library from this path" switches (OPENTUI_LIB_PATH, OTUI_ASSET_ROOT) from its
//     environment: with either set, the engine would open that file instead of the embedded one.
// A directory that cannot be made safe stops the start (TERM_HUB_CACHE_*), before any library is opened. Without a
// home directory the start falls back to a fresh private directory that is removed at exit (launcher.ts).
//
// Before all of that, the system copy (systemLibrary): an operating-system image may ship this build's library in
// SYSTEM_LIBRARY_DIR. A file there with the bytes of a library embedded in this executable is opened in place
// (OPENTUI_LIB_PATH, set here after the caller's own value was dropped): nothing is extracted, so there is no cache
// and no second start. The file is opened once, hashed through that descriptor, and the engine is given the
// descriptor (/proc/self/fd/<n>), so what was hashed is what is mapped. The SSH gateway image does this: its session
// sandbox lets a program map code only from the image's system library paths, never from the home directory or
// /tmp, so an extracted copy can never load there. A system directory that EXISTS but holds no usable copy of this
// build's library stops the start (TERM_HUB_SYSTEM_LIBRARY): the image is broken, and extracting instead would hide
// it (and, in the gateway, fail later with a refusal nobody can read).
// Known limits of the system copy:
//  - exactly ONE embedded native library is supported (the build step asserts one; installSystemLibrary and the start
//    refuse any other count): a second library would still be extracted to the temp directory, with no prepared cache;
//  - owners and modes are judged, POSIX ACLs are not read: an ACL that lets another user write the file or a directory
//    above it is not seen;
//  - a machine with a system directory runs only the build that directory was written by: a hoody updated per user
//    stops with TERM_HUB_SYSTEM_LIBRARY (exit 70) until root runs `hoody hub --install-library` again (the image is
//    rebuilt);
//  - installSystemLibrary does not remove another release's library from the directory: such a file is hashed and
//    passed over at every start. An image build starts from an empty directory.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Set (to the cache directory) by the re-execution: seeing it without being started in that directory is a loop. */
export const HUB_CACHE_MARKER = 'HOODY_HUB_CACHE';
/** A file Bun extracted (`.bun-<uid>-<hash>.<ext>`), or its in-flight temp name (`.<hex>-<n>.<ext>`). */
const EXTRACTED = /^\.bun-.*\.(so|dylib|dll)$/;
const IN_FLIGHT = /^\.[0-9a-f]+-\d+\.(so|dylib|dll)$/;
/** An in-flight temp file older than this belongs to a start that died. */
const IN_FLIGHT_MAX_AGE_MS = 10 * 60_000;
const LIBRARY = /\.(so|dylib|dll)$/;

export class HubCacheError extends Error {
  constructor(readonly code: 'TERM_HUB_CACHE_UNSAFE' | 'TERM_HUB_CACHE_UNWRITABLE' | 'TERM_HUB_CACHE_LOOP' | 'TERM_HUB_SYSTEM_LIBRARY', what: string) {
    super(`${code}: ${what}`);
    this.name = 'HubCacheError';
  }
}

/** The per-user cache directory, or null when the environment names no usable home (relative paths are ignored). */
export function hubCacheDir(env: Readonly<Record<string, string | undefined>>): string | null {
  const xdg = env.XDG_CACHE_HOME;
  if (xdg && path.isAbsolute(xdg)) return path.join(xdg, 'hoody', 'hub');
  const home = env.HOME;
  if (home && path.isAbsolute(home) && home !== '/') return path.join(home, '.cache', 'hoody', 'hub');
  return null;
}

export function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Every native library embedded in this executable (none when not compiled). */
export async function embeddedLibraryFiles(): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const out: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const f of Bun.embeddedFiles) {
    const name = (f as Blob & { name?: string }).name ?? '';
    if (LIBRARY.test(name)) out.push({ name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  return out;
}

/** sha256 of every native library embedded in this executable (none when not compiled). */
export async function embeddedLibraries(): Promise<Set<string>> {
  const out = new Set<string>();
  for (const f of await embeddedLibraryFiles()) out.add(crypto.createHash('sha256').update(f.bytes).digest('hex'));
  return out;
}

export interface PreparedCache { dir: string; kept: string[]; removed: string[] }

/** Where an operating-system image ships this build's native library (the SSH gateway image; see the header). */
export const SYSTEM_LIBRARY_DIR = '/usr/lib/hoody/hub';

/** sha256 of an open file, read through the descriptor (not the path). */
function sha256Fd(fd: number): string {
  const h = crypto.createHash('sha256');
  const buf = Buffer.allocUnsafe(1 << 20);
  for (let pos = 0; ; ) {
    const n = fs.readSync(fd, buf, 0, buf.length, pos);
    if (n <= 0) break;
    h.update(buf.subarray(0, n));
    pos += n;
  }
  return h.digest('hex');
}

/** An opened system copy: `fd` stays open (the caller closes it, or hands it to the engine); `file` is its path. */
export interface SystemLibrary { file: string; fd: number }

/**
 * Opens the system copy of a library embedded in this executable, or returns null: no such directory, no file with
 * this build's bytes in it, or a path someone else could change. Never throws.
 *  - Same bytes: only a file whose sha256 is in `trusted` (embeddedLibraries) is returned, so opening it is opening
 *    what this executable carries. Another release's copy, or any other file, is passed over.
 *  - One open: the file is opened once (no link followed), judged and hashed through that descriptor, and the
 *    descriptor is returned. The engine maps that same open file (libraryPathFor), so a file swapped in under the
 *    name afterwards is not what loads. A writer of the SAME file could still change its bytes after the hash; the
 *    ownership rules below are what rule that out: the file, its directory and every directory above must belong to
 *    root or to this user, and none may be writable by group or others (a sticky directory above may be: others
 *    cannot rename what they do not own). The directory is its own real path and the file a regular file.
 *  - The overflow uid (65534) never counts as "this user", whatever this process runs as: the kernel shows every
 *    owner the user namespace does not map as that number, so it can be any user of the machine outside (a
 *    directory bound into a rootless container), and nothing here stops them rewriting the file after the hash.
 *    Such a copy counts as unusable. No namespace test is made: one that could not be read would have to guess.
 *  - This does not defend against this same user, as the cache does not. In an SSH gateway session the image's files
 *    show as this user's (the session uid maps onto the image's root); what keeps the session from changing them is
 *    the gateway's read-only /usr and its AppArmor and Landlock rules, not this function.
 */
export function openSystemLibrary(trusted: ReadonlySet<string>, o: { dir?: string; uid?: number; overflow?: number } = {}): SystemLibrary | null {
  if (trusted.size === 0) return null;
  const dir = path.resolve(o.dir ?? SYSTEM_LIBRARY_DIR);
  const uid = o.uid ?? process.getuid?.() ?? -1;
  const overflow = o.overflow ?? OVERFLOW_UID;
  const owned = (s: fs.Stats): boolean => s.uid === 0 || (s.uid === uid && uid !== overflow);
  const fixed = (s: fs.Stats): boolean => owned(s) && (s.mode & 0o022) === 0;
  try {
    if (fs.realpathSync(dir) !== dir) return null;
    if (!fixed(fs.lstatSync(dir))) return null;
    for (let a = path.dirname(dir); ; a = path.dirname(a)) {
      const s = fs.lstatSync(a);
      if (!owned(s) || ((s.mode & 0o022) !== 0 && (s.mode & 0o1000) === 0)) return null;
      if (a === path.dirname(a)) break;
    }
    for (const name of fs.readdirSync(dir).sort()) {
      if (!LIBRARY.test(name)) continue;
      const file = path.join(dir, name);
      let fd: number;
      try { fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); } catch { continue; }
      let keep = false;
      try {
        const s = fs.fstatSync(fd);
        keep = s.isFile() && fixed(s) && trusted.has(sha256Fd(fd));
      } catch { /* unreadable: not this one */ }
      if (keep) return { file, fd };
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  } catch { /* not there, or not readable: no system copy */ }
  return null;
}

/** The kernel's overflow uid: what an owner the user namespace does not map shows as. The kernel default; the
 *  sysctl that could change it is not read (a sandboxed start may not read it, and would log a refusal each time). */
const OVERFLOW_UID = 65534;

/** The path of the system copy a start would use (openSystemLibrary, descriptor closed), or null. Never throws. */
export function systemLibrary(trusted: ReadonlySet<string>, o: { dir?: string; uid?: number; overflow?: number } = {}): string | null {
  const lib = openSystemLibrary(trusted, o);
  if (lib === null) return null;
  try { fs.closeSync(lib.fd); } catch { /* ignore */ }
  return lib.file;
}

/** True when the system library directory is there in any form (a directory, a link, a file): then it must be usable. */
export function systemLibraryDirExists(dir: string = SYSTEM_LIBRARY_DIR): boolean {
  try { fs.lstatSync(dir); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ENOENT' && (e as NodeJS.ErrnoException).code !== 'ENOTDIR'; }
}

/**
 * What the engine is told to open for an opened system copy: the descriptor itself where the kernel offers
 * /proc/self/fd (Linux), so the bytes hashed are the bytes mapped; else the path.
 */
export function libraryPathFor(lib: SystemLibrary, procFd = '/proc/self/fd'): string {
  const viaFd = `${procFd}/${lib.fd}`;
  try { if (fs.statSync(viaFd).isFile()) return viaFd; } catch { /* no procfs here */ }
  return lib.file;
}

/**
 * Writes every native library embedded in this executable into `dir` and returns the files (each 0644; a directory
 * it creates is asked for as 0755, but the umask applies and an existing directory keeps its mode: the caller checks):
 * how an operating-system image gets its system copy (`hoody hub --install-library`, run as root while the image is
 * built). The bytes come out of the executable that will later look for them, so the copy cannot be another build's.
 * Each file is written under a temporary name and renamed into place. Throws when the executable embeds no library,
 * the directory cannot be written, or a start would not use what was written (systemLibrary says no).
 */
export async function installSystemLibrary(dir: string = SYSTEM_LIBRARY_DIR, files: ReadonlyArray<{ name: string; bytes: Uint8Array }> | null = null): Promise<string[]> {
  const libs = files ?? await embeddedLibraryFiles();
  if (libs.length === 0) throw new Error('this hoody carries no terminal Hub library');
  // One library is what a start can use from here: any other one would be extracted to the temp directory instead.
  if (libs.length !== 1) throw new Error(`this hoody carries ${libs.length} native libraries; the system copy holds exactly one`);
  // Never write through a link (or onto a file) someone left at the target: refuse before the first write.
  let there: fs.Stats | null = null;
  try { there = fs.lstatSync(dir); } catch { /* not there yet: created below */ }
  if (there !== null && (!there.isDirectory() || fs.realpathSync(dir) !== path.resolve(dir))) throw new Error(`${dir} is not a plain directory at its own real path`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
  const out: string[] = [];
  for (const lib of libs) {
    const name = path.basename(lib.name);
    if (!LIBRARY.test(name) || name.startsWith('.')) throw new Error('unexpected library name');
    const file = path.join(dir, name);
    // A random part: a run that died earlier with the same pid cannot leave a name this one trips over ('wx').
    const tmp = path.join(dir, `.${name}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    fs.writeFileSync(tmp, lib.bytes, { mode: 0o644, flag: 'wx' });
    try {
      fs.chmodSync(tmp, 0o644);
      fs.renameSync(tmp, file);
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch { /* nothing to remove */ }
      throw e;
    }
    out.push(file);
  }
  // Prove it here, while the image is being built, not at a user's first start: a copy the start would pass over
  // (an owner or a mode systemLibrary refuses, here or above) is an error.
  const hashes = new Set(libs.map((l) => crypto.createHash('sha256').update(l.bytes).digest('hex')));
  if (systemLibrary(hashes, { dir }) === null) throw new Error(`the library was written to ${dir} but a start would not use it: check the owner and mode of that directory and of every directory above it`);
  return out;
}

/** In a user namespace other than the initial one, the kernel shows a file whose owner is not mapped into it as the
 *  overflow uid (65534): an owner outside the namespace's reach, like root. Outside a user namespace 65534 is a real
 *  account (nobody: daemons, NFS squashed writers) and gets no such trust: then this is -1. */
export function foreignOwnerUid(): number {
  let map = '';
  try { map = fs.readFileSync('/proc/self/uid_map', 'utf8').trim(); } catch { return -1; }
  if (/^0\s+0\s+4294967295$/.test(map)) return -1;
  try { return Number(fs.readFileSync('/proc/sys/kernel/overflowuid', 'utf8').trim()); } catch { return -1; }
}

/**
 * True only for a user-private group: the group database (one read of `groupFile`, /etc/group) has `gid` named after
 * the user, with no member or only that user. Anything else, or a database that cannot be read or has no such entry
 * (a directory service), is false: fail closed.
 */
export function userPrivateGroup(gid: number, o: { groupFile?: string; user?: string } = {}): boolean {
  let user = o.user;
  if (user === undefined) { try { user = os.userInfo().username; } catch { return false; } }
  let text: string;
  try { text = fs.readFileSync(o.groupFile ?? '/etc/group', 'utf8'); } catch { return false; }
  for (const line of text.split('\n')) {
    const [name, , id, members = ''] = line.split(':');
    if (id === undefined || Number(id) !== gid || id.trim() === '') continue;
    const who = members.split(',').map((m) => m.trim()).filter(Boolean);
    return name === user && who.every((m) => m === user);
  }
  return false;
}

/**
 * Another user who can write a directory above the cache can rename the cache away and put their own in its place
 * between this check and the engine's library load. So every directory above it, on the path as given (a link
 * component's own directory included) and on its real path, must be owned by root (or an owner outside this user
 * namespace: foreignOwnerUid) or this user, and writable by no one else: not by others, and by its group only when that
 * group is this user's primary group AND a user-private group (userPrivateGroup), unless the directory is sticky (/tmp:
 * others cannot rename what they do not own).
 */
export function assertSafeAncestors(dir: string, uid: number, gid: number, foreign = foreignOwnerUid(), privateGroup: (gid: number) => boolean = userPrivateGroup): void {
  const nobody = foreign;
  const dirs = new Set<string>();
  const above = (p: string): void => { for (let a = path.dirname(p); ; a = path.dirname(a)) { dirs.add(a); if (a === path.dirname(a)) break; } };
  above(path.resolve(dir));
  let real: string;
  try { real = fs.realpathSync(dir); } catch { throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'the cache directory cannot be resolved'); }
  above(real);
  const fix = 'remove its group and other write permission, or set XDG_CACHE_HOME to a directory only you can change';
  for (const a of dirs) {
    let s: fs.Stats;
    try { s = fs.statSync(a); } catch { throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', `${a} (above the cache directory) cannot be read`); }
    if (uid >= 0 && s.uid !== 0 && s.uid !== uid && (nobody < 0 || s.uid !== nobody)) throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', `${a} (above the cache directory) belongs to another user: set XDG_CACHE_HOME to a directory of your own`);
    if (s.mode & 0o1000) continue;
    if (s.mode & 0o002) throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', `${a} (above the cache directory) can be changed by other users: ${fix}`);
    if (s.mode & 0o020 && (gid < 0 || s.gid !== gid || !privateGroup(s.gid))) throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', `${a} (above the cache directory) can be changed by its group: ${fix}`);
  }
}

/**
 * Makes `dir` the private cache and leaves in it only extracted libraries whose sha256 is in `trusted`.
 * Throws HubCacheError when the directory is not a real directory of this user, or a file that must go cannot be removed.
 */
export function prepareHubCache(dir: string, trusted: ReadonlySet<string>, o: { uid?: number; gid?: number; now?: number } = {}): PreparedCache {
  const uid = o.uid ?? process.getuid?.() ?? -1;
  const now = o.now ?? Date.now();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch {
    throw new HubCacheError('TERM_HUB_CACHE_UNWRITABLE', 'the cache directory cannot be created');
  }
  const st = fs.lstatSync(dir);
  if (!st.isDirectory()) throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'the cache path is not a directory');
  if (uid >= 0 && st.uid !== uid) throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'the cache directory belongs to another user');
  assertSafeAncestors(dir, uid, o.gid ?? process.getgid?.() ?? -1);
  if ((st.mode & 0o777) !== 0o700) {
    try { fs.chmodSync(dir, 0o700); } catch { throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'the cache directory cannot be made private'); }
  }
  const kept: string[] = [];
  const removed: string[] = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const extracted = EXTRACTED.test(name);
    if (!extracted && !IN_FLIGHT.test(name)) continue;
    const file = path.join(dir, name);
    let s: fs.Stats;
    try { s = fs.lstatSync(file); } catch { continue; } // gone meanwhile (another start pruned it)
    if (!extracted) {
      // Another start may be writing it right now (it becomes a .bun- name by rename); only a stale one goes.
      if (now - s.mtimeMs < IN_FLIGHT_MAX_AGE_MS) continue;
    } else if (s.isFile() && s.nlink === 1 && (uid < 0 || s.uid === uid) && trusted.has(sha256File(file))) {
      kept.push(name);
      continue;
    }
    try {
      fs.rmSync(file, { recursive: true, force: true });
    } catch {
      throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'a file this build did not write cannot be removed from the cache directory');
    }
    if (fs.existsSync(file)) throw new HubCacheError('TERM_HUB_CACHE_UNSAFE', 'a file this build did not write cannot be removed from the cache directory');
    removed.push(name);
  }
  return { dir, kept, removed };
}

/** The line a refused start prints: the code and what to do (a HubCacheError holds only local paths and fixed text;
 *  control characters in a path are shown as `?`). Anything else: the code only. */
export function cacheStartError(e: unknown): string {
  const what = e instanceof HubCacheError ? e.message : 'TERM_HUB_CACHE_UNSAFE';
  return `hoody hub: cannot start (${what.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?')})\n`;
}

/** Where Bun will extract to, given the environment a process started with. */
export const extractDirOf = (env: Readonly<Record<string, string | undefined>>): string | undefined => env.BUN_TMPDIR || env.TMPDIR || undefined;

/** What the start must do: run here, re-execute with the returned environment, or stop. Pure (tested). */
export function cachePlan(env: Readonly<Record<string, string | undefined>>, dir: string): { run: true } | { run: false; env: Record<string, string> } {
  if (extractDirOf(env) === dir) return { run: true };
  if (env[HUB_CACHE_MARKER] === dir) throw new HubCacheError('TERM_HUB_CACHE_LOOP', 'the cache directory did not take effect');
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) next[k] = v;
  next.BUN_TMPDIR = dir;
  next[HUB_CACHE_MARKER] = dir;
  return { run: false, env: next };
}

/** The engine's own switches that load a native library from somewhere else (OpenTUI core resolveNativeLibraryPath). */
export const LIBRARY_OVERRIDES = ['OPENTUI_LIB_PATH', 'OTUI_ASSET_ROOT'] as const;
/** Before the engine loads: the executable opens only the library embedded in it. */
export function dropLibraryOverrides(env: Record<string, string | undefined>): void {
  for (const k of LIBRARY_OVERRIDES) delete env[k];
}

/** Before the engine loads: it opens `file` (libraryPathFor of an opened system copy) and nothing the caller's environment named. */
export function useSystemLibrary(env: Record<string, string | undefined>, file: string): void {
  dropLibraryOverrides(env);
  env.OPENTUI_LIB_PATH = file;
}

/**
 * After the engine loaded: the cache is no longer anyone's temp directory, and the library switch set for a system
 * copy (/proc/self/fd/<n>, which in a child would name the CHILD's descriptor <n>) is gone: programs the Hub starts
 * inherit this environment.
 */
export function dropCacheEnv(env: Record<string, string | undefined>): void {
  dropLibraryOverrides(env);
  const dir = env[HUB_CACHE_MARKER];
  if (dir === undefined) return;
  if (env.BUN_TMPDIR === dir) delete env.BUN_TMPDIR;
  delete env[HUB_CACHE_MARKER];
}

/**
 * The executable's first step. Runs `main` (which may then import the engine) only in a process that opens the system
 * copy of its library (systemLibrary) or extracts into the prepared private cache; otherwise re-executes this
 * executable there. Exit 70 with a fixed code when the cache cannot be made safe, or when the system library directory
 * exists without a usable copy. Every path ends the process with main's exit code.
 */
export async function runInHubCache(main: () => Promise<number>, o: { dir?: string | null; trusted?: ReadonlySet<string>; system?: SystemLibrary | null; systemDir?: string } = {}): Promise<never> {
  const embedded = o.system === undefined ? (o.trusted ?? await embeddedLibraries()) : null;
  if (embedded !== null && embedded.size > 1 && systemLibraryDirExists(o.systemDir)) {
    // One library can be opened in place; the others would be extracted to the temp directory with no prepared cache.
    process.stderr.write(cacheStartError(new HubCacheError('TERM_HUB_SYSTEM_LIBRARY', `this hoody carries ${embedded.size} native libraries; the system copy in ${o.systemDir ?? SYSTEM_LIBRARY_DIR} holds exactly one`)));
    process.exit(70);
  }
  const system = embedded !== null ? openSystemLibrary(embedded, { dir: o.systemDir }) : (o.system as SystemLibrary | null);
  if (system !== null) {
    // The image's own copy of this build's library: opened in place, nothing extracted, no cache, no second start.
    // The descriptor stays open for the life of the process: the engine maps it.
    useSystemLibrary(process.env, libraryPathFor(system));
    process.exit(await main());
  }
  if (o.system === undefined && systemLibraryDirExists(o.systemDir)) {
    // The image ships a library directory and this build's library is not usable from it. Never extract instead.
    process.stderr.write(cacheStartError(new HubCacheError('TERM_HUB_SYSTEM_LIBRARY', `${o.systemDir ?? SYSTEM_LIBRARY_DIR} exists but holds no usable copy of this hoody's terminal Hub library; reinstall the system image, or remove that directory`)));
    process.exit(70);
  }
  const dir = o.dir === undefined ? hubCacheDir(process.env) : o.dir;
  if (dir === null) {
    // launcher.ts points TMPDIR at its fresh directory; Bun reads BUN_TMPDIR first, so that must not survive.
    delete process.env.BUN_TMPDIR;
    const { runInPrivateTmp } = await import('./launcher');
    return runInPrivateTmp(async () => { dropLibraryOverrides(process.env); return main(); });
  }
  let plan: ReturnType<typeof cachePlan>;
  try {
    prepareHubCache(dir, o.trusted ?? await embeddedLibraries());
    plan = cachePlan(process.env, dir);
  } catch (e) {
    process.stderr.write(cacheStartError(e));
    process.exit(70);
  }
  if (plan.run) {
    dropLibraryOverrides(process.env);
    process.exit(await main());
  }
  // A compiled executable's argv[0] is the runtime's name and argv[1] its own path in the embedded file system: pass on
  // only the user's arguments.
  const argv = [process.execPath, ...process.argv.slice(2)];
  const execve = (process as unknown as { execve?: (file: string, args: string[], env: Record<string, string>) => never }).execve;
  if (typeof execve === 'function') {
    try { execve.call(process, process.execPath, argv, plan.env); } catch { /* not available here: a child instead */ }
  }
  const child = Bun.spawn({ cmd: argv, env: plan.env, stdio: ['inherit', 'inherit', 'inherit'] });
  const forward = (s: NodeJS.Signals) => () => { try { child.kill(s); } catch { /* already gone */ } };
  for (const s of ['SIGTERM', 'SIGHUP', 'SIGQUIT'] as const) process.on(s, forward(s));
  process.on('SIGINT', () => { /* the child gets it from the terminal */ });
  let code = await child.exited;
  if (child.signalCode) code = 128 + (os.constants.signals[child.signalCode as NodeJS.Signals] ?? 0);
  process.exit(code);
}
