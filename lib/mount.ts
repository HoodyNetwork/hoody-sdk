/**
 * `hoody-sdk/mount` — programmatic and CLI-facing module for
 * mounting Hoody computer filesystems locally via rclone+WebDAV.
 *
 * Architecture:
 *   - Resolves a kit URL: a caller-supplied raw URL, or a {@link ComputerLike}
 *     on the computers domain of the caller's API (`client.getKitUrl`, or
 *     `computersDomain`). No platform host is written in here.
 *   - Probes the mounted path with the supplied {@link ProxyAuth} ({@link probeKit},
 *     PROPFIND) before rclone starts, and reports the mount only once it is in the
 *     OS mount table.
 *   - Writes a 0600 rclone config at `~/.hoody/sdk/mounts/<id>.conf`
 *     containing the secret material (bearer_token / pass / headers). No
 *     credential ever goes on a command line, where every local user can read
 *     it (`ps`, /proc/<pid>/cmdline): the password reaches `rclone obscure` on
 *     stdin, and an rclone too old to take a credential from its config is
 *     refused ({@link refuseRcloneTooOldForAuth}).
 *   - Spawns `rclone mount hoody: <localPath>` with `--config <id>.conf`,
 *     foreground (default) or `--daemon` (background; Linux/macOS only).
 *   - Records the mount in `~/.hoody/sdk/mounts/<id>.json` via the
 *     {@link claimState} `wx` exclusive-create + reclaim probe.
 */

import { ChildProcess, spawn } from 'node:child_process';
import { type Dirent, promises as fs } from 'node:fs';
import { constants as osConstants, homedir, hostname, platform, userInfo } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { STATUS_CODES } from 'node:http';
import { promisify } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';

import { type ProxyAuth, credentialHeaderValue } from './proxy-auth.js';
import {
  RCLONE_INSTALL_HINT,
  type RcloneVersion,
  assertRcloneInstalled,
  detectRcloneVersion,
  formatVersion,
  isVersionAtLeast,
} from './rclone-local.js';
import {
  type AliveState,
  type MountStateFile,
  cacheDirPath,
  checkLiveness,
  claimState,
  computeMountId,
  configFilePath,
  deleteOwnState,
  ensureMountpointParent,
  findMountProcesses,
  getStateDir,
  isMountpointEmpty,
  isStarting,
  listStates,
  type MountLaunch,
  mountProcessIdentity,
  mountTableHas,
  processStartTime,
  pruneStale,
  readState,
  starterMarker,
  writeOwnState,
} from './mount-state.js';

const execFile = promisify(execFileCb);

/**
 * The oldest rclone that reads custom WebDAV headers from its config (`headers`): changelog
 * v1.56.0 (2021-07-20), "WebDAV: Add headers option". A token under a header other than
 * Authorization, and a computer claim, need it; an older rclone could take them only as
 * `--header` on its command line, so it is refused.
 */
export const RCLONE_HEADERS_MIN_VERSION: readonly [number, number] = [1, 56];

/**
 * The oldest rclone whose `rclone obscure -` reads the password from stdin: changelog v1.53.0
 * (2020-09-02), "Allow obscure command to accept password on STDIN". An older one obscures the
 * literal `-`.
 */
export const RCLONE_OBSCURE_STDIN_MIN_VERSION: readonly [number, number] = [1, 53];

export interface ComputerLike {
  // Every field is optional in the type and server / server_name flow through the index
  // signature, so the SDK's own computer responses (computers.get / create: `id?: string;
  // project_id?: string; server_name?: string | null`; a computers.list item: `server` an
  // object) are assignable unchanged. The mount helpers validate id + project_id + a
  // resolvable server at runtime before building a URL.
  id?: string;
  project_id?: string;
  [key: string]: unknown;
}

/** Anything that builds kit URLs for the caller's API: a `HoodyClient` or a computer-scoped client. */
export interface KitUrlSource {
  getKitUrl(kit: string, computer: ComputerLike, serviceIndex: number): string;
}

/**
 * A computer is reached on the computers domain of the API it belongs to, so the computer
 * form names that API: `client` (its `getKitUrl`) or `computersDomain` (e.g. the
 * `computers.<platform>` sibling of `api.<platform>`). One of the two is required.
 */
export type MountTarget =
  | { computer: ComputerLike; client: KitUrlSource; subpath?: string; serviceIndex?: number }
  | { computer: ComputerLike; computersDomain: string; subpath?: string; serviceIndex?: number }
  | { kitUrl: string; subpath?: string };

export interface MountOptionsBase {
  localPath: string;
  auth?: ProxyAuth;
  background?: boolean;
  readOnly?: boolean;
  noVfsCache?: boolean;
  extraRcloneArgs?: readonly string[];
  rclonePath?: string;
  /** Override of `~/`. For tests. */
  home?: string;
  /** stdout / stderr inheritance for foreground mode. */
  stdio?: 'inherit' | 'ignore' | 'pipe';
  /**
   * Check the kit with {@link probeKit} (a WebDAV PROPFIND of the mounted path, with `auth`)
   * before rclone starts, and refuse an unreachable kit, a refused credential or a missing path.
   * Default true. The probe is a plain fetch: turn it off when rclone reaches the kit through a
   * proxy that this process does not use.
   */
  probe?: boolean;
  /** How long to wait for the mount to appear in the OS mount table. Default 30 s. */
  readyTimeoutMs?: number;
  /** How long a foreground stop waits for pending uploads ({@link UnmountOptions.drainTimeoutMs}). */
  drainTimeoutMs?: number;
}

export type MountOptions = MountTarget & MountOptionsBase;

export interface MountHandle {
  id: string;
  pid: number | null;
  rclonePid: number | null;
  localPath: string;
  kitUrl: string;
  mode: 'foreground' | 'background';
  /** Resolves with the rclone exit code (foreground only). */
  wait(): Promise<number>;
  unmount(opts?: UnmountOptions): Promise<void>;
  /** Files that earlier mounts of this URL wrote and never uploaded, found when this mount started. */
  earlierUnsent: readonly EarlierUnsent[];
}

/** Files an earlier mount of the same URL wrote but never uploaded (it was stopped first). */
export interface EarlierUnsent {
  /** Where that mount was. */
  localPath: string;
  /** Relative to the mounted folder. */
  files: readonly string[];
  /**
   * true: this mount uploads them now (same URL and path, and it was given no `--cache-dir`).
   * false: a mount of the same URL at `localPath` that uses the cache they are in uploads them: the
   * default one (no `--cache-dir`) when `cacheDir` is absent, else `--cache-dir <cacheDir>`. Which
   * cache rclone uses when given `--cache-dir` is rclone's to decide, so that case is never `true`.
   */
  uploading: boolean;
  /** Set when the files are in a cache dir the caller gave (`--cache-dir`). */
  cacheDir?: string;
}

export interface UnmountOptions {
  /**
   * How long to wait for rclone to upload the files written to the mount, counted again each
   * time one of them is uploaded. Default {@link UNMOUNT_DRAIN_TIMEOUT_MS}.
   */
  drainTimeoutMs?: number;
  /** Unmount without waiting for pending uploads. What was not uploaded stays in the mount's cache. */
  force?: boolean;
  /** Called once when unmount has to wait for uploads, with the files it waits for. */
  onPending?: (files: readonly string[]) => void;
}

export interface MountListEntry {
  id: string;
  computerId: string;
  kitUrl: string;
  /** Subpath inside the computer that's been mounted (e.g. `home/user`). */
  subpath: string;
  localPath: string;
  mode: 'foreground' | 'background';
  pid: number | null;
  alive: AliveState;
  startedAt: string;
}

export interface ProbeResult {
  ok: boolean;
  status: number;
  davHeader?: string | undefined;
  needsAuth: boolean;
  detail?: string | undefined;
}

// ─── Public entry points ─────────────────────────────────────────────────

/**
 * List every recorded mount of this user with its current liveness (`alive`:
 * `'alive'`, `'stale'` or `'dead'`), checked against the process and the OS
 * mount table at call time. Removes nothing; see `pruneStaleMounts()`.
 * `home` overrides the home directory the records are kept under.
 */
export async function listMounts(home?: string): Promise<MountListEntry[]> {
  const records = await listStates(home);
  const out: MountListEntry[] = [];
  for (const r of records) {
    const liveness = await checkLiveness(r);
    out.push({
      id: r.id,
      computerId: r.computerId,
      kitUrl: r.kitUrl,
      subpath: r.subpath,
      localPath: r.localPath,
      mode: r.mode,
      pid: r.pid,
      alive: liveness.alive,
      startedAt: r.startedAt,
    });
  }
  return out;
}

/**
 * Remove the records (and rclone config files) of mounts that are no longer
 * alive. Resolves with `removed`, the dead records deleted, and `orphans`,
 * the config files deleted that had no record. A mount still starting counts
 * as alive and is kept.
 */
export async function pruneStaleMounts(home?: string): Promise<{ removed: number; orphans: number }> {
  return pruneStale(home);
}

/**
 * Ask the kit about `kitUrl` with `auth`: `OPTIONS` (default) answers whether the kit is there
 * and speaks WebDAV; `PROPFIND` (Depth 0) also answers whether the path exists (404).
 */
