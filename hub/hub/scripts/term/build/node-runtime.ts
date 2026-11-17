// `hoody hub` from the npm package: the same Hub under Node. `bun scripts/term/build.ts --runtime node` builds the ship
// bundle for Node (hub-term.js: the engine's Node build, which opens its native library through node:ffi), copies the
// engine's native library of each platform it is asked for beside it (libopentui-<platform>.so, checked against the
// engine package's own bytes) and bundles this module as hub-node.js, with the sha256 of every library written in.
// hub-node.js exports `hub`: what cli/hub-embed.ts HubEmbed asks for, so the CLI starts it exactly as a release
// binary's own Hub.
//
// The launcher of the release binary (hub-cache.ts) extracts a library embedded in the executable; here the library is
// a file of the installed package. So, in `load`, before the bundle is imported:
//  1. node:ffi must be there (Node 26: on by default, else `--experimental-ffi`; the CLI starts Node with it when it
//     can): without it, TERM_HUB_NODE_FFI;
//  2. this platform's library is opened ONCE, its bytes hashed through that descriptor and compared with the sha256
//     written into hub-node.js at build time (another file, a truncated download, another version, or a link:
//     TERM_HUB_NODE_LIBRARY), then opened through node:ffi once to prove this machine can run it (a musl system, a
//     foreign architecture: TERM_HUB_NODE_LIBRARY);
//  3. the engine's "load the library from this path" switches the caller set (OPENTUI_LIB_PATH, OTUI_ASSET_ROOT) are
//     dropped and OPENTUI_LIB_PATH is set to /proc/self/fd/<n>: what was hashed is what the engine maps. The
//     descriptor stays open for the life of the process. The engine reads the path when the bundle is imported;
//     hub-main.ts drops the variable again right after, so programs the Hub starts do not inherit it.
// Any of these throws from `load`: hub-command.ts answers "not available here" in one sentence, never a crash. A
// refusal after step 2 closes the descriptor again. There is no cache and no second start: `runInHubCache` runs `main`
// in this process.
// The pin is an integrity check (a damaged, truncated or swapped file), not a security boundary: whoever can write the
// package directory can change hub-term.js, which is imported unpinned, as well. The release binary's system library is
// held to the same rule. Node-only behaviour (node:ffi, the descriptor handed to the engine, the store lock, the
// `hoody logout` answer) is proven by build/node-runtime-proof.ts in a `node` child; a test cannot start one.
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as nodeModule from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertSafeAncestors, dropLibraryOverrides, hubCacheDir } from './hub-cache';
import { hubMain, type HubMainOptions } from './hub-main';
import { openAccountStore, readResume } from './hub-store-open';
import { systemTryLock, type TryLock } from './hub-store';
import { revokeKeptBootKeys, type LogoutKeys } from './hub-store-logout';
import { demoClient, DEMO_CONTEXT } from './demo-client';
import { nodeFfi, type NodeFfi } from './node-ffi';
import type { NativeManifest } from './node-files';

export class HubNodeError extends Error {
  constructor(readonly code: 'TERM_HUB_NODE_FFI' | 'TERM_HUB_NODE_PLATFORM' | 'TERM_HUB_NODE_LIBRARY', what: string) {
    super(`${code}: ${what}`);
    this.name = 'HubNodeError';
  }
}

/** This machine as the engine's native packages name it. */
export const nodePlatform = (): string => `${process.platform}-${process.arch}`;

/** Opens this platform's library in `dir` once and checks its bytes, read through that descriptor, against the
 *  manifest. Returns the path the engine is given (/proc/self/fd/<n>); the descriptor is left open. A link, a folder,
 *  a device or a FIFO is refused (opened non-blocking, so a FIFO cannot hold the start). */
export function openPinnedLibrary(dir: string, manifest: NativeManifest, platform: string = nodePlatform()): string {
  const want = manifest[platform];
  if (!want) throw new HubNodeError('TERM_HUB_NODE_PLATFORM', `this package carries no terminal Hub library for ${platform}`);
  if (process.platform !== 'linux') throw new HubNodeError('TERM_HUB_NODE_PLATFORM', `the terminal Hub library is opened through /proc, which ${process.platform} has not`);
  let fd: number;
  try {
    fd = fs.openSync(path.join(dir, want.file), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch {
    throw new HubNodeError('TERM_HUB_NODE_LIBRARY', `${want.file} cannot be opened (missing, or a link)`);
  }
  try {
    if (!fs.fstatSync(fd).isFile()) throw new HubNodeError('TERM_HUB_NODE_LIBRARY', `${want.file} is not a regular file`);
    const h = crypto.createHash('sha256');
    const buf = Buffer.alloc(1 << 20);
    for (let pos = 0; ;) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (n === 0) break;
      h.update(buf.subarray(0, n));
      pos += n;
    }
    if (h.digest('hex') !== want.sha256) throw new HubNodeError('TERM_HUB_NODE_LIBRARY', `${want.file} is not the library this package was built with`);
  } catch (e) {
    fs.closeSync(fd);
    throw e;
  }
  return `/proc/self/fd/${fd}`;
}

/** Opens `file` through node:ffi and closes it again: proves this machine can map it (libc, architecture). */
function probeLibrary(ffi: NodeFfi, file: string): void {
  let opened: { lib: unknown };
  try { opened = ffi.dlopen(file, {}); } catch {
    throw new HubNodeError('TERM_HUB_NODE_LIBRARY', `this machine cannot load the terminal Hub library for ${nodePlatform()}`);
  }
  try { ffi.dlclose(opened.lib); } catch { /* still mapped: the engine opens it again anyway */ }
}

/**
 * Where Node keeps its compiled code of hub-term.js between starts (module.enableCompileCache): `node-compile` in the
 * per-user cache directory (hub-cache.ts hubCacheDir), created 0700. Node loads compiled code from there without
 * checking who wrote it, so it is used only when it is a real directory of this user with mode 0700 (never repaired:
 * one that was ever open to others may hold planted files) and no directory above it can be changed by another user
 * (assertSafeAncestors, the rule of the release binary's library cache). Otherwise null: the start runs without the
 * code cache, only slower. Without it every start compiles the whole bundle again. Node's own switches still apply
 * (NODE_DISABLE_COMPILE_CACHE=1 turns it off; a NODE_COMPILE_CACHE the user set wins, as it does for every module).
 */
export function hubCompileCacheDir(env: Readonly<Record<string, string | undefined>>, o: { uid?: number; gid?: number } = {}): string | null {
  const base = hubCacheDir(env);
  if (base === null) return null;
  const dir = path.join(base, 'node-compile');
  const uid = o.uid ?? process.getuid?.() ?? -1;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || (uid >= 0 && st.uid !== uid) || (st.mode & 0o777) !== 0o700) return null;
    assertSafeAncestors(dir, uid, o.gid ?? process.getgid?.() ?? -1);
    return dir;
  } catch {
    return null;
  }
}