export async function probeKit(
  kitUrl: string,
  auth?: ProxyAuth,
  timeoutMs = 10000,
  method: 'OPTIONS' | 'PROPFIND' = 'OPTIONS',
): Promise<ProbeResult> {
  // The probe predicts the mount, and a mount cannot send a query-parameter token.
  if (auth?.type === 'token' && auth.param !== undefined) return { ok: false, status: 0, needsAuth: false, detail: QUERY_TOKEN_REFUSED };
  const headers: Record<string, string> = {};
  applyAuthToHeaders(headers, auth);
  if (method === 'PROPFIND') headers['depth'] = '0';
  const unsendable = unsendableHeadersDetail(headers);
  if (unsendable !== null) return { ok: false, status: 0, needsAuth: false, detail: unsendable };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Never follow a redirect: fetch strips only Authorization on a cross-origin hop,
    // so a kit token under another header name would reach the redirect's target.
    const res = await fetch(kitUrl, {
      method,
      headers,
      signal: controller.signal,
      redirect: 'manual',
    });
    // The kit's own text can quote the request's headers back: a detail names the status with the
    // standard phrase, never the server's reason phrase, and the DAV header is scrubbed.
    const davRaw = res.headers.get('dav');
    const dav = davRaw === null ? undefined : scrubAuth(davRaw, auth);
    const said = (): string => `${res.status}${STATUS_CODES[res.status] ? ` ${STATUS_CODES[res.status]}` : ''}`;
    if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { ok: false, status: res.status, davHeader: dav, needsAuth: false, detail: `redirect refused (${res.status}): the probe carries the kit credential and is sent only to ${kitUrl}` };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, davHeader: dav, needsAuth: true, detail: said() };
    }
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, status: res.status, davHeader: dav, needsAuth: false };
    }
    return { ok: false, status: res.status, davHeader: dav, needsAuth: false, detail: said() };
  } catch (err) {
    // fetch's messages can quote a header value, that is the credential: never pass one on.
    return { ok: false, status: 0, needsAuth: false, detail: scrubAuth((err as Error).message, auth) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve a kit URL from MountTarget. The full path the WebDAV remote
 * mounts is `<kit base URL>/<subpath>` (subpath stripped of leading
 * slashes and percent-encoded segment-by-segment).
 */
export function resolveKitUrl(target: MountTarget): { kitUrl: string; subpath: string; computerId: string } {
  const subpath = normalizeSubpath('subpath' in target ? target.subpath : undefined);
  if ('kitUrl' in target) {
    if (!/^https?:\/\//.test(target.kitUrl)) {
      throw new Error(`kitUrl must start with http:// or https:// (got ${JSON.stringify(target.kitUrl)})`);
    }
    return {
      kitUrl: stripTrailingSlash(target.kitUrl),
      subpath,
      computerId: extractComputerIdFromUrl(target.kitUrl),
    };
  }
  const c = target.computer;
  // server_name, else a hand-built string `server`. The server-details object on a
  // computers.list item carries a slice's display name, which is not a routing host.
  const server = typeof c.server_name === 'string' && c.server_name !== ''
    ? c.server_name
    : (typeof c.server === 'string' ? c.server : undefined);
  if (typeof c.id !== 'string' || !c.id || typeof c.project_id !== 'string' || !c.project_id || !server) {
    throw new Error('computer must include id, project_id, and server_name (or server)');
  }
  const idx = target.serviceIndex ?? 1;
  const client = 'client' in target ? target.client : undefined;
  const domain = 'computersDomain' in target ? target.computersDomain : undefined;
  if (client !== undefined && domain !== undefined) {
    throw new Error('pass client or computersDomain, not both');
  }
  let kitUrl: string;
  if (client !== undefined && client !== null && typeof client.getKitUrl === 'function') {
    kitUrl = stripTrailingSlash(client.getKitUrl('files', { id: c.id, project_id: c.project_id, server_name: server }, idx));
    if (!/^https?:\/\//.test(kitUrl)) {
      throw new Error(`client.getKitUrl returned ${JSON.stringify(kitUrl)}, not an http(s) URL`);
    }
  } else if (typeof domain === 'string' && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(domain)) {
    kitUrl = `https://${c.project_id}-${c.id}-files-${idx}.${server}.${domain.toLowerCase()}`;
  } else if (domain !== undefined) {
    throw new Error(`computersDomain must be a DNS name such as computers.example.com (got ${JSON.stringify(domain)})`);
  } else {
    throw new Error(
      'a computer target needs the API it belongs to: pass client (a HoodyClient) or computersDomain, ' +
        "or pass kitUrl (client.getKitUrl('files', computer))",
    );
  }
  return { kitUrl, subpath, computerId: c.id };
}

/**
 * Mount a folder of a computer at `opts.localPath` with rclone over WebDAV.
 * The target is a `computer` (with `client` or `computersDomain`) or a
 * `kitUrl`, optionally narrowed by `subpath`; `auth` is the credential the
 * computer's files program expects (default: none, access by IP rule).
 *
 * Resolves once the path is in the OS mount table. In the foreground
 * (default) rclone runs as a child of this process: `handle.wait()` resolves
 * with its exit code and `handle.unmount()` stops it. With `background:
 * true` rclone runs detached and outlives this process; stop it later with
 * `unmount()`. The mount is recorded under `~/.hoody/sdk/mounts` so
 * `listMounts()` and `unmount()` find it from any process.
 *
 * Throws before anything is started when rclone is missing or too old for
 * the credential, the mount point is not empty (on Windows: exists), the
 * path is already mounted, or the probe finds the files program
 * unreachable, the credential refused or the path missing. Throws when the
 * mount does not come up within `readyTimeoutMs`; what was started is then
 * stopped. `background` is not available on Windows. The credential is
 * written to a 0600 config file and never put on a command line.
 */
export async function mount(opts: MountOptions): Promise<MountHandle> {
  const { kitUrl, subpath, computerId } = resolveKitUrl(opts);
  const localPath = resolve(opts.localPath);
  refuseSafeSaveHeaders(opts.auth, opts.extraRcloneArgs);

  if (opts.background && platform() === 'win32') {
    throw new Error(
      '--background is not supported on Windows. WinFsp does not expose a daemonize flag. ' +
        'Run hoody mount in a separate terminal (foreground), or use Windows Task Scheduler.',
    );
  }

  await ensureMountpointParent(localPath);
  const empty = await isMountpointEmpty(localPath);
  if (!empty) {
    throw new Error(`mountpoint ${localPath} is not empty (rclone requires an empty directory)`);
  }

  if (platform() === 'win32') {
    // WinFsp mounts on a directory that does not exist yet and creates it itself; only the parent
    // is made here.
    if (await pathExists(localPath)) {
      throw new Error(`mountpoint ${localPath} exists: on Windows rclone creates the mount folder itself, so it must not exist yet (remove the empty folder, or pick a new path)`);
    }
  } else {
    await fs.mkdir(localPath, { recursive: true, mode: 0o700 }).catch(() => undefined);
  }

  const rclonePath = opts.rclonePath ?? 'rclone';
  await assertRcloneInstalled(rclonePath);
  const rcloneVersion = await detectRcloneVersion(rclonePath);
  const supportsHeadersConfig = isVersionAtLeast(rcloneVersion, RCLONE_HEADERS_MIN_VERSION);

  const id = computeMountId(localPath, userInfo().uid);
  const url = subpath ? `${kitUrl}/${subpath}` : kitUrl;
  const auth = opts.auth ?? { type: 'ip' as const };
  // Before the probe: its fetch would refuse such a credential with a message that quotes it.
  assertAuthSendable(auth);
  refuseRcloneTooOldForAuth(auth, rcloneVersion, rclonePath);
  if (opts.probe !== false) await assertKitAnswers(url, subpath, auth);

  const { configBody, authMethod } = await buildAuthDelivery({
    auth,
    url,
    rclonePath,
    supportsHeadersConfig,
  });

  await fs.mkdir(getStateDir(opts.home), { recursive: true, mode: 0o700 });
  const confPath = configFilePath(id, opts.home);
  const defaultCacheDir = cacheDirPath(id, url, opts.home);
  await fs.mkdir(defaultCacheDir, { recursive: true, mode: 0o700 });
  // Where rclone may queue uploads: unmount waits on what these directories hold.
  const cache = mountCache(defaultCacheDir, opts.extraRcloneArgs);

  const record: MountStateFile = {
    id,
    version: 1,
    computerId,
    kitUrl: url,
    subpath,
    localPath,
    mode: opts.background ? 'background' : 'foreground',
    pid: null,
    rclonePid: null,
    auth: { method: authMethod },
    startedAt: new Date().toISOString(),
    platform: platform(),
    cacheDirs: [...cache.dirs],
    // Until the pid is known the record is alive while this process runs: no other mount of
    // the path takes it over and prune leaves it.
    starter: await starterMarker(),
    // Every later rewrite and removal of the record is made only while it still holds this token.
    claimToken: randomBytes(8).toString('hex'),
    rclonePath,
  };
  // The claim also refuses a path that is a mount point already: whatever appears in the mount
  // table at it from here on is this mount's, and its stop unmounts it.
  await claimState(record, opts.home);
  const earlierUnsent = await unsentFromEarlierMounts(url, localPath, id, cache, opts.home).catch(() => []);
  // Lets a later mount of this URL at another path find what this one leaves unsent.
  await fs.writeFile(join(defaultCacheDir, CACHE_OWNER_FILE), JSON.stringify({ kitUrl: url, localPath }), { mode: 0o600 }).catch(() => undefined);

  try {
    await fs.writeFile(confPath, configBody, { mode: 0o600 });
  } catch (err) {
    await forgetFailedMount(record, opts.home);
    throw err;
  }

  const args = [
    'mount',
    'hoody:',
    localPath,
    '--config',
    confPath,
    '--cache-dir',
    defaultCacheDir,
    ...syncArgs(opts.noVfsCache === true),
    ...(opts.readOnly ? ['--read-only'] : []),
    ...safeSaveHeaderArgs(),
    ...(opts.extraRcloneArgs ?? []),
  ];

  const env = { ...process.env };
  delete env.RCLONE_WEBDAV_USER;
  delete env.RCLONE_WEBDAV_PASS;
  delete env.RCLONE_WEBDAV_BEARER_TOKEN;
  delete env.RCLONE_WEBDAV_HEADERS;

  if (opts.background) {
    args.push('--daemon', '--daemon-timeout', '10m');
    let child: ChildProcess;
    try {
      child = spawn(rclonePath, args, {
        detached: true,
        stdio: 'ignore',
        env,
      });
    } catch (err) {
      await forgetFailedMount(record, opts.home);
      throw err;
    }
    child.unref();

    let parentExit: number | null = null;
    // A spawn that fails (rclone not found, not executable) is an 'error' event, never an exit.
    const spawnFailure: { err?: Error } = {};
    await new Promise<void>((res) => {
      const t = setTimeout(() => res(), 12000);
      child.once('exit', (code) => {
        parentExit = code ?? -1;
        clearTimeout(t);
        res();
      });
      child.on('error', (err) => {
        // Only a failed spawn ends the wait; a failed kill of the running parent is no exit.
        if (child.pid !== undefined || spawnFailure.err) return;
        spawnFailure.err = err;
        clearTimeout(t);
        res();
      });
    });

    if (spawnFailure.err) {
      await forgetFailedMount(record, opts.home);
      throw new Error(`could not start rclone (${spawnFailure.err.message}) — mount failed`);
    }
    if (parentExit !== 0 && parentExit !== null) {
      await forgetFailedMount(record, opts.home);
      throw new Error(`rclone --daemon parent exited with code ${parentExit} — mount failed`);
    }

    // The daemon is the rclone mount of this path other than the parent, which carries the
    // same command line until it exits.
    const parentPid = child.pid;
    // Only the rclone started here: this binary, mounting this path with this mount's config.
    const launch: MountLaunch = { binary: rclonePath, confPath };
    // Each daemon pid is recorded with its start time when found, and signalled only while it is
    // still that process: the waits below take seconds, and the daemon may end meanwhile.
    const startOf = new Map<number, string | null>();
    const discover = async (ms: number): Promise<number | null> => {
      const pid = await pollDaemonPid(localPath, ms, parentPid, launch);
      if (pid !== null && !startOf.has(pid)) startOf.set(pid, await processStartTime(pid));
      return pid;
    };
    const stopDaemon = async (pid: number): Promise<void> => {
      if ((await mountProcessIdentity(pid, localPath, startOf.get(pid), launch)) !== 'same') return;
      try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ }
    };
    let daemonPid = await discover(15000);
    const ready = await waitUntilMounted(localPath, null, opts.readyTimeoutMs ?? 30000);
    if (ready === true && daemonPid === null) daemonPid = await discover(5000);
    if (ready !== true || daemonPid === null) {
      // Stop everything this call started (the parent, if its wait ran out, and the daemon,
      // looked for again when it was not found), then undo a mount that came up meanwhile.
      // The record goes only once the path is known not to be mounted. A mount with no daemon
      // pid is undone too: nothing could stop its rclone later.
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
      }
      const daemon = daemonPid ?? (await discover(3000));
      if (daemon !== null) await stopDaemon(daemon);
      const reason = ready === true
        ? `rclone mounted ${localPath}, but its daemon process could not be found, so the mount could not be stopped later; it was unmounted`
        : `rclone did not mount ${localPath}: ${ready === 'unreadable' ? 'the OS mount table could not be read' : 'it is not in the OS mount table'} (daemon ${daemon === null ? 'not found' : `pid ${daemon} stopped`})`;
      try {
        await detachMountpoint(localPath, null);
      } catch (err) {
        record.pid = daemon;
        record.rclonePid = daemon;
        record.pidStart = daemon === null ? null : (startOf.get(daemon) ?? null);
        await writeOwnState(record, opts.home).catch(() => false);
        const how = ready === true ? 'it could not be unmounted' : ready === 'unreadable' ? 'it could not be confirmed unmounted' : 'it then appeared and could not be unmounted';
        throw new Error(`${ready === true ? reason.replace(/; it was unmounted$/, '') : reason}; ${how} (${(err as Error).message}); its record is kept`);
      }
      await forgetFailedMount(record, opts.home);
      throw new Error(reason);
    }
    record.pid = daemonPid;
    record.rclonePid = daemonPid;
    record.pidStart = startOf.get(daemonPid) ?? null;
    const notKept = await writeOwnState(record, opts.home).then((kept) => (kept ? null : 'removed' as const), (err: Error) => err);
    if (notKept !== null) {
      // Nothing would find this rclone later: it is stopped (and unmounts what it mounted).
      await stopDaemon(daemonPid);
      if (notKept === 'removed') {
        // The path may be another mount's by now: only this rclone is stopped, and only a .conf
        // no record claims is removed.
        await forgetFailedMount(record, opts.home);
        throw new Error(`could not record the mount at ${localPath}: ${LOST_CLAIM}, so its rclone was stopped`);
      }
      await detachMountpoint(localPath, null).catch(() => undefined);
      await forgetFailedMount(record, opts.home);
      throw new Error(`could not record the mount at ${localPath}: ${notKept.message}; its rclone was stopped and the mount undone`);
    }

    return {
      id,
      pid: daemonPid,
      rclonePid: daemonPid,
      localPath,
      kitUrl: url,
      mode: 'background',
      earlierUnsent,
      wait: () => Promise.resolve(0),
      unmount: (o?: UnmountOptions) => unmountById(id, opts.home, { ...(opts.drainTimeoutMs !== undefined && { drainTimeoutMs: opts.drainTimeoutMs }), ...o }),
    };
  }

  let child: ChildProcess;
  try {
    child = spawn(rclonePath, args, {
      stdio: opts.stdio ?? 'inherit',
      env,
      // Its own process group: a Ctrl-C at the terminal reaches only this process, whose stop
      // waits for pending uploads before it stops rclone. rclone stops at once on a signal and
      // leaves them unsent. Windows has no process groups to leave; detached
      // there opens a new console.
      detached: process.platform !== 'win32',
    });
  } catch (err) {
    await forgetFailedMount(record, opts.home);
    throw err;
  }
  // Listen at once: an rclone that exits during the awaits below would otherwise go unseen. A
  // spawn that fails (rclone not found, not executable) is an 'error' event with no exit; with
  // no listener it would be thrown as an uncaught error.
  const spawnFailure: { err?: Error } = {};
  const childExit = new Promise<number>((res) => {
    child.once('exit', (code) => res(code ?? -1));
    child.on('error', (err) => {
      // A failed kill of a running rclone is no exit; only a failed spawn (no pid) is.
      if (child.pid !== undefined || spawnFailure.err) return;
      spawnFailure.err = err;
      res(-1);
    });
  });

  const childPid = child.pid ?? null;
  record.pid = childPid;
  record.rclonePid = childPid;
  const recordWrite = (async () => {
    if (childPid !== null) record.pidStart = await processStartTime(childPid);
    return writeOwnState(record, opts.home);
  })();
  const recordWritten = recordWrite.then(() => undefined, () => undefined);
  // Set once this mount's rclone is seen in the OS mount table: from then on the mount point is
  // this mount's to unmount. Before, a stop unmounts it only while this rclone runs.
  let seenMounted = false;
  // The stop and the signal handler exist before the first await after spawn, so a signal from
  // here on stops this rclone; the stop waits for the record write so it never outlives it.
  const stop = makeForegroundStop(child, record, opts.home, localPath, recordWritten, {
    cache,
    kitUrl: url,
    drainTimeoutMs: opts.drainTimeoutMs,
    seenMounted: () => seenMounted,
    spawnFailed: () => spawnFailure.err !== undefined,
  });
  // A stop a signal started that failed rejects wait(), so the caller learns the mount was left.
  let rejectSignalStop!: (err: unknown) => void;
  const signalStopFailed = new Promise<never>((_, reject) => { rejectSignalStop = reject; });
  signalStopFailed.catch(() => undefined); // reported through wait(); never an unhandled rejection
  const signalHandler = installSignalHandlers(stop, localPath, rejectSignalStop);
  // rclone may end on its own (a crash, a signal from the terminal); its mount can outlive it.
  // wait() rejects when the mount point could not be unmounted afterwards.
  const exited = childExit.then(async (code) => {
    try {
      await stop();
    } finally {
      uninstallSignalHandlers(signalHandler);
    }
    return code;
  });
  exited.catch(() => undefined); // reported through wait(); never an unhandled rejection
  const waitResult = Promise.race([exited, signalStopFailed]);
  waitResult.catch(() => undefined);
  let kept: boolean;
  try {
    kept = await recordWrite;
  } catch (err) {
    // No record of this rclone exists: never leave it running, even when its mount is busy
    // (the record claimState made stays, so a later unmount still finds the path).
    await stop().catch(() => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    });
    throw err;
  }
  if (!kept) {
    // The record was removed (or the path claimed again) while this rclone started: the path
    // may be another mount's now, so only this rclone is stopped (it unmounts what it mounted)
    // and the mount point is left alone.
    uninstallSignalHandlers(signalHandler);
    try { child.kill('SIGTERM'); } catch { /* ignore */ }
    await forgetFailedMount(record, opts.home);
    throw new Error(`could not record the mount at ${localPath}: ${LOST_CLAIM}, so its rclone was stopped`);
  }
  // Report the mount only once it is there: rclone that fails (bad config, no FUSE) exits, and
  // one that never mounts is stopped. Its own messages are on the inherited stderr.
  let childCode: number | null = null;
  void childExit.then((code) => { childCode = code; });
  const ready = await waitUntilMounted(localPath, () => childCode !== null, opts.readyTimeoutMs ?? 30000);
  seenMounted = ready === true;
  if (ready !== true) {
    const reason = spawnFailure.err
      ? `could not start rclone (${spawnFailure.err.message})`
      : childCode !== null
        ? `rclone exited with code ${childCode} before ${localPath} was mounted`
        : ready === 'unreadable'
          ? `could not confirm ${localPath} was mounted: the OS mount table could not be read; rclone was stopped`
          : `rclone did not mount ${localPath} within ${Math.round((opts.readyTimeoutMs ?? 30000) / 1000)} s; it was stopped`;
    const stopFailure = await stop().then(() => null, (err: unknown) => {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
      return err as Error;
    });
    throw new Error(stopFailure ? `${reason}; ${stopFailure.message}` : reason);
  }

  return {
    id,
    pid: childPid,
    rclonePid: childPid,
    localPath,
    kitUrl: url,
    mode: 'foreground',
    earlierUnsent,
    wait: () => waitResult,
    unmount: (o?: UnmountOptions) => stop(o),
  };
}

/**
 * Unmount the mount with record `id`: wait for its uploads, unmount the path, stop its rclone,
 * remove its record.
 *
 * Known limit (accepted): two unmounts of one mount at once are not coordinated. If the second
 * finishes while the first waits for uploads, and a new mount claims the path in between, the
 * first then runs the unmount command on the path and unmounts the new mount. Its record
 * survives (the removal is conditional), its rclone is never signalled (the pid check fails),
 * and the record is cleaned up later as dead. All three steps are commands of the same user.
 */
export async function unmountById(id: string, home?: string, opts: UnmountOptions = {}): Promise<void> {
  let rec: MountStateFile;
  try {
    rec = await readState(id, home);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`no mount found with id ${id}`);
    }
    throw err;
  }
  // A mount still starting belongs to the process starting it until it records its rclone:
  // removing its record now would leave that rclone running with nothing to find it by.
  if (await isStarting(rec)) {
    throw new Error(
      `the mount at ${rec.localPath} is still starting (process ${rec.starter!.pid}): unmount it once it has started, or stop that process`,
    );
  }
  const pid = rec.pid;
  // The recorded pid is signalled only while it is still this mount's rclone (same start time,
  // the rclone mount of this path with this mount's config): after rclone died the OS may have
  // given it to another process. Windows can tell neither, so there the record is trusted.
  // Checked again right before every signal: the upload wait and the unmount take time, and
  // rclone may end (and its pid be reused) meanwhile.
  const launch: MountLaunch = { ...(rec.rclonePath !== undefined && { binary: rec.rclonePath }), confPath: configFilePath(id, home) };
  const stillOurs = async (): Promise<number | null> => {
    if (pid === null) return null;
    const identity = await mountProcessIdentity(pid, rec.localPath, rec.pidStart, launch);
    return identity === 'same' || (identity === 'unknown' && process.platform === 'win32') ? pid : null;
  };
  const signalIfOurs = async (): Promise<number | null> => {
    const own = await stillOurs();
    if (own !== null) signalPid(own);
    return own;
  };
  const ownPid = await stillOurs();
  const defaultCacheDir = cacheDirPath(id, rec.kitUrl, home);
  const cache: MountCache = { defaultDir: defaultCacheDir, dirs: rec.cacheDirs ?? [defaultCacheDir] };
  if (!opts.force) {
    await drainUploads(cache, rec.localPath, rec.kitUrl, () => pid === null || (ownPid !== null && pidAlive(ownPid)), opts);
  }
  // Then unmount: on a busy mount this throws and leaves rclone and the record in place,
  // so the mount keeps working and a later unmount still finds it.
  await detachMountpoint(rec.localPath, ownPid === null ? null : async () => { await signalIfOurs(); });
  if (ownPid !== null) {
    const signalled = await signalIfOurs();
    if (signalled !== null) await waitUntil(() => !pidAlive(signalled), RCLONE_EXIT_WAIT_MS);
  }
  // Only this record: a mount that claimed the path since keeps its own.
  await deleteOwnState(rec, home);
  await assertNothingLeftUnsent(cache, rec.localPath, rec.kitUrl);
}