type ShipModule = Record<string, unknown>;

/** The npm package's Hub (cli/hub-embed.ts HubEmbed): `dir` holds hub-term.js and the libraries of `manifest`. `home`
 *  is where the account stores live (the user's home; a test passes its own). */
export function nodeHub(dir: string, manifest: NativeManifest, home: () => string = os.homedir) {
  let loaded: Promise<ShipModule> | null = null;
  const load = (): Promise<ShipModule> => (loaded ??= (async () => {
    const ffi = nodeFfi();
    if (!ffi) throw new HubNodeError('TERM_HUB_NODE_FFI', `node:ffi is not available in Node ${process.versions.node} (needs Node 26 or later, not started with --no-experimental-ffi)`);
    const file = openPinnedLibrary(dir, manifest);
    try {
      probeLibrary(ffi, file);
      dropLibraryOverrides(process.env);
      process.env.OPENTUI_LIB_PATH = file;
      // The bundle is several megabytes: with the code cache a later start does not compile it again.
      // (Node 22.8 and later have the call; this launcher is also imported by older ones, for `hoody logout`.)
      const cache = hubCompileCacheDir({ XDG_CACHE_HOME: process.env.XDG_CACHE_HOME, HOME: home() });
      if (cache !== null) { try { nodeModule.enableCompileCache?.(cache); } catch { /* no code cache: the start only takes longer */ } }
      return (await import(pathToFileURL(path.join(dir, 'hub-term.js')).href)) as ShipModule;
    } catch (e) {
      // Refused after the open: the descriptor and the path naming it go again.
      if (process.env.OPENTUI_LIB_PATH === file) delete process.env.OPENTUI_LIB_PATH;
      try { fs.closeSync(Number(file.slice('/proc/self/fd/'.length))); } catch { /* already closed */ }
      throw e;
    }
  })());
  return {
    launcher: async () => ({
      // Nothing is extracted: the library is a file of the package, opened in `load`. The caller's library switches
      // never reach the engine.
      runInHubCache: async (main: () => Promise<number>): Promise<number> => { dropLibraryOverrides(process.env); return main(); },
      hubMain: (o: HubMainOptions): Promise<number> => hubMain(o),
      // The account's local store, as the release binary's entry opens it (cli/hub-build-step.ts hubEntrySource).
      openStore: async (o: { apiOrigin: string; client: unknown }) => {
        let tryLock: TryLock;
        try { tryLock = await systemTryLock(); } catch { tryLock = () => false; }
        const uid = (o.client as { identity?: { uid?: unknown } } | null)?.identity?.uid;
        const store = openAccountStore({ home: home(), apiOrigin: o.apiOrigin, uid: typeof uid === 'string' ? uid : '', tryLock });
        let resume = {};
        try { resume = readResume(store.area); } catch { /* no place kept */ }
        return { store, resume, close: () => store.close() };
      },
      // `hoody logout`: the agent sign-in keys the Hub kept for the account, as the release binary's entry does
      // (cli/hub-build-step.ts hubEntrySource). Needs no engine and no node:ffi but for the lock: without a lock the
      // store is busy and nothing is sent.
      revokeBootKeysAtLogout: async (o: { apiOrigin: string; uid: string; revoke(id: string): Promise<'gone' | 'failed'> }): Promise<LogoutKeys> => {
        let tryLock: TryLock;
        try { tryLock = await systemTryLock(); } catch { tryLock = () => false; }
        return revokeKeptBootKeys({ home: home(), apiOrigin: o.apiOrigin, uid: o.uid, tryLock, revoke: o.revoke });
      },
      installSystemLibrary: async (): Promise<string[]> => {
        throw new HubNodeError('TERM_HUB_NODE_PLATFORM', 'the npm package installs no system library; the standalone hoody binary does (hoody hub --install-library)');
      },
    }),
    load,
    demo: async () => ({ client: demoClient(), context: { ...DEMO_CONTEXT } }),
  };
}