/**
 * Unmount one recorded mount, named by its 16-hex mount id or its local
 * path (an id is tried first; a folder with such a name still works as a
 * path). Waits for files written to the mount to finish uploading unless
 * `opts.force` is set, then unmounts, stops rclone and removes the record.
 *
 * Throws an Error when no mount matches, and `PendingUploadsError` when
 * files are still unsent. A busy mount point throws and leaves the mount
 * and its record in place, so a later call can retry.
 */
export async function unmount(idOrPath: string, home?: string, opts?: UnmountOptions): Promise<void> {
  // A mount id wins; a name that only looks like one (a folder called 0123456789abcdef) is a path.
  if (/^[a-f0-9]{16}$/.test(idOrPath)) {
    try {
      await readState(idOrPath, home);
      return unmountById(idOrPath, home, opts);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  const localPath = resolve(idOrPath);
  const id = computeMountId(localPath, userInfo().uid);
  try {
    await readState(id, home);
    return unmountById(id, home, opts);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const records = await listStates(home);
  const match = records.find((r) => resolve(r.localPath) === localPath);
  if (!match) throw new Error(`no mount found for ${idOrPath}`);
  return unmountById(match.id, home, opts);
}

/** Thrown by {@link unmountAll} / {@link unmountByComputer} when a mount could not be unmounted. */
export class UnmountError extends Error {
  constructor(
    /** How many mounts were unmounted. */
    readonly unmounted: number,
    /** `mounted`: whether the path is still mounted (false: unmounted, with files left unsent). */
    readonly failures: ReadonlyArray<{ id: string; localPath: string; message: string; mounted: boolean }>,
  ) {
    super(
      `unmounted ${unmounted} mount(s); ${failures.length} failed:\n` +
        failures.map((f) => `  ${f.localPath}: ${f.message}`).join('\n'),
    );
    this.name = 'UnmountError';
  }
}

/**
 * Thrown by unmount when files written to the mount have not reached the computer. With
 * `mounted` true the wait for them ran out and the mount and its record are kept (rclone goes on
 * uploading; unmount again later). With `mounted` false the path is unmounted and the files are
 * left in the mount's cache, which a mount of the same URL at the same path uploads.
 */
export class PendingUploadsError extends Error {
  constructor(
    message: string,
    readonly localPath: string,
    /** The files, relative to the mounted folder. */
    readonly files: readonly string[],
    readonly mounted: boolean,
  ) {
    super(message);
    this.name = 'PendingUploadsError';
  }
}

/** Throw a clear error unless the kit answers a PROPFIND of `url` with `auth`. */
async function assertKitAnswers(url: string, subpath: string, auth: ProxyAuth): Promise<void> {
  const probe = await probeKit(url, auth, 10000, 'PROPFIND');
  if (probe.ok) return;
  if (probe.status === 0) {
    throw new Error(`cannot reach the files kit at ${url}: ${probe.detail ?? 'no answer'} (if rclone reaches it through a proxy this process does not use, skip the check: --no-probe / probe: false)`);
  }
  if (probe.needsAuth) {
    throw new Error(`the files kit refused the request (${probe.detail}): pass the credential its permission rule expects (--auth-token-file / --auth-password-file; SDK: auth)`);
  }
  if (probe.status === 404) {
    throw new Error(`/${decodeURIComponent(subpath)} does not exist in the computer (404 from the files kit)`);
  }
  throw new Error(`the files kit at ${url} answered ${probe.detail ?? probe.status}`);
}

/**
 * Wait until `localPath` is in the OS mount table. False on timeout or when `gaveUp()` says the
 * mounter is gone, 'unreadable' when the table could not be read by then (Linux, macOS); true
 * at once on Windows, which has no table to read and where nothing can tell.
 */
async function waitUntilMounted(localPath: string, gaveUp: (() => boolean) | null, timeoutMs: number): Promise<boolean | 'unreadable'> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mounted = await mountTableHas(localPath);
    if (mounted === true || (mounted === null && process.platform === 'win32')) return true;
    if ((gaveUp && gaveUp()) || Date.now() >= deadline) return mounted === null ? 'unreadable' : false;
    await sleep(200);
  }
}

async function unmountRecords(records: readonly MountStateFile[], home?: string, opts?: UnmountOptions): Promise<number> {
  let count = 0;
  const failures: Array<UnmountError['failures'][number]> = [];
  for (const r of records) {
    try {
      await unmountById(r.id, home, opts);
      count++;
    } catch (err) {
      // A record another process removed meanwhile is not a failure.
      if (/^no mount found/.test((err as Error).message)) continue;
      // Unmounted with files left unsent: counted as unmounted, and still a failure.
      const mounted = !(err instanceof PendingUploadsError && !err.mounted);
      if (!mounted) count++;
      failures.push({ id: r.id, localPath: r.localPath, message: (err as Error).message, mounted });
    }
  }
  if (failures.length > 0) throw new UnmountError(count, failures);
  return count;
}

/** Unmount every record; throws {@link UnmountError} after trying them all if any failed. */
export async function unmountAll(home?: string, opts?: UnmountOptions): Promise<number> {
  return unmountRecords(await listStates(home), home, opts);
}

/**
 * Unmount every recorded mount of the computer `computerId`. Resolves with
 * how many were unmounted (0 when it has none); throws `UnmountError` after
 * trying them all if any failed.
 */
export async function unmountByComputer(computerId: string, home?: string, opts?: UnmountOptions): Promise<number> {
  const records = await listStates(home);
  return unmountRecords(records.filter((x) => x.computerId === computerId), home, opts);
}

// ─── Internals ───────────────────────────────────────────────────────────

/**
 * How long a mount trusts its own directory listing, and how long a file must stay closed and
 * idle before its upload starts. rclone's defaults (5 min, 5 s) left another machine's (or the
 * computer's) changes and deletes invisible for up to 5 min, and served a file the box had
 * rewritten cut to the size the stale listing recorded. A change that has landed now shows at
 * the next lookup after MOUNT_DIR_CACHE_TIME (plus rclone's 1 s attribute cache); a handle
 * that is already open can keep its old view.
 *
 * This bounds staleness; it is not a lock. rclone's WebDAV client uploads a whole file once it
 * has been closed and idle, with an unconditional PUT (no rclone flag adds If-Match), so with
 * two writers to one file the last upload lands at the name; what it replaced is kept by the kit
 * as a conflict copy when this mount had never received it (safe save, `safeSaveHeaderArgs`). The cost is one
 * PROPFIND per directory still in use each time its listing expires (on demand, not polled).
 * A later `--extra` value of either flag wins, since rclone keeps the last one given.
 */
export const MOUNT_DIR_CACHE_TIME = '5s';
export const MOUNT_WRITE_BACK = '1s';

/** How long unmount waits for pending uploads, counted again each time one finishes. */
export const UNMOUNT_DRAIN_TIMEOUT_MS = 60_000;
const RCLONE_EXIT_WAIT_MS = 10_000;

/**
 * Where a mount's rclone may queue uploads: the cache dir `mount()` passes, plus every
 * `--cache-dir` value in the caller's extra args. Which of those rclone really uses would take
 * rclone's own flag table to tell (`--exclude --cache-dir=x` is an exclude pattern), so unmount
 * looks in all of them; a dir that is not rclone's holds no cache records.
 */
interface MountCache {
  defaultDir: string;
  dirs: readonly string[];
  /** The caller's args hold a `--cache-dir` (even one naming the default dir). */
  given?: boolean;
}

function mountCache(defaultDir: string, extraRcloneArgs: readonly string[] = []): MountCache {
  const dirs = [defaultDir];
  let given = false;
  for (let i = 0; i < extraRcloneArgs.length; i++) {
    const m = /^--cache-dir(?:=(.*))?$/s.exec(extraRcloneArgs[i]!);
    if (m) given = true;
    const value = m ? (m[1] ?? extraRcloneArgs[i + 1]) : undefined;
    if (value !== undefined && value !== '' && !dirs.includes(resolve(value))) dirs.push(resolve(value));
  }
  return { defaultDir, dirs, given };
}

interface PendingUpload {
  cacheDir: string;
  /** Relative to the mounted folder. */
  file: string;
}

/**
 * The files rclone's caches hold as written but not yet uploaded. rclone keeps a JSON record per
 * cached file at <cache dir>/vfsMeta/<remote>/<path> and sets "Dirty" in it until the upload has
 * succeeded; a record that cannot be parsed (rclone is rewriting it) counts as pending.
 */
async function pendingUploads(cache: MountCache): Promise<PendingUpload[]> {
  const out: PendingUpload[] = [];
  for (const cacheDir of cache.dirs) {
    const root = join(cacheDir, 'vfsMeta');
    const walk = async (dir: string): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'ENOTDIR') return;
        throw err;
      }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) {
          await walk(p);
          continue;
        }
        let raw: string;
        try {
          raw = await fs.readFile(p, 'utf-8');
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // expired meanwhile
          throw err;
        }
        let dirty = true;
        try {
          dirty = (JSON.parse(raw) as { Dirty?: unknown }).Dirty === true;
        } catch { /* half-written: still pending */ }
        // Named relative to the mounted folder: drop the remote's own directory (`hoody`).
        if (dirty) out.push({ cacheDir, file: relative(root, p).split(sep).slice(1).join('/') });
      }
    };
    await walk(root);
  }
  return out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

function describeFiles(pending: readonly PendingUpload[]): string {
  const shown = pending.slice(0, 5).map((p) => p.file).join(', ');
  const more = pending.length > 5 ? ` and ${pending.length - 5} more` : '';
  return `${pending.length} file(s) (${shown}${more})`;
}

/**
 * The mount that uploads the files: the same URL, path and, when the caller gave one, cache dir.
 * The default cache dir is not named (an internal location, kept per URL and path).
 */
function whereKept(pending: readonly PendingUpload[], cache: MountCache, kitUrl: string, localPath: string): string {
  const custom = pending.map((p) => p.cacheDir).find((d) => d !== cache.defaultDir);
  const sameCache = custom === undefined
    ? ''
    : ` with the same cache dir (hoody mount --extra --cache-dir ${custom}; SDK: extraRcloneArgs: ['--cache-dir', '${custom}'])`;
  return `they are kept on this machine until ${kitUrl} is mounted at ${localPath} again${sameCache}, which uploads them`;
}

/**
 * rclone uploads a closed file only after MOUNT_WRITE_BACK, and stopping it (a
 * signal, or an unmount) leaves what is still queued unsent, while unmount reported success.
 * Wait until its cache holds nothing unsent while rclone runs; when the wait runs out with no
 * upload finishing, throw and leave the mount up so rclone can finish and a retry works.
 */
async function drainUploads(
  cache: MountCache,
  localPath: string,
  kitUrl: string,
  rcloneRunning: () => boolean,
  opts: { drainTimeoutMs?: number | undefined; onPending?: ((files: readonly string[]) => void) | undefined },
): Promise<void> {
  // An rclone that is gone uploads nothing: the check after the stop reports what it left.
  if (!rcloneRunning()) return;
  const timeoutMs = opts.drainTimeoutMs ?? UNMOUNT_DRAIN_TIMEOUT_MS;
  const key = (p: PendingUpload): string => `${p.cacheDir}\0${p.file}`;
  let pending = await pendingUploads(cache);
  let deadline = Date.now() + timeoutMs;
  if (pending.length > 0 && rcloneRunning()) opts.onPending?.(pending.map((p) => p.file));
  while (pending.length > 0 && rcloneRunning()) {
    if (Date.now() >= deadline) {
      throw new PendingUploadsError(
        `${describeFiles(pending)} written to ${localPath} not uploaded yet: no upload finished in ${Math.round(timeoutMs / 1000)} s. ` +
          `The mount is kept so they can finish; unmount again later, or force it (hoody unmount --force; SDK: force: true) ` +
          `to stop now: ${whereKept(pending, cache, kitUrl, localPath)}`,
        localPath,
        pending.map((p) => p.file),
        true,
      );
    }
    await sleep(250);
    const next = await pendingUploads(cache);
    const nextKeys = new Set(next.map(key));
    if (pending.some((p) => !nextKeys.has(key(p)))) deadline = Date.now() + timeoutMs;
    pending = next;
  }
}

/** After rclone stopped: throw when its cache still holds files it never uploaded. */
async function assertNothingLeftUnsent(cache: MountCache, localPath: string, kitUrl: string): Promise<void> {
  const left = await pendingUploads(cache);
  if (left.length === 0) return;
  throw new PendingUploadsError(
    `${localPath} is unmounted, but ${describeFiles(left)} written to it did not reach the computer; ` +
      whereKept(left, cache, kitUrl, localPath),
    localPath,
    left.map((p) => p.file),
    false,
  );
}

/** Written into a mount's own cache dir: which URL and path it belongs to (rclone keeps only vfs/ and vfsMeta/ there). */
const CACHE_OWNER_FILE = 'hoody-mount.json';

/**
 * What earlier mounts of `kitUrl` left unsent. rclone uploads what its own cache holds as it
 * starts. With no `--cache-dir` given that is this path's default cache, so its files are being
 * uploaded. With one given, which dir rclone takes depends on how rclone reads the whole argument
 * list, so each of this path's caches is reported with the dir it is in and no upload is promised.
 * Files in another path's default cache (found by its owner file, checked against this user's
 * cache key for that path) are uploaded only by a mount at that path. A cache a mount record still holds (a running mount) is not looked
 * at. A report only: the caller ignores a failure.
 */
async function unsentFromEarlierMounts(kitUrl: string, localPath: string, id: string, own: MountCache, home?: string): Promise<EarlierUnsent[]> {
  const out: EarlierUnsent[] = [];
  const files = async (dir: string): Promise<string[]> =>
    (await pendingUploads({ defaultDir: dir, dirs: [dir] }).catch(() => [])).map((p) => p.file);
  const custom = own.dirs.filter((d) => d !== own.defaultDir);
  const ownDefault = await files(own.defaultDir);
  if (ownDefault.length > 0) out.push({ localPath, files: ownDefault, uploading: own.given !== true });
  for (const dir of custom) {
    const left = await files(dir);
    if (left.length > 0) out.push({ localPath, files: left, uploading: false, cacheDir: dir });
  }
  const root = join(getStateDir(home), 'cache');
  let names: string[];
  try {
    names = await fs.readdir(root);
  } catch {
    return out;
  }
  const held = new Set<string>();
  for (const r of await listStates(home).catch(() => [])) {
    for (const d of r.cacheDirs ?? [cacheDirPath(r.id, r.kitUrl, home)]) held.add(d);
  }
  for (const name of names.sort()) {
    const dir = join(root, name);
    if (own.dirs.includes(dir) || held.has(dir)) continue;
    let owner: unknown;
    try {
      owner = JSON.parse(await fs.readFile(join(dir, CACHE_OWNER_FILE), 'utf-8'));
    } catch {
      continue;
    }
    const other = owner !== null && typeof owner === 'object' ? (owner as { kitUrl?: unknown; localPath?: unknown }).localPath : undefined;
    if ((owner as { kitUrl?: unknown } | null)?.kitUrl !== kitUrl || typeof other !== 'string') continue;
    // Only a cache that a mount of this URL at that path would use: this user's key for it.
    const otherId = computeMountId(other, userInfo().uid);
    if (otherId === id || cacheDirPath(otherId, kitUrl, home) !== dir) continue;
    const left = await files(dir);
    if (left.length > 0) out.push({ localPath: other, files: left, uploading: false });
  }
  return out;
}

function signalPid(pid: number): void {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // pid may be gone
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function waitUntil(done: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done() && Date.now() < deadline) await sleep(100);
}

/**
 * Safe save: the headers that name this mount to the files kit. The kit keeps, per session,
 * which versions this mount has received (a download, or its own upload); an upload or delete
 * from the mount over a version it never received keeps that version as a conflict copy beside
 * the file (`name (conflict <label> <time>).ext`) instead of losing it. The session is new on
 * every mount start, so a restarted mount knows nothing yet and only makes extra copies. The
 * label is this machine's short host name, as the copy's name shows it. `--header` is rclone's
 * global flag, so every auth method gets both; a kit without safe save ignores them.
 */
export function safeSaveHeaderArgs(host: string = hostname()): string[] {
  const label = mountLabel(host);
  return ['--header', `X-Mount-Session: ${randomBytes(16).toString('hex')}`, '--header', `X-Mount-Label: ${label}`];
}

const SAFE_SAVE_HEADERS = ['x-mount-session', 'x-mount-label'];

/**
 * Refuse a caller's header that `safeSaveHeaderArgs` sets itself: an auth header of that name, or
 * one in the extra rclone args (`--header`, `--header-upload`, `--header-download`, as
 * `--flag value` or `--flag=value`, and `--webdav-headers`). A second session id would decide
 * what the kit believes this mount received.
 */
export function refuseSafeSaveHeaders(auth: ProxyAuth | undefined, extraRcloneArgs: readonly string[] = []): void {
  const names: string[] = [];
  if (auth && (auth.type === 'token' || auth.type === 'jwt') && auth.header) names.push(auth.header);
  for (let i = 0; i < extraRcloneArgs.length; i++) {
    const m = /^--(header|header-upload|header-download|webdav-headers)(?:=(.*))?$/s.exec(extraRcloneArgs[i]!);
    if (!m) continue;
    const value = m[2] ?? extraRcloneArgs[++i] ?? '';
    // --webdav-headers is a CSV row "Name,value,Name,value"; the others are "Name: value".
    if (m[1] === 'webdav-headers') names.push(...csvFields(value).filter((_, k) => k % 2 === 0));
    else names.push(value.split(':')[0] ?? '');
  }
  const taken = names.find((n) => SAFE_SAVE_HEADERS.includes(n.trim().toLowerCase()));
  if (taken !== undefined) {
    throw new Error(`${taken.trim()} is set by hoody mount itself (safe save); remove it from the rclone args or the auth header name`);
  }
}

/** The fields of one CSV row, as rclone reads a comma-separated list: a quoted field may hold commas, and "" in it is a quote. */
function csvFields(row: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i]!;
    if (quoted) {
      if (c === '"' && row[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/** The host name's first part, as the kit accepts a label: [A-Za-z0-9-], at most 32. */
export function mountLabel(host: string): string {
  const label = (host.split('.')[0] ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 32);
  return label === '' ? 'mount' : label;
}

/** The rclone cache and write-back flags `mount()` passes before the caller's extra args. */
function syncArgs(noVfsCache: boolean): string[] {
  return [
    '--dir-cache-time',
    MOUNT_DIR_CACHE_TIME,
    ...(noVfsCache ? [] : ['--vfs-cache-mode', 'writes', '--vfs-write-back', MOUNT_WRITE_BACK]),
  ];
}

export interface AuthDelivery {
  configBody: string;
  authMethod: MountStateFile['auth']['method'];
  /** Always empty: every credential is in `configBody`, never on rclone's command line. */
  headerArgs: string[];
}

export interface BuildAuthDeliveryOpts {
  auth: ProxyAuth;
  url: string;
  rclonePath: string;
  /** Whether this rclone reads `headers` from its config ({@link RCLONE_HEADERS_MIN_VERSION}); false refuses a header credential. */
  supportsHeadersConfig: boolean;
}

/**
 * Build the rclone config text that carries `opts.auth` for the WebDAV
 * remote at `opts.url`: a password is obscured with `rclone obscure`, a
 * token for `Authorization` becomes `bearer_token`, and a token under
 * another header or a computer claim becomes a `headers` line. Nothing is
 * written to disk and `headerArgs` is always empty.
 *
 * Throws when the URL or a credential field holds a line break, when the
 * token is delivered as a query parameter (a mount cannot send one), and
 * when a header credential is needed but `supportsHeadersConfig` is false.
 */
export async function buildAuthDelivery(opts: BuildAuthDeliveryOpts): Promise<AuthDelivery> {
  const { auth, url, rclonePath, supportsHeadersConfig } = opts;
  if (/[\r\n]/.test(url)) throw new Error(`the kit URL ${JSON.stringify(url)} contains a line break; rclone's config cannot hold it`);
  refuseQueryToken(auth);
  refuseLineBreaks(auth);
  const base = `[hoody]\ntype = webdav\nurl = ${url}\nvendor = other\n`;
  switch (auth.type) {
    case 'ip':
      return { configBody: base, authMethod: 'ip', headerArgs: [] };
    case 'password': {
      const obscured = await rcloneObscure(rclonePath, auth.password);
      return {
        configBody: `${base}user = ${auth.username}\npass = ${obscured}\n`,
        authMethod: 'password',
        headerArgs: [],
      };
    }
    case 'jwt':
    case 'token': {
      const tokenValue = auth.type === 'jwt' ? auth.token : auth.value;
      const headerName = auth.header;
      if (!headerName || /^authorization$/i.test(headerName)) {
        return { configBody: `${base}bearer_token = ${tokenValue}\n`, authMethod: 'token', headerArgs: [] };
      }
      if (!supportsHeadersConfig) throw new Error(headersTooOldMessage(`a token under the ${headerName} header`, undefined, rclonePath));
      // As every other kit request sends it: a JWT is `Bearer <jwt>`, a token its raw value.
      const csv = csvEncodeHeader(headerName, credentialHeaderValue(auth, headerName));
      return { configBody: `${base}headers = ${csv}\n`, authMethod: 'header', headerArgs: [] };
    }
    case 'computerClaim': {
      if (!supportsHeadersConfig) throw new Error(headersTooOldMessage('a computer claim', undefined, rclonePath));
      const csv = csvEncodeHeaders([
        ['X-Hoody-Computer-Claim', auth.claim],
        ['X-Hoody-Token', auth.token],
      ]);
      return { configBody: `${base}headers = ${csv}\n`, authMethod: 'computerClaim', headerArgs: [] };
    }
    default: {
      const _exhaustive: never = auth;
      throw new Error(`unsupported ProxyAuth: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * A line break in a credential would end its line of the rclone config and start another, and
 * `rclone obscure -` reads the password up to the first one.
 */
function refuseLineBreaks(auth: ProxyAuth): void {
  const fields: Array<[string, string | undefined]> =
    auth.type === 'password' ? [['username', auth.username], ['password', auth.password]]
      : auth.type === 'jwt' ? [['token', auth.token], ['header name', auth.header]]
        : auth.type === 'token' ? [['token', auth.value], ['header name', auth.header]]
          : auth.type === 'computerClaim' ? [['claim', auth.claim], ['token', auth.token]]
            : [];
  for (const [what, value] of fields) {
    if (value !== undefined && /[\r\n]/.test(value)) throw new Error(`the ${what} contains a line break, which rclone cannot take`);
  }
}

/**
 * A token whose permission rule reads it from a query parameter (`param`) cannot be used by a
 * mount: rclone sends its WebDAV requests to paths under the configured URL and has no way to
 * add a query parameter to every one of them. It is refused rather than sent as a header the
 * rule does not read.
 */
const QUERY_TOKEN_REFUSED =
  'a token delivered as a query parameter (param) cannot be used by mount: rclone cannot add a query parameter to every WebDAV request. ' +
  'Use a permission rule that reads the token from a header, and pass the token with that header (or with none, for Authorization)';

function refuseQueryToken(auth: ProxyAuth): void {
  if (auth.type === 'token' && auth.param !== undefined) throw new Error(QUERY_TOKEN_REFUSED);
}

/** Refuse, without quoting it, a credential that cannot go into rclone's config or an HTTP header. */
function assertAuthSendable(auth: ProxyAuth): void {
  refuseQueryToken(auth);
  refuseLineBreaks(auth);
  const headers: Record<string, string> = {};
  applyAuthToHeaders(headers, auth);
  const unsendable = unsendableHeadersDetail(headers);
  if (unsendable !== null) throw new Error(unsendable);
}

/** Null when fetch takes these headers; else why not, never quoting a value (Headers' own message does). */
function unsendableHeadersDetail(headers: Record<string, string>): string | null {
  try {
    new Headers(headers);
    return null;
  } catch {
    return 'the credential cannot be sent as an HTTP header: its header name or value holds a character HTTP does not allow (a line break, a NUL, or a character above U+00FF)';
  }
}

/** `text` with every form of `auth`'s secrets a message could quote replaced by [redacted]. */
function scrubAuth(text: string, auth: ProxyAuth | undefined): string {
  if (!auth) return text;
  const secrets = auth.type === 'password' ? [auth.password, base64(`${auth.username}:${auth.password}`)]
    : auth.type === 'jwt' ? [auth.token]
      : auth.type === 'token' ? [auth.value]
        : auth.type === 'computerClaim' ? [auth.claim, auth.token]
          : [];
  // encodeURIComponent throws on a lone surrogate; such a secret has no URI-encoded form to find.
  const uriEncoded = (v: string): string[] => {
    try {
      return [encodeURIComponent(v)];
    } catch {
      return [];
    }
  };
  // fetch strips a header value's leading and trailing whitespace, so a server echoes it trimmed.
  const needles = [...new Set(secrets.flatMap((v) => [v, v.trim()]).flatMap((v) => [v, JSON.stringify(v).slice(1, -1), ...uriEncoded(v)]))]
    .filter((n) => n !== '')
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const n of needles) out = out.split(n).join('[redacted]');
  return out;
}

function csvEncodeHeader(name: string, value: string): string {
  return `${csvField(name)},${csvField(value)}`;
}

function csvEncodeHeaders(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs.map(([k, v]) => csvEncodeHeader(k, v)).join(',');
}

function csvField(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function applyAuthToHeaders(headers: Record<string, string>, auth?: ProxyAuth): void {
  if (!auth || auth.type === 'ip') return;
  if (auth.type === 'password') {
    const b64 = base64(`${auth.username}:${auth.password}`);
    headers['authorization'] = `Basic ${b64}`;
    return;
  }
  if (auth.type === 'jwt' || auth.type === 'token') {
    // As buildAuthDelivery hands it to rclone: `Bearer <value>` on Authorization (bearer_token);
    // under any other header name a JWT as `Bearer <jwt>` and a token as its raw value.
    const name = auth.header?.toLowerCase() ?? 'authorization';
    headers[name] = credentialHeaderValue(auth, name);
    return;
  }
  if (auth.type === 'computerClaim') {
    headers['x-hoody-computer-claim'] = auth.claim;
    headers['x-hoody-token'] = auth.token;
  }
}

function base64(s: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(s).toString('base64');
  return btoa(s);
}

/**
 * Refuse, before anything is probed or written, an rclone that cannot take `auth` off its command
 * line: a password needs `rclone obscure -` ({@link RCLONE_OBSCURE_STDIN_MIN_VERSION}), a token
 * under another header or a computer claim needs config headers ({@link RCLONE_HEADERS_MIN_VERSION}).
 * A version that could not be read counts as too old. No credential, no limit.
 */
export function refuseRcloneTooOldForAuth(auth: ProxyAuth, version: RcloneVersion | null, rclonePath = 'rclone'): void {
  if (auth.type === 'password') {
    if (!isVersionAtLeast(version, RCLONE_OBSCURE_STDIN_MIN_VERSION)) {
      throw new Error(tooOldMessage('a password', version, RCLONE_OBSCURE_STDIN_MIN_VERSION, rclonePath));
    }
    return;
  }
  if (auth.type === 'computerClaim') {
    if (!isVersionAtLeast(version, RCLONE_HEADERS_MIN_VERSION)) throw new Error(headersTooOldMessage('a computer claim', version, rclonePath));
    return;
  }
  if ((auth.type === 'token' || auth.type === 'jwt') && auth.header && !/^authorization$/i.test(auth.header)) {
    if (!isVersionAtLeast(version, RCLONE_HEADERS_MIN_VERSION)) throw new Error(headersTooOldMessage(`a token under the ${auth.header} header`, version, rclonePath));
  }
}

/** `version` undefined: the caller knows only that this rclone is too old (buildAuthDelivery). */
function headersTooOldMessage(what: string, version: RcloneVersion | null | undefined, rclonePath: string): string {
  return tooOldMessage(what, version, RCLONE_HEADERS_MIN_VERSION, rclonePath);
}

function tooOldMessage(what: string, version: RcloneVersion | null | undefined, min: readonly number[], rclonePath: string): string {
  const have = version
    ? `rclone v${formatVersion(version)}`
    : version === null
      ? `the rclone at "${rclonePath}" (its version could not be read)`
      : `the rclone at "${rclonePath}"`;
  return `${have} cannot be given ${what} without putting it on its command line, where other users of this machine can read it; ` +
    `rclone v${formatVersion(min)} or newer is required. ${RCLONE_INSTALL_HINT}`;
}

/**
 * `rclone obscure -` with the password on stdin: never in argv, where every local user can read
 * it. rclone reads one line (a password holding a line break is refused before). A failure names the
 * exit code or signal and never rclone's output, which could repeat its input.
 */
async function rcloneObscure(rclonePath: string, plaintext: string): Promise<string> {
  return new Promise<string>((res, rej) => {
    const child = execFileCb(rclonePath, ['obscure', '-'], { timeout: 10000 }, (err, stdout) => {
      if (!err) {
        const obscured = String(stdout).trim();
        if (obscured === '') rej(new Error('rclone obscure printed nothing'));
        else res(obscured);
        return;
      }
      const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals | null; code?: unknown };
      const how = e.killed && e.signal
        ? `was stopped (${e.signal}) after 10 s`
        : typeof e.code === 'number'
          ? `exited with code ${e.code}`
          : typeof e.code === 'string'
            ? `could not run (${e.code})`
            : e.signal
              ? `was stopped (${e.signal})`
              : 'failed';
      rej(new Error(`rclone obscure ${how}, so the password could not be written to the mount's rclone config (rclone's output is not shown: it could hold the password)`));
    });
    // The child may exit before reading stdin (a wrong rclonePath): its EPIPE is reported above.
    child.stdin?.on('error', () => undefined);
    child.stdin?.end(plaintext);
  });
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Poll the OS process table for the rclone daemon process mounting `localPath` (other than
 * `exclude`, the `--daemon` parent, which has the same command line until it exits): its pid
 * once exactly one is running, null when none is by the deadline. The command lines are read
 * as argv ({@link findMountProcesses}), so a path with spaces is found.
 */
async function pollDaemonPid(localPath: string, deadlineMs: number, exclude: number | undefined, launch: MountLaunch): Promise<number | null> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    const candidates = await findMountProcesses(localPath, exclude, launch);
    if (candidates.length === 1) return candidates[0]!;
    await sleep(500);
  }
  return null;
}

/** The unmount commands to try in order; the next one runs only when one is not installed. */
function unmountCommands(localPath: string): Array<[string, string[]]> {
  if (process.platform === 'darwin') return [['diskutil', ['unmount', 'force', localPath]], ['umount', [localPath]]];
  return [['fusermount', ['-u', localPath]], ['fusermount3', ['-u', localPath]], ['umount', [localPath]]];
}

/**
 * Unmount the filesystem at `localPath`, then check the OS mount table. Throws while the path
 * is still mounted (busy: an open file, a shell inside it), and in that case leaves rclone
 * running. On Windows WinFsp unmounts when rclone exits, so rclone is stopped instead
 * (`stopRclone`, null when there is no rclone of this mount to stop).
 */
async function detachMountpoint(localPath: string, stopRclone: (() => void | Promise<void>) | null): Promise<void> {
  if (process.platform === 'win32') {
    await stopRclone?.();
    return;
  }
  let failure: string | null = 'no unmount command (fusermount, fusermount3, umount) is installed';
  for (const [cmd, args] of unmountCommands(localPath)) {
    try {
      await execFile(cmd, args, { timeout: 5000 });
      failure = null;
      break;
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { stderr?: string };
      if (e.code === 'ENOENT') continue;
      failure = (typeof e.stderr === 'string' && e.stderr.trim()) || e.message;
      break;
    }
  }
  const mounted = await mountTableHas(localPath);
  // The mount table decides; when it cannot be read, a successful unmount command does.
  if (mounted === false || (mounted === null && failure === null)) return;
  throw new Error(
    `${localPath} is still mounted${failure ? ` (${failure})` : ''}: ` +
      'close what is using it (a shell or editor inside it, a running program) and unmount again',
  );
}

/**
 * Remove a failed mount's own record before its error is thrown. A failure to remove it (the
 * state lock held past its wait) never replaces that error.
 */
async function forgetFailedMount(record: MountStateFile, home: string | undefined): Promise<void> {
  await deleteOwnState(record, home).catch(() => undefined);
}

/** Why a mount that lost its record while starting was stopped. */
const LOST_CLAIM = 'its record was removed while the mount was starting (by an unmount or another hoody process)';

type ForegroundStop = (opts?: UnmountOptions) => Promise<void>;

/**
 * Stop a foreground mount: wait for pending uploads, unmount, stop rclone, remove the record. One
 * run at a time; after a failure (uploads still pending, the mount is busy) a later call tries again.
 *
 * It undoes only what this mount did: the mount point is unmounted when this rclone was seen
 * mounted or is still running. An rclone that never started, or exited before its mount was
 * seen, leaves the path as it is; when the path is mounted then, the record is kept and the
 * stop says so. The record goes only while it is still this mount's ({@link deleteOwnState}).
 */
function makeForegroundStop(
  child: ChildProcess,
  record: MountStateFile,
  home: string | undefined,
  localPath: string,
  recordWritten: Promise<void>,
  opts: { cache: MountCache; kitUrl: string; drainTimeoutMs: number | undefined; seenMounted: () => boolean; spawnFailed: () => boolean },
): ForegroundStop {
  let running: Promise<void> | null = null;
  const rcloneRunning = (): boolean =>
    !opts.spawnFailed() && child.pid !== undefined && child.exitCode === null && child.signalCode === null;
  const stopRclone = (): void => {
    if (rcloneRunning()) {
      try { child.kill('SIGTERM'); } catch { /* ignore */ }
    }
  };
  const run = async (o: UnmountOptions): Promise<void> => {
    await recordWritten;
    const exited = new Promise<void>((res) => {
      if (!rcloneRunning()) return res();
      child.once('exit', () => res());
    });
    if (!opts.seenMounted() && !rcloneRunning()) {
      if ((await mountTableHas(localPath)) === true) {
        throw new Error(
          `${localPath} is mounted, but rclone ended before this mount saw it mounted, so it was left as it is; ` +
            `if it is this mount's, unmount it with hoody unmount ${localPath}`,
        );
      }
      await deleteOwnState(record, home);
      return;
    }
    if (!o.force) {
      await drainUploads(opts.cache, localPath, opts.kitUrl, rcloneRunning, {
        drainTimeoutMs: o.drainTimeoutMs ?? opts.drainTimeoutMs,
        onPending: o.onPending,
      });
    }
    await detachMountpoint(localPath, stopRclone);
    stopRclone();
    await Promise.race([exited, sleep(RCLONE_EXIT_WAIT_MS)]);
    await deleteOwnState(record, home);
    await assertNothingLeftUnsent(opts.cache, localPath, opts.kitUrl);
  };
  return (o = {}) => {
    if (!running) {
      running = run(o);
      running.catch(() => { running = null; });
    }
    return running;
  };
}

/**
 * Per-mount signal handler. Each foreground mount installs its own handler so concurrent
 * programmatic mounts all clean up on SIGINT, SIGTERM, SIGHUP (and Ctrl-Break on Windows).
 *
 * The library never decides the process's exit while someone else handles the signal: when
 * the process has a listener of its own for it (the CLI, an SDK app), each mount is stopped
 * and that is all; a stop that fails rejects the mount's `wait()` with its error, and the mount
 * is left as it is. When the mount handlers are the only listeners, the signal would have ended
 * the process had no mount been running: once every mount the signal stopped has settled, the
 * handlers are removed and the signal is raised again, so the process ends as it would have. A
 * second signal does that at once.
 */
/** Foreground mounts whose stop a signal started and that have not settled; the last one re-raises. */
const signalStops = { pending: 0 };
/** Every installed mount signal handler, so "someone else listens" can leave them out. */
const mountSignalHandlers = new Set<(...args: unknown[]) => void>();

function mountSignals(): NodeJS.Signals[] {
  return process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK' as NodeJS.Signals] : ['SIGINT', 'SIGTERM', 'SIGHUP'];
}

/** Whether a listener other than a mount's own handles `signal`. */
function othersHandle(signal: NodeJS.Signals): boolean {
  return process.listeners(signal).some((l) => !mountSignalHandlers.has(l as (...args: unknown[]) => void));
}

/** Remove every mount handler and raise `signal` again, for the process to end by it. */
function reraise(signal: NodeJS.Signals): void {
  for (const h of [...mountSignalHandlers]) uninstallSignalHandlers(h);
  try {
    process.kill(process.pid, signal);
  } catch {
    // A signal this platform cannot raise (Ctrl-Break on Windows): end as the shell reports it.
    process.exit(128 + (osConstants.signals[signal] ?? 2));
  }
}

function installSignalHandlers(
  stop: ForegroundStop,
  localPath: string,
  onStopFailed: (err: unknown) => void,
): (...args: unknown[]) => void {
  let signalled = false;
  const handler = (...args: unknown[]): void => {
    const signal = (typeof args[0] === 'string' ? args[0] : 'SIGINT') as NodeJS.Signals;
    if (signalled) {
      if (othersHandle(signal)) return;
      process.stderr.write(`hoody mount: exiting before ${localPath} was unmounted; it may still be mounted (hoody unmount ${localPath})\n`);
      reraise(signal);
      return;
    }
    signalled = true;
    // Every mount's handler runs for the same signal before any stop settles, so the signal is
    // raised again once all of them have finished, not when the quickest one has.
    signalStops.pending++;
    stop({
      onPending: (files) => {
        process.stderr.write(`hoody mount: waiting for ${files.length} file(s) to finish uploading before unmounting ${localPath} (press Ctrl-C again to exit now; they stay queued)\n`);
      },
    })
      .catch((err: unknown) => {
        if (othersHandle(signal)) {
          onStopFailed(err);
          return;
        }
        // Unmounted, with files left unsent: the message says how to send them; nothing is left mounted.
        const unmounted = err instanceof PendingUploadsError && !err.mounted;
        process.stderr.write(`hoody mount: ${(err as Error).message}${unmounted ? '' : `. It is left mounted; unmount it later with hoody unmount ${localPath}`}\n`);
      })
      .finally(() => {
        if (--signalStops.pending > 0) return;
        if (!othersHandle(signal)) reraise(signal);
      });
  };
  for (const s of mountSignals()) process.on(s, handler);
  mountSignalHandlers.add(handler);
  return handler;
}

function uninstallSignalHandlers(handler: (...args: unknown[]) => void): void {
  for (const s of mountSignals()) process.removeListener(s, handler);
  mountSignalHandlers.delete(handler);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}

function normalizeSubpath(subpath: string | undefined): string {
  if (!subpath || subpath === '/') return '';
  let s = subpath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (s.includes('..')) throw new Error(`subpath ${JSON.stringify(subpath)} contains '..' (path traversal not allowed)`);
  return s.split('/').map(encodeURIComponent).join('/');
}

function extractComputerIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^[a-z0-9]+-([a-z0-9]+)-/i);
    if (m) return m[1]!;
  } catch {
    // ignore
  }
  return '';
}

/** What {@link parseCliTarget} returns: exactly one of `computerId` and `kitUrl` is set; `subpath` is `''` when none was given. */
export interface ParsedCliTarget {
  computerId: string | null;
  kitUrl: string | null;
  subpath: string;
}

/** A computer id or name as the API allows a name: 3 to 100 letters, digits, hyphens and underscores. */
const COMPUTER_REF = /^[A-Za-z0-9_-]{3,100}$/;

/**
 * Parse a CLI target like "abc123", "my_box:/path" or "https://...".
 * Disambiguation:
 *   - starts with http:// or https://          → `kitUrl`, a URL of the files
 *     program (a `#` in it throws)
 *   - <ref> or <ref>:/<subpath>, where <ref> is a computer id or name by the
 *     API's name rule (3 to 100 letters, digits, `-` and `_`) → `computerId`,
 *     with the subpath without its leading slash (the caller resolves a name
 *     to its id)
 *   - anything else (hostname:port, a local path, a malformed URL) → throws
 *     an Error
 */
export function parseCliTarget(input: string): ParsedCliTarget {
  if (/^https?:\/\//.test(input)) {
    const hashIdx = input.indexOf('#');
    if (hashIdx >= 0) throw new Error(`URL must not contain '#': ${input}`);
    return { computerId: null, kitUrl: stripTrailingSlash(input), subpath: '' };
  }
  // The optional `:/subpath` first, then the part before it: a computer id or any name the API allows (`dev`,
  // `build_box`, `my-box`), which the CLI resolves to its id.
  const colon = input.indexOf(':');
  const ref = colon === -1 ? input : input.slice(0, colon);
  const rest = colon === -1 ? undefined : input.slice(colon + 1);
  if (COMPUTER_REF.test(ref) && (rest === undefined || rest.startsWith('/'))) {
    return { computerId: ref, kitUrl: null, subpath: rest === undefined ? '' : rest.slice(1) };
  }
  throw new Error(
    `cannot parse mount target ${JSON.stringify(input)}: ` +
      'expected <computerId>, <computerId>:/path, or https://...',
  );
}

export { homedir as _homedir };
